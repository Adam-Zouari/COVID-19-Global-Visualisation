// Apply the URL's view before the asynchronous application/data initialization.
(() => {
    const initialView = new URLSearchParams(window.location.search).get('view') === 'compare' ? 'compare' : 'explore';
    const root = document.documentElement;
    function render(view) {
        const comparing = view === 'compare';
        root.dataset.view = comparing ? 'compare' : 'explore';
        for (const [selector, hidden] of [['#exploreView', comparing], ['.page-intro', comparing], ['#comparePanel', !comparing]]) {
            const node = document.querySelector(selector);
            if (node) node.hidden = hidden;
        }
        for (const [id, active] of [['navExplore', !comparing], ['navCompare', comparing]]) {
            const node = document.getElementById(id);
            if (!node) continue;
            node.classList.toggle('active', active);
            if (active) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
        }
    }
    window.AtlasView = {
        initialView, restoring: true, render,
        initialize() { render(initialView); delete root.dataset.viewPending; },
        finish(view) { this.restoring = false; render(view); }
    };
    root.dataset.view = initialView;
    root.dataset.viewPending = '';
})();
