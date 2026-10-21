import test from 'node:test';
import assert from 'node:assert/strict';
import { csvParse } from 'd3';
import DataService from '../dataService/index.js';
import { formatDate, formatNumber } from '../dataService/utils.js';

globalThis.d3 = { csvParse };

function fixture() {
    const service = new DataService({ useSampleData: false });
    service.countryIndex = [
        { location_key: 'US', country_name: 'United States', aggregation_level: '0' },
        { location_key: 'FR', country_name: 'France', aggregation_level: '0' },
        { location_key: 'US_CA', country_code: 'US', country_name: 'United States', aggregation_level: '1' }
    ];
    const rows = [
        { location_key: 'US', date: '2020-01-01', new_confirmed: '0', cumulative_confirmed: '' },
        { location_key: 'FR', date: '2020-01-01', new_confirmed: '-4', cumulative_confirmed: '100' },
        { location_key: 'US_CA', country_code: 'US', date: '2020-01-01', new_confirmed: '999', cumulative_confirmed: '999' },
        { location_key: 'US', date: '2022-12-31', new_confirmed: '10', cumulative_confirmed: '1000' }
    ];
    service.epidemData = structuredClone(rows);
    service.hospitalizationsData = structuredClone(rows);
    service.vaccinationsData = structuredClone(rows);
    return service;
}

async function prepare(service) {
    service.validateDataStructure();
    service.buildCountryCodeMap();
    service.processData();
    service.setDefaultValues();
    await service.indexAllData();
    await service.precalculateColors();
    return service;
}

test('official location keys normalize without adding subregions to country totals', async () => {
    const service = await prepare(fixture());
    assert.equal(service.countryIndex.length, 2);
    assert.equal(service.epidemData.length, 3);
    assert.deepEqual(service.availableColumns.epidem, ['new_confirmed', 'cumulative_confirmed']);
    assert.deepEqual(service.availableDates, ['2020-01-01', '2022-12-31']);
    assert.equal(service.getCountryKeyFromName('United States of America'), 'us');
    assert.equal(service.getCountryName(' US '), 'United States');
    assert.equal(service.getAllCountries().length, 2);
});

test('reported zero, missing values and negative corrections stay distinct', async () => {
    const service = await prepare(fixture());
    service.changeDate('2020-01-01');
    assert.equal(service.getDataValue('US'), 0);
    assert.equal(service.getDataValue('fr'), -4);
    assert.equal(service.getDataValue('xx'), null);
    assert.notEqual(service.getCountryColor('us'), service.getDefaultColor());
    assert.notEqual(service.getCountryColor('fr'), service.getDefaultColor());
    service.changeColumn('cumulative_confirmed');
    assert.equal(service.getDataValue('us'), null);
    assert.equal(service.getCountryColor('us'), service.getDefaultColor());
});

test('queries do not silently substitute a different date for a missing report', async () => {
    const service = await prepare(fixture());
    assert.equal(service.currentDate, '2022-12-31');
    assert.equal(service.getCountryData('fr'), null);
    assert.equal(service.getDataForDate('epidem', service.currentDate).length, 1);
    assert.equal(service.getCountryData('us').date, service.currentDate);
    assert.equal(service.changeDate('2021-01-01'), false);
    assert.throws(() => service.changeDataset('__proto__'), /Unknown dataset/);
});

test('older Google key headers and country_key exports are accepted', async () => {
    for (const field of ['key', 'country_key']) {
        const service = fixture();
        for (const property of ['epidemData', 'hospitalizationsData', 'vaccinationsData', 'countryIndex']) {
            service[property] = service[property].map(({ location_key, ...row }) => ({ ...row, [field]: location_key }));
        }
        await prepare(service);
        assert.equal(service.getCountryData('us').new_confirmed, 10);
    }
});

test('invalid dates, numbers, duplicate records and missing headers are rejected', () => {
    const cases = [
        [row => { row.date = '2020-02-30'; }, /invalid date/],
        [row => { row.new_confirmed = '12cases'; }, /invalid numeric/],
        [row => { delete row.date; }, /invalid date/]
    ];
    for (const [mutate, expected] of cases) {
        const service = fixture();
        mutate(service.epidemData[0]);
        assert.throws(() => service.validateDataStructure(), expected);
    }
    const duplicate = fixture();
    duplicate.epidemData.push({ ...duplicate.epidemData[0] });
    assert.throws(() => duplicate.validateDataStructure(), /duplicate country\/date/);
    const noDates = fixture();
    noDates.epidemData = [{ key: 'US', new_confirmed: 1 }];
    assert.throws(() => noDates.validateDataStructure(), /missing required date/);
    const noIndex = fixture();
    noIndex.countryIndex = [];
    assert.throws(() => noIndex.validateDataStructure(), /country index is empty/);
});

