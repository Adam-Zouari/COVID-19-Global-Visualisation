import { test, expect } from '@playwright/test';

const dates = Array.from({ length: 14 }, (_, index) => new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10));
const csvFiles = {
    epidem: ['date,location_key,new_confirmed,cumulative_confirmed', ...dates.flatMap((date, index) => [
        `${date},TN,${index},${index * 10}`, `${date},US,${index * 2},${index * 20}`
    ])].join('\n'),
    hospitalizations: ['date,location_key,current_hospitalized_patients,new_hospitalized_patients,cumulative_hospitalized_patients',
        ...dates.flatMap((date, index) => [`${date},TN,${10 + index},${index},${index * 10}`, `${date},US,${30 + index},${index * 2},${index * 20}`])].join('\n'),
    vaccinations: ['date,location_key,new_persons_vaccinated,cumulative_persons_vaccinated', ...dates.flatMap((date, index) => [
        `${date},TN,${index},${index * 10}`, `${date},US,${index * 2},${index * 20}`
    ])].join('\n'),
    'country-index': 'location_key,country_name\nTN,Tunisia\nUS,United States\n',
    demographics: 'location_key,population\nTN,1000000\nUS,2000000\n'
};

function gate() {
    let release;
    const promise = new Promise(resolve => { release = resolve; });
    return { promise, release };
}

function errorsOn(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    return errors;
}

async function installCSVFixtures(page, { dataGate = () => null, failEpidemiology = false, onDataRequest = () => {} } = {}) {
    await page.route('**/api/*', async route => {
        const name = new URL(route.request().url()).pathname.split('/').at(-1);
        if (!Object.hasOwn(csvFiles, name)) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
        onDataRequest(name);
        await dataGate()?.promise;
        return route.fulfill(failEpidemiology && name === 'epidem' ?
            { status: 404, contentType: 'application/json', body: '{}' } :
            { status: 200, contentType: 'text/csv', body: csvFiles[name] });
    });
}

