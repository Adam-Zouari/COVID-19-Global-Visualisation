import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

test.use({ reducedMotion: 'reduce' });
const dates = Array.from({ length: 28 }, (_, index) => `2021-01-${String(index + 1).padStart(2, '0')}`);
const csv = {
    epidem: ['date,location_key,new_confirmed,new_deceased,cumulative_confirmed,cumulative_deceased,new_tested',
        ...dates.flatMap((date, index) => ['TN', 'US', 'FR', 'GB'].map((code, country) =>
            `${date},${code},${index === 14 ? -2 : index * (country + 1)},${index % 5},${index * 100},${index * 3},${index * 20}`))].join('\n'),
    hospitalizations: ['date,location_key,current_hospitalized_patients,current_intensive_care_patients,new_hospitalized_patients',
        ...dates.flatMap((date, index) => [`${date},TN,${index * 2},${index},${index}`, `${date},US,${index * 4},${index * 2},${index * 2}`])].join('\n'),
    vaccinations: ['date,location_key,cumulative_persons_vaccinated,cumulative_persons_fully_vaccinated,cumulative_vaccine_doses_administered',
        ...dates.flatMap((date, index) => [`${date},TN,${index * 20},${index * 10},${index * 35}`,
            `${date},US,${index * 40},${index * 20},${index * 70}`])].join('\n'),
    'country-index': 'location_key,country_name\nTN,Tunisia\nUS,United States\nFR,France\nGB,United Kingdom\n',
    demographics: 'location_key,population\nTN,1000\nUS,2000\nFR,3000\nGB,4000\n'
};

