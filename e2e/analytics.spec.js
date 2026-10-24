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

async function scatterDateLegend(page, selector, expectedDates) {
    const chart = page.locator(selector), legend = chart.locator('.scatter-date-legend');
    await expect(legend).toBeVisible();
    await expect(legend).toHaveAccessibleName(/^Date:/);
    await expect(legend).toContainText('Date');
    await expect(legend.locator('.scatter-date-bar')).toBeVisible();
    const scale = await chart.evaluate(node => {
        const legend = node.querySelector('.scatter-date-legend'), bar = legend.querySelector('.scatter-date-bar');
        const points = [...node.querySelectorAll('.scatter-point')].sort((a, b) => a.__data__.date.localeCompare(b.__data__.date));
        const dates = [...legend.querySelectorAll('time')].map(time => time.dateTime);
        const colors = getComputedStyle(bar).backgroundImage.match(/rgba?\([^)]+\)/g) || [];
        return { dates, endpoints: [...new Set([points[0].__data__.date, points.at(-1).__data__.date])],
            colors: dates.length === 1 ? [getComputedStyle(bar).backgroundColor] : [colors[0], colors.at(-1)],
            pointColors: [...new Set([points[0], points.at(-1)])].map(point => getComputedStyle(point).fill) };
    });
    expect(scale.dates).toEqual(expectedDates || scale.endpoints);
    expect(scale.colors).toEqual(scale.pointColors);
    await fits(page, `${selector} .scatter-date-legend, ${selector} .scatter-date-bar, ${selector} .scatter-date-legend time`);
}

async function heatmapValueLegend(page, selector) {
    const chart = page.locator(selector), legend = chart.locator('.heatmap-value-legend');
    await expect(legend).toBeVisible();
    await expect(legend).toHaveAccessibleName(/Lower values on the left, higher values on the right/);
    await expect(legend.locator('.heatmap-value-bar')).toBeVisible();
    const scale = await chart.evaluate(node => {
        const legend = node.querySelector('.heatmap-value-legend'), bar = legend.querySelector('.heatmap-value-bar');
        const cells = [...node.querySelectorAll('.heatmap-cell')].filter(cell => Number.isFinite(cell.__data__.value) && cell.__data__.value >= 0);
        const highest = cells.reduce((current, cell) => cell.__data__.value > current.__data__.value ? cell : current);
        const colors = getComputedStyle(bar).backgroundImage.match(/rgba?\([^)]+\)/g) || [];
        return { endpoints: [...legend.querySelectorAll('.heatmap-value-range span')].map(span => span.textContent),
            expected: ['0', AnalyticsPlot.value(highest.__data__.value)],
            colors: [colors[0], colors.at(-1)],
            expectedColors: [d3.color(AtlasTheme.getColor('--heatmap-low')).formatRgb(), getComputedStyle(highest).fill] };
    });
    expect(scale.endpoints).toEqual(scale.expected);
    expect(scale.colors).toEqual(scale.expectedColors);
    await fits(page, `${selector} .heatmap-value-legend, ${selector} .heatmap-value-bar, ${selector} .heatmap-value-range span`);
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
                await heatmapValueLegend(page, '#compareChartContainer');
                await expect(page.locator('.analytics-heatmap-scroll')).toHaveCount(0);
                expect(await page.locator('#compareChartContainer').evaluate(node => node.scrollWidth <= node.clientWidth + 1),
                    'Heatmaps fit without horizontal scrolling').toBe(true);
                const clipped = await page.locator('#compareChartContainer .x-axis .tick text').evaluateAll(nodes => nodes.flatMap(node => {
                    const bounds = node.getBoundingClientRect(), svg = node.ownerSVGElement.getBoundingClientRect();
                    return bounds.left < svg.left - 1 || bounds.right > svg.right + 1 ? [node.textContent] : [];
                }));
                expect(clipped, 'Heatmap date labels fit inside the chart').toEqual([]);
            }
            if (type === 'scatter') await scatterDateLegend(page, '#compareChartContainer');
            if (['heatmap', 'horizontal', 'box', 'scatter'].includes(type))
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

