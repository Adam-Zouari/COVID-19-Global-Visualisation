import { createReadStream, createWriteStream } from 'node:fs';
import { access, link, lstat, mkdir, mkdtemp, open, realpath, rename, rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';
import { isValidDate, MIN_OBSERVATION_DATE, COUNTRY_IDENTIFIER_FIELDS, countryKey, isCountryRow } from '../src/dataService/utils.js';

const files = {
    'country_level_epidem.csv': ['epidemiology.csv', 'country_level_epidem.csv'],
    'country_level_hospitalizations.csv': ['hospitalizations.csv', 'country_level_hospitalizations.csv', 'country_level_hopitalizations.csv'],
    'country_level_vaccinations.csv': ['vaccinations.csv', 'country_level_vaccinations.csv'],
    'small_index.csv': ['index.csv', 'small_index.csv'],
    'country_level_demographics.csv': ['demographics.csv', 'country_level_demographics.csv']
};

const outputNames = ['prepare-report.json', ...Object.keys(files)];

async function inspectOutput(file, overwrite) {
    try {
        const entry = await lstat(file);
        if (!overwrite) throw new Error(`Output already exists: ${path.basename(file)}. Choose a new destination or pass --overwrite.`);
        if (!entry.isFile()) throw new Error(`Cannot overwrite ${path.basename(file)}: expected a regular file.`);
        return true;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return false;
}

function validateHeaders(columns, input, output) {
    const name = path.basename(input);
    if (new Set(columns).size !== columns.length) throw new Error(`${name} contains duplicate column headers.`);
    if (columns.some(column => !column.trim())) throw new Error(`${name} contains an empty column header.`);
    if (!COUNTRY_IDENTIFIER_FIELDS.some(field => columns.includes(field))) throw new Error(`${name}: missing country identifier.`);
    const required = output === 'small_index.csv' ? ['country_name', 'country'] :
        output === 'country_level_demographics.csv' ? ['population'] : ['date'];
    if (!required.some(field => columns.includes(field))) throw new Error(`${name}: missing required ${required.join(' or ')} column.`);
    return columns;
}

/** Stream original Google CSVs into country-only files without loading them into RAM. */
export async function prepareData(source, destination = 'data', { overwrite = false } = {}) {
    const inputRoot = await realpath(path.resolve(source));
    await mkdir(path.resolve(destination), { recursive: true });
    const outputRoot = await realpath(path.resolve(destination));
    if (!path.relative(inputRoot, outputRoot)) throw new Error('Source and destination must be different directories.');
    for (const name of outputNames) await inspectOutput(path.join(outputRoot, name), overwrite);
    const plan = [];
    for (const [output, aliases] of Object.entries(files)) {
        let input;
        for (const alias of aliases) {
            const candidate = path.join(inputRoot, alias);
            try { await access(candidate); input = candidate; break; }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        if (!input && output === 'country_level_demographics.csv') continue;
        if (!input) throw new Error(`Missing ${aliases[0]} in the source directory.`);
        const resolvedInput = await realpath(input);
        if (outputNames.some(name => !path.relative(resolvedInput, path.join(outputRoot, name)))) {
            throw new Error('Source and destination must be different files.');
        }
        plan.push({ input, name: output });
    }
    // Staging inside the destination keeps publication on the same filesystem.
    const staging = await mkdtemp(path.join(outputRoot, '.prepare-'));
    const staged = new Set();
    const backups = new Map();
    const published = [];
    let committed = false;
    const counts = {};
    const report = { source: 'Google COVID-19 Open Data', generatedAt: new Date().toISOString(),
        minObservationDate: MIN_OBSERVATION_DATE,
        dateRule: `Observations before ${MIN_OBSERVATION_DATE} or after the preparation date, and invalid calendar dates, are excluded; source values are never rewritten.`, files: {} };
    const lastValidDate = report.generatedAt.slice(0, 10);
    try {
        for (const { input, name } of plan) {
            const target = path.join(staging, name);
            let count = 0;
            const stats = { included: 0, excludedSubregions: 0, excludedInvalidDates: 0, invalidDateExamples: [] };
            const output = createWriteStream(target, { flags: 'wx' });
            // Track ownership only after exclusive creation succeeds.
            await new Promise((resolve, reject) => { output.once('open', resolve); output.once('error', reject); });
            staged.add(name);
            await pipeline(createReadStream(input), parse({ columns: columns => validateHeaders(columns, input, path.basename(target)), bom: true, skip_empty_lines: true }),
                async function* (rows) {
                    for await (const row of rows) {
                        const key = countryKey(row);
                        if (!isCountryRow(row, key)) {
                            stats.excludedSubregions++;
                            continue;
                        }
                        const date = row.date?.trim();
                        if (Object.hasOwn(row, 'date') && (!isValidDate(date) || date < MIN_OBSERVATION_DATE || date > lastValidDate)) {
                            stats.excludedInvalidDates++;
                            if (stats.invalidDateExamples.length < 20) stats.invalidDateExamples.push({ location_key: key.toUpperCase(), date: row.date });
                            continue;
                        }
                        count++;
                        yield row;
                    }
                    if (!count) throw new Error(`${path.basename(input)} contains no country-level records with location_key or key.`);
                }, stringify({ header: true }), output);
            counts[path.basename(target)] = count;
            stats.included = count;
            report.files[path.basename(target)] = stats;
        }
        if (Object.values(report.files).some(stats => stats.excludedInvalidDates > 0)) {
            const reportOutput = await open(path.join(staging, 'prepare-report.json'), 'wx');
            staged.add('prepare-report.json');
            try { await reportOutput.writeFile(`${JSON.stringify(report, null, 2)}\n`); }
            finally { await reportOutput.close(); }
        }
        // Validate every input before touching existing outputs. Move all managed
        // outputs, including an obsolete report or optional population file.
        for (const name of outputNames) {
            const target = path.join(outputRoot, name);
            if (await inspectOutput(target, overwrite)) {
                const backup = path.join(staging, `backup-${name}`);
                await rename(target, backup);
                backups.set(name, backup);
            }
        }
        for (const name of staged) {
            // link() creates exclusively, so a newly appeared output is never
            // silently replaced, including when overwrite was not requested.
            await link(path.join(staging, name), path.join(outputRoot, name));
            published.push(name);
        }
        committed = true;
    } catch (error) {
        const rollbackErrors = [];
        for (const name of published.reverse()) {
            try { await unlink(path.join(outputRoot, name)); }
            catch (rollbackError) { if (rollbackError.code !== 'ENOENT') rollbackErrors.push(rollbackError); }
        }
        for (const [name, backup] of backups) {
            try { await rename(backup, path.join(outputRoot, name)); backups.delete(name); }
            catch (rollbackError) { rollbackErrors.push(rollbackError); }
        }
        if (rollbackErrors.length) {
            throw new AggregateError([error, ...rollbackErrors], `Preparation failed and could not fully restore previous outputs. Recovery files remain in ${staging}: ${error.message}`);
        }
        throw error;
    } finally {
        // Exact owned files only; retain backups if rollback itself failed.
        const cleanup = [...staged].map(name => path.join(staging, name));
        if (committed) cleanup.push(...backups.values());
        await Promise.all(cleanup.map(file => unlink(file).catch(() => {})));
        await rmdir(staging).catch(() => {});
    }
    return counts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const args = process.argv.slice(2);
        const positional = args.filter(argument => argument !== '--overwrite');
        const unknown = positional.find(argument => argument.startsWith('-'));
        if (unknown) throw new Error(`Unknown option: ${unknown}`);
        if (!positional.length || positional.length > 2) {
            throw new Error('Usage: npm run prepare-data -- <download-directory> [output-directory] [--overwrite]');
        }
        console.log(await prepareData(positional[0], positional[1], { overwrite: args.includes('--overwrite') }));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