async function prepare(page, theme, path = '/?view=compare&compare=tn,us&date=2021-01-28&smooth=raw', archive = csv) {
    await page.addInitScript(value => localStorage.setItem('atlas-appearance', value), theme);
    await page.route('https://flagcdn.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }));
    await page.route('**/api/*', route => {
        const key = new URL(route.request().url()).pathname.split('/').at(-1);
        return route.fulfill(Object.hasOwn(archive, key) ? { contentType: 'text/csv', body: archive[key] } : { status: 404, body: '{}' });
    });
    await page.goto(path);
    await expect(page.locator('#dataSelector')).toBeEnabled();
    await expect.poll(() => page.evaluate(() => window.AtlasView.restoring)).toBe(false);
}

async function fits(page, selector) {
    const failures = await page.locator(selector).evaluateAll(nodes => nodes.flatMap(node => {
        const bounds = node.getBoundingClientRect();
        return bounds.left < -1 || bounds.right > innerWidth + 1 ? [`${node.tagName}: ${bounds.left}..${bounds.right}`] : [];
    }));
    expect(failures).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

const comparisonMarks = { line: '.data-line', bar: '.data-bar', horizontal: '.rank-bar',
    heatmap: '.heatmap-cell', scatter: '.scatter-point', dumbbell: '.dumbbell-point', box: '.box-mark' };
const countryMarks = { line: '.data-line', bar: '.data-bar', area: '.data-area',
    heatmap: '.heatmap-cell', scatter: '.scatter-point', box: '.box-mark' };

async function chartChoices(page, selector, allowed) {
    expect(await page.locator(`${selector} option`).evaluateAll(nodes => nodes.map(option => option.value).sort()))
        .toEqual(Object.keys(allowed).sort());
}

for (const [theme, width] of [['dark', 1440], ['light', 390], ['dark', 320]]) {
    test(`country comparison charts render and fit in ${theme} at ${width}px`, async ({ page }) => {
        test.setTimeout(90000);
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.setViewportSize({ width, height: 1000 });
        await prepare(page, theme);
        await chartChoices(page, '#compareChartType', comparisonMarks);
        for (const [type, mark] of Object.entries(comparisonMarks)) {
            await page.locator('#compareChartType').selectOption(type);
            await expect(page.locator(`#compareChartContainer ${mark}`).first(), type).toBeVisible();
            expect(await page.locator('#compareChartContainer svg').evaluateAll(nodes => nodes.every(svg => !/NaN|Infinity/.test(svg.outerHTML))), type).toBe(true);
            await fits(page, '#comparePanel select, #comparePanel input, #compareChartContainer svg');
            if (type === 'heatmap') {
                await expect(page.locator('.analytics-heatmap-scroll')).toHaveCount(0);
                expect(await page.locator('#compareChartContainer').evaluate(node => node.scrollWidth <= node.clientWidth + 1),
                    'Heatmaps fit without horizontal scrolling').toBe(true);
                const clipped = await page.locator('#compareChartContainer .x-axis .tick text').evaluateAll(nodes => nodes.flatMap(node => {
                    const bounds = node.getBoundingClientRect(), svg = node.ownerSVGElement.getBoundingClientRect();
                    return bounds.left < svg.left - 1 || bounds.right > svg.right + 1 ? [node.textContent] : [];
                }));
                expect(clipped, 'Heatmap date labels fit inside the chart').toEqual([]);
            }
            if (['heatmap', 'horizontal', 'box'].includes(type))
                await page.screenshot({ path: `test-results/analytics-${type}-${theme}-${width}.png`, fullPage: true });
        }
        await expect(page.locator('.date-selection-panel')).toBeVisible();
        await expect(page.locator('#compare-date')).toHaveCount(0);
        await page.locator('#compareChartType').selectOption('line');
        await expect(page.locator('#compareChartContainer .data-line')).toHaveCount(2);
        expect(await page.locator('#compareChartContainer .data-line').evaluateAll(nodes =>
            nodes.every(node => !node.hasAttribute('stroke-dasharray')))).toBe(true);
        await expect(page.locator('#separateChartsBtn')).toBeEnabled();
        expect(errors).toEqual([]);
    });
}

test('horizontal bars have a working date slider and preserve their date when shared', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await prepare(page, 'dark');
    await page.locator('#compareChartType').selectOption('horizontal');
    await expect(page.locator('.date-selection-panel')).toBeHidden();
    await expect(page.locator('#compare-date-slider')).toBeVisible();
    await page.locator('#compare-date-slider').evaluate(input => {
        input.value = '9'; input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.locator('#compare-date')).toHaveValue('2021-01-10');
    expect(await page.locator('.rank-bar').evaluateAll(nodes => nodes.map(node => node.__data__.value).sort((a, b) => a - b))).toEqual([9, 18]);
    await page.locator('#compare-date').fill('2021-01-20');
    await page.locator('#compare-date').dispatchEvent('change');
    await expect(page.locator('#compare-date-slider')).toHaveValue('19');
    await page.reload();
    await expect(page.locator('#compareChartType')).toHaveValue('horizontal');
    await expect(page.locator('#compare-date')).toHaveValue('2021-01-20');
    await expect(page.locator('#compare-date-slider')).toHaveValue('19');
    await page.locator('#compare-date').fill(''); await page.locator('#compare-date').dispatchEvent('change');
    await expect(page.locator('#compare-date')).toHaveValue('2021-01-28');
    await expect(page.locator('#compareChartContainer .rank-bar')).toHaveCount(2);
    await expect(page.locator('#compareTitle')).not.toBeFocused();
    expect(errors).toEqual([]);
});

test('comparison scatter uses country axes over a shareable period with shared metric and unit controls', async ({ page }) => {
    await prepare(page, 'dark');
    await page.locator('#compareChartType').selectOption('scatter');
    await expect(page.locator('#compareChartContainer .scatter-point')).toHaveCount(28);
    await expect(page.locator('.controls-row')).toBeVisible();
    await expect(page.locator('.date-selection-panel')).toBeVisible();
    await expect(page.locator('#compare-xMetric, #compare-yMetric, #compare-date')).toHaveCount(0);
    await page.locator('#compare-date-range-start-input').fill('2021-01-05');
    await page.locator('#compare-date-range-start-input').dispatchEvent('change');
    await page.locator('#compare-date-range-end-input').fill('2021-01-20');
    await page.locator('#compare-date-range-end-input').dispatchEvent('change');
    await expect(page.locator('#compareChartContainer .scatter-point')).toHaveCount(16);
    await page.locator('#compareSmoothingSelector').selectOption('7day');
    await expect(page.locator('#compareChartContainer .scatter-point')).toHaveCount(14);
    await page.locator('#compareMetricSelector').selectOption('cumulative_confirmed');
    await page.locator('#compareUnitSelector').selectOption('per100k');
    await expect(page.locator('#compareChartContainer .scatter-point')).toHaveCount(16);
    const paired = await page.locator('.scatter-point').first().evaluate(node => ({ ...node.__data__ }));
    expect(paired).toMatchObject({ date: '2021-01-05', x: 40_000, y: 20_000 });
    await expect(page.locator('#compareChartContainer')).toContainText('Tunisia');
    await expect(page.locator('#compareChartContainer')).toContainText('United States');
    await page.reload();
    await expect(page.locator('#compareChartType')).toHaveValue('scatter');
    await expect(page.locator('#compare-date-range-start-input')).toHaveValue('2021-01-05');
    await expect(page.locator('#compare-date-range-end-input')).toHaveValue('2021-01-20');
    await expect(page.locator('#compareMetricSelector')).toHaveValue('cumulative_confirmed');
    await expect(page.locator('#compareUnitSelector')).toHaveValue('per100k');
    await expect(page.locator('#compareChartContainer .scatter-point')).toHaveCount(16);
});

test('two-country scatter zooms, pans, and resets without selecting chart text', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await prepare(page, 'dark');
    await page.locator('#compareChartType').selectOption('scatter');
    const chart = page.locator('#compareChartContainer'), view = chart.locator('.scatter-viewport');
    const points = view.locator('.scatter-point');
    const positions = () => points.evaluateAll(nodes => nodes.map(node => [node.getAttribute('cx'), node.getAttribute('cy')]));
    const original = await positions();
    await chart.locator('[data-scatter-action="in"]').click();
    await expect.poll(async () => Number(await view.getAttribute('data-zoom'))).toBeGreaterThan(1);
    expect(await positions()).not.toEqual(original);
    await view.scrollIntoViewIfNeeded();
    const surface = view.locator('.scatter-pan-surface'), bounds = await surface.boundingBox();
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const scroll = await page.evaluate(() => scrollY), beforeWheel = Number(await view.getAttribute('data-zoom'));
    await page.mouse.move(center.x, center.y); await page.mouse.wheel(0, -120);
    await expect.poll(async () => Number(await view.getAttribute('data-zoom'))).toBeGreaterThan(beforeWheel);
    expect(await page.evaluate(() => scrollY)).toBe(scroll);
    const beforeDrag = await positions();
    const label = await view.locator('.x-axis .tick text').first().boundingBox();
    await page.evaluate(() => getSelection().removeAllRanges());
    await page.mouse.move(label.x + label.width / 2, label.y + label.height / 2);
    await page.mouse.down(); await page.mouse.move(center.x, center.y, { steps: 8 }); await page.mouse.up();
    expect(await positions()).not.toEqual(beforeDrag);
    expect(await page.evaluate(() => getSelection().toString())).toBe('');
    await chart.locator('[data-scatter-action="out"]').click();
    await chart.locator('[data-scatter-action="reset"]').click();
    await expect(view).toHaveAttribute('data-zoom', '1');
    expect(await positions()).toEqual(original);
    await expect(points).toHaveCount(28);
    expect(errors).toEqual([]);
});

test('three-country scatter rotates and zooms without selecting text and prevents a fourth axis', async ({ page }) => {
    await prepare(page, 'dark');
    await page.locator('#compareChartType').selectOption('scatter');
    await page.locator('#addCountryBtn').click();
    await page.locator('#countrySearchInput').fill('France');
    await page.getByRole('button', { name: 'France', exact: true }).click();
    await expect(page.locator('#compareChartContainer .scatter-point')).toHaveCount(28);
    const view = page.locator('#compareChartContainer svg[data-yaw]');
    await expect(view).toBeVisible();
    const initial = await view.getAttribute('data-yaw');
    await view.focus(); await page.keyboard.press('ArrowRight');
    await expect.poll(() => view.getAttribute('data-yaw')).not.toBe(initial);
    const rotated = await view.getAttribute('data-yaw');
    await page.locator('#compareChartContainer [data-scatter-action="in"]').click();
    await expect.poll(async () => Number(await view.getAttribute('data-zoom'))).toBeGreaterThan(1);
    await expect(view).toHaveAttribute('data-yaw', rotated);
    await page.getByRole('button', { name: 'Reset view', exact: true }).click();
    await expect(view).toHaveAttribute('data-yaw', initial);
    await expect(view).toHaveAttribute('data-zoom', '1');
    await page.screenshot({ path: 'test-results/compare-scatter-3d.png', fullPage: true });
    await view.scrollIntoViewIfNeeded();
    const bounds = await view.boundingBox();
    const label = await view.locator('.scatter-3d-label').first().boundingBox();
    await page.evaluate(() => getSelection().removeAllRanges());
    await page.mouse.move(label.x + label.width / 2, label.y + label.height / 2);
    await page.mouse.down(); await page.mouse.move(label.x + label.width / 2 + 40, label.y + label.height / 2 + 10, { steps: 8 }); await page.mouse.up();
    await expect.poll(() => view.getAttribute('data-yaw')).not.toBe(initial);
    expect(await page.evaluate(() => getSelection().toString())).toBe('');
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.wheel(0, -120);
    await expect.poll(async () => Number(await view.getAttribute('data-zoom'))).toBeGreaterThan(1);
    await page.locator('#compareChartContainer [data-scatter-action="out"]').click();
    await page.locator('#addCountryBtn').click();
    await expect(page.locator('#compareMessage')).toContainText('up to 3 countries');
    await expect(page.locator('#searchModal')).toBeHidden();
    expect(await page.evaluate(() => CompareMode.state.countries)).toEqual(['tn', 'us', 'fr']);
});

test('dumbbell preserves a deliberately chosen full period when switching charts and refreshing', async ({ page }) => {
    const history = Array.from({ length: 200 }, (_, index) => {
        const date = new Date(Date.UTC(2020, 5, 1 + index)).toISOString().slice(0, 10);
        return ['TN', 'US'].map(code => `${date},${code},1,1,100,10,200`).join('\n');
    }).join('\n');
    await prepare(page, 'dark', undefined, { ...csv, epidem: `${csv.epidem}\n${history}` });
    await page.locator('#compareChartType').selectOption('dumbbell');
    expect(await page.evaluate(() => CompareMode.state.dateRange.start)).toBeGreaterThan(0);
    await page.evaluate(() => CompareMode.updateDateRange(0, 100));
    await page.locator('#compareChartType').selectOption('line');
    await page.locator('#compareChartType').selectOption('dumbbell');
    expect(await page.evaluate(() => CompareMode.state.dateRange)).toEqual({ start: 0, end: 100 });
    await page.reload(); await expect(page.locator('#compareChartType')).toHaveValue('dumbbell');
    await page.locator('#compareChartType').selectOption('line');
    await page.locator('#compareChartType').selectOption('dumbbell');
    expect(await page.evaluate(() => CompareMode.state.dateRange)).toEqual({ start: 0, end: 100 });
});

test('comparison charts use selected countries and arbitrary available measures', async ({ page }) => {
    test.setTimeout(90000);
    await prepare(page, 'light');
    for (const [category, metric] of [['hospitalizations', 'current_hospitalized_patients'],
        ['vaccinations', 'cumulative_vaccine_doses_administered']]) {
        await page.locator(category === 'hospitalizations' ? '#hospBtn' : '#vaccBtn').click();
        await page.locator('#compareMetricSelector').selectOption(metric);
        for (const [type, mark] of Object.entries(comparisonMarks)) {
            await page.locator('#compareChartType').selectOption(type);
            await expect(page.locator(`#compareChartContainer ${mark}`).first(), `${metric}: ${type}`).toBeVisible();
            await expect(page.locator('#compareChartContainer')).not.toContainText('France');
        }
    }
    await page.locator('#compareChartType').selectOption('scatter');
    await expect(page.locator('#compareChartContainer .scatter-point')).toHaveCount(28);
});

test('analytical charts support keyboard inspection and adapt appearance without replacing observations', async ({ page }) => {
    await prepare(page, 'dark');
    await page.locator('#compareChartType').selectOption('heatmap');
    const grid = page.locator('#compareChartContainer .heatmap-grid');
    await grid.focus();
    const first = await grid.getAttribute('aria-activedescendant');
    await page.keyboard.press('ArrowRight');
    expect(await grid.getAttribute('aria-activedescendant')).not.toBe(first);
    await expect(page.locator('#compareChartContainer .chart-tooltip')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#compareChartContainer .chart-tooltip')).toHaveCount(0);
    await expect(page.locator('#comparePanel')).toBeVisible();
    await page.locator('#compareChartType').selectOption('scatter');
    const points = page.locator('#compareChartContainer .scatter-point');
    const selectedCountry = await page.evaluate(() => globeInstance.selectedCountryCode);
    await points.first().focus(); await page.keyboard.press('ArrowRight');
    await expect(points.nth(1)).toBeFocused();
    await expect(page.locator('#compareChartContainer .chart-tooltip')).toContainText('2021-01-02');
    await expect(page.locator('#compareChartContainer .chart-tooltip')).toContainText('Tunisia');
    await expect(page.locator('#compareChartContainer .chart-tooltip')).toContainText('United States');
    expect(await page.evaluate(() => globeInstance.selectedCountryCode)).toBe(selectedCountry);
    await page.locator('#compareChartType').selectOption('horizontal');
    await page.evaluate(() => { window.__analyticsSource = dataService.indexedData; });
    const color = await page.locator('.rank-bar').first().getAttribute('fill');
    const geometry = await page.locator('.rank-bar').first().evaluate(node => ['x', 'width', 'y', 'height'].map(key => node.getAttribute(key)));
    await page.locator('#appearanceButton').click();
    await page.locator('[data-appearance="light"]').click();
    await expect.poll(() => page.locator('.rank-bar').first().getAttribute('fill')).not.toBe(color);
    expect(await page.locator('.rank-bar').first().evaluate(node => ['x', 'width', 'y', 'height'].map(key => node.getAttribute(key)))).toEqual(geometry);
    expect(await page.evaluate(() => dataService.indexedData === window.__analyticsSource)).toBe(true);
});

test('country analysis heading shows the selected day value and follows country, metric, units and averaging', async ({ page }) => {
    await prepare(page, 'dark', '/?country=tn&date=2021-01-28&smooth=raw');
    await page.locator('#seeMoreBtn').click();
    const value = page.locator('#analysisValue'), date = page.locator('#analysisValueDate');
    await expect(value).toHaveText('27');
    await expect(date).toHaveText('Selected day · Jan 28, 2021');
    await page.locator('#unitSelector').selectOption('per100k');
    await expect(value).toHaveText('2,700');
    await expect(page.locator('#analysisUnits')).toContainText('per 100,000');
    await page.locator('#averageBtn').click();
    await expect(value).toHaveText('2,400');
    await expect(page.locator('#analysisUnits')).toContainText('7-day average');
    await page.locator('#unitSelector').selectOption('count');
    await page.locator('#rawBtn').click();
    await page.locator('#dateSlider').fill('0');
    await expect(value).toHaveText('0');
    await expect(date).toContainText('Jan 1, 2021');
    await page.locator('#averageBtn').click();
    await expect(value).toHaveText('Unavailable');
    await expect(date).toContainText('Insufficient reports for average');
    await page.locator('#rawBtn').click();
    await page.locator('#dateSlider').fill('14');
    await expect(value).toHaveText('-2');
    await expect(date).toContainText('Reporting correction');
    await page.locator('#dateSlider').fill('9');
    await expect(value).toHaveText('9');
    await page.locator('#search').click();
    await page.locator('#countrySearchInput').fill('United States');
    await page.getByRole('button', { name: 'United States', exact: true }).click();
    await expect(value).toHaveText('18');
    await page.locator('#dataSelector').selectOption('new_deceased');
    await expect(value).toHaveText('4');
    await expect(page.locator('#analysisMetricLabel')).toHaveText('New reported deaths');
    await page.locator('#hospBtn').click();
    await page.locator('#dataSelector').selectOption('current_hospitalized_patients');
    await expect(value).toHaveText('36');
});

test('selected-day heading remains clear across chart types and independent of the analysis period', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await prepare(page, 'light', '/?country=tn&date=2021-01-28&smooth=raw');
    await page.locator('#seeMoreBtn').click();
    await page.locator('#date-range-start-input').fill('2021-01-05');
    await page.locator('#date-range-start-input').dispatchEvent('change');
    await page.locator('#date-range-end-input').fill('2021-01-10');
    await page.locator('#date-range-end-input').dispatchEvent('change');
    for (const type of Object.keys(countryMarks)) {
        await page.locator('#vizTypeSelector').selectOption(type);
        await expect(page.locator('#analysisValue')).toHaveText('27');
        await expect(page.locator('#analysisMetricLabel')).toHaveText('New confirmed cases');
        await expect(page.locator('#analysisValueDate')).toHaveText('Selected day · Jan 28, 2021');
    }
    await fits(page, '#analysisValue, #analysisValueDate, #vizTypeSelector');
    await page.locator('#analysisValue').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/country-analysis-selected-value-mobile.png' });
});

test('country analysis heading explains unavailable observations and missing population without showing zero', async ({ page }) => {
    const archive = { ...csv,
        epidem: csv.epidem.replace('2021-01-28,TN,27,', '2021-01-28,TN,,'),
        demographics: csv.demographics.replace('TN,1000', 'TN,') };
    await prepare(page, 'dark', '/?country=tn&date=2021-01-28&smooth=raw', archive);
    await page.locator('#seeMoreBtn').click();
    await expect(page.locator('#analysisValue')).toHaveText('Unavailable');
    await expect(page.locator('#analysisValueDate')).toContainText('No report on selected date');
    await page.locator('#dataSelector').selectOption('new_deceased');
    await expect(page.locator('#analysisValue')).toHaveText('2');
    await page.locator('#unitSelector').selectOption('per100k');
    await expect(page.locator('#analysisValue')).toHaveText('Unavailable');
    await expect(page.locator('#analysisValueDate')).toContainText('Population unavailable');
});

for (const [theme, width] of [['dark', 1440], ['light', 390]]) {
    test(`country line and area charts show case values on hover and keyboard focus in ${theme} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await prepare(page, theme, '/?country=tn&date=2021-01-28&smooth=raw');
        await page.locator('#seeMoreBtn').click();
        for (const type of ['line', 'area']) {
            await page.locator('#vizTypeSelector').selectOption(type);
            const inspector = page.locator('#chartContainer .chart-hit-area');
            await expect(inspector).toBeVisible();
            await inspector.hover();
            const index = Number(await inspector.getAttribute('aria-valuenow'));
            const tooltip = page.locator('#chartContainer .chart-tooltip');
            await expect(tooltip).toContainText(`Tunisia: ${index === 14 ? -2 : index}`);
            await expect(tooltip).toContainText('Cases');
            await expect(tooltip).toBeInViewport({ ratio: 1 });
            await page.mouse.move(0, 0);
            await expect(tooltip).toHaveCount(0);
            await inspector.focus();
            await expect(tooltip).toContainText('Tunisia:');
            await page.keyboard.press('End');
            await expect(tooltip).toContainText('Tunisia: 27');
            await expect(tooltip).toContainText('2021-01-28');
            await expect(tooltip).toBeInViewport({ ratio: 1 });
            await page.locator('#vizTypeSelector').focus();
            await expect(tooltip).toHaveCount(0);
        }
    });
}

test('country analysis contains only single-country charts and follows the chosen country and metric', async ({ page }) => {
    test.setTimeout(90000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await prepare(page, 'dark', '/?country=tn&date=2021-01-28&smooth=raw');
    await page.locator('#seeMoreBtn').click();
    await chartChoices(page, '#vizTypeSelector', countryMarks);
    for (const [category, metric] of [['hospitalizations', 'current_hospitalized_patients'],
        ['vaccinations', 'cumulative_vaccine_doses_administered']]) {
        await page.locator(category === 'hospitalizations' ? '#hospBtn' : '#vaccBtn').click();
        await page.locator('#dataSelector').selectOption(metric);
        for (const [type, mark] of Object.entries(countryMarks)) {
            await page.locator('#vizTypeSelector').selectOption(type);
            await expect(page.locator(`#chartContainer ${mark}`).first(), `${metric}: ${type}`).toBeVisible();
            await expect(page.locator('#chartContainer')).not.toContainText('United States');
            await expect(page.locator('#chartContainer')).not.toContainText('France');
        }
    }
    expect(await page.evaluate(() => globeInstance.selectedCountryCode)).toBe('tn');
    await page.locator('#search').click();
    await page.locator('#countrySearchInput').fill('United States');
    await page.getByRole('button', { name: 'United States', exact: true }).click();
    await expect(page.locator('#viz-country-name')).toHaveText('United States');
    await expect(page.locator('#chartContainer .box-mark')).toHaveCount(1);
    await expect(page.locator('#chartContainer .box-statistics-table')).toHaveCount(0);
    await page.locator('#chartContainer .box-mark').hover();
    await expect(page.locator('#chartContainer .chart-tooltip')).toContainText('United States');
    await page.locator('#vizTypeSelector').selectOption('line');
    await expect(page.locator('#chartControlsContainer')).toBeVisible();
    await expect(page.locator('#analysisChartOptions')).toBeHidden();
    await expect(page.locator('#analysisChartOptions > *')).toHaveCount(0);
    await expect(page.locator('#chartContainer .data-line')).toHaveCount(1);
    expect(errors).toEqual([]);
});