async function assertCompareShell(page) {
    await expect(page.locator('html')).toHaveAttribute('data-view', 'compare');
    await expect(page.locator('#comparePanel')).toBeVisible();
    await expect(page.locator('#compareTitle')).toBeVisible();
    await expect(page.locator('#exploreView')).toBeHidden();
    await expect(page.locator('.page-intro')).toBeHidden();
    await expect(page.locator('#navCompare')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#navExplore')).not.toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#compareTitle')).not.toBeFocused();
}

async function waitForData(page) {
    await expect.poll(() => page.evaluate(() => Boolean(window.dataService?.availableDates.length &&
        window.globeInstance?.worldData && window.AtlasStore)), { message: 'The data, geometry, and store must be ready' }).toBe(true);
    await expect(page.locator('#dataSelector')).toBeEnabled();
}

async function recordCompareFrames(page) {
    await page.addInitScript(() => {
        window.__atlasViewFrames = [];
        if (new URLSearchParams(location.search).get('view') !== 'compare') return;
        const visible = node => Boolean(node && getComputedStyle(node).display !== 'none' &&
            getComputedStyle(node).visibility !== 'hidden' && node.getClientRects().length);
        const sample = () => {
            const compare = document.getElementById('comparePanel');
            const title = document.getElementById('compareTitle');
            const explore = document.getElementById('exploreView');
            const intro = document.querySelector('.page-intro');
            // Do not classify an incomplete DOM or unloaded render-blocking CSS as a painted view.
            const stylesReady = [...document.querySelectorAll('link[rel="stylesheet"]')].every(link => link.sheet);
            if (stylesReady && compare && title && explore && intro) window.__atlasViewFrames.push({
                compare: visible(compare), explore: visible(explore), intro: visible(intro),
                compareCurrent: document.getElementById('navCompare')?.getAttribute('aria-current'),
                headingFocused: document.activeElement === title
            });
            if (window.__atlasViewFrames.length < 3000) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
    });
}

async function assertNoExploreFrames(page) {
    await expect.poll(() => page.evaluate(() => window.__atlasViewFrames.length)).toBeGreaterThan(1);
    expect(await page.evaluate(() => window.__atlasViewFrames.filter(frame => !frame.compare || frame.explore ||
        frame.intro || frame.compareCurrent !== 'page' || frame.headingFocused))).toEqual([]);
}

test.beforeEach(async ({ page }) => {
    await page.route('https://flagcdn.com/**', route => route.fulfill({ contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16"><rect width="24" height="16" fill="#8ca5b7"/></svg>' }));
});

test('Compare is the first painted view before app and data load, and reload preserves settings without focusing its heading', async ({ page }) => {
    const errors = errorsOn(page);
    let phase = { app: gate(), data: gate() };
    let requests = 0;
    await recordCompareFrames(page);
    await page.route('**/app.js', async route => { const pending = phase.app; await pending.promise; await route.continue(); });
    await installCSVFixtures(page, { dataGate: () => phase.data, onDataRequest: () => { requests++; } });
    const path = '/?view=compare&category=hospitalizations&metric=current_hospitalized_patients&unit=per100k&smooth=raw&date=2020-01-10&country=tn&compare=tn,us&layout=separate&chart=bar&scale=independent&range=20,80';
    const expectedState = {
        view: 'compare', category: 'hospitalizations', metric: 'current_hospitalized_patients', unit: 'per100k',
        smoothing: 'raw', selectedDate: '2020-01-10', selectedCountry: 'tn', analysisOpen: false, compareCountries: ['tn', 'us'],
        analysisSettings: null, analysisChartType: 'line', analysisRange: { start: 0, end: 100 }, analysisChartOptions: {},
        compareSettings: { category: 'hospitalizations', metric: 'current_hospitalized_patients', unit: 'per100k', smoothing: 'raw', selectedDate: '2020-01-10' },
        workspaceMetrics: {
            globe: { hospitalizations: 'current_hospitalized_patients' },
            compare: { hospitalizations: 'current_hospitalized_patients' }
        },
        compareRange: { start: 20, end: 80 }, compareLayout: 'separate', compareChartType: 'bar', compareScale: 'independent', compareChartOptions: {}, dataMode: 'csv'
    };
    try {
        for (const reload of [false, true]) {
            if (reload) { phase = { app: gate(), data: gate() }; requests = 0; }
            if (reload) await page.reload({ waitUntil: 'commit' });
            else await page.goto(path, { waitUntil: 'commit' });
            await assertCompareShell(page);
            await expect(page.locator('#compareChartContainer [role="status"]')).toContainText('Loading comparison data');
            expect(await page.evaluate(() => typeof window.AtlasStore)).toBe('undefined');
            await assertNoExploreFrames(page);

            phase.app.release();
            await expect.poll(() => requests, { message: 'CSV requests remain held while the app initializes' }).toBe(5);
            await assertCompareShell(page);
            await expect(page.locator('#compareChartContainer [role="status"]')).toContainText('Loading comparison data');
            expect(await page.evaluate(() => window.dataService.availableDates.length)).toBe(0);
            phase.data.release();

            await waitForData(page);
            await expect.poll(() => page.evaluate(() => window.AtlasStore.getState())).toEqual(expectedState);
            await expect.poll(() => page.evaluate(() => window.CompareMode.state.active)).toBe(true);
            await assertCompareShell(page);
            await expect(page.locator('#compareMetricSelector')).toHaveValue('current_hospitalized_patients');
            await expect(page.locator('#compareUnitSelector')).toHaveValue('per100k');
            await expect(page.locator('#compareScaleSelector')).toHaveValue('independent');
            await expect(page.locator('#compareChartType')).toHaveValue('bar');
            await expect(page.locator('.country-chart-container svg')).toHaveCount(2);
            const params = new URL(page.url()).searchParams;
            for (const [key, value] of new URL(path, page.url()).searchParams) {
                // Daily reporting is now the implicit URL default.
                expect(params.get(key), key).toBe(key === 'smooth' && value === 'raw' ? null : value);
            }
            await assertNoExploreFrames(page);
        }
    } finally {
        phase.app.release(); phase.data.release();
    }
    expect(errors).toEqual([]);
});

test('default Explore paints correctly and keyboard entry into Compare still provides useful focus and Tab order', async ({ page }) => {
    const errors = errorsOn(page);
    const app = gate();
    await page.route('**/app.js', async route => { await app.promise; await route.continue(); });
    await installCSVFixtures(page);
    try {
        await page.goto('/', { waitUntil: 'commit' });
        await expect(page.locator('html')).toHaveAttribute('data-view', 'explore');
        await expect(page.locator('#exploreView')).toBeVisible();
        await expect(page.locator('.page-intro')).toBeVisible();
        await expect(page.locator('#comparePanel')).toBeHidden();
        await expect(page.locator('#navExplore')).toHaveAttribute('aria-current', 'page');
        await expect(page.locator('#navCompare')).not.toHaveAttribute('aria-current', 'page');
        app.release();
        await waitForData(page);
        await page.locator('#navCompare').focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#comparePanel')).toBeVisible();
        await expect(page.locator('#compareTitle')).toBeFocused();
        expect(await page.locator('#compareTitle').evaluate(node => node.matches(':focus-visible'))).toBe(true);
        await page.keyboard.press('Tab');
        await expect(page.locator('#addCountryBtn')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(page.locator('#exploreView')).toBeVisible();
        await expect(page.locator('#comparePanel')).toBeHidden();
        await expect(page.locator('#navExplore')).toBeFocused();
        await expect(page.locator('#navExplore')).toHaveAttribute('aria-current', 'page');
    } finally { app.release(); }
    expect(errors).toEqual([]);
});

for (const width of [1440, 390]) {
    test(`country analysis stays open across refresh and stays closed after explicit dismissal at ${width}px`, async ({ page }) => {
        const errors = errorsOn(page);
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.addInitScript(() => {
            window.__analysisScrollCalls = 0;
            const scroll = Element.prototype.scrollIntoView;
            Element.prototype.scrollIntoView = function(...args) {
                if (this.id === 'visualizationPanel') window.__analysisScrollCalls++;
                return scroll.apply(this, args);
            };
        });
        await installCSVFixtures(page);
        await page.goto('/?country=tn&category=hospitalizations&metric=current_hospitalized_patients&unit=per100k&smooth=raw&date=2020-01-10');
        await waitForData(page);
        await expect.poll(() => page.evaluate(() => AtlasView.restoring)).toBe(false);
        await page.locator('#seeMoreBtn').click();
        await expect(page.locator('#visualizationPanel')).toBeVisible();
        await expect.poll(() => new URL(page.url()).searchParams.get('analysis')).toBe('1');
        await page.reload();
        await waitForData(page);
        await expect.poll(() => page.evaluate(() => AtlasView.restoring)).toBe(false);
        await expect(page.locator('#visualizationPanel')).toBeVisible();
        await expect(page.locator('#viz-country-name')).toHaveText('Tunisia');
        await expect(page.locator('#analysisMetricLabel')).toHaveText('Currently hospitalized patients');
        await expect(page.locator('#analysisValue')).toHaveText('1.9');
        await expect(page.locator('#analysisValueDate')).toContainText('Jan 10, 2020');
        await expect(page.locator('#chartContainer .data-line')).toBeVisible();
        await expect(page.locator('#unitSelector')).toHaveValue('per100k');
        expect(await page.evaluate(() => AtlasStore.getState().analysisOpen)).toBe(true);
        expect(await page.evaluate(() => window.__analysisScrollCalls)).toBe(0);
        await expect(page.locator('#vizTypeSelector')).not.toBeFocused();
        await page.locator('#analysisCloseBtn').click();
        await expect.poll(() => new URL(page.url()).searchParams.has('analysis')).toBe(false);
        await page.reload();
        await waitForData(page);
        await expect.poll(() => page.evaluate(() => AtlasView.restoring)).toBe(false);
        await expect(page.locator('#visualizationPanel')).toBeHidden();
        expect(await page.evaluate(() => AtlasStore.getState().analysisOpen)).toBe(false);
        expect(errors).toEqual([]);
    });
}

test('Compare refresh retains the open country-analysis context for returning to Explore', async ({ page }) => {
    const errors = errorsOn(page);
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installCSVFixtures(page);
    await page.goto('/?view=compare&analysis=1&country=tn&compare=tn,us&date=2020-01-10&smooth=raw');
    for (const reload of [false, true]) {
        if (reload) await page.reload();
        await waitForData(page);
        await expect.poll(() => page.evaluate(() => AtlasView.restoring)).toBe(false);
        await expect(page.locator('#comparePanel')).toBeVisible();
        expect(await page.evaluate(() => AtlasStore.getState().analysisOpen)).toBe(true);
        await page.locator('#navExplore').click();
        await expect(page.locator('#visualizationPanel')).toBeVisible();
        await expect(page.locator('#analysisValue')).toHaveText('9');
        await expect(page.locator('#chartContainer .data-line')).toBeVisible();
        expect(await page.locator('#chartContainer svg').evaluate(node => Number(node.getAttribute('viewBox').split(' ')[2])))
            .toBeLessThan(400);
        if (!reload) await page.locator('#navCompare').click();
    }
    expect(errors).toEqual([]);
});

test('analysis links without a loaded valid country safely remain closed', async ({ page }) => {
    const errors = errorsOn(page);
    await installCSVFixtures(page);
    for (const query of ['analysis=1', 'analysis=1&country=zz']) {
        await page.goto(`/?${query}`);
        await waitForData(page);
        await expect.poll(() => page.evaluate(() => AtlasView.restoring)).toBe(false);
        await expect(page.locator('#visualizationPanel')).toBeHidden();
        expect(await page.evaluate(() => AtlasStore.getState().analysisOpen)).toBe(false);
        expect(new URL(page.url()).searchParams.has('analysis')).toBe(false);
        await expect(page.locator('#errorDisplay')).toBeHidden();
    }
    expect(errors).toEqual([]);
});

test('an initial Compare shell does not hide CSV failure recovery or block switching to the demo', async ({ page }) => {
    const errors = errorsOn(page);
    await installCSVFixtures(page, { failEpidemiology: true });
    await page.goto('/?view=compare&compare=tn,us');
    await expect(page.locator('#errorDisplay')).toBeVisible();
    await expect(page.locator('#processUploads')).toBeVisible();
    await expect(page.locator('#errorRetry')).toBeEnabled();
    await expect(page.locator('#compareTitle')).not.toBeFocused();
    await page.getByRole('link', { name: 'Explore the demo', exact: true }).click();
    await waitForData(page);
    await expect(page.locator('#errorDisplay')).toBeHidden();
    await expect(page.locator('#exploreView')).toBeVisible();
    await expect(page.locator('#comparePanel')).toBeHidden();
    await expect(page.locator('#dataSourceSelector')).toHaveValue('sample');
    expect(new URL(page.url()).searchParams.get('data')).toBe('sample');
    expect(errors).toEqual([]);
});

for (const initialView of ['explore', 'compare']) {
    test(`navigation while ${initialView} is loading preserves the latest click and restored data settings`, async ({ page }) => {
        const errors = errorsOn(page), app = gate(), data = gate();
        const selectedView = initialView === 'explore' ? 'compare' : 'explore';
        let requests = 0;
        await page.route('**/app.js', async route => { await app.promise; await route.continue(); });
        await installCSVFixtures(page, { dataGate: () => data, onDataRequest: () => requests++ });
        try {
            await page.goto(`/?view=${initialView}&country=tn&analysis=1&compare=tn,us&unit=per100k&smooth=raw`, { waitUntil: 'commit' });
            await page.locator(selectedView === 'compare' ? '#navCompare' : '#navExplore').click();
            await expect(page.locator('html')).toHaveAttribute('data-view', selectedView);
            app.release();
            await expect.poll(() => requests).toBe(5);
            // Repeated navigation while the data is still pending must use the final choice.
            await page.locator(initialView === 'compare' ? '#navCompare' : '#navExplore').click();
            await page.locator(selectedView === 'compare' ? '#navCompare' : '#navExplore').click();
            data.release();
            await waitForData(page);
            await expect.poll(() => page.evaluate(() => window.AtlasView.restoring)).toBe(false);
            await expect(page.locator('html')).toHaveAttribute('data-view', selectedView);
            const state = await page.evaluate(() => window.AtlasStore.getState());
            expect(state).toMatchObject({ view: selectedView, selectedCountry: 'tn', analysisOpen: true, compareCountries: ['tn', 'us'], unit: 'per100k', smoothing: 'raw' });
            expect(new URL(page.url()).searchParams.get('view')).toBe(selectedView === 'compare' ? 'compare' : null);
            if (selectedView === 'compare') await page.locator('#navExplore').click();
            await expect(page.locator('#countryInfo')).toBeVisible();
            await expect(page.locator('#countryInfo')).toContainText('Tunisia');
            await expect(page.locator('#visualizationPanel')).toBeVisible();
            await expect(page.locator('#globe svg')).toBeVisible();
        } finally { app.release(); data.release(); }
        expect(errors).toEqual([]);
    });
}
