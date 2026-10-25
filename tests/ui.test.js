import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import * as d3 from 'd3';
import { createWorkspaces } from '../src/ui/workspaces.js';
import { getMetricMetadata, getUnitLabel } from '../src/dataService/metrics.js';

const importedName = '<img src=x onerror="alert(1)"><script>alert(2)</script>';

function harness(t) {
    const dom = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), { runScripts: 'outside-only', url: 'http://localhost/' });
    t.after(() => dom.window.close());
    const context = dom.getInternalVMContext(); context.d3 = d3;
    context.window.scrollTo = () => {};
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
        getCountrySeries(code, { column }) {
            return dates.map(date => { const value = rows[code]?.[date]?.[column] ?? null; return { date, value, rawValue: value }; });
        },
        getMetricMetadata(column) { column ||= this.currentColumn; return { column, label: column === 'new_tested' ? 'New tests' : 'New confirmed cases', kind: 'daily', allowedUnits: ['count', 'per100k'], smoothingAllowed: true }; },
        getUnitLabel: (_column, unit) => unit === 'per100k' ? 'Per 100,000 people' : 'Count'
    };
    const navigations = [];
    let resetCount = 0, stopCount = 0, resizeCount = 0;
    const globe = { dataService: service, selectedCountry: null, selectedCountryCode: null,
        stopAutoRotation() {}, cancelRotationAnimation() {}, resize() { resizeCount++; }, resetView() { resetCount++; }, goToCountry: code => navigations.push(code) };
    context.window.dataService = service; context.window.globeInstance = globe;
    for (const file of ['ui/view.js', 'ui/uiUtils.js', 'ui/search.js', 'ui/dateRange.js', 'ui/compare.js', 'ui/compareUI.js', 'charts/chartFactory.js', 'charts/compareCharts.js'])
        vm.runInContext(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), context, { filename: file });
    dom.window.AtlasView.initialize(); dom.window.AtlasView.finish('explore');
    context.window.syncAtlasState = () => {};
    context.window.stopTimeline = () => { stopCount++; };
    context.window.atlasActions = {
        setMetric(column) { service.currentColumn = column; dom.window.CompareUI.initializeDateRangeSlider(); dom.window.CompareMode.updateComparisonView(); },
        setUnit(unit) { service.displayUnit = unit; dom.window.CompareMode.updateComparisonView(); },
        setSmoothing(value) { service.smoothing = value; dom.window.CompareMode.updateComparisonView(); }
    };
    return { window: dom.window, document: dom.window.document, context, service, globe, navigations,
        factory: vm.runInContext('ChartFactory', context), comparison: vm.runInContext('CompareCharts', context), compare: dom.window.CompareMode,
        resetCount: () => resetCount, stopCount: () => stopCount, resizeCount: () => resizeCount };
}

test('focus indicators follow pointer and keyboard interaction without changing focused controls', t => {
    const { window, document } = harness(t);
    const button = document.getElementById('rawBtn'), root = document.documentElement;
    button.addEventListener('pointerdown', () => {
        assert.equal(root.dataset.inputModality, 'pointer');
        button.focus();
    });
    button.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    assert.equal(document.activeElement, button);
    button.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Shift', bubbles: true }));
    assert.equal(root.dataset.inputModality, 'pointer');
    button.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    assert.equal(root.dataset.inputModality, 'keyboard');
    assert.equal(document.activeElement, button);
    button.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    assert.equal(root.dataset.inputModality, 'pointer');
});

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

test('search cannot open behind another modal and repeated opening retains its return focus', t => {
    const { window, document } = harness(t);
    window.initializeUI();
    const trigger = document.getElementById('search'), modal = document.getElementById('searchModal');
    trigger.focus();
    const expanded = document.createElement('section'); expanded.id = 'expandedGlobe'; document.body.appendChild(expanded);
    window.openSearch(); assert.equal(modal.hidden, true); assert.equal(document.activeElement, trigger);
    expanded.remove();
    const methodology = document.getElementById('methodologyDialog'); methodology.open = true;
    window.openSearch(); assert.equal(modal.hidden, true);
    methodology.open = false;
    const error = document.getElementById('errorDisplay'); error.style.display = 'flex';
    window.openSearch(); assert.equal(modal.hidden, true);
    error.style.display = 'none';
    window.openSearch(); window.openSearch(); window.closeSearch();
    assert.equal(modal.hidden, true); assert.equal(document.activeElement, trigger);
});

