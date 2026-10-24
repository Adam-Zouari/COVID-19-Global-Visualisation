import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import * as d3 from 'd3';

function harness(t, width = 700, theme = 'dark') {
    const dom = new JSDOM('<!doctype html><div id="chart"></div>', { runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    const { window } = dom, document = window.document, container = document.getElementById('chart');
    document.documentElement.dataset.theme = theme;
    Object.defineProperty(container, 'clientWidth', { value: width });
    container.getBoundingClientRect = () => ({ left: 10, top: 20, width, height: 400 });
    const palette = theme === 'light' ? ['#1765ab', '#9a5800', '#a23883', '#28723c'] : ['#59b5ff', '#ffb23f', '#ef73cb', '#79d17d'];
    window.AtlasTheme = {
        getSeriesColor: index => palette[index % palette.length],
        getColor: token => ({ '--heatmap-low': theme === 'light' ? '#dfedf8' : '#213c54', '--heatmap-missing': theme === 'light' ? '#dce6f1' : '#172437' })[token] || ''
    };
    const countries = [];
    window.globeInstance = { goToCountry: code => countries.push(code) };
    const context = dom.getInternalVMContext(); context.d3 = d3;
    for (const file of ['charts/chartFactory.js', 'charts/analyticsRendering.js', 'charts/analyticsComparisons.js'])
        vm.runInContext(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), context, { filename: file });
    return { window, document, container, countries, renderers: window.AnalyticsRenderers };
}

const common = { title: 'A comparison', subtitle: 'Reported values', unitLabel: 'Cases per 100,000 people', date: '2021-01-01' };

function assertDateLegend(container, dates) {
    const legend = container.querySelector('.scatter-date-legend');
    assert.ok(legend, 'Scatter plots explain their date colors with a continuous scale');
    assert.match(legend.textContent, /Date/);
    assert.match(legend.getAttribute('aria-label') || '', /Date/i);
    assert.deepEqual([...legend.querySelectorAll('time')].map(node => node.getAttribute('datetime')), dates);
    const bar = legend.querySelector('.scatter-date-bar');
    assert.ok(bar);
    const points = [...container.querySelectorAll('.scatter-point')];
    const pointColor = date => d3.color(points.find(point => point.__data__.date === date).getAttribute('fill')).formatHex();
    if (dates.length === 1) {
        assert.equal(bar.style.backgroundImage, '');
        assert.equal(d3.color(bar.style.backgroundColor).formatHex(), pointColor(dates[0]));
    } else {
        assert.match(bar.style.backgroundImage, /^linear-gradient\(/);
        const colors = (bar.style.backgroundImage.match(/rgba?\([^)]+\)|#[\da-f]{3,8}\b/gi) || []).map(color => d3.color(color).formatHex());
        assert.equal(colors[0], pointColor(dates[0]));
        assert.equal(colors.at(-1), pointColor(dates.at(-1)));
        const middle = points.find(point => Date.parse(point.__data__.date) === (Date.parse(dates[0]) + Date.parse(dates.at(-1))) / 2);
        if (middle) assert.equal(colors[Math.floor(colors.length / 2)], d3.color(middle.getAttribute('fill')).formatHex());
    }
    assert.equal(legend.querySelectorAll('i').length, 0, 'Date colors use a bar rather than disconnected swatches');
}

test('horizontal comparisons preserve corrections, zeros, missing reports and country colors without changing the globe', t => {
    const { window, container, countries, renderers } = harness(t, 320);
    const label = '<img src=x onerror=alert(1)> Long country name';
    renderers.horizontal(container, { ...common, items: [
        { code: 'us', label, value: -2 }, { code: 'fr', label: 'France', value: 0 },
        { code: 'tn', label: 'Tunisia', value: 0.004 }, { code: 'de', label: 'Germany', value: null }
    ] });
    const bars = [...container.querySelectorAll('.rank-bar')];
    assert.equal(bars.length, 2);
    assert.ok(bars.every(bar => Number(bar.getAttribute('width')) > 0));
    assert.equal(container.querySelectorAll('.rank-zero').length, 1);
    assert.equal(container.querySelectorAll('.rank-missing').length, 1);
    assert.ok([...container.querySelectorAll('.analytics-value-label')].some(node => node.textContent === (0.004).toLocaleString()));
    assert.ok([...container.querySelectorAll('.y-axis title')].some(node => node.textContent === label));
    assert.equal(container.querySelector('img'), null);
    const row = container.querySelector('.rank-item');
    row.focus();
    assert.match(container.querySelector('.chart-tooltip').textContent, /-2/);
    row.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    row.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.deepEqual(countries, []);
    assert.equal(row.getAttribute('role'), 'img');
    assert.notEqual(bars[0].getAttribute('fill'), bars[1].getAttribute('fill'));
    assert.match(row.getAttribute('aria-label'), /-2/);
    assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
});

test('heatmaps distinguish zero, correction, missing, partial and inactive cells with one keyboard entry point', t => {
    const { window, document, container, renderers } = harness(t, 320);
    renderers.heatmap(container, { ...common, columns: ['a', 'b', 'c', 'd', 'e'].map(key => ({ key, label: key })), rows: [
        { key: 'us', label: 'United States', cells: [
            { key: 'a', label: 'Zero week', value: 0, reportedDays: 7, expectedDays: 7 },
            { key: 'b', label: 'Missing week', value: null, reportedDays: 0, expectedDays: 7 },
            { key: 'c', label: 'Correction week', value: -3, reportedDays: 7, expectedDays: 7 },
            { key: 'd', label: 'Partial average', value: 4, reportedDays: 7, expectedDays: 7, partial: true },
            { key: 'e', label: 'Outside selection', value: null, reportedDays: 0, expectedDays: 0 }
        ] }
    ] });
    const marks = [...container.querySelectorAll('.heatmap-cell')];
    assert.equal(marks.length, 5);
    assert.notEqual(marks[0].getAttribute('fill'), marks[1].getAttribute('fill'));
    assert.notEqual(marks[0].getAttribute('fill'), marks[2].getAttribute('fill'));
    assert.equal(container.querySelectorAll('.heatmap-missing').length, 1);
    assert.equal(container.querySelectorAll('.heatmap-negative').length, 1);
    assert.equal(container.querySelectorAll('.heatmap-partial').length, 1);
    assert.equal(container.querySelector('.heatmap-inactive').getAttribute('fill'), 'none');
    assert.equal(container.querySelectorAll('[tabindex="0"]').length, 1);
    const grid = container.querySelector('.heatmap-grid'); grid.focus();
    assert.equal(document.activeElement, grid);
    grid.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(grid.getAttribute('aria-activedescendant'), marks[1].id);
    assert.match(container.querySelector('.chart-tooltip').textContent, /Missing week.*No displayable value.*0 of 7/);
    grid.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    assert.match(container.querySelector('.chart-tooltip').textContent, /Outside the selected period/);
    grid.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    assert.equal(grid.getAttribute('aria-activedescendant'), marks[0].id);
    assert.match(container.querySelector('.chart-legend').textContent, /Negative correction.*No displayable value.*Hatched/);
    assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
});

test('heatmap color bars match cells and label the numeric range and units in either theme', t => {
    for (const theme of ['dark', 'light']) for (const width of [320, 1200]) {
        const { container, renderers } = harness(t, width, theme);
        const columns = ['zero', 'middle', 'maximum', 'correction', 'missing', 'inactive'].map(key => ({ key, label: key }));
        renderers.heatmap(container, { ...common, columns, rows: [{ key: 'tn', label: 'Tunisia', cells: columns.map((column, index) => ({
            ...column, value: [0, 4, 8, -3, null, 100][index], expectedDays: index === 5 ? 0 : 7,
            reportedDays: index === 4 ? 0 : 7, partial: index === 1
        })) }] });
        const legend = container.querySelector('.heatmap-value-legend'), bar = legend.querySelector('.heatmap-value-bar');
        assert.ok(legend.classList.contains('chart-color-legend'), 'Heatmaps and scatter plots share the same color-bar presentation');
        assert.equal(legend.getAttribute('role'), 'img');
        assert.match(legend.getAttribute('aria-label'), /Cases per 100,000 people: 0 to 8.*Lower values.*higher values/);
        assert.equal(legend.querySelector('.heatmap-value-label').textContent, common.unitLabel);
        assert.deepEqual([...legend.querySelector('.heatmap-value-range').children].map(node => node.textContent), ['0', '8']);
        const colors = (bar.style.backgroundImage.match(/rgba?\([^)]+\)|#[\da-f]{3,8}\b/gi) || []).map(color => d3.color(color).formatHex());
        const marks = [...container.querySelectorAll('.heatmap-cell')];
        for (const [stop, mark] of [[0, 0], [4, 1], [8, 2]]) assert.equal(colors[stop], d3.color(marks[mark].getAttribute('fill')).formatHex());
        const keys = container.querySelector('.heatmap-status-legend');
        assert.equal(keys.querySelectorAll('.legend-item').length, 3, 'Exceptional states remain separate from the continuous value range');
        assert.equal(keys.querySelectorAll('.legend-hatched').length, 1);
        assert.match(keys.textContent, /Negative correction.*No displayable value.*Hatched: partial reports/);
        assert.equal(legend.querySelector('i'), null, 'Numeric values use a continuous bar instead of disconnected swatches');
        assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
    }
});

test('heatmap color legends avoid invented ranges for zero-only, negative-only and unavailable observations', t => {
    const { container, renderers } = harness(t, 320);
    const columns = [{ key: 'a', label: 'First day' }, { key: 'b', label: 'Second day' }];
    const render = values => renderers.heatmap(container, { ...common, columns,
        rows: [{ key: 'tn', label: 'Tunisia', cells: columns.map((column, index) => ({ ...column, value: values[index], expectedDays: 1 })) }] });
    render([0, 0]);
    const legend = container.querySelector('.heatmap-value-legend'), bar = legend.querySelector('.heatmap-value-bar');
    assert.equal(bar.style.backgroundImage, '');
    assert.equal(d3.color(bar.style.backgroundColor).formatHex(), d3.color(container.querySelector('.heatmap-cell').getAttribute('fill')).formatHex());
    assert.equal(legend.querySelector('.heatmap-value-range').textContent, '0');
    assert.match(legend.getAttribute('aria-label'), /All nonnegative reported values are zero/);
    assert.equal(container.querySelector('.heatmap-status-legend'), null);
    for (const values of [[-3, -7], [null, null], [-3, null]]) {
        render(values);
        assert.equal(container.querySelector('.heatmap-value-legend'), null, 'No nonnegative range is drawn without nonnegative observations');
        if (values.every(value => value === null)) {
            assert.equal(container.querySelector('.heatmap-status-legend'), null);
            assert.equal(container.querySelector('svg'), null);
            assert.match(container.querySelector('.chart-empty-state').textContent, /No data available.*Try another metric or date range/);
            continue;
        }
        assert.equal(container.querySelectorAll('.heatmap-status-legend').length, 1);
        assert.equal(container.textContent.includes('Negative correction'), values.some(value => value < 0));
        assert.equal(container.textContent.includes('No displayable value'), values.includes(null));
    }
});

test('large heatmaps fit the chart without scrolling and retain every keyboard-inspectable source cell', t => {
    const { window, container, renderers } = harness(t, 320);
    const columns = Array.from({ length: 150 }, (_, index) => ({ key: String(index), label: `Week ${index + 1}` }));
    renderers.heatmap(container, { ...common, columns, rows: [0, 1, 2, 3].map(index => ({
        key: String(index), label: `Country ${index + 1}`, cells: columns.map(column => ({ ...column, value: 2, reportedDays: 7, expectedDays: 7 }))
    })) });
    assert.equal(container.querySelector('.analytics-heatmap-scroll'), null);
    assert.equal(container.querySelector('svg').getAttribute('width'), '100%');
    assert.equal(Number(container.querySelector('svg').getAttribute('viewBox').split(' ')[2]), 320);
    assert.equal(container.querySelectorAll('.heatmap-cell').length, 600);
    assert.ok([...container.querySelectorAll('.heatmap-cell')].every(cell => Number(cell.getAttribute('width')) > 0));
    assert.equal(container.querySelectorAll('[tabindex="0"]').length, 1);
    const grid = container.querySelector('.heatmap-grid');
    grid.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', ctrlKey: true, bubbles: true }));
    assert.match(grid.getAttribute('aria-activedescendant'), /-3-149$/);
    grid.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.match(grid.getAttribute('aria-activedescendant'), /-3-149$/);
    grid.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true }));
    assert.match(grid.getAttribute('aria-activedescendant'), /-0-0$/);
});

test('heatmap date labels stay inside the SVG while preserving full endpoint titles', t => {
    const { container, renderers } = harness(t, 338, 'light');
    const columns = ['Dec 28, 2020', 'Jan 4, 2021', 'Jan 11, 2021', 'Jan 18, 2021', 'Jan 25, 2021'].map((label, index) => ({ key: String(index), label }));
    renderers.heatmap(container, { ...common, columns,
        rows: [{ key: 'tn', label: 'Tunisia', cells: columns.map(column => ({ ...column, value: 1, reportedDays: 7, expectedDays: 7 })) }] });
    const last = [...container.querySelectorAll('.x-axis .tick text')].at(-1);
    assert.equal(last.getAttribute('text-anchor'), 'end');
    assert.equal(last.querySelector('title').textContent, 'Jan 25, 2021');
    const position = Number(/translate\(([-+\d.eE]+)/.exec(last.parentElement.getAttribute('transform'))[1]);
    const edge = 100 + position + Number(last.getAttribute('x'));
    assert.ok(edge <= Number(container.querySelector('svg').getAttribute('viewBox').split(' ')[2]) - 3);
});

test('scatter plots encode shared dates with color, retain tiny and negative values, and support keyboard inspection', t => {
    const { window, document, container, countries, renderers } = harness(t, 390);
    renderers.scatter(container, { ...common, xLabel: 'New cases per 100,000 people', yLabel: 'New deaths per 1,000,000 people',
        items: [
            { date: '2021-01-01', x: -0.004, y: 0.00001 },
            { date: '2021-01-02', x: 0, y: 0 },
            { date: '2021-01-03', x: 2, y: 3 },
            { date: '2021-01-04', x: null, y: 3 }
        ] });
    const points = [...container.querySelectorAll('.scatter-point')];
    assert.equal(points.length, 3);
    assert.equal(container.querySelector('svg title'), null, 'ARIA labels and themed tooltips do not create duplicate native hover bubbles');
    assert.equal(new Set(points.map(point => point.getAttribute('fill'))).size, 3);
    assert.equal(new Set(points.map(point => point.getAttribute('r'))).size, 1);
    assertDateLegend(container, ['2021-01-01', '2021-01-03']);
    assert.equal(container.querySelectorAll('[tabindex="0"]').length, 1);
    assert.match(points[0].getAttribute('aria-label'), new RegExp((-0.004).toLocaleString().replace('.', '\\.')));
    points[0].focus();
    points[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(document.activeElement, points[1]);
    assert.match(container.querySelector('.chart-tooltip').textContent, /2021-01-02/);
    points[1].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.deepEqual(countries, []);
    points[2].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.deepEqual(countries, []);
    assert.equal(points[0].getAttribute('role'), 'img');
    assert.doesNotMatch(container.textContent, /Enter to select|Reporting countries/);
    assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
});

test('three-country scatter plots rotate actual XYZ observations with drag and keyboard and reset their view', t => {
    const { window, document, container, renderers } = harness(t, 320);
    const model = { ...common, dimensions: 3, axes: ['Tunisia', 'United States', 'France'].map(label => ({ label, unitLabel: 'Cases' })),
        items: [{ date: '2021-01-01', x: -5, y: 0, z: 4 }, { date: '2021-01-02', x: 0, y: 0, z: 0 },
            { date: '2021-01-03', x: 5, y: 0, z: 8 }, { date: '2021-01-04', x: 2, y: 1, z: null }] };
    renderers.scatter(container, model);
    const svg = container.querySelector('svg'), points = [...container.querySelectorAll('.scatter-point')];
    assert.equal(points.length, 3);
    assert.equal(container.querySelectorAll('.scatter-3d-label').length, 3);
    const initial = points.map(point => [point.getAttribute('cx'), point.getAttribute('cy')]);
    svg.focus(); assert.equal(document.activeElement, svg);
    svg.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.notDeepEqual(points.map(point => [point.getAttribute('cx'), point.getAttribute('cy')]), initial);
    svg.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    assert.deepEqual(points.map(point => [point.getAttribute('cx'), point.getAttribute('cy')]), initial);
    svg.dispatchEvent(new window.MouseEvent('pointerdown', { clientX: 100, clientY: 100, button: 0 }));
    svg.dispatchEvent(new window.MouseEvent('pointermove', { clientX: 125, clientY: 115 }));
    svg.dispatchEvent(new window.MouseEvent('pointerup'));
    assert.notDeepEqual(points.map(point => [point.getAttribute('cx'), point.getAttribute('cy')]), initial);
    container.querySelector('[data-scatter-action="reset"]').click();
    assert.deepEqual(points.map(point => [point.getAttribute('cx'), point.getAttribute('cy')]), initial);
    points[0].focus();
    assert.match(container.querySelector('.chart-tooltip').textContent, /2021-01-01.*Tunisia: -5 Cases.*United States: 0 Cases.*France: 4 Cases/);
    assert.match(svg.getAttribute('aria-label'), /Three-dimensional view/);
    assertDateLegend(container, ['2021-01-01', '2021-01-03']);
    assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
});

test('2D and 3D scatter date scales match points in each theme, redraw for new periods, and show one date without a false range', t => {
    for (const theme of ['dark', 'light']) for (const dimensions of [2, 3]) {
        const { container, renderers } = harness(t, 320, theme);
        const model = { ...common, dimensions, xLabel: 'Cases', yLabel: 'Deaths',
            axes: (dimensions === 3 ? ['Tunisia', 'United States', 'France'] : ['Cases', 'Deaths']).map(label => ({ label })),
            items: [{ date: '2021-01-05', x: 5, y: 5, z: 5 }, { date: '2021-01-01', x: 1, y: 1, z: 1 },
                { date: '2021-01-03', x: 3, y: 3, z: 3 }, { date: '2021-01-06', x: null, y: 6, z: 6 }] };
        renderers.scatter(container, model);
        assertDateLegend(container, ['2021-01-01', '2021-01-05']);
        renderers.scatter(container, { ...model, items: model.items.filter(item => item.date === '2021-01-03') });
        assert.equal(container.querySelectorAll('.scatter-date-legend').length, 1);
        assertDateLegend(container, ['2021-01-03']);
        renderers.scatter(container, { ...model, items: [] });
        assert.equal(container.querySelector('.scatter-date-legend'), null);
        assert.ok(container.querySelector('.chart-empty-state'));
    }
});

test('2D scatter zoom rescales axes and clipped points together, preserves observations and resets exactly', t => {
    const { window, container, renderers } = harness(t, 390);
    renderers.scatter(container, { ...common, xLabel: 'Cases', yLabel: 'Deaths', items: [
        { date: '2021-01-01', x: -10, y: 2 }, { date: '2021-01-02', x: 5, y: -1 }, { date: '2021-01-03', x: 20, y: 8 }
    ] });
    const svg = container.querySelector('svg'), points = [...container.querySelectorAll('.scatter-point')];
    const coords = () => points.map(point => [point.getAttribute('cx'), point.getAttribute('cy')]);
    const initial = coords(), initialLabels = container.querySelector('.x-axis').textContent;
    const into = container.querySelector('[data-scatter-action="in"]'), out = container.querySelector('[data-scatter-action="out"]');
    into.click();
    assert.equal(Number(svg.dataset.zoom), 1.3);
    assert.notDeepEqual(coords(), initial);
    assert.notEqual(container.querySelector('.x-axis').textContent, initialLabels);
    assert.match(points[0].parentNode.getAttribute('clip-path'), /^url\(#scatter-clip-/);
    const frozenLabels = points.map(point => point.getAttribute('aria-label'));
    for (let index = 0; index < 12; index++) into.click();
    assert.equal(Number(svg.dataset.zoom), 4); assert.equal(into.disabled, true);
    // An initially clipped date becomes visible when its keyboard entry receives focus.
    points[0].focus();
    assert.ok(Number(points[0].getAttribute('cx')) >= -0.01);
    assert.ok(Number(points[0].getAttribute('cy')) >= -0.01);
    assert.match(container.querySelector('.chart-tooltip').textContent, /2021-01-01.*Cases: -10.*Deaths: 2/);
    for (let index = 0; index < 18; index++) out.click();
    assert.equal(Number(svg.dataset.zoom), 0.5); assert.equal(out.disabled, true);
    assert.deepEqual(points.map(point => point.getAttribute('aria-label')), frozenLabels);
    container.querySelector('[data-scatter-action="reset"]').click();
    assert.equal(Number(svg.dataset.zoom), 1); assert.deepEqual(coords(), initial);
    points[1].dispatchEvent(new window.KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true }));
    assert.equal(Number(svg.dataset.zoom), 1.3);
    points[1].dispatchEvent(new window.KeyboardEvent('keydown', { key: '0', bubbles: true, cancelable: true }));
    assert.deepEqual(coords(), initial);
    const wheel = new window.WheelEvent('wheel', { deltaY: -100, clientX: 150, clientY: 150, bubbles: true, cancelable: true });
    points[1].parentNode.dispatchEvent(wheel);
    assert.equal(wheel.defaultPrevented, true); assert.ok(Number(svg.dataset.zoom) > 1);
    const pageWheel = new window.WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
    container.querySelector('.chart-heading').dispatchEvent(pageWheel);
    assert.equal(pageWheel.defaultPrevented, false, 'Wheel events outside the chart retain normal page scrolling');
    assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
});

test('3D scatter zoom scales cube axes and observations about their center while preserving rotation', t => {
    const { window, container, renderers } = harness(t, 390);
    renderers.scatter(container, { ...common, dimensions: 3, axes: ['Tunisia', 'United States', 'France'].map(label => ({ label })),
        items: [{ date: '2021-01-01', x: 0, y: 2, z: 3 }, { date: '2021-01-02', x: 10, y: 4, z: 8 }] });
    const svg = container.querySelector('svg'), points = [...container.querySelectorAll('.scatter-point')];
    const coords = () => points.map(point => [+point.getAttribute('cx'), +point.getAttribute('cy')]);
    const initial = coords(), center = [(390 - 40) / 2, (360 - 26 - 32) / 2];
    const axis = container.querySelector('.scatter-3d-axes line'), axisBefore = [+axis.getAttribute('x1'), +axis.getAttribute('y1')];
    const yaw = svg.dataset.yaw, pitch = svg.dataset.pitch;
    container.querySelector('[data-scatter-action="in"]').click();
    assert.equal(Number(svg.dataset.zoom), 1.3);
    for (let point = 0; point < initial.length; point++) for (let axis = 0; axis < 2; axis++)
        assert.ok(Math.abs(coords()[point][axis] - center[axis] - (initial[point][axis] - center[axis]) * 1.3) < 1e-8);
    assert.ok(Math.abs(+axis.getAttribute('x1') - center[0] - (axisBefore[0] - center[0]) * 1.3) < 1e-8);
    assert.ok(Math.abs(+axis.getAttribute('y1') - center[1] - (axisBefore[1] - center[1]) * 1.3) < 1e-8);
    assert.equal(svg.dataset.yaw, yaw); assert.equal(svg.dataset.pitch, pitch);
    svg.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.notEqual(svg.dataset.yaw, yaw); assert.equal(Number(svg.dataset.zoom), 1.3);
    for (let index = 0; index < 20; index++) container.querySelector('[data-scatter-action="in"]').click();
    assert.equal(Number(svg.dataset.zoom), 4);
    assert.equal(container.querySelector('[data-scatter-action="in"]').disabled, true);
    const wheel = new window.WheelEvent('wheel', { deltaY: 100, cancelable: true }); svg.dispatchEvent(wheel);
    assert.equal(wheel.defaultPrevented, true); assert.ok(Number(svg.dataset.zoom) < 4);
    for (let index = 0; index < 20; index++) container.querySelector('[data-scatter-action="out"]').click();
    assert.equal(Number(svg.dataset.zoom), 0.5);
    assert.equal(container.querySelector('[data-scatter-action="out"]').disabled, true);
    container.querySelector('[data-scatter-action="reset"]').click();
    assert.equal(Number(svg.dataset.zoom), 1); assert.equal(svg.dataset.yaw, yaw); assert.equal(svg.dataset.pitch, pitch);
    assert.deepEqual(coords(), initial); assert.equal(svg.style.overflow, 'hidden');
    assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
});

test('3D scatter keyboard inspection reveals zoom-clipped dates while preserving rotation and exact values', t => {
    const { window, container, renderers } = harness(t, 390);
    renderers.scatter(container, { ...common, dimensions: 3, axes: ['Tunisia', 'United States', 'France'].map(label => ({ label, unitLabel: 'Cases' })),
        items: [{ date: '2021-01-01', x: 0, y: 0, z: 0 }, { date: '2021-01-02', x: 10, y: 20, z: 30 }] });
    const svg = container.querySelector('svg'), points = [...container.querySelectorAll('.scatter-point')];
    svg.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    for (let index = 0; index < 8; index++) container.querySelector('[data-scatter-action="in"]').click();
    assert.equal(Number(svg.dataset.zoom), 4);
    assert.ok(points.some(point => Number(point.getAttribute('cy')) < 0 || Number(point.getAttribute('cy')) > 302));
    const yaw = svg.dataset.yaw, pitch = svg.dataset.pitch;
    for (const point of points) {
        point.focus();
        assert.ok(Number(point.getAttribute('cx')) >= 7 - 1e-8 && Number(point.getAttribute('cx')) <= 343 + 1e-8);
        assert.ok(Number(point.getAttribute('cy')) >= 7 - 1e-8 && Number(point.getAttribute('cy')) <= 295 + 1e-8);
        assert.equal(svg.dataset.yaw, yaw); assert.equal(svg.dataset.pitch, pitch);
        assert.ok(container.querySelector('.chart-tooltip').textContent.includes(point.__data__.date));
    }
    assert.deepEqual(points.map(point => [point.__data__.x, point.__data__.y, point.__data__.z]), [[0, 0, 0], [10, 20, 30]]);
    assert.ok(Number(svg.dataset.zoom) < 4);
});

test('3D scatter drag prevents native selection, releases canceled pointers, and supports pinch without changing rotation', t => {
    const { window, document, container, renderers } = harness(t, 390);
    renderers.scatter(container, { ...common, dimensions: 3, axes: ['Tunisia', 'United States', 'France'].map(label => ({ label })),
        items: [{ date: '2021-01-01', x: 0, y: 2, z: 3 }, { date: '2021-01-02', x: 10, y: 4, z: 8 }] });
    const svg = container.querySelector('svg'), captures = new Set(), released = [];
    svg.setPointerCapture = id => captures.add(id); svg.hasPointerCapture = id => captures.has(id);
    svg.releasePointerCapture = id => { captures.delete(id); released.push(id); };
    function pointer(type, id, x, y) {
        const event = new window.MouseEvent(type, { button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true });
        Object.defineProperty(event, 'pointerId', { value: id }); Object.defineProperty(event, 'pointerType', { value: 'touch' });
        svg.dispatchEvent(event); return event;
    }
    const yaw = svg.dataset.yaw, pitch = svg.dataset.pitch;
    assert.equal(pointer('pointerdown', 1, 100, 100).defaultPrevented, true);
    pointer('pointerdown', 2, 200, 100); pointer('pointermove', 2, 250, 100);
    assert.equal(Number(svg.dataset.zoom), 1.5);
    assert.equal(svg.dataset.yaw, yaw); assert.equal(svg.dataset.pitch, pitch);
    pointer('pointercancel', 1, 100, 100); pointer('pointerup', 2, 250, 100);
    pointer('pointermove', 2, 280, 130);
    assert.equal(svg.dataset.yaw, yaw); assert.equal(svg.dataset.pitch, pitch);
    assert.deepEqual(released, [1, 2]); assert.equal(svg.style.cursor, 'grab');
    assert.equal(svg.style.userSelect, 'none'); assert.equal(document.body.style.userSelect, '');
    const select = new window.Event('selectstart', { bubbles: true, cancelable: true });
    container.querySelector('.scatter-3d-label').dispatchEvent(select); assert.equal(select.defaultPrevented, true);
    const point = container.querySelector('.scatter-point'); point.focus();
    assert.equal(document.activeElement, point); assert.match(container.querySelector('.chart-tooltip').textContent, /Tunisia: 0/);
});

test('dumbbells keep endpoint identity across countries and show coincident zero endpoints', t => {
    const { window, container, renderers } = harness(t, 320);
    renderers.dumbbell(container, { ...common, startLabel: 'January 1', endLabel: 'March 1', items: [
        { code: 'us', label: 'United States', start: -3, end: 2 },
        { code: 'fr', label: 'France', start: 0, end: 0 },
        { code: 'tn', label: 'Tunisia', start: null, end: 0.004 }
    ] });
    assert.equal(container.querySelectorAll('.dumbbell-link').length, 2);
    assert.equal(container.querySelectorAll('.dumbbell-point').length, 5);
    const starts = [...container.querySelectorAll('.dumbbell-start')], ends = [...container.querySelectorAll('.dumbbell-end')];
    assert.equal(new Set(starts.map(point => point.getAttribute('fill'))).size, 1);
    assert.equal(new Set(ends.map(point => point.getAttribute('fill'))).size, 1);
    assert.notEqual(starts[0].getAttribute('fill'), ends[0].getAttribute('fill'));
    assert.ok(Number(starts[1].getAttribute('r')) > Number(ends[1].getAttribute('r')));
    starts[0].dispatchEvent(new window.FocusEvent('focus'));
    assert.match(container.querySelector('.chart-tooltip').textContent, /January 1: -3.*March 1: 2.*Change: 5/);
    assert.match(container.querySelector('.chart-legend').textContent, /January 1.*March 1/);
    assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
});

test('tiny scatter axes reserve label space and reduce crowded horizontal ticks', t => {
    const { container, renderers } = harness(t, 320);
    renderers.scatter(container, { ...common, xLabel: 'Cases per person', yLabel: 'Deaths per person', items: [
        { code: 'tn', label: 'Tunisia', x: 0.00000001, y: 0.00000001 },
        { code: 'us', label: 'United States', x: 0, y: 0 }
    ] });
    const plot = container.querySelector('svg > g'), left = Number(/translate\(([-+\d.eE]+)/.exec(plot.getAttribute('transform'))[1]);
    assert.ok(left > 62, 'Tiny fractions receive enough space to the left of the vertical axis');
    assert.ok(container.querySelectorAll('.x-axis .tick').length <= 3);
    assert.equal([...container.querySelectorAll('.x-axis .tick text')].at(-1).getAttribute('text-anchor'), 'end');
    assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
});

test('comparison renderers stay finite in both themes at narrow and desktop widths, including empty models', t => {
    for (const theme of ['dark', 'light']) for (const width of [250, 320, 390, 1440]) {
        const { container, renderers } = harness(t, width, theme);
        for (const type of ['horizontal', 'heatmap', 'scatter', 'dumbbell']) {
            renderers[type](container, { ...common, type, items: [], rows: [], columns: [] });
            assert.equal(container.querySelectorAll('svg').length, 0);
            assert.ok(container.querySelector('.chart-empty-state'));
            assert.equal(container.querySelector('.chart-empty-state').getAttribute('role'), 'status');
            assert.equal(container.querySelector('.chart-heading-title').textContent, common.title);
            assert.equal(container.querySelector('.chart-subtitle').textContent, common.subtitle);
            assert.equal(container.querySelector('.scatter-date-legend'), null);
            assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
        }
    }
});
