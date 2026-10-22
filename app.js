import { DataService } from './dataService/DataService.js';
import * as MetricRegistry from './dataService/metrics.js';
import { createStore, readURLState, stateToURL } from './ui/store.js';

if (document.readyState !== 'complete') {
    await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
}

const requestedState = readURLState(window.location.search);
window.AtlasStore = createStore(requestedState);
window.MetricRegistry = MetricRegistry;
let restoring = true;
window.AtlasStore.subscribe(state => {
    if (restoring) return;
    const url = stateToURL(state, window.location.href);
    window.history.replaceState({ atlas: true }, '', `${url.pathname}${url.search}${url.hash}`);
});

function applyRequestedState(state) {
    const service = window.dataService;
    if (!service.availableDates.length || !window.globeInstance?.worldData) return;
    service.changeDataset(state.category);
    if (service.availableColumns[service.currentDataset].includes(state.metric)) service.changeColumn(state.metric);
    service.displayUnit = state.unit;
    service.smoothing = state.smoothing;
    if (!state.selectedDate || !service.changeDate(state.selectedDate)) service.changeDate(service.getSuggestedDate());
    window.validateDisplaySettings();
    const valid = new Set(service.getAllCountries().map(country => country.countryCode));
    CompareMode.state.countries = state.compareCountries.filter(code => valid.has(code));
    CompareMode.state.displayMode = state.compareLayout || 'combined';
    CompareMode.state.dateRange = state.compareRange;
    CompareMode.state.chartType = state.compareChartType;
    CompareMode.state.scale = state.compareScale;
    window.globeInstance.refreshData();
    if (state.selectedCountry && valid.has(state.selectedCountry)) window.globeInstance.goToCountry(state.selectedCountry);
    if (state.view === 'compare') CompareMode.enter();
    window.syncAtlasState();
}

try {
    if (!window.d3 || !window.topojson) throw new Error('Visualization libraries could not load. Run npm install and restart the server.');
    window.DataService = DataService;
    window.dataService = new DataService({ useSampleData: requestedState.dataMode === 'sample' });
    window.initializeUI();
    const globe = window.initializeGlobe();
    await globe.ready;
    applyRequestedState(requestedState);
    restoring = false;
    window.syncAtlasState();
    const url = stateToURL(window.AtlasStore.getState(), window.location.href);
    window.history.replaceState({ atlas: true }, '', `${url.pathname}${url.search}${url.hash}`);
    if (window.dataService.dataSource === 'csv') {
        try {
            const response = await fetch('/api/data-quality');
            if (response.ok) {
                const report = await response.json();
                const excluded = Object.values(report.files || {}).reduce((total, file) => total + (Number(file.excludedInvalidDates) || 0), 0);
                if (excluded) {
                    const note = document.getElementById('dataQualityNote');
                    note.textContent = `${excluded} source observations with invalid or implausible dates were excluded during preparation. No source dates or values were rewritten.`;
                    note.hidden = window.dataService.dataSource !== 'csv';
                }
            }
        } catch { /* A missing preparation report does not invalidate observations. */ }
    }
} catch (error) {
    restoring = false;
    console.error('Unable to initialize atlas:', error);
    document.getElementById('loader').style.display = 'none';
    document.getElementById('errorMessage').textContent = error.message;
    document.getElementById('errorDisplay').style.display = 'flex';
    document.getElementById('errorClose').onclick = () => { document.getElementById('errorDisplay').style.display = 'none'; };
}
