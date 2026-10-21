import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DATASETS, downloadFile } from '../scripts/download-data.js';

async function fixture(t, handler) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'covid-download-'));
    const server = createServer(handler);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    t.after(async () => {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        await rm(directory, { recursive: true, force: true });
    });
    return {
        directory,
        destination: path.join(directory, 'epidemiology.csv'),
        url: `http://127.0.0.1:${server.address().port}/epidemiology.csv`
    };
}

async function waitForPartialData(directory) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
        const files = await readdir(directory);
        for (const file of files.filter(name => name.endsWith('.part'))) {
            if ((await stat(path.join(directory, file))).size > 0) return;
        }
        await delay(10);
    }
    assert.fail('Download should write partial bytes before the response finishes.');
}

test('download manifest contains exactly the five recommended full-history datasets', () => {
    assert.deepEqual([...DATASETS].sort(), [
        'demographics.csv',
        'epidemiology.csv',
        'hospitalizations.csv',
        'index.csv',
        'vaccinations.csv'
    ]);
});

test('download streams chunked response bytes to disk and commits the completed file', async t => {
    const firstChunk = Buffer.from('date,location_key,new_confirmed\n2020-01-01,TN,1\n'.repeat(4096));
    const lastChunk = Buffer.from('2020-01-02,TN,2\n');
    let finishResponse;
    const { directory, destination, url } = await fixture(t, (_request, response) => {
        response.writeHead(200, { 'content-type': 'text/csv' });
        response.write(firstChunk);
        finishResponse = () => response.end(lastChunk);
    });
    const downloading = downloadFile(url, destination, { retries: 0 });
    try {
        await waitForPartialData(directory);
        await assert.rejects(stat(destination), { code: 'ENOENT' });
    } finally {
        finishResponse?.();
        await downloading;
    }
    assert.deepEqual(await readFile(destination), Buffer.concat([firstChunk, lastChunk]));
    assert.deepEqual(await readdir(directory), ['epidemiology.csv']);
});

test('an existing completed file is preserved without making a request', async t => {
    let requests = 0;
    const { destination, url } = await fixture(t, (_request, response) => {
        requests++;
        response.end('replacement');
    });
    await writeFile(destination, 'original download\n');
    await downloadFile(url, destination, { retries: 0 });
    assert.equal(requests, 0);
    assert.equal(await readFile(destination, 'utf8'), 'original download\n');
});

test('a temporary HTTP failure is retried and leaves only the successful file', async t => {
    let requests = 0;
    const { directory, destination, url } = await fixture(t, (_request, response) => {
        requests++;
        if (requests === 1) {
            response.writeHead(503);
            response.end('temporarily unavailable');
        } else {
            response.end('date,location_key\n2020-01-01,TN\n');
        }
    });
    await downloadFile(url, destination, { retries: 1, retryDelayMs: 1 });
    assert.equal(requests, 2);
    assert.equal(await readFile(destination, 'utf8'), 'date,location_key\n2020-01-01,TN\n');
    assert.deepEqual(await readdir(directory), ['epidemiology.csv']);
});

test('a failed HTTP response does not leave a completed or partial file', async t => {
    let requests = 0;
    const { directory, destination, url } = await fixture(t, (_request, response) => {
        requests++;
        response.writeHead(404);
        response.end('not found');
    });
    await assert.rejects(downloadFile(url, destination, { retries: 2, retryDelayMs: 1 }), /404/);
    assert.equal(requests, 1);
    assert.deepEqual(await readdir(directory), []);
});

test('a truncated response is rejected and its partial file is removed', async t => {
    const { directory, destination, url } = await fixture(t, (_request, response) => {
        response.writeHead(200, { 'content-length': 1024 });
        response.flushHeaders();
        response.write('incomplete');
        setImmediate(() => response.destroy());
    });
    await assert.rejects(downloadFile(url, destination, { retries: 0 }));
    assert.deepEqual(await readdir(directory), []);
});

test('cancelling an active download removes partial bytes without retrying', async t => {
    let requests = 0;
    const { directory, destination, url } = await fixture(t, (_request, response) => {
        requests++;
        response.writeHead(200);
        response.write('date,location_key\n2020-01-01,TN\n'.repeat(4096));
    });
    const controller = new AbortController();
    const downloading = downloadFile(url, destination, {
        signal: controller.signal,
        retries: 2,
        retryDelayMs: 1
    });
    // Attach the rejection handler before aborting so an early stream error cannot
    // become an unhandled rejection while the fixture waits for written bytes.
    const rejected = assert.rejects(downloading);
    try {
        await waitForPartialData(directory);
    } finally {
        controller.abort();
        await rejected;
    }
    assert.equal(requests, 1);
    assert.deepEqual(await readdir(directory), []);
});
