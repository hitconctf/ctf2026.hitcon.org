/**
 * country-select.js
 *
 * Replaces each <select data-country-select> with a dropdown in the site
 * theme: flags, a search box, and keyboard control. The <select> stays in
 * the form (hidden) and holds the value, so the form posts the same data.
 *
 * Flags use the django-countries sprite (flags/sprite.css).
 */
function countrySelect(select) {
    const items = [...select.options].map(o => ({
        value: o.value,
        label: o.value ? o.text : 'No country',
        search: (o.text + ' ' + o.value).toLowerCase(),
    }));

    const root = document.createElement('div');
    root.className = 'cselect';
    root.innerHTML = `
<button type="button" class="form-select cselect-toggle" aria-haspopup="listbox" aria-expanded="false"></button>
<div class="cselect-menu" hidden>
  <input type="text" class="form-control cselect-search" placeholder="Search country" aria-label="Search country" autocomplete="off">
  <ul class="cselect-list" role="listbox"></ul>
  <div class="cselect-empty" hidden>No match</div>
</div>`;
    select.after(root);
    select.hidden = true;

    const toggle = root.querySelector('.cselect-toggle');
    const menu   = root.querySelector('.cselect-menu');
    const search = root.querySelector('.cselect-search');
    const list   = root.querySelector('.cselect-list');
    const empty  = root.querySelector('.cselect-empty');

    // The field label now points to the button.
    toggle.id = select.id + '_toggle';
    const label = document.querySelector(`label[for="${select.id}"]`);
    if (label) label.htmlFor = toggle.id;
    if (select.classList.contains('is-invalid')) toggle.classList.add('is-invalid');

    function flag(value) {
        if (!value) return '<i class="cselect-noflag"></i>';
        const c = value.toLowerCase();
        return `<i class="flag-sprite flag-${c[0]} flag-_${c[1]}"></i>`;
    }

    list.innerHTML = items.map((it, i) =>
        `<li role="option" data-index="${i}">${flag(it.value)}<span>${_esc(it.label)}</span></li>`
    ).join('');
    const rows = [...list.children];

    let visible = rows;
    let active = -1;   // index into `visible`

    function render() {
        const it = items[select.selectedIndex] || items[0];
        toggle.innerHTML = it.value
            ? `${flag(it.value)}<span>${_esc(it.label)}</span>`
            : '<span class="cselect-placeholder">Select a country</span>';
        rows.forEach((r, i) => r.setAttribute('aria-selected', String(i === select.selectedIndex)));
    }

    function setActive(i) {
        if (visible[active]) visible[active].classList.remove('active');
        active = Math.max(0, Math.min(i, visible.length - 1));
        if (visible[active]) {
            visible[active].classList.add('active');
            visible[active].scrollIntoView({ block: 'nearest' });
        }
    }

    function filter() {
        const q = search.value.trim().toLowerCase();
        // Names that start with the query come first ("ja": Japan before Azerbaijan).
        const first = [], rest = [];
        rows.forEach((r, i) => {
            const show = !q || items[i].search.includes(q);
            r.hidden = !show;
            if (show) (!q || items[i].label.toLowerCase().startsWith(q) ? first : rest).push(r);
        });
        visible = first.concat(rest);
        list.append(...(q ? visible : rows));
        empty.hidden = visible.length > 0;
        active = -1;
        setActive(0);
    }

    function open() {
        menu.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        search.value = '';
        filter();
        setActive(Math.max(0, visible.indexOf(rows[select.selectedIndex])));
        search.focus();
    }

    function close(focusToggle) {
        menu.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        if (focusToggle) toggle.focus();
    }

    function choose(row) {
        select.selectedIndex = Number(row.dataset.index);
        select.dispatchEvent(new Event('change', { bubbles: true }));
        render();
        close(true);
    }

    toggle.addEventListener('click', () => (menu.hidden ? open() : close(true)));
    toggle.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
    });

    search.addEventListener('input', filter);
    search.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
        else if (e.key === 'Enter') { e.preventDefault(); if (visible[active]) choose(visible[active]); }
        else if (e.key === 'Escape') { e.preventDefault(); close(true); }
        else if (e.key === 'Tab') { close(false); }
    });

    list.addEventListener('mousedown', e => e.preventDefault());   // keep focus in the search box
    list.addEventListener('click', e => {
        const row = e.target.closest('li');
        if (row) choose(row);
    });
    list.addEventListener('mousemove', e => {
        const row = e.target.closest('li');
        if (row && row !== visible[active]) setActive(visible.indexOf(row));
    });

    document.addEventListener('mousedown', e => {
        if (!menu.hidden && !root.contains(e.target)) close(false);
    });

    render();
}

// Loaded right after the form, so the picker is in place at the first paint.
// Chrome then stops waiting for #main-end (<link rel="expect"> in base.html)
// and logs a warning; the page is already parsed up to here, so no partial
// page shows.
document.querySelectorAll('select[data-country-select]').forEach(countrySelect);