test('clearing the selected country closes its stale analysis without stealing focus', t => {
    const { window, document, context } = harness(t);
    let cleared = 0;
    window.ChartControls = { clearContext() { cleared++; } };
    vm.runInContext(readFileSync(new URL('../src/ui/visualizations.js', import.meta.url), 'utf8'), context);
    const panel = document.getElementById('visualizationPanel'), chart = document.getElementById('chartContainer');
    panel.hidden = false; chart.appendChild(document.createElement('svg'));
    const trigger = document.getElementById('search'); trigger.focus();
    window.changeVisualization();
    assert.equal(panel.hidden, true); assert.equal(chart.childElementCount, 0);
    assert.equal(cleared, 1); assert.equal(document.activeElement, trigger);
});

test('empty scatter comparisons describe their three-country limit', t => {
    const { compare, document } = harness(t);
    compare.state.chartType = 'scatter'; compare.enter();
    assert.match(document.querySelector('.no-countries-message').textContent, /2–3 countries/);
});

test('comparison sliders reach every active metric date and labels agree with filtered chart endpoints', t => {
    const { window, document, service, compare, comparison } = harness(t);
    service.metricDates = service.availableDates.slice(100, 201);
    window.CompareUI.initializeDateRangeSlider();
    const start = document.getElementById('startDateSlider'), end = document.getElementById('endDateSlider');
    assert.equal(start.max, '100'); assert.equal(start.step, '1');
    start.value = '7'; end.value = '91'; start.dispatchEvent(new window.Event('input')); end.dispatchEvent(new window.Event('change'));
    const prepared = comparison.prepare(['us', 'tn'], { dateRange: compare.state.dateRange, selectedColumn: 'new_confirmed' });
    assert.equal(document.getElementById('compare-date-range-start-input').value, prepared[0].dates[0]);
    assert.equal(document.getElementById('compare-date-range-end-input').value, prepared[0].dates.at(-1));
    assert.equal(prepared[0].dates[0], service.availableDates[107]); assert.equal(prepared[1].dates[0], prepared[0].dates[0]);
});

test('comparison period input redraws chart axes before release without replacing either date handle', t => {
    const { window, document, service, compare, factory } = harness(t);
    compare.state.countries = ['tn', 'fr']; compare.enter();
    const start = document.getElementById('startDateSlider'), end = document.getElementById('endDateSlider');
    const initialAxis = document.querySelector('#compareChartContainer .x-axis').textContent;
    const render = compare.updateComparisonView.bind(compare);
    let renders = 0;
    compare.updateComparisonView = (...args) => { renders++; return render(...args); };
    start.value = '100'; start.dispatchEvent(new window.Event('input'));
    end.value = '500'; end.dispatchEvent(new window.Event('input'));
    assert.equal(compare.state.dateRange.start, 10); assert.equal(compare.state.dateRange.end, 50);
    assert.notEqual(document.querySelector('#compareChartContainer .x-axis').textContent, initialAxis);
    assert.ok(document.querySelector('#compareChartContainer .chart-subtitle').textContent.includes(
        factory.periodLabel([service.availableDates[100], service.availableDates[500]])));
    assert.equal(document.getElementById('startDateSlider'), start);
    assert.equal(document.getElementById('endDateSlider'), end);
    assert.equal(renders, 2);
    end.dispatchEvent(new window.Event('change'));
    assert.equal(renders, 2, 'releasing an already-rendered range does not redraw it twice');
});