test('country scatter axes stay within the active dataset and retain the chosen period', async ({ page }) => {
    await prepare(page, 'light', '/?country=tn&date=2021-01-28&smooth=raw');
    await page.locator('#seeMoreBtn').click();
    await page.locator('#hospBtn').click();
    await page.locator('#vizTypeSelector').selectOption('scatter');
    await page.locator('#analysis-xMetric').selectOption('current_hospitalized_patients');
    await page.locator('#analysis-xUnit').selectOption('per100k');
    await page.locator('#analysis-yMetric').selectOption('current_intensive_care_patients');
    await page.locator('#analysis-yUnit').selectOption('count');
    await page.locator('#analysis-smoothing').selectOption('7day');
    await page.locator('#date-range-start-input').fill('2021-01-10');
    await page.locator('#date-range-start-input').dispatchEvent('change');
    await page.locator('#date-range-end-input').fill('2021-01-20');
    await page.locator('#date-range-end-input').dispatchEvent('change');
    await expect(page.locator('#chartContainer .scatter-point')).toHaveCount(11);
    expect(await page.locator('#chartContainer .scatter-point').first().evaluate(node => ({ ...node.__data__ })))
        .toMatchObject({ date: '2021-01-10', x: 1200, y: 6 });
    const activeChoices = async () => {
        const columns = await page.evaluate(() => dataService.availableColumns[dataService.currentDataset]);
        for (const selector of ['#analysis-xMetric', '#analysis-yMetric']) {
            expect(await page.locator(selector + ' option').evaluateAll(nodes => nodes.map(node => node.value))).toEqual(columns);
            expect(columns).toContain(await page.locator(selector).inputValue());
        }
    };
    await activeChoices();
    await page.screenshot({ path: 'test-results/country-scatter-columns.png', fullPage: true });
    await page.locator('#vaccBtn').click();
    await activeChoices();
    await expect(page.locator('#analysis-xMetric option[value="current_hospitalized_patients"]')).toHaveCount(0);
    await expect(page.locator('#analysis-xMetric option[value="new_confirmed"]')).toHaveCount(0);
    await expect(page.locator('#date-range-start-input')).toHaveValue('2021-01-10');
    await expect(page.locator('#date-range-end-input')).toHaveValue('2021-01-20');
    await page.locator('#vizTypeSelector').selectOption('line');
    await expect(page.locator('#analysisChartOptions')).toBeHidden();
    await expect(page.locator('#analysisChartOptions > *')).toHaveCount(0);
    await page.locator('#vizTypeSelector').selectOption('scatter');
    await activeChoices();
});

