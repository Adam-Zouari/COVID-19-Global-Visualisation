const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
    const frames = new Map();
    let nextId = 1;
    const elements = new Map();
    const context = vm.createContext({
        window: { matchMedia: () => ({ matches: false }), innerWidth: 375, innerHeight: 667 },
        document: { hidden: false, getElementById: id => elements.get(id) || null },
        AbortController, console,
        requestAnimationFrame: callback => { const id = nextId++; frames.set(id, callback); return id; },
        cancelAnimationFrame: id => frames.delete(id)
    });
    for (const file of ['GlobeVis.js', 'GlobeEvents.js', 'GlobeRendering.js', 'GlobeCountries.js', 'GlobeAnimation.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'globe', file), 'utf8'), context, { filename: file });
    }
    let rotation = [0, 0, 0];
    const globe = Object.assign(Object.create(context.window.GlobeVis.prototype), {
        animationFrameId: null, rotationFrameId: null, lastFrameTime: null,
        autoRotate: true, autoRotateSpeed: 0.2, currentRotation: [0, 0, 0],
        destroyed: false, countryFeatures: [], render() {},
        projection: { rotate(value) { if (value) { rotation = [...value]; return this; } return [...rotation]; } }
    });
    function tick(timestamp) {
        const pending = [...frames.entries()];
        for (const [id, callback] of pending) {
            frames.delete(id);
            callback(timestamp);
        }
    }
    return { context, globe, frames, tick, elements };
}

test('rotation has one scheduled frame and stopping cancels it', () => {
    const { globe, frames, tick } = harness();
    globe.startAutoRotation();
    globe.startAutoRotation();
    assert.equal(frames.size, 1);
    tick(0);
    tick(16);
    assert.equal(frames.size, 1);
    assert.ok(globe.currentRotation[0] > 0);
    globe.stopAutoRotation();
    assert.equal(frames.size, 0);
    assert.equal(globe.autoRotate, false);
});

test('a new country animation cancels the old callback and follows shortest rotation', () => {
    const { globe, frames, tick } = harness();
    let oldCompleted = false;
    let newCompleted = false;
    globe.projection.rotate([1085, 0, 0]);
    globe.animateToRotation([180, 0, 0], () => { oldCompleted = true; });
    globe.animateToRotation([10, 0, 0], () => { newCompleted = true; });
    assert.equal(frames.size, 1);
    tick(0);
    tick(1000);
    assert.equal(oldCompleted, false);
    assert.equal(newCompleted, true);
    assert.equal(globe.currentRotation[0], 1090);
    assert.equal(frames.size, 0);
});

test('pinching suspends rotation until a fresh single-finger drag starts', () => {
    const { globe } = harness();
    globe.tooltip = { style() {} };
    globe.dragstarted({ x: 0, y: 0 });
    globe.dragged({ x: 50, y: 20, sourceEvent: { touches: [{}] } });
    const rotation = [...globe.currentRotation];
    globe.dragged({ x: 100, y: 40, sourceEvent: { touches: [{}, {}] } });
    globe.dragged({ x: 150, y: 60, sourceEvent: { touches: [{}] } });
    assert.deepEqual([...globe.currentRotation], rotation);
    globe.dragended();
    globe.dragstarted({ x: 150, y: 60 });
    globe.dragged({ x: 175, y: 60, sourceEvent: { touches: [{}] } });
    assert.equal(globe.currentRotation[0], rotation[0] + 5);
});

test('search selection persists when comparison cancels the unfinished rotation', () => {
    const { context, globe } = harness();
    const country = { id: '788', properties: { name: 'Tunisia' } };
    context.d3 = { geoCentroid: () => [10, 34] };
    globe.featuresByCode = new Map([['tn', country]]);
    globe.selectCountry = feature => { globe.selectedCountryCode = 'tn'; globe.selectedCountry = feature.id; };
    globe.goToCountry('tn');
    globe.cancelRotationAnimation();
    assert.equal(globe.selectedCountryCode, 'tn');
    assert.equal(globe.selectedCountry, '788');
});