test('failed upload preserves loaded records, indexes and source; successful upload updates all', async () => {
    const service = await prepare(fixture());
    const previousRecords = service.epidemData;
    const previousIndex = service.indexedData;
    const file = text => ({ name: 'test.csv', text: async () => text });
    const data = file('date,location_key,new_confirmed\n2021-01-01,US,5\n');
    const index = file('location_key,country_name\nUS,United States\n');
    await assert.rejects(service.processUploadedFiles(file('bad,header\na,b\n'), data, data, index), /date column/);
    assert.equal(service.epidemData, previousRecords);
    assert.equal(service.indexedData, previousIndex);
    assert.equal(service.dataSource, 'csv');
    await service.processUploadedFiles(data, data, data, index);
    assert.equal(service.dataSource, 'upload');
    assert.equal(service.useSampleData, false);
    assert.equal(service.currentDate, '2021-01-01');
    assert.equal(service.getDataValue('us'), 5);
    assert.equal(service.getCountryData('fr'), null);
});

test('CSV uploads handle BOM and quoted fields and reject duplicate headers', async () => {
    const service = new DataService();
    const file = text => ({ text: async () => text });
    const rows = await service.readCSVFile(file('\uFEFFlocation_key,country_name\nUS,"United States, example"\n'));
    assert.equal(rows[0].location_key, 'US');
    assert.equal(rows[0].country_name, 'United States, example');
    await assert.rejects(service.readCSVFile(file('date,date\na,b')), /duplicate column/);
    await assert.rejects(service.readCSVFile(file('  ')), /empty/);
});

test('API CSV ingestion strips BOM and rejects duplicate headers without replacing loaded data', async t => {
    const service = new DataService({ useSampleData: false });
    const observations = '\uFEFFdate,location_key,new_confirmed\n2020-01-01,TN,0\n2020-01-01,US,-2\n';
    const index = '\uFEFFlocation_key,country_name\nTN,Tunisia\nUS,United States\n';
    const bodies = new Map(Object.entries(service.apiEndpoints).map(([name, url]) =>
        [url, name === 'countryIndex' ? index : name === 'demographics' ? 'location_key,population\nTN,1000\nUS,2000\n' : observations]));
    const requests = [];
    t.mock.method(globalThis, 'fetch', async url => {
        requests.push(url);
        assert.ok(bodies.has(url));
        // Keep the BOM in the mocked decoded response; csvParse itself retains it.
        return { ok: true, status: 200, text: async () => bodies.get(url) };
    });
    assert.equal(Object.hasOwn(csvParse(observations)[0], 'date'), false);
    await service.loadData();
    assert.deepEqual(new Set(requests), new Set(Object.values(service.apiEndpoints)));
    assert.equal(service.dataSource, 'csv');
    assert.equal(service.getCountryName('TN'), 'Tunisia');
    assert.equal(service.getDataValue('TN'), 0);
    assert.equal(service.getDataValue('US'), -2);
    const records = service.epidemData;
    const indexed = service.indexedData;
    bodies.set(service.apiEndpoints.epidem,
        '\uFEFFdate,location_key,new_confirmed,new_confirmed\n2020-01-01,TN,1,2\n');
    await assert.rejects(service.loadData(), /duplicate column headers/);
    assert.equal(service.epidemData, records);
    assert.equal(service.indexedData, indexed);
    assert.equal(service.getDataValue('TN'), 0);
});

test('sample data is deterministic, dated historically and internally consistent', async () => {
    const service = new DataService({ useSampleData: true });
    const result = await service.loadData();
    assert.equal(service.dataSource, 'sample');
    assert.equal(service.currentDate, '2022-12-31');
    assert.equal(service.availableDates.length, 1096);
    assert.equal(service.countryIndex.length, 31);
    assert.equal(result.epidemData, service.epidemData);
    assert.deepEqual(service.epidemData.slice(0, 20), service.generateSampleEpidemData().slice(0, 20));
    const totals = new Map();
    for (const row of service.epidemData) {
        const previous = totals.get(row.country_key) || 0;
        assert.equal(row.cumulative_confirmed, previous + row.new_confirmed);
        assert.ok(row.cumulative_deceased <= row.cumulative_confirmed);
        totals.set(row.country_key, row.cumulative_confirmed);
    }
    for (const row of service.vaccinationsData) {
        assert.ok(row.cumulative_persons_fully_vaccinated <= row.cumulative_persons_vaccinated);
        assert.ok(row.cumulative_vaccine_doses_administered >= row.cumulative_persons_vaccinated);
        if (row.date < '2020-12-01') assert.equal(row.new_persons_vaccinated, 0);
    }
    service.changeDataset('hospitalizations');
    assert.equal(service.currentColumn, 'current_hospitalized_patients');
});

