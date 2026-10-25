import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import * as d3 from 'd3';
import DataService from '../src/dataService/index.js';

function harness(t, { fullUI = false } = {}) {
    const dom = new JSDOM(fullUI ? readFileSync(new URL('../index.html', import.meta.url), 'utf8') :
        '<!doctype html><div id="visualizationPanel"><div id="chartContainer"></div></div>', { runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    const context = dom.getInternalVMContext();
    context.d3 = d3; context.requestAnimationFrame = callback => { callback(); return 1; }; context.cancelAnimationFrame = () => {};
    context.window.scrollTo = () => {};
    const rows = {
        us: { '2020-01-01': { new_confirmed: 5, new_deceased: 0, new_tested: 2 }, '2020-01-02': { new_confirmed: 5, new_deceased: 0, new_tested: null }, '2020-01-03': { new_confirmed: -2, new_deceased: 0, new_tested: 3 } },
        fr: { '2020-01-02': { new_confirmed: 7, new_deceased: 0, new_tested: 3 }, '2020-01-03': { new_confirmed: 0, new_deceased: 0, new_tested: 4 } }
    };
    context.window.globeInstance = { dataService: {
        currentDataset: 'epidem', currentColumn: 'new_confirmed', displayUnit: 'count', smoothing: 'none',
        availableColumns: { epidem: ['new_confirmed', 'new_deceased', 'new_tested'] }, indexedData: { epidem: rows },
        availableDates: Object.keys(rows.us), formatDate: date => date, getCountryName: code => code === 'us' ? '<img src=x onerror=alert(1)>' : 'France',
        getAllCountries: () => Object.keys(rows).map(countryCode => ({ countryCode })),
        getCountrySeries(code, { column }) {
            const rows = this.indexedData[this.currentDataset]?.[code];
            return rows ? this.availableDates.map(date => ({ date, value: rows[date]?.[column] ?? null })) : [];
        },
        getMetricMetadata: column => ({ column, label: { new_confirmed: 'New confirmed cases', new_deceased: 'New deaths', new_tested: 'New tests' }[column],
            kind: 'daily', allowedUnits: ['count', 'per100k', 'per1m'], smoothingAllowed: true }),
        getUnitLabel: (_column, unit) => ({ per100k: 'Per 100,000 people', per1m: 'Per 1,000,000 people' })[unit] || 'Count'
    } };
    for (const file of ['charts/chartFactory.js', 'ui/dateRange.js', 'charts/chartControls.js', 'charts/compareCharts.js', 'ui/uiUtils.js'])
        vm.runInContext(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), context, { filename: file });
    return { dom, context, window: dom.window, document: dom.window.document, factory: vm.runInContext('ChartFactory', context),
        controls: vm.runInContext('ChartControls', context), comparison: vm.runInContext('CompareCharts', context),
        service: context.window.globeInstance.dataService, container: dom.window.document.getElementById('chartContainer') };
}

test('preparation selects one shared metric and preserves zero, corrections and missing observations', t => {
    const { factory } = harness(t);
    const data = factory.prepareDataForCountry('US');
    assert.equal(data.column, 'new_confirmed');
    assert.deepEqual(Object.keys(data.series), ['new_confirmed']);
    assert.equal(data.series.new_confirmed[2], -2);
    assert.equal(factory.prepareDataForCountry('us', { selectedColumn: 'new_deceased' }).series.new_deceased[0], 0);
    assert.equal(factory.prepareDataForCountry('us', { selectedColumn: 'new_tested' }).series.new_tested[1], null);
    assert.equal(factory.prepareDataForCountry('zz'), null);
    assert.equal(factory.prepareDataForCountry(null), null);
});

test('chart preparation delegates normalization and smoothing to the shared service', t => {
    const { factory, service } = harness(t);
    let actual;
    service.getCountrySeries = (code, options) => { actual = { code, ...options }; return [{ date: '2020-01-01', value: 1.25 }]; };
    const data = factory.prepareDataForCountry('us', { unit: 'per100k', smoothing: '7day' });
    assert.deepEqual(actual, { code: 'us', column: 'new_confirmed', unit: 'per100k', smoothing: '7day' });
    assert.equal(data.series.new_confirmed[0], 1.25);
});

test('date mapping reaches every observation without mutating prepared series', t => {
    const { factory } = harness(t);
    const data = factory.prepareDataForCountry('fr');
    const result = factory.applySettings(data, { dateRange: { start: 0, end: 0 }, timeline: ['2020-01-01', '2020-01-02', '2020-01-03'] });
    assert.equal(result.dates[0], '2020-01-01'); assert.equal(result.series.new_confirmed[0], null);
    assert.equal(data.series.new_confirmed[1], 7);
    for (const length of [1, 2, 101, 1001]) for (let index = 0; index < length; index++)
        assert.equal(factory.dateIndex(length > 1 ? index / (length - 1) * 100 : 100, length), index);
});

test('bars bind repeated values to exact dates, allow corrections and escape imported text', t => {
    const { factory, container, window } = harness(t);
    factory.createChart(container, 'us', 'bar', { dateRange: { start: 0, end: 100 } });
    const bars = [...container.querySelectorAll('.data-bar')];
    assert.equal(bars.length, 3);
    assert.ok(bars.every(bar => Number(bar.getAttribute('height')) >= 0));
    bars.find(bar => bar.__data__.date === '2020-01-02').dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    assert.match(container.querySelector('.chart-tooltip').textContent, /2020-01-02/);
    assert.equal(container.querySelector('.chart-tooltip img'), null);
    assert.match(container.querySelector('svg').getAttribute('aria-label'), /New confirmed cases/);
    assert.equal(container.querySelector('.axis-unit-label').textContent, 'Cases');
    assert.match(container.querySelector('.chart-heading-title').textContent, /New confirmed cases/);
    assert.equal(container.querySelector('.chart-heading-title img'), null);
});

test('line gaps remain gaps and keyboard crosshair exposes missing observations', t => {
    const { factory, service, container, window } = harness(t);
    service.currentColumn = 'new_tested';
    factory.createChart(container, 'us', 'line', { dateRange: { start: 0, end: 100 } });
    const line = container.querySelector('.data-line');
    assert.equal((line.getAttribute('d').match(/M/g) || []).length, 2);
    const hit = container.querySelector('.chart-hit-area');
    hit.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(hit.getAttribute('aria-valuenow'), '1');
    assert.match(container.querySelector('.chart-tooltip').textContent, /2020-01-02.*No observation/);
    assert.equal(container.querySelector('.chart-crosshair').getAttribute('visibility'), 'visible');
    assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
});

test('bar, zero and missing details anchor to keyboard focus and Escape dismisses only the tooltip', t => {
    const { factory, service, container, document, window } = harness(t);
    service.getCountrySeries = () => [
        { date: '2020-01-01', value: 4 }, { date: '2020-01-02', value: 0 }, { date: '2020-01-03', value: null }
    ];
    factory.createChart(container, 'us', 'bar', {});
    assert.equal(container.querySelector('svg').getAttribute('role'), 'group', 'Interactive chart children remain exposed to assistive technology');
    container.getBoundingClientRect = () => ({ left: 100, top: 50, width: 700, height: 400 });
    Object.defineProperty(container, 'clientWidth', { value: 700 });
    let escapedToPage = 0;
    document.addEventListener('keydown', event => { if (event.key === 'Escape') escapedToPage++; });
    for (const selector of ['.data-bar', '.reported-zero-marker', '.missing-bar-marker']) {
        const mark = container.querySelector(selector);
        mark.getBoundingClientRect = () => ({ left: 300, top: 200, width: 20, height: 40 });
        mark.focus();
        const tooltip = container.querySelector('.chart-tooltip');
        assert.equal(tooltip.style.left, '222px');
        assert.equal(tooltip.style.top, '158px');
        const escape = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        mark.dispatchEvent(escape);
        assert.equal(escape.defaultPrevented, true);
        assert.equal(container.querySelector('.chart-tooltip'), null);
        assert.equal(document.activeElement, mark, 'Dismissing details keeps the inspected observation focused');
        mark.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }
    assert.equal(escapedToPage, 3, 'Escape reaches the page after details are already dismissed');
});

test('line and area inspectors dismiss details with Escape and remain keyboard-operable', t => {
    const { factory, container, document, window } = harness(t);
    for (const type of ['line', 'area']) {
        factory.createChart(container, 'us', type, {});
        assert.equal(container.querySelector('svg').getAttribute('role'), 'group');
        const inspector = container.querySelector('.chart-hit-area');
        inspector.focus();
        assert.ok(container.querySelector('.chart-tooltip'));
        const escape = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        inspector.dispatchEvent(escape);
        assert.equal(escape.defaultPrevented, true);
        assert.equal(container.querySelector('.chart-tooltip'), null);
        assert.equal(container.querySelector('.chart-crosshair').getAttribute('visibility'), 'hidden');
        assert.equal(container.querySelectorAll('.cursor-points circle').length, 0);
        assert.equal(document.activeElement, inspector);
        inspector.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        assert.match(container.querySelector('.chart-tooltip').textContent, /2020-01-03/);
    }
});

test('reused chart containers discard analytical state before Cartesian charts or errors', t => {
    const { factory, comparison, container, context, window } = harness(t);
    vm.runInContext(readFileSync(new URL('../src/charts/analyticsRendering.js', import.meta.url), 'utf8'), context);
    for (const render of [
        () => factory.createChart(container, 'us', 'line', {}),
        () => comparison.createCombinedChart(container, ['us', 'fr'], 'bar'),
        () => factory.createChart(container, 'us', 'unsupported', {})
    ]) {
        window.AnalyticsPlot.frame(container, { type: 'scatter', title: 'Relationships', note: 'Old chart description' });
        container.classList.add('retained-layout-class');
        assert.equal(container.dataset.chartType, 'scatter');
        assert.equal(container.classList.contains('analytics-chart'), true);
        render();
        assert.equal(container.classList.contains('analytics-chart'), false);
        assert.notEqual(container.dataset.chartType, 'scatter');
        assert.equal(container.classList.contains('retained-layout-class'), true);
        assert.doesNotMatch(container.textContent, /Old chart description|Relationships/);
    }
});

test('filtering to metric coverage dates retains unreported calendar days inside the range', t => {
    const { factory } = harness(t);
    const data = factory.prepareDataForCountry('us', { selectedColumn: 'new_tested' });
    const filtered = factory.applySettings(data, { timeline: ['2020-01-01', '2020-01-03'] });
    assert.deepEqual(Array.from(filtered.dates), ['2020-01-01', '2020-01-02', '2020-01-03']);
    assert.equal(filtered.series.new_tested[1], null);
});

test('a reported day without enough averaging history explains the unavailable average in a centered state', t => {
    const { factory, service, container } = harness(t);
    service.smoothing = '7day';
    service.getCountrySeries = () => [{ date: '2020-01-01', value: null, rawValue: 5, reported: true }, { date: '2020-01-02', value: null, rawValue: null, reported: false }];
    factory.createChart(container, 'us', 'line', {});
    assert.equal(container.querySelector('svg'), null);
    assert.match(container.querySelector('.chart-empty-state').textContent, /No data available.*not enough reported days to calculate a 7-day average.*Try another metric or date range/);
    assert.match(container.querySelector('.chart-subtitle').textContent, /7-day average/);
});

test('all country Cartesian types show titled empty states while zeros remain reported observations', t => {
    const { factory, service, container } = harness(t);
    const original = service.getCountrySeries;
    for (const type of ['line', 'bar', 'area']) {
        service.getCountrySeries = () => service.availableDates.map(date => ({ date, value: null }));
        factory.createChart(container, 'us', type, {});
        const state = container.querySelector('.chart-empty-state');
        assert.equal(state.getAttribute('role'), 'status');
        assert.match(state.textContent, /No data available.*new confirmed cases.*selected country and date range.*Try another metric or date range/i);
        assert.match(container.querySelector('.chart-heading-title').textContent, /New confirmed cases/);
        assert.match(container.querySelector('.chart-subtitle').textContent, /Daily reported values.*2020/);
        assert.equal(container.querySelector('svg, .chart-error, .chart-note'), null);
        assert.ok(parseFloat(state.style.height) >= 330);
        service.getCountrySeries = () => service.availableDates.map(date => ({ date, value: 0 }));
        factory.createChart(container, 'us', type, {});
        assert.equal(container.querySelector('.chart-empty-state'), null);
        assert.ok(container.querySelector('svg'));
    }
    service.getCountrySeries = original;
});

test('missing country histories retain metric, period and reason instead of returning an unframed error', t => {
    const { factory, comparison, container } = harness(t);
    factory.createChart(container, 'zz', 'line', {});
    assert.match(container.querySelector('.chart-heading-title').textContent, /New confirmed cases/);
    assert.match(container.querySelector('.chart-subtitle').textContent, /2020/);
    assert.ok(container.querySelector('.chart-empty-state'));
    comparison.createCombinedChart(container, ['zz', 'xx'], 'bar');
    assert.match(container.querySelector('.chart-empty-state').textContent, /selected countries and date range/);
    assert.equal(container.querySelector('svg, .chart-error'), null);
});

test('long histories have no point markers and range sliders reach each day', t => {
    const { controls, factory, service, container, document } = harness(t);
    const dates = Array.from({ length: 1001 }, (_, index) => new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10));
    service.availableDates = dates;
    service.indexedData.epidem.us = Object.fromEntries(dates.map((date, index) => [date, { new_confirmed: index }]));
    factory.createChart(container, 'us', 'line');
    assert.equal(container.querySelectorAll('.data-point').length, 0);
    assert.equal(document.getElementById('date-range-start').max, '1000');
    assert.equal(document.getElementById('date-range-start').step, '1');
    assert.equal(controls.context.countryCode, 'us');
});

