/**
 * components.js
 *
 * Loaded right after the navbar (base.html). Provides:
 *   - the Alpine.js store $store.site, used by the dashboard and scoreboard,
 *   - helpers: initTooltips(), timeFmt, _esc(),
 *   - the navbar countdown.
 *
 * Expects window.__SITE_CONFIG__ to be set by base.html before it runs.
 */

var _cfg = window.__SITE_CONFIG__ || {};

// Server time = this computer's time + clock_offset. Do not count ticks:
// browsers throttle timers in background tabs, and a count drifts. A wrong
// clock on this computer does not matter, because only the offset is used.
var clock_offset = (_cfg.currentTime || 0) - Date.now() / 1000;

function server_now() {
    return Date.now() / 1000 + clock_offset;
}

// ---------------------------------------------------------------------------
// Alpine.js store, initialised before Alpine processes the page
// ---------------------------------------------------------------------------
document.addEventListener('alpine:init', () => {
    Alpine.store('site', {
        teamId:          _cfg.teamId ?? -1,
        refreshInterval: _cfg.refreshInterval ?? 60,
        // True when the page is a pre-generated static export.
        isStatic: window.IS_STATIC === true,

        // The server clock now, not at page load: an open dashboard notices
        // the end of the contest.
        get contestEnded() {
            return server_now() >= (_cfg.contestEndTime ?? 0);
        },

        // URLs from Django ({% url %} in base.html).
        teamUrl(id) {
            return _cfg.teamUrlPrefix + id;
        },
        submitUrl: _cfg.submitUrl,

        /**
         * Return the URL for a given API path.
         * In static mode the path is rewritten to a local .json file so that
         * the page can be served from any static file host.
         */
        apiUrl(path) {
            if (this.isStatic) {
                // Drop any query string, then append .json. Keep the path
                // absolute: the pages are in subdirectories of the archive.
                return path.replace(/\?[^=]*=([^&]*).*$/, '_$1') + '.json';  // archive: ?id=5 -> _5.json
            }
            return path;
        },
    });
});

// ---------------------------------------------------------------------------
// Utility: Bootstrap 5 tooltips
// Call after Alpine renders new elements; existing tooltips are reused.
// ---------------------------------------------------------------------------
function initTooltips(root = document) {
    if (typeof bootstrap === 'undefined') return;
    root.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(
        el => bootstrap.Tooltip.getOrCreateInstance(el)
    );
}

// ---------------------------------------------------------------------------
// Utility: time formatting (replaces moment.js)
// All functions take a Unix timestamp in seconds.
// ---------------------------------------------------------------------------
const timeFmt = (() => {
    const pad = n => String(n).padStart(2, '0');
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'always' });

    return {
        // "2026-10-07 16:03:42 UTC"
        utc(ts) {
            return new Date(ts * 1000).toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
        },
        // "2026-10-08 00:03:42" in the browser's time zone
        local(ts) {
            const d = new Date(ts * 1000);
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
                   `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        },
        // "a few seconds ago", "2 minutes ago", "3 hours ago" (moment.js thresholds)
        fromNow(ts) {
            const sec = ts - server_now();
            const abs = Math.abs(sec);
            if (abs < 45) return sec <= 0 ? 'a few seconds ago' : 'in a few seconds';
            const units = [
                ['minute', 'a minute', 60, 45], ['hour', 'an hour', 3600, 22],
                ['day', 'a day', 86400, 26], ['month', 'a month', 2592000, 11],
                ['year', 'a year', 31536000, Infinity],
            ];
            for (const [unit, one, size, limit] of units) {
                const n = Math.max(Math.round(abs / size), 1);
                if (n >= limit) continue;
                if (n === 1) return sec <= 0 ? `${one} ago` : `in ${one}`;
                return rtf.format(Math.sign(sec) * n, unit);
            }
        },
    };
})();

// ---------------------------------------------------------------------------
// Utility: fetch JSON for polling
// An error keeps the old data on the page. A lost session goes to the login
// page, instead of showing an empty challenge list.
// ---------------------------------------------------------------------------
async function fetchJson(url) {
    const res = await fetch(url);
    if (res.status === 401) {
        window.location = _cfg.loginUrl + '?next=' + encodeURIComponent(window.location.pathname);
    }
    if (!res.ok) throw new Error(url + ' answered ' + res.status);
    return res.json();
}

// ---------------------------------------------------------------------------
// Utility: safe HTML-escape for values inserted via innerHTML
// ---------------------------------------------------------------------------
function _esc(str) {
    const el = document.createElement('span');
    el.appendChild(document.createTextNode(String(str == null ? '' : str)));
    return el.innerHTML;
}

// ---------------------------------------------------------------------------
// Navbar countdown. This script runs right after the navbar, so the timer
// has its text before the first paint.
// ---------------------------------------------------------------------------
var contest_begin_time = _cfg.contestStartTime || 0;
var contest_end_time   = _cfg.contestEndTime   || 0;
var started_at_load = (_cfg.currentTime || 0) >= contest_begin_time;
var reloading = false;

function update_nav_timer() {
    function pad(num) {
        return (num < 10 ? "0" + num : num);
    }

    function to_time_string(offset) {
        offset = Math.max(0, Math.floor(offset));
        var days = Math.floor(offset / 24 / 60 / 60);
        var hoursleft = Math.floor((offset - (days * 86400)) / 3600);
        if (days === 0)
            return hoursleft + ":" + pad(Math.floor((offset % 3600) / 60)) + ":" + pad(Math.floor(offset % 60));
        else
            return days + " days " + hoursleft + ":" + pad(Math.floor((offset % 3600) / 60)) + ":" + pad(Math.floor(offset % 60));
    }

    var now = server_now();

    // Reload once when the contest begins, so the page shows the Dashboard.
    // No random delay: every team must get the page at the same time.
    if (!started_at_load && now >= contest_begin_time) {
        if (!reloading) {
            reloading = true;
            location.reload();
        }
        return;
    }

    var timerEl = document.getElementById('timer');
    if (!timerEl) return;

    if (now < contest_begin_time) {
        timerEl.textContent = "Contest begins in: " + to_time_string(contest_begin_time - now);
    } else if (now >= contest_end_time) {
        timerEl.textContent = "Contest is over";
    } else {
        timerEl.textContent = "Countdown: " + to_time_string(contest_end_time - now);
    }
}

update_nav_timer();
setInterval(update_nav_timer, 1000);
// A background tab runs the timer late. Update as soon as the tab is visible.
document.addEventListener('visibilitychange', update_nav_timer);

// Tooltips on server-rendered pages. Dashboard and scoreboard call it again
// after their dynamic content loads.
document.addEventListener('DOMContentLoaded', () => initTooltips());