test('horizontal bars step dates with arrows, synchronize their slider, and preserve the shared date', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await prepare(page, 'dark');
    await page.locator('#compareChartType').selectOption('horizontal');
    await expect(page.locator('.date-selection-panel')).toBeHidden();
    const slider = page.locator('#compare-date-slider'), date = page.locator('#compare-date');
    const previous = page.locator('#compare-date-prev'), next = page.locator('#compare-date-next');
    const selectIndex = index => slider.evaluate((input, value) => {
        input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true }));
    }, index);
    const selectedDate = async (value, index, values) => {
        await expect(date).toHaveValue(value);
        await expect(slider).toHaveValue(String(index));
        await expect.poll(() => page.locator('#compareChartContainer .rank-bar, #compareChartContainer .rank-zero').evaluateAll(nodes =>
            nodes.map(node => node.__data__.value).sort((a, b) => a - b))).toEqual(values);
        await expect(page.locator('#compareChartContainer .rank-zero')).toHaveCount(values.filter(value => value === 0).length);
        await expect(page.locator('#compareChartContainer .rank-bar')).toHaveCount(values.filter(value => value !== 0).length);
        await expect.poll(() => JSON.parse(new URL(page.url()).searchParams.get('chartOptions') || '{}').date).toBe(value);
    };
    await expect(slider).toBeVisible();
    await expect(previous).toHaveAccessibleName('Previous date');
    await expect(next).toHaveAccessibleName('Next date');
    await expect(previous).toBeEnabled();
    await expect(next).toBeDisabled();
    await previous.click();
    await selectedDate('2021-01-27', 26, [26, 52]);
    await next.click();
    await selectedDate('2021-01-28', 27, [27, 54]);

    await selectIndex(9);
    await selectedDate('2021-01-10', 9, [9, 18]);
    await previous.scrollIntoViewIfNeeded();
    const position = await page.evaluate(() => scrollY);
    await previous.click();
    await selectedDate('2021-01-09', 8, [8, 16]);
    expect(await page.evaluate(() => scrollY)).toBe(position);
    await next.click();
    await selectedDate('2021-01-10', 9, [9, 18]);
    expect(await page.evaluate(() => scrollY)).toBe(position);

    await selectIndex(0);
    await selectedDate('2021-01-01', 0, [0, 0]);
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();
    await next.click();
    await selectedDate('2021-01-02', 1, [1, 2]);
    await expect(previous).toBeEnabled();
    await selectIndex(27);
    await expect(next).toBeDisabled();

    await page.locator('#compare-date').fill('2021-01-20');
    await page.locator('#compare-date').dispatchEvent('change');
    await selectedDate('2021-01-20', 19, [19, 38]);
    await next.click();
    await selectedDate('2021-01-21', 20, [20, 40]);
    await page.reload();
    await expect(page.locator('#compareChartType')).toHaveValue('horizontal');
    await selectedDate('2021-01-21', 20, [20, 40]);
    await expect(previous).toBeEnabled();
    await expect(next).toBeEnabled();
    await page.locator('#compare-date').fill(''); await page.locator('#compare-date').dispatchEvent('change');
    await expect(page.locator('#compare-date')).toHaveValue('2021-01-21');
    await expect(page.locator('#compareChartContainer .rank-bar')).toHaveCount(2);
    await expect(page.locator('#compareTitle')).not.toBeFocused();
    expect(errors).toEqual([]);
});

test('horizontal date arrows include unreported calendar days without inventing values', async ({ page }) => {
    const archive = { ...csv, epidem: csv.epidem.split('\n').filter(row => !row.startsWith('2021-01-11,')).join('\n') };
    await prepare(page, 'dark', undefined, archive);
    await page.locator('#compareChartType').selectOption('horizontal');
    const date = page.locator('#compare-date'), slider = page.locator('#compare-date-slider');
    await date.fill('2021-01-10'); await date.dispatchEvent('change');
    await page.locator('#compare-date-next').click();
    await expect(date).toHaveValue('2021-01-11');
    await expect(slider).toHaveValue('9');
    await expect(page.locator('#compareChartContainer .rank-bar')).toHaveCount(0);
    await page.locator('#compare-date-next').click();
    await expect(date).toHaveValue('2021-01-12');
    await expect(slider).toHaveValue('10');
    await expect(page.locator('#compareChartContainer .rank-bar')).toHaveCount(2);
    await page.locator('#compare-date-prev').click();
    await expect(date).toHaveValue('2021-01-11');
    await expect(page.locator('#compareChartContainer .rank-bar')).toHaveCount(0);
});