test('box statistics appear on hover and keyboard focus without extra panels in either workspace', async ({ page }) => {
    await prepare(page, 'dark');
    await page.locator('#compareChartType').selectOption('box');
    await expect(page.locator('#compareChartContainer .box-mark')).toHaveCount(2);
    await expect(page.locator('.box-statistics, .box-observations, .box-statistics-table')).toHaveCount(0);
    const mark = page.locator('#compareChartContainer .box-mark').first();
    await mark.hover();
    const tooltip = page.locator('#compareChartContainer .chart-tooltip');
    for (const text of ['Reported observations: 28', 'Minimum: -2', 'Maximum: 27', 'Q1:', 'Q3:', 'Mean:', 'Interquartile range:', 'Whiskers:'])
        await expect(tooltip).toContainText(text);
    await expect(tooltip).toContainText(/Median: 12[.,]5/);
    await page.mouse.move(0, 0);
    await expect(tooltip).toHaveCount(0);
    await mark.focus(); await expect(tooltip).toContainText('Minimum: -2');
    await page.locator('#compareChartType').focus(); await expect(tooltip).toHaveCount(0);
    await page.locator('#navExplore').click();
    await page.locator('#search').click();
    await page.locator('#countrySearchInput').fill('Tunisia');
    await page.getByRole('button', { name: 'Tunisia', exact: true }).click();
    await page.locator('#seeMoreBtn').click();
    await page.locator('#vizTypeSelector').selectOption('box');
    await page.locator('#chartContainer .box-mark').hover();
    await expect(page.locator('#chartContainer .chart-tooltip')).toContainText('Minimum: -2');
    await expect(page.locator('#chartContainer .chart-tooltip')).toContainText('Median:');
    await expect(page.locator('#chartContainer table, #chartContainer details')).toHaveCount(0);
});

