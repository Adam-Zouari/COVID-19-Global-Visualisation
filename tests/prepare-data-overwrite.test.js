import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, unlink, symlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { prepareData } from '../scripts/prepare-data.js';

const run = promisify(execFile);
const script = fileURLToPath(new URL('../scripts/prepare-data.js', import.meta.url));
const observations = ['epidemiology.csv', 'hospitalizations.csv', 'vaccinations.csv'];

async function fixture(t) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'covid-overwrite-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const source = path.join(root, 'source'), output = path.join(root, 'output');
    await mkdir(source);
    await writeSource(source, 3);
    return { root, source, output };
}

async function writeSource(source, value) {
    for (const name of observations) {
        await writeFile(path.join(source, name), `date,location_key,new_confirmed\n2020-01-01,TN,${value}\n2020-01-01,TN_11,999\n`);
    }
    await writeFile(path.join(source, 'index.csv'), 'location_key,country_name\nTN,Tunisia\n');
}

async function snapshot(directory) {
    const entries = await readdir(directory);
    return Object.fromEntries(await Promise.all(entries.sort().map(async name =>
        [name, await readFile(path.join(directory, name), 'utf8')])));
}

test('overwrite replaces the prepared set without touching source or unrelated files', async t => {
    const { source, output } = await fixture(t);
    await prepareData(source, output);
    await writeFile(path.join(output, 'notes.txt'), 'Keep this file.');
    await writeSource(source, -7);
    const originals = await snapshot(source);

    const counts = await prepareData(source, output, { overwrite: true });

    assert.deepEqual(await snapshot(source), originals);
    assert.equal(await readFile(path.join(output, 'notes.txt'), 'utf8'), 'Keep this file.');
    for (const name of ['country_level_epidem.csv', 'country_level_hospitalizations.csv', 'country_level_vaccinations.csv']) {
        assert.equal(counts[name], 1);
        assert.equal(await readFile(path.join(output, name), 'utf8'), 'date,location_key,new_confirmed\n2020-01-01,TN,-7\n');
    }
    assert.equal((await readdir(output)).length, 5, 'No staging or backup files remain');
});

test('overwrite drops obsolete optional population and quality-report files', async t => {
    const { source, output } = await fixture(t);
    await writeFile(path.join(source, 'demographics.csv'), 'location_key,population\nTN,1000\n');
    await writeFile(path.join(source, 'hospitalizations.csv'), 'date,location_key,new_confirmed\n2019-03-30,TN,99\n2020-01-01,TN,3\n');
    await prepareData(source, output);
    assert.ok((await readdir(output)).includes('prepare-report.json'));
    assert.ok((await readdir(output)).includes('country_level_demographics.csv'));

    await unlink(path.join(source, 'demographics.csv'));
    await writeSource(source, 4);
    await prepareData(source, output, { overwrite: true });

    assert.deepEqual((await readdir(output)).sort(), [
        'country_level_epidem.csv', 'country_level_hospitalizations.csv',
        'country_level_vaccinations.csv', 'small_index.csv'
    ]);
});

test('a later schema failure during overwrite preserves every previous output', async t => {
    const { source, output } = await fixture(t);
    await writeFile(path.join(source, 'demographics.csv'), 'location_key,population\nTN,1000\n');
    await prepareData(source, output);
    await writeFile(path.join(output, 'prepare-report.json'), '{"source":"previous run"}\n');
    const previous = await snapshot(output);
    await writeSource(source, 10);
    await writeFile(path.join(source, 'demographics.csv'), 'location_key,population,population\nTN,1000,2000\n');

    await assert.rejects(prepareData(source, output, { overwrite: true }), /duplicate column headers/);

    assert.deepEqual(await snapshot(output), previous);
});

test('overwrite refuses to prepare into the source directory', async t => {
    const { source } = await fixture(t);
    const previous = await snapshot(source);
    await assert.rejects(prepareData(source, source, { overwrite: true }), /source.*destination|different.*director/i);
    assert.deepEqual(await snapshot(source), previous);
});

test('overwrite refuses a directory at a managed output filename', async t => {
    const { source, output } = await fixture(t);
    await prepareData(source, output);
    const target = path.join(output, 'country_level_hospitalizations.csv');
    await unlink(target);
    await mkdir(target);
    await writeFile(path.join(target, 'keep.txt'), 'Do not remove.');
    const oldEpidem = await readFile(path.join(output, 'country_level_epidem.csv'), 'utf8');
    await writeSource(source, 10);

    await assert.rejects(prepareData(source, output, { overwrite: true }), /director|regular file/i);

    assert.equal(await readFile(path.join(target, 'keep.txt'), 'utf8'), 'Do not remove.');
    assert.equal(await readFile(path.join(output, 'country_level_epidem.csv'), 'utf8'), oldEpidem);
});

test('overwrite detects a directory alias of the source', async t => {
    const { root, source } = await fixture(t);
    const alias = path.join(root, 'source-alias');
    try { await symlink(source, alias, process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) {
        if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
        t.skip('Creating directory links is unavailable in this environment.');
        return;
    }
    const previous = await snapshot(source);
    await assert.rejects(prepareData(source, alias, { overwrite: true }), /source.*destination|different.*director/i);
    assert.deepEqual(await snapshot(source), previous);
});

test('the CLI accepts --overwrite and rejects unsupported flags', async t => {
    const { source, output } = await fixture(t);
    await prepareData(source, output);
    for (const [value, args] of [[11, [source, output, '--overwrite']], [12, ['--overwrite', source, output]]]) {
        await writeSource(source, value);
        const result = await run(process.execPath, [script, ...args]);
        assert.match(result.stdout, /country_level_epidem/);
        assert.match(await readFile(path.join(output, 'country_level_epidem.csv'), 'utf8'), new RegExp(`TN,${value}`));
    }
    const previous = await snapshot(output);
    await assert.rejects(run(process.execPath, [script, source, output, '--overwite']), error => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /unknown|unsupported|usage/i);
        return true;
    });
    assert.deepEqual(await snapshot(output), previous);
});