test('weekly bars distinguish partial totals, missing weeks and reported zeros', t => {
    const { factory, container, window } = harness(t);
    const dates = Array.from({ length: 140 }, (_, index) => new Date(Date.UTC(2020, 0, 6 + index)).toISOString().slice(0, 10));
    const values = dates.map(() => 2); values[8] = null;
    values.fill(null, 14, 21); values.fill(0, 21, 28);
    const result = factory.aggregateBars(dates, [{ key: 'us', values }], { kind: 'daily' }, 'none');
    assert.equal(result.dates.length, 20);
    assert.equal(result.series[0].values[0], 14);
    assert.equal(result.series[0].values[1], 12);
    assert.equal(result.series[0].coverage[1].reportedDays, 6);
    assert.equal(result.series[0].coverage[1].expectedDays, 7);
    assert.equal(result.series[0].values[2], null);
    assert.equal(result.series[0].values[3], 0);
    assert.match(result.note, /Weekly totals/);
    factory.renderCartesian(container, dates, [{ key: 'us', label: 'United States', values }], 'bar',
        { title: 'New confirmed cases — United States', column: 'new_confirmed', metric: { kind: 'daily' }, smoothing: 'raw' });
    assert.equal(container.querySelectorAll('.missing-bar-marker').length, 1);
    assert.equal(container.querySelectorAll('.reported-zero-marker').length, 1);
    const partial = container.querySelector('.incomplete-bar');
    assert.equal(partial.__data__.value, 12);
    assert.match(partial.getAttribute('fill'), /^url\(#partial-week-/);
    partial.dispatchEvent(new window.FocusEvent('focus'));
    assert.match(container.querySelector('.chart-tooltip').textContent, /12 Cases.*Partial weekly total.*Reported days: 6 of 7/);
    container.querySelector('.missing-bar-marker').dispatchEvent(new window.FocusEvent('focus'));
    assert.match(container.querySelector('.chart-tooltip').textContent, /No observations in this week.*Reported days: 0 of 7/);
    assert.match(container.querySelector('.chart-subtitle').textContent, /Weekly totals.*2020/);
    assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
});

test('edge weeks retain observed values while disclosing the selected fraction of a week', t => {
    const { factory, container, window } = harness(t);
    const dates = Array.from({ length: 140 }, (_, index) => new Date(Date.UTC(2020, 0, 8 + index)).toISOString().slice(0, 10));
    const values = dates.map(() => 2);
    const result = factory.aggregateBars(dates, [{ key: 'us', values }], { kind: 'daily' }, 'raw');
    assert.equal(result.series[0].values[0], 10);
    assert.equal(result.series[0].coverage[0].selectedDays, 5);
    assert.equal(result.series[0].values.at(-1), 4);
    factory.renderCartesian(container, dates, [{ key: 'us', label: 'United States', values }], 'bar',
        { metric: { kind: 'daily' }, column: 'new_confirmed', smoothing: 'raw' });
    assert.equal(container.querySelectorAll('.incomplete-bar').length, 2);
    container.querySelector('.incomplete-bar').dispatchEvent(new window.FocusEvent('focus'));
    assert.match(container.querySelector('.chart-tooltip').textContent, /Partial weekly total.*Reported days: 5 of 5 selected days \(7-day calendar week\).*Selected period includes 5 of 7 days/);
    assert.ok(container.querySelector('.chart-subtitle').textContent.includes(factory.periodLabel(dates)));
});

test('weekly averages disclose raw reporting separately from available averages', t => {
    const { factory, container, window } = harness(t);
    const dates = Array.from({ length: 140 }, (_, index) => new Date(Date.UTC(2020, 0, 6 + index)).toISOString().slice(0, 10));
    const values = dates.map(() => 2); values.fill(null, 0, 7); values[8] = null;
    const series = [{ key: 'us', label: 'United States', values, reported: dates.map(() => true) }];
    const result = factory.aggregateBars(dates, series, { kind: 'daily' }, '7day');
    assert.equal(result.series[0].values[0], null);
    assert.equal(result.series[0].coverage[0].reportedDays, 7);
    assert.equal(result.series[0].values[1], 2);
    assert.equal(result.series[0].coverage[1].displayedDays, 6);
    factory.renderCartesian(container, dates, series, 'bar', { metric: { kind: 'daily', smoothingAllowed: true }, smoothing: '7day' });
    container.querySelector('.missing-bar-marker').dispatchEvent(new window.FocusEvent('focus'));
    assert.match(container.querySelector('.chart-tooltip').textContent, /No available daily averages.*Reported days: 7 of 7.*Available daily averages: 0 of 7/);
    container.querySelector('.incomplete-bar').dispatchEvent(new window.FocusEvent('focus'));
    assert.match(container.querySelector('.chart-tooltip').textContent, /Partial weekly mean.*Available daily averages: 6 of 7/);
    assert.match(container.querySelector('.chart-subtitle').textContent, /Weekly means.*7-day average/);
});

test('weekly cumulative snapshots never carry earlier reports across a missing end date', t => {
    const { factory } = harness(t);
    const dates = Array.from({ length: 140 }, (_, index) => new Date(Date.UTC(2020, 0, 6 + index)).toISOString().slice(0, 10));
    const values = dates.map((_, index) => index); values[6] = null;
    const result = factory.aggregateBars(dates, [{ key: 'us', values }], { kind: 'cumulative' }, 'raw');
    assert.equal(result.series[0].values[0], null);
    assert.equal(result.series[0].values[1], 13);
    assert.match(result.series[0].missingReasons[0], /last selected day/);
    assert.match(result.note, /not carried forward/);
});

test('occupancy weekly bars average daily snapshots and identify partial, missing and zero weeks', t => {
    const { factory, container, window } = harness(t);
    const dates = Array.from({ length: 140 }, (_, index) => new Date(Date.UTC(2020, 0, 6 + index)).toISOString().slice(0, 10));
    const values = dates.map(() => 10); values[0] = 0; values[2] = null;
    values.fill(null, 14, 21); values.fill(0, 21, 28);
    const series = [{ key: 'us', label: 'United States', values }];
    const metric = { column: 'current_hospitalized_patients', kind: 'occupancy', smoothingAllowed: true };
    const result = factory.aggregateBars(dates, series, metric, 'raw');
    assert.ok(Math.abs(result.series[0].values[0] - 50 / 6) < 1e-10, 'Weekly occupancy is a mean, not the sum of patients across days');
    assert.equal(result.series[0].values[2], null);
    assert.equal(result.series[0].values[3], 0);
    assert.equal(result.aggregation, 'Weekly mean occupancy');
    assert.match(result.note, /reported daily patient snapshots; patients are never summed across days/);
    factory.renderCartesian(container, dates, series, 'bar', { column: metric.column, metric, smoothing: 'raw' });
    assert.match(container.querySelector('.chart-subtitle').textContent, /Weekly mean occupancy.*reported daily patient snapshots/);
    assert.equal(container.querySelector('.axis-unit-label').textContent, 'Patients');
    container.querySelector('.incomplete-bar').dispatchEvent(new window.FocusEvent('focus'));
    assert.match(container.querySelector('.chart-tooltip').textContent, /Partial weekly mean of available daily patient snapshots.*Reported days: 6 of 7/);
    assert.equal(container.querySelectorAll('.missing-bar-marker').length, 1);
    assert.equal(container.querySelectorAll('.reported-zero-marker').length, 1);
    assert.doesNotMatch(container.querySelector('.chart-subtitle').textContent, /total|admission|7-day average/);
});

test('smoothed occupancy weekly bars disclose means of trailing averages rather than admissions or snapshots', t => {
    const { factory, container, window } = harness(t);
    const dates = Array.from({ length: 140 }, (_, index) => new Date(Date.UTC(2020, 0, 6 + index)).toISOString().slice(0, 10));
    const values = dates.map(() => 10); values.fill(null, 0, 7); values[8] = null;
    const series = [{ key: 'us', label: 'United States', values, reported: dates.map(() => true) }];
    const metric = { column: 'current_hospitalized_patients', kind: 'occupancy', smoothingAllowed: true };
    const result = factory.aggregateBars(dates, series, metric, '7day');
    assert.equal(result.series[0].values[0], null);
    assert.equal(result.series[0].values[1], 10);
    assert.equal(result.series[0].coverage[1].reportedDays, 7);
    assert.equal(result.series[0].coverage[1].displayedDays, 6);
    assert.match(result.note, /mean of available trailing 7-day occupancy averages; patients are never summed across days/);
    factory.renderCartesian(container, dates, series, 'bar', { column: metric.column, metric, smoothing: '7day' });
    assert.match(container.querySelector('.chart-subtitle').textContent, /Weekly mean occupancy.*7-day average of daily patient snapshots/);
    container.querySelector('.incomplete-bar').dispatchEvent(new window.FocusEvent('focus'));
    assert.match(container.querySelector('.chart-tooltip').textContent, /Partial weekly mean of available 7-day occupancy averages.*Reported days: 7 of 7.*Available daily averages: 6 of 7/);
    container.querySelector('.missing-bar-marker').dispatchEvent(new window.FocusEvent('focus'));
    assert.match(container.querySelector('.chart-tooltip').textContent, /No available daily averages.*Reported days: 7 of 7.*Available daily averages: 0 of 7/);
    assert.doesNotMatch(container.querySelector('.chart-subtitle').textContent, /admission|weekly totals|weekly snapshots/i);
});

test('hospital analysis labels real occupancy averages separately from admissions and unsmoothed cumulative totals', async t => {
    const { factory, container, window } = harness(t);
    const service = new DataService();
    service.countryIndex = [{ location_key: 'US', country_name: 'United States' }];
    service.epidemData = [{ location_key: 'US', date: '2020-01-01', new_confirmed: 0 }];
    service.vaccinationsData = [{ location_key: 'US', date: '2020-01-01', cumulative_persons_vaccinated: 0 }];
    service.hospitalizationsData = [0, 14, null, 28, 35, null, 7, 14, 0].map((value, index) => ({
        location_key: 'US', date: `2020-01-${String(index + 1).padStart(2, '0')}`,
        current_hospitalized_patients: value, new_hospitalized_patients: (index + 1) * 2,
        cumulative_hospitalized_patients: (index + 1) * 10
    }));
    service.validateDataStructure(); service.buildCountryCodeMap(); service.processData(); service.setDefaultValues();
    await service.indexAllData();
    service.changeDataset('hospitalizations');
    window.globeInstance.dataService = service;
    for (const [column, smoothing, expected, label] of [
        ['current_hospitalized_patients', 'raw', 7, 'Reported daily patient snapshots'],
        ['current_hospitalized_patients', '7day', 16.8, '7-day average of daily patient snapshots'],
        ['new_hospitalized_patients', '7day', 8, '7-day average of reported daily values'],
        ['cumulative_hospitalized_patients', '7day', 70, 'Reported cumulative values']
    ]) {
        service.changeColumn(column); service.smoothing = smoothing;
        factory.createChart(container, 'us', 'line', {});
        assert.equal(container.querySelector('.data-line').__data__.find(point => point.date === '2020-01-07').value, expected);
        assert.ok(container.querySelector('.chart-subtitle').textContent.includes(label));
        assert.equal(container.querySelector('.axis-unit-label').textContent, 'Patients');
        if (column.startsWith('cumulative_')) {
            assert.equal(factory.prepareDataForCountry('us').smoothing, 'raw');
            assert.doesNotMatch(container.querySelector('.chart-subtitle').textContent, /7-day average/);
        }
    }
    assert.equal(service.indexedData.hospitalizations.us['2020-01-07'].current_hospitalized_patients, 7);
});

test('combined charts keep common dates, exact metrics and stable country colors after reorder', t => {
    const { comparison, factory, container } = harness(t);
    comparison.createCombinedChart(container, ['us', 'fr'], 'bar', { dateRange: { start: 0, end: 0 }, selectedColumn: 'new_confirmed' });
    assert.equal(container.querySelectorAll('.data-bar').length, 1);
    assert.equal(container.querySelector('.data-bar').__data__.date, '2020-01-01');
    comparison.createCombinedChart(container, ['us', 'fr'], 'line');
    const colors = Object.fromEntries([...container.querySelectorAll('.data-line')].map(line => [line.__data__[0].value, line.getAttribute('stroke')]));
    const usColor = factory.countryColor('us'), frColor = factory.countryColor('fr');
    assert.notEqual(usColor, frColor);
    comparison.createCombinedChart(container, ['fr', 'us'], 'line');
    assert.equal(factory.countryColor('us'), usColor); assert.equal(factory.countryColor('fr'), frColor);
    assert.equal(container.querySelector('.data-line').getAttribute('stroke'), frColor);
    assert.equal(Object.keys(colors).length, 2);
    assert.match(container.querySelector('.chart-heading-title').textContent, /New confirmed cases.*France.*<img/);
    assert.equal(container.querySelector('.chart-heading-title img'), null);
    assert.equal(container.querySelectorAll('.chart-legend .legend-item').length, 2);
});

test('four comparison colors are independent of previous country browsing', t => {
    const { factory } = harness(t);
    for (let index = 0; index < 30; index++) factory.countryColor(`previous-${index}`);
    for (const code of ['us', 'fr', 'de', 'ca']) factory.countryColor(code);
    factory.reconcileComparisonCountries(['us', 'fr', 'de', 'ca']);
    const styles = codes => Object.fromEntries(codes.map(code => [code, factory.countryColor(code)]));
    const original = styles(['us', 'fr', 'de', 'ca']);
    assert.deepEqual(Object.values(original), ['#59b5ff', '#ffb23f', '#ef73cb', '#79d17d']);
    factory.reconcileComparisonCountries(['ca', 'fr', 'us', 'de']);
    assert.deepEqual(styles(['us', 'fr', 'de', 'ca']), original);
    factory.reconcileComparisonCountries(['ca', 'us', 'de']);
    factory.reconcileComparisonCountries(['ca', 'us', 'de', 'tn']);
    for (const code of ['us', 'de', 'ca']) assert.deepEqual(styles([code])[code], original[code]);
    assert.deepEqual(styles(['tn']).tn, original.fr, 'A replacement reuses only the vacated slot');
    assert.equal(factory.countryColor('US'), original.us, 'Analysis shares the comparison identity');
});

test('four-country charts keep continuous lines and matching color legends across themes and display modes', t => {
    const { context, window, document, factory, service } = harness(t, { fullUI: true });
    service.indexedData.epidem.de = service.indexedData.epidem.us;
    service.indexedData.epidem.ca = service.indexedData.epidem.fr;
    const palettes = {
        dark: ['#59b5ff', '#ffb23f', '#ef73cb', '#79d17d'],
        light: ['#1765ab', '#9a5800', '#a23883', '#28723c']
    };
    let theme = 'dark';
    window.AtlasTheme = { getSeriesColor: index => palettes[theme][index], getColor: () => '' };
    context.appendCountryLabel = (container, _code, name) => container.appendChild(document.createTextNode(name));
    for (const file of ['ui/compare.js', 'ui/compareUI.js'])
        vm.runInContext(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), context, { filename: file });
    for (let index = 0; index < 30; index++) factory.countryColor(`previous-${index}`);
    Object.assign(window.CompareMode.state, { active: true, countries: ['us', 'fr', 'de', 'ca'] });
    window.CompareUI.updateCountryList();
    for (const appearance of ['dark', 'light', 'dark']) {
        theme = appearance; window.CompareUI.updateCountryColors();
        for (const displayMode of ['combined', 'separate']) {
            window.CompareMode.state.displayMode = displayMode; window.CompareMode.updateComparisonView();
            const lines = [...document.querySelectorAll('#compareChartContainer .data-line')];
            assert.deepEqual(lines.map(line => line.getAttribute('stroke')), palettes[theme]);
            assert.deepEqual(lines.map(line => line.getAttribute('stroke-dasharray')), [null, null, null, null]);
            if (displayMode === 'combined') {
                const legendLines = [...document.querySelectorAll('.chart-legend .legend-line line')];
                assert.deepEqual(legendLines.map(line => line.getAttribute('stroke')), palettes[theme]);
                assert.deepEqual(legendLines.map(line => line.getAttribute('stroke-dasharray')), lines.map(line => line.getAttribute('stroke-dasharray')));
            }
            assert.deepEqual([...document.querySelectorAll('#headerCountriesList .country-color')].map(node => node.style.backgroundColor), palettes[theme].map(color => d3.color(color).formatRgb()));
        }
        const analysis = document.createElement('div');
        factory.createChart(analysis, 'de', 'line', {});
        assert.equal(analysis.querySelector('.data-line').getAttribute('stroke'), palettes[theme][2]);
        assert.equal(analysis.querySelector('.data-line').getAttribute('stroke-dasharray'), null);
    }
});

test('appearance updates redraw visible analysis once and preserve source observations and country identity', t => {
    const { context, window, document, factory, container, service } = harness(t);
    let theme = 'dark';
    window.AtlasTheme = {
        getSeriesColor: index => (theme === 'dark' ? ['#70b7ff', '#f5b85e'] : ['#1464ad', '#875300'])[index],
        getColor: token => token === '--chart-surface' ? theme === 'dark' ? '#1b293d' : '#ffffff' : ''
    };
    window.globeInstance.selectedCountryCode = 'us';
    const observations = service.indexedData.epidem.us;
    factory.createChart(container, 'us', 'line', {});
    assert.equal(container.querySelector('.data-line').getAttribute('stroke'), '#70b7ff');
    const frames = [];
    context.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
    vm.runInContext(readFileSync(new URL('../src/ui/visualizations.js', import.meta.url), 'utf8'), context);
    theme = 'light';
    document.dispatchEvent(new window.CustomEvent('atlas:themechange', { detail: { theme } }));
    document.dispatchEvent(new window.CustomEvent('atlas:themechange', { detail: { theme } }));
    window.dispatchEvent(new window.Event('resize'));
    assert.equal(frames.length, 1);
    frames.shift()();
    assert.equal(container.querySelector('.data-line').getAttribute('stroke'), '#1464ad');
    assert.equal(factory.countryColor('US'), '#1464ad');
    assert.equal(factory.countryColor('fr'), '#875300');
    assert.equal(service.indexedData.epidem.us, observations);
    assert.deepEqual(Array.from(container.querySelector('.data-line').__data__, point => point.value), [5, 5, -2]);
    container.querySelector('.chart-hit-area').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    assert.equal(container.querySelector('.cursor-points circle').getAttribute('stroke'), '#ffffff');
    assert.equal(container.querySelector('.cursor-points circle').getAttribute('fill'), '#1464ad');
});

test('appearance updates recolor comparison charts and existing country chips without changing selections', t => {
    const { context, window, document, factory } = harness(t, { fullUI: true });
    let theme = 'dark';
    window.AtlasTheme = { getSeriesColor: index => (theme === 'dark' ? ['#70b7ff', '#f5b85e'] : ['#1464ad', '#875300'])[index], getColor: () => '' };
    context.appendCountryLabel = (container, _code, name) => container.appendChild(document.createTextNode(name));
    for (const file of ['ui/compare.js', 'ui/compareUI.js', 'ui/visualizations.js'])
        vm.runInContext(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), context, { filename: file });
    Object.assign(window.CompareMode.state, { active: true, countries: ['us', 'fr'], dateRange: { start: 50, end: 100 } });
    window.CompareUI.updateCountryList(); window.CompareMode.updateComparisonView();
    const chip = document.querySelector('#headerCountriesList .header-country-item');
    const frames = [];
    context.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
    theme = 'light';
    document.dispatchEvent(new window.CustomEvent('atlas:themechange'));
    frames.shift()();
    assert.equal(document.querySelector('#headerCountriesList .header-country-item'), chip);
    assert.equal(chip.querySelector('.country-color').style.backgroundColor, 'rgb(20, 100, 173)');
    assert.deepEqual([...document.querySelectorAll('#compareChartContainer .data-line')].map(line => line.getAttribute('stroke')), ['#1464ad', '#875300']);
    assert.deepEqual(Array.from(window.CompareMode.state.countries), ['us', 'fr']);
    assert.equal(window.CompareMode.state.dateRange.start, 50);
    assert.equal(window.CompareMode.state.dateRange.end, 100);
    assert.equal(factory.countryColor('us'), '#1464ad');
});