test('country mapping covers South Africa, caches topology, and prefers the main territory', () => {
    const { context, globe } = harness();
    const countries = [
        { id: '710', properties: { name: 'South Africa' }, area: 10 },
        { id: '384', properties: { name: "Côte d'Ivoire" }, area: 5 },
        { id: '-99', properties: { name: 'N. Cyprus' }, area: 1 },
        { id: '196', properties: { name: 'Cyprus' }, area: 3 }
    ];
    let conversions = 0;
    context.topojson = { feature() { conversions++; return { features: countries }; } };
    context.d3 = { geoArea: feature => feature.area };
    globe.dataService = { getCountryKeyFromName: () => null };
    globe.worldData = { objects: { countries: {} } };
    globe.buildCountryFeatureMap();
    globe.buildCountryFeatureMap();
    assert.equal(conversions, 1);
    assert.equal(globe.getCountryCode(countries[0]), 'za');
    assert.equal(globe.getCountryCode(countries[1]), 'ci');
    assert.equal(globe.getCountryFeatureByCode('CY'), countries[3]);
    assert.equal(globe.getCountryFeatureByCode(null), null);
});

test('atlas features without IDs retain independent mappings and stable unique keys', () => {
    const { context, globe } = harness();
    const countries = ['N. Cyprus', 'Somaliland', 'Kosovo'].map(name => ({ properties: { name }, area: 1 }));
    context.topojson = { feature: () => ({ features: countries }) };
    context.d3 = { geoArea: feature => feature.area };
    globe.dataService = { getCountryKeyFromName: () => null };
    globe.worldData = { objects: { countries: {} } };
    globe.buildCountryFeatureMap();
    const ids = countries.map(feature => feature.id);
    assert.equal(new Set(ids).size, 3);
    assert.deepEqual(countries.map(feature => globe.getCountryCode(feature)), ['cy', 'so', 'xk']);
    globe.buildCountryFeatureMap();
    assert.deepEqual(countries.map(feature => feature.id), ids);
});

test('every bundled atlas feature maps without numeric-ID fallbacks or a data-source index', async () => {
    const { context, globe } = harness();
    context.d3 = await import('d3');
    context.topojson = await import('topojson-client');
    globe.worldData = require('world-atlas/countries-110m.json');
    globe.dataService = { getCountryKeyFromName: () => null };
    globe.buildCountryFeatureMap();
    assert.equal(globe.countryFeatures.length, 177);
    assert.equal(globe.countryFeatureMap.size, globe.countryFeatures.length);
    for (const feature of globe.countryFeatures) {
        assert.match(globe.getCountryCode(feature), /^[a-z]{2}$/, feature.properties.name);
    }
});

test('replacing a country selection emits only its final state and explicit clearing still notifies', async () => {
    const { JSDOM } = await import('jsdom');
    const { select } = await import('d3');
    const dom = new JSDOM('<svg><g></g></svg>');
    const { globe } = harness();
    const countries = [{ id: 'tn' }, { id: 'fr' }];
    globe.globeGroup = select(dom.window.document.querySelector('g'));
    globe.globeGroup.selectAll('.country').data(countries).join('path').attr('class', 'country');
    globe.getCountryCode = feature => feature.id;
    globe.updateCountryInfoPanel = () => {};
    globe.refreshSelectedCountry = () => {};
    globe.dataService = { getAllCountries: () => [{ countryCode: 'sg' }] };
    const notifications = [];
    globe.dispatchStateEvent = name => { notifications.push([name, globe.selectedCountryCode]); };
    globe.selectCountry(countries[0]);
    globe.selectCountry(countries[1]);
    globe.goToCountry('sg');
    globe.clearCountrySelection();
    assert.deepEqual(notifications, [
        ['country-selected', 'tn'], ['country-selected', 'fr'],
        ['country-selected', 'sg'], ['country-selected', null]
    ]);
    dom.window.close();
});

test('search selects countries absent from the low-resolution geometry', () => {
    const { globe } = harness();
    const record = { countryKey: 'sg', countryName: 'Singapore' };
    globe.dataService = {
        getAllCountries: () => [{ countryCode: 'SG', countryName: 'Singapore' }],
        getCountryName: () => 'Singapore', getCountryData: code => code === 'sg' ? record : null
    };
    globe.clearCountrySelection = () => { globe.selectedCountry = null; globe.selectedCountryCode = null; };
    let shown;
    globe.updateCountryInfoPanel = value => { shown = value; };
    globe.goToCountry('SG');
    assert.equal(globe.selectedCountryCode, 'sg');
    assert.equal(globe.selectedCountry, null);
    assert.equal(shown, record);
});

