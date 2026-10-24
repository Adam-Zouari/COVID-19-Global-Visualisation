import { test, expect } from '@playwright/test';

test.use({ reducedMotion: 'reduce', locale: 'en-US' });

const dates = Array.from({ length: 31 }, (_, index) => `2021-01-${String(index + 1).padStart(2, '0')}`);
const archive = {
    epidem: ['date,location_key,new_confirmed', ...dates.flatMap((date, index) =>
        [`${date},TN,${index + 1}`, `${date},US,${(index + 1) * 2}`])].join('\n'),
    hospitalizations: 'date,location_key,current_hospitalized_patients\n2021-01-31,TN,10\n2021-01-31,US,20\n',
    vaccinations: 'date,location_key,cumulative_persons_vaccinated\n2021-01-31,TN,10\n2021-01-31,US,20\n',
    'country-index': 'location_key,country_name\nTN,Tunisia\nUS,United States\n',
    demographics: 'location_key,population\nTN,1000\nUS,2000\n'
};

async function prepare(page, path) {
    await page.route('https://flagcdn.com/**', route => route.fulfill({ contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }));
    await page.route('**/api/*', route => {
        const key = new URL(route.request().url()).pathname.split('/').at(-1);
        return route.fulfill(Object.hasOwn(archive, key) ? { contentType: 'text/csv', body: archive[key] } : { status: 404, body: '{}' });
    });
    await page.goto(path);
    await expect(page.locator('#dataSelector')).toBeEnabled();
    await expect.poll(() => page.evaluate(() => window.AtlasView.restoring)).toBe(false);
}

// Chromium's native date editor has month, day and year segments in this test locale.
// Navigate the actual editor and type individual digits rather than replacing its value.
async function typeSegment(field, segment, digits) {
    await field.focus();
    // Refocusing through locator.press between digits clears the native segment buffer.
    const keyboard = field.page().keyboard;
    for (let index = 0; index < 4; index++) await keyboard.press('ArrowLeft');
    for (let index = 0; index < segment; index++) await keyboard.press('ArrowRight');
    for (const digit of digits) await keyboard.press(digit);
}

test('country date ranges accept multi-digit days and complete years before Enter or blur', async ({ page }) => {
    await prepare(page, '/?country=tn&analysis=1&date=2021-01-31&smooth=raw');
    const end = page.locator('#date-range-end-input');
    await expect(page.locator('#chartContainer .data-line')).toBeVisible();
    await typeSegment(end, 1, '12');
    await expect(end).toHaveValue('2021-01-12');
    expect(await page.evaluate(() => ChartControls.state.dateRange.end)).toBe(100);
    await typeSegment(end, 2, '2021');
    await expect(end).toHaveValue('2021-01-12');
    expect(await page.evaluate(() => ChartControls.state.dateRange.end)).toBe(100);
    await end.press('Enter');
    await expect.poll(() => page.evaluate(() => ChartControls.state.dateRange.end)).toBeCloseTo(11 / 30 * 100);
    await expect(end).toBeFocused();

    const start = page.locator('#date-range-start-input');
    await typeSegment(start, 1, '10');
    await expect(start).toHaveValue('2021-01-10');
    expect(await page.evaluate(() => ChartControls.state.dateRange.start)).toBe(0);
    await page.locator('#vizTypeSelector').focus();
    await expect.poll(() => page.evaluate(() => ChartControls.state.dateRange.start)).toBe(30);
    await expect(start).toHaveValue('2021-01-10');

    // A calendar-style replacement still commits immediately without a second click.
    await start.fill('2021-01-05');
    await start.dispatchEvent('change');
    await expect.poll(() => page.evaluate(() => ChartControls.state.dateRange.start)).toBeCloseTo(4 / 30 * 100);
});

test('comparison horizontal-bar dates preserve segmented edits and focus through redraws', async ({ page }) => {
    await prepare(page, '/?view=compare&compare=tn,us&date=2021-01-31&smooth=raw');
    await page.locator('#compareChartType').selectOption('horizontal');
    const field = page.locator('#compare-date');
    await expect(field).toHaveValue('2021-01-31');
    await typeSegment(field, 1, '12');
    await typeSegment(field, 2, '2021');
    await expect(field).toHaveValue('2021-01-12');
    expect(await page.evaluate(() => CompareMode.state.chartOptions.date)).toBe('2021-01-31');
    await field.press('Enter');
    await expect.poll(() => page.evaluate(() => CompareMode.state.chartOptions.date)).toBe('2021-01-12');
    await expect(field).toBeFocused();
    expect(await page.locator('.rank-bar').evaluateAll(nodes => nodes.map(node => node.__data__.value).sort((a, b) => a - b))).toEqual([12, 24]);

    await typeSegment(field, 1, '23');
    await expect(field).toHaveValue('2021-01-23');
    await page.locator('#compareChartType').focus();
    await expect.poll(() => page.evaluate(() => CompareMode.state.chartOptions.date)).toBe('2021-01-23');
    await field.fill('2021-01-18');
    await field.dispatchEvent('change');
    await expect.poll(() => page.evaluate(() => CompareMode.state.chartOptions.date)).toBe('2021-01-18');
});

