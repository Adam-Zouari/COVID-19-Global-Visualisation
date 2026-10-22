import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/server.js';

test('server serves app assets and CSV aliases without exposing repository or data directories', async t => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'covid-server-'));
    const server = createApp({ dataDirectory: directory }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        await rm(directory, { recursive: true, force: true });
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const index = await fetch(base);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /src\/app\.js/);
    assert.equal(index.headers.get('x-content-type-options'), 'nosniff');
    for (const asset of ['/vendor/d3.min.js', '/vendor/topojson-client.min.js', '/assets/world/countries-110m.json',
        '/assets/icons/atlas.svg', '/src/app.js', '/src/ui/theme.js', '/src/ui/view.js', '/src/dataService/DataService.js',
        '/styles/main.css', '/styles/charts.css', '/styles/compare.css']) {
        assert.equal((await fetch(base + asset)).status, 200, asset);
    }
    for (const hidden of ['/.git/config', '/package.json', '/server/server.js', '/tests/server.test.js', '/data/secret.csv',
        '/docs/AUDIT.md', '/docs/design/', '/scripts/prepare-data.js', '/src/',
        '/app.js', '/styles.css', '/ui/theme.js', '/charts/chartFactory.js', '/globe/GlobeVis.js', '/dataService/index.js',
        '/api/list-files', '/api/toString', '/missing.js']) {
        const result = await fetch(base + hidden);
        assert.equal(result.status, 404, hidden);
        assert.match(result.headers.get('content-type'), /json/);
    }
    const unavailable = await fetch(base + '/api/epidem');
    assert.equal(unavailable.status, 404);
    assert.doesNotMatch(await unavailable.text(), new RegExp(directory.replaceAll('\\', '\\\\')));
    await writeFile(path.join(directory, 'epidemiology.csv'), 'date,location_key,new_confirmed\n2020-01-01,TN,0\n');
    const csv = await fetch(base + '/api/epidem');
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.match(await csv.text(), /2020-01-01,TN,0/);
    assert.equal((await fetch(base + '/api/demographics')).status, 404);
    await writeFile(path.join(directory, 'country_level_demographics.csv'), 'location_key,population\nTN,1000\n');
    const population = await fetch(base + '/api/demographics');
    assert.equal(population.status, 200);
    assert.match(await population.text(), /TN,1000/);
    assert.equal((await fetch(base + '/api/data-quality')).status, 404);
    const report = { minObservationDate: '2019-12-01', files: { 'country_level_hospitalizations.csv': { excludedInvalidDates: 63 } } };
    await writeFile(path.join(directory, 'prepare-report.json'), JSON.stringify(report));
    const quality = await fetch(base + '/api/data-quality');
    assert.equal(quality.status, 200);
    assert.match(quality.headers.get('content-type'), /application\/json/);
    assert.deepEqual(await quality.json(), report);
    await writeFile(path.join(directory, 'prepare-report.json'), 'invalid JSON');
    const malformed = await fetch(base + '/api/data-quality');
    assert.equal(malformed.status, 500);
    assert.deepEqual(await malformed.json(), { error: 'Unable to serve the requested file' });
});