test('a successful upload recovers an uncreated globe without restarting automatic rotation', async () => {
    const { globe, frames } = harness();
    let geometryLoaded = false;
    let refreshed = false;
    globe.autoRotate = false;
    globe.ensureWorldData = async () => { geometryLoaded = true; };
    globe.refreshData = () => { refreshed = true; globe.globeCreated = true; };
    await globe.recoverAfterDataLoad();
    assert.equal(geometryLoaded, true);
    assert.equal(refreshed, true);
    assert.equal(frames.size, 0);
});

test('a destroyed globe ignores a pending recovery failure', async () => {
    const { context, globe } = harness();
    let rejectMap, errors = 0;
    context.console = { error() { errors++; } };
    globe.ensureWorldData = () => new Promise((resolve, reject) => { rejectMap = reject; });
    globe.showGlobeError = () => { errors++; };
    const recovery = globe.recoverAfterDataLoad();
    globe.destroyed = true;
    rejectMap(new Error('Aborted old map request'));
    await recovery;
    assert.equal(errors, 0);
});

test('an old destroyed initialization cannot hide the replacement globe loader', async () => {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<div id="globe"></div><div id="loader" style="display:flex"></div>');
    const { context, globe } = harness();
    context.document = dom.window.document;
    const d3 = await import('d3');
    context.d3 = { ...d3, select: node => d3.select(typeof node === 'string' ? dom.window.document.querySelector(node) : node) };
    Object.assign(globe, { width: 360, height: 420, radius: 150 });
    let resolveData;
    globe.dataService = { loadData: () => new Promise(resolve => { resolveData = resolve; }) };
    globe.ensureWorldData = async () => ({});
    globe.setupEventListeners = () => {};
    globe.setControlsDisabled = () => {};
    const ready = globe.initVis();
    globe.destroyed = true;
    resolveData();
    await ready;
    assert.equal(dom.window.document.getElementById('loader').style.display, 'flex');
    dom.window.close();
});

class Control extends EventTarget {
    constructor(value = '0') { super(); this.value = value; this.disabled = false; }
}

test('rebuilding the date slider replaces listeners and preserves the selected date', () => {
    const { globe, elements } = harness();
    for (const id of ['dateSlider', 'currentDate', 'prevDateBtn', 'nextDateBtn']) elements.set(id, new Control());
    let changes = 0;
    globe.dataService = {
        availableDates: ['2020-01-01', '2020-01-02', '2020-01-03'],
        currentDate: '2020-01-02',
        formatDate: value => value,
        changeDate(value) { changes++; this.currentDate = value; }
    };
    globe.updateGlobeColors = () => {};
    globe.refreshSelectedCountry = () => {};
    globe.setupDateSlider();
    globe.setupDateSlider();
    assert.equal(Number(elements.get('dateSlider').value), 1);
    changes = 0;
    elements.get('nextDateBtn').dispatchEvent(new Event('click'));
    assert.equal(changes, 1);
    assert.equal(globe.dataService.currentDate, '2020-01-03');
    assert.equal(elements.get('nextDateBtn').disabled, true);
    assert.equal(elements.get('prevDateBtn').disabled, false);
    globe.dataService.availableDates = [];
    globe.setupDateSlider();
    assert.equal(elements.get('dateSlider').disabled, true);
    assert.equal(elements.get('prevDateBtn').disabled, true);
    assert.equal(elements.get('nextDateBtn').disabled, true);
});