test('comparison setting changes preserve the scroll position when the chart becomes shorter', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 500 });
    await prepare(page, 'dark');
    await page.locator('#compareChartType').selectOption('box');
    const position = await page.evaluate(() => {
        scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); return scrollY;
    });
    expect(position).toBeGreaterThan(0);
    for (const [id, value] of [['compareMetricSelector', 'new_tested'], ['compareUnitSelector', 'per100k'], ['compareChartType', 'horizontal']]) {
        await page.locator(`#${id}`).evaluate((select, value) => {
            select.value = value; select.dispatchEvent(new Event('change', { bubbles: true }));
        }, value);
        await expect.poll(() => page.evaluate(() => scrollY)).toBe(position);
    }
    await expect(page.locator('.rank-bar')).toHaveCount(2);
    await page.locator('#navExplore').click();
    expect(await page.locator('#comparePanel').evaluate(panel => panel.style.minHeight)).toBe('');
});

test('old comparison links to removed or single-country chart types fall back to trend lines', async ({ page }) => {
    for (const type of ['stacked', 'stacked100', 'radar', 'area', 'histogram']) {
        await prepare(page, 'dark', `/?view=compare&compare=tn,us&date=2021-01-28&smooth=raw&chart=${type}`);
        await expect(page.locator('#compareChartType')).toHaveValue('line');
        await expect(page.locator('#compareChartContainer .data-line')).toHaveCount(2);
        expect(await page.evaluate(() => CompareMode.state.chartType)).toBe('line');
    }
});

