import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

test.beforeEach(async ({ page }) => {
    await page.route('https://flagcdn.com/**', route => route.fulfill({ contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16"><rect width="24" height="16" fill="#8ca5b7"/></svg>' }));
});

async function ready(page, path = '/?data=sample') {
    await page.goto(path);
    await expect(page.locator('#loader')).toBeHidden();
    await expect(page.locator('#compareBtn')).toBeEnabled();
    await expect(page.locator('#mapUnitsLabel')).not.toBeEmpty();
}

async function selectCountry(page, name) {
    await page.locator('#search').click();
    await page.locator('#countrySearchInput').fill(name);
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('#searchModal')).toBeHidden();
}

async function screenshot(page, name) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
}

test('desktop exploration keeps the still globe and communicates metric, source, timeline and country context', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await ready(page);
    await expect(page.locator('#sourceTitle')).toContainText('Fictional');
    await expect(page.locator('#mapMetricLabel')).toHaveText('New confirmed cases');
    await expect(page.locator('#mapUnitsLabel')).toContainText('7-day average');
    expect(await page.locator('#globe .country').count()).toBeGreaterThan(150);
    expect(await page.evaluate(() => window.globeInstance.autoRotate)).toBe(false);
    expect(await page.evaluate(() => window.globeInstance.projection.clipAngle())).toBe(90);
    await screenshot(page, 'atlas-explore-desktop');
    await selectCountry(page, 'Tunisia');
    await expect(page.locator('#countryName')).toContainText('Tunisia');
    await expect(page.locator('#countryPrimary')).toContainText('New confirmed cases');
    await expect(page.locator('#countryPopulation')).toContainText('fictional');
    await expect(page.locator('#countryTrend svg')).toBeVisible();
    await page.locator('#rawBtn').click();
    await page.locator('#dateSlider').focus(); await page.keyboard.press('Home');
    await expect(page.locator('#currentDate')).toHaveText('Jan 1, 2020');
    await expect(page.locator('#prevDateBtn')).toBeDisabled();
    await expect(page.locator('.primary-metric-value')).toHaveText('0');
    await page.locator('#nextDateBtn').click();
    await expect(page.locator('#currentDate')).toHaveText('Jan 2, 2020');
    await page.locator('#resetBtn').click();
    await expect(page.locator('#countryName')).toContainText('Tunisia');
    await expect(page.locator('#currentDate')).toHaveText('Jan 2, 2020');
    await page.locator('#dateSlider').focus(); await page.keyboard.press('End');
    await page.locator('#averageBtn').click();
    await screenshot(page, 'atlas-country-desktop');
    await page.getByRole('button', { name: 'Source & methodology' }).click();
    await expect(page.locator('#methodologyDialog')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
});

test('analysis is inline, normalized values are real calculations and mapless countries stay accessible', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await ready(page); await selectCountry(page, 'Tunisia');
    await page.locator('#unitSelector').selectOption('per100k');
    const values = await page.evaluate(() => {
        const s = window.dataService;
        return { raw: s.getDisplayValue('tn', { unit: 'count' }), population: s.getPopulation('tn'), normalized: s.getDisplayValue('tn') };
    });
    expect(values.normalized).toBeCloseTo(values.raw / values.population * 100000, 5);
    await page.locator('#seeMoreBtn').click();
    await expect(page.locator('#visualizationPanel')).toBeVisible();
    await expect(page.locator('#globe svg')).toBeVisible();
    await expect(page.locator('#chartContainer svg')).toBeVisible();
    expect(await page.locator('#chartContainer circle').count()).toBeLessThan(15);
    await screenshot(page, 'atlas-analysis-desktop');
    await page.locator('#analysisCloseBtn').click();
    await expect(page.locator('#visualizationPanel')).toBeHidden();
    await selectCountry(page, 'Singapore');
    await expect(page.locator('#countryName')).toContainText('Singapore');
    await page.locator('#seeMoreBtn').click();
    await expect(page.locator('#chartContainer svg')).toBeVisible();
    expect(errors).toEqual([]);
});

