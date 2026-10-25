import { test, expect } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });
const dates = Array.from({ length: 90 }, (_, index) => new Date(Date.UTC(2021, 0, index + 1)).toISOString().slice(0, 10));
const archive = {
    epidem: ['date,location_key,new_confirmed,new_deceased', ...dates.flatMap((date, index) =>
        ['TN', 'US'].map((code, country) => `${date},${code},${(index + 1) * (country + 1)},${index % 5}`))].join('\n'),
    hospitalizations: `date,location_key,current_hospitalized_patients\n${dates[0]},TN,1\n${dates.at(-1)},TN,3`,
    vaccinations: `date,location_key,cumulative_persons_vaccinated\n${dates[0]},TN,1\n${dates.at(-1)},TN,3`,
    'country-index': 'location_key,country_name\nTN,Tunisia\nUS,United States of America',
    demographics: 'location_key,population\nTN,1000000\nUS,2000000'
};

async function prepare(page) {
    await page.route('https://flagcdn.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }));
    await page.route('**/api/*', route => {
        const key = new URL(route.request().url()).pathname.split('/').at(-1);
        return route.fulfill(Object.hasOwn(archive, key) ? { contentType: 'text/csv', body: archive[key] } : { status: 404, body: '{}' });
    });
    await page.goto('/?view=compare&compare=tn,us&date=2021-02-15&metric=new_confirmed&smooth=raw');
    await expect(page.locator('#dataSelector')).toBeEnabled();
    await expect.poll(() => page.evaluate(() => window.AtlasView.restoring)).toBe(false);
}

async function globeSettings(page) {
    return page.evaluate(() => ({ dataset: dataService.currentDataset, metric: dataService.currentColumn,
        unit: dataService.displayUnit, smoothing: dataService.smoothing, date: dataService.currentDate }));
}

for (const width of [1440, 390]) for (const type of ['line', 'bar']) for (const layout of ['combined', 'separate']) {
    test(`Compare ${layout} ${type} axes follow both date handles before release at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await prepare(page);
        await page.locator('#compareChartType').selectOption(type);
        if (layout === 'separate') await page.locator('#separateChartsBtn').click();
        const chart = page.locator('#compareChartContainer'), start = page.locator('#startDateSlider'), end = page.locator('#endDateSlider');
        const originalGlobe = await globeSettings(page);
        const originalAxes = await chart.locator('.x-axis, .y-axis').allTextContents();
        await start.evaluate(node => { window.compareLiveStart = node; window.compareLiveEnd = document.getElementById('endDateSlider'); });

        const moveWithoutRelease = async (handle, value) => {
            await handle.focus();
            const scroll = await page.evaluate(() => scrollY);
            await handle.evaluate((node, index) => {
                node.value = String(index); node.dispatchEvent(new Event('input', { bubbles: true }));
            }, value);
            await expect(handle).toBeFocused();
            expect(await page.evaluate(() => scrollY)).toBeCloseTo(scroll, 0);
            expect(await page.evaluate(() => window.compareLiveStart === document.getElementById('startDateSlider') &&
                window.compareLiveEnd === document.getElementById('endDateSlider'))).toBe(true);
        };
        await moveWithoutRelease(start, 14);
        await expect(page.locator('#compare-date-range-start-input')).toHaveValue(dates[14]);
        expect(new URL(page.url()).searchParams.get('range')).not.toBeNull();
        await moveWithoutRelease(end, 59);
        await expect(page.locator('#compare-date-range-end-input')).toHaveValue(dates[59]);

        expect(await chart.locator('.x-axis, .y-axis').allTextContents()).not.toEqual(originalAxes);
        const period = await page.evaluate(([first, last]) => ChartFactory.periodLabel([first, last]), [dates[14], dates[59]]);
        for (const subtitle of await chart.locator('.chart-subtitle').allTextContents()) expect(subtitle).toContain(period);
        const rendered = await chart.evaluate((node, chartType) => {
            const points = chartType === 'line' ? [...node.querySelectorAll('.data-line')].flatMap(path => path.__data__) :
                [...node.querySelectorAll('.data-bar')].map(bar => bar.__data__);
            const dates = [...new Set(points.map(point => point.date))].sort();
            return { first: dates[0], last: dates.at(-1), count: points.length,
                firstValues: points.filter(point => point.date === dates[0]).map(point => point.value).sort((a, b) => a - b),
                lastValues: points.filter(point => point.date === dates.at(-1)).map(point => point.value).sort((a, b) => a - b) };
        }, type);
        expect(rendered).toEqual({ first: dates[14], last: dates[59], count: 92, firstValues: [15, 30], lastValues: [60, 120] });
        const sharedRange = new URL(page.url()).searchParams.get('range').split(',').map(Number);
        expect(sharedRange[0]).toBeCloseTo(14 / 89 * 100, 6); expect(sharedRange[1]).toBeCloseTo(59 / 89 * 100, 6);
        expect(await globeSettings(page)).toEqual(originalGlobe);

        await chart.evaluate(node => { window.compareLiveSVG = node.querySelector('svg'); });
        await end.dispatchEvent('change');
        expect(await chart.evaluate(node => window.compareLiveSVG === node.querySelector('svg'))).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    });
}
