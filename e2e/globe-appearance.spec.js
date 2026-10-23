import { test, expect } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
    await page.route('https://flagcdn.com/**', route => route.fulfill({ contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16"><rect width="24" height="16" fill="#8ca5b7"/></svg>' }));
    await page.addInitScript(() => {
        HTMLElement.prototype.requestFullscreen = async () => { throw new Error('Use the viewport fullscreen fallback'); };
    });
});

async function layout(page) {
    return page.evaluate(() => Object.fromEntries([
        '#header', '.category-bar', '.historical-timeline', '#explorerSettings', '#globeStage',
        '.stage-topline', '.stage-bottomline', '.globe-hint', '.globe-controls',
        '#zoomInBtn', '#zoomOutBtn', '#resetBtn', '#expandGlobeBtn', '#countryInfo'
    ].map(selector => {
        const node = document.querySelector(selector), box = node.getBoundingClientRect(), style = getComputedStyle(node);
        const anchored = ['sticky', 'fixed'].includes(style.position);
        return [selector, {
            left: anchored ? box.left : node.offsetLeft, top: anchored ? box.top : node.offsetTop, width: box.width, height: box.height,
            padding: style.padding, borderWidth: style.borderWidth, borderRadius: style.borderRadius,
            fontSize: style.fontSize, lineHeight: style.lineHeight, transform: style.transform
        }];
    })));
}

async function expectDefaultSphereToFit(page) {
    await expect.poll(() => page.evaluate(() => {
        const globe = globeInstance, drawing = document.getElementById('globe').getBoundingClientRect();
        const sphere = document.querySelector('#globe .ocean').getBoundingClientRect();
        const stage = document.getElementById('globeStage'), panel = stage.getBoundingClientRect(), style = getComputedStyle(stage);
        const center = { x: sphere.left + sphere.width / 2, y: sphere.top + sphere.height / 2 };
        const obstacles = [];
        // Text ranges exclude each heading's empty full-width line box, so a
        // large circle can use the clear space between the corner labels.
        for (const selector of ['.stage-topline .eyebrow', '#mapMetricLabel', '#mapUnitsLabel', '#coverageCount']) {
            const walker = document.createTreeWalker(document.querySelector(selector), NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                if (!walker.currentNode.textContent.trim()) continue;
                const range = document.createRange(); range.selectNodeContents(walker.currentNode);
                obstacles.push(...range.getClientRects());
            }
        }
        document.querySelectorAll('.coverage-dot, .globe-hint, .globe-controls button').forEach(node => {
            const rect = node.getBoundingClientRect();
            if (rect.width && rect.height) obstacles.push(rect);
        });
        const overlaps = obstacles.filter(rect => {
            const dx = Math.max(rect.left - center.x, 0, center.x - rect.right);
            const dy = Math.max(rect.top - center.y, 0, center.y - rect.bottom);
            return Math.hypot(dx, dy) < sphere.width / 2 - .5;
        });
        return {
            measured: Math.abs(globe.width - drawing.width) < 1 && Math.abs(globe.height - drawing.height) < 1,
            fullPanelCanvas: Math.abs(drawing.left - panel.left - parseFloat(style.borderLeftWidth)) < 1 &&
                Math.abs(panel.right - drawing.right - parseFloat(style.borderRightWidth)) < 1 &&
                Math.abs(drawing.top - panel.top - parseFloat(style.borderTopWidth)) < 1 &&
                Math.abs(panel.bottom - drawing.bottom - parseFloat(style.borderBottomWidth)) < 1,
            fitted: sphere.left >= drawing.left + 7.5 && sphere.right <= drawing.right - 7.5 &&
                sphere.top >= drawing.top + 7.5 && sphere.bottom <= drawing.bottom - 7.5,
            centered: Math.abs(center.x - drawing.left - globe.center[0]) < 1 &&
                Math.abs(center.y - drawing.top - globe.center[1]) < 1,
            clearOfChrome: overlaps.length === 0,
            comfortableSize: sphere.width <= (Math.min(drawing.width, drawing.height) - 16) * 0.88 + 1,
            defaultZoom: Math.abs(globe.projection.scale() / globe.radius - 1) < 0.00001
        };
    })).toEqual({ measured: true, fullPanelCanvas: true, fitted: true, centered: true, clearOfChrome: true,
        comfortableSize: true, defaultZoom: true });
}

async function expectGlobeControlsToWork(page) {
    await page.locator('#zoomOutBtn').click();
    await expect.poll(() => page.evaluate(() => globeInstance.projection.scale() / globeInstance.radius)).toBeCloseTo(.8, 5);
    await page.locator('#zoomInBtn').click();
    await expect.poll(() => page.evaluate(() => globeInstance.projection.scale() / globeInstance.radius)).toBeCloseTo(1, 5);
    await page.locator('#zoomInBtn').click();
    await expect.poll(() => page.evaluate(() => globeInstance.projection.scale() / globeInstance.radius)).toBeCloseTo(1.25, 5);
    await page.locator('#resetBtn').click();
    await expect.poll(() => page.evaluate(() => globeInstance.projection.scale() / globeInstance.radius)).toBeCloseTo(1, 5);
}

async function dataAppearance(page) {
    return page.evaluate(() => {
        const globe = globeInstance, service = dataService;
        return {
            mappedColorsCorrect: [...document.querySelectorAll('#globe .country')].every(node => {
                const code = globe.getCountryCode(node.__data__);
                return node.getAttribute('fill') === (code ? service.getCountryColor(code) : service.getDefaultColor());
            }),
            domain: service.getColorScale().domain(), breaks: service.getColorScale().breaks(),
            date: service.currentDate, metric: service.currentColumn, country: globe.selectedCountryCode
        };
    });
}

for (const viewport of [
    { width: 1440, height: 1000 }, { width: 1024, height: 1000 }, { width: 320, height: 740 }
]) {
    test(`the refined sphere fits normal and fullscreen drawing areas without changing theme layout at ${viewport.width}px`, async ({ page }) => {
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.setViewportSize(viewport);
        await page.goto('/?data=sample');
        await expect(page.locator('#loader')).toBeHidden();
        await expect(page.locator('#resetBtn')).toBeEnabled();
        await expect(page.locator('#globe .country').first()).toBeAttached();
        await expectDefaultSphereToFit(page);
        // Preserve the panel sizes from before the drawing area was expanded.
        expect((await page.locator('#globeStage').boundingBox()).height).toBe(viewport.width === 1440 ? 620 : viewport.width === 1024 ? 440 : 370);
        const baselineData = await dataAppearance(page);
        expect(baselineData.mappedColorsCorrect).toBe(true);
        const normalLayout = await layout(page);

        for (const expanded of [false, true]) {
            if (expanded) {
                await page.locator('#expandGlobeBtn').click();
                await expect(page.locator('#expandedGlobe')).toBeVisible();
                await expectDefaultSphereToFit(page);
            }
            const baselineLayout = await layout(page);
            for (const theme of ['light', 'dark']) {
                await page.evaluate(value => AtlasTheme.setPreference(value), theme);
                await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
                await expect(page.locator('#globe .ocean')).toHaveCSS('fill', theme === 'light' ? 'rgb(23, 48, 77)' : 'rgb(16, 31, 51)');
                await expect(page.locator('#globe .graticule')).toHaveCSS('stroke-opacity', theme === 'dark' ? '0.1' : '0.4');
                await expect(page.locator('#globe .coastline')).toHaveCSS('stroke', 'rgb(255, 255, 255)');
                await expect(page.locator('#globe .coastline')).toHaveCSS('pointer-events', 'none');
                expect(await page.locator('#globe .ocean').evaluate(node => getComputedStyle(node).filter)).not.toBe('none');
                expect(await page.locator('#globeStage').evaluate(node => getComputedStyle(node).backgroundImage)).not.toBe('none');
                await expectDefaultSphereToFit(page);
                expect(await layout(page)).toEqual(baselineLayout);
                expect(await dataAppearance(page)).toEqual(baselineData);
                await expect(page.locator('#mapMetricLabel')).toBeVisible();
                await expect(page.locator('#coverageCount')).toBeVisible();
                await expect(page.locator('.globe-hint')).toBeVisible();
                await expectGlobeControlsToWork(page);
                await expectDefaultSphereToFit(page);
                await page.locator('#globeStage').screenshot({ path: `test-results/globe-refined-${theme}-${expanded ? 'fullscreen' : 'normal'}-${viewport.width}.png` });
            }
        }
        await page.locator('#exitExpandedGlobe').click();
        await expect(page.locator('#expandedGlobe')).toHaveCount(0);
        await expectDefaultSphereToFit(page);
        expect(await layout(page)).toEqual(normalLayout);
        expect(await dataAppearance(page)).toEqual(baselineData);
        // Opening the existing snapshot narrows the desktop stage; fitting
        // should adapt without obscuring its labels or moving its controls.
        await page.locator('#globe .country[data-country-code="tn"]').click();
        await expect(page.locator('#countryInfo')).toBeVisible();
        await expect(page.locator('#globe .selected-country')).toHaveAttribute('data-country-code', 'tn');
        await expectDefaultSphereToFit(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(errors).toEqual([]);
    });
}