test('chart headings identify the selected metric, actual period, smoothing and semantic units', t => {
    const { factory, container } = harness(t);
    factory.createChart(container, 'us', 'line', { dateRange: { start: 50, end: 100 }, smoothing: '7day' });
    assert.match(container.querySelector('.chart-heading-title').textContent, /New confirmed cases/);
    const subtitle = container.querySelector('.chart-subtitle').textContent;
    assert.match(subtitle, /7-day average/);
    assert.ok(subtitle.includes(factory.periodLabel(['2020-01-02', '2020-01-03'])));
    assert.equal(container.querySelector('.axis-unit-label').textContent, 'Cases');
    assert.equal(container.querySelector('.chart-legend'), null);
    assert.equal(factory.axisUnitLabel('new_persons_vaccinated'), 'People');
    assert.equal(factory.axisUnitLabel('current_hospitalized_patients'), 'Patients');
    assert.equal(factory.axisUnitLabel('new_deceased'), 'Deaths');
    assert.equal(factory.axisUnitLabel('new_vaccine_doses_administered'), 'Doses');
    assert.equal(factory.axisUnitLabel('new_confirmed', 'per100k'), 'Cases per 100,000 people');
    assert.equal(factory.axisUnitLabel('cumulative_deceased', 'per1m'), 'Deaths per 1,000,000 people');
});

