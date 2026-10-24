// Reuse the page's controls in fullscreen to preserve their state and listeners.
(() => {
    const workspace = document.getElementById('exploreWorkspace');
    const settings = document.getElementById('explorerSettings');
    const content = document.getElementById('filterContent');
    const stage = document.getElementById('globeStage');
    const expandButton = document.getElementById('expandGlobeBtn');
    const settingsButton = document.getElementById('filtersToggle');
    if (!workspace || !settings || !content || !stage || !expandButton || !settingsButton) return;
    const resize = () => requestAnimationFrame(() => window.globeInstance?.resize());

    settingsButton.addEventListener('click', () => {
        content.hidden = !content.hidden;
        workspace.classList.toggle('settings-collapsed', content.hidden);
        settingsButton.setAttribute('aria-expanded', String(!content.hidden));
        const action = `${content.hidden ? 'Expand' : 'Collapse'} explorer settings`;
        settingsButton.setAttribute('aria-label', action);
        settingsButton.title = action;
        settingsButton.firstElementChild.textContent = content.hidden ? '›' : '‹';
        resize();
        updateAnalysisSpacing();
    });

    let shell = null, nativeFullscreen = false, savedScroll = null;
    let fullscreenRequest = null, closingExpansion = null, pendingCountryAction = null;
    const placements = [];
    const background = [];
    function move(node, parent) {
        if (!node) return;
        const marker = document.createComment('Expanded globe placement');
        node.before(marker);
        placements.push({ node, marker });
        parent.appendChild(node);
    }
    function finishExpansion() {
        if (!shell) return;
        nativeFullscreen = false;
        for (const { node, marker } of placements.reverse()) {
            if (node.classList?.contains('tooltip')) node.style.opacity = '0';
            marker.replaceWith(node);
        }
        placements.length = 0;
        shell.remove();
        shell = null;
        for (const node of background) node.inert = false;
        background.length = 0;
        stage.classList.remove('globe-expanded');
        document.body.classList.remove('globe-expanded-open');
        expandButton.setAttribute('aria-expanded', 'false');
        expandButton.setAttribute('aria-label', 'Expand globe to full screen');
        expandButton.title = 'Expand globe to full screen';
        if (savedScroll) window.scrollTo({ ...savedScroll, behavior: 'instant' });
        expandButton.focus({ preventScroll: true });
        resize();
        updateAnalysisSpacing();
    }
    function closeExpansion() {
        if (closingExpansion) return closingExpansion;
        const target = shell;
        if (!target) return Promise.resolve();
        closingExpansion = (async () => {
            // A quick action can arrive before native fullscreen has finished entering.
            try { await fullscreenRequest; } catch { /* The CSS fallback remains usable. */ }
            if (document.fullscreenElement === target) {
                try { await document.exitFullscreen(); } catch { /* The CSS view can still close. */ }
            }
            finishExpansion();
        })().finally(() => { closingExpansion = null; });
        return closingExpansion;
    }
    async function toggleExpansion() {
        if (shell || closingExpansion) { await closeExpansion(); return; }
        savedScroll = { left: scrollX, top: scrollY };
        shell = document.createElement('section');
        shell.id = 'expandedGlobe';
        shell.className = 'expanded-globe';
        shell.setAttribute('role', 'dialog');
        shell.setAttribute('aria-modal', 'true');
        shell.setAttribute('aria-label', 'Full screen interactive globe');
        const topbar = document.createElement('div');
        topbar.className = 'expanded-categories';
        shell.appendChild(topbar);
        document.body.appendChild(shell);
        move(document.querySelector('.category-bar .dataset-buttons'), topbar);
        const close = document.createElement('button');
        close.id = 'exitExpandedGlobe';
        close.className = 'icon-btn';
        close.type = 'button';
        close.textContent = '×';
        close.setAttribute('aria-label', 'Exit full screen globe');
        close.title = 'Exit full screen globe';
        close.addEventListener('click', closeExpansion);
        topbar.appendChild(close);
        move(document.querySelector('.historical-timeline'), shell);
        move(workspace, shell);
        stage.classList.add('globe-expanded');
        document.body.classList.add('globe-expanded-open');
        // Native fullscreen renders descendants only, including its tooltip.
        const tooltip = window.globeInstance?.tooltip?.node();
        if (tooltip?.parentNode) {
            tooltip.style.opacity = '0';
            move(tooltip, shell);
        }
        // The CSS fallback is modal too: background controls must be absent
        // from keyboard navigation and assistive technology until it closes.
        for (const node of document.body.children) if (node !== shell && !node.inert) {
            node.inert = true;
            background.push(node);
        }
        expandButton.setAttribute('aria-expanded', 'true');
        expandButton.setAttribute('aria-label', 'Exit full screen globe');
        expandButton.title = 'Exit full screen globe';
        close.focus({ preventScroll: true });
        resize();
        const target = shell;
        // The fixed view also works when Fullscreen is unsupported or denied.
        let request;
        try {
            request = target.requestFullscreen?.();
            fullscreenRequest = request;
            await request;
            if (shell === target && document.fullscreenElement === target) nativeFullscreen = true;
            else if (shell !== target && document.fullscreenElement === target) await document.exitFullscreen();
        } catch { /* Keep the viewport-sized CSS fallback. */ }
        finally { if (fullscreenRequest === request) fullscreenRequest = null; }
    }
    expandButton.addEventListener('click', toggleExpansion);
    // Restore the normal page before invoking its existing country action.
    document.addEventListener('click', async event => {
        const button = event.target.closest?.('#seeMoreBtn, #addToCompareBtn');
        if (!button || (!pendingCountryAction && !shell?.contains(button))) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (pendingCountryAction) return;
        pendingCountryAction = button;
        try {
            await closeExpansion();
        } finally {
            pendingCountryAction = null;
        }
        if (button.isConnected && !button.disabled) button.click();
    }, true);
    document.addEventListener('fullscreenchange', () => {
        if (shell && document.fullscreenElement === shell) nativeFullscreen = true;
        else if (nativeFullscreen) finishExpansion();
        resize();
    });
    // Capture Escape before the app's general country-analysis/Compare handler.
    document.addEventListener('keydown', event => {
        if (!shell) return;
        if (event.key === 'Escape') {
            event.preventDefault(); event.stopImmediatePropagation(); closeExpansion();
        } else if (event.key === 'Tab') {
            const controls = [...shell.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled]), summary, [tabindex="0"]')]
                .filter(node => node.getClientRects().length);
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
    }, true);

    function updateAnalysisSpacing() {
        updateExpandedSettingsSpacing();
        const analysis = document.getElementById('visualizationPanel');
        if (!analysis || analysis.hidden || shell || document.getElementById('exploreView')?.hidden) return;
        const bottoms = [...workspace.querySelectorAll(':scope > .panel')]
            .filter(node => node.getClientRects().length)
            .map(node => node.getBoundingClientRect().bottom + scrollY);
        const gap = Math.max(4, Math.min(6, innerHeight - Math.max(0, ...bottoms)));
        document.getElementById('exploreView').style.setProperty('--analysis-bottom-space', `${gap}px`);
    }
    function updateExpandedSettingsSpacing() {
        const explore = document.getElementById('exploreView');
        if (shell || !explore || explore.hidden || content.hidden) return;
        const ranges = settings.querySelector('.legend-details[open]');
        const settingsBox = settings.getBoundingClientRect();
        const expansion = ranges ? ranges.getBoundingClientRect().height - ranges.querySelector('summary').getBoundingClientRect().height : 0;
        const style = getComputedStyle(settings);
        const minimum = parseFloat(style.minHeight) || 0;
        const naturalHeight = content.getBoundingClientRect().bottom - settingsBox.top + parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth);
        const growth = settingsBox.height - Math.max(minimum, naturalHeight - expansion);
        // Reconstruct the collapsed layout without closing the user's legend.
        // Desktop cards share a row; tablet/mobile cards below settings move too.
        const bottoms = [...workspace.querySelectorAll(':scope > .panel')]
            .filter(node => node.getClientRects().length)
            .map(node => {
                const box = node.getBoundingClientRect();
                const shift = node === settings || box.top >= settingsBox.bottom - 1 ? growth : 0;
                const height = node.id === 'countryInfo' && innerWidth > 760 ? Math.min(box.height, stage.getBoundingClientRect().height) : box.height;
                return box.top + scrollY - shift + height;
            });
        const gap = Math.max(14, innerHeight - Math.max(0, ...bottoms));
        explore.style.setProperty('--expanded-settings-bottom-space', `${gap}px`);
    }
    const analysis = document.getElementById('visualizationPanel');
    const visibility = new MutationObserver(updateAnalysisSpacing);
    if (analysis) visibility.observe(analysis, { attributes: true, attributeFilter: ['hidden'] });
    const explore = document.getElementById('exploreView');
    if (explore) visibility.observe(explore, { attributes: true, attributeFilter: ['hidden'] });
    const legend = document.getElementById('globeLegend');
    if (legend) visibility.observe(legend, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    if (typeof ResizeObserver !== 'undefined') {
        const layout = new ResizeObserver(updateAnalysisSpacing);
        for (const node of [settings, stage, document.getElementById('countryInfo')]) if (node) layout.observe(node);
    }
    window.addEventListener('resize', updateAnalysisSpacing);
    document.addEventListener('atlas-ready', updateAnalysisSpacing);
    document.addEventListener('country-selected', updateAnalysisSpacing);
})();
