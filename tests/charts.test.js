import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import * as d3 from 'd3';

function harness(t) {
    const dom = new JSDOM('<!doctype html><div id="visualizationPanel"><div id="chartContainer"></div></div>', { runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    const context = dom.getInternalVMContext();
    context.d3 = d3; context.requestAnimationFrame = callback => { callback(); return 1; }; context.cancelAnimationFrame = () => {};
    const rows = {
        us: { '2020-01-01': { new_confirmed: 5, new_deceased: 0, new_tested: 2 }, '2020-01-02': { new_confirmed: 5, new_deceased: 0, new_tested: null }, '2020-01-03': { new_confirmed: -2, new_deceased: 0, new_tested: 3 } },
        fr: { '2020-01-02': { new_confirmed: 7, new_deceased: 0, new_tested: 3 }, '2020-01-03': { new_confirmed: 0, new_deceased: 0, new_tested: 4 } }
    };
    context.window.globeInstance = { dataService: {
        currentDataset: 'epidem', currentColumn: 'new_confirmed', displayUnit: 'count', smoothing: 'none',
        availableColumns: { epidem: ['new_confirmed', 'new_deceased', 'new_tested'] }, indexedData: { epidem: rows },
        availableDates: Object.keys(rows.us), formatDate: date => date, getCountryName: code => code === 'us' ? '<img src=x onerror=alert(1)>' : 'France',
        getMetricMetadata: column => ({ column, label: { new_confirmed: 'New confirmed cases', new_deceased: 'New deaths', new_tested: 'New tests' }[column], kind: 'daily', smoothingAllowed: true }),
        getUnitLabel: (_column, unit) => unit === 'per100k' ? 'Per 100,000 people' : 'Count'
    } };
    for (const file of ['charts/chartFactory.js', 'charts/chartControls.js', 'charts/compareCharts.js'])
        vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context, { filename: file });
    return { dom, window: dom.window, document: dom.window.document, factory: vm.runInContext('ChartFactory', context),
        controls: vm.runInContext('ChartControls', context), comparison: vm.runInContext('CompareCharts', context),
        service: context.window.globeInstance.dataService, container: dom.window.document.getElementById('chartContainer') };
}

test('preparation selects one shared metric and preserves zero, corrections and missing observations', t => {
    const { factory } = harness(t);
    const data = factory.prepareDataForCountry('US');
    assert.deepEqual(Array.from(data.columns), ['new_confirmed']);
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
    assert.match(container.textContent, /Count/);
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

test('filtering to metric coverage dates retains unreported calendar days inside the range', t => {
    const { factory } = harness(t);
    const data = factory.prepareDataForCountry('us', { selectedColumn: 'new_tested' });
    const filtered = factory.applySettings(data, { timeline: ['2020-01-01', '2020-01-03'] });
    assert.deepEqual(Array.from(filtered.dates), ['2020-01-01', '2020-01-02', '2020-01-03']);
    assert.equal(filtered.series.new_tested[1], null);
});

test('a reported day without enough averaging history explains the unavailable average', t => {
    const { factory, service, container, window } = harness(t);
    service.smoothing = '7day';
    service.getCountrySeries = () => [{ date: '2020-01-01', value: null, rawValue: 5, reported: true }, { date: '2020-01-02', value: null, rawValue: null, reported: false }];
    factory.createChart(container, 'us', 'line', {});
    container.querySelector('.chart-hit-area').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    assert.match(container.querySelector('.chart-tooltip').textContent, /Insufficient reported days for the 7-day average/);
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

test('long daily bar histories aggregate weekly without treating missing days as zero', t => {
    const { factory } = harness(t);
    const dates = Array.from({ length: 140 }, (_, index) => new Date(Date.UTC(2020, 0, 6 + index)).toISOString().slice(0, 10));
    const values = dates.map(() => 2); values[8] = null;
    const result = factory.aggregateBars(dates, [{ key: 'us', values }], { kind: 'daily' }, 'none');
    assert.equal(result.dates.length, 20);
    assert.equal(result.series[0].values[0], 14);
    assert.equal(result.series[0].values[1], null);
    assert.match(result.note, /Weekly totals/);
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
});

test('a single-day line view remains finite and unsupported charts explain valid choices', t => {
    const { factory, container } = harness(t);
    factory.createChart(container, 'us', 'line', { dateRange: { start: 100, end: 100 } });
    assert.ok(container.querySelectorAll('.data-point').length > 0);
    assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
    factory.createChart(container, 'us', 'pie', {});
    assert.match(container.querySelector('.chart-error').textContent, /line or bar/);
});
