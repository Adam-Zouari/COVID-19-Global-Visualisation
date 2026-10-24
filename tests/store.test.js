import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, readURLState, stateToURL } from '../src/ui/store.js';
import { CHART_TYPES } from '../src/charts/chartTypes.js';

test('daily reporting is the default while explicit seven-day views round-trip through URLs', () => {
    const defaults = createStore().getState();
    assert.equal(defaults.smoothing, 'raw');
    for (const query of ['', '?smooth=raw', '?smooth=invalid']) assert.equal(readURLState(query).smoothing, 'raw');
    const dailyURL = stateToURL(defaults, 'https://example.com/?smooth=7day');
    assert.equal(dailyURL.searchParams.has('smooth'), false);
    const averagedURL = stateToURL({ ...defaults, smoothing: '7day' }, dailyURL);
    assert.equal(averagedURL.searchParams.get('smooth'), '7day');
    assert.equal(readURLState(averagedURL.search).smoothing, '7day');
});

test('original CSV data is the default and fictional data requires an explicit sample URL', () => {
    assert.equal(createStore().getState().dataMode, 'csv');
    for (const query of ['', '?data=csv', '?data=invalid']) assert.equal(readURLState(query).dataMode, 'csv');
    assert.equal(readURLState('?data=sample').dataMode, 'sample');
    const archiveURL = stateToURL(createStore().getState(), 'https://example.com/?data=sample');
    assert.equal(archiveURL.searchParams.has('data'), false);
    const sampleURL = stateToURL({ ...createStore().getState(), dataMode: 'sample' }, archiveURL);
    assert.equal(sampleURL.searchParams.get('data'), 'sample');
    assert.equal(readURLState(sampleURL.search).dataMode, 'sample');
});

test('shared state publishes immutable updates, avoids duplicate events, and unsubscribes', () => {
    const countries = ['tn'];
    const store = createStore({ compareCountries: countries });
    countries.push('us');
    assert.deepEqual(store.getState().compareCountries, ['tn']);
    let calls = 0;
    const unsubscribe = store.subscribe((current, previous) => {
        calls++; assert.equal(previous.unit, 'count'); assert.equal(current.unit, 'per100k');
    });
    store.setState({ unit: 'per100k' }); store.setState({ unit: 'per100k' });
    assert.equal(calls, 1); unsubscribe(); store.setState({ selectedCountry: 'us' });
    assert.equal(calls, 1);
    assert.throws(() => store.getState().compareCountries.push('fr'));
});

test('URL state round-trips a full comparison with selected country and calendar date', () => {
    const state = { ...createStore().getState(), view: 'compare', category: 'vaccinations', metric: 'cumulative_persons_vaccinated',
        unit: 'percent', smoothing: 'raw', selectedDate: '2022-05-04', selectedCountry: 'tn', compareCountries: ['tn', 'us'],
        compareLayout: 'separate', compareChartType: 'bar', compareScale: 'independent', compareRange: { start: 20, end: 80 }, dataMode: 'csv' };
    const url = stateToURL(state, 'https://example.com/?unrelated=keep#chart');
    const restored = readURLState(url.search);
    assert.deepEqual(restored, state);
    assert.equal(url.searchParams.get('unrelated'), 'keep');
    assert.equal(url.hash, '#chart');
});

test('country analysis visibility round-trips independently of the active workspace and closes explicitly', () => {
    const defaults = createStore().getState();
    assert.equal(defaults.analysisOpen, false);
    for (const view of ['explore', 'compare']) {
        const state = { ...defaults, view, selectedCountry: 'tn', analysisOpen: true };
        const url = stateToURL(state, 'https://example.com/?unrelated=keep#chart');
        assert.equal(url.searchParams.get('analysis'), '1');
        const restored = readURLState(url.search);
        assert.equal(restored.analysisOpen, true);
        assert.equal(restored.selectedCountry, 'tn');
        assert.equal(restored.view, view);
        const closed = stateToURL({ ...state, analysisOpen: false }, url);
        assert.equal(closed.searchParams.has('analysis'), false);
        assert.equal(closed.searchParams.get('country'), 'tn');
        assert.equal(closed.searchParams.get('unrelated'), 'keep');
        assert.equal(closed.hash, '#chart');
        assert.equal(readURLState(closed.search).analysisOpen, false);
    }
});

