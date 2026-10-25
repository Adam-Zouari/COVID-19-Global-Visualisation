import test from 'node:test';
import assert from 'node:assert/strict';
import { DataService } from '../src/dataService/DataService.js';
import { createWorkspaces } from '../src/ui/workspaces.js';

async function fixture() {
    const service = new DataService();
    service.countryIndex = [{ location_key: 'TN', country_name: 'Tunisia' }];
    service.epidemData = ['2021-01-01', '2021-01-15'].map((date, index) =>
        ({ location_key: 'TN', date, new_confirmed: index * 20, new_deceased: index * 3 }));
    service.hospitalizationsData = ['2021-01-06', '2021-01-15'].map((date, index) =>
        ({ location_key: 'TN', date, current_hospitalized_patients: index * 10,
            current_intensive_care_patients: index * 2, new_hospitalized_patients: index * 4 }));
    service.vaccinationsData = ['2021-01-10', '2021-01-15'].map((date, index) =>
        ({ location_key: 'TN', date, cumulative_persons_vaccinated: index * 100 }));
    service.demographicsData = [{ location_key: 'TN', population: 1000 }];
    service.validateDataStructure();
    service.buildCountryCodeMap();
    service.processData();
    service.setDefaultValues();
    await service.indexAllData();
    return { service, workspaces: createWorkspaces(service) };
}

test('workspaces inherit the globe only on first use and retain independent selections', async () => {
    const { service, workspaces } = await fixture();
    assert.equal(workspaces.peek('compare'), null);
    service.changeColumn('new_confirmed');
    service.currentDate = '2021-01-01';
    const compare = workspaces.ensure('compare');
    workspaces.update('compare', { category: 'hospitalizations', metric: 'current_hospitalized_patients' });
    assert.equal(compare.currentDate, '2021-01-06');
    assert.equal(service.currentDataset, 'epidem');
    assert.equal(service.currentDate, '2021-01-01');
    const country = workspaces.ensure('country');
    assert.equal(country.currentColumn, 'new_confirmed');
    service.changeDataset('vaccinations');
    assert.equal(workspaces.get('compare'), compare);
    assert.equal(compare.currentColumn, 'current_hospitalized_patients');
    assert.equal(country.currentColumn, 'new_confirmed');
});

test('workspace views share observations and caches without changing root query settings', async () => {
    const { service, workspaces } = await fixture();
    const country = workspaces.update('country', { category: 'hospitalizations', metric: 'current_hospitalized_patients' });
    assert.equal(country.indexedData, service.indexedData);
    assert.equal(country.seriesCache, service.seriesCache);
    assert.equal(country.metricDatesCache, service.metricDatesCache);
    const series = country.getCountrySeries('tn');
    assert.equal(series.at(-1).value, 10);
    assert.equal(service.getCountrySeries('tn').at(-1).value, 20);
    assert.equal(service.currentColumn, 'new_confirmed');
    assert.equal(country.getCountrySeries('tn'), series);
});

test('metric changes validate local units, reporting treatment and calendar bounds', async () => {
    const { service, workspaces } = await fixture();
    const country = workspaces.update('country', { category: 'epidem', metric: 'new_confirmed', unit: 'per1m', smoothing: '7day' });
    assert.equal(country.displayUnit, 'per1m');
    assert.equal(country.smoothing, '7day');
    workspaces.update('country', { category: 'vaccinations', metric: 'cumulative_persons_vaccinated', selectedDate: '2021-01-01' });
    assert.equal(country.displayUnit, 'count');
    assert.equal(country.smoothing, 'raw');
    assert.equal(country.currentDate, '2021-01-10');
    assert.equal(service.currentDataset, 'epidem');
    assert.equal(service.smoothing, 'raw');
    workspaces.update('country', { unit: 'percent', selectedDate: '2021-01-11' });
    assert.equal(country.currentDate, '2021-01-11');
    assert.equal(country.getDisplayValue('tn'), null, 'an unreported day stays unavailable');
});

test('global source replacement is inherited and unavailable local selections are revalidated', async () => {
    const { service, workspaces } = await fixture();
    const compare = workspaces.update('compare', { category: 'hospitalizations', metric: 'current_hospitalized_patients', unit: 'per100k' });
    service.indexedData = { ...service.indexedData };
    service.seriesCache = new Map();
    service.populationByCountry = {};
    service.dataSource = 'upload';
    service.availableColumns.hospitalizations = [];
    service.metricDatesCache = new Map();
    workspaces.revalidate();
    assert.equal(compare.indexedData, service.indexedData);
    assert.equal(compare.seriesCache, service.seriesCache);
    assert.equal(compare.dataSource, 'upload');
    assert.equal(compare.currentColumn, null);
    assert.equal(compare.currentDate, null);
    assert.equal(compare.displayUnit, 'count');
    assert.equal(compare.smoothing, 'raw');
});