test('new comparisons use the prepared original Google archive without fabricated fallbacks', async ({ page }) => {
    test.skip(!existsSync('data/country_level_epidem.csv'), 'Prepared archive is not installed in this checkout.');
    test.setTimeout(120000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('https://flagcdn.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }));
    await page.goto('/?view=compare&compare=us,fr&date=2021-08-09&smooth=raw');
    await expect(page.locator('#dataSelector')).toBeEnabled();
    await expect.poll(() => page.evaluate(() => window.AtlasView.restoring)).toBe(false);
    await expect(page.locator('#dataSourceSelector')).toHaveValue('csv');
    await chartChoices(page, '#compareChartType', comparisonMarks);
    for (const [type, mark] of Object.entries(comparisonMarks)) {
        await page.locator('#compareChartType').selectOption(type);
        await expect(page.locator(`#compareChartContainer ${mark}:visible`).first(), type).toBeVisible();
        expect(await page.locator('#compareChartContainer svg').evaluateAll(nodes => nodes.every(svg => !/NaN|Infinity/.test(svg.outerHTML))), type).toBe(true);
        if (type === 'scatter') {
            expect(await page.locator('.scatter-point').count()).toBeGreaterThan(28);
            expect(await page.locator('.scatter-point').evaluateAll(nodes => {
                const points = nodes.map(node => node.__data__);
                return new Set(points.map(point => point.date)).size === points.length && points.every(point =>
                    point.x === dataService.getDisplayValue('us', { date: point.date }) &&
                    point.y === dataService.getDisplayValue('fr', { date: point.date }));
            })).toBe(true);
        }
    }
    expect(await page.evaluate(() => dataService.getAllCountries().length)).toBe(246);
    expect(errors).toEqual([]);
});
