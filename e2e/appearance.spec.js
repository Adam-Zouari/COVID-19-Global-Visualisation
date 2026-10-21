import { test, expect } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
    await page.route('https://flagcdn.com/**', route => route.fulfill({ contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16"><rect width="24" height="16" fill="#8ca5b7"/></svg>' }));
});

async function ready(page, path = '/?data=sample') {
    await page.goto(path);
    await expect(page.locator('#loader')).toBeHidden();
    await expect(page.locator('#dataSelector')).toBeEnabled();
    await expect(page.locator('#globe .country').first()).toBeAttached();
}

async function appearance(page, preference, resolved = preference) {
    await page.locator('#appearanceButton').click();
    await page.locator(`#appearanceMenu [data-appearance="${preference}"]`).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', resolved);
    await expect(page.locator('html')).toHaveAttribute('data-appearance', preference);
    expect(await page.evaluate(() => AtlasTheme.getPreference())).toBe(preference);
    expect(await page.evaluate(() => localStorage.getItem('atlas-appearance'))).toBe(preference);
    await expect(page.locator(`#appearanceMenu [data-appearance="${preference}"]`)).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#appearanceMenu')).toBeHidden();
}

async function screenshot(page, name) {
    await page.evaluate(async () => {
        scrollTo({ top: 0, behavior: 'instant' });
        // Let Chrome repaint the overflow-clipped globe after it was offscreen
        // while inspecting country analysis. This is capture synchronization.
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    if (name.startsWith('appearance-explore-')) {
        await expect(page.locator('#mapMetricLabel')).toBeInViewport();
        await expect(page.locator('#globe .ocean')).toBeInViewport();
        await expect(page.locator('#zoomInBtn')).toBeInViewport();
    }
    await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
}

async function assertTextContrast(page, selector, minimum = 4.5) {
    const ratio = await page.locator(selector).first().evaluate(node => {
        const channels = color => color.match(/[\d.]+/g).map(Number);
        const luminance = color => channels(color).slice(0, 3).map(channel => {
            const value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
        const style = getComputedStyle(node);
        const foreground = node instanceof SVGElement && style.fill !== 'none' ? style.fill : style.color;
        let background = 'rgb(255, 255, 255)';
        for (let parent = node; parent; parent = parent.parentElement) {
            const color = getComputedStyle(parent).backgroundColor;
            const values = channels(color);
            if (values.length === 3 || values[3] === 1) { background = color; break; }
        }
        const light = luminance(foreground), dark = luminance(background);
        return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
    });
    expect(ratio, `${selector} text contrast`).toBeGreaterThanOrEqual(minimum);
}

function luminance(color) {
    const channels = color.startsWith('#') ? color.slice(1).match(/../g).map(value => parseInt(value, 16)) : color.match(/[\d.]+/g).slice(0, 3).map(Number);
    return channels.map(channel => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

test('new visitors receive dark appearance even when their OS prefers light', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await ready(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => AtlasTheme.getPreference())).toBe('dark');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark');
    expect(await page.evaluate(() => ({
        page: getComputedStyle(document.body).backgroundColor,
        panel: getComputedStyle(document.querySelector('.control-panel')).backgroundColor,
        control: getComputedStyle(document.querySelector('#dataSourceSelector')).backgroundColor,
        accent: AtlasTheme.getColor('--cases')
    }))).toEqual({ page: 'rgb(11, 18, 32)', panel: 'rgb(17, 28, 44)', control: 'rgb(13, 23, 39)', accent: '#ff8b7d' });
    await page.locator('#appearanceButton').click();
    await expect(page.locator('#appearanceMenu [data-appearance="dark"]')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
});

test('light preference persists and is applied before application initialization', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await ready(page);
    await appearance(page, 'light');
    expect(await page.evaluate(() => localStorage.getItem('atlas-appearance'))).toBe('light');
    const surfaces = await page.evaluate(() => ({
        page: getComputedStyle(document.body).backgroundColor,
        panel: getComputedStyle(document.querySelector('.control-panel')).backgroundColor
    }));
    expect(luminance(surfaces.page)).toBeGreaterThan(0.7);
    expect(luminance(surfaces.page)).toBeLessThan(0.9);
    expect(luminance(surfaces.panel)).toBeGreaterThan(0.8);
    expect(luminance(surfaces.panel)).toBeLessThan(0.95);
    let release;
    const applicationGate = new Promise(resolve => { release = resolve; });
    await page.route('**/app.js', async route => { await applicationGate; await route.continue(); });
    try {
        await page.reload({ waitUntil: 'commit' });
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
        expect(await page.evaluate(() => Boolean(window.globeInstance))).toBe(false);
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');
    } finally { release(); }
    await expect(page.locator('#loader')).toBeHidden();
    expect(await page.evaluate(() => AtlasTheme.getPreference())).toBe('light');
    await expect(page.locator('#appearanceButton')).toHaveAttribute('aria-expanded', 'false');
});

test('System follows live OS changes, persists, and explicit choices ignore OS changes', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await ready(page);
    await appearance(page, 'system', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => AtlasTheme.getPreference())).toBe('system');
    expect(await page.evaluate(() => localStorage.getItem('atlas-appearance'))).toBe('system');
    await page.reload();
    await expect(page.locator('#loader')).toBeHidden();
    expect(await page.evaluate(() => AtlasTheme.getPreference())).toBe('system');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await appearance(page, 'dark');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await appearance(page, 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('appearance menu supports keyboard selection, Escape and outside dismissal', async ({ page }) => {
    await ready(page);
    const button = page.locator('#appearanceButton'), menu = page.locator('#appearanceMenu');
    await expect(button).toHaveAttribute('aria-haspopup', 'menu');
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.getByRole('menuitemradio')).toHaveCount(3);
    await expect(menu.locator('[data-appearance="dark"]')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.locator('[data-appearance="system"]')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(menu.locator('[data-appearance="light"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
    await button.click();
    await expect(menu.locator('[data-appearance="light"]')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
    await button.click();
    await page.locator('#pageTitle').click();
    await expect(menu).toBeHidden();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
});

test('live appearance changes recolor analysis without reloading data or rebuilding geography', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await ready(page, '/?data=sample&country=tn');
    await page.locator('#seeMoreBtn').click();
    await expect(page.locator('#chartContainer .data-line')).toBeVisible();
    const requests = []; page.on('request', request => {
        if (/\/api\/|\/assets\/world\//.test(request.url())) requests.push(request.url());
    });
    let navigations = 0; page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
    await page.evaluate(() => {
        const globe = window.globeInstance, service = window.dataService;
        window.__appearanceBaseline = {
            globe, service, worldData: globe.worldData, features: globe.countryFeatures,
            countryMap: globe.countryFeatureMap, projection: globe.projection,
            paths: [...document.querySelectorAll('#globe .country')],
            ocean: document.querySelector('#globe .ocean'),
            oceanColor: getComputedStyle(document.querySelector('#globe .ocean')).fill,
            stageColor: getComputedStyle(document.querySelector('.globe-stage')).backgroundColor,
            countryColors: [...document.querySelectorAll('#globe .country')].map(node => node.getAttribute('fill')),
            legend: document.querySelector('#globeLegend .legend-gradient').style.background,
            domain: service.getColorScale().domain(), breaks: service.getColorScale().breaks(),
            rotation: globe.projection.rotate(), zoom: globe.projection.scale(),
            axisColor: getComputedStyle(document.querySelector('#chartContainer .axis-unit-label')).color,
            lineColor: getComputedStyle(document.querySelector('#chartContainer .data-line')).stroke,
            values: document.querySelector('#chartContainer .data-line').__data__.map(point => point.value),
            state: { date: service.currentDate, metric: service.currentColumn, unit: service.displayUnit, smoothing: service.smoothing, country: globe.selectedCountryCode },
            calls: []
        };
        for (const [owner, method] of [[service, 'loadData'], [globe, 'ensureWorldData'], [globe, 'createGlobe'], [globe, 'buildCountryFeatureMap']]) {
            const original = owner[method];
            owner[method] = function (...args) { window.__appearanceBaseline.calls.push(method); return original.apply(this, args); };
        }
    });
    await screenshot(page, 'appearance-explore-dark');
    await assertTextContrast(page, '.chart-subtitle');
    await assertTextContrast(page, '#chartContainer .axis-unit-label');
    await appearance(page, 'light');
    await expect.poll(() => page.locator('#chartContainer .axis-unit-label').evaluate(node => getComputedStyle(node).color)).not.toBe(
        await page.evaluate(() => window.__appearanceBaseline.axisColor));
    await expect.poll(() => page.locator('#chartContainer .data-line').evaluate(node => getComputedStyle(node).stroke)).not.toBe(
        await page.evaluate(() => window.__appearanceBaseline.lineColor));
    await expect.poll(() => page.locator('#globe .ocean').evaluate(node => getComputedStyle(node).fill)).not.toBe(
        await page.evaluate(() => window.__appearanceBaseline.oceanColor));
    const lightGlobe = await page.evaluate(() => ({
        stage: getComputedStyle(document.querySelector('.globe-stage')).backgroundColor,
        ocean: getComputedStyle(document.querySelector('#globe .ocean')).fill,
        countryColors: [...document.querySelectorAll('#globe .country')].map(node => node.getAttribute('fill')),
        legend: document.querySelector('#globeLegend .legend-gradient').style.background,
        colorScheme: getComputedStyle(document.querySelector('.globe-stage')).colorScheme
    }));
    expect(luminance(lightGlobe.stage)).toBeGreaterThan(0.75);
    expect(luminance(lightGlobe.ocean)).toBeGreaterThan(0.75);
    expect(lightGlobe.colorScheme).toBe('light');
    expect(lightGlobe.countryColors).not.toEqual(await page.evaluate(() => window.__appearanceBaseline.countryColors));
    expect(lightGlobe.legend).not.toBe(await page.evaluate(() => window.__appearanceBaseline.legend));
    await assertTextContrast(page, '#mapMetricLabel');
    await assertTextContrast(page, '.globe-hint');
    await assertTextContrast(page, '#zoomInBtn');
    await assertTextContrast(page, '.chart-subtitle');
    await assertTextContrast(page, '#chartContainer .axis-unit-label');
    await screenshot(page, 'appearance-explore-light');
    const preserved = await page.evaluate(() => {
        const baseline = window.__appearanceBaseline, globe = window.globeInstance, service = window.dataService;
        return {
            globe: globe === baseline.globe, service: service === baseline.service,
            geometry: globe.worldData === baseline.worldData && globe.countryFeatures === baseline.features && globe.countryFeatureMap === baseline.countryMap && globe.projection === baseline.projection,
            paths: baseline.paths.length > 100 && baseline.paths.every(node => node.isConnected && node === document.getElementById(node.id)),
            ocean: baseline.ocean === document.querySelector('#globe .ocean'),
            domain: service.getColorScale().domain(), baselineDomain: baseline.domain,
            breaks: service.getColorScale().breaks(), baselineBreaks: baseline.breaks,
            rotation: globe.projection.rotate(), baselineRotation: baseline.rotation,
            zoom: globe.projection.scale(), baselineZoom: baseline.zoom,
            calls: baseline.calls,
            state: { date: service.currentDate, metric: service.currentColumn, unit: service.displayUnit, smoothing: service.smoothing, country: globe.selectedCountryCode },
            baselineState: baseline.state,
            values: document.querySelector('#chartContainer .data-line').__data__.map(point => point.value), baselineValues: baseline.values
        };
    });
    expect(preserved).toMatchObject({ globe: true, service: true, geometry: true, paths: true, ocean: true, calls: [] });
    expect(preserved.state).toEqual(preserved.baselineState);
    expect(preserved.values).toEqual(preserved.baselineValues);
    expect(preserved.domain).toEqual(preserved.baselineDomain);
    expect(preserved.breaks).toEqual(preserved.baselineBreaks);
    expect(preserved.rotation).toEqual(preserved.baselineRotation);
    expect(preserved.zoom).toEqual(preserved.baselineZoom);
    await appearance(page, 'dark');
    await expect.poll(() => page.locator('#globe .ocean').evaluate(node => getComputedStyle(node).fill)).toBe(
        await page.evaluate(() => window.__appearanceBaseline.oceanColor));
    expect(await page.locator('#globe .country').evaluateAll(nodes => nodes.map(node => node.getAttribute('fill')))).toEqual(
        await page.evaluate(() => window.__appearanceBaseline.countryColors));
    expect(await page.locator('#globeLegend .legend-gradient').evaluate(node => node.style.background)).toBe(
        await page.evaluate(() => window.__appearanceBaseline.legend));
    expect(requests).toEqual([]);
    expect(navigations).toBe(0);
    expect(errors).toEqual([]);
});

test('four comparison countries stay distinct after browsing history, reordering and appearance changes', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await ready(page, '/?data=sample&compare=tn,fr,us,gb');
    // Analysis history must not consume or collide with the comparison slots.
    await page.evaluate(() => dataService.getAllCountries().forEach(country => ChartFactory.countryColor(country.countryCode)));
    await page.locator('#navCompare').click();
    const readStyles = () => page.locator('#compareChartContainer .data-line').evaluateAll(nodes =>
        Object.fromEntries(nodes.map((node, index) => [CompareMode.state.countries[index], {
            color: node.getAttribute('stroke'), dash: node.getAttribute('stroke-dasharray') || 'solid'
        }])));
    let previousPatterns;
    for (const theme of ['dark', 'light']) {
        await appearance(page, theme);
        await expect(page.locator('#compareChartContainer .data-line')).toHaveCount(4);
        await expect.poll(() => page.locator('#compareChartContainer .data-line').evaluateAll(nodes =>
            [...new Set(nodes.map(node => node.getAttribute('stroke')))].sort())).toEqual(
                await page.evaluate(() => Array.from({ length: 4 }, (_, index) => AtlasTheme.getSeriesColor(index)).sort()));
        const styles = await readStyles();
        expect(new Set(Object.values(styles).map(style => style.dash)).size).toBe(4);
        const patterns = Object.fromEntries(Object.entries(styles).map(([code, style]) => [code, style.dash]));
        if (previousPatterns) expect(patterns).toEqual(previousPatterns);
        previousPatterns = patterns;
        const legend = await page.locator('.chart-legend .legend-line line').evaluateAll(nodes => nodes.map(node => ({
            color: node.getAttribute('stroke'), dash: node.getAttribute('stroke-dasharray') || 'solid'
        })));
        expect(legend).toEqual(Object.values(styles));
        expect(await page.locator('.country-color').evaluateAll(nodes => nodes.map(node => node.style.backgroundColor))).toEqual(
            await page.evaluate(() => CompareMode.state.countries.map(code => {
                const swatch = document.createElement('i'); swatch.style.backgroundColor = ChartFactory.countryColor(code);
                return swatch.style.backgroundColor;
            })));
        await page.evaluate(() => CompareMode.reorderCountries('gb', 'tn'));
        expect(await readStyles()).toEqual(styles);
        await assertTextContrast(page, '#compareChartContainer .axis-unit-label');
        await screenshot(page, `appearance-compare-${theme}`);
        await page.locator('#separateChartsBtn').click();
        await expect(page.locator('.country-chart-container .data-line')).toHaveCount(4);
        expect(await readStyles()).toEqual(styles);
        await page.locator('#combinedChartBtn').click();
    }
    expect(errors).toEqual([]);
});

test('search, category changes, chart tooltips and methodology remain readable in both appearances', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await ready(page, '/?data=sample&country=tn');
    await page.locator('#seeMoreBtn').click();
    for (const theme of ['dark', 'light']) {
        await appearance(page, theme);
        await page.locator('#search').click();
        await page.locator('#countrySearchInput').fill('Tunisia');
        await expect(page.getByRole('button', { name: 'Tunisia', exact: true })).toBeVisible();
        await assertTextContrast(page, '#countryList .country-item:not([hidden]) .country-search-label');
        await assertTextContrast(page, '#countryList .country-item:not([hidden]) .country-availability');
        expect(await page.locator('#countrySearchInput').evaluate(node => getComputedStyle(node).colorScheme)).toBe(theme);
        await page.locator('#countrySearchInput').fill('no matching location');
        await expect(page.locator('#searchEmpty')).toBeVisible();
        await assertTextContrast(page, '#searchEmpty');
        await page.keyboard.press('Escape');
        await expect(page.locator('#searchModal')).toBeHidden();
        for (const [button, category] of [['hospBtn', 'hospitalizations'], ['vaccBtn', 'vaccinations'], ['epidemBtn', 'epidem']]) {
            await page.locator(`#${button}`).click();
            expect(await page.evaluate(() => dataService.currentDataset)).toBe(category);
            await expect(page.locator('#chartContainer .data-line')).toBeVisible();
            await assertTextContrast(page, '#chartContainer .axis-unit-label');
            const colors = await page.evaluate(() => dataService.getColorScale().colors());
            if (theme === 'light') expect(luminance(colors.at(-1))).toBeLessThan(luminance(colors[0]));
            else expect(luminance(colors.at(-1))).toBeGreaterThan(luminance(colors[0]));
        }
        await page.locator('#chartContainer .chart-hit-area').focus();
        await page.keyboard.press('End');
        await expect(page.locator('#chartContainer .chart-tooltip')).toContainText('Tunisia');
        await assertTextContrast(page, '#chartContainer .chart-tooltip');
        await page.keyboard.press('Tab');
        await page.locator('.source-link').click();
        await expect(page.locator('#methodologyDialog')).toBeVisible();
        await assertTextContrast(page, '#methodologyDialog .methodology-grid p');
        await page.getByRole('button', { name: 'Close methodology', exact: true }).click();
    }
    expect(errors).toEqual([]);
});

test('archive recovery controls follow System appearance while the error dialog is open', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await ready(page);
    await appearance(page, 'system', 'light');
    await page.route('**/api/*', route => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
    await page.goto('/');
    await expect(page.locator('#errorDisplay')).toBeVisible();
    await expect(page.locator('#processUploads')).toBeVisible();
    const surfaces = [];
    for (const theme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: theme });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('#errorDisplay')).toBeVisible();
        await assertTextContrast(page, '#errorTitle');
        await assertTextContrast(page, '#errorMessage');
        await assertTextContrast(page, '.file-upload-controls label');
        expect(await page.locator('#epidemUpload').evaluate(node => getComputedStyle(node).colorScheme)).toBe(theme);
        surfaces.push(await page.locator('.error-card').evaluate(node => getComputedStyle(node).backgroundColor));
    }
    expect(new Set(surfaces).size).toBe(2);
});

for (const width of [320, 390]) {
    test(`appearance menu and both workspaces fit a ${width}px mobile viewport`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await ready(page, '/?data=sample&country=tn&compare=tn,fr,us');
        for (const theme of ['dark', 'light']) {
            await appearance(page, theme);
            await expect(page.locator('#timelineSpeed')).toBeVisible();
            await expect(page.locator('#timelineSpeed')).toHaveValue('1');
            for (const selector of ['#appearanceButton', '#dataSourceSelector', '#navExplore', '#navCompare', '#search']) {
                await expect(page.locator(selector)).toBeVisible();
                const box = await page.locator(selector).boundingBox();
                expect(box.x, `${selector} left edge`).toBeGreaterThanOrEqual(0);
                expect(box.x + box.width, `${selector} right edge`).toBeLessThanOrEqual(width);
            }
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await page.locator('#appearanceButton').click();
            const menu = await page.locator('#appearanceMenu').boundingBox();
            expect(menu.x).toBeGreaterThanOrEqual(0);
            expect(menu.x + menu.width).toBeLessThanOrEqual(width);
            await page.keyboard.press('Escape');
            await page.locator('#navCompare').click();
            await expect(page.locator('#comparePanel')).toBeVisible();
            await expect(page.locator('#compareChartContainer .data-line')).toHaveCount(3);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            if (width === 390) await screenshot(page, `appearance-compare-mobile-${theme}`);
            await page.locator('#navExplore').click();
            if (width === 390) await screenshot(page, `appearance-explore-mobile-${theme}`);
        }
    });
}
