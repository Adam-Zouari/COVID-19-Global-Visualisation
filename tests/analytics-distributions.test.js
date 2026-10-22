import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import * as d3 from 'd3';

function harness(t, width = 700) {
    const dom = new JSDOM('<div id="chart"></div>', { runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    const context = dom.getInternalVMContext();
    context.d3 = d3;
    for (const file of ['charts/chartFactory.js', 'charts/analyticsRendering.js', 'charts/analyticsDistributions.js'])
        vm.runInContext(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), context, { filename: file });
    const container = dom.window.document.getElementById('chart');
    container.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width, height: 500, right: width, bottom: 500 });
    return { window: dom.window, container, renderers: dom.window.AnalyticsRenderers };
}

test('box plots show observed quartiles and Tukey whiskers, group repeated outliers, and explain empty samples', t => {
    const { container, renderers } = harness(t, 320);
    const model = { title: 'Reported distribution', unitLabel: 'Cases', groups: [
        { code: 'tn', label: 'Tunisia', values: [100, 2, 1, 0, 8, 3, 5, 4, 6, 7, 100] },
        { code: 'fr', label: 'France', values: [0, 0, 0] },
        { code: 'sg', label: 'Singapore', values: [] }
    ] };
    const original = JSON.stringify(model);
    renderers.box(container, model);
    const marks = [...container.querySelectorAll('.box-mark')];
    assert.equal(marks.length, 2);
    assert.deepEqual([marks[0].__data__.q1, marks[0].__data__.median, marks[0].__data__.q3, marks[0].__data__.low, marks[0].__data__.high], [2.5, 5, 7.5, 0, 8]);
    marks[0].focus();
    assert.match(container.querySelector('.chart-tooltip').textContent, /Reported observations: 11.*Minimum: 0.*Maximum: 100 Cases.*Q1: 2.5.*Median: 5.*Q3: 7.5.*Interquartile range: 5.*Whiskers: 0 to 8/);
    const outliers = [...container.querySelectorAll('.box-outlier')];
    assert.equal(outliers.length, 1);
    outliers[0].focus();
    assert.match(container.querySelector('.chart-tooltip').textContent, /Observed outlier: 100 Cases.*2 reported observations/);
    assert.match(container.textContent, /No reported observations/);
    assert.ok(marks[1].querySelector('circle'), 'A constant zero sample remains visible');
    assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
    assert.equal(JSON.stringify(model), original);
});

test('box statistics appear on hover or focus with full values instead of separate panels', t => {
    const { container, window, renderers } = harness(t, 320);
    const observations = [
        { date: '2020-01-04', value: 2_000_000 },
        { date: '2020-01-01', value: -2 },
        { date: '2020-01-03', value: 0 },
        { date: '2020-01-02', value: 0 }
    ];
    const model = { title: 'Cases', unitLabel: 'Cases', groups: [
        { code: 'tn', label: '<script>unsafe</script>', values: observations.map(point => point.value), observations }
    ] };
    const original = JSON.stringify(model);
    renderers.box(container, model);
    assert.equal(container.querySelector('script'), null);
    assert.equal(container.querySelector('table, details, .box-statistics, .box-summary-note'), null);
    assert.equal(container.querySelector('.chart-tooltip'), null, 'Statistics stay hidden before inspection');
    const format = value => window.Number.prototype.toLocaleString.call(value, undefined, { maximumSignificantDigits: 15 });
    const mark = container.querySelector('.box-mark');
    const expected = [
        '<script>unsafe</script>', 'Reported observations: 4',
        `Minimum: ${format(-2)} · Maximum: ${format(2_000_000)} Cases`,
        `Q1: ${format(-0.5)} · Median: ${format(0)} · Q3: ${format(500_000)}`,
        `Mean: ${format(499_999.5)} · Interquartile range: ${format(500_000.5)}`,
        `Whiskers: ${format(-2)} to ${format(0)} (observed values within 1.5 × IQR)`
    ];
    mark.dispatchEvent(new window.MouseEvent('pointerenter', { clientX: 50, clientY: 50 }));
    assert.deepEqual([...container.querySelectorAll('.chart-tooltip > div')].map(line => line.textContent), expected);
    assert.equal(container.querySelector('script'), null, 'Labels remain plain text inside hover details');
    assert.doesNotMatch(container.querySelector('.chart-tooltip').textContent, /2M|2m|n=/);
    mark.dispatchEvent(new window.MouseEvent('pointerleave'));
    assert.equal(container.querySelector('.chart-tooltip'), null);
    mark.focus();
    assert.deepEqual([...container.querySelectorAll('.chart-tooltip > div')].map(line => line.textContent), expected);
    assert.equal(mark.getAttribute('aria-label'), expected.join('. '));
    mark.blur();
    assert.equal(container.querySelector('.chart-tooltip'), null);
    assert.equal(JSON.stringify(model), original);
});

test('empty and constant box plots remain finite and histogram is no longer registered', t => {
    const { container, renderers } = harness(t);
    assert.equal(renderers.histogram, undefined);
    renderers.box(container, { title: 'Empty sample', groups: [{ code: 'tn', label: 'Tunisia', values: [] }] });
    assert.match(container.textContent, /No reported observations/);
    for (const values of [[0, 0, 0], [7, 7, 7], [-2]]) {
        renderers.box(container, { title: 'Constant sample', groups: [{ code: 'tn', label: 'Tunisia', values }] });
        assert.ok(container.querySelector('.box-mark circle'));
        const mark = container.querySelector('.box-mark');
        mark.focus();
        assert.match(container.querySelector('.chart-tooltip').textContent, new RegExp(`Reported observations: ${values.length}.*Minimum: ${values[0]}.*Maximum: ${values[0]}.*Median: ${values[0]}.*Mean: ${values[0]}.*Interquartile range: 0`));
        assert.equal(container.querySelector('table, details'), null);
        assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
    }
});