test('comparison uses shared controls, stable colors, readable small multiples and preserves exploration context', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await ready(page); await selectCountry(page, 'Tunisia');
    const selectedDate = await page.locator('#currentDate').textContent();
    await page.locator('#addToCompareBtn').click();
    await expect(page.locator('#comparePanel')).toBeVisible();
    await expect(page.locator('#exploreView')).toBeHidden();
    for (const name of ['United States', 'France', 'United Kingdom']) {
        await page.locator('#addCountryBtn').click();
        await page.locator('#countrySearchInput').fill(name);
        await page.getByRole('button', { name, exact: true }).click();
    }
    await expect(page.locator('.header-country-item')).toHaveCount(4);
    await page.locator('#addCountryBtn').click();
    await expect(page.locator('#compareMessage')).toContainText('4 countries');
    await page.locator('#compareUnitSelector').selectOption('per100k');
    await expect(page.locator('#compareChartContainer svg')).toHaveCount(1);
    await screenshot(page, 'atlas-compare-desktop');
    await page.locator('#separateChartsBtn').click();
    await expect(page.locator('.country-chart-container')).toHaveCount(4);
    const colors = await page.locator('.country-color').evaluateAll(nodes => nodes.map(node => node.style.backgroundColor));
    expect(new Set(colors).size).toBe(4);
    await page.locator('#compareScaleSelector').selectOption('independent');
    await page.locator('#compareScaleSelector').selectOption('shared');
    await page.getByRole('button', { name: 'Remove France', exact: true }).click();
    await expect(page.locator('.country-chart-container')).toHaveCount(3);
    await page.locator('#hospBtn').click();
    await expect(page.locator('#compareMetricSelector')).toHaveValue('current_hospitalized_patients');
    await expect(page.locator('#compareSmoothingSelector')).toBeDisabled();
    await page.locator('#epidemBtn').click();
    await page.locator('#exitCompareBtn').click();
    await expect(page.locator('#exploreView')).toBeVisible();
    await expect(page.locator('#countryName')).toContainText('Tunisia');
    await expect(page.locator('#currentDate')).toHaveText(selectedDate);
    expect(errors).toEqual([]);
});

test('shared URLs restore country, category, metric, units and comparison layout', async ({ page }) => {
    await ready(page, '/?data=sample&category=vaccinations&metric=cumulative_persons_vaccinated&unit=percent&smooth=raw&country=tn&compare=tn,us&view=compare&layout=separate&range=40,100');
    await expect(page.locator('#comparePanel')).toBeVisible();
    await expect(page.locator('#compareMetricSelector')).toHaveValue('cumulative_persons_vaccinated');
    await expect(page.locator('#compareUnitSelector')).toHaveValue('percent');
    await expect(page.locator('.country-chart-container')).toHaveCount(2);
    await page.reload();
    await expect(page.locator('#comparePanel')).toBeVisible();
    await expect(page.locator('.country-chart-container')).toHaveCount(2);
});

