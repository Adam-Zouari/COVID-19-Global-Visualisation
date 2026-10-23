import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import DataService from '../src/dataService/index.js';
import * as MetricRegistry from '../src/dataService/metrics.js';

const plain = value => JSON.parse(JSON.stringify(value));
const day = index => new Date(Date.UTC(2020, 0, 6 + index)).toISOString().slice(0, 10);

function models() {
    const context = vm.createContext({ window: { MetricRegistry } });
    vm.runInContext(readFileSync(new URL('../src/charts/analyticsData.js', import.meta.url), 'utf8'), context);
    return context.window.AnalyticsData;
}

async function fixture(length = 35) {
    const service = new DataService();
    service.countryIndex = [{ location_key: 'TN', country_name: 'Tunisia' }, { location_key: 'US', country_name: 'United States' }, { location_key: 'FR', country_name: 'France' }];
    service.demographicsData = [{ location_key: 'TN', population: 1000 }, { location_key: 'US', population: 2000 }, { location_key: 'FR', population: 1000 }];
    const daily = [0, 10, null, 10, -5, 10, 10];
    service.epidemData = Array.from({ length }, (_, index) => ['TN', 'US', 'FR'].map((location_key, country) => ({
        date: day(index), location_key, new_confirmed: country === 0 ? index < daily.length ? daily[index] : 10 : country === 1 ? 20 : 40,
        new_deceased: country === 0 ? 0 : country === 2 && index === 6 ? null : country * 4,
        cumulative_confirmed: country === 0 && index === 6 ? null : (country + 1) * (100 + index * 10),
        new_tested: country === 0 && index % 7 === 0 ? 0 : null
    }))).flat();
    service.hospitalizationsData = Array.from({ length }, (_, index) => ['TN', 'US', 'FR'].map((location_key, country) => ({
        date: day(index), location_key, current_hospitalized_patients: country === 0 ? index === 2 ? null : index === 0 ? 0 : 70 : 140,
        new_hospitalized_patients: country + index, cumulative_hospitalized_patients: 500 + index * 10
    }))).flat();
    service.vaccinationsData = Array.from({ length }, (_, index) => ['TN', 'US', 'FR'].map((location_key, country) => ({
        date: day(index), location_key, cumulative_persons_vaccinated: [600, 1000, 900][country],
        cumulative_persons_fully_vaccinated: country === 2 && index === 6 ? null : [400, 700, 800][country],
        cumulative_persons_fully_vaccinated_pfizer: (country + 1) * 100 + index,
        cumulative_vaccine_doses_administered: [1100, 2300, 1800][country]
    }))).flat();
    service.validateDataStructure(); service.buildCountryCodeMap(); service.processData(); service.setDefaultValues();
    await service.indexAllData();
    service.currentDate = day(6); service.smoothing = 'raw';
    return service;
}

test('metric choices can be limited to a dataset while retaining semantic unit restrictions', async () => {
    const service = await fixture(), options = models().getMetricOptions(service);
    assert.ok(options.some(option => option.value === 'new_confirmed'));
    assert.ok(options.some(option => option.value === 'current_hospitalized_patients'));
    assert.deepEqual(plain(options.find(option => option.value === 'cumulative_persons_fully_vaccinated').unitOptions), ['count', 'percent']);
    assert.equal(new Set(options.map(option => option.value)).size, options.length);
    for (const dataset of Object.keys(service.availableColumns)) {
        const scoped = models().getMetricOptions(service, dataset);
        assert.deepEqual(plain(scoped.map(option => option.value)), service.availableColumns[dataset]);
    }
    assert.equal(models().build('toString', service).emptyMessage, 'Choose a supported chart type.');
    for (const type of ['stacked', 'stacked100', 'radar', 'histogram']) {
        assert.equal(models().build(type, service).emptyMessage, 'Choose a supported chart type.');
    }
});

test('country rankings only use selected countries, preserve corrections and zero, and never truncate the selection', () => {
    const values = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`q${String.fromCharCode(97 + index)}`, 20 - index]));
    values.tn = -5; values.us = 0; values.xx = null;
    const service = { currentColumn: 'new_confirmed', currentDate: day(6),
        getAllCountries: () => Object.keys(values).map(countryCode => ({ countryCode })), getCountryName: code => code,
        getMetricMetadata: MetricRegistry.getMetricMetadata, getUnitLabel: MetricRegistry.getUnitLabel,
        getDisplayValue: code => values[code] };
    const api = models(), all = api.build('horizontal', service, { scope: 'compare', countries: Object.keys(values), unit: 'count' });
    assert.equal(all.items.length, 22);
    assert.equal(all.items[0].value, 20);
    assert.equal(all.items.at(-1).value, -5);
    assert.equal(all.items.at(-1).code, 'tn');
    assert.equal(all.items.at(-2).value, 0);
    const selected = api.build('horizontal', service, { scope: 'compare', countries: ['tn', 'qa', 'us', 'xx', 'missing', 'TN'], unit: 'count' });
    assert.deepEqual(plain(selected.items.map(item => item.code)), ['qa', 'us', 'tn']);
    assert.match(selected.note, /selected countries/);
});

