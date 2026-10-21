import test from 'node:test';
import assert from 'node:assert/strict';
import { csvParse } from 'd3';
import DataService from '../dataService/index.js';
import { METRICS, getMetricMetadata, getUnitLabel } from '../dataService/metrics.js';

globalThis.d3 = { csvParse };

async function fixture() {
    const service = new DataService({ useSampleData: false });
    service.countryIndex = [{ location_key: 'TN', country_name: 'Tunisia' }, { location_key: 'US', country_name: 'United States' }];
    service.demographicsData = [{ location_key: 'TN', population: 1000 }, { location_key: 'US', population: '' }];
    service.epidemData = [0, 14, null, 28, 35, null, -7, 14].flatMap((value, index) => value === null ? [] : [
        { location_key: 'TN', date: `2020-01-${String(index + 1).padStart(2, '0')}`, new_confirmed: value }
    ]);
    service.hospitalizationsData = [{ location_key: 'TN', date: '2020-01-01', current_hospitalized_patients: 10 }];
    service.vaccinationsData = [{ location_key: 'TN', date: '2020-01-01', cumulative_persons_vaccinated: 500, cumulative_vaccine_doses_administered: 2200 }];
    service.validateDataStructure();
    service.buildCountryCodeMap();
    service.processData();
    service.setDefaultValues();
    await service.indexAllData();
    await service.precalculateColors();
    return service;
}

test('metric registry makes units and smoothing depend on source meaning', () => {
    assert.deepEqual(METRICS.new_confirmed.allowedUnits, ['count', 'per100k']);
    assert.equal(METRICS.current_hospitalized_patients.kind, 'occupancy');
    assert.equal(METRICS.cumulative_confirmed.smoothingAllowed, false);
    assert.deepEqual(METRICS.cumulative_persons_vaccinated.allowedUnits, ['count', 'percent']);
    assert.deepEqual(getMetricMetadata('cumulative_vaccine_doses_administered_pfizer').allowedUnits, ['count', 'per100']);
    assert.equal(getUnitLabel('cumulative_vaccine_doses_administered', 'per100'), 'Doses per 100 people');
});

test('population-normalized observations preserve missingness, corrections and dose units', async () => {
    const service = await fixture();
    assert.equal(service.getPopulation(' TN '), 1000);
    assert.equal(service.getPopulation('US'), null);
    assert.equal(service.getDisplayValue('TN', { date: '2020-01-01', unit: 'per100k' }), 0);
    assert.equal(service.getDisplayValue('TN', { date: '2020-01-07', unit: 'per100k' }), -700);
    assert.equal(service.getDisplayValue('TN', { date: '2020-01-03' }), null);
    assert.equal(service.getDisplayValue('US', { date: '2020-01-01', unit: 'per100k' }), null);
    assert.equal(service.getDisplayValue('TN', { date: '2020-01-01', column: 'cumulative_persons_vaccinated', unit: 'percent' }), 50);
    assert.ok(Math.abs(service.getDisplayValue('TN', { date: '2020-01-01', column: 'cumulative_vaccine_doses_administered', unit: 'per100' }) - 220) < 1e-10);
    assert.equal(service.getDisplayValue('TN', { date: '2020-01-01', column: 'cumulative_vaccine_doses_administered', unit: 'percent' }), null);
});

test('seven-day means use calendar dates, at least five reports, and an observed selected day', async () => {
    const service = await fixture();
    assert.equal(service.getDisplayValue('TN', { date: '2020-01-07', smoothing: '7day' }), 14);
    assert.equal(service.getDisplayValue('TN', { date: '2020-01-08', smoothing: '7day' }), 16.8);
    assert.equal(service.getDisplayValue('TN', { date: '2020-01-07', smoothing: '7day', unit: 'per100k' }), 1400);
    assert.equal(service.getDisplayValue('TN', { date: '2020-01-05', smoothing: '7day' }), null);
    assert.equal(service.getDisplayValue('TN', { date: '2020-01-06', smoothing: '7day' }), null);
    delete service.indexedData.epidem.tn['2020-01-02'];
    assert.equal(service.getDisplayValue('TN', { date: '2020-01-07', smoothing: '7day' }), null);
    assert.equal(service.getDisplayValue('TN', { date: '2020-01-01', column: 'cumulative_persons_vaccinated', smoothing: '7day' }), 500);
});

test('series inserts calendar gaps and exposes raw reporting status without interpolating', async () => {
    const service = await fixture();
    const series = service.getCountrySeries('TN');
    assert.equal(series.length, 8);
    assert.deepEqual(series[2], { date: '2020-01-03', value: null, rawValue: null, reported: false, reportingCorrection: false });
    assert.equal(series[0].value, 0);
    assert.equal(series[6].reportingCorrection, true);
    assert.equal(service.getCountrySeries('TN'), series);
    assert.equal(service.getCountrySeries('TN', { smoothing: '7day' })[6].value, 14);
});