async function deathsFixture() {
    const service = new DataService();
    service.countryIndex = [{ location_key: 'US', country_name: 'United States' }, { location_key: 'FR', country_name: 'France' }];
    service.demographicsData = [{ location_key: 'US', population: 100_000_000 }, { location_key: 'FR', population: 50_000_000 }];
    service.epidemData = [1_000_000, 1_500_000, 2_000_000].flatMap((value, index) => [
        { location_key: 'US', date: `2020-01-0${index + 1}`, cumulative_deceased: value },
        { location_key: 'FR', date: `2020-01-0${index + 1}`, cumulative_deceased: value / 4 }
    ]);
    service.hospitalizationsData = [{ location_key: 'US', date: '2020-01-01', current_hospitalized_patients: 10 }];
    service.vaccinationsData = [{ location_key: 'US', date: '2020-01-01', cumulative_persons_vaccinated: 100 }];
    service.validateDataStructure(); service.buildCountryCodeMap(); service.processData(); service.setDefaultValues();
    await service.indexAllData();
    service.currentColumn = 'cumulative_deceased';
    return service;
}

for (const view of ['analysis', 'combined', 'separate']) test(`${view} charts recalculate observations, domain and compact ticks when population units change`, async t => {
    const { context, window, document, factory, comparison } = harness(t, { fullUI: view === 'separate' });
    const service = await deathsFixture();
    window.globeInstance.dataService = service;
    if (view === 'separate') {
        context.appendCountryLabel = (container, _code, name) => { container.textContent = name; };
        for (const file of ['ui/compare.js', 'ui/compareUI.js'])
            vm.runInContext(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), context, { filename: file });
        Object.assign(window.CompareMode.state, { active: true, countries: ['us', 'fr'], displayMode: 'separate', scale: 'shared' });
    }
    for (const [unit, expected, label, compact] of [
        ['count', 2_000_000, 'Deaths', '2.00M'], ['per100k', 2_000, 'Deaths per 100,000 people', '2.0k'],
        ['per1m', 20_000, 'Deaths per 1,000,000 people', '20.0k'], ['count', 2_000_000, 'Deaths', '2.00M']
    ]) {
        service.displayUnit = unit;
        const container = document.getElementById(view === 'separate' ? 'compareChartContainer' : 'chartContainer');
        if (view === 'analysis') factory.createChart(container, 'us', 'line', {});
        else if (view === 'combined') comparison.createCombinedChart(container, ['us', 'fr'], 'line');
        else window.CompareMode.updateComparisonView();
        const charts = view === 'separate' ? [...container.querySelectorAll('.chart-div')] : [container];
        assert.equal(charts.length, view === 'separate' ? 2 : 1);
        assert.equal(charts[0].querySelector('.data-line').__data__.at(-1).value, expected);
        const ticks = [...charts[0].querySelectorAll('.y-axis .tick')];
        assert.ok(Math.max(...ticks.map(tick => tick.__data__)) >= expected, `${unit}: axis covers the transformed value`);
        assert.ok(Math.max(...ticks.map(tick => tick.__data__)) < expected * 1.5, `${unit}: axis does not retain the previous unit domain`);
        assert.ok(ticks.every(tick => tick.textContent === factory.formatValue(tick.__data__)), 'All units retain compact tick notation');
        assert.ok(ticks.some(tick => tick.textContent === compact), `${unit}: the axis displays ${compact}`);
        for (const chart of charts) assert.equal(chart.querySelector('.axis-unit-label').textContent, label);
        if (view === 'separate') assert.deepEqual(
            [...charts[0].querySelectorAll('.y-axis .tick')].map(tick => tick.__data__),
            [...charts[1].querySelectorAll('.y-axis .tick')].map(tick => tick.__data__), 'Separate charts share the newly transformed scale');
        charts[0].querySelector('.chart-hit-area').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        assert.ok(charts[0].querySelector('.chart-tooltip').textContent.includes(compact));
        assert.ok(charts[0].querySelector('.chart-tooltip').textContent.includes(label));
        assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
    }
});

