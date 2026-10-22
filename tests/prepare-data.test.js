import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { csvParse } from 'd3';
import { prepareData } from '../scripts/prepare-data.js';

test('country preprocessing streams quoted CSV, removes subregions, and protects existing output', async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'covid-prepare-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const source = path.join(root, 'source');
    const output = path.join(root, 'output');
    await mkdir(source);
    for (const file of ['epidemiology.csv', 'hospitalizations.csv', 'vaccinations.csv']) {
        await writeFile(path.join(source, file), 'date,location_key,new_confirmed\n2020-01-01,TN,0\n2020-01-01,US_CA,10\n2020-01-01,US,-2\n');
    }
    await writeFile(path.join(source, 'index.csv'), 'key,country_name,aggregation_level\nTN,"Tunisia, Republic of",0\nUS,"United\nStates",0\nUS_CA,California,1\n');
    const counts = await prepareData(source, output);
    assert.ok(Object.values(counts).every(count => count === 2));
    const index = csvParse(await readFile(path.join(output, 'small_index.csv'), 'utf8'));
    assert.equal(index[0].country_name, 'Tunisia, Republic of');
    assert.equal(index[1].country_name, 'United\nStates');
    const epidem = csvParse(await readFile(path.join(output, 'country_level_epidem.csv'), 'utf8'));
    assert.equal(epidem[1].new_confirmed, '-2');
    await assert.rejects(prepareData(source, output), /Output already exists/);
    assert.equal((await readdir(output)).length, 4);
});

test('optional demographics is country-only and implausible source dates produce a reviewable report', async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'covid-prepare-dates-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const source = path.join(root, 'source');
    const output = path.join(root, 'output');
    await mkdir(source);
    for (const file of ['epidemiology.csv', 'hospitalizations.csv', 'vaccinations.csv']) {
        await writeFile(path.join(source, file), 'date,location_key,new_confirmed\n0022-01-10,TN,10\n2019-03-30,TN,1\n2020-01-01,TN,-3\n2020-01-02,TN,\n');
    }
    await writeFile(path.join(source, 'index.csv'), 'location_key,country_name\nTN,Tunisia\n');
    await writeFile(path.join(source, 'demographics.csv'), 'location_key,population\nTN,1000\nTN_11,200\n');
    const counts = await prepareData(source, output);
    assert.equal(counts['country_level_demographics.csv'], 1);
    const demographics = csvParse(await readFile(path.join(output, 'country_level_demographics.csv'), 'utf8'));
    assert.equal(demographics[0].population, '1000');
    const epidem = csvParse(await readFile(path.join(output, 'country_level_epidem.csv'), 'utf8'));
    assert.equal(epidem[0].new_confirmed, '-3');
    assert.equal(epidem[1].new_confirmed, '');
    const report = JSON.parse(await readFile(path.join(output, 'prepare-report.json'), 'utf8'));
    assert.equal(report.minObservationDate, '2019-12-01');
    assert.equal(report.files['country_level_epidem.csv'].excludedInvalidDates, 2);
    assert.deepEqual(report.files['country_level_epidem.csv'].invalidDateExamples, [{ location_key: 'TN', date: '0022-01-10' }, { location_key: 'TN', date: '2019-03-30' }]);
});

test('preparation rejects duplicate or missing required headers and removes only its newly created files', async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'covid-prepare-headers-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const cases = [
        ['hospitalizations.csv', 'date,location_key,new_confirmed,new_confirmed\n2020-01-01,TN,1,99\n', /duplicate column headers/],
        ['epidemiology.csv', 'location_key,new_confirmed\nTN,1\n', /missing required date column/],
        ['index.csv', 'location_key\nTN\n', /missing required country_name or country column/],
        ['demographics.csv', 'location_key,population,population\nTN,1,99\n', /duplicate column headers/]
    ];
    for (const [index, [badFile, body, expected]] of cases.entries()) {
        const source = path.join(root, `source-${index}`), output = path.join(root, `output-${index}`);
        await mkdir(source);
        for (const file of ['epidemiology.csv', 'hospitalizations.csv', 'vaccinations.csv']) {
            await writeFile(path.join(source, file), 'date,location_key,new_confirmed\n2020-01-01,TN,1\n');
        }
        await writeFile(path.join(source, 'index.csv'), 'location_key,country_name\nTN,Tunisia\n');
        await writeFile(path.join(source, badFile), body);
        await assert.rejects(prepareData(source, output), expected);
        assert.deepEqual(await readdir(output), [], 'Earlier output files are rolled back on a later schema failure');
        assert.equal(await readFile(path.join(source, badFile), 'utf8'), body);
    }
});

test('an existing quality report prevents mixing old provenance with freshly prepared observations', async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'covid-prepare-report-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const source = path.join(root, 'source'), output = path.join(root, 'output');
    await mkdir(source); await mkdir(output);
    const report = '{"source":"earlier preparation","excludedInvalidDates":99}\n';
    await writeFile(path.join(output, 'prepare-report.json'), report);
    for (const file of ['epidemiology.csv', 'hospitalizations.csv', 'vaccinations.csv']) {
        await writeFile(path.join(source, file), 'date,location_key,new_confirmed\n2020-01-01,TN,1\n');
    }
    await writeFile(path.join(source, 'index.csv'), 'location_key,country_name\nTN,Tunisia\n');
    await assert.rejects(prepareData(source, output), /Output already exists: prepare-report.json/);
    assert.deepEqual(await readdir(output), ['prepare-report.json']);
    assert.equal(await readFile(path.join(output, 'prepare-report.json'), 'utf8'), report);
});