test('comparison preparation uses its local metric and units when no service is explicitly supplied', t => {
    const { window, service, comparison } = harness(t);
    const local = Object.assign(Object.create(service), { currentColumn: 'new_tested', displayUnit: 'per100k', smoothing: '7day' });
    window.AtlasWorkspaces = { peek: scope => scope === 'compare' ? local : null };
    const prepared = comparison.prepare(['tn', 'us'], { dateRange: { start: 10, end: 20 } });
    for (const country of prepared) {
        assert.equal(country.column, 'new_tested'); assert.equal(country.unit, 'per100k'); assert.equal(country.smoothing, '7day');
        assert.equal(country.series.new_tested[0], 200);
    }
    assert.equal(service.currentColumn, 'new_confirmed'); assert.equal(service.displayUnit, 'count'); assert.equal(service.smoothing, 'raw');
});

test('single-date chart arrows step calendar days through sparse observations and stay synchronized', t => {
    const { window, document, context, service } = harness(t);
    vm.runInContext(readFileSync(new URL('../src/ui/analytics.js', import.meta.url), 'utf8'), context);
    service.metricDates = ['2020-02-28', '2020-03-02']; service.currentDate = service.metricDates[0];
    const host = document.getElementById('compareChartOptions');
    let options = {}, changes = 0;
    const render = () => window.AnalyticsCharts.controls(host, 'horizontal', options, next => {
        options = next; changes++; render();
    });
    render();
    const previous = document.getElementById('compare-date-prev'), next = document.getElementById('compare-date-next');
    const field = document.getElementById('compare-date'), slider = document.getElementById('compare-date-slider');
    assert.equal(previous.disabled, true); assert.equal(next.disabled, false);
    previous.click(); assert.equal(changes, 0);
    next.focus(); next.click();
    assert.equal(field.value, '2020-02-29'); assert.equal(slider.value, '0');
    assert.equal(document.activeElement, next);
    next.click(); assert.equal(field.value, '2020-03-01');
    next.click(); assert.equal(field.value, '2020-03-02'); assert.equal(next.disabled, true);
    assert.equal(slider.value, '1'); next.click(); assert.equal(changes, 3);
    previous.click(); assert.equal(field.value, '2020-03-01');
    field.value = '2020-02-29'; field.dispatchEvent(new window.Event('change'));
    previous.click(); assert.equal(field.value, '2020-02-28'); assert.equal(previous.disabled, true);
    slider.value = '1'; slider.dispatchEvent(new window.Event('input'));
    assert.equal(field.value, '2020-03-02'); assert.equal(next.disabled, true);
    assert.equal(host.querySelectorAll('[data-date-step]').length, 2);
});

test('single-date chart arrows are disabled for empty and one-date timelines', t => {
    const { window, document, context, service } = harness(t);
    vm.runInContext(readFileSync(new URL('../src/ui/analytics.js', import.meta.url), 'utf8'), context);
    const host = document.getElementById('compareChartOptions');
    let changes = 0;
    for (const dates of [[], ['2020-02-28']]) {
        service.metricDates = dates;
        window.AnalyticsCharts.controls(host, 'horizontal', {}, () => { changes++; });
        assert.equal(document.getElementById('compare-date-slider').disabled, true);
        for (const button of host.querySelectorAll('[data-date-step]')) {
            assert.equal(button.disabled, true); button.click();
        }
    }
    assert.equal(changes, 0);
});

test('comparison period shares a highlighted track and touch date fields preserve exact chart bounds', t => {
    const { window, document, service, compare, comparison } = harness(t);
    service.metricDates = [service.availableDates[100], service.availableDates[102], service.availableDates[109]];
    window.CompareUI.initializeDateRangeSlider();
    assert.equal(document.querySelectorAll('#dateRangeSlider .date-range-track').length, 1);
    assert.equal(document.querySelectorAll('#dateRangeSlider .date-range-track input[type="range"]').length, 2);
    const from = document.getElementById('compare-date-range-start-input');
    from.value = service.availableDates[102]; from.dispatchEvent(new window.Event('change'));
    const prepared = comparison.prepare(['us', 'tn'], { dateRange: compare.state.dateRange, selectedColumn: 'new_confirmed' });
    assert.equal(prepared[0].dates[0], from.value);
    assert.equal(document.getElementById('startDateSlider').getAttribute('aria-valuetext'), from.value);
    assert.equal(document.querySelector('#dateRangeSlider .date-range-highlight').style.left, '50%');
    assert.equal(document.querySelector('#dateRangeSlider .date-range-selection').textContent, `${from.value} – ${service.availableDates[109]}`);
});