test('colors use the same numeric domain across dates and have a bounded cache', async () => {
    const service = await prepare(fixture());
    assert.deepEqual(service.getColorScale().domain(), [-4, 10]);
    const color = service.getColorScale()(10);
    service.changeDate('2020-01-01');
    assert.equal(service.getColorScale()(10), color);
    assert.equal(service.colorCache.size, 0);
    for (let i = 0; i < 3000; i++) {
        const date = new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10);
        service.indexedData.epidem.us[date] = { country_key: 'us', date, new_confirmed: i };
        service.currentDate = date;
        service.getCountryColor('us');
    }
    assert.ok(service.colorCache.size > 0);
    assert.ok(service.colorCache.size <= 2048);
});

test('appearance-specific color caches preserve observations and restore the original dark palette', async t => {
    const previousWindow = globalThis.window;
    let theme = 'dark';
    globalThis.window = { AtlasTheme: { getResolvedTheme: () => theme } };
    t.after(() => {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    });
    const service = await prepare(fixture());
    service.changeDate('2020-01-01');
    const records = service.epidemData, index = service.indexedData;
    const dark = service.getCountryColor('us');
    const darkMissing = service.getDefaultColor();
    const darkCorrection = service.getCountryColor('fr');
    const darkScale = service.getColorScale();
    assert.equal(dark, '#68434c');
    assert.equal(darkMissing, '#475569');
    assert.deepEqual(darkScale.colors(), ['#68434c', '#894550', '#ae505c', '#d2656b', '#ef9290', '#ffd0bd']);
    theme = 'light';
    assert.equal(service.getCachedColor('us', service.currentDate), null, 'Dark cached colors cannot leak into the light globe');
    const light = service.getCountryColor('us');
    const lightScale = service.getColorScale();
    assert.notEqual(light, dark);
    assert.notEqual(service.getCountryColor('fr'), darkCorrection);
    assert.notEqual(service.getDefaultColor(), darkMissing);
    assert.equal(lightScale(null), service.getDefaultColor());
    assert.equal(lightScale(0), light);
    assert.deepEqual(lightScale.domain(), darkScale.domain());
    assert.deepEqual(lightScale.breaks(), darkScale.breaks(), 'Appearance cannot alter numeric color bands');
    assert.equal(lightScale.type, darkScale.type);
    assert.equal(service.getDataValue('us'), 0);
    assert.equal(service.getDataValue('fr'), -4);
    assert.equal(service.epidemData, records);
    assert.equal(service.indexedData, index);
    service.getDisplayValue = () => { throw new Error('Switching back should reuse the appearance-specific cache'); };
    theme = 'dark';
    assert.equal(service.getCountryColor('US'), dark);
    theme = 'light';
    assert.equal(service.getCountryColor('US'), light);
});

test('light palettes darken with larger observations and distinguish zero, missing and corrections', async t => {
    const previousWindow = globalThis.window;
    globalThis.window = { AtlasTheme: { getResolvedTheme: () => 'light' } };
    t.after(() => {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    });
    const service = await prepare(fixture());
    const luminance = hex => {
        const rgb = hex.slice(1).match(/../g).map(channel => parseInt(channel, 16) / 255)
            .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    for (const dataset of ['epidem', 'hospitalizations', 'vaccinations']) {
        service.currentDataset = dataset;
        const scale = service.getColorScale(), colors = scale.colors();
        assert.equal(colors.length, 6);
        assert.equal(scale(0), colors[0]);
        assert.equal(scale(scale.domain()[1]), colors.at(-1));
        for (let index = 1; index < colors.length; index++) {
            assert.ok(luminance(colors[index - 1]) > luminance(colors[index]), `${dataset} light palette must darken toward high values`);
        }
        assert.equal(new Set([scale(0), scale(null), scale(-4)]).size, 3);
    }
});

test('formatting keeps UTC calendar dates and preserves missing versus zero', () => {
    assert.equal(formatDate('2020-01-01'), 'Jan 1, 2020');
    assert.equal(formatDate('2020-02-30'), '');
    assert.equal(formatNumber(0), '0');
    assert.equal(formatNumber(''), '—');
    assert.equal(formatNumber(null), '—');
    assert.equal(formatNumber(-4), '-4');
});