test('large shared-scale differences and isolated raw peaks receive factual guidance', t => {
    const { factory, container } = harness(t);
    const dates = Array.from({ length: 35 }, (_, index) => new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10));
    const values = dates.map(() => 1); values[15] = 1000;
    const series = [{ key: 'us', label: 'United States', values }, { key: 'fr', label: 'France', values: dates.map(() => 2) }];
    factory.renderCartesian(container, dates, series, 'line', { column: 'new_confirmed', unit: 'count', metric: { kind: 'daily' }, smoothing: 'raw' });
    const warnings = [...container.querySelectorAll('.chart-warning')].map(note => note.textContent);
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /shared scale.*population-adjusted.*independent scales/);
    assert.match(warnings[1], /isolated peaks.*does not identify their cause.*7-day average/);
    assert.equal(factory.comparisonWarnings([{ values: [1, 2] }, { values: [3, null] }], 'count').length, 0);
    assert.equal(factory.comparisonWarnings([{ values: [0, 0] }, { values: [300, null] }], 'count').length, 0);
    assert.doesNotMatch(factory.comparisonWarnings(series, 'per100k')[0], /population-adjusted/);
    const zeroBaseline = dates.map(() => 0); zeroBaseline[15] = 1000;
    assert.equal(factory.hasIsolatedPeaks([{ values: zeroBaseline }]), true);
    factory.renderCartesian(container, dates, [series[0]], 'line', { metric: { kind: 'daily' }, smoothing: '7day' });
    assert.equal(container.querySelector('.chart-warning'), null);
});

