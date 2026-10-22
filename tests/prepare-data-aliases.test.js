import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { csvParse } from 'd3';
import { prepareData } from '../scripts/prepare-data.js';
import DataService from '../src/dataService/index.js';

test('preprocessing legacy country_key exports produces files accepted by the data service', async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'covid-prepare-aliases-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const source = path.join(root, 'source');
    const output = path.join(root, 'output');
    await mkdir(source);
    for (const name of ['country_level_epidem.csv', 'country_level_hopitalizations.csv', 'country_level_vaccinations.csv']) {
        await writeFile(path.join(source, name),
            'date,country_key,new_confirmed\n2020-01-01,TN,0\n2020-01-01,US_CA,999\n2020-01-01,US,-2\n');
    }
    await writeFile(path.join(source, 'small_index.csv'),
        'country_key,country_name,aggregation_level\nTN,Tunisia,0\nUS,United States,0\nUS_CA,California,1\n');
    const counts = await prepareData(source, output);
    assert.ok(Object.values(counts).every(count => count === 2));
    const read = async name => csvParse(await readFile(path.join(output, name), 'utf8'));
    const service = new DataService({ useSampleData: false });
    service.epidemData = await read('country_level_epidem.csv');
    service.hospitalizationsData = await read('country_level_hospitalizations.csv');
    service.vaccinationsData = await read('country_level_vaccinations.csv');
    service.countryIndex = await read('small_index.csv');
    service.validateDataStructure();
    service.buildCountryCodeMap();
    service.processData();
    service.setDefaultValues();
    await service.indexAllData();
    assert.equal(service.countryIndex.length, 2);
    assert.equal(service.getDataValue('TN'), 0);
    assert.equal(service.getDataValue('US'), -2);
    assert.equal(service.getCountryData('US_CA'), null);
});