test('comparison scatter uses country axes over a shareable period with shared metric and unit controls', async ({ page }) => {
    await prepare(page, 'dark');
    await page.locator('#compareChartType').selectOption('scatter');
    await expect(page.locator('#compareChartContainer .scatter-point')).toHaveCount(28);
    await scatterDateLegend(page, '#compareChartContainer', ['2021-01-01', '2021-01-28']);
    await expect(page.locator('.controls-row')).toBeVisible();
    await expect(page.locator('.date-selection-panel')).toBeVisible();
    await expect(page.locator('#compare-xMetric, #compare-yMetric, #compare-date')).toHaveCount(0);
    await page.locator('#compare-date-range-start-input').fill('2021-01-05');
    await page.locator('#compare-date-range-start-input').dispatchEvent('change');
    await page.locator('#compare-date-range-end-input').fill('2021-01-20');
    await page.locator('#compare-date-range-end-input').dispatchEvent('change');
    await expect(page.locator('#compareChartContainer .scatter-point')).toHaveCount(16);
    await scatterDateLegend(page, '#compareChartContainer', ['2021-01-05', '2021-01-20']);
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
    await scatterDateLegend(page, '#compareChartContainer', ['2021-01-01', '2021-01-28']);
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

test('country analysis settings share atlas state and retain the selected country, date and analysis period', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await prepare(page, 'dark', '/?country=tn&analysis=1&date=2021-01-28&smooth=raw');
    const value = page.locator('#analysisValue');
    await page.locator('#date-range-start-input').fill('2021-01-05');
    await page.locator('#date-range-start-input').dispatchEvent('change');
    await page.locator('#date-range-end-input').fill('2021-01-20');
    await page.locator('#date-range-end-input').dispatchEvent('change');
    expect(await page.locator('#analysisMetricSelector option').evaluateAll(nodes => nodes.map(option => option.value)))
        .toEqual(await page.locator('#dataSelector option').evaluateAll(nodes => nodes.map(option => option.value)));
    await page.locator('#analysisMetricSelector').selectOption('new_tested');
    await expect(page.locator('#dataSelector')).toHaveValue('new_tested');
    await expect(page.locator('#analysisMetricLabel')).toHaveText('New tests');
    await expect(value).toHaveText('540');
    await page.locator('#analysisUnitSelector').selectOption('per100k');
    await expect(page.locator('#unitSelector')).toHaveValue('per100k');
    await expect(value).toHaveText('54,000');
    await page.locator('#analysisAverageBtn').click();
    await expect(page.locator('#averageBtn')).toHaveAttribute('aria-pressed', 'true');
    await expect(value).toHaveText('48,000');
    await expect(page.locator('#analysisUnits')).toContainText('7-day average');
    await expect(page.locator('#date-range-start-input')).toHaveValue('2021-01-05');
    await expect(page.locator('#date-range-end-input')).toHaveValue('2021-01-20');
    expect(await page.evaluate(() => ({ country: globeInstance.selectedCountryCode, date: dataService.currentDate })))
        .toEqual({ country: 'tn', date: '2021-01-28' });
    await page.locator('.analysis-controls').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/country-analysis-settings-desktop.png' });
    expect(new URL(page.url()).searchParams.get('metric')).toBe('new_tested');
    expect(new URL(page.url()).searchParams.get('unit')).toBe('per100k');
    await page.locator('#dataSelector').selectOption('cumulative_confirmed');
    await expect(page.locator('#analysisMetricSelector')).toHaveValue('cumulative_confirmed');
    await expect(page.locator('#analysisReportingGroup')).toBeHidden();
    await expect(page.locator('#analysisAverageBtn')).toBeDisabled();
    await expect(value).toHaveText('270,000');
    expect(new URL(page.url()).searchParams.has('smooth')).toBe(false);
    await page.locator('#unitSelector').selectOption('count');
    await expect(page.locator('#analysisUnitSelector')).toHaveValue('count');
    await page.locator('#dataSelector').selectOption('new_confirmed');
    await page.locator('#averageBtn').click();
    await expect(page.locator('#analysisReportingGroup')).toBeVisible();
    await expect(page.locator('#analysisAverageBtn')).toHaveAttribute('aria-pressed', 'true');
    await expect(value).toHaveText('24');
    await expect(page.locator('#date-range-start-input')).toHaveValue('2021-01-05');
    await expect(page.locator('#date-range-end-input')).toHaveValue('2021-01-20');
    await page.reload();
    await expect(page.locator('#visualizationPanel')).toBeVisible();
    await expect(page.locator('#analysisMetricSelector')).toHaveValue('new_confirmed');
    await expect(page.locator('#analysisUnitSelector')).toHaveValue('count');
    await expect(page.locator('#analysisAverageBtn')).toHaveAttribute('aria-pressed', 'true');
    await expect(value).toHaveText('24');
    expect(errors).toEqual([]);
});

test('country analysis settings fit on mobile and changing them keeps the toolbar in place', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await prepare(page, 'light', '/?country=tn&analysis=1&date=2021-01-28&smooth=raw');
    await fits(page, '.analysis-controls, #analysisMetricSelector, #analysisUnitSelector, #analysisReportingGroup, #vizTypeSelector');
    await page.locator('.analysis-controls').evaluate(node => {
        window.scrollTo(0, window.scrollY + node.getBoundingClientRect().top - 120);
    });
    for (const change of [
        () => page.locator('#analysisMetricSelector').selectOption('new_deceased'),
        () => page.locator('#analysisUnitSelector').selectOption('per100k'),
        () => page.locator('#analysisAverageBtn').click(),
        () => page.locator('#analysisRawBtn').click()
    ]) {
        const previous = await page.locator('.analysis-controls').evaluate(node => node.getBoundingClientRect().top);
        await change();
        // Browser scroll anchoring may adjust scrollY when content above changes
        // height. The user's visible toolbar should retain its viewport position.
        await expect.poll(async () => Math.abs(await page.locator('.analysis-controls')
            .evaluate(node => node.getBoundingClientRect().top) - previous)).toBeLessThanOrEqual(2);
    }
    await expect(page.locator('#analysisValue')).toHaveText('200');
    await expect(page.locator('#dataSelector')).toHaveValue('new_deceased');
    await expect(page.locator('#rawBtn')).toHaveAttribute('aria-pressed', 'true');
    await fits(page, '.analysis-controls, #analysisMetricSelector, #analysisUnitSelector, #analysisReportingGroup, #vizTypeSelector');
    await page.screenshot({ path: 'test-results/country-analysis-settings-mobile.png' });
});

