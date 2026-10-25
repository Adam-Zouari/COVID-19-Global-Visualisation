import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
    await page.route('https://flagcdn.com/**', route => route.fulfill({ contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16"><rect width="24" height="16" fill="#8ca5b7"/></svg>' }));
});

async function ready(page, path = '/?data=sample') {
    await page.goto(path);
    await expect(page.locator('#loader')).toBeHidden();
    await expect(page.locator('#dataSelector')).toBeEnabled();
    await expect(page.locator('#mapUnitsLabel')).not.toBeEmpty();
}

async function selectCountry(page, name) {
    await page.locator('#search').click();
    await page.locator('#countrySearchInput').fill(name);
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('#searchModal')).toBeHidden();
}

async function screenshot(page, name) {
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
}

test('dismissing the selected country also closes its analysis and clears the saved selection', async ({ page }) => {
    await ready(page, '/?data=sample&country=tn&analysis=1');
    await expect(page.locator('#visualizationPanel')).toBeVisible();
    await expect(page.locator('#viz-country-name')).toHaveText('Tunisia');
    const date = await page.evaluate(() => dataService.currentDate);
    await page.locator('#closeCountryBtn').click();
    await expect(page.locator('#countryInfo')).toBeHidden();
    await expect(page.locator('#visualizationPanel')).toBeHidden();
    expect(await page.evaluate(() => ({ country: globeInstance.selectedCountryCode, date: dataService.currentDate })))
        .toEqual({ country: null, date });
    const params = new URL(page.url()).searchParams;
    expect(params.has('country')).toBe(false); expect(params.has('analysis')).toBe(false);
});

test('laptop exploration exposes the globe immediately and comparisons keep results close to their controls', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await ready(page);
    await expect(page.locator('.source-notice')).toHaveCount(0);
    await expect(page.locator('#dataSourceSelector')).toBeVisible();
    const globe = await page.locator('.globe-stage').boundingBox();
    expect(globe.y).toBeLessThan(330);
    const timeline = await page.locator('.historical-timeline').boundingBox();
    expect(timeline.y + timeline.height).toBeLessThan(globe.y);
    expect(globe.y + globe.height).toBeLessThanOrEqual(768);
    await page.locator('#hospBtn').click();
    await expect(page.locator('.smoothing-group')).toBeVisible();
    await expect(page.locator('#averageBtn')).toBeEnabled();
    await expect(page.locator('#mapMetricLabel')).toHaveText('Currently hospitalized patients');
    await expect(page.locator('.legend-note')).toContainText('Logarithmic');
    await page.locator('#globeLegend summary').click();
    await expect(page.locator('.legend-band')).toHaveCount(6);
    await selectCountry(page, 'Tunisia');
    await page.locator('#seeMoreBtn').click();
    const headerColors = await page.locator('.app-header').evaluate(node => {
        const probe = document.createElement('span'); probe.style.color = 'var(--surface-header)'; node.appendChild(probe);
        const opaqueColor = getComputedStyle(probe).color; probe.remove();
        return { actual: getComputedStyle(node).backgroundColor, expected: opaqueColor };
    });
    expect(headerColors.actual).toBe(headerColors.expected);
    await page.locator('#navCompare').click();
    await expect(page.locator('#compareChartContainer .chart-heading-title')).toContainText('Currently hospitalized patients');
    await page.locator('#addCountryBtn').click();
    await page.locator('#countrySearchInput').fill('France');
    await expect(page.getByRole('button', { name: 'France', exact: true }).locator('.country-availability')).toHaveText('Data available');
    await page.getByRole('button', { name: 'France', exact: true }).click();
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    const chart = await page.locator('#compareChartContainer .combined-chart-container > svg').boundingBox();
    expect(chart.y).toBeLessThan(580);
    const handles = await page.locator('#dateRangeSlider input[type="range"]').evaluateAll(nodes => nodes.map(node => ({ left: node.getBoundingClientRect().left, width: node.getBoundingClientRect().width })));
    expect(handles[0]).toEqual(handles[1]);
    await page.locator('#startDateSlider').focus();
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => CompareMode.state.dateRange.start)).toBeGreaterThan(0);
    await page.locator('#compare-date-range-start-input').fill('2021-06-01');
    await page.locator('#compare-date-range-start-input').press('Tab');
    await expect(page.locator('#dateRangeSlider .date-range-selection')).toContainText('Jun 1, 2021');
    await expect(page.locator('#compareChartContainer .chart-subtitle')).toContainText('Jun 1, 2021');
    await screenshot(page, 'atlas-compact-comparison');
    for (const name of ['Tunisia', 'France']) await page.getByRole('button', { name: `Remove ${name}`, exact: true }).click();
    await expect(page.locator('.compare-options')).toBeHidden();
    await expect(page.locator('#compareMessage')).toBeHidden();
    expect((await page.locator('.no-countries-message').boundingBox()).height).toBeLessThan(130);
});

