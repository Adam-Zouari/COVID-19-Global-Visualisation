import { test, expect } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });
const dates = Array.from({ length: 140 }, (_, index) => new Date(Date.UTC(2021, 0, index + 1)).toISOString().slice(0, 10));
const archive = {
    epidem: ['date,location_key,new_confirmed,new_deceased,new_recovered,cumulative_confirmed,cumulative_deceased,new_tested',
        ...dates.flatMap((date, index) => ['TN', 'US', 'FR'].map((code, country) =>
            `${date},${code},${index + country + 1},${index % 7},${code === 'FR' ? 1 : ''},${index * 20},${index * 2},${code === 'FR' || index < 20 ? index : ''}`))].join('\n'),
    hospitalizations: `date,location_key,current_hospitalized_patients\n${dates[0]},TN,1\n${dates.at(-1)},TN,3`,
    vaccinations: `date,location_key,cumulative_persons_vaccinated\n${dates[0]},TN,1\n${dates.at(-1)},TN,3`,
    'country-index': 'location_key,country_name\nTN,Tunisia\nUS,United States of America\nFR,France',
    demographics: 'location_key,population\nTN,1000000\nUS,2000000\nFR,3000000'
};

async function prepare(page, theme, scope, countries = 'tn,us') {
    await page.addInitScript(value => localStorage.setItem('atlas-appearance', value), theme);
    await page.route('https://flagcdn.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }));
    await page.route('**/api/*', route => {
        const key = new URL(route.request().url()).pathname.split('/').at(-1);
        return route.fulfill(Object.hasOwn(archive, key) ? { contentType: 'text/csv', body: archive[key] } : { status: 404, body: '{}' });
    });
    await page.goto(`/?${scope === 'country' ? 'country=tn&analysis=1' : `view=compare&compare=${countries}`}&date=${dates.at(-1)}&smooth=raw`);
    await expect(page.locator('#dataSelector')).toBeEnabled();
    await expect.poll(() => page.evaluate(() => window.AtlasView.restoring)).toBe(false);
}

async function geometry(page, chart, panel) {
    return page.evaluate(({ chart, panel }) => ({ y: scrollY,
        chart: document.querySelector(chart).getBoundingClientRect().height,
        panel: document.querySelector(panel).getBoundingClientRect().height
    }), { chart, panel });
}

async function raisedLegend(chart) {
    await expect(chart.locator('.chart-color-legend')).toBeVisible();
    const positions = await chart.evaluate(node => {
        const svgNode = node.querySelector(':scope > svg'), svg = svgNode.getBoundingClientRect();
        const legend = node.querySelector('.chart-color-legend').getBoundingClientRect();
        const scatter = node.querySelector('.scatter-date-legend') !== null;
        const labels = [...node.querySelectorAll('.x-axis .tick text, .analytics-axis-label, .scatter-3d-label, .scatter-3d-tick')]
            .map(node => node.getBoundingClientRect().bottom);
        // The legend follows visible chart content, rather than a fixed offset
        // from an arbitrarily padded SVG frame.
        const contentBottom = node.dataset.chartType === 'scatter-3d'
            ? Math.min(svg.bottom, svgNode.querySelector(':scope > g').getBoundingClientRect().bottom) : Math.max(...labels);
        const panel = node.closest('#visualizationPanel, .compare-chart-container').getBoundingClientRect();
        return { overlap: svg.bottom - legend.top, legend: legend.top, label: Math.max(...labels), footerGap: panel.bottom - legend.bottom,
            gap: legend.top - contentBottom, scatter };
    });
    if (positions.scatter) {
        expect(positions.gap, 'scatter legend sits immediately below the rendered plot and labels').toBeGreaterThanOrEqual(1);
        expect(positions.gap, 'raising the legend reduces its gap to the chart').toBeLessThanOrEqual(3);
        expect(positions.footerGap, 'legend remains inside the panel').toBeGreaterThanOrEqual(1);
    } else expect(positions.overlap).toBeCloseTo(32, 0);
    expect(positions.legend).toBeGreaterThan(positions.label + 1);
}

async function bottomSpacing(page, scope) {
    return page.evaluate(scope => {
        const outer = document.querySelector(scope === 'country' ? '#exploreView' : '#comparePanel');
        const panel = document.querySelector(scope === 'country' ? '#visualizationPanel' : '.compare-chart-container');
        return {
            outerPadding: parseFloat(getComputedStyle(outer).paddingBottom),
            panelPadding: parseFloat(getComputedStyle(panel).paddingBottom),
            pageGap: document.querySelector('.app-main').getBoundingClientRect().bottom - panel.getBoundingClientRect().bottom
        };
    }, scope);
}

async function unchangedBottomSpacing(page, scope, before) {
    const after = await bottomSpacing(page, scope);
    for (const key of Object.keys(before))
        expect(after[key], `${scope}: scatter layout keeps ${key} unchanged`).toBeCloseTo(before[key], 0);
}

async function centeredState(page, chart, reason) {
    const container = page.locator(chart), state = container.locator('.chart-empty-state');
    await expect(state).toBeVisible();
    await expect(state.getByRole('heading', { name: 'No data available' })).toBeVisible();
    await expect(state).toContainText(reason);
    await expect(state).toContainText('Try another metric or date range.');
    await expect(container.locator('svg, .chart-error, .chart-note, .chart-color-legend')).toHaveCount(0);
    await expect(container.locator('.chart-heading-title')).not.toBeEmpty();
    await expect(container.locator('.chart-subtitle')).toContainText('2021');
    const alignment = await state.evaluate(node => {
        const bounds = node.getBoundingClientRect(), heading = node.querySelector('h4').getBoundingClientRect();
        return { display: getComputedStyle(node).display, align: getComputedStyle(node).alignItems,
            center: Math.abs(heading.left + heading.width / 2 - bounds.left - bounds.width / 2) };
    });
    expect(alignment).toMatchObject({ display: 'flex', align: 'center' });
    expect(alignment.center).toBeLessThan(1);
}

for (const [theme, width] of [['dark', 1440], ['light', 390]]) {
    test(`country charts retain their populated size for centered empty states at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await prepare(page, theme, 'country');
        const chart = '#chartContainer', panel = '#visualizationPanel';
        for (const type of ['line', 'bar', 'area', 'heatmap', 'box', 'scatter']) {
            await page.locator('#vizTypeSelector').selectOption(type);
            await expect(page.locator(`${chart} > svg`)).toBeVisible();
            const selector = type === 'scatter' ? '#analysis-yMetric' : '#analysisMetricSelector';
            await page.locator(selector).scrollIntoViewIfNeeded();
            const before = await geometry(page, chart, panel);
            await page.locator(selector).selectOption('new_recovered');
            await centeredState(page, chart, type === 'scatter' ? 'No exact shared dates' : /no (reported|displayable) observations/i);
            const empty = await geometry(page, chart, panel);
            expect(Math.abs(empty.chart - before.chart), `${type}: chart retains populated height`).toBeLessThan(1.1);
            expect(Math.abs(empty.panel - before.panel), `${type}: panel retains populated height`).toBeLessThan(1.1);
            expect(Math.abs(empty.y - before.y), `${type}: no viewport jump`).toBeLessThan(1.1);
            if (type === 'line') await page.screenshot({ path: `test-results/country-empty-${theme}-${width}.png`, fullPage: true });
            await page.locator(selector).selectOption(type === 'scatter' ? 'new_deceased' : 'new_confirmed');
            await expect(page.locator(`${chart} > svg`)).toBeVisible();
            await expect(page.locator(`${chart} .chart-empty-state`)).toHaveCount(0);
            const after = await geometry(page, chart, panel);
            expect(Math.abs(after.chart - before.chart), `${type}: returning data restores natural height`).toBeLessThan(1.1);
            expect(await page.locator(panel).evaluate(node => node.style.minHeight)).toBe('');
        }
    });

    test(`comparison charts retain their populated size for centered empty states at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await prepare(page, theme, 'compare');
        const chart = '#compareChartContainer', panel = '#comparePanel';
        for (const type of ['line', 'bar', 'horizontal', 'heatmap', 'box', 'scatter', 'dumbbell']) {
            await page.locator('#compareChartType').selectOption(type);
            await expect(page.locator(`${chart} svg`).first()).toBeVisible();
            await page.locator('#compareMetricSelector').scrollIntoViewIfNeeded();
            const before = await geometry(page, chart, panel);
            await page.locator('#compareMetricSelector').selectOption('new_recovered');
            await centeredState(page, chart, type === 'scatter' ? 'No exact shared dates' : /no (reported|displayable)|no selected/i);
            const empty = await geometry(page, chart, panel);
            expect(Math.abs(empty.chart - before.chart), `${type}: chart retains populated height`).toBeLessThan(1.1);
            expect(Math.abs(empty.panel - before.panel), `${type}: panel retains populated height`).toBeLessThan(1.1);
            expect(Math.abs(empty.y - before.y), `${type}: no viewport jump`).toBeLessThan(1.1);
            await page.locator('#compareMetricSelector').selectOption('new_confirmed');
            await expect(page.locator(`${chart} svg`).first()).toBeVisible();
            await expect(page.locator(`${chart} .chart-empty-state`)).toHaveCount(0);
            expect(Math.abs((await geometry(page, chart, panel)).chart - before.chart), `${type}: returning data restores natural height`).toBeLessThan(1.1);
        }
    });

    test(`scatter native hover bubbles are absent and analytical legends clear axis labels at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await prepare(page, theme, 'country');
        const chart = page.locator('#chartContainer');
        const countrySpacing = await bottomSpacing(page, 'country');
        for (const type of ['heatmap', 'scatter']) {
            await page.locator('#vizTypeSelector').selectOption(type);
            await raisedLegend(chart);
            await unchangedBottomSpacing(page, 'country', countrySpacing);
        }
        await chart.getByRole('button', { name: 'Zoom in', exact: true }).click();
        await raisedLegend(chart);
        await unchangedBottomSpacing(page, 'country', countrySpacing);
        await chart.getByRole('button', { name: 'Reset view', exact: true }).click();
        await expect(chart.locator('svg title, svg[title], .scatter-point[title]')).toHaveCount(0);
        const point = chart.locator('.scatter-point').first();
        await point.hover();
        await expect(chart.locator('.chart-tooltip')).toContainText(dates[0]);
        await expect(point).toHaveAccessibleName(/New confirmed cases.*New reported deaths/);
        await page.screenshot({ path: `test-results/scatter-legend-${theme}-${width}.png`, fullPage: true });
        await prepare(page, theme, 'compare');
        const comparisonSpacing = await bottomSpacing(page, 'compare');
        for (const type of ['heatmap', 'scatter']) {
            await page.locator('#compareChartType').selectOption(type);
            await raisedLegend(page.locator('#compareChartContainer'));
            await unchangedBottomSpacing(page, 'compare', comparisonSpacing);
        }
        await page.locator('#compareChartContainer').getByRole('button', { name: 'Zoom in', exact: true }).click();
        await raisedLegend(page.locator('#compareChartContainer'));
        await unchangedBottomSpacing(page, 'compare', comparisonSpacing);
    });

    test(`3D scatter keeps its footprint without shared dates and preserves themed inspection at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await prepare(page, theme, 'compare', 'tn,us,fr');
        const spacing = await bottomSpacing(page, 'compare');
        await page.locator('#compareChartType').selectOption('scatter');
        const chart = '#compareChartContainer', panel = '#comparePanel';
        await expect(page.locator(`${chart} .scatter-point`)).toHaveCount(dates.length);
        await expect(page.locator(`${chart} svg title`)).toHaveCount(0);
        await raisedLegend(page.locator(chart));
        await unchangedBottomSpacing(page, 'compare', spacing);
        await page.locator(chart).getByRole('button', { name: 'Zoom in', exact: true }).click();
        await raisedLegend(page.locator(chart));
        const viewport = page.locator(`${chart} > svg`);
        await viewport.focus();
        await viewport.press('ArrowRight');
        await raisedLegend(page.locator(chart));
        await unchangedBottomSpacing(page, 'compare', spacing);
        const zoomIn = page.locator(chart).getByRole('button', { name: 'Zoom in', exact: true });
        for (let step = 0; step < 6 && await zoomIn.isEnabled(); step++) await zoomIn.click();
        await expect(zoomIn).toBeDisabled();
        const footerGap = await page.locator(`${chart} .scatter-date-legend`).evaluate(legend =>
            legend.closest('.compare-chart-container').getBoundingClientRect().bottom - legend.getBoundingClientRect().bottom);
        expect(footerGap, 'legend stays inside the panel at maximum zoom').toBeGreaterThanOrEqual(1);
        await page.locator(chart).getByRole('button', { name: 'Reset view', exact: true }).click();
        await page.locator('#compareMetricSelector').scrollIntoViewIfNeeded();
        const before = await geometry(page, chart, panel);
        await page.locator('#compareMetricSelector').selectOption('new_recovered');
        await centeredState(page, chart, 'No exact shared dates');
        const empty = await geometry(page, chart, panel);
        expect(Math.abs(empty.chart - before.chart)).toBeLessThan(1.1);
        expect(Math.abs(empty.panel - before.panel)).toBeLessThan(1.1);
        await page.locator('#compareMetricSelector').selectOption('new_confirmed');
        const point = page.locator(`${chart} .scatter-point`).first();
        await point.focus();
        await expect(page.locator(`${chart} .chart-tooltip`)).toContainText(dates[0]);
        await expect(point).toHaveAccessibleName(/Tunisia.*United States of America.*France/);
    });
}