for (const [theme, width, motion] of [['dark', 1440, 'reduce'], ['light', 390, 'reduce'],
    ['dark', 1440, 'no-preference'], ['light', 390, 'no-preference']]) {
    test(`country bar transitions avoid extra scroll jumps and keep natural heights at ${width}px with ${motion}`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: motion });
        await page.setViewportSize({ width, height: 1000 });
        const history = Array.from({ length: 126 }, (_, index) => {
            const date = new Date(Date.UTC(2021, 0, index + 1)).toISOString().slice(0, 10);
            return `${date},TN,${index + 1},${index % 5},${index * 100},${index * 3},${index * 20}`;
        });
        const archive = { ...csv, epidem: `${csv.epidem.split('\n')[0]}\n${history.join('\n')}` };
        await prepare(page, theme, '/?country=tn&analysis=1&date=2021-05-06&smooth=raw', archive);
        const selector = page.locator('#vizTypeSelector');
        const position = () => page.evaluate(() => ({
            y: scrollY, toolbar: document.querySelector('.analysis-controls').getBoundingClientRect().top
        }));
        const assertBounded = async (before, type) => {
            await expect(selector).toHaveValue(type);
            await expect(page.locator(`#chartContainer ${countryMarks[type]}`).first()).toBeVisible();
            // Observe rendered frames as well as the final position: a delayed
            // restoration must not hide a collapse during redraw. A genuinely
            // shorter final chart may clamp the viewport to its new page bottom.
            const frames = await page.evaluate(async () => {
                const positions = [];
                for (let frame = 0; frame < 4; frame++) {
                    await new Promise(requestAnimationFrame);
                    positions.push({ y: scrollY, maximum: Math.max(0, document.documentElement.scrollHeight - innerHeight),
                        toolbar: document.querySelector('.analysis-controls').getBoundingClientRect().top });
                }
                return positions;
            });
            const expectedY = Math.min(before.y, frames.at(-1).maximum);
            for (const after of frames) {
                expect(Math.abs(after.y - expectedY), `${type}: page position`).toBeLessThanOrEqual(2);
                expect(Math.abs(after.toolbar - (before.toolbar + before.y - expectedY)), `${type}: visible controls`).toBeLessThanOrEqual(2);
            }
            expect(await page.locator('#visualizationPanel').evaluate(node => node.style.minHeight)).toBe('');
            if (type === 'bar') {
                const note = page.locator('#chartContainer > .chart-note');
                await expect(note).toContainText('Weekly totals');
                const layout = await note.evaluate(node => ({
                    padding: parseFloat(getComputedStyle(node.closest('.country-analysis')).paddingBottom),
                    noteTop: node.getBoundingClientRect().top,
                    axisBottom: Math.max(...[...node.previousElementSibling.querySelectorAll('.x-axis text')]
                        .map(label => label.getBoundingClientRect().bottom))
                }));
                expect(layout.padding).toBe(12);
                expect(layout.noteTop).toBeGreaterThanOrEqual(layout.axisBottom);
            }
        };
        await selector.evaluate(node => {
            const top = node.getBoundingClientRect().top + scrollY;
            const maximum = document.documentElement.scrollHeight - innerHeight;
            scrollTo({ top: Math.max(0, Math.min(maximum - 160, top - innerHeight * 0.6)), behavior: 'instant' });
        });
        await expect(selector).toBeInViewport({ ratio: 1 });
        for (const type of ['bar', 'area', 'bar', 'line']) {
            const before = await position();
            // selectOption changes the actual control without scrolling it into view.
            await selector.selectOption(type);
            await assertBounded(before, type);
        }
        await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
        await expect(selector).toBeInViewport({ ratio: 1 });
        await selector.evaluate(node => node.focus({ preventScroll: true }));
        for (const [key, type] of [['ArrowDown', 'bar'], ['ArrowDown', 'area'], ['ArrowUp', 'bar'], ['ArrowUp', 'line']]) {
            const before = await position();
            await page.keyboard.press(key);
            await assertBounded(before, type);
        }
        const bottomGap = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#exploreView')).paddingBottom));
        expect(bottomGap).toBeGreaterThanOrEqual(4);
        expect(bottomGap).toBeLessThanOrEqual(6);
        const panel = page.locator('#visualizationPanel');
        // Establish a real shorter-chart transition at the bottom. Which type
        // is taller depends on how many lines the weekly note wraps onto.
        await page.evaluate(() => scrollBy({ top: -200, behavior: 'instant' }));
        await selector.selectOption('line');
        const lineHeight = await panel.evaluate(node => node.getBoundingClientRect().height);
        await selector.selectOption('bar');
        const barHeight = await panel.evaluate(node => node.getBoundingClientRect().height);
        const longer = lineHeight > barHeight ? 'line' : 'bar';
        const shorter = longer === 'line' ? 'bar' : 'line';
        const naturalHeight = Math.min(lineHeight, barHeight);
        await selector.selectOption(longer);
        await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
        const atBottom = await position();
        await selector.selectOption(shorter);
        await assertBounded(atBottom, shorter);
        expect(await panel.evaluate(node => node.getBoundingClientRect().height)).toBeCloseTo(naturalHeight, 0);
        await page.evaluate(() => scrollBy({ top: -200, behavior: 'instant' }));
        const before = await position();
        await page.evaluate(() => changeVisualization());
        await assertBounded(before, shorter);
        expect(await panel.evaluate(node => node.getBoundingClientRect().height)).toBeCloseTo(naturalHeight, 0);
        await page.locator('#analysisCloseBtn').click();
        await expect(panel).toBeHidden();
        expect(await panel.evaluate(node => node.style.minHeight)).toBe('');
    });
}

