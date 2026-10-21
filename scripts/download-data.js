import { constants, createWriteStream } from 'node:fs';
import { copyFile, link, lstat, mkdir, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

export const DATASETS = Object.freeze([
    'epidemiology.csv', 'hospitalizations.csv', 'vaccinations.csv', 'index.csv', 'demographics.csv'
]);
const BASE_URL = 'https://storage.googleapis.com/covid19-open-data/v3/';
const DEFAULT_DIRECTORY = fileURLToPath(new URL('../datasets/google/', import.meta.url));

class DownloadError extends Error {
    constructor(message, retryable = false) {
        super(message);
        this.retryable = retryable;
    }
}

async function existingFile(destination) {
    try {
        const entry = await lstat(destination);
        if (!entry.isFile() || !entry.size) {
            throw new DownloadError(`Refusing to replace ${destination}. Choose another download directory or remove this entry yourself.`);
        }
        return { status: 'skipped', file: destination, bytes: entry.size };
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
    }
}

function retryable(error) {
    if (error instanceof DownloadError) return error.retryable;
    return error instanceof TypeError || ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'UND_ERR_SOCKET'].includes(error.code);
}

// Publish a complete file without replacing an existing one, even if another
// invocation finishes first. Hard linking avoids copying large CSVs on NTFS.
async function publish(temporary, destination) {
    try {
        await link(temporary, destination);
    } catch (error) {
        if (['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'ENOSYS'].includes(error.code)) {
            await copyFile(temporary, destination, constants.COPYFILE_EXCL);
        } else {
            throw error;
        }
    }
}

/** Download one CSV with bounded memory, retries, cancellation, and safe publication. */
export async function downloadFile(url, destination, {
    retries = 2, retryDelayMs = 2000, idleTimeoutMs = 90000, signal,
    onProgress = () => {}, onRetry = () => {}
} = {}) {
    if (!Number.isInteger(retries) || retries < 0) throw new RangeError('retries must be a non-negative integer');
    if (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs <= 0) throw new RangeError('idleTimeoutMs must be positive');
    signal?.throwIfAborted();
    const existing = await existingFile(destination);
    if (existing) return existing;
    await mkdir(path.dirname(destination), { recursive: true });

    for (let attempt = 1; attempt <= retries + 1; attempt++) {
        signal?.throwIfAborted();
        const temporary = `${destination}.${randomUUID()}.part`;
        const controller = new AbortController();
        const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
        let timeout;
        let downloadedBytes = 0;
        const resetTimeout = () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => controller.abort(new DownloadError('Download stalled; no data received.', true)), idleTimeoutMs);
            timeout.unref();
        };
        let response;
        try {
            resetTimeout();
            response = await fetch(url, { signal: requestSignal, headers: { 'Accept-Encoding': 'identity' } });
            if (!response.ok) {
                throw new DownloadError(`HTTP ${response.status} downloading ${path.basename(destination)}`,
                    response.status === 408 || response.status === 429 || response.status >= 500);
            }
            if (!response.body || /text\/html|application\/json/i.test(response.headers.get('content-type') || '')) {
                throw new DownloadError(`Expected a CSV file for ${path.basename(destination)}, but received a different response.`);
            }
            const length = Number(response.headers.get('content-length'));
            const totalBytes = length > 0 && !response.headers.get('content-encoding') ? length : null;
            const progress = new Transform({
                transform(chunk, _encoding, callback) {
                    downloadedBytes += chunk.length;
                    resetTimeout();
                    try {
                        onProgress({ downloadedBytes, totalBytes, attempt });
                        callback(null, chunk);
                    } catch (error) { callback(error); }
                }
            });
            const output = createWriteStream(temporary, { flags: 'wx' });
            await once(output, 'open');
            await pipeline(Readable.fromWeb(response.body), progress, output, { signal: requestSignal });
            if (!downloadedBytes || (totalBytes !== null && downloadedBytes !== totalBytes)) {
                throw new DownloadError(`Incomplete download for ${path.basename(destination)}.`, true);
            }
            signal?.throwIfAborted();
            try {
                await publish(temporary, destination);
            } catch (error) {
                if (error.code === 'EEXIST') return await existingFile(destination);
                throw error;
            }
            return { status: 'downloaded', file: destination, bytes: downloadedBytes };
        } catch (error) {
            if (signal?.aborted) throw signal.reason;
            const failure = controller.signal.aborted ? controller.signal.reason : error;
            if (attempt > retries || !retryable(failure)) throw failure;
            clearTimeout(timeout);
            controller.abort();
            await response?.body?.cancel().catch(() => {});
            // Remove incomplete data before retrying, rather than retaining a
            // large partial file while the next attempt starts.
            await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
            onRetry({ attempt, error: failure });
            await delay(retryDelayMs * attempt, undefined, { signal });
        } finally {
            clearTimeout(timeout);
            controller.abort();
            await response?.body?.cancel().catch(() => {});
            await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
        }
    }
}

