import express from 'express';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const datasetFiles = {
    epidem: ['country_level_epidem.csv', 'epidemiology.csv'],
    hospitalizations: ['country_level_hospitalizations.csv', 'hospitalizations.csv', 'country_level_hopitalizations.csv'],
    vaccinations: ['country_level_vaccinations.csv', 'vaccinations.csv'],
    'country-index': ['small_index.csv', 'index.csv'],
    demographics: ['country_level_demographics.csv', 'demographics.csv']
};

export function createApp({ dataDirectory = process.env.DATA_DIR || path.join(projectRoot, 'data') } = {}) {
    const app = express();
    const dataRoot = path.resolve(dataDirectory);
    app.disable('x-powered-by');
    app.use((_req, res, next) => {
        res.set({
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            'X-Frame-Options': 'DENY'
        });
        next();
    });

    app.get('/api/data-quality', async (_req, res, next) => {
        try {
            const report = JSON.parse(await readFile(path.join(dataRoot, 'prepare-report.json'), 'utf8'));
            return res.json(report);
        } catch (error) {
            if (error.code === 'ENOENT') return res.status(404).json({ error: 'No preparation report is available.' });
            next(error);
        }
    });

    app.get('/api/:dataset', async (req, res, next) => {
        const names = Object.hasOwn(datasetFiles, req.params.dataset) ? datasetFiles[req.params.dataset] : null;
        if (!names) return res.status(404).json({ error: 'Unknown dataset' });
        try {
            for (const name of names) {
                const candidate = path.join(dataRoot, name);
                try {
                    await access(candidate);
                } catch (error) {
                    if (error.code === 'ENOENT') continue;
                    throw error;
                }
                return res.type('text/csv').sendFile(candidate);
            }
            return res.status(404).json({ error: `Dataset unavailable. Add ${names[0]} to DATA_DIR (default: data/).` });
        } catch (error) {
            next(error);
        }
    });

    // Expose only browser assets. Never serve the repository, server, or raw datasets.
    app.get('/', (_req, res) => res.sendFile(path.join(projectRoot, 'index.html')));
    for (const directory of ['src', 'assets', 'styles']) {
        app.use(`/${directory}`, express.static(path.join(projectRoot, directory), { dotfiles: 'deny', index: false }));
    }
    const vendors = {
        '/vendor/d3.min.js': 'd3/dist/d3.min.js',
        '/vendor/topojson-client.min.js': 'topojson-client/dist/topojson-client.min.js',
        '/assets/world/countries-110m.json': 'world-atlas/countries-110m.json'
    };
    for (const [url, file] of Object.entries(vendors)) {
        app.get(url, (_req, res) => res.sendFile(path.join(projectRoot, 'node_modules', file)));
    }
    app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
    app.use((error, _req, res, _next) => {
        if (res.headersSent) return _next(error);
        const status = error.status >= 400 && error.status < 500 ? error.status : 500;
        res.status(status).json({ error: status === 500 ? 'Unable to serve the requested file' : 'Not found' });
    });
    return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const port = Number(process.env.PORT || 3000);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer between 0 and 65535');
    const host = process.env.HOST || '127.0.0.1';
    const server = createApp().listen(port, host, () => {
        console.log(`COVID-19 visualizer: http://${host}:${server.address().port}`);
        console.log('Loading the local Google archive by default. Use ?data=sample for the fictional demo.');
    });
    server.on('error', error => {
        console.error(`Server failed: ${error.message}`);
        process.exitCode = 1;
    });
}
