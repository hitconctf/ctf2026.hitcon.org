/**
 * scoreboard.js
 *
 * Alpine.js component for the scoreboard page.
 * Replaces the previous jQuery-based DOM manipulation with declarative
 * x-data / x-for bindings and the Fetch API.
 */

function scoreboardApp() {
    return {
        // ------------------------------------------------------------------
        // State
        // ------------------------------------------------------------------
        teamstat:   [],
        challenges: {},          // keyed by challenge id (string)
        lastUpdate: null,     // Unix timestamp
        mode: localStorage.getItem('scoreboard_mode') || 'simple',
        // KoH tab: one round of the open KoH challenges (koh_round_data).
        // null until loaded, so "No KoH scores in this round" does not flash.
        koh: null,
        kohRound: '',            // '' = the last round with scores, or the current one

        // ------------------------------------------------------------------
        // Computed
        // ------------------------------------------------------------------
        // Challenge columns, only in Full mode: Simple mode makes no cells.
        get visibleChallenges() {
            return this.mode === 'full' ? Object.values(this.challenges) : [];
        },

        // Only when a KoH challenge is open: scoreboard_data lists open
        // challenges only, so the page does not tell that KoH exists before.
        get kohAvailable() {
            return Object.values(this.challenges).some(c => c.type === 'koh');
        },

        // Every round from the current one down to 1, newest first.
        get kohRounds() {
            const rounds = [];
            for (let r = this.koh ? this.koh.current_round : 0; r >= 1; r--) rounds.push(r);
            return rounds;
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
            await this.fetchScoreboard();
            this.$el.removeAttribute('data-loading');
            // Background tabs do not poll. A tab that becomes visible updates at once.
            setInterval(() => { if (!document.hidden) this.fetchScoreboard(); }, interval);
            document.addEventListener('visibilitychange', () => { if (!document.hidden) this.fetchScoreboard(); });
        },

        // ------------------------------------------------------------------
        // Data fetching
        // ------------------------------------------------------------------
        async fetchScoreboard() {
            const store = Alpine.store('site');
            const url = store.apiUrl('/dashboard/scoreboard_data');
            try {
                const data = await fetchJson(url);
                // A Set for each team: one lookup per cell.
                for (const team of data.teamstat || []) team.solved = new Set(team.solved_challenge);
                this.teamstat   = data.teamstat   || [];
                this.challenges = data.challenges || {};
                this.lastUpdate = data.last_update ?? null;
                // A saved KoH tab while no KoH challenge is open.
                if (this.mode === 'koh' && !this.kohAvailable) this.mode = 'simple';
                if (this.mode === 'koh') await this.fetchKoh();
                this.$nextTick(() => initTooltips());
            } catch (e) {
                console.error('Failed to fetch scoreboard:', e);
            }
        },

        async fetchKoh() {
            const store = Alpine.store('site');
            const query = this.kohRound ? '?round=' + encodeURIComponent(this.kohRound) : '';
            try {
                this.koh = await fetchJson(store.apiUrl('/dashboard/koh_round_data' + query));
            } catch (e) {
                console.error('Failed to fetch KoH scores:', e);
            }
        },

        // ------------------------------------------------------------------
        // Mode toggle
        // ------------------------------------------------------------------
        setMode(m) {
            this.mode = m;
            localStorage.setItem('scoreboard_mode', m);
            if (m === 'koh') this.fetchKoh();
            this.$nextTick(() => initTooltips());
        },

        // ------------------------------------------------------------------
        // Row click: navigate to team profile in simple mode
        // ------------------------------------------------------------------
        rowClick(teamId) {
            if (this.mode === 'simple' && !window.getSelection().toString()) {
                window.location = Alpine.store('site').teamUrl(teamId);
            }
        },

        // ------------------------------------------------------------------
        // Display helpers
        // ------------------------------------------------------------------
        lastSubmitLabel(team) {
            if (team.last_submit_time === null) return 'Never';
            if (this.contestEnd) {
                return timeFmt.utc(team.last_submit_time);
            }
            return timeFmt.fromNow(team.last_submit_time);
        },

        lastSubmitTitle(team) {
            return timeFmt.local(team.last_submit_time);
        },

        isSolved(team, chal) {
            return team.solved.has(chal.id);
        },

        isFirstBlood(team, chal) {
            return chal.first_solved_team === team.id;
        },

        solvedLabel(chal) {
            if (chal.type === 'koh') return 'King of the Hill';
            return chal.solved_times + (chal.solved_times === 1 ? ' solve' : ' solves');
        },
    };
}