test('country calendar heatmaps retain missing, zero, signed corrections, and nonexistent or out-of-range days', async () => {
    const result = models().build('heatmap', await fixture(), { scope: 'country', country: 'tn', smoothing: 'raw' });
    assert.equal(result.columns.length, 31);
    assert.deepEqual(plain(result.rows.map(row => row.key)), ['2020-01', '2020-02']);
    const cell = dayNumber => result.rows[0].cells[dayNumber - 1];
    assert.equal(cell(6).value, 0); assert.equal(cell(6).reportedDays, 1);
    assert.equal(cell(8).value, null); assert.equal(cell(8).reportedDays, 0); assert.equal(cell(8).expectedDays, 1);
    assert.equal(cell(10).value, -5);
    assert.equal(cell(5).expectedDays, 0);
    assert.equal(result.rows[1].cells[30].expectedDays, 0, 'February31 is not a missing observation');
});

test('comparison heatmaps sum raw additions, average occupancy and smoothed values, and disclose incomplete weeks', async () => {
    const service = await fixture(), api = models(), settings = { scope: 'compare', countries: ['tn', 'us'], startDate: day(0), endDate: day(13), smoothing: 'raw' };
    const totals = api.build('heatmap', service, settings), first = totals.rows[0].cells[0];
    assert.equal(first.value, 35); assert.equal(first.reportedDays, 6); assert.equal(first.expectedDays, 7); assert.equal(first.partial, true);
    assert.equal(totals.rows[1].cells[0].value, 140);
    assert.match(totals.note, /Totals of reported daily additions/);
    const occupancy = api.build('heatmap', service, { ...settings, column: 'current_hospitalized_patients' });
    assert.ok(Math.abs(occupancy.rows[0].cells[0].value - 350 / 6) < 1e-10);
    assert.match(occupancy.note, /patient snapshots/);
    const smoothed = api.build('heatmap', service, { ...settings, smoothing: '7day' });
    assert.equal(smoothed.rows[0].cells[0].availableDays, 1);
    assert.equal(smoothed.rows[0].cells[0].value, service.getDisplayValue('tn', { date: day(6), smoothing: '7day' }));
    assert.match(smoothed.note, /trailing seven-day averages/);
});

test('cumulative period heatmaps require the exact calendar endpoint and never carry a previous report', async () => {
    const result = models().build('heatmap', await fixture(), { scope: 'compare', countries: ['tn'], column: 'cumulative_confirmed', startDate: day(0), endDate: day(13) });
    assert.equal(result.rows[0].cells[0].value, null);
    assert.equal(result.rows[0].cells[1].value, 230);
    assert.match(result.note, /final selected calendar day/);
});

test('long heatmaps use at most40 calendar bins and do not create a prior-month column outside the requested period', async () => {
    const result = models().build('heatmap', await fixture(420), { scope: 'compare', countries: ['tn'], startDate: '2020-05-02', endDate: '2021-02-01', smoothing: 'raw' });
    assert.ok(result.columns.length <= 40);
    assert.equal(result.columns[0].key, '2020-05-01');
    assert.equal(result.rows[0].cells[0].value, 300);
    assert.equal(result.rows[0].cells[0].expectedDays, 31);
    assert.equal(result.rows[0].cells[0].selectedDays, 30);
    assert.equal(result.rows[0].cells[0].partial, true);
});

test('single-country scatterplots pair arbitrary columns on exact dates and retain zeros and corrections', async () => {
    const service = await fixture(), api = models();
    const settings = { scope: 'country', country: 'tn', startDate: day(0), endDate: day(6), xMetric: 'new_confirmed', yMetric: 'new_deceased', xUnit: 'count', yUnit: 'count' };
    const result = api.build('scatter', service, settings);
    assert.equal(result.dimensions, 2);
    assert.deepEqual(plain(result.items.map(item => [item.date, item.x, item.y])), [0, 1, 3, 4, 5, 6].map(index => [day(index), [0, 10, null, 10, -5, 10, 10][index], 0]));
    assert.match(result.subtitle, /Tunisia/);
    const cross = api.build('scatter', service, { ...settings, xMetric: 'current_hospitalized_patients', yMetric: 'cumulative_persons_fully_vaccinated', yUnit: 'percent' });
    assert.equal(cross.items.length, 6);
    assert.deepEqual(plain(cross.items[0]), { date: day(0), x: 0, y: 40 });
    assert.match(cross.note, /does not establish causation/);
    assert.ok(cross.items.every(item => !Object.hasOwn(item, 'z')));
    assert.equal(api.build('scatter', service, { ...settings, startDate: day(6), endDate: day(0) }).items.length, 0);
});

