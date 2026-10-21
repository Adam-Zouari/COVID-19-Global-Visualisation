import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, readURLState, stateToURL } from '../ui/store.js';

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

test('untrusted URL inputs are constrained and duplicate countries cannot exceed four', () => {
    const state = readURLState('?category=toString&unit=invalid&view=admin&country=%3Cscript%3E&compare=TN,TN,us,fr,de,gb&range=NaN,999&layout=x&scale=x');
    assert.equal(state.category, 'epidem'); assert.equal(state.unit, 'count'); assert.equal(state.view, 'explore');
    assert.equal(state.selectedCountry, null);
    assert.deepEqual(state.compareCountries, ['tn', 'us', 'fr', 'de']);
    assert.deepEqual(state.compareRange, { start: 0, end: 100 });
});