test('a single-day line view remains finite and unsupported charts explain valid choices', t => {
    const { factory, container } = harness(t);
    factory.createChart(container, 'us', 'line', { dateRange: { start: 100, end: 100 } });
    assert.ok(container.querySelectorAll('.data-point').length > 0);
    assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
    factory.createChart(container, 'us', 'pie', {});
    assert.match(container.querySelector('.chart-error').textContent, /supported chart type/);
});

test('area charts preserve signed observations and calendar gaps with a zero baseline', t => {
    const { factory, container, service } = harness(t);
    service.indexedData.epidem.us['2020-01-02'].new_confirmed = null;
    factory.createChart(container, 'us', 'area', { dateRange: { start: 0, end: 100 } });
    const fill = container.querySelector('.data-area');
    assert.ok(fill);
    assert.equal(fill.getAttribute('fill-opacity'), '0.16');
    assert.equal((fill.getAttribute('d').match(/M/g) || []).length, 2, 'missing days split the filled shape');
    assert.equal(container.querySelectorAll('.data-point').length, 2);
    assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
});

test('country line and area charts reveal observation values on hover and initial keyboard focus', t => {
    const { factory, container, window } = harness(t);
    const dates = ['2020-01-01', '2020-01-02', '2020-01-03', '2020-01-04'];
    for (const type of ['line', 'area']) {
        factory.renderCartesian(container, dates, [{ key: 'us', label: 'United States', values: [5, 0, null, -2] }], type,
            { column: 'new_confirmed', title: 'New confirmed cases — United States' });
        const inspector = container.querySelector('.chart-hit-area');
        assert.ok(inspector, `${type} has a dated observation inspector`);
        inspector.dispatchEvent(new window.MouseEvent('pointermove', { clientX: 0, clientY: 50 }));
        assert.match(container.querySelector('.chart-tooltip').textContent, /2020-01-01.*United States: 5.*Cases/);
        inspector.dispatchEvent(new window.MouseEvent('pointerleave'));
        assert.equal(container.querySelector('.chart-tooltip'), null);
        inspector.focus();
        assert.match(container.querySelector('.chart-tooltip').textContent, /2020-01-01.*United States: 5.*Cases/,
            'Tab focus reveals the current date immediately');
        for (const [key, value] of [['ArrowRight', '0'], ['ArrowRight', 'No observation'], ['End', '-2']]) {
            inspector.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
            assert.ok(container.querySelector('.chart-tooltip').textContent.includes(`United States: ${value}`));
            assert.ok(inspector.getAttribute('aria-valuetext').includes(`United States: ${value}`));
        }
        assert.equal(container.querySelectorAll('.cursor-points circle').length, 1);
        inspector.blur();
        assert.equal(container.querySelector('.chart-tooltip'), null);
        assert.equal(container.querySelector('.chart-crosshair').getAttribute('visibility'), 'hidden');
    }
});