test('cross-dataset scatter joins actual reports by calendar date without borrowing adjacent values', async () => {
    const service = await fixture(7), api = models();
    service.hospitalizationsData = service.hospitalizationsData.filter(row => row.country_key !== 'tn' || ![day(1), day(6)].includes(row.date));
    service.epidemData = service.epidemData.filter(row => row.country_key !== 'tn' || row.date !== day(5));
    await service.indexAllData();
    const settings = { scope: 'country', country: 'tn', xMetric: 'current_hospitalized_patients', xUnit: 'per100k',
        yMetric: 'new_confirmed', yUnit: 'count', smoothing: 'raw', startDate: day(0), endDate: day(6) };
    const result = api.build('scatter', service, settings);
    assert.deepEqual(plain(result.items.map(({ date, y }) => ({ date, y }))), [
        { date: day(0), y: 0 }, { date: day(3), y: 10 }, { date: day(4), y: -5 }
    ]);
    result.items.forEach((item, index) => assert.ok(Math.abs(item.x - (index ? 7000 : 0)) < 1e-8));
    assert.match(result.xLabel, /Currently hospitalized patients.*Per 100,000 people.*Daily snapshot/);
    assert.match(result.yLabel, /New confirmed cases.*Count.*Daily reports/);
    assert.deepEqual(plain(api.build('scatter', service, { ...settings, startDate: day(1), endDate: day(5) }).items), plain(result.items.slice(1)));
    const empty = api.build('scatter', service, { ...settings, startDate: day(5), endDate: day(6) });
    assert.equal(empty.items.length, 0);
    assert.match(empty.emptyMessage, /No exact shared dates/);
});

test('comparison scatterplots use countries as two or three axes and require exact shared calendar reports', async () => {
    const service = await fixture(), api = models(), settings = { scope: 'compare', countries: ['tn', 'us'], column: 'new_confirmed', unit: 'count', startDate: day(0), endDate: day(6) };
    const pair = api.build('scatter', service, settings);
    assert.equal(pair.dimensions, 2);
    assert.deepEqual(plain(pair.axes.map(axis => [axis.code, axis.label])), [['tn', 'Tunisia'], ['us', 'United States']]);
    assert.equal(pair.items.length, 6);
    assert.deepEqual(plain(pair.items[0]), { date: day(0), x: 0, y: 20 });
    assert.equal(pair.items.find(item => item.date === day(4)).x, -5);
    const triple = api.build('scatter', service, { ...settings, countries: ['tn', 'us', 'fr'], column: 'new_deceased' });
    assert.equal(triple.dimensions, 3);
    assert.equal(triple.items.length, 6);
    assert.deepEqual(plain(triple.items.at(-1)), { date: day(5), x: 0, y: 4, z: 8 });
    assert.match(triple.subtitle, /New reported deaths/);
    assert.match(api.build('scatter', service, { ...settings, countries: ['tn'] }).emptyMessage, /two countries.*three countries/);
    service.getAllCountries = () => ['tn', 'us', 'fr', 'de'].map(countryCode => ({ countryCode }));
    const tooMany = api.build('scatter', service, { ...settings, countries: ['tn', 'us', 'fr', 'de'] });
    assert.match(tooMany.emptyMessage, /two countries.*three countries/);
    assert.equal(tooMany.items.length, 0);
});