test('empty dates retain the country line plot footprint and initial empty metrics have a complete frame', async ({ page }) => {
    await prepare(page, 'dark', 'country');
    await page.locator('#analysisMetricSelector').selectOption('new_tested');
    await page.locator('#date-range-start-input').scrollIntoViewIfNeeded();
    const before = await geometry(page, '#chartContainer', '#visualizationPanel');
    await page.locator('#date-range-start-input').fill(dates[30]);
    await page.locator('#date-range-start-input').dispatchEvent('change');
    await centeredState(page, '#chartContainer', 'No reported observations are available for new tests');
    const empty = await geometry(page, '#chartContainer', '#visualizationPanel');
    expect(Math.abs(empty.chart - before.chart)).toBeLessThan(1.1);
    expect(Math.abs(empty.panel - before.panel)).toBeLessThan(1.1);
    await page.locator('#date-range-start-input').fill(dates[0]);
    await page.locator('#date-range-start-input').dispatchEvent('change');
    await expect(page.locator('#chartContainer .data-line')).toBeVisible();
    await page.locator('#analysisMetricSelector').selectOption('new_recovered');
    await page.reload();
    await expect(page.locator('#analysisMetricSelector')).toHaveValue('new_recovered');
    await centeredState(page, '#chartContainer', 'No reported observations are available for new reported recoveries');
    expect(await page.locator('#chartContainer .chart-empty-state').evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(390);
});
