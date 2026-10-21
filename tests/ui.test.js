import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import * as d3 from 'd3';

const importedName = '<img src=x onerror="alert(1)"><script>alert(2)</script>';

function harness(t) {
    const dom = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), { runScripts: 'outside-only', url: 'http://localhost/' });
    t.after(() => dom.window.close());
    const context = dom.getInternalVMContext(); context.d3 = d3;
    const dates = Array.from({ length: 1001 }, (_, index) => new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10));
    const names = { us: importedName, tn: 'Tunisia', sg: 'Singapore', fr: 'France', de: 'Germany', ca: 'Canada' };
    const rows = Object.fromEntries(Object.keys(names).map((code, countryIndex) => [code,
        Object.fromEntries(dates.map((date, index) => [date, { new_confirmed: index * (countryIndex + 1), new_tested: index * 2 }]))]));
    const service = {
        currentDataset: 'epidem', currentColumn: 'new_confirmed', currentDate: dates[300], displayUnit: 'count', smoothing: 'raw',
        availableDates: dates, availableColumns: { epidem: ['new_confirmed', 'new_tested'] }, indexedData: { epidem: rows },
        formatDate: date => date, getCountryName: code => names[code],
        getAvailableDates() { return this.metricDates || this.availableDates; },
        getAllCountries: () => Object.entries(names).map(([countryCode, countryName]) => ({ countryCode, countryName })),
        getPopulation: () => 1000000,
        getMetricMetadata(column) { column ||= this.currentColumn; return { column, label: column === 'new_tested' ? 'New tests' : 'New confirmed cases', kind: 'daily', allowedUnits: ['count', 'per100k'], smoothingAllowed: true }; },
        getUnitLabel: (_column, unit) => unit === 'per100k' ? 'Per 100,000 people' : 'Count'
    };
    const navigations = [];
    let resetCount = 0, stopCount = 0;
    const globe = { dataService: service, selectedCountry: null, selectedCountryCode: null,
        stopAutoRotation() {}, cancelRotationAnimation() {}, resetView() { resetCount++; }, goToCountry: code => navigations.push(code) };
    context.window.dataService = service; context.window.globeInstance = globe;
    for (const file of ['ui/uiUtils.js', 'ui/search.js', 'ui/compare.js', 'ui/compareUI.js', 'charts/chartFactory.js', 'charts/compareCharts.js'])
        vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context, { filename: file });
    context.window.syncAtlasState = () => {};
    context.window.stopTimeline = () => { stopCount++; };
    context.window.atlasActions = {
        setMetric(column) { service.currentColumn = column; dom.window.CompareUI.initializeDateRangeSlider(); dom.window.CompareMode.updateComparisonView(); },
        setUnit(unit) { service.displayUnit = unit; dom.window.CompareMode.updateComparisonView(); },
        setSmoothing(value) { service.smoothing = value; dom.window.CompareMode.updateComparisonView(); }
    };
    return { window: dom.window, document: dom.window.document, context, service, globe, navigations,
        factory: vm.runInContext('ChartFactory', context), comparison: vm.runInContext('CompareCharts', context), compare: dom.window.CompareMode,
        resetCount: () => resetCount, stopCount: () => stopCount };
}

test('search and comparison treat imported country names as literal text', t => {
    const { window, document, compare } = harness(t);
    window.initializeUI(); window.openSearch();
    const item = [...document.querySelectorAll('.country-item')].find(element => element.getAttribute('aria-label') === importedName);
    assert.ok(item); assert.equal(item.querySelector('script'), null); assert.equal(item.querySelector('[onerror]'), null);
    assert.equal(item.querySelectorAll('img').length, 1);
    compare.state.countries = ['us']; window.CompareUI.updateCountryList();
    const header = document.getElementById('headerCountriesList');
    assert.ok(header.textContent.includes(importedName)); assert.equal(header.querySelector('script'), null); assert.equal(header.querySelector('[onerror]'), null);
});

test('repeated initialization and search opening keep one filter handler and one navigation', t => {
    const { window, document, navigations } = harness(t);
    const originalFilter = window.filterCountries; let filterCalls = 0;
    window.filterCountries = (...args) => { filterCalls++; return originalFilter(...args); };
    for (let count = 0; count < 5; count++) { window.initializeUI(); window.openSearch(); window.closeSearch(); }
    window.openSearch(); const input = document.getElementById('countrySearchInput'); input.value = 'tuni'; input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(filterCalls, 1);
    const visible = [...document.querySelectorAll('.country-item')].filter(element => !element.hidden);
    assert.equal(visible.length, 1); assert.equal(visible[0].getAttribute('aria-label'), 'Tunisia'); visible[0].click();
    assert.deepEqual(navigations, ['tn']); assert.equal(document.getElementById('searchModal').hidden, true);
});