test('reset preserves the selected country, metric, and date', () => {
    const { context, globe } = harness();
    context.d3 = { zoomIdentity: { k: 1 } };
    let target;
    globe.animateToRotation = rotation => { target = rotation; };
    globe.svg = { interrupt() {}, call() {} };
    globe.zoom = { transform() {} };
    globe.selectedCountryCode = 'tn';
    globe.selectedCountry = '788';
    globe.dataService = { currentDate: '2021-01-01', currentColumn: 'new_confirmed' };
    globe.resetView();
    assert.equal(globe.selectedCountryCode, 'tn');
    assert.equal(globe.selectedCountry, '788');
    assert.equal(globe.dataService.currentDate, '2021-01-01');
    assert.equal(globe.dataService.currentColumn, 'new_confirmed');
    assert.deepEqual([...target], [-10, -15, 0]);
    assert.equal(globe.autoRotate, false);
});

test('the base radius fits a phone viewport', () => {
    const { globe } = harness();
    globe.measure();
    assert.ok(globe.radius * 2 < globe.width);
    assert.ok(globe.radius * 2 < globe.height);
});

test('globe dimensions follow its container instead of the viewport', () => {
    const { globe, elements } = harness();
    elements.set('globe', { getBoundingClientRect: () => ({ width: 900, height: 520 }) });
    globe.measure();
    assert.equal(globe.width, 900);
    assert.equal(globe.height, 520);
    assert.equal(globe.radius, 232);
});

test('globe token changes update outlines without rebuilding geometry or recoloring observations', async () => {
    const { JSDOM } = await import('jsdom');
    const { select } = await import('d3');
    const dom = new JSDOM('<svg><g><circle class="ocean"></circle><path class="graticule"></path></g></svg>');
    const { context, globe } = harness();
    const colors = {
        '--globe-ocean': '#101d30', '--globe-rim': '#345074', '--globe-grid': '#90abc9',
        '--globe-border': '#17283b', '--globe-hover': '#f3f7fe', '--globe-selection': '#f3f7fe'
    };
    context.window.AtlasTheme = { getColor: name => colors[name] };
    globe.globeGroup = select(dom.window.document.querySelector('g'));
    globe.countryFeatures = [{ id: 'selected' }, { id: 'hovered' }, { id: 'other' }];
    globe.globeGroup.selectAll('.country').data(globe.countryFeatures).join('path')
        .attr('class', 'country').attr('d', 'M0,0L1,1Z').attr('fill', '#ef9290');
    const originalPaths = globe.globeGroup.selectAll('.country').nodes();
    globe.selectedCountry = 'selected'; globe.hoveredCountry = 'hovered'; globe.globeCreated = true;
    globe.createGlobe = () => { throw new Error('Geometry must remain intact'); };
    globe.updateGlobeColors = () => { throw new Error('Observation colors must remain intact'); };
    globe.refreshGlobeAppearance();
    assert.equal(globe.globeGroup.select('.ocean').attr('fill'), '#101d30');

    const originalSelect = globe.globeGroup.select.bind(globe.globeGroup);
    const originalSelectAll = globe.globeGroup.selectAll.bind(globe.globeGroup);
    let svgReads = 0;
    globe.globeGroup.select = (...args) => { svgReads++; return originalSelect(...args); };
    globe.globeGroup.selectAll = (...args) => { svgReads++; return originalSelectAll(...args); };
    globe.refreshGlobeAppearance();
    assert.equal(svgReads, 0, 'Identical dark globe colors require no SVG work when the UI changes theme');

    colors['--globe-border'] = '#20344a'; colors['--globe-hover'] = '#e0efff'; colors['--globe-selection'] = '#ffffff';
    globe.refreshGlobeAppearance();
    assert.deepEqual(originalPaths.map(path => path.getAttribute('stroke')), ['#ffffff', '#e0efff', '#20344a']);
    assert.deepEqual(globe.globeGroup.selectAll('.country').nodes(), originalPaths);
    for (const path of originalPaths) {
        assert.equal(path.getAttribute('d'), 'M0,0L1,1Z');
        assert.equal(path.getAttribute('fill'), '#ef9290');
    }
    dom.window.close();
});