test('available dates use the metric reporting calendar and retain the global union', async () => {
    const service = await fixture();
    const globalDates = [...service.availableDates];
    const observed = service.getAvailableDates();
    assert.deepEqual(observed, ['2020-01-01', '2020-01-02', '2020-01-04', '2020-01-05', '2020-01-07', '2020-01-08']);
    assert.equal(observed, service.getAvailableDates());
    assert.deepEqual(service.getAvailableDates('cumulative_persons_vaccinated'), ['2020-01-01']);
    assert.deepEqual(service.getAvailableDates('unknown_metric'), []);
    service.changeDataset('hospitalizations');
    assert.deepEqual(service.getAvailableDates(), ['2020-01-01']);
    assert.deepEqual(service.availableDates, globalDates);
    service.changeDataset('epidem');
    assert.equal(service.getCountrySeries('tn', { smoothing: '7day' }).length, 8);
});

test('display domains and cached map colors change with units but remain fixed across dates', async () => {
    const service = await fixture();
    assert.deepEqual(service.getDisplayDomain(), [-7, 35]);
    const normalized = service.getDisplayDomain({ unit: 'per100k' });
    assert.equal(normalized[0], -700);
    assert.ok(Math.abs(normalized[1] - 3500) < 1e-10);
    service.currentDate = '2020-01-07';
    const countColor = service.getCountryColor('TN');
    service.displayUnit = 'per100k';
    assert.deepEqual(service.getColorScale().domain(), service.getDisplayDomain({ unit: 'per100k' }));
    assert.equal(service.getColorScale().colors().length, 6);
    const scale = service.getColorScale();
    assert.notEqual(scale(1), scale(100), 'Ordinary rates remain distinguishable below an extreme maximum');
    const breaks = scale.breaks();
    assert.equal(breaks.length, 7);
    assert.ok(Math.abs(breaks.at(-1) - normalized[1]) < 1e-8);
    assert.ok(breaks[3] < normalized[1] / 10, 'Logarithmic bands reveal smaller magnitudes');
    assert.ok(countColor);
    service.currentDate = '2020-01-01';
    assert.deepEqual(service.getColorScale().domain(), normalized);
});

test('initial date favors recent broad coverage while preserving sparse dates and zero reports', async () => {
    const service = await fixture();
    const selected = service.currentDate;
    service.dataByDate.epidem['2020-01-07'].push({ countryKey: 'us', date: '2020-01-07', new_confirmed: 0 });
    assert.equal(service.getSuggestedDate(), '2020-01-07');
    assert.equal(service.currentDate, selected, 'Finding a suggestion does not move the timeline');
    assert.equal(service.getAvailableDates().at(-1), '2020-01-08', 'Sparse archive tail remains accessible');
    assert.equal(service.getSuggestedDate('unknown_metric'), null);
});

test('optional population uploads are atomic and a four-file upload clears old denominators', async () => {
    const service = await fixture();
    const file = text => ({ name: 'fixture.csv', text: async () => text });
    const data = file('date,location_key,new_confirmed\n2020-01-01,TN,5\n');
    const index = file('location_key,country_name\nTN,Tunisia\n');
    await assert.rejects(service.processUploadedFiles(data, data, data, index, file('location_key,population\nTN,-1\n')), /invalid population/);
    assert.equal(service.getPopulation('TN'), 1000);
    await service.processUploadedFiles(data, data, data, index, file('location_key,population\nTN,500\n'));
    assert.equal(service.getPopulation('TN'), 500);
    assert.equal(service.getDisplayValue('TN', { unit: 'per100k' }), 1000);
    await service.processUploadedFiles(data, data, data, index);
    assert.equal(service.getPopulation('TN'), null);
    assert.equal(service.getDisplayValue('TN', { unit: 'per100k' }), null);
});

test('missing optional population endpoint keeps the historical count datasets usable', async t => {
    const service = new DataService();
    t.mock.method(globalThis, 'fetch', async url => url.endsWith('/demographics') ? { ok: false, status: 404 } : {
        ok: true, status: 200, text: async () => url.endsWith('/country-index') ? 'location_key,country_name\nTN,Tunisia\n' : 'date,location_key,new_confirmed\n2020-01-01,TN,10\n'
    });
    await service.loadData();
    assert.equal(service.dataSource, 'csv');
    assert.equal(service.getDataValue('TN'), 10);
    assert.equal(service.getPopulation('TN'), null);
});