test('comparison sliders reach every active metric date and labels agree with filtered chart endpoints', t => {
    const { window, document, service, compare, comparison } = harness(t);
    service.metricDates = service.availableDates.slice(100, 201);
    window.CompareUI.initializeDateRangeSlider();
    const start = document.getElementById('startDateSlider'), end = document.getElementById('endDateSlider');
    assert.equal(start.max, '100'); assert.equal(start.step, '1');
    start.value = '7'; end.value = '91'; start.dispatchEvent(new window.Event('input')); end.dispatchEvent(new window.Event('change'));
    const prepared = comparison.prepare(['us', 'tn'], { dateRange: compare.state.dateRange, selectedColumn: 'new_confirmed' });
    assert.equal(document.getElementById('startDateLabel').textContent, prepared[0].dates[0]);
    assert.equal(document.getElementById('endDateLabel').textContent, prepared[0].dates.at(-1));
    assert.equal(prepared[0].dates[0], service.availableDates[107]); assert.equal(prepared[1].dates[0], prepared[0].dates[0]);
});

test('comparison preserves selected country, date and analysis context when exiting', t => {
    const { document, globe, service, compare, resetCount, stopCount } = harness(t);
    globe.selectedCountryCode = 'sg'; const originalDate = service.currentDate;
    document.getElementById('visualizationPanel').hidden = false;
    assert.equal(document.querySelector('[data-country-code="sg"]'), null);
    compare.enter();
    assert.deepEqual(Array.from(compare.state.countries), ['sg']); assert.equal(compare.state.displayMode, 'combined'); assert.equal(compare.state.chartType, 'line');
    assert.equal(document.getElementById('exploreView').hidden, true); assert.equal(document.getElementById('comparePanel').hidden, false);
    assert.equal(document.getElementById('navCompare').getAttribute('aria-current'), 'page'); assert.equal(stopCount(), 1);
    compare.exit();
    assert.equal(document.getElementById('exploreView').hidden, false); assert.equal(document.getElementById('comparePanel').hidden, true);
    assert.equal(globe.selectedCountryCode, 'sg'); assert.equal(service.currentDate, originalDate);
    assert.equal(document.getElementById('visualizationPanel').hidden, false); assert.equal(resetCount(), 0);
});

test('comparison limits selection to four countries, ignores duplicates and explains how to continue', t => {
    const { document, compare } = harness(t);
    for (const code of ['us', 'tn', 'sg', 'fr', 'de', 'us']) compare.addCountry(code);
    assert.deepEqual(Array.from(compare.state.countries), ['us', 'tn', 'sg', 'fr']);
    assert.match(document.getElementById('compareMessage').textContent, /up to 4 countries/);
    compare.removeCountry('tn'); compare.addCountry('de');
    assert.deepEqual(Array.from(compare.state.countries), ['us', 'sg', 'fr', 'de']);
    assert.equal(document.getElementById('compareMessage').hidden, true);
});

test('separate country charts use one shared metric and common scale by default', t => {
    const { document, compare, service } = harness(t);
    compare.state.countries = ['tn', 'fr']; compare.enter(); compare.changeDisplayMode('separate');
    const axes = [...document.querySelectorAll('.country-chart-container .y-axis')].map(axis => axis.textContent);
    assert.equal(axes.length, 2); assert.equal(axes[0], axes[1]);
    compare.updateSelectedColumn('new_tested');
    assert.equal(service.currentColumn, 'new_tested'); assert.equal(document.getElementById('compareMetricSelector').value, 'new_tested');
    for (const chart of document.querySelectorAll('.country-chart-container svg')) assert.match(chart.getAttribute('aria-label'), /New tests/);
    compare.changeScale('independent'); assert.equal(compare.state.scale, 'independent');
});

test('population-adjusted options are disabled with a clear reason when population is unavailable', t => {
    const { document, service, compare } = harness(t);
    service.getPopulation = () => null; compare.syncControls();
    const selector = document.getElementById('compareUnitSelector');
    assert.equal(selector.querySelector('[value="per100k"]').disabled, true); assert.match(selector.title, /unavailable/);
    service.getPopulation = () => 1000000; compare.syncControls();
    assert.equal(selector.querySelector('[value="per100k"]').disabled, false);
});

test('empty comparison offers a country picker and raw smoothing remains a valid selected option', t => {
    const { document, compare } = harness(t);
    compare.enter();
    assert.ok(document.querySelector('.no-countries-message .primary-btn'));
    assert.equal(document.getElementById('compareSmoothingSelector').value, 'raw');
    assert.equal(document.getElementById('compareScaleSelector').disabled, true);
});