test('mobile explorer, expandable details, keyboard search and charts fit the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page);
    await page.locator('#filtersToggle').click();
    await expect(page.locator('#unitSelector')).toBeVisible();
    await page.locator('#filtersToggle').click();
    await page.locator('#search').click();
    await page.locator('#countrySearchInput').fill('Tunisia');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Tunisia', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#countryInfo')).toBeVisible();
    await page.locator('#countryExpandBtn').click();
    await expect(page.locator('#countryStats')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const layout = await page.evaluate(() => ({
        globe: document.getElementById('globe').getBoundingClientRect().bottom,
        timeline: document.querySelector('.historical-timeline').getBoundingClientRect(),
        country: document.getElementById('countryInfo').getBoundingClientRect().top
    }));
    expect(layout.timeline.top).toBeGreaterThan(layout.globe);
    expect(layout.country).toBeGreaterThan(layout.timeline.bottom);
    await screenshot(page, 'atlas-mobile');
    await page.locator('#seeMoreBtn').click();
    await expect(page.locator('#chartContainer svg')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('tablet exploration and mobile comparison fit their layouts without clipped charts', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 1000 });
    await ready(page); await selectCountry(page, 'Tunisia');
    await expect(page.locator('#countryInfo')).toBeVisible();
    const stage = await page.locator('.globe-stage').boundingBox();
    expect(stage.width).toBeGreaterThan(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page, '/?data=sample&view=compare&compare=tn,us,fr,gb&layout=separate');
    await expect(page.locator('.country-chart-container svg')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('#combinedChartBtn').click();
    await expect(page.locator('#compareChartContainer svg')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await screenshot(page, 'atlas-compare-mobile');
});

test('failed CSV loading recovers from uploads and reports missing population honestly', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/epidem', route => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
    await page.goto('/');
    await expect(page.locator('#processUploads')).toBeVisible();
    const files = {
        epidemUpload: 'date,location_key,new_confirmed,cumulative_confirmed\n2020-01-01,TN,0,0\n2020-01-02,TN,2,2\n',
        hospitalUpload: 'date,location_key,current_hospitalized_patients\n2020-01-01,TN,0\n2020-01-02,TN,1\n',
        vaccinationUpload: 'date,location_key,new_persons_vaccinated,cumulative_persons_vaccinated\n2020-01-01,TN,0,0\n2020-01-02,TN,1,1\n',
        indexUpload: 'location_key,country_name,aggregation_level\nTN,Tunisia,0\n'
    };
    for (const [id, csv] of Object.entries(files)) await page.locator(`#${id}`).setInputFiles({ name: `${id}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.locator('#processUploads').click();
    await expect(page.locator('#errorDisplay')).toBeHidden();
    await expect(page.locator('#compareBtn')).toBeEnabled();
    await expect(page.locator('#sourceTitle')).toContainText('Uploaded');
    await expect(page.locator('#dataQualityNote')).toBeHidden();
    await selectCountry(page, 'Tunisia');
    await expect(page.locator('#countryPopulation')).toContainText('unavailable');
    await expect(page.locator('#unitSelector option[value="per100k"]')).toBeDisabled();
    expect(errors).toEqual([]);
});

test('original archive loads by default and source switching explicitly selects the fictional demo', async ({ page }) => {
    test.skip(!existsSync('data/country_level_demographics.csv'), 'Local Google datasets have not been prepared.');
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await ready(page, '/');
    await expect(page.locator('#sourceTitle')).toContainText('Historical archive');
    expect(await page.evaluate(() => window.dataService.dataSource)).toBe('csv');
    expect(await page.evaluate(() => window.dataService.getAllCountries().length)).toBeGreaterThan(200);
    expect(await page.evaluate(() => window.dataService.getPopulation('tn'))).toBeGreaterThan(1000000);
    await selectCountry(page, 'Tunisia');
    await page.locator('#unitSelector').selectOption('per100k');
    expect(await page.evaluate(() => window.dataService.currentDate < window.dataService.getAvailableDates().at(-1))).toBe(true);
    await screenshot(page, 'atlas-real-archive');
    await page.getByRole('button', { name: 'Source & methodology' }).click();
    const report = await page.request.get('/api/data-quality');
    if (report.ok()) {
        const data = await report.json();
        const excluded = Object.values(data.files || {}).reduce((total, file) => total + (Number(file.excludedInvalidDates) || 0), 0);
        if (excluded) await expect(page.locator('#dataQualityNote')).toContainText(String(excluded));
    }
    await page.keyboard.press('Escape');
    await page.locator('#sourceSwitch').click();
    await expect(page.locator('#loader')).toBeHidden({ timeout: 15000 });
    await expect(page.locator('#sourceTitle')).toContainText('Fictional');
    expect(await page.evaluate(() => window.dataService.dataSource)).toBe('sample');
    expect(new URL(page.url()).searchParams.get('data')).toBe('sample');
    await page.locator('#sourceSwitch').click();
    await expect(page.locator('#loader')).toBeHidden({ timeout: 15000 });
    await expect(page.locator('#sourceTitle')).toContainText('Historical archive');
    expect(await page.evaluate(() => window.dataService.dataSource)).toBe('csv');
    expect(new URL(page.url()).searchParams.has('data')).toBe(false);
    expect(errors).toEqual([]);
});
