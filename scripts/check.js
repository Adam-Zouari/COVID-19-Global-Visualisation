import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

async function check(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (['node_modules', '.git', 'data', 'datasets', 'test-results', 'playwright-report'].includes(entry.name)) continue;
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await check(file);
        else if (/\.(c|m)?js$/.test(entry.name)) {
            const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
            if (result.status !== 0) {
                process.stderr.write(result.stderr || `${result.error?.message || 'Unable to check syntax'}: ${file}\n`);
                process.exitCode = 1;
            }
        }
    }
}
await check('.');
if (!process.exitCode) console.log('JavaScript syntax checks passed.');