test('changing globe appearance recolors existing paths and legend even when chrome tokens match', async () => {
    const { JSDOM } = await import('jsdom');
    const { select } = await import('d3');
    const dom = new JSDOM('<svg><g><circle class="ocean"></circle><path class="graticule"></path></g></svg><div id="globeLegend"></div>');
    const { context, globe } = harness(); context.document = dom.window.document;
    let theme = 'dark';
    const palettes = { dark: ['#68434c', '#ffd0bd'], light: ['#fce5de', '#782537'] };
    context.window.AtlasTheme = { getColor: () => '', getResolvedTheme: () => theme };
    globe.dataService = {
        currentColumn: 'new_confirmed', displayUnit: 'count', smoothing: 'raw', dataSource: 'csv',
        getDisplayValue: code => code === 'low' ? 0 : 10,
        getCountryColor: code => palettes[theme][code === 'low' ? 0 : 1],
        getDefaultColor: () => theme === 'light' ? '#c2cad5' : '#475569',
        getColorScale() {
            const scale = value => palettes[theme][value === 0 ? 0 : 1];
            scale.colors = () => palettes[theme]; scale.domain = () => [0, 10];
            scale.breaks = () => [0, 5, 10]; scale.type = 'linear';
            return scale;
        }
    };
    globe.globeGroup = select(dom.window.document.querySelector('g'));
    globe.countryFeatures = [{ id: 'low' }, { id: 'high' }];
    globe.getCountryCode = feature => feature.id;
    globe.globeGroup.selectAll('.country').data(globe.countryFeatures).join('path')
        .attr('class', 'country').attr('d', 'M0,0L1,1Z');
    const paths = globe.globeGroup.selectAll('.country').nodes();
    const features = globe.countryFeatures;
    globe.getGlobePalette(); globe.globeCreated = true;
    globe.selectedCountry = 'low'; globe.selectedCountryCode = 'low';
    globe.tooltip = { style() {} };
    globe.createGlobe = () => { throw new Error('Theme changes must retain the existing geometry'); };
    globe.dataService.loadData = () => { throw new Error('Theme changes must retain loaded observations'); };
    globe.updateGlobeColors();
    const legend = dom.window.document.getElementById('globeLegend');
    legend.querySelector('details').open = true;
    assert.deepEqual(paths.map(path => path.getAttribute('fill')), palettes.dark);
    theme = 'light'; globe.refreshGlobeAppearance();
    assert.deepEqual(paths.map(path => path.getAttribute('fill')), palettes.light);
    assert.match(legend.querySelector('.legend-gradient').style.background, /252, 229, 222/);
    assert.equal(legend.querySelector('details').open, true);
    theme = 'dark'; globe.refreshGlobeAppearance();
    assert.deepEqual(paths.map(path => path.getAttribute('fill')), palettes.dark);
    assert.deepEqual(globe.globeGroup.selectAll('.country').nodes(), paths);
    assert.equal(globe.countryFeatures, features);
    assert.equal(globe.selectedCountry, 'low');
    assert.equal(globe.selectedCountryCode, 'low');
    assert.deepEqual(paths.map(path => path.getAttribute('d')), ['M0,0L1,1Z', 'M0,0L1,1Z']);
    dom.window.close();
});

test('a newly created globe remains still', async () => {
    const { context, frames } = harness();
    context.window.GlobeVis.prototype.initVis = async function() {};
    const globe = new context.window.GlobeVis({});
    await globe.ready;
    assert.equal(globe.autoRotate, false);
    assert.equal(frames.size, 0);
});

test('selected metric formatting distinguishes missing observations, zero, and negative corrections', () => {
    const { globe } = harness();
    globe.dataService = { currentColumn: 'new_confirmed', displayUnit: 'count', smoothing: 'raw' };
    assert.equal(globe.formatMetricValue(null), 'Not reported');
    assert.equal(globe.formatMetricValue(undefined), 'Not reported');
    assert.equal(globe.formatMetricValue(0), '0');
    assert.equal(globe.formatMetricValue(-21), '-21');
    assert.equal(globe.formatMetricValue(1.2345, 'per100k'), '1.2');
    assert.equal(globe.formatMetricValue(0.04, 'per100k'), '0.04');
    assert.equal(globe.formatMetricValue(-0.000071428, 'per100k'), '-0.0000714');
});