for (const [theme, width, motion] of [['dark', 1440, 'reduce'], ['light', 390, 'reduce'],
    ['dark', 1440, 'no-preference'], ['light', 390, 'no-preference']]) {
    test(`country bar range handles preserve scroll during keyboard input and dragging at ${width}px with ${motion}`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: motion });
        await page.setViewportSize({ width, height: 720 });
        const history = Array.from({ length: 126 }, (_, index) => {
            const date = new Date(Date.UTC(2021, 0, index + 1)).toISOString().slice(0, 10);
            return `${date},TN,${index + 1},${index % 5},${index * 100},${index * 3},${index * 20}`;
        });
        const archive = { ...csv, epidem: `${csv.epidem.split('\n')[0]}\n${history.join('\n')}` };
        await prepare(page, theme, '/?country=tn&analysis=1&date=2021-05-06&smooth=raw', archive);
        await page.locator('#vizTypeSelector').selectOption('bar');
        await expect(page.locator('#chartContainer > .chart-note')).toContainText('Weekly totals');
        await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
        const start = await page.locator('#date-range-start').elementHandle();
        const end = await page.locator('#date-range-end').elementHandle();
        for (const id of ['start', 'end']) await expect(page.locator(`#date-range-${id}`)).toBeInViewport({ ratio: 1 });

        const checkMovement = async action => {
            const before = await page.evaluate(() => {
                const sample = () => ({ y: scrollY, maximum: Math.max(0, document.documentElement.scrollHeight - innerHeight) });
                window.rangeScrollFrames = [sample()];
                const record = () => {
                    window.rangeScrollFrames.push(sample());
                    window.rangeScrollFrame = requestAnimationFrame(record);
                };
                window.rangeScrollFrame = requestAnimationFrame(record);
                return scrollY;
            });
            await action();
            const frames = await page.evaluate(async () => {
                for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
                cancelAnimationFrame(window.rangeScrollFrame);
                return window.rangeScrollFrames;
            });
            // A shorter daily note may legitimately shorten the final page.
            // No frame may jump above that final limit during SVG replacement.
            const expected = Math.min(before, frames.at(-1).maximum);
            for (const frame of frames) {
                expect(frame.y).toBeGreaterThanOrEqual(expected - 2);
                expect(frame.y).toBeLessThanOrEqual(before + 2);
            }
            expect(Math.abs(frames.at(-1).y - expected)).toBeLessThanOrEqual(2);
            expect(await page.locator('#visualizationPanel').evaluate(node => node.style.minHeight)).toBe('');
            // Updating the chart must leave native handles mounted, preserving
            // pointer capture, keyboard focus and continuous dragging.
            expect(await start.evaluate(node => node === document.querySelector('#date-range-start'))).toBe(true);
            expect(await end.evaluate(node => node === document.querySelector('#date-range-end'))).toBe(true);
        };
        for (const [handle, key, value] of [[start, 'ArrowRight', '1'], [end, 'ArrowLeft', '124']]) {
            await handle.evaluate(node => node.focus({ preventScroll: true }));
            await checkMovement(() => page.keyboard.press(key));
            expect(await handle.inputValue()).toBe(value);
        }
        for (const [handle, target] of [[start, 9], [end, 112]]) {
            const thumb = await handle.evaluate((node, target) => {
                const bounds = node.getBoundingClientRect();
                // Chromium reports the input's width for this pseudo-element;
                // use the thumb dimensions defined by the responsive CSS.
                const size = innerWidth <= 760 ? 21 : 17;
                const travel = bounds.width - size;
                return { x: bounds.left + size / 2 + travel * Number(node.value) / Number(node.max),
                    y: bounds.top + bounds.height / 2,
                    target: bounds.left + size / 2 + travel * target / Number(node.max) };
            }, target);
            await checkMovement(async () => {
                await page.mouse.move(thumb.x, thumb.y);
                await page.mouse.down();
                await page.mouse.move(thumb.target, thumb.y, { steps: 6 });
                await page.mouse.up();
            });
            expect(await handle.inputValue()).toBe(String(target));
        }
        await expect(page.locator('#chartContainer > .chart-note')).not.toContainText('Weekly totals');
    });
}

