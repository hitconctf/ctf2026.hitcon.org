/**
 * dashboard.js
 *
 * Alpine.js component for the dashboard page.
 * Replaces the previous jQuery-based DOM manipulation with declarative
 * x-data / x-for bindings and the Fetch API.
 */

// Markdown for descriptions, hints and announcements. A bare http(s) URL is a
// link too, but not a file name such as solve.sh. Links open in a new tab.
function markdownWithLinks() {
    const md = window.markdownit({ breaks: true, linkify: true });
    md.linkify.set({ fuzzyLink: false });
    const linkOpen = md.renderer.rules.link_open ||
        ((tokens, i, options, env, self) => self.renderToken(tokens, i, options));
    md.renderer.rules.link_open = (tokens, i, options, env, self) => {
        tokens[i].attrSet('target', '_blank');
        tokens[i].attrSet('rel', 'noopener noreferrer');
        return linkOpen(tokens, i, options, env, self);
    };
    return md;
}

function dashboardApp() {
    // Without markdown-it, show plain text: x-html must never get raw HTML.
    const md = window.markdownit ? markdownWithLinks() : { render: s => _esc(s) };

    return {
        // ------------------------------------------------------------------
        // State
        // ------------------------------------------------------------------
        challenges:    [],
        announcements: [],
        miniScoreboard: [],
        mode: localStorage.getItem('challenge_mode') || 'all',

        // Currently-open challenge (shown in the modal)
        selectedChallenge: null,
        solvedTeams: [],
        promptCopied: false,
        promptRaw: false,     // the description as Markdown source, not rendered
        promptContent: null,  // the plain text of the welcome challenge, loaded on each switch to it

        // Submit form state
        flagInput: '',
        submitStatus: '',
        submitVisible: false,
        submitDisabled: false,

        // ------------------------------------------------------------------
        // Computed
        // ------------------------------------------------------------------
        get filteredChallenges() {
            if (this.mode === 'unsolved') {
                return this.challenges.filter(c => !c.solved);
            }
            return this.challenges;
        },

        get contestEnd() {
            return Alpine.store('site').contestEnded;
        },

        // ------------------------------------------------------------------
        // Lifecycle
        // ------------------------------------------------------------------
        async init() {
            const interval = Alpine.store('site').refreshInterval * 1000;

            // Alpine calls init() itself, so the page must not add x-init.
            await Promise.all([
                this.fetchChallenges(),
                this.fetchAnnouncements(),
                this.fetchMiniScoreboard(),
            ]);
            // Show the page when all parts have data, not part by part.
            this.$el.removeAttribute('data-loading');

            // Background tabs do not poll. A tab that becomes visible
            // updates at once.
            const refresh = () => {
                this.fetchChallenges();
                this.fetchAnnouncements();
                this.fetchMiniScoreboard();
            };
            setInterval(() => { if (!document.hidden) refresh(); }, interval);
            document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

            // Open challenge from URL hash (e.g. /dashboard/#42)
            if (window.location.hash && !document.getElementById('challenge-modal')?.classList.contains('show')) {
                const hash = window.location.hash.substring(1);
                if (!isNaN(hash)) {
                    await this.$nextTick();
                    const c = this.challenges.find(c => c.id == hash);
                    if (c) this.openChallenge(c);
                }
            }
        },

        // ------------------------------------------------------------------
        // Data fetching
        // ------------------------------------------------------------------
        async fetchChallenges() {
            const store = Alpine.store('site');
            const url = store.apiUrl('/dashboard/challenge_data');
            try {
                this.challenges = await fetchJson(url);
            } catch (e) {
                console.error('Failed to fetch challenges:', e);
            }
        },

        async fetchAnnouncements() {
            const store = Alpine.store('site');
            const url = store.apiUrl('/dashboard/announcement_data');
            try {
                const data = await fetchJson(url);
                // Preserve open/closed state of existing entries. Key by id:
                // several announcements (e.g. first bloods) can share a timestamp.
                const prevOpen = {};
                (this.announcements || []).forEach(a => { prevOpen[a.id] = a.open; });
                this.announcements = data.map(a => ({
                    ...a,
                    open: prevOpen[a.id] ?? false,
                }));
            } catch (e) {
                console.error('Failed to fetch announcements:', e);
            }
        },

        async fetchMiniScoreboard() {
            const store = Alpine.store('site');
            const url = store.apiUrl('/dashboard/mini_scoreboard_data');
            try {
                // The server sends the top 20, plus the own team when it is lower.
                this.miniScoreboard = await fetchJson(url);
            } catch (e) {
                console.error('Failed to fetch mini scoreboard:', e);
            }
        },

        async fetchSolvedTeams(challengeId) {
            const store = Alpine.store('site');
            const url = store.apiUrl('/dashboard/solved_team_data?id=' + challengeId);
            try {
                this.solvedTeams = await fetchJson(url);
            } catch (e) {
                console.error('Failed to fetch solved teams:', e);
                this.solvedTeams = [];
            }
        },

        // ------------------------------------------------------------------
        // Challenge mode toggle
        // ------------------------------------------------------------------
        setMode(m) {
            this.mode = m;
            localStorage.setItem('challenge_mode', m);
        },

        // ------------------------------------------------------------------
        // Markdown rendering helper
        // ------------------------------------------------------------------
        renderMarkdown(text) {
            return md.render(text || '');
        },

        // ------------------------------------------------------------------
        // The challenge as a prompt: the /goal line, the name and the
        // description in a ``` block. The description shows as rendered
        // Markdown or, after the toggle, as its source; the copy always has
        // the source. Site links (/static/chall/...) get the full URL.
        // ------------------------------------------------------------------
        // The working directory line of the start screen, with the score.
        get promptPath() {
            const c = this.selectedChallenge;
            if (!c) return '';
            return `~/hitconctf-2026/${c.name} ` + (this.isKoh ? '[KoH]' : `[${c.score}pts]`);
        },

        get promptHead() {
            return this.selectedChallenge ? `\n- name: ${this.selectedChallenge.name}\n- description:\n\`\`\`` : '';
        },

        // The plain text. The welcome challenge (category `welcome`): the
        // Markdown source from the server, with the welcome flag in a comment
        // at the end; the description until it is loaded. The copy does not
        // have the comment.
        get promptPlainText() {
            return this.promptContent === null ? this.promptDescription : this._withSiteUrls(this.promptContent);
        },

        togglePromptRaw() {
            this.promptRaw = !this.promptRaw;
            this.loadPromptContent();
        },

        async loadPromptContent() {
            if (!this.promptRaw || this.selectedChallenge?.category !== 'welcome') return;
            const id = this.selectedChallenge.id;
            try {
                const data = await fetchJson(Alpine.store('site').apiUrl(`/dashboard/challenges/${id}/content`));
                if (this.selectedChallenge?.id === id) this.promptContent = data.content;
            } catch (e) {
                console.error('Failed to fetch the challenge content:', e);
            }
        },

        _withSiteUrls(text) {
            return (text || '').replace(/\]\(\//g, `](${location.origin}/`);
        },

        get promptDescription() {
            return this._withSiteUrls(this.selectedChallenge?.description);
        },

        async copyPrompt() {
            const goal = document.querySelector('#challenge-prompt .prompt-goal').textContent;
            try {
                await navigator.clipboard.writeText(`${goal}\n${this.promptHead}\n${this.promptDescription}\n\`\`\``);
            } catch {
                return;
            }
            this.promptCopied = true;
            clearTimeout(this._promptCopiedTimer);
            this._promptCopiedTimer = setTimeout(() => { this.promptCopied = false; }, 1500);
        },

        // ------------------------------------------------------------------
        // Solved-times display helper
        // ------------------------------------------------------------------
        solvedText(challenge) {
            if (!challenge.solved_times) return 'Nobody solved yet.';
            return challenge.solved_times + (challenge.solved_times === 1 ? ' Team' : ' Teams') + ' solved.';
        },

        // ------------------------------------------------------------------
        // Modal: open challenge
        // ------------------------------------------------------------------
        openChallenge(challenge) {
            this.selectedChallenge = { ...challenge };
            this.flagInput = '';
            this.solvedTeams = [];
            this.promptCopied = false;
            this.promptContent = null;
            this.submitStatus = '';
            this.submitVisible = false;

            // replaceState: opening a challenge adds no browser history entry.
            history.replaceState(null, '', '#' + challenge.id);

            // Show the Bootstrap modal
            bootstrap.Modal.getOrCreateInstance(document.getElementById('challenge-modal')).show();

            // Initialise tooltips after modal content renders
            this.$nextTick(() => initTooltips(document.getElementById('challenge-modal')));

            // KoH: solved_times stays 0, so always fetch the top scores.
            if (challenge.solved_times || challenge.type === 'koh') {
                this.fetchSolvedTeams(challenge.id);
            }
            // Plain text is still on from an other challenge.
            this.loadPromptContent();
        },

        // ------------------------------------------------------------------
        // Modal: on hidden
        // ------------------------------------------------------------------
        onModalHidden() {
            history.replaceState(null, '', window.location.pathname + window.location.search);
        },

        // ------------------------------------------------------------------
        // Flag submission
        // ------------------------------------------------------------------
        async submitFlag() {
            if (!this.selectedChallenge) return;

            const chall = this.selectedChallenge;

            this.submitDisabled = true;
            this.submitStatus  = '';
            this.submitVisible = false;

            setTimeout(() => { this.submitDisabled = false; }, 1000);

            const flag = this.flagInput.trim();
            const challId = this.selectedChallenge.id;

            try {
                const csrfEl = document.querySelector('[name=csrfmiddlewaretoken]');
                const csrf   = csrfEl ? csrfEl.value : '';

                const res = await fetch(Alpine.store('site').submitUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-CSRFToken': csrf,
                    },
                    body: new URLSearchParams({ flag, id: challId }),
                });
                const data = await res.json();

                if (!res.ok) {
                    // 429: too fast. 403: the contest is not running.
                    this.submitStatus = data.detail || 'Submission error. Please try again later.';
                } else if (data.result === 'duplicated') {
                    this.submitStatus = 'You already submitted this flag!';
                    this.flagInput = '';
                } else if (data.result === 'wrong') {
                    this.submitStatus = 'Wrong flag. Noooooo~';
                } else {
                    const c = this.challenges.find(c => c.id === data.id);
                    if (c) c.solved = true;
                    if (this.selectedChallenge) this.selectedChallenge.solved = true;
                    this.submitStatus = 'Correct flag. Grats!';
                    this.fetchAnnouncements();
                }
                this.submitVisible = true;
            } catch (e) {
                this.submitStatus = 'Submission error. Please try again later.';
                this.submitVisible = true;
            }
            // The disabled button lost the focus. Put it back in the modal, so
            // typing and Escape keep working.
            // A solved challenge has no input, so focus the modal itself.
            const target = this.selectedChallenge?.solved ? 'challenge-modal' : 'flag_input';
            this.$nextTick(() => document.getElementById(target)?.focus());
        },

        // King of the Hill: no flag form; the top teams have a score, not a time.
        get isKoh() {
            return this.selectedChallenge?.type === 'koh';
        },

        // Hint display helper
        hintTimeLabel(hint) {
            if (this.contestEnd) {
                return timeFmt.utc(hint.public_time);
            }
            return timeFmt.fromNow(hint.public_time);
        },

        hintTimeFull(hint) {
            return timeFmt.local(hint.public_time);
        },

        // Solved-team timestamp helpers
        logTimeLabel(log) {
            if (this.contestEnd) {
                return timeFmt.utc(log.timestamp);
            }
            return timeFmt.fromNow(log.timestamp);
        },

        logTimeFull(log) {
            return timeFmt.local(log.timestamp);
        },
    };
}