test('country details show the selected metric, category indicators, and true reporting dates', async () => {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(`<div id="exploreWorkspace"><aside id="countryInfo" hidden>
        <h2 id="countryName"></h2><div id="countryContext"></div><div id="countryPrimary"></div>
        <div id="countryStats"></div><div id="countryTrend"></div><div id="countryPopulation"></div>
        <div id="countryLastReported"></div><button id="seeMoreBtn"></button></aside></div>`);
    const { context, globe } = harness();
    context.document = dom.window.document;
    const record = { countryKey: 'tn', countryName: 'Tunisia', new_confirmed: 0, cumulative_confirmed: 29, cumulative_deceased: null };
    const points = [
        { date: '2020-01-01', value: 5, rawValue: 5, reported: true },
        { date: '2020-01-02', value: 7, rawValue: 7, reported: true },
        { date: '2020-01-03', value: null, rawValue: null, reported: false },
        { date: '2020-01-04', value: 0, rawValue: 0, reported: true },
        { date: '2020-01-05', value: 1, rawValue: 1, reported: true },
        { date: '2020-01-06', value: 9000, rawValue: 9000, reported: true }
    ];
    const labels = { new_confirmed: 'New confirmed cases', cumulative_confirmed: 'Total confirmed cases', cumulative_deceased: 'Total reported deaths' };
    globe.dataService = {
        currentDataset: 'epidem', currentColumn: 'new_confirmed', currentDate: '2020-01-05', displayUnit: 'count', smoothing: 'raw', dataSource: 'sample',
        availableColumns: { epidem: Object.keys(labels) }, getMetricMetadata: column => ({ label: labels[column] }),
        getDisplayValue: () => 0, getCountryData: () => record, getPopulation: () => 1000,
        getCountrySeries: () => points, formatDate: value => value, formatNumber: String
    };
    globe.updateCountryInfoPanel(record, { properties: { name: 'Tunisia' }, countryCode: 'tn' });
    const document = dom.window.document;
    assert.equal(document.querySelector('.primary-metric-value').textContent, '0');
    assert.equal(document.querySelector('.primary-metric-label').textContent, 'New confirmed cases');
    assert.match(document.getElementById('countryStats').textContent, /Total confirmed cases29/);
    assert.match(document.getElementById('countryStats').textContent, /Total reported deathsNot reported/);
    assert.match(document.getElementById('countryPopulation').textContent, /fictional/);
    assert.match(document.getElementById('countryLastReported').textContent, /2020-01-05/);
    assert.equal(document.getElementById('countryInfo').hidden, false);
    assert.equal(document.getElementById('exploreWorkspace').classList.contains('has-selection'), true);
    context.window.CompareMode = { state: { active: true } };
    globe.updateCountryInfoPanel(record, { countryCode: 'tn' });
    assert.equal(document.getElementById('countryInfo').style.display, '', 'Compare visibility belongs to its parent; exiting must reveal the selected country');
    context.window.CompareMode.state.active = false;
    const trend = document.querySelector('.country-sparkline path').getAttribute('d');
    assert.equal((trend.match(/M/g) || []).length, 2, 'A missing report breaks the trend path');
    assert.equal((trend.match(/L/g) || []).length, 2);
    assert.doesNotMatch(document.getElementById('countryTrend').textContent, /2020-01-06/);
    globe.dataService.smoothing = '7day';
    globe.dataService.getDisplayValue = () => null;
    globe.updateCountryInfoPanel(record, { countryCode: 'tn' });
    assert.equal(document.querySelector('.primary-metric-value').textContent, 'Unavailable');
    assert.match(document.querySelector('.primary-metric-unit').textContent, /Not enough reports/);
    record.new_confirmed = null;
    globe.updateCountryInfoPanel(record, { countryCode: 'tn' });
    assert.equal(document.querySelector('.primary-metric-value').textContent, 'Not reported');
    assert.match(document.querySelector('.primary-metric-unit').textContent, /Not reported on selected day/);
    globe.updateCountryInfoPanel(null);
    assert.equal(document.getElementById('countryInfo').hidden, true);
    assert.equal(document.getElementById('exploreWorkspace').classList.contains('has-selection'), false);
    dom.window.close();
});

