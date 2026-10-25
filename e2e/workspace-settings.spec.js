import { test, expect } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });
const dates = Array.from({ length: 84 }, (_, index) => new Date(Date.UTC(2021, 0, index + 1)).toISOString().slice(0, 10));
const countryCodes = ['TN', 'US', 'FR'];
const csv = {
    epidem: ['date,location_key,new_confirmed,new_deceased,cumulative_confirmed',
        ...dates.flatMap((date, index) => countryCodes.map((code, country) =>
            `${date},${code},${(index + 1) * (country + 1)},${index % 5},${(index + 1) * (country + 1) * 10}`))].join('\n'),
    hospitalizations: ['date,location_key,current_hospitalized_patients,current_intensive_care_patients,new_hospitalized_patients',
        ...dates.flatMap((date, index) => countryCodes.map((code, country) =>
            `${date},${code},${(index + 10) * (country + 1)},${(index + 1) * (country + 1) * 2},${index + country}`))].join('\n'),
    vaccinations: ['date,location_key,cumulative_persons_vaccinated,cumulative_persons_fully_vaccinated,cumulative_vaccine_doses_administered',
        ...dates.flatMap((date, index) => countryCodes.map((code, country) =>
            `${date},${code},${(1000 + index * 20) * (country + 1)},${(800 + index * 10) * (country + 1)},${(2500 + index * 30) * (country + 1)}`))].join('\n'),
    'country-index': 'location_key,country_name\nTN,Tunisia\nUS,United States\nFR,France',
    demographics: 'location_key,population\nTN,100000\nUS,200000\nFR,300000'
};

