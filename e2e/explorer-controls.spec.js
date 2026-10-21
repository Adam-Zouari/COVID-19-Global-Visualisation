import { test, expect } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
    await page.route('https://flagcdn.com/**', route => route.fulfill({ contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16"><rect width="24" height="16" fill="#8ca5b7"/></svg>' }));
});

async function ready(page, path) {
    await page.goto(path);
    await expect(page.locator('#loader')).toBeHidden();
    await expect(page.locator('#dataSelector')).toBeEnabled();
    await expect(page.locator('#globe .country').first()).toBeAttached();
}

async function coverage(page) {
    const expected = await page.evaluate(() => dataService.getAllCountries().filter(country =>
        Number.isFinite(dataService.getDisplayValue(country.countryCode))).length);
    await expect(page.locator('.stage-topline #coverageCount')).toHaveText(
        `${expected} ${expected === 1 ? 'country' : 'countries'} with data`);
}

for (const theme of ['dark', 'light']) {
    for (const viewport of [{ width: 1366, height: 768 }, { width: 320, height: 740 }]) {
        test(`globe pointer controls and reporting badge work in ${theme} at ${viewport.width}px`, async ({ page }) => {
            const errors = []; page.on('pageerror', error => errors.push(error.message));
            await page.setViewportSize(viewport);
            await page.addInitScript(value => localStorage.setItem('atlas-appearance', value), theme);
            await ready(page, '/?data=sample&country=tn&date=2021-06-01&smooth=raw');
            await coverage(page);
            await expect(page.locator('#compareBtn, .coverage-summary, .view-label')).toHaveCount(0);
            await expect(page.locator('#coverageCount')).toBeVisible();
            await expect(page.locator('#globeLegend')).not.toContainText('Reported zero / low values');
            const original = await page.evaluate(() => ({
                date: dataService.currentDate, metric: dataService.currentColumn,
                country: globeInstance.selectedCountryCode
            }));
            const zoom = () => page.evaluate(() => globeInstance.projection.scale() / globeInstance.radius);
            await expect.poll(zoom).toBeCloseTo(1, 5);
            // A real pointer click must reach each button even when the zoomed
            // SVG extends to the edge of its viewport.
            for (const [id, scale] of [['zoomInBtn', 1.25], ['zoomOutBtn', 1]]) {
                const button = page.locator(`#${id}`);
                await button.scrollIntoViewIfNeeded();
                expect(await button.evaluate(node => {
                    const box = node.getBoundingClientRect();
                    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('button')?.id;
                })).toBe(id);
                await button.click();
                await expect.poll(zoom).toBeCloseTo(scale, 5);
            }
            // At maximum zoom the globe must still leave its controls clickable.
            for (let step = 0; step < 8; step++) await page.locator('#zoomInBtn').click();
            await expect.poll(zoom).toBeCloseTo(5, 5);
            await page.evaluate(() => {
                globeInstance.currentRotation = [80, 25, 0];
                globeInstance.projection.rotate(globeInstance.currentRotation);
                globeInstance.render();
            });
            await page.locator('#resetBtn').click();
            await expect.poll(zoom).toBeCloseTo(1, 5);
            await expect.poll(() => page.evaluate(() => globeInstance.currentRotation)).toEqual([-10, -15, 0]);
            expect(await page.evaluate(() => ({
                date: dataService.currentDate, metric: dataService.currentColumn,
                country: globeInstance.selectedCountryCode
            }))).toEqual(original);
            await coverage(page);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await page.screenshot({ path: `test-results/explorer-controls-${theme}-${viewport.width}.png`, fullPage: true });
            expect(errors).toEqual([]);
        });
    }
}

test('hospital occupancy supports daily snapshots and seven-day means without smoothing cumulative totals', async ({ page }) => {
    const rows = ['date,location_key,current_hospitalized_patients,new_hospitalized_patients,cumulative_hospitalized_patients'];
    for (let day = 1; day <= 10; day++) {
        const date = `2020-01-${String(day).padStart(2, '0')}`;
        rows.push(`${date},TN,${day * 10},${day * 3},${day * 100}`);
        if (day < 10) rows.push(`${date},US,${day * 20},${day * 6},${day * 200}`);
    }
    const files = {
        epidem: 'date,location_key,new_confirmed\n2020-01-01,TN,0\n',
        hospitalizations: rows.join('\n'),
        vaccinations: 'date,location_key,new_persons_vaccinated\n2020-01-01,TN,0\n',
        'country-index': 'location_key,country_name\nTN,Tunisia\nUS,United States\n',
        demographics: 'location_key,population\nTN,1000000\nUS,2000000\n'
    };
    await page.route('**/api/*', route => {
        const name = new URL(route.request().url()).pathname.split('/').at(-1);
        return route.fulfill({ status: files[name] ? 200 : 404, contentType: 'text/csv', body: files[name] || '' });
    });
    await ready(page, '/?category=hospitalizations&metric=current_hospitalized_patients&date=2020-01-10&country=tn&smooth=raw');
    await expect(page.locator('.smoothing-group')).toBeVisible();
    await expect(page.locator('.primary-metric-value')).toHaveText('100');
    await expect(page.locator('#coverageCount')).toHaveText('1 country with data');
    await page.locator('#averageBtn').click();
    await expect(page.locator('.primary-metric-value')).toHaveText('70');
    await expect(page.locator('#mapUnitsLabel')).toContainText('7-day average');
    await expect(page.locator('#smoothingNote')).toContainText('daily patient snapshots, not new admissions');
    await page.locator('#seeMoreBtn').click();
    await expect(page.locator('#chartContainer .chart-subtitle')).toContainText('7-day average of daily patient snapshots');
    await page.locator('#addToCompareBtn').click();
    await expect(page.locator('#compareSmoothingSelector')).toBeEnabled();
    await page.locator('#compareSmoothingSelector').selectOption('raw');
    await expect(page.locator('#compareChartContainer .chart-subtitle')).toContainText('Reported daily patient snapshots');
    await page.locator('#compareSmoothingSelector').selectOption('7day');
    await expect(page.locator('#compareChartContainer .chart-subtitle')).toContainText('7-day average of daily patient snapshots');
    await page.locator('#compareMetricSelector').selectOption('cumulative_hospitalized_patients');
    await expect(page.locator('#compareSmoothingSelector')).toBeDisabled();
    await expect(page.locator('#compareSmoothingSelector')).toHaveValue('raw');
    await expect(page.locator('#compareChartContainer .chart-subtitle')).toContainText('Reported cumulative values');
    await page.locator('#exitCompareBtn').click();
    await expect(page.locator('.smoothing-group')).toBeHidden();
    await expect(page.locator('.primary-metric-value')).toHaveText('1,000');
    await page.locator('#dataSelector').selectOption('new_hospitalized_patients');
    await expect(page.locator('.smoothing-group')).toBeVisible();
    await expect(page.locator('.primary-metric-value')).toHaveText('30');
    await page.locator('#averageBtn').click();
    await expect(page.locator('.primary-metric-value')).toHaveText('21');
    await coverage(page);
    await page.locator('#dateSlider').focus();
    await page.keyboard.press('Home');
    await expect(page.locator('#coverageCount')).toHaveText('0 countries with data');
    await page.locator('#rawBtn').click();
    await expect(page.locator('#coverageCount')).toHaveText('2 countries with data');
    await page.locator('#globeLegend summary').click();
    await expect(page.locator('#globeLegend')).toContainText('Zero is a reported value');
});