test('normalized country values explain population division and retain the selected averaging basis', () => {
    const { context, globe } = harness();
    context.window.MetricRegistry = { UNIT_DEFINITIONS: {
        count: { factor: null }, per100k: { factor: 100_000 }, per1m: { factor: 1_000_000 },
        percent: { factor: 100 }, per100: { factor: 100 }
    } };
    let count = 2_000_000;
    globe.dataService = {
        displayUnit: 'per100k', smoothing: 'raw', getPopulation: () => 100_000_000,
        getDisplayValue(code, options) { assert.equal(code, 'tn'); assert.equal(options.unit, 'count'); return count; }
    };
    assert.match(globe.normalizationExplanation('tn', 2000), /Raw count ÷ population × 100,000: 2,000,000 ÷ 100,000,000 × 100,000 ≈ 2,000 Per 100,000 people/);
    globe.dataService.displayUnit = 'per1m';
    assert.match(globe.normalizationExplanation('tn', 20_000), /× 1,000,000 ≈ 20,000 Per 1,000,000 people/);
    count = 100;
    globe.dataService.smoothing = '7day';
    assert.match(globe.normalizationExplanation('tn', 1), /^7-day average count.*100 ÷ 100,000,000/);
    assert.doesNotMatch(globe.normalizationExplanation('tn', 1), /Raw count/);
    assert.equal(globe.normalizationExplanation('tn', null), '');
    globe.dataService.getPopulation = () => null;
    assert.equal(globe.normalizationExplanation('tn', 1), '');
    globe.dataService.getPopulation = () => 100_000_000;
    count = 0;
    assert.match(globe.normalizationExplanation('tn', 0), /0 ÷ 100,000,000/);
    globe.dataService.displayUnit = 'count';
    assert.equal(globe.normalizationExplanation('tn', 0), '');
});

test('logarithmic legend explains actual color bands without a misleading numeric midpoint', async () => {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<div id="globeLegend"></div>');
    const { context, globe } = harness(); context.document = dom.window.document;
    const colors = ['#68434c', '#83515b', '#994350', '#c75b63', '#ed8281', '#ffd0bd'];
    const boundaries = [0, 6.3, 52.8, 392.1, 2900, 21000, 154500];
    const scale = value => value < 0 ? '#aa6611' : colors[0];
    scale.domain = () => [-8, 154500]; scale.colors = () => colors;
    scale.breaks = () => boundaries; scale.type = 'logarithmic';
    globe.dataService = {
        currentColumn: 'current_hospitalized_patients', displayUnit: 'count', smoothing: 'raw',
        getColorScale: () => scale, getDefaultColor: () => '#475569'
    };
    globe.updateLegend();
    const legend = dom.window.document.getElementById('globeLegend');
    assert.match(legend.querySelector('.legend-note').textContent, /Logarithmic color bands/);
    assert.equal(legend.querySelector('.legend-range').textContent, '0154.5K');
    assert.doesNotMatch(legend.querySelector('.legend-range').textContent, /392/);
    assert.match(legend.querySelector('.legend-explanation').textContent, /not equal increases/);
    assert.equal(legend.querySelectorAll('.legend-band').length, 6);
    assert.match(legend.querySelectorAll('.legend-band')[3].getAttribute('aria-label'), /392.1 up to but excluding 2,900/);
    assert.doesNotMatch(legend.textContent, /Reported zero \/ low values/);
    assert.match(legend.querySelector('.legend-explanation').textContent, /Zero is a reported value/);
    assert.match(legend.querySelector('.legend-band').getAttribute('aria-label'), /^0 up to but excluding/);
    assert.match(legend.textContent, /Not reported/);
    assert.match(legend.textContent, /Negative: reporting correction/);
    const details = legend.querySelector('details');
    assert.equal(details.open, false); details.open = true;
    details.querySelector('summary').focus();
    globe.updateLegend();
    assert.equal(legend.querySelector('details').open, true);
    assert.equal(dom.window.document.activeElement, legend.querySelector('summary'));
    scale.domain = () => [0, 0.0000714];
    scale.breaks = () => [0, 0.000001, 0.000002, 0.000003, 0.000004, 0.000005, 0.0000714];
    globe.updateLegend();
    assert.equal(legend.querySelector('.legend-range span:last-child').textContent, '0.0000714');
    dom.window.close();
});