async function prepare(page, width, analysis = false, theme = 'dark', archive = csv) {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(value => localStorage.setItem('atlas-appearance', value), theme);
    await page.route('https://flagcdn.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }));
    await page.route('**/api/*', route => {
        const key = new URL(route.request().url()).pathname.split('/').at(-1);
        return route.fulfill(Object.hasOwn(archive, key) ? { contentType: 'text/csv', body: archive[key] } : { status: 404, body: '{}' });
    });
    await page.goto(`/?country=tn&date=${dates[52]}${analysis ? '&analysis=1' : ''}`);
    await expect(page.locator('#dataSelector')).toBeEnabled();
    await expect.poll(() => page.evaluate(() => window.AtlasView.restoring)).toBe(false);
}

async function matchingDatasetControls(page) {
    const comparison = await page.evaluate(() => {
        const pairs = [['analysisEpidemBtn', 'epidemBtn'], ['analysisHospBtn', 'hospBtn'], ['analysisVaccBtn', 'vaccBtn']];
        const properties = ['display', 'gap', 'minHeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
            'backgroundColor', 'borderTopWidth', 'borderTopStyle', 'borderRadius', 'fontSize', 'fontWeight', 'whiteSpace'];
        const styles = node => {
            const style = getComputedStyle(node);
            return Object.fromEntries(properties.map(property => [property, style[property]]));
        };
        const buttons = pairs.map(([localId, mainId]) => {
            const local = document.getElementById(localId), main = document.getElementById(mainId);
            return { local: styles(local), main: styles(main), localPath: local.querySelector('path')?.getAttribute('d'),
                mainPath: main.querySelector('path').getAttribute('d'), localIcon: local.querySelector('svg')?.getAttribute('viewBox'),
                mainIcon: main.querySelector('svg').getAttribute('viewBox') };
        });
        const underline = id => {
            const style = getComputedStyle(document.getElementById(id), '::after');
            return { position: style.position, height: style.height, bottom: style.bottom, background: style.backgroundColor };
        };
        const label = document.querySelector('label[for="analysisMetricSelector"]').getBoundingClientRect();
        const select = document.getElementById('analysisMetricSelector').getBoundingClientRect();
        return { buttons, localUnderline: underline('analysisEpidemBtn'), mainUnderline: underline('epidemBtn'),
            labelOffset: Math.abs(label.left - select.left), labelGap: select.top - label.bottom };
    });
    for (const button of comparison.buttons) {
        expect(button.local).toEqual(button.main);
        expect(button.localPath).toBe(button.mainPath);
        expect(button.localIcon).toBe(button.mainIcon);
    }
    expect(comparison.localUnderline).toEqual(comparison.mainUnderline);
    expect(comparison.localUnderline.height).toBe('2px');
    expect(comparison.labelOffset, 'Metric label aligns with the dropdown').toBeLessThan(1.1);
    expect(comparison.labelGap, 'Metric label sits directly above the dropdown').toBeGreaterThanOrEqual(3);
    expect(comparison.labelGap).toBeLessThanOrEqual(8);
}

for (const [theme, width] of [['dark', 1440], ['light', 1440], ['dark', 320], ['light', 320]]) {
    test(`country dataset buttons keep metrics short, local and usable in ${theme} at ${width}px`, async ({ page }) => {
        await prepare(page, width, true, theme);
        const metric = page.locator('#analysisMetricSelector'), buttons = page.locator('#analysisDatasetButtons');
        await expect(buttons).toHaveAccessibleName('Country analysis dataset');
        await expect(buttons.getByRole('button')).toHaveCount(3);
        await matchingDatasetControls(page);
        // Exercise state transitions once per viewport; both themes still check
        // the same control styling, dataset filtering and responsive layout.
        const exerciseState = theme === (width === 1440 ? 'dark' : 'light');
        const selected = async (id, category) => {
            await expect(page.locator(id)).toHaveAttribute('aria-pressed', 'true');
            await expect(page.locator(id)).toHaveClass(/\bactive\b/);
            await expect(buttons.locator('[aria-pressed="true"]')).toHaveCount(1);
            expect(await metric.locator('option').evaluateAll(options => options.map(option => option.value)))
                .toEqual(await page.evaluate(category => dataService.availableColumns[category], category));
            await expect(metric.locator('optgroup')).toHaveCount(0);
            if (exerciseState) {
                await expect(page.locator('#date-range-start-input')).toHaveValue(dates[14]);
                await expect(page.locator('#date-range-end-input')).toHaveValue(dates[65]);
            }
        };

        if (exerciseState) {
            await page.locator('#navCompare').click();
            const comparison = await settings(page, 'compare');
            await page.locator('#navExplore').click();
            const globe = await settings(page, 'globe'), snapshot = await page.locator('#countryPrimary').textContent();
            await trackGlobeRefreshes(page);
            await period(page, 'date-range', dates[14], dates[65]);
            await page.locator('#analysisUnitSelector').selectOption('per100k');
            await page.locator('#analysisAverageBtn').click();

            await page.locator('#analysisHospBtn').click();
            await selected('#analysisHospBtn', 'hospitalizations');
            await expect(page.locator('#analysisUnitSelector')).toHaveValue('per100k');
            await expect(page.locator('#analysisAverageBtn')).toHaveAttribute('aria-pressed', 'true');
            await expect(page.locator('#analysisValue')).toHaveText('59');
            await metric.selectOption('current_intensive_care_patients');
            await expect(page.locator('#analysisValue')).toHaveText('100');

            await page.locator('#analysisVaccBtn').click();
            await selected('#analysisVaccBtn', 'vaccinations');
            await expect(page.locator('#analysisReportingGroup')).toBeHidden();
            await expect(page.locator('#analysisUnitSelector')).toHaveValue('count');
            await page.locator('#analysisUnitSelector').selectOption('percent');
            await expect(page.locator('#analysisValue')).toHaveText('2');
            await expect.poll(() => page.evaluate(() => AtlasWorkspaces.get('country').getDisplayValue('tn'))).toBeCloseTo(2.04, 8);

            await page.locator('#analysisEpidemBtn').click();
            await selected('#analysisEpidemBtn', 'epidem');
            await expect(page.locator('#analysisUnitSelector')).toHaveValue('count');
            await expect(page.locator('#analysisRawBtn')).toHaveAttribute('aria-pressed', 'true');
            await metric.selectOption('new_deceased');
            expect(await settings(page, 'globe')).toEqual(globe);
            expect(await settings(page, 'compare')).toEqual(comparison);
            expect(await page.locator('#countryPrimary').textContent()).toBe(snapshot);
            expect(await page.evaluate(() => window.workspaceGlobeRefreshes)).toBe(0);
        } else {
            for (const [id, category] of [['#analysisHospBtn', 'hospitalizations'],
                ['#analysisVaccBtn', 'vaccinations'], ['#analysisEpidemBtn', 'epidem']]) {
                await page.locator(id).click();
                await selected(id, category);
            }
        }

        const navigation = await buttons.evaluate(node => {
            const bounds = node.getBoundingClientRect();
            return { left: bounds.left, right: bounds.right, viewport: innerWidth,
                overflow: getComputedStyle(node).overflowX, scrollable: node.scrollWidth > node.clientWidth + 1 };
        });
        expect(navigation.left).toBeGreaterThanOrEqual(0);
        expect(navigation.right).toBeLessThanOrEqual(navigation.viewport);
        if (navigation.scrollable) expect(['auto', 'scroll']).toContain(navigation.overflow);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await buttons.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `test-results/country-datasets-${theme}-${width}.png`, fullPage: true });
        await page.locator('.analysis-controls').screenshot({ path: `test-results/country-datasets-toolbar-${theme}-${width}.png` });
        if (exerciseState) {
            await page.reload();
            await expect.poll(() => page.evaluate(() => window.AtlasView.restoring)).toBe(false);
            await expect(page.locator('#analysisEpidemBtn')).toHaveAttribute('aria-pressed', 'true');
            await expect(metric).toHaveValue('new_deceased');
            await expect(page.locator('#date-range-start-input')).toHaveValue(dates[14]);
            await expect(page.locator('#date-range-end-input')).toHaveValue(dates[65]);
        }
    });
}