for (const [theme, width] of [['dark', 1440], ['light', 390]]) {
    test(`country heatmap switches back to the natural line-chart height at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        const history = Array.from({ length: 730 }, (_, index) => {
            const date = new Date(Date.UTC(2021, 0, index + 1)).toISOString().slice(0, 10);
            return `${date},TN,${index + 1},${index % 5},${index * 100},${index * 3},${index * 20}`;
        });
        const archive = { ...csv, epidem: `${csv.epidem.split('\n')[0]}\n${history.join('\n')}` };
        await prepare(page, theme, '/?country=tn&analysis=1&date=2022-12-31&smooth=raw', archive);
        const panel = page.locator('#visualizationPanel'), selector = page.locator('#vizTypeSelector');
        await expect(page.locator('#chartContainer .data-line')).toBeVisible();
        const lineHeight = await panel.evaluate(node => node.getBoundingClientRect().height);
        await selector.selectOption('heatmap');
        await expect(page.locator('#chartContainer .heatmap-cell')).toHaveCount(744);
        await heatmapValueLegend(page, '#chartContainer');
        expect(await panel.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThan(lineHeight + 100);
        const before = await page.evaluate(() => {
            scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); return scrollY;
        });
        await selector.selectOption('line');
        await expect(page.locator('#chartContainer .data-line')).toBeVisible();
        const frames = await page.evaluate(async () => {
            const positions = [];
            for (let frame = 0; frame < 4; frame++) {
                await new Promise(requestAnimationFrame);
                positions.push({ y: scrollY, maximum: Math.max(0, document.documentElement.scrollHeight - innerHeight) });
            }
            return positions;
        });
        for (const frame of frames) expect(Math.abs(frame.y - Math.min(before, frames.at(-1).maximum))).toBeLessThanOrEqual(2);
        expect(await panel.evaluate(node => node.getBoundingClientRect().height)).toBeCloseTo(lineHeight, 0);
        expect(await panel.evaluate(node => node.style.minHeight)).toBe('');
        await expect(page.locator('#chartContainer .heatmap-value-legend')).toHaveCount(0);
    });

    test(`comparison chart-type changes use natural panel heights at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 700 });
        await prepare(page, theme);
        const panel = page.locator('#comparePanel'), selector = page.locator('#compareChartType');
        const heights = { line: await panel.evaluate(node => node.getBoundingClientRect().height) };
        await selector.selectOption('heatmap');
        await expect(page.locator('#compareChartContainer .heatmap-cell').first()).toBeVisible();
        heights.heatmap = await panel.evaluate(node => node.getBoundingClientRect().height);
        expect(Math.abs(heights.line - heights.heatmap)).toBeGreaterThan(2);
        for (const type of ['line', 'heatmap', 'line']) {
            const before = await page.evaluate(() => {
                scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); return scrollY;
            });
            await selector.selectOption(type);
            await expect(page.locator(`#compareChartContainer ${comparisonMarks[type]}`).first()).toBeVisible();
            const position = await page.evaluate(() => ({ y: scrollY, maximum: Math.max(0, document.documentElement.scrollHeight - innerHeight) }));
            expect(Math.abs(position.y - Math.min(before, position.maximum))).toBeLessThanOrEqual(2);
            expect(await panel.evaluate(node => node.getBoundingClientRect().height)).toBeCloseTo(heights[type], 0);
            expect(await panel.evaluate(node => node.style.minHeight)).toBe('');
        }
    });
}

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
            if (type === 'scatter') await scatterDateLegend(page, '#chartContainer');
            if (type === 'heatmap') await heatmapValueLegend(page, '#chartContainer');
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