test('country analysis URLs require an explicit open flag and a valid selected country', () => {
    for (const query of ['', '?analysis=1', '?analysis=1&country=', '?analysis=1&country=Tunisia',
        '?analysis=1&country=%3Cscript%3E', '?analysis=1&country=123', '?country=tn',
        '?analysis=true&country=tn', '?analysis=01&country=tn', '?analysis=0&country=tn']) {
        assert.equal(readURLState(query).analysisOpen, false, query);
    }
    assert.equal(readURLState('?analysis=1&country=TN').selectedCountry, 'tn');
    assert.equal(readURLState('?analysis=1&country=TN').analysisOpen, true);
    for (const selectedCountry of [null, undefined, '', 'Tunisia', '<script>', '123', ' tn ']) {
        const url = stateToURL({ ...createStore().getState(), selectedCountry, analysisOpen: true }, 'https://example.com/?analysis=1');
        assert.equal(url.searchParams.has('analysis'), false);
    }
    const store = createStore({ analysisOpen: 'true' });
    assert.equal(store.getState().analysisOpen, false);
    store.setState({ selectedCountry: 'tn', analysisOpen: true });
    assert.equal(store.getState().analysisOpen, true);
    store.setState({ analysisOpen: 1 });
    assert.equal(store.getState().analysisOpen, false, 'Visibility is a boolean, not a truthy URL or input value');
});

test('untrusted URL inputs are constrained and duplicate countries cannot exceed four', () => {
    const state = readURLState('?category=toString&unit=invalid&view=admin&country=%3Cscript%3E&compare=TN,TN,us,fr,de,gb&range=NaN,999&layout=x&scale=x');
    assert.equal(state.category, 'epidem'); assert.equal(state.unit, 'count'); assert.equal(state.view, 'explore');
    assert.equal(state.selectedCountry, null);
    assert.deepEqual(state.compareCountries, ['tn', 'us', 'fr', 'de']);
    assert.deepEqual(state.compareRange, { start: 0, end: 100 });
});

test('all supported unit choices survive shared URL restoration, including per million', () => {
    for (const unit of ['count', 'per100k', 'per1m', 'percent', 'per100']) {
        const url = stateToURL({ ...createStore().getState(), unit }, 'https://example.com/');
        assert.equal(readURLState(url.search).unit, unit);
    }
    for (const unit of ['per1k', 'per10k', 'toString', '__proto__']) {
        assert.equal(readURLState(`?unit=${unit}`).unit, 'count');
    }
});

test('comparison chart types and their metric, unit, averaging and date settings survive sharing', () => {
    const options = { date: '2021-06-01', xMetric: 'cumulative_persons_fully_vaccinated', xUnit: 'percent',
        yMetric: 'new_deceased', yUnit: 'per1m', smoothing: '7day' };
    for (const type of Object.keys(CHART_TYPES).filter(key => CHART_TYPES[key].compare)) {
        const state = { ...createStore().getState(), compareChartType: type, compareChartOptions: options };
        const restored = readURLState(stateToURL(state, 'https://example.com/').search);
        assert.equal(restored.compareChartType, type);
        assert.deepEqual(restored.compareChartOptions, options);
    }
    const store = createStore({ compareChartOptions: options });
    options.date = '2021-07-01';
    assert.equal(store.getState().compareChartOptions.date, '2021-06-01');
    assert.throws(() => { store.getState().compareChartOptions.date = '2021-07-01'; });
});

test('shared chart inputs reject unknown types, malformed dates, units and arbitrary option keys', () => {
    for (const chart of ['__proto__', 'toString', 'unknown', 'area', 'histogram', 'radar', 'stacked', 'stacked100']) {
        assert.equal(readURLState(`?chart=${chart}`).compareChartType, 'line');
        assert.equal(stateToURL({ ...createStore().getState(), compareChartType: chart }, 'https://example.com/').searchParams.has('chart'), false);
    }
    for (const value of ['null', '[]', '123', '{', JSON.stringify({ date: '2021-02-29', xMetric: '<script>', xUnit: 'people', smoothing: 'weekly', callback: 'alert(1)' })]) {
        assert.deepEqual(readURLState(`?chartOptions=${encodeURIComponent(value)}`).compareChartOptions, {});
    }
});
