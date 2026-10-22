function selectedVisualizationCountry() {
    return window.globeInstance?.selectedCountryCode;
}

function showVisualizations() {
    const countryCode = selectedVisualizationCountry();
    if (!countryCode) return;
    const panel = document.getElementById('visualizationPanel');
    if (!panel) return;
    panel.hidden = false;
    changeVisualization();
    panel.scrollIntoView?.({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    window.syncAtlasState?.();
}

function closeCountryAnalysis() {
    const panel = document.getElementById('visualizationPanel');
    if (panel) panel.hidden = true;
    ChartControls.clearContext();
    document.getElementById('seeMoreBtn')?.focus({ preventScroll: true });
    window.syncAtlasState?.();
}

function changeVisualization() {
    const container = document.getElementById('chartContainer');
    if (!container) return;
    const code = selectedVisualizationCountry();
    if (!code) { ChartControls.clearContext(); container.replaceChildren(); ChartFactory.showError(container, 'Select a country to explore its history.'); return; }
    const name = window.globeInstance.dataService.getCountryName(code);
    const title = document.getElementById('viz-country-name');
    if (title) title.textContent = name;
    const flag = document.getElementById('viz-flag');
    if (flag) { flag.src = `https://flagcdn.com/${code.toLowerCase()}.svg`; flag.alt = ''; }
    try { ChartFactory.createChart(container, code, document.getElementById('vizTypeSelector')?.value || 'line'); }
    catch (error) { console.error('Error creating visualization:', error); container.replaceChildren(); ChartFactory.showError(container, 'Unable to create this visualization.'); }
}

let visualizationResizeFrame = null;
function scheduleVisualizationRefresh() {
    // Resize and appearance events can occur together. Draw the visible view
    // once per frame; datasets and country palette assignments stay intact.
    if (visualizationResizeFrame !== null) return;
    visualizationResizeFrame = requestAnimationFrame(() => {
        visualizationResizeFrame = null;
        window.CompareUI?.updateCountryColors();
        if (window.CompareMode?.state.active) {
            CompareUI.matchExploreBottomSpacing();
            CompareMode.updateComparisonView();
        }
        else {
            const panel = document.getElementById('visualizationPanel');
            if (panel && !panel.hidden) changeVisualization();
        }
    });
}
window.addEventListener('resize', scheduleVisualizationRefresh);
document.addEventListener('atlas:themechange', scheduleVisualizationRefresh);
