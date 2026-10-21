import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';
import { isValidDate, MIN_OBSERVATION_DATE } from '../dataService/utils.js';

const files = {
    'country_level_epidem.csv': ['epidemiology.csv', 'country_level_epidem.csv'],
    'country_level_hospitalizations.csv': ['hospitalizations.csv', 'country_level_hospitalizations.csv', 'country_level_hopitalizations.csv'],
    'country_level_vaccinations.csv': ['vaccinations.csv', 'country_level_vaccinations.csv'],
    'small_index.csv': ['index.csv', 'small_index.csv'],
    'country_level_demographics.csv': ['demographics.csv', 'country_level_demographics.csv']
};

/** Stream original Google CSVs into country-only files without loading them into RAM. */
export async function prepareData(source, destination = 'data') {
    const inputRoot = path.resolve(source);
    const outputRoot = path.resolve(destination);
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
        const target = path.join(outputRoot, output);
        try {
            await access(target);
            throw new Error(`Output already exists: ${output}. Choose a new destination to preserve existing data.`);
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (input === target) throw new Error('Source and destination must be different files.');
        plan.push({ input, target });
    }
    await mkdir(outputRoot, { recursive: true });
    const created = [];
    const counts = {};
    const report = { source: 'Google COVID-19 Open Data', generatedAt: new Date().toISOString(),
        minObservationDate: MIN_OBSERVATION_DATE,
        dateRule: `Observations before ${MIN_OBSERVATION_DATE} or after the preparation date, and invalid calendar dates, are excluded; source values are never rewritten.`, files: {} };
    const lastValidDate = report.generatedAt.slice(0, 10);
    try {
        for (const { input, target } of plan) {
            let count = 0;
            const stats = { included: 0, excludedSubregions: 0, excludedInvalidDates: 0, invalidDateExamples: [] };
            const output = createWriteStream(target, { flags: 'wx' });
            // Track ownership only after exclusive creation succeeds.
            await new Promise((resolve, reject) => { output.once('open', resolve); output.once('error', reject); });
            created.push(target);
            await pipeline(createReadStream(input), parse({ columns: true, bom: true, skip_empty_lines: true }),
                async function* (rows) {
                    for await (const row of rows) {
                        const key = String(row.location_key || row.key || row.country_key || row.country_code || row.iso_code || '').trim();
                        if (!/^[A-Z]{2}$/i.test(key) ||
                            (row.aggregation_level?.trim() && Number(row.aggregation_level) !== 0) ||
                            row.subregion1_code?.trim() || row.subregion2_code?.trim()) {
                            stats.excludedSubregions++;
                            continue;
                        }
                        if (Object.hasOwn(row, 'date') && (!isValidDate(row.date) || row.date < MIN_OBSERVATION_DATE || row.date > lastValidDate)) {
                            stats.excludedInvalidDates++;
                            if (stats.invalidDateExamples.length < 20) stats.invalidDateExamples.push({ location_key: key, date: row.date });
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
            const reportFile = path.join(outputRoot, 'prepare-report.json');
            await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
            created.push(reportFile);
        }
    } catch (error) {
        // Only the new files exclusively created by this invocation are removed.
        await Promise.all(created.map(file => unlink(file).catch(() => {})));
        throw error;
    }
    return counts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [, , source, destination] = process.argv;
    if (!source) {
        console.error('Usage: npm run prepare-data -- <download-directory> [output-directory]');
        process.exitCode = 1;
    } else {
        try { console.log(await prepareData(source, destination)); }
        catch (error) { console.error(error.message); process.exitCode = 1; }
    }
}