test('country scatter groups all dataset metrics and retains cross-dataset axes and the chosen period', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 1000 });
    await prepare(page, 'light', '/?country=tn&date=2021-01-28&smooth=raw');
    await page.locator('#seeMoreBtn').click();
    await page.locator('#hospBtn').click();
    await page.locator('#vizTypeSelector').selectOption('scatter');
    for (const id of ['analysisMetricControl', 'analysisUnitControl', 'analysisReportingGroup'])
        await expect(page.locator(`#${id}`)).toBeHidden();
    const activeColumns = await page.evaluate(() => dataService.availableColumns[dataService.currentDataset]);
    for (const selector of ['#analysis-xMetric', '#analysis-yMetric']) {
        expect(activeColumns).toContain(await page.locator(selector).inputValue());
        expect(await page.locator(`${selector} optgroup`).evaluateAll(groups => groups.map(group => group.label)))
            .toEqual(['Cases & deaths', 'Hospitalizations', 'Vaccinations']);
        for (const [metric, group] of [['new_deceased', 'Cases & deaths'], ['current_intensive_care_patients', 'Hospitalizations'],
            ['cumulative_persons_fully_vaccinated', 'Vaccinations']])
            await expect(page.locator(`${selector} optgroup[label="${group}"] option[value="${metric}"]`)).toHaveCount(1);
    }
    await expect(page.locator('#analysis-xMetric')).not.toHaveValue(await page.locator('#analysis-yMetric').inputValue());
    await page.locator('#analysis-xMetric').selectOption('current_intensive_care_patients');
    await page.locator('#analysis-xUnit').selectOption('per100k');
    await page.locator('#analysis-yMetric').selectOption('new_deceased');
    await page.locator('#analysis-yUnit').selectOption('count');
    await page.locator('#analysis-smoothing').selectOption('raw');
    await page.locator('#date-range-start-input').fill('2021-01-10');
    await page.locator('#date-range-start-input').dispatchEvent('change');
    await page.locator('#date-range-end-input').fill('2021-01-20');
    await page.locator('#date-range-end-input').dispatchEvent('change');
    await expect(page.locator('#chartContainer .scatter-point')).toHaveCount(11);
    await scatterDateLegend(page, '#chartContainer', ['2021-01-10', '2021-01-20']);
    const first = await page.locator('#chartContainer .scatter-point').first().evaluate(node => ({ ...node.__data__ }));
    expect(first).toMatchObject({ date: '2021-01-10', y: 4 });
    expect(first.x).toBeCloseTo(900, 8);
    await page.locator('#chartContainer .scatter-point').first().focus();
    await expect(page.locator('#chartContainer .chart-tooltip')).toContainText('Current ICU patients');
    await expect(page.locator('#chartContainer .chart-tooltip')).toContainText('Per 100,000 people');
    await expect(page.locator('#chartContainer .chart-tooltip')).toContainText('New reported deaths');
    await expect(page.locator('#chartContainer .chart-tooltip')).toContainText('Count');
    await page.screenshot({ path: 'test-results/country-scatter-columns.png', fullPage: true });
    const lightScale = await page.locator('#chartContainer .scatter-date-bar').evaluate(node => getComputedStyle(node).backgroundImage);
    await page.locator('#appearanceButton').click();
    await page.locator('#appearanceMenu [data-appearance="dark"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await scatterDateLegend(page, '#chartContainer', ['2021-01-10', '2021-01-20']);
    await expect(page.locator('#chartContainer .scatter-date-legend')).toHaveCount(1);
    expect(await page.locator('#chartContainer .scatter-date-bar').evaluate(node => getComputedStyle(node).backgroundImage)).not.toBe(lightScale);
    await page.locator('#vaccBtn').click();
    await expect(page.locator('#analysis-xMetric')).toHaveValue('current_intensive_care_patients');
    await expect(page.locator('#analysis-yMetric')).toHaveValue('new_deceased');
    await expect(page.locator('#analysis-xUnit')).toHaveValue('per100k');
    await expect(page.locator('#date-range-start-input')).toHaveValue('2021-01-10');
    await expect(page.locator('#date-range-end-input')).toHaveValue('2021-01-20');
    await page.locator('#vizTypeSelector').selectOption('line');
    await expect(page.locator('#analysisMetricControl')).toBeVisible();
    await expect(page.locator('#analysisUnitControl')).toBeVisible();
    await expect(page.locator('#analysisChartOptions')).toBeHidden();
    await expect(page.locator('#analysisChartOptions > *')).toHaveCount(0);
    await page.locator('#vizTypeSelector').selectOption('scatter');
    await expect(page.locator('#analysis-xMetric')).toHaveValue('current_intensive_care_patients');
    await expect(page.locator('#analysis-yMetric')).toHaveValue('new_deceased');
    await page.locator('#analysis-xMetric').selectOption('cumulative_persons_fully_vaccinated');
    await expect(page.locator('#analysis-xUnit')).toHaveValue('count');
    expect(await page.locator('#analysis-xUnit option').evaluateAll(options => options.map(option => option.value)))
        .toEqual(['count', 'percent']);
    await page.locator('#analysis-xUnit').selectOption('percent');
    await expect(page.locator('#chartContainer .scatter-point')).toHaveCount(11);
    expect(await page.locator('#chartContainer .scatter-point').first().evaluate(node => ({ ...node.__data__ })))
        .toMatchObject({ date: '2021-01-10', x: 9, y: 4 });
    await expect(page.locator('#date-range-start-input')).toHaveValue('2021-01-10');
    await expect(page.locator('#date-range-end-input')).toHaveValue('2021-01-20');
    expect(errors).toEqual([]);
});