const settings = (page, scope) => page.evaluate(scope => window.AtlasWorkspaces.read(scope), scope);
async function trackGlobeRefreshes(page) {
    await page.evaluate(() => {
        window.workspaceGlobeRefreshes = 0;
        const refresh = globeInstance.refreshData;
        globeInstance.refreshData = function(...args) {
            window.workspaceGlobeRefreshes++;
            return refresh.apply(this, args);
        };
    });
}

async function period(page, prefix, start, end) {
    const from = page.locator(`#${prefix}-start-input`), to = page.locator(`#${prefix}-end-input`);
    await from.fill(start); await from.dispatchEvent('change');
    await to.fill(end); await to.dispatchEvent('change');
    await expect(from).toHaveValue(start);
    await expect(to).toHaveValue(end);
}

async function addComparisonCountry(page, name) {
    await page.locator('#addCountryBtn').click();
    await page.locator('#countrySearchInput').fill(name);
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('#searchModal')).toBeHidden();
}

test('country dataset buttons clamp an incompatible period to the new reporting calendar', async ({ page }) => {
    const archive = { ...csv, hospitalizations: csv.hospitalizations.split('\n').filter((row, index) =>
        index === 0 || row.slice(0, 10) >= dates[9] && row.slice(0, 10) <= dates[14]).join('\n') };
    await prepare(page, 390, true, 'light', archive);
    const globe = await settings(page, 'globe');
    await period(page, 'date-range', dates[4], dates[24]);
    await page.locator('#analysisHospBtn').click();
    await expect(page.locator('#date-range-start-input')).toHaveValue(dates[9]);
    await expect(page.locator('#date-range-end-input')).toHaveValue(dates[14]);
    await expect(page.locator('#analysisValueDate')).toHaveText('Selected day · Jan 15, 2021');
    await expect(page.locator('#analysisValue')).toHaveText('24');
    expect(await settings(page, 'globe')).toEqual(globe);
});