test('every workspace recalls its last metric for each dataset and leaves active selections untouched', async () => {
    const { workspaces } = await fixture();
    for (const scope of ['country', 'compare']) workspaces.ensure(scope);
    for (const scope of ['globe', 'country', 'compare']) {
        const view = workspaces.get(scope);
        workspaces.switchDataset(scope, 'hospitalizations');
        assert.equal(view.currentColumn, 'current_hospitalized_patients', `${scope}: first visit uses the dataset default`);
        view.changeColumn('current_intensive_care_patients');
        const selected = workspaces.read(scope);
        workspaces.switchDataset(scope, 'hospitalizations');
        assert.deepEqual(workspaces.read(scope), selected, `${scope}: clicking the active dataset keeps its selection`);
        workspaces.switchDataset(scope, 'epidem');
        view.changeColumn('new_deceased');
        workspaces.switchDataset(scope, 'hospitalizations');
        assert.equal(view.currentColumn, 'current_intensive_care_patients', `${scope}: ICU selection survives a dataset switch`);
        workspaces.switchDataset(scope, 'epidem');
        assert.equal(view.currentColumn, 'new_deceased', `${scope}: the previous epidemic metric survives too`);
    }
});

test('remembered metrics remain independent between Globe, country analysis and Compare', async () => {
    const { workspaces } = await fixture();
    workspaces.ensure('country'); workspaces.ensure('compare');
    const metrics = { globe: 'current_intensive_care_patients', country: 'new_hospitalized_patients', compare: 'current_hospitalized_patients' };
    for (const [scope, metric] of Object.entries(metrics)) {
        workspaces.switchDataset(scope, 'hospitalizations');
        workspaces.get(scope).changeColumn(metric);
        workspaces.switchDataset(scope, 'vaccinations');
    }
    for (const [scope, metric] of Object.entries(metrics)) {
        workspaces.switchDataset(scope, 'hospitalizations');
        assert.equal(workspaces.get(scope).currentColumn, metric, `${scope}: another workspace must not replace its remembered metric`);
    }
});

test('returning to a dataset rejects a remembered column removed by a new data source', async () => {
    const { service, workspaces } = await fixture();
    workspaces.switchDataset('country', 'hospitalizations');
    workspaces.get('country').changeColumn('current_intensive_care_patients');
    workspaces.switchDataset('country', 'vaccinations');
    service.availableColumns.hospitalizations = ['current_hospitalized_patients'];
    service.metricDatesCache = new Map();
    workspaces.revalidate();
    workspaces.switchDataset('country', 'hospitalizations');
    assert.equal(workspaces.get('country').currentColumn, 'current_hospitalized_patients');
    workspaces.switchDataset('country', 'vaccinations');
    workspaces.switchDataset('country', 'hospitalizations');
    assert.equal(workspaces.get('country').currentColumn, 'current_hospitalized_patients', 'the valid fallback replaces the stale memory');
});

test('metric history snapshots restore inactive dataset choices without sharing mutable objects', async () => {
    const { workspaces } = await fixture();
    workspaces.switchDataset('country', 'hospitalizations');
    workspaces.get('country').changeColumn('new_hospitalized_patients');
    workspaces.switchDataset('country', 'vaccinations');
    const countrySettings = workspaces.read('country');
    const snapshot = workspaces.snapshotMetrics();
    assert.equal(snapshot.country.hospitalizations, 'new_hospitalized_patients');
    const { workspaces: restored } = await fixture();
    restored.restoreMetrics(snapshot);
    assert.equal(restored.peek('country'), null, 'restoring history alone does not initialize a workspace');
    snapshot.country.hospitalizations = 'current_intensive_care_patients';
    restored.ensure('country', countrySettings);
    restored.switchDataset('country', 'hospitalizations');
    assert.equal(restored.get('country').currentColumn, 'new_hospitalized_patients');
    workspaces.switchDataset('country', 'hospitalizations');
    assert.equal(workspaces.get('country').currentColumn, 'new_hospitalized_patients', 'a snapshot cannot mutate the original history');
});