test('country scatter preserves calendar bounds when axes change coverage and plots only valid shared reports', async ({ page }) => {
    const sparse = {
        ...csv,
        epidem: csv.epidem.split('\n').map(row => {
            const fields = row.split(',');
            if (fields[1] === 'TN' && fields[0] === '2021-01-02') fields[3] = '';
            if (fields[1] === 'TN' && fields[0] === '2021-01-06') fields[3] = '-2';
            return fields.join(',');
        }).join('\n'),
        hospitalizations: ['date,location_key,current_hospitalized_patients,current_intensive_care_patients,new_hospitalized_patients',
            '2021-01-01,TN,0,0,0', '2021-01-02,TN,2,1,1', '2021-01-04,TN,6,,3',
            '2021-01-06,TN,10,6,5', '2021-01-08,TN,14,8,7'].join('\n')
    };
    await prepare(page, 'dark', '/?country=tn&date=2021-01-28&smooth=raw', sparse);
    await page.locator('#seeMoreBtn').click();
    await page.locator('#hospBtn').click();
    await page.locator('#vizTypeSelector').selectOption('scatter');
    await page.locator('#analysis-xMetric').selectOption('current_intensive_care_patients');
    await page.locator('#analysis-xUnit').selectOption('per100k');
    await page.locator('#analysis-yMetric').selectOption('current_hospitalized_patients');
    await page.locator('#analysis-smoothing').selectOption('raw');
    await page.locator('#date-range-start-input').fill('2021-01-02');
    await page.locator('#date-range-start-input').dispatchEvent('change');
    await page.locator('#date-range-end-input').fill('2021-01-06');
    await page.locator('#date-range-end-input').dispatchEvent('change');
    await page.locator('#analysis-yMetric').selectOption('new_deceased');
    await expect(page.locator('#date-range-start-input')).toHaveValue('2021-01-02');
    await expect(page.locator('#date-range-end-input')).toHaveValue('2021-01-06');
    const observations = () => page.locator('#chartContainer .scatter-point').evaluateAll(nodes => nodes.map(node => ({ ...node.__data__ })));
    await expect.poll(observations).toEqual([{ date: '2021-01-06', x: 600, y: -2 }]);
    await scatterDateLegend(page, '#chartContainer', ['2021-01-06']);
    await page.locator('#date-range-start-input').fill('2021-01-01');
    await page.locator('#date-range-start-input').dispatchEvent('change');
    await page.locator('#date-range-end-input').fill('2021-01-28');
    await page.locator('#date-range-end-input').dispatchEvent('change');
    await expect.poll(observations).toEqual([
        { date: '2021-01-01', x: 0, y: 0 },
        { date: '2021-01-06', x: 600, y: -2 },
        { date: '2021-01-08', x: 800, y: 2 }
    ]);
    await scatterDateLegend(page, '#chartContainer', ['2021-01-01', '2021-01-08']);
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

test('comparison setting changes preserve scroll while chart-type changes release retained height', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 500 });
    await prepare(page, 'dark');
    await page.locator('#compareChartType').selectOption('box');
    const position = await page.evaluate(() => {
        scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); return scrollY;
    });
    expect(position).toBeGreaterThan(0);
    for (const [id, value] of [['compareMetricSelector', 'new_tested'], ['compareUnitSelector', 'per100k']]) {
        await page.locator(`#${id}`).evaluate((select, value) => {
            select.value = value; select.dispatchEvent(new Event('change', { bubbles: true }));
        }, value);
        await expect.poll(() => page.evaluate(() => scrollY)).toBe(position);
    }
    await page.locator('#compareChartType').selectOption('horizontal');
    await expect(page.locator('.rank-bar')).toHaveCount(2);
    const after = await page.evaluate(() => ({ y: scrollY, maximum: Math.max(0, document.documentElement.scrollHeight - innerHeight) }));
    expect(Math.abs(after.y - Math.min(position, after.maximum))).toBeLessThanOrEqual(2);
    expect(await page.locator('#comparePanel').evaluate(panel => panel.style.minHeight)).toBe('');
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