test('scatter axes disclose actual daily, averaged, occupancy and cumulative reporting treatments independently', async () => {
    const service = await fixture(), api = models(), settings = { scope: 'country', country: 'tn', startDate: day(6), endDate: day(6),
        xMetric: 'current_hospitalized_patients', yMetric: 'cumulative_persons_fully_vaccinated', xUnit: 'count', yUnit: 'percent' };
    const averaged = api.build('scatter', service, { ...settings, smoothing: '7day' });
    assert.match(averaged.xLabel, /Currently hospitalized patients.*7-day mean occupancy/);
    assert.match(averaged.yLabel, /People fully vaccinated.*Reported cumulative/);
    assert.doesNotMatch(averaged.yLabel, /7-day|average/);
    assert.equal(averaged.items[0].x, service.getDisplayValue('tn', { column: settings.xMetric, unit: 'count', smoothing: '7day' }));
    assert.equal(averaged.items[0].y, 40);
    const raw = api.build('scatter', service, { ...settings, smoothing: 'raw' });
    assert.match(raw.xLabel, /Daily snapshot/);
    assert.equal(raw.items[0].x, 70);
    assert.notEqual(raw.items[0].x, averaged.items[0].x);
    const daily = api.build('scatter', service, { ...settings, xMetric: 'new_confirmed', smoothing: 'raw' });
    assert.match(daily.xLabel, /Daily reports/);
    assert.match(api.build('scatter', service, { ...settings, xMetric: 'new_confirmed', smoothing: '7day' }).xLabel, /7-day average/);
    assert.equal(service.smoothing, 'raw', 'Chart-specific treatment does not change the globe settings');
});

test('retained chart models accept loaded columns outside the original fixed metric list', async () => {
    const service = await fixture(), api = models(), column = 'cumulative_persons_fully_vaccinated_pfizer';
    const choice = api.getMetricOptions(service).find(option => option.value === column);
    assert.ok(choice);
    assert.match(choice.label, /Pfizer/);
    const settings = { scope: 'compare', countries: ['tn', 'us'], column, unit: 'percent', smoothing: 'raw', startDate: day(0), endDate: day(6) };
    for (const type of ['horizontal', 'heatmap', 'box', 'dumbbell']) {
        const result = api.build(type, service, settings);
        assert.equal(result.emptyMessage, undefined, type);
        assert.match(result.subtitle, /Pfizer/, type);
    }
    const snapshot = api.build('horizontal', service, settings);
    assert.equal(snapshot.items.find(item => item.code === 'tn').value, 10.6);
    for (const type of ['heatmap', 'box']) {
        const result = api.build(type, service, { ...settings, scope: 'country', country: 'tn' });
        assert.equal(result.emptyMessage, undefined, type);
        if (type === 'box') assert.deepEqual(plain(result.groups.map(group => group.code)), ['tn']);
    }
    const scatter = api.build('scatter', service, { ...settings, scope: 'country', country: 'tn', xMetric: column, xUnit: 'percent', yMetric: 'current_hospitalized_patients', yUnit: 'count' });
    assert.equal(scatter.items.length, 6);
    assert.match(scatter.xLabel, /Pfizer/);
    assert.equal(scatter.items[0].x, 10);
});

test('box distributions retain actual displayed values in the range, including zero and corrections', async () => {
    const result = models().build('box', await fixture(), { scope: 'compare', countries: ['tn', 'us'], startDate: day(0), endDate: day(6), smoothing: 'raw' });
    assert.deepEqual(plain(result.groups[0].values), [0, 10, 10, -5, 10, 10]);
    assert.equal(result.groups[1].values.length, 7);
    assert.equal(result.groups[0].observations, undefined);
    assert.match(result.note, /not a distribution of people/);
});

test('dumbbells use shared observed endpoints, retain zero, exclude missing endpoints, and average before range filtering', async () => {
    const service = await fixture(), api = models(), settings = { scope: 'compare', countries: ['tn', 'us', 'fr'], startDate: day(6), endDate: day(13) };
    const deaths = api.build('dumbbell', service, { ...settings, column: 'new_deceased', smoothing: 'raw' });
    assert.deepEqual(plain(deaths.items.map(item => item.code)), ['tn', 'us']);
    assert.equal(deaths.items[0].start, 0); assert.equal(deaths.items[0].end, 0); assert.equal(deaths.warnings.length, 1);
    const averages = api.build('dumbbell', service, { ...settings, countries: ['tn'], smoothing: '7day' });
    assert.equal(averages.items[0].start, service.getDisplayValue('tn', { date: day(6), smoothing: '7day' }));
    assert.match(averages.note, /original full trailing calendar windows/);
});

test('invalid periods and absent selections return reviewable empty messages without changing service state', async () => {
    const service = await fixture(), api = models(), before = { date: service.currentDate, column: service.currentColumn, category: service.currentDataset };
    for (const type of ['horizontal', 'heatmap', 'box', 'dumbbell', 'scatter']) {
        const result = api.build(type, service, { scope: 'compare', countries: [], startDate: '2020-02-30', endDate: day(1) });
        assert.ok(result.emptyMessage, type);
    }
    assert.deepEqual({ date: service.currentDate, column: service.currentColumn, category: service.currentDataset }, before);
});
