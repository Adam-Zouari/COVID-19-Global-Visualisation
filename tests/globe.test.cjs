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
        AbortController, console, clearTimeout,
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
        destroyed: false, countryFeatures: [], render() {}, log() {},
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

test('country availability counts zero values and keeps the sample-data label', () => {
    const { globe, elements } = harness();
    const status = { style: {} };
    elements.set('dataStatus', status);
    globe.dataService = {
        currentColumn: 'new_confirmed', dataSource: 'sample',
        getCountryData: code => ({ new_confirmed: code === 'zero' ? 0 : null }),
        getCountryColor: () => '#123456', getDefaultColor: () => '#000000'
    };
    globe.getCountryCode = feature => feature;
    globe.globeGroup = { selectAll: () => ({ attr(name, callback) { ['zero', 'missing'].forEach(callback); } }) };
    globe.tooltip = { style() {} };
    globe.updateGlobeColors();
    assert.match(status.textContent, /Sample data/);
    assert.match(status.textContent, /fictional/);
    assert.match(status.textContent, /1 mapped country with data/);
    globe.dataService.dataSource = 'upload';
    globe.updateGlobeColors();
    assert.match(status.textContent, /Uploaded CSV data/);
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
