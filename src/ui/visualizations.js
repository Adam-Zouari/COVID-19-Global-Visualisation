function selectedVisualizationCountry() {
    return window.globeInstance?.selectedCountryCode;
}

function updateCountryAnalysisSummary() {
    const valueElement = document.getElementById('analysisValue');
    const globe = window.globeInstance, code = selectedVisualizationCountry();
    if (!valueElement || !globe || !code) return;
    const service = globe.dataService, metric = service.getMetricMetadata();
    const value = service.getDisplayValue(code), available = typeof value === 'number' && Number.isFinite(value);
    document.getElementById('analysisMetricLabel').textContent = metric.label;
    document.getElementById('analysisUnits').textContent = `${ChartFactory.axisUnitLabel(service.currentColumn, service.displayUnit)}${metric.smoothingAllowed && service.smoothing === '7day' ? ' · 7-day average' : ''}`;
    valueElement.textContent = available ? globe.formatMetricValue(value) : 'Unavailable';
    valueElement.classList.toggle('unavailable', !available);
    const detail = available ? value < 0 ? ' · Reporting correction' : '' : ` · ${service.getCountryAvailability(code).label}`;
    document.getElementById('analysisValueDate').textContent = `Selected day · ${service.formatDate(service.currentDate)}${detail}`;
}

function showVisualizations({ scroll = true } = {}) {
    const countryCode = selectedVisualizationCountry();
    if (!countryCode) return;
    const panel = document.getElementById('visualizationPanel');
    if (!panel) return;
    panel.hidden = false;
    const visible = !document.getElementById('exploreView')?.hidden;
    if (visible) changeVisualization();
    if (scroll && visible) panel.scrollIntoView?.({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
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
    updateCountryAnalysisSummary();
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
document.addEventListener('atlas-data-updated', updateCountryAnalysisSummary);