test('weekly comparisons visibly distinguish missing weeks, partial reporting and true zero', async ({ page }) => {
    const rows = ['date,location_key,new_confirmed'];
    for (let day = 0; day < 140; day++) {
        const date = new Date(Date.UTC(2020, 0, day + 1)).toISOString().slice(0, 10);
        if (!(day >= 5 && day <= 11) && day !== 14) rows.push(`${date},TN,${day >= 19 && day <= 25 ? 0 : 10}`);
        rows.push(`${date},US,20`);
    }
    const files = {
        epidem: rows.join('\n'),
        hospitalizations: 'date,location_key,current_hospitalized_patients\n2020-01-01,TN,0\n',
        vaccinations: 'date,location_key,new_persons_vaccinated\n2020-01-01,TN,0\n',
        'country-index': 'location_key,country_name\nTN,Tunisia\nUS,United States\n',
        demographics: 'location_key,population\nTN,1000000\nUS,2000000\n'
    };
    await page.route('**/api/*', route => {
        const name = new URL(route.request().url()).pathname.split('/').at(-1);
        return route.fulfill({ status: files[name] ? 200 : 404, contentType: 'text/csv', body: files[name] || '' });
    });
    await ready(page, '/?view=compare&compare=tn,us&chart=bar&smooth=raw');
    await expect(page.locator('.chart-subtitle')).toContainText('Weekly totals');
    expect(await page.locator('.missing-bar-marker').count()).toBeGreaterThan(0);
    expect(await page.locator('.incomplete-bar').count()).toBeGreaterThan(0);
    expect(await page.locator('.reported-zero-marker').count()).toBeGreaterThan(0);
    await page.locator('.incomplete-bar').first().focus();
    await expect(page.locator('.chart-tooltip')).toContainText('Partial');
    await expect(page.locator('.chart-tooltip')).toContainText('Reported days');
    await page.locator('.missing-bar-marker').first().focus();
    await expect(page.locator('.chart-tooltip')).toContainText('No observation');
    await screenshot(page, 'atlas-weekly-reporting');
});

test('population units preserve compact axes and the timeline stays above the globe', async ({ page }) => {
    const files = {
        epidem: 'date,location_key,new_confirmed,cumulative_deceased\n2020-01-01,TN,0,1000000\n2020-01-02,TN,0,2000000\n2020-01-01,US,0,1000000\n2020-01-02,US,0,2000000\n',
        hospitalizations: 'date,location_key,current_hospitalized_patients\n2020-01-01,TN,0\n',
        vaccinations: 'date,location_key,new_persons_vaccinated\n2020-01-01,TN,0\n',
        'country-index': 'location_key,country_name\nTN,Tunisia\nUS,United States\n',
        demographics: 'location_key,population\nTN,100000000\nUS,200000000\n'
    };
    await page.route('**/api/*', route => {
        const name = new URL(route.request().url()).pathname.split('/').at(-1);
        return route.fulfill({ status: files[name] ? 200 : 404, contentType: 'text/csv', body: files[name] || '' });
    });
    await ready(page, '/?metric=cumulative_deceased&country=tn&smooth=raw&unit=per100k');
    const timeline = await page.locator('.historical-timeline').boundingBox();
    const globe = await page.locator('.globe-stage').boundingBox();
    expect(timeline.y + timeline.height).toBeLessThan(globe.y);
    await expect(page.locator('.normalization-explanation')).toContainText('2,000,000');
    await expect(page.locator('.normalization-explanation')).toContainText('100,000,000');
    await page.locator('#seeMoreBtn').click();
    await expect(page.locator('#chartContainer .axis-unit-label')).toHaveText('Deaths per 100,000 people');
    await expect(page.locator('#chartContainer .y-axis')).toContainText('2.0k');
    expect(await page.locator('#chartContainer .data-line').evaluate(node => node.__data__.at(-1).value)).toBe(2000);
    await page.locator('#analysisUnitSelector').selectOption('per1m');
    await expect(page.locator('#chartContainer .axis-unit-label')).toHaveText('Deaths per 1,000,000 people');
    expect(await page.locator('#chartContainer .data-line').evaluate(node => node.__data__.at(-1).value)).toBe(20000);
    await expect(page.locator('#unitSelector')).toHaveValue('per100k');
    await page.locator('#unitSelector').selectOption('per1m');
    await page.locator('#addToCompareBtn').click();
    await expect(page.locator('#compareUnitSelector')).toHaveValue('per1m');
    await page.locator('#addCountryBtn').click();
    await page.locator('#countrySearchInput').fill('United States');
    await page.getByRole('button', { name: 'United States', exact: true }).click();
    await page.locator('#separateChartsBtn').click();
    await expect(page.locator('.country-chart-container .axis-unit-label')).toHaveText(['Deaths per 1,000,000 people', 'Deaths per 1,000,000 people']);
    await page.locator('#compareUnitSelector').selectOption('per100k');
    await expect(page.locator('.country-chart-container .axis-unit-label')).toHaveText(['Deaths per 100,000 people', 'Deaths per 100,000 people']);
    expect(await page.evaluate(() => dataService.displayUnit)).toBe('per1m');
    await page.reload();
    await expect(page.locator('#compareUnitSelector')).toHaveValue('per100k');
    expect(await page.evaluate(() => ({ globe: dataService.displayUnit, country: AtlasWorkspaces.get('country').displayUnit })))
        .toEqual({ globe: 'per1m', country: 'per1m' });
    await page.locator('#navExplore').click();
    await expect(page.locator('#unitSelector')).toHaveValue('per1m');
    await expect(page.locator('#analysisUnitSelector')).toHaveValue('per1m');
    await expect(page.locator('#chartContainer .axis-unit-label')).toHaveText('Deaths per 1,000,000 people');
});