test('line and area paths use smooth continuous segments without joining unavailable reports', t => {
    const { factory, container } = harness(t);
    const dates = Array.from({ length: 9 }, (_, index) => `2020-01-${String(index + 1).padStart(2, '0')}`);
    const values = [0, 2, 1, 3, null, -1, 2, 0, 4];
    for (const type of ['line', 'area']) {
        factory.renderCartesian(container, dates, [{ key: 'fr', label: 'France', values }], type, { column: 'new_confirmed' });
        const line = container.querySelector('.data-line'), path = line.getAttribute('d');
        assert.match(path, /C/, 'Consecutive reports use shape-preserving curves');
        assert.equal((path.match(/M/g) || []).length, 2, 'A missing report still splits the path');
        assert.equal(line.getAttribute('stroke-dasharray'), null, 'Every country has a continuous stroke');
        assert.deepEqual(Array.from(line.__data__, point => point.value), values, 'Drawing does not alter observations');
        assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
    }
});

test('tiny population rates remain distinguishable from zero without changing compact counts', t => {
    const { factory } = harness(t);
    for (const value of [0.004, -0.004, 0.00001, -0.00001]) {
        const formatted = factory.formatValue(value);
        assert.equal(formatted, value.toLocaleString(undefined, { maximumFractionDigits: 8 }));
        assert.notEqual(formatted, '0');
        assert.notEqual(formatted, '-0');
    }
    assert.equal(factory.formatValue(0), '0');
    assert.equal(factory.formatValue(2000), '2.0k');
    assert.equal(factory.formatValue(2_000_000), '2.00M');
});