export async function downloadData(directory = DEFAULT_DIRECTORY, options = {}) {
    const destination = path.resolve(directory);
    const results = [];
    // Sequential downloads avoid competing large transfers and keep memory bounded.
    for (const filename of DATASETS) {
        options.onFile?.(filename);
        results.push(await downloadFile(new URL(filename, BASE_URL), path.join(destination, filename), options));
        options.onComplete?.(results.at(-1));
    }
    return results;
}

function formatBytes(bytes) {
    if (bytes === null) return 'unknown size';
    const unit = bytes >= 1024 ** 3 ? 'GiB' : bytes >= 1024 ** 2 ? 'MiB' : 'KiB';
    const divisor = unit === 'GiB' ? 1024 ** 3 : unit === 'MiB' ? 1024 ** 2 : 1024;
    return `${(bytes / divisor).toFixed(1)} ${unit}`;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly && ['--help', '-h'].includes(process.argv[2])) {
    console.log('Usage: npm run download-data -- [destination-directory]');
    console.log('Default destination: datasets/google/ in this project.');
    console.log(`Files: ${DATASETS.join(', ')}`);
    console.log('Existing nonempty files are preserved. Failed or cancelled downloads can be restarted.');
} else if (invokedDirectly) {
    const controller = new AbortController();
    const cancel = () => controller.abort(new Error('Download cancelled. Run the command again to skip completed files and retry unfinished ones.'));
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    let lastProgress = 0;
    try {
        if (process.argv.length > 3) throw new Error('Usage: npm run download-data -- [destination-directory]');
        const directory = path.resolve(process.argv[2] || DEFAULT_DIRECTORY);
        console.log(`Downloading five full-history Google COVID-19 CSVs to ${directory}`);
        await downloadData(directory, {
            signal: controller.signal,
            onFile: filename => { console.log(`\n${filename}`); lastProgress = 0; },
            onProgress: ({ downloadedBytes, totalBytes }) => {
                if (Date.now() - lastProgress < 1500) return;
                lastProgress = Date.now();
                console.log(`  ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}${totalBytes ? ` (${(downloadedBytes / totalBytes * 100).toFixed(1)}%)` : ''}`);
            },
            onRetry: ({ attempt, error }) => console.log(`  ${error.message} Retrying (${attempt}/2)…`),
            onComplete: result => console.log(`  ${result.status === 'skipped' ? 'Already exists; skipped' : 'Saved'} (${formatBytes(result.bytes)})`)
        });
        console.log('\nAll five files are available. Prepare the four app datasets with:');
        console.log(`npm run prepare-data -- "${directory}"`);
        console.log('demographics.csv is saved for population-based features; the current app uses the other four files.');
    } catch (error) {
        console.error(`\n${error.message}`);
        process.exitCode = controller.signal.aborted ? 130 : 1;
    } finally {
        process.removeListener('SIGINT', cancel);
        process.removeListener('SIGTERM', cancel);
    }
}