for (const width of [1440, 390]) {
    test(`country analysis owns dataset buttons, filtered metrics and saved chart settings at ${width}px`, async ({ page }) => {
        await prepare(page, width, true);
        const globeSettings = await settings(page, 'globe');
        expect(await settings(page, 'country')).toEqual(globeSettings);
        const snapshot = await page.locator('#countryPrimary').textContent();
        const metric = page.locator('#analysisMetricSelector');
        await expect(page.locator('#analysisEpidemBtn')).toHaveAttribute('aria-pressed', 'true');
        expect(await metric.locator('option').evaluateAll(options => options.map(option => option.value)))
            .toEqual(['new_confirmed', 'new_deceased', 'cumulative_confirmed']);
        await trackGlobeRefreshes(page);

        await page.locator('#analysisHospBtn').click();
        await metric.selectOption('current_hospitalized_patients');
        await expect(page.locator('#analysisMetricLabel')).toContainText('hospitalized');
        await expect(page.locator('#analysisValue')).toHaveText('62');
        await page.locator('#analysisUnitSelector').selectOption('per1m');
        await expect(page.locator('#analysisValue')).toHaveText('620');
        await page.locator('#analysisAverageBtn').click();
        await expect(page.locator('#analysisValue')).toHaveText('590');
        await expect(page.locator('#analysisUnits')).toContainText('7-day average');

        await page.locator('#analysisVaccBtn').click();
        await metric.selectOption('cumulative_persons_vaccinated');
        await expect(page.locator('#analysisReportingGroup')).toBeHidden();
        await page.locator('#analysisUnitSelector').selectOption('percent');
        await expect.poll(() => page.evaluate(() => AtlasWorkspaces.get('country').getDisplayValue('tn'))).toBeCloseTo(2.04, 8);
        await expect(page.locator('#analysisUnits')).toContainText('population');
        expect((await settings(page, 'country')).smoothing).toBe('raw');

        await page.locator('#analysisHospBtn').click();
        await metric.selectOption('current_hospitalized_patients');
        await page.locator('#analysisUnitSelector').selectOption('per1m');
        await page.locator('#analysisAverageBtn').click();
        await page.locator('#vizTypeSelector').selectOption('area');
        await period(page, 'date-range', dates[14], dates[65]);
        await page.locator('#vizTypeSelector').selectOption('bar');
        await expect(page.locator('#date-range-start-input')).toHaveValue(dates[14]);
        await expect(page.locator('#date-range-end-input')).toHaveValue(dates[65]);
        expect(await settings(page, 'globe')).toEqual(globeSettings);
        expect(await page.locator('#countryPrimary').textContent()).toBe(snapshot);
        expect(await page.evaluate(() => window.workspaceGlobeRefreshes)).toBe(0);

        const localSettings = await settings(page, 'country');
        await page.locator('#navCompare').click();
        expect(await settings(page, 'compare')).toEqual(globeSettings);
        await page.locator('#navExplore').click();
        expect(await settings(page, 'country')).toEqual(localSettings);
        await expect(page.locator('#vizTypeSelector')).toHaveValue('bar');
        await expect(page.locator('#analysisValue')).toHaveText('590');
        const saved = new URL(page.url()).searchParams;
        expect(JSON.parse(saved.get('analysisSettings'))).toEqual(localSettings);
        expect(saved.get('analysisChart')).toBe('bar');
        expect(saved.get('metric')).toBe(globeSettings.metric);

        await page.reload();
        await expect.poll(() => page.evaluate(() => window.AtlasView.restoring)).toBe(false);
        expect(await settings(page, 'globe')).toEqual(globeSettings);
        expect(await settings(page, 'country')).toEqual(localSettings);
        await expect(metric).toHaveValue('current_hospitalized_patients');
        await expect(page.locator('#analysisHospBtn')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#vizTypeSelector')).toHaveValue('bar');
        await expect(page.locator('#analysisValue')).toHaveText('590');
        await expect(page.locator('#date-range-start-input')).toHaveValue(dates[14]);
        await expect(page.locator('#date-range-end-input')).toHaveValue(dates[65]);
        expect(await page.locator('#countryPrimary').textContent()).toBe(snapshot);
    });

    test(`Compare inherits once and preserves its dataset, period and countries independently at ${width}px`, async ({ page }) => {
        await prepare(page, width);
        expect(await page.evaluate(() => AtlasWorkspaces.peek('country'))).toBeNull();
        expect(await page.evaluate(() => AtlasWorkspaces.peek('compare'))).toBeNull();
        await page.locator('#hospBtn').click();
        await page.locator('#dataSelector').selectOption('current_intensive_care_patients');
        await page.locator('#unitSelector').selectOption('per100k');
        await page.locator('#averageBtn').click();
        const originalGlobe = await settings(page, 'globe');
        await page.locator('#navCompare').click();
        expect(await settings(page, 'compare')).toEqual(originalGlobe);
        await expect(page.locator('#hospBtn')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#compareMetricSelector')).toHaveValue('current_intensive_care_patients');
        await expect(page.locator('#compareUnitSelector')).toHaveValue('per100k');
        await expect(page.locator('#compareSmoothingSelector')).toHaveValue('7day');
        await trackGlobeRefreshes(page);

        await addComparisonCountry(page, 'United States');
        await page.locator('#vaccBtn').click();
        await page.locator('#compareMetricSelector').selectOption('cumulative_persons_fully_vaccinated');
        await page.locator('#compareUnitSelector').selectOption('percent');
        await page.locator('#compareChartType').selectOption('bar');
        await period(page, 'compare-date-range', dates[10], dates[60]);
        expect(await settings(page, 'globe')).toEqual(originalGlobe);
        expect(await page.evaluate(() => window.workspaceGlobeRefreshes)).toBe(0);
        const comparisonSettings = await settings(page, 'compare');
        expect(comparisonSettings).toMatchObject({ category: 'vaccinations', metric: 'cumulative_persons_fully_vaccinated', unit: 'percent', smoothing: 'raw' });

        await page.locator('#navExplore').click();
        await expect(page.locator('#hospBtn')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#dataSelector')).toHaveValue('current_intensive_care_patients');
        await page.locator('#epidemBtn').click();
        await page.locator('#dataSelector').selectOption('new_deceased');
        await page.locator('#rawBtn').click();
        await page.locator('#unitSelector').selectOption('count');
        await page.locator('#dateSlider').fill('20');
        await page.locator('#search').click();
        await page.locator('#countrySearchInput').fill('France');
        await page.getByRole('button', { name: 'France', exact: true }).click();
        const updatedGlobe = await settings(page, 'globe');
        await page.locator('#navCompare').click();
        expect(await settings(page, 'compare')).toEqual(comparisonSettings);
        expect(await page.evaluate(() => CompareMode.state.countries)).toEqual(['tn', 'us']);
        await expect(page.locator('#vaccBtn')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#compareMetricSelector')).toHaveValue('cumulative_persons_fully_vaccinated');
        await expect(page.locator('#compareChartType')).toHaveValue('bar');
        await expect(page.locator('#compare-date-range-start-input')).toHaveValue(dates[10]);
        await expect(page.locator('#compare-date-range-end-input')).toHaveValue(dates[60]);
        await addComparisonCountry(page, 'France');
        expect(await settings(page, 'compare')).toEqual(comparisonSettings);
        expect(await page.evaluate(() => CompareMode.state.countries)).toEqual(['tn', 'us', 'fr']);
        expect(await settings(page, 'globe')).toEqual(updatedGlobe);
        const sharedURL = new URL(page.url()).searchParams;
        expect(JSON.parse(sharedURL.get('compareSettings'))).toEqual(comparisonSettings);
        expect(sharedURL.get('metric')).toBe('new_deceased');

        await page.reload();
        await expect.poll(() => page.evaluate(() => window.AtlasView.restoring)).toBe(false);
        expect(await settings(page, 'compare')).toEqual(comparisonSettings);
        expect(await settings(page, 'globe')).toEqual(updatedGlobe);
        await expect(page.locator('#compareMetricSelector')).toHaveValue('cumulative_persons_fully_vaccinated');
        await expect(page.locator('#compareUnitSelector')).toHaveValue('percent');
        await expect(page.locator('#compare-date-range-start-input')).toHaveValue(dates[10]);
        await expect(page.locator('#compare-date-range-end-input')).toHaveValue(dates[60]);
        expect(await page.evaluate(() => CompareMode.state.countries)).toEqual(['tn', 'us', 'fr']);
        await page.locator('#navExplore').click();
        await expect(page.locator('#epidemBtn')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#dataSelector')).toHaveValue('new_deceased');
        await expect(page.locator('#timelineDateInput')).toHaveValue(dates[20]);
    });
}

for (const width of [1440, 390]) {
    test(`each workspace remembers dataset metrics through switching and refresh at ${width}px`, async ({ page }) => {
        await prepare(page, width, true);
        const globeMetric = page.locator('#dataSelector'), countryMetric = page.locator('#analysisMetricSelector');
        const compareMetric = page.locator('#compareMetricSelector');

        await page.locator('#hospBtn').click();
        await globeMetric.selectOption('current_intensive_care_patients');
        const unchangedURL = page.url();
        await trackGlobeRefreshes(page);
        await page.locator('#hospBtn').click();
        await expect(globeMetric).toHaveValue('current_intensive_care_patients');
        expect(page.url()).toBe(unchangedURL);
        expect(await page.evaluate(() => window.workspaceGlobeRefreshes)).toBe(0);
        await page.locator('#epidemBtn').click();
        await globeMetric.selectOption('new_deceased');
        await page.locator('#hospBtn').click();
        await expect(globeMetric).toHaveValue('current_intensive_care_patients');

        await page.locator('#navCompare').click();
        await expect(compareMetric).toHaveValue('current_intensive_care_patients');
        await compareMetric.selectOption('current_hospitalized_patients');
        await page.locator('#hospBtn').click();
        await expect(compareMetric).toHaveValue('current_hospitalized_patients');
        await page.locator('#epidemBtn').click();
        await compareMetric.selectOption('cumulative_confirmed');
        await page.locator('#hospBtn').click();
        await expect(compareMetric).toHaveValue('current_hospitalized_patients');

        await page.locator('#navExplore').click();
        await expect(globeMetric).toHaveValue('current_intensive_care_patients');
        await trackGlobeRefreshes(page);
        await page.locator('#analysisHospBtn').click();
        await countryMetric.selectOption('new_hospitalized_patients');
        await page.locator('#analysisEpidemBtn').click();
        await countryMetric.selectOption('new_deceased');
        await page.locator('#analysisHospBtn').click();
        await expect(countryMetric).toHaveValue('new_hospitalized_patients');
        const localURL = page.url();
        await page.locator('#analysisHospBtn').click();
        await expect(countryMetric).toHaveValue('new_hospitalized_patients');
        expect(page.url()).toBe(localURL);
        expect(await page.evaluate(() => window.workspaceGlobeRefreshes)).toBe(0);
        expect(await page.evaluate(() => ({
            globe: AtlasWorkspaces.get('globe').currentColumn,
            country: AtlasWorkspaces.get('country').currentColumn,
            compare: AtlasWorkspaces.get('compare').currentColumn
        }))).toEqual({ globe: 'current_intensive_care_patients', country: 'new_hospitalized_patients', compare: 'current_hospitalized_patients' });

        await page.locator('#epidemBtn').click();
        await expect(globeMetric).toHaveValue('new_deceased');
        await page.locator('#analysisEpidemBtn').click();
        await expect(countryMetric).toHaveValue('new_deceased');
        await page.locator('#navCompare').click();
        await page.locator('#epidemBtn').click();
        await expect(compareMetric).toHaveValue('cumulative_confirmed');
        expect(JSON.parse(new URL(page.url()).searchParams.get('workspaceMetrics'))).toMatchObject({
            globe: { epidem: 'new_deceased', hospitalizations: 'current_intensive_care_patients' },
            country: { epidem: 'new_deceased', hospitalizations: 'new_hospitalized_patients' },
            compare: { epidem: 'cumulative_confirmed', hospitalizations: 'current_hospitalized_patients' }
        });

        await page.reload();
        await expect.poll(() => page.evaluate(() => window.AtlasView.restoring)).toBe(false);
        await expect(compareMetric).toHaveValue('cumulative_confirmed');
        await page.locator('#hospBtn').click();
        await expect(compareMetric).toHaveValue('current_hospitalized_patients');
        await page.locator('#navExplore').click();
        await expect(globeMetric).toHaveValue('new_deceased');
        await expect(countryMetric).toHaveValue('new_deceased');
        await page.locator('#hospBtn').click();
        await expect(globeMetric).toHaveValue('current_intensive_care_patients');
        await page.locator('#analysisHospBtn').click();
        await expect(countryMetric).toHaveValue('new_hospitalized_patients');
        expect(await settings(page, 'compare')).toMatchObject({ category: 'hospitalizations', metric: 'current_hospitalized_patients' });
    });
}