test('desktop exploration keeps the still globe and communicates metric, source, timeline and country context', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await ready(page);
    await expect(page.locator('#dataSourceSelector')).toHaveValue('sample');
    await expect(page.locator('#mapMetricLabel')).toHaveText('New confirmed cases');
    await expect(page.locator('#mapUnitsLabel')).toHaveText('Absolute count');
    await expect(page.locator('#rawBtn')).toHaveAttribute('aria-pressed', 'true');
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
    await expect(page.locator('#countryPrimary .primary-metric-value')).toHaveText('0');
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
    await page.getByRole('button', { name: 'Close country data', exact: true }).click();
    await expect(page.locator('#visualizationPanel')).toBeHidden();
    await expect(page.locator('#seeMoreBtn')).toBeFocused();
    await expect(page.locator('#countryName')).toContainText('Tunisia');
    await expect(page.locator('#unitSelector')).toHaveValue('per100k');
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
    await expect(page.locator('#compareChartContainer .combined-chart-container > svg')).toHaveCount(1);
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
    await expect(page.locator('#compareSmoothingSelector')).toBeEnabled();
    await page.locator('#epidemBtn').click();
    await page.locator('#navExplore').click();
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
    await expect(page.locator('#dataSourceSelector')).toBeVisible();
    await expect(page.locator('#dataSourceSelector option:checked')).toHaveText('Fictional demo');
    await page.locator('#filtersToggle').click();
    await expect(page.locator('#unitSelector')).toBeHidden();
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
        globe: document.getElementById('globe').getBoundingClientRect(),
        timeline: document.querySelector('.historical-timeline').getBoundingClientRect(),
        country: document.getElementById('countryInfo').getBoundingClientRect().top
    }));
    expect(layout.timeline.bottom).toBeLessThan(layout.globe.top);
    expect(layout.country).toBeGreaterThan(layout.globe.bottom);
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
    await expect(page.locator('#compareChartContainer .combined-chart-container > svg')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await screenshot(page, 'atlas-compare-mobile');
    await page.setViewportSize({ width: 320, height: 740 });
    await expect(page.locator('#dataSourceSelector')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
    await expect(page.locator('#dataSelector')).toBeEnabled();
    await expect(page.locator('#dataSourceSelector')).toHaveValue('upload');
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
    await expect(page.locator('#dataSourceSelector')).toHaveValue('csv');
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
    await Promise.all([
        page.waitForURL(url => url.searchParams.get('data') === 'sample', { waitUntil: 'domcontentloaded' }),
        page.locator('#dataSourceSelector').selectOption('sample')
    ]);
    await expect(page.locator('#loader')).toBeHidden({ timeout: 15000 });
    await expect(page.locator('#dataSourceSelector')).toHaveValue('sample');
    expect(await page.evaluate(() => window.dataService.dataSource)).toBe('sample');
    expect(new URL(page.url()).searchParams.get('data')).toBe('sample');
    await Promise.all([
        page.waitForURL(url => !url.searchParams.has('data'), { waitUntil: 'domcontentloaded' }),
        page.locator('#dataSourceSelector').selectOption('csv')
    ]);
    await expect(page.locator('#loader')).toBeHidden({ timeout: 15000 });
    await expect(page.locator('#dataSourceSelector')).toHaveValue('csv');
    expect(await page.evaluate(() => window.dataService.dataSource)).toBe('csv');
    expect(new URL(page.url()).searchParams.has('data')).toBe(false);
    expect(errors).toEqual([]);
});