test('daily bars expose one focus target per report and do not claim weekly aggregation', t => {
    const { factory, container } = harness(t);
    factory.renderCartesian(container, ['2020-01-01', '2020-01-02', '2020-01-03'],
        [{ key: 'us', label: 'United States', values: [0, null, -2] }], 'bar', { column: 'new_confirmed', metric: { kind: 'daily' } });
    assert.equal(container.querySelectorAll('.data-bar').length, 1);
    assert.equal(container.querySelectorAll('.reported-zero-marker').length, 1);
    assert.equal(container.querySelectorAll('.missing-bar-marker').length, 1);
    assert.equal(container.querySelectorAll('svg [tabindex="0"]').length, 3);
    assert.doesNotMatch(container.querySelector('svg').getAttribute('aria-label'), /week|hatch/i);
    assert.match(container.querySelector('svg desc').textContent, /Hollow diamonds.*reported zeros/);
});

test('isolated observations remain visible in long line histories', t => {
    const { factory, container } = harness(t);
    const dates = Array.from({ length: 50 }, (_, index) => new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10));
    const values = dates.map(() => null); values[20] = 0; values[35] = -3;
    factory.renderCartesian(container, dates, [{ key: 'us', label: 'United States', values }], 'line', { column: 'new_confirmed' });
    assert.deepEqual([...container.querySelectorAll('.data-point')].map(point => point.__data__.value), [0, -3]);
    assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
});

test('date ticks identify distinct calendar dates in daily and weekly charts', t => {
    const { factory, container } = harness(t);
    for (const length of [1, 80, 140]) for (const type of ['line', 'bar']) {
        const dates = Array.from({ length }, (_, index) => new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10));
        factory.renderCartesian(container, dates, [{ key: 'us', label: 'United States', values: dates.map(() => 1) }], type,
            { column: 'new_confirmed', metric: { kind: 'daily' } });
        const labels = [...container.querySelectorAll('.x-axis .tick text')].map(node => node.textContent);
        assert.ok(labels.length > 0);
        assert.equal(new Set(labels).size, labels.length, `${length}-day ${type} ticks must not repeat month-only labels`);
        if (length === 1) assert.equal(labels.length, 1);
    }
});

test('keyboard inspection positions tooltips relative to the visible chart', t => {
    const { factory, container, window } = harness(t);
    Object.defineProperty(container, 'clientWidth', { value: 720 });
    container.getBoundingClientRect = () => ({ left: 200, top: 300, width: 720, height: 450 });
    factory.createChart(container, 'us', 'line', {});
    container.querySelector('svg').getBoundingClientRect = () => ({ left: 200, top: 350, width: 720, height: 390 });
    container.querySelector('.chart-hit-area').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    const tooltip = container.querySelector('.chart-tooltip');
    assert.equal(tooltip.style.left, '712px');
    assert.equal(tooltip.style.top, '138px');
    assert.match(tooltip.textContent, /2020-01-03/);
});

test('comparison preparation treats uppercase and lowercase country codes as one selection', t => {
    const { comparison, container } = harness(t);
    comparison.createCombinedChart(container, ['US', 'us', 'FR'], 'line');
    assert.equal(container.querySelectorAll('.data-line').length, 2);
    assert.equal(container.querySelectorAll('.chart-legend .legend-item').length, 2);
});
