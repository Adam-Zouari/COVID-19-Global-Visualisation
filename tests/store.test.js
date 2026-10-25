import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, readURLState, stateToURL, readWorkspaceSettings, readWorkspaceMetrics } from '../src/ui/store.js';
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

test('independent globe, comparison and country-analysis settings survive the same shared URL', () => {
    const state = { ...createStore().getState(), view: 'compare', category: 'epidem', metric: 'new_confirmed',
        selectedDate: '2021-05-15', selectedCountry: 'tn', analysisOpen: true,
        compareSettings: { category: 'vaccinations', metric: 'cumulative_persons_fully_vaccinated', unit: 'percent', smoothing: 'raw', selectedDate: '2022-06-10' },
        analysisSettings: { category: 'hospitalizations', metric: 'current_intensive_care_patients', unit: 'per100k', smoothing: '7day', selectedDate: '2021-02-28' },
        compareCountries: ['tn', 'us'], compareRange: { start: 10, end: 70 }, compareChartType: 'horizontal',
        compareChartOptions: { date: '2022-02-03' }, analysisChartType: 'scatter', analysisRange: { start: 30, end: 80 },
        analysisChartOptions: { xMetric: 'new_deceased', yMetric: 'current_intensive_care_patients', xUnit: 'per1m', yUnit: 'count', smoothing: '7day' } };
    const url = stateToURL(state, 'https://example.com/?unrelated=keep#chart');
    assert.deepEqual(readURLState(url.search), state);
    assert.equal(url.searchParams.get('category'), null, 'The globe keeps its own default category');
    assert.equal(url.searchParams.get('metric'), 'new_confirmed');
    assert.equal(url.searchParams.get('unrelated'), 'keep');
    assert.equal(url.hash, '#chart');
    assert.equal(url.searchParams.get('data'), null, 'A workspace cannot replace the shared data source');
});

test('workspace settings and local chart choices are copied and frozen without duplicate updates', () => {
    const settings = { category: 'hospitalizations', metric: 'current_hospitalized_patients', unit: 'count', smoothing: 'raw', selectedDate: '2021-01-20' };
    const range = { start: 10, end: 60 }, options = { xMetric: 'new_confirmed', yMetric: 'new_deceased' };
    const store = createStore({ analysisSettings: settings, compareSettings: settings, analysisRange: range, analysisChartOptions: options });
    settings.metric = 'new_confirmed'; range.start = 40; options.yMetric = 'new_tested';
    assert.equal(store.getState().analysisSettings.metric, 'current_hospitalized_patients');
    assert.equal(store.getState().compareSettings.metric, 'current_hospitalized_patients');
    assert.equal(store.getState().analysisRange.start, 10);
    assert.equal(store.getState().analysisChartOptions.yMetric, 'new_deceased');
    for (const key of ['analysisSettings', 'compareSettings', 'analysisRange', 'analysisChartOptions'])
        assert.equal(Object.isFrozen(store.getState()[key]), true, key);
    assert.throws(() => { store.getState().analysisSettings.metric = 'new_tested'; });
    let changes = 0; store.subscribe(() => { changes++; });
    const next = { ...store.getState().analysisSettings, unit: 'per100k' };
    store.setState({ analysisSettings: next }); store.setState({ analysisSettings: { ...next } });
    assert.equal(changes, 1);
    assert.equal(store.getState().compareSettings.unit, 'count');
    assert.equal(store.getState().unit, 'count');
});

test('legacy URLs leave local workspace settings uninitialized and retain shared globe context', () => {
    const legacy = readURLState('?view=compare&category=hospitalizations&metric=current_hospitalized_patients&unit=per100k&smooth=7day&date=2021-01-20&compare=tn,us');
    assert.equal(legacy.compareSettings, null);
    assert.equal(legacy.analysisSettings, null);
    assert.equal(legacy.category, 'hospitalizations');
    assert.equal(legacy.metric, 'current_hospitalized_patients');
    assert.equal(legacy.unit, 'per100k');
    assert.equal(legacy.smoothing, '7day');
    assert.equal(legacy.selectedDate, '2021-01-20');
    assert.equal(legacy.analysisChartType, 'line');
    assert.deepEqual(legacy.analysisRange, { start: 0, end: 100 });
    assert.deepEqual(legacy.analysisChartOptions, {});
    const cleaned = stateToURL({ ...createStore().getState(), analysisSettings: null, compareSettings: null },
        'https://example.com/?analysisSettings=old&compareSettings=old&analysisChart=scatter&analysisRange=20,80&analysisChartOptions=old');
    for (const key of ['analysisSettings', 'compareSettings', 'analysisChart', 'analysisRange', 'analysisChartOptions'])
        assert.equal(cleaned.searchParams.has(key), false, key);
});

