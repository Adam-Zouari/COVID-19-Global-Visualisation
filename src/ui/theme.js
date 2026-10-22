// Deliberately loaded before stylesheets: resolve the saved appearance before
// the browser can paint. No data or visualization initialization belongs here.
(() => {
    'use strict';
    const storageKey = 'atlas-appearance';
    const preferences = ['light', 'dark', 'system'];
    const root = document.documentElement;
    const system = window.matchMedia?.('(prefers-color-scheme: dark)');
    const validPreference = value => preferences.includes(value) ? value : 'dark';
    let preference = 'dark';
    try { preference = validPreference(localStorage.getItem(storageKey)); } catch { /* Storage may be unavailable. */ }
    let theme;

    function apply(notify = true) {
        const previousTheme = theme;
        theme = preference === 'system' ? (system?.matches ? 'dark' : 'light') : preference;
        root.dataset.theme = theme;
        root.dataset.appearance = preference;
        root.style.colorScheme = theme;
        syncControl();
        if (notify && previousTheme !== theme) {
            document.dispatchEvent(new CustomEvent('atlas:themechange', { detail: { preference, theme } }));
        }
    }

    function setPreference(value) {
        preference = validPreference(value);
        try { localStorage.setItem(storageKey, preference); } catch { /* Keep this session usable. */ }
        apply();
    }

    function getColor(name) {
        return getComputedStyle(root).getPropertyValue(name.startsWith('--') ? name : `--${name}`).trim();
    }

    window.AtlasTheme = Object.freeze({
        getPreference: () => preference,
        getResolvedTheme: () => theme,
        setPreference,
        getColor,
        getSeriesColor(index) {
            index = Math.max(0, Math.floor(Number(index) || 0));
            return index < 8 ? getColor(`--series-${index + 1}`) :
                `hsl(${(index * 137.508) % 360} 65% ${theme === 'light' ? 36 : 70}%)`;
        }
    });

    function syncControl() {
        const button = document.getElementById('appearanceButton');
        if (!button) return;
        const label = preference[0].toUpperCase() + preference.slice(1);
        button.setAttribute('aria-label', `Appearance: ${label}`);
        button.title = `Appearance: ${label}`;
        button.querySelectorAll('[data-appearance-icon]').forEach(icon => {
            icon.toggleAttribute('hidden', icon.dataset.appearanceIcon !== preference);
        });
        document.querySelectorAll('#appearanceMenu [data-appearance]').forEach(item => {
            item.setAttribute('aria-checked', String(item.dataset.appearance === preference));
        });
    }

    function initializeControl() {
        const button = document.getElementById('appearanceButton');
        const menu = document.getElementById('appearanceMenu');
        if (!button || !menu) return;
        const items = [...menu.querySelectorAll('[data-appearance]')];
        function close(returnFocus = false) {
            menu.hidden = true;
            button.setAttribute('aria-expanded', 'false');
            if (returnFocus) button.focus({ preventScroll: true });
        }
        function open() {
            menu.hidden = false;
            button.setAttribute('aria-expanded', 'true');
            (items.find(item => item.dataset.appearance === preference) || items[0]).focus();
        }
        button.addEventListener('click', () => menu.hidden ? open() : close());
        button.addEventListener('keydown', event => {
            if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); open(); }
            else if (event.key === 'Escape') close(true);
        });
        items.forEach(item => item.addEventListener('click', () => {
            setPreference(item.dataset.appearance);
            close(true);
        }));
        menu.addEventListener('keydown', event => {
            const index = items.indexOf(document.activeElement);
            let next;
            if (event.key === 'ArrowDown') next = (index + 1) % items.length;
            else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = items.length - 1;
            else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
            else if (event.key === 'Tab') close();
            if (next !== undefined) { event.preventDefault(); items[next].focus(); }
        });
        document.addEventListener('pointerdown', event => {
            if (!button.contains(event.target) && !menu.contains(event.target)) close();
        });
        menu.parentElement.addEventListener('focusout', event => {
            // During pointer focus changes activeElement can temporarily be the
            // body. relatedTarget identifies the actual next focus destination.
            if (!menu.parentElement.contains(event.relatedTarget)) close();
        });
        syncControl();
    }

    apply(false);
    system?.addEventListener('change', () => { if (preference === 'system') apply(); });
    window.addEventListener('storage', event => {
        if (event.key === storageKey || event.key === null) {
            preference = validPreference(event.newValue);
            apply();
        }
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeControl, { once: true });
    else initializeControl();
})();