test('comparison preserves selected country, date and analysis context when exiting', t => {
    const { document, globe, service, compare, resetCount, stopCount, resizeCount } = harness(t);
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
    assert.equal(resizeCount(), 1, 'returning from the hidden view remeasures the globe');
});

test('an established comparison keeps its countries when returning from a different globe country', t => {
    const { window, service, globe, compare } = harness(t);
    let local;
    window.AtlasWorkspaces = {
        peek: scope => scope === 'compare' ? local : null,
        ensure: () => local ||= Object.create(service)
    };
    globe.selectedCountryCode = 'tn'; compare.enter();
    assert.deepEqual(Array.from(compare.state.countries), ['tn'], 'the first visit starts from the globe country');
    compare.addCountry('us'); compare.exit();
    globe.selectedCountryCode = 'fr'; compare.enter();
    assert.deepEqual(Array.from(compare.state.countries), ['tn', 'us'], 'navigation preserves the established comparison');
    assert.equal(globe.selectedCountryCode, 'fr');
    compare.exit(); compare.addCountry('fr'); compare.enter();
    assert.deepEqual(Array.from(compare.state.countries), ['tn', 'us', 'fr'], 'an explicit add still includes the new globe country');
});

test('an explicit initial comparison country list is preserved independently of the globe country', t => {
    const { window, service, globe, compare } = harness(t);
    let local;
    window.AtlasWorkspaces = {
        peek: scope => scope === 'compare' ? local : null,
        ensure: () => local ||= Object.create(service)
    };
    globe.selectedCountryCode = 'tn'; compare.state.countries = ['us', 'fr']; compare.enter();
    assert.deepEqual(Array.from(compare.state.countries), ['us', 'fr']);
    assert.equal(globe.selectedCountryCode, 'tn');
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

test('comparison country chips retain four distinct identities after browsing, reordering and replacing selections', t => {
    const { document, compare, factory } = harness(t);
    for (let index = 0; index < 25; index++) factory.countryColor(`viewed-${index}`);
    compare.enter();
    for (const code of ['us', 'tn', 'sg', 'fr']) compare.addCountry(code);
    const chipColors = () => Object.fromEntries([...document.querySelectorAll('#headerCountriesList .header-country-item')]
        .map(item => [item.dataset.countryCode, item.querySelector('.country-color').style.backgroundColor]));
    const original = chipColors();
    assert.equal(new Set(Object.values(original)).size, 4);
    compare.reorderCountries('fr', 'us');
    assert.deepEqual(chipColors(), original);
    compare.removeCountry('tn'); compare.addCountry('de');
    const replacement = chipColors();
    for (const code of ['us', 'sg', 'fr']) assert.equal(replacement[code], original[code]);
    assert.equal(replacement.de, original.tn);
    assert.equal(new Set(Object.values(replacement)).size, 4);
    const lines = [...document.querySelectorAll('#compareChartContainer .data-line')];
    for (const [index, code] of compare.state.countries.entries())
        assert.equal(d3.color(lines[index].getAttribute('stroke')).formatRgb(), replacement[code]);
});

test('separate country charts use one shared metric and common scale by default', t => {
    const { window, document, compare, service } = harness(t);
    compare.state.countries = ['tn', 'fr']; compare.enter(); compare.changeDisplayMode('separate');
    const axes = [...document.querySelectorAll('.country-chart-container .y-axis')].map(axis => axis.textContent);
    assert.equal(axes.length, 2); assert.equal(axes[0], axes[1]);
    const selector = document.getElementById('compareMetricSelector');
    selector.value = 'new_tested'; selector.dispatchEvent(new window.Event('change'));
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

test('empty comparison points to the existing picker and one-country charts keep a compact invitation', t => {
    const { document, compare } = harness(t);
    compare.enter();
    assert.match(document.querySelector('.no-countries-message').textContent, /Add country above/);
    assert.equal(document.querySelector('.no-countries-message button'), null);
    assert.ok(document.getElementById('addCountryBtn'));
    assert.equal(document.querySelector('.compare-options').hidden, true);
    assert.equal(document.getElementById('compareSmoothingSelector').value, 'raw');
    assert.equal(document.getElementById('compareScaleSelector').disabled, true);
    compare.addCountry('tn');
    assert.equal(document.querySelector('.no-countries-message'), null);
    assert.match(document.getElementById('compareMessage').textContent, /Add another country/);
    assert.equal(document.querySelector('.compare-options').hidden, false);
    assert.ok(document.querySelector('#compareChartContainer svg'));
    compare.addCountry('us');
    assert.equal(document.querySelector('.no-countries-message'), null);
    assert.ok(document.querySelector('#compareChartContainer svg'));
});

test('view navigation during loading keeps the latest requested view without activating unready comparison', t => {
    const { window, document, service, compare } = harness(t);
    const dates = service.availableDates; service.availableDates = [];
    window.AtlasView.restoring = true;
    window.AtlasView.navigate('compare');
    assert.equal(window.AtlasView.current, 'compare');
    assert.equal(document.getElementById('comparePanel').hidden, false);
    assert.equal(document.querySelector('.page-intro').hidden, true);
    assert.equal(compare.state.active, false);
    window.AtlasView.navigate('explore');
    assert.equal(window.AtlasView.current, 'explore');
    assert.equal(document.getElementById('comparePanel').hidden, true);
    service.availableDates = dates;
    window.AtlasView.finish('explore'); window.AtlasView.navigate('compare');
    assert.equal(compare.state.active, true);
    window.AtlasView.navigate('explore');
    assert.equal(compare.state.active, false);
});

test('comparison keeps select options and focus during updates and updates population availability in place', t => {
    const { document, service, compare } = harness(t);
    compare.syncControls();
    const metrics = document.getElementById('compareMetricSelector'), units = document.getElementById('compareUnitSelector');
    const metricOption = metrics.options[0], rateOption = units.querySelector('[value="per100k"]');
    metrics.focus();
    service.smoothing = '7day'; compare.syncControls();
    assert.equal(document.activeElement, metrics);
    assert.equal(metrics.options[0], metricOption);
    assert.equal(units.querySelector('[value="per100k"]'), rateOption);
    service.getPopulation = () => null; compare.syncControls();
    assert.equal(rateOption.disabled, true);
    service.getPopulation = () => 1000000; compare.syncControls();
    assert.equal(rateOption.disabled, false);
});

test('country analysis dataset buttons filter local metrics and retain independent settings and focus', t => {
    const { window, document, service, globe } = harness(t);
    globe.selectedCountryCode = 'tn';
    service.getMetricMetadata = getMetricMetadata;
    service.getUnitLabel = getUnitLabel;
    service.availableColumns = {
        epidem: ['new_confirmed', 'new_tested', 'cumulative_confirmed'],
        hospitalizations: ['current_hospitalized_patients'],
        vaccinations: ['cumulative_persons_vaccinated']
    };
    window.AtlasWorkspaces = createWorkspaces(service);
    const country = window.AtlasWorkspaces.ensure('country');
    window.updateAtlasPresentation();
    const metrics = document.getElementById('analysisMetricSelector');
    const units = document.getElementById('analysisUnitSelector');
    const reporting = document.getElementById('analysisReportingGroup');
    assert.equal(document.querySelector('label[for="analysisMetricSelector"]').parentElement, metrics.parentElement);
    for (const [localId, mainId] of [['analysisEpidemBtn', 'epidemBtn'], ['analysisHospBtn', 'hospBtn'], ['analysisVaccBtn', 'vaccBtn']]) {
        const local = document.getElementById(localId), main = document.getElementById(mainId);
        assert.equal(local.classList.contains('dataset-btn'), true);
        assert.equal(local.querySelector('path').getAttribute('d'), main.querySelector('path').getAttribute('d'));
    }
    assert.deepEqual(Array.from(metrics.options, option => option.value), service.availableColumns.epidem);
    assert.equal(metrics.querySelectorAll('optgroup').length, 0);
    assert.equal(document.getElementById('analysisEpidemBtn').getAttribute('aria-pressed'), 'true');
    assert.equal(document.getElementById('analysisHospBtn').getAttribute('aria-pressed'), 'false');
    assert.equal(document.getElementById('analysisVaccBtn').getAttribute('aria-pressed'), 'false');
    assert.equal(metrics.value, 'new_confirmed'); assert.equal(units.value, 'count');
    assert.equal(reporting.hidden, false);
    const metricOption = metrics.options[0], rateOption = units.querySelector('[value="per100k"]');
    metrics.focus();
    window.AtlasWorkspaces.update('country', { metric: 'new_tested', unit: 'per100k', smoothing: '7day' });
    window.updateAtlasPresentation();
    assert.equal(metrics.value, 'new_tested'); assert.equal(units.value, 'per100k');
    assert.equal(service.currentColumn, 'new_confirmed');
    assert.equal(document.getElementById('unitSelector').value, 'count');
    assert.equal(document.getElementById('rawBtn').getAttribute('aria-pressed'), 'true');
    assert.equal(document.getElementById('analysisAverageBtn').getAttribute('aria-pressed'), 'true');
    assert.equal(document.getElementById('analysisRawBtn').getAttribute('aria-pressed'), 'false');
    assert.equal(document.activeElement, metrics); assert.equal(metrics.options[0], metricOption);
    assert.equal(units.querySelector('[value="per100k"]'), rateOption);
    service.currentDataset = 'vaccinations'; service.currentColumn = 'cumulative_persons_vaccinated';
    service.displayUnit = 'percent'; service.smoothing = 'raw';
    window.updateAtlasPresentation();
    assert.equal(metrics.value, 'new_tested'); assert.equal(units.value, 'per100k');
    assert.equal(country.currentDataset, 'epidem');
    assert.equal(document.querySelector('label[for="analysisMetricSelector"]').textContent, 'Metric');
    assert.equal(document.getElementById('analysisEpidemBtn').getAttribute('aria-pressed'), 'true');
    assert.equal(document.getElementById('vaccBtn').getAttribute('aria-pressed'), 'true');
    service.getPopulation = () => null;
    window.AtlasWorkspaces.revalidate();
    window.updateAtlasPresentation();
    assert.equal(rateOption.disabled, true);
    assert.equal(country.displayUnit, 'count'); assert.equal(units.value, 'count');
    service.getPopulation = () => 1000000;
    window.AtlasWorkspaces.update('country', { category: 'vaccinations', metric: 'cumulative_persons_vaccinated', unit: 'percent', smoothing: '7day' });
    window.updateAtlasPresentation();
    assert.equal(metrics.value, 'cumulative_persons_vaccinated'); assert.equal(units.value, 'percent');
    assert.deepEqual(Array.from(metrics.options, option => option.value), service.availableColumns.vaccinations);
    assert.equal(document.getElementById('analysisVaccBtn').getAttribute('aria-pressed'), 'true');
    assert.equal(document.getElementById('analysisEpidemBtn').getAttribute('aria-pressed'), 'false');
    assert.equal(reporting.hidden, true); assert.equal(country.smoothing, 'raw');
    assert.equal(document.getElementById('analysisAverageBtn').disabled, true);
    service.availableColumns.vaccinations = ['new_persons_vaccinated'];
    window.AtlasWorkspaces.revalidate();
    window.updateAtlasPresentation();
    assert.equal(country.currentColumn, 'new_persons_vaccinated');
    assert.equal(metrics.value, 'new_persons_vaccinated'); assert.equal(units.value, 'count');
    assert.equal(reporting.hidden, false);
    assert.equal(document.getElementById('analysisAverageBtn').disabled, false);
    assert.equal(metrics.querySelector('[value="cumulative_persons_vaccinated"]'), null);
    assert.equal(document.activeElement, metrics);
    const chart = document.getElementById('vizTypeSelector');
    chart.value = 'scatter'; window.updateCountryAnalysisControls();
    assert.equal(document.getElementById('analysisMetricControl').hidden, true);
    chart.value = 'line'; window.updateCountryAnalysisControls();
    assert.equal(document.getElementById('analysisMetricControl').hidden, false);
    assert.equal(document.getElementById('analysisVaccBtn').getAttribute('aria-pressed'), 'true');
});