test('untrusted local workspace URLs constrain settings, chart types, ranges and payload size', () => {
    const params = new URLSearchParams({
        analysisSettings: JSON.stringify({ category: 'hospitalizations', metric: '<script>', unit: ['percent'], smoothing: 'weekly', selectedDate: '2021-02-29', execute: 'bad' }),
        compareSettings: JSON.stringify({ category: '__proto__', metric: 'new_confirmed' }),
        analysisChart: 'horizontal', analysisRange: '80,20',
        analysisChartOptions: JSON.stringify({ xMetric: 'new_confirmed', yMetric: '<script>', yUnit: 'unknown', unrelated: 'bad' })
    });
    const state = readURLState(params.toString());
    assert.deepEqual(state.analysisSettings, { category: 'hospitalizations', metric: null, unit: 'count', smoothing: 'raw', selectedDate: null });
    assert.equal(state.compareSettings, null);
    assert.equal(state.analysisChartType, 'line');
    assert.deepEqual(state.analysisRange, { start: 20, end: 80 });
    assert.deepEqual(state.analysisChartOptions, { xMetric: 'new_confirmed' });
    for (const malformed of ['null', '[]', '123', 'true', '{', 'x'.repeat(1600)]) {
        const url = new URLSearchParams({ analysisSettings: malformed, compareSettings: malformed, analysisChartOptions: malformed });
        const restored = readURLState(url.toString());
        assert.equal(restored.analysisSettings, null, malformed.slice(0, 10));
        assert.equal(restored.compareSettings, null, malformed.slice(0, 10));
        assert.deepEqual(restored.analysisChartOptions, {});
    }
    for (const chart of ['__proto__', 'toString', 'horizontal', 'dumbbell', 'radar', 'unknown']) {
        assert.equal(readURLState(`?analysisChart=${chart}`).analysisChartType, 'line');
        assert.equal(stateToURL({ ...createStore().getState(), analysisChartType: chart }, 'https://example.com/').searchParams.has('analysisChart'), false);
    }
    for (const range of ['NaN,20', '-1,60', '0,101', '0,1,2'])
        assert.deepEqual(readURLState(`?analysisRange=${range}`).analysisRange, { start: 0, end: 100 });
    assert.equal(readWorkspaceSettings(null), null);
});

test('last metrics for each dataset and workspace round-trip without changing active settings', () => {
    const workspaceMetrics = {
        globe: { epidem: 'new_deceased', hospitalizations: 'current_intensive_care_patients' },
        country: { hospitalizations: 'new_hospitalized_patients', vaccinations: 'cumulative_persons_vaccinated' },
        compare: { epidem: 'new_tested', hospitalizations: 'current_hospitalized_patients', vaccinations: 'cumulative_persons_fully_vaccinated' }
    };
    const state = { ...createStore().getState(), workspaceMetrics };
    const url = stateToURL(state, 'https://example.com/?unrelated=keep#chart');
    assert.deepEqual(readURLState(url.search), state);
    assert.equal(url.searchParams.get('unrelated'), 'keep');
    assert.equal(url.hash, '#chart');
    assert.deepEqual(readURLState('?metric=new_confirmed').workspaceMetrics, {}, 'Legacy links have no remembered selections');
    const cleaned = stateToURL(createStore().getState(), url);
    assert.equal(cleaned.searchParams.has('workspaceMetrics'), false);
});

test('remembered metric maps are copied and frozen independently across state snapshots', () => {
    const memory = { globe: { epidem: 'new_deceased' }, compare: { epidem: 'new_tested' } };
    const store = createStore({ workspaceMetrics: memory });
    memory.globe.epidem = 'new_confirmed';
    memory.country = { epidem: 'new_recovered' };
    const first = store.getState();
    assert.deepEqual(first.workspaceMetrics, { globe: { epidem: 'new_deceased' }, compare: { epidem: 'new_tested' } });
    assert.equal(Object.isFrozen(first.workspaceMetrics), true);
    assert.equal(Object.isFrozen(first.workspaceMetrics.globe), true);
    assert.throws(() => { first.workspaceMetrics.globe.epidem = 'new_tested'; });
    let updates = 0; store.subscribe(() => { updates++; });
    store.setState({ workspaceMetrics: { ...first.workspaceMetrics, country: { vaccinations: 'cumulative_persons_vaccinated' } } });
    const next = store.getState();
    store.setState({ workspaceMetrics: structuredClone(next.workspaceMetrics) });
    assert.equal(updates, 1);
    assert.equal(first.workspaceMetrics.country, undefined);
    assert.equal(next.workspaceMetrics.globe.epidem, 'new_deceased');
    assert.equal(next.workspaceMetrics.compare.epidem, 'new_tested');
});

test('remembered metric URLs reject malformed maps, inherited properties and oversized payloads', () => {
    const input = JSON.parse('{"globe":{"epidem":"new_deceased","hospitalizations":"<script>","vaccinations":"A","extra":"new_confirmed"},"country":["new_confirmed"],"compare":{"epidem":"new_tested","vaccinations":""},"__proto__":{"epidem":"new_recovered"},"unknown":{"epidem":"new_confirmed"}}');
    assert.deepEqual(readWorkspaceMetrics(input), { globe: { epidem: 'new_deceased' }, compare: { epidem: 'new_tested' } });
    assert.deepEqual(readWorkspaceMetrics(Object.create({ globe: { epidem: 'new_confirmed' } })), {});
    assert.deepEqual(readWorkspaceMetrics({ globe: Object.create({ epidem: 'new_confirmed' }) }), {});
    assert.deepEqual(readWorkspaceMetrics({ globe: { epidem: 'a'.repeat(129), hospitalizations: [], vaccinations: null } }), {});
    for (const invalid of ['null', '[]', 'true', '123', '{', 'x'.repeat(2001)])
        assert.deepEqual(readURLState(new URLSearchParams({ workspaceMetrics: invalid }).toString()).workspaceMetrics, {});
    const valid = { globe: { epidem: 'new_deceased' } };
    const atLimit = JSON.stringify({ ...valid, ignored: '' });
    const padded = JSON.stringify({ ...valid, ignored: 'x'.repeat(2000 - atLimit.length) });
    assert.equal(padded.length, 2000);
    assert.deepEqual(readURLState(new URLSearchParams({ workspaceMetrics: padded }).toString()).workspaceMetrics, valid);
    assert.deepEqual(readURLState(new URLSearchParams({ workspaceMetrics: padded + ' ' }).toString()).workspaceMetrics, {});
});
