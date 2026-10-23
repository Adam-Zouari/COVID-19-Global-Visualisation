import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.route('https://flagcdn.com/**', route => route.fulfill({ contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16"><rect width="24" height="16" fill="#8ca5b7"/></svg>' }));
});

async function ready(page, path = '/?data=sample') {
    await page.goto(path);
    await expect(page.locator('#loader')).toBeHidden();
    await expect(page.locator('#resetBtn')).toBeEnabled();
    await expect(page.locator('#globe .country').first()).toBeAttached();
}

async function expectCollapsedRail(page) {
    await expect(page.locator('#explorerSettings')).toBeVisible();
    await expect(page.locator('#explorerSettings .panel-label')).toBeVisible();
    await expect(page.locator('#explorerSettings .panel-label > span')).toHaveCSS('writing-mode', 'vertical-rl');
    await expect(page.locator('#filterContent')).toBeHidden();
    await expect(page.locator('#filtersToggle')).toBeVisible();
    await expect(page.locator('#filtersToggle')).toHaveAttribute('aria-expanded', 'false');
    const settings = await page.locator('#explorerSettings').boundingBox();
    const globe = await page.locator('#globeStage').boundingBox();
    expect(settings.width).toBeLessThanOrEqual(52);
    expect(settings.x + settings.width).toBeLessThanOrEqual(globe.x);
    expect(Math.abs(settings.y - globe.y)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 1024, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    test(`settings collapse to a left rail without an internal scrollbar at ${viewport.width}px`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.setViewportSize(viewport);
        await ready(page);
        const original = await page.locator('#globeStage').boundingBox();
        await expect(page.locator('#unitSelector')).toBeVisible();
        await page.locator('#filtersToggle').click();
        await expectCollapsedRail(page);
        expect((await page.locator('#globeStage').boundingBox()).height).toBeCloseTo(original.height, 1);
        await expect(page.locator('#globeSettingsToggle')).toHaveCount(0);
        if (viewport.width >= 1200) expect((await page.locator('#globeStage').boundingBox()).width).toBeGreaterThan(original.width);
        await page.screenshot({ path: `test-results/globe-settings-collapsed-${viewport.width}.png`, fullPage: true });
        await page.locator('#filtersToggle').click();
        await expect(page.locator('#explorerSettings')).toBeVisible();
        await expect(page.locator('#filtersToggle')).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#unitSelector')).toBeVisible();
        await page.locator('#globeLegend summary').click();
        expect(await page.locator('#explorerSettings').evaluate(node => {
            const style = getComputedStyle(node);
            return !['auto', 'scroll'].includes(style.overflowY) && node.scrollHeight <= node.clientHeight + 1;
        })).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
}

for (const fallback of [false, true]) {
    test(`globe expands, resizes, and exits through Escape with ${fallback ? 'CSS fallback' : 'Fullscreen API'}`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        if (fallback) await page.addInitScript(() => {
            HTMLElement.prototype.requestFullscreen = async () => { throw new Error('Fullscreen unavailable'); };
        });
        await ready(page, '/?data=sample&country=tn');
        await page.locator('#seeMoreBtn').click();
        await expect(page.locator('#visualizationPanel')).toBeVisible();
        await page.evaluate(() => {
            const existing = document.createElement('button');
            existing.id = 'previouslyInert'; existing.inert = true;
            document.body.appendChild(existing);
        });
        await page.locator('#expandGlobeBtn').click();
        await expect(page.locator('#expandedGlobe')).toBeVisible();
        await expect(page.locator('#header')).toHaveAttribute('inert', '');
        await page.locator('#navCompare').evaluate(node => node.focus());
        await expect(page.locator('#navCompare')).not.toBeFocused();
        expect(await page.locator('#exitExpandedGlobe').evaluate(node => node.inert)).toBe(false);
        await page.keyboard.press('/');
        await expect(page.locator('#searchModal')).toBeHidden();
        await expect(page.locator('#expandedGlobe #globeStage')).toHaveClass(/globe-expanded/);
        await expect(page.locator('#expandGlobeBtn')).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#expandedGlobe #dateSlider')).toBeVisible();
        await expect(page.locator('#expandedGlobe #explorerSettings')).toBeVisible();
        await expect(page.locator('#expandedGlobe #countryInfo')).toBeVisible();
        await expect(page.locator('#expandedGlobe #seeMoreBtn')).toBeVisible();
        await expect(page.locator('#expandedGlobe #addToCompareBtn')).toBeVisible();
        await expect(page.locator('#expandedGlobe #navCompare, #expandedGlobe #visualizationPanel')).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => ({ width: Math.round(globeInstance.width), height: Math.round(globeInstance.height) })))
            .toEqual(await page.locator('#globe').evaluate(node => ({ width: Math.round(node.clientWidth), height: Math.round(node.clientHeight) })));
        const expanded = await page.locator('#expandedGlobe').evaluate(node => ({ width: node.clientWidth, height: node.clientHeight }));
        expect(expanded.height).toBeGreaterThanOrEqual(990);
        await page.locator('#hospBtn').click();
        await expect.poll(() => page.evaluate(() => globeInstance.dataService.currentDataset)).toBe('hospitalizations');
        const metric = await page.locator('#dataSelector option').last().getAttribute('value');
        await page.locator('#dataSelector').selectOption(metric);
        await expect.poll(() => page.evaluate(() => globeInstance.dataService.currentColumn)).toBe(metric);
        const targetDate = await page.locator('#dateSlider').evaluate(node => String(Math.max(0, Number(node.max) - 3)));
        await page.locator('#dateSlider').fill(targetDate);
        await expect.poll(() => page.evaluate(() => globeInstance.dataService.currentDate))
            .toBe(await page.locator('#dateSlider').evaluate(node => window.globeInstance.dataService.getAvailableDates()[Number(node.value)]));
        await expect(page.locator('#countryContext')).toContainText('Hospitalizations');
        await expect(page.locator('#countryPrimary .primary-metric-label')).toHaveText(await page.locator('#dataSelector option:checked').textContent());
        await page.locator('#filtersToggle').click();
        await expectCollapsedRail(page);
        await page.locator('#filtersToggle').click();
        if (!fallback) await page.screenshot({ path: 'test-results/globe-expanded-desktop.png' });
        await page.locator('#zoomInBtn').click();
        await expect.poll(() => page.evaluate(() => globeInstance.projection.scale() / globeInstance.radius)).toBeCloseTo(1.25, 5);
        await page.locator('#resetBtn').click();
        await expect.poll(() => page.evaluate(() => globeInstance.projection.scale() / globeInstance.radius)).toBeCloseTo(1, 5);
        const tooltip = page.locator('#expandedGlobe > .tooltip');
        await page.locator('#globe .country[data-country-code="tn"]').hover();
        await expect(tooltip).toHaveCSS('opacity', '1');
        await expect(tooltip).toContainText('Tunisia');
        expect(await tooltip.evaluate(node => {
            const box = node.getBoundingClientRect();
            return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
        })).toBe(true);
        await page.keyboard.press('Escape');
        await expect(page.locator('#expandedGlobe')).toHaveCount(0);
        await expect(page.locator('#globeStage')).not.toHaveClass(/globe-expanded/);
        await expect(page.locator('#expandGlobeBtn')).toBeFocused();
        await expect(page.locator('#header')).not.toHaveAttribute('inert');
        await expect(page.locator('#previouslyInert')).toHaveAttribute('inert', '');
        await expect(page.locator('#visualizationPanel')).toBeVisible();
        expect(await page.evaluate(() => document.body.classList.contains('globe-expanded-open'))).toBe(false);
        expect(await page.evaluate(() => globeInstance.selectedCountryCode)).toBe('tn');
        await expect(page.locator('body > .tooltip')).toHaveCount(1);
        await expect(page.locator('body > .tooltip')).toHaveCSS('opacity', '0');
        await expect(page.locator('.category-bar > .dataset-buttons')).toHaveCount(1);
        await expect(page.locator('#exploreView > .historical-timeline')).toHaveCount(1);
        await expect(page.locator('#exploreView > #exploreWorkspace')).toHaveCount(1);
        expect(await page.evaluate(() => globeInstance.dataService.currentColumn)).toBe(metric);
    });
}

for (const configuration of [
    { width: 1440, fallback: false }, { width: 1440, fallback: true }, { width: 390, fallback: true }
]) for (const action of ['analysis', 'compare']) {
    test(`fullscreen snapshot opens ${action} after exiting with ${configuration.fallback ? 'CSS fallback' : 'Fullscreen API'} at ${configuration.width}px`, async ({ page }) => {
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.setViewportSize({ width: configuration.width, height: 1000 });
        if (configuration.fallback) await page.addInitScript(() => {
            HTMLElement.prototype.requestFullscreen = async () => { throw new Error('Fullscreen unavailable'); };
        });
        await ready(page);
        await page.locator('#expandGlobeBtn').click();
        await expect(page.locator('#expandedGlobe')).toBeVisible();
        if (!configuration.fallback) expect(await page.evaluate(() => document.fullscreenElement?.id)).toBe('expandedGlobe');
        await page.locator('#globe .country[data-country-code="tn"]').click();
        await expect(page.locator('#countryName')).toContainText('Tunisia');
        await expect(page.locator('#seeMoreBtn')).toBeVisible();
        await expect(page.locator('#addToCompareBtn')).toBeVisible();
        await page.evaluate(action => {
            window.__snapshotActions = [];
            const owner = action === 'analysis' ? window : CompareMode;
            const method = action === 'analysis' ? 'showVisualizations' : 'addCountry';
            const original = owner[method];
            owner[method] = function(...args) {
                window.__snapshotActions.push({ expanded: !!document.getElementById('expandedGlobe'), fullscreen: !!document.fullscreenElement });
                return original.apply(this, args);
            };
        }, action);
        await page.locator(action === 'analysis' ? '#seeMoreBtn' : '#addToCompareBtn').click();
        await expect(page.locator('#expandedGlobe')).toHaveCount(0);
        expect(await page.evaluate(() => document.fullscreenElement)).toBe(null);
        expect(await page.evaluate(() => window.__snapshotActions)).toEqual([{ expanded: false, fullscreen: false }]);
        await expect(page.locator('#exploreView > #exploreWorkspace')).toHaveCount(1);
        await expect(page.locator('.category-bar > .dataset-buttons')).toHaveCount(1);
        expect(await page.evaluate(() => document.body.classList.contains('globe-expanded-open'))).toBe(false);
        expect(await page.evaluate(() => globeInstance.selectedCountryCode)).toBe('tn');
        if (action === 'analysis') {
            await expect(page.locator('#visualizationPanel')).toBeVisible();
            await expect(page.locator('#viz-country-name')).toHaveText('Tunisia');
            await expect(page.locator('#chartContainer .data-line')).toBeVisible();
        } else {
            await expect(page.locator('#comparePanel')).toBeVisible();
            expect(await page.evaluate(() => CompareMode.state.countries)).toEqual(['tn']);
            await expect(page.locator('#compareChartContainer .data-line')).toBeVisible();
        }
        expect(errors).toEqual([]);
    });
}

test('fullscreen snapshot ignores repeated actions during the exit transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ready(page, '/?data=sample&country=tn');
    await page.locator('#expandGlobeBtn').click();
    await expect(page.locator('#expandedGlobe')).toBeVisible();
    await page.evaluate(() => {
        window.__analysisOpens = 0;
        const open = window.showVisualizations;
        window.showVisualizations = function(...args) { window.__analysisOpens++; return open.apply(this, args); };
        document.getElementById('seeMoreBtn').click();
        document.getElementById('addToCompareBtn').click();
        document.getElementById('seeMoreBtn').click();
    });
    await expect(page.locator('#expandedGlobe')).toHaveCount(0);
    await expect(page.locator('#visualizationPanel')).toBeVisible();
    await expect(page.locator('#comparePanel')).toBeHidden();
    expect(await page.evaluate(() => window.__analysisOpens)).toBe(1);
    expect(await page.evaluate(() => CompareMode.state.countries)).toEqual([]);
});

for (const viewport of [{ width: 1024, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
test(`the expanded explorer keeps its controls usable and restores them on exit at ${viewport.width}px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
        HTMLElement.prototype.requestFullscreen = async () => { throw new Error('Fullscreen unavailable'); };
    });
    await ready(page, '/?data=sample&country=tn');
    await page.locator('#expandGlobeBtn').click();
    await expect(page.locator('#expandedGlobe')).toBeVisible();
    await expect(page.locator('#expandedGlobe #dateSlider')).toBeVisible();
    await page.locator('#vaccBtn').click();
    await expect.poll(() => page.evaluate(() => globeInstance.dataService.currentDataset)).toBe('vaccinations');
    await page.locator('#filtersToggle').click();
    await expectCollapsedRail(page);
    await page.screenshot({ path: `test-results/globe-expanded-collapsed-${viewport.width}.png` });
    await page.locator('#filtersToggle').click();
    await page.locator('#dataSelector').selectOption('cumulative_persons_fully_vaccinated');
    await expect(page.locator('#countryPrimary .primary-metric-label')).toHaveText('People fully vaccinated');
    await page.locator('#countryInfo').scrollIntoViewIfNeeded();
    await expect(page.locator('#countryInfo')).toContainText('Tunisia');
    await expect(page.locator('#seeMoreBtn')).toBeVisible();
    await expect(page.locator('#exitExpandedGlobe')).toBeInViewport();
    expect(await page.locator('#expandedGlobe').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/globe-expanded-controls-${viewport.width}.png` });
    await page.locator('#exitExpandedGlobe').click();
    await expect(page.locator('#expandedGlobe')).toHaveCount(0);
    await expect(page.locator('#exploreWorkspace #dataSelector')).toHaveValue('cumulative_persons_fully_vaccinated');
    await expect(page.locator('#countryInfo .country-actions')).toBeVisible();
});
}

test('globe rotates slowly by default, stops after contact, and resumes only after Reset', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await ready(page);
    await expect.poll(() => page.evaluate(() => globeInstance.autoRotate)).toBe(true);
    const initial = await page.evaluate(() => globeInstance.currentRotation[0]);
    await expect.poll(() => page.evaluate(() => globeInstance.currentRotation[0])).toBeGreaterThan(initial + 0.1);
    await page.locator('#globe svg').dispatchEvent('pointerdown', { pointerType: 'touch' });
    await expect.poll(() => page.evaluate(() => globeInstance.autoRotate)).toBe(false);
    const stopped = await page.evaluate(() => globeInstance.currentRotation[0]);
    await page.evaluate(() => globeInstance.refreshData());
    await expect.poll(() => page.evaluate(() => globeInstance.currentRotation[0])).toBe(stopped);
    await page.locator('#resetBtn').click();
    await expect.poll(() => page.evaluate(() => globeInstance.autoRotate)).toBe(true);
    await page.locator('#globe svg').dispatchEvent('wheel', { deltaY: 20 });
    await expect.poll(() => page.evaluate(() => globeInstance.autoRotate)).toBe(false);
    await page.locator('#navCompare').click();
    await page.locator('#navExplore').click();
    expect(await page.evaluate(() => globeInstance.autoRotate)).toBe(false);
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
test(`analysis keeps its static chart selector beside the numeric value at ${viewport.width}px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(viewport);
    await ready(page, '/?data=sample&country=us&metric=cumulative_confirmed&smooth=raw');
    const referenceGap = await page.evaluate(() => Math.max(18, innerHeight - Math.max(...[...document.querySelectorAll('#exploreWorkspace > .panel')]
        .filter(node => node.getClientRects().length).map(node => node.getBoundingClientRect().bottom + scrollY))));
    await page.locator('#seeMoreBtn').click();
    await expect(page.locator('#analysisValue')).toContainText(/\d/);
    async function expectValueRow() {
        const boxes = await page.evaluate(() => {
            const value = document.getElementById('analysisValue').getBoundingClientRect();
            const selector = document.getElementById('vizTypeSelector').getBoundingClientRect();
            const offset = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.viz-controls')).transform).m42;
            const caption = document.getElementById('analysisValueDate').getBoundingClientRect();
            const dates = document.getElementById('chartControlsContainer').getBoundingClientRect();
            return { valueRight: value.right, valueTop: value.top, valueBottom: value.bottom, valueCenter: value.top + value.height / 2,
                selectorLeft: selector.left, selectorRight: selector.right, selectorTop: selector.top, selectorBottom: selector.bottom,
                selectorCenter: selector.top + selector.height / 2, selectorOffset: offset,
                captionTop: caption.top, datesTop: dates.top, datesRight: dates.right };
        });
        expect(boxes.valueRight).toBeLessThanOrEqual(boxes.selectorLeft);
        // A visual offset leaves the value and selector aligned in the grid.
        expect(Math.abs(boxes.selectorCenter - boxes.selectorOffset - boxes.valueCenter)).toBeLessThan(1);
        expect(Math.max(boxes.valueTop, boxes.selectorTop - boxes.selectorOffset))
            .toBeLessThan(Math.min(boxes.valueBottom, boxes.selectorBottom - boxes.selectorOffset));
        expect(boxes.captionTop).toBeGreaterThanOrEqual(boxes.valueBottom);
        expect(Math.abs(boxes.selectorRight - boxes.datesRight)).toBeLessThan(2);
        expect(boxes.selectorBottom - boxes.selectorOffset).toBeLessThan(boxes.datesTop);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await expectValueRow();
    const initialSelector = await page.locator('#vizTypeSelector').evaluate(node => node.getBoundingClientRect().top + scrollY);
    await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    expect(await page.locator('#vizTypeSelector').evaluate(node => node.getBoundingClientRect().top + scrollY)).toBeCloseTo(initialSelector, 1);
    expect(await page.locator('#vizTypeSelector').evaluate(node => getComputedStyle(node.closest('.viz-controls')).position)).toBe('static');
    const gap = await page.locator('#visualizationPanel').evaluate(node => document.documentElement.scrollHeight - (node.getBoundingClientRect().bottom + scrollY));
    expect(Math.abs(gap - referenceGap)).toBeLessThan(2);
    await page.screenshot({ path: `test-results/country-analysis-fixed-chart-control-${viewport.width}.png` });
    await page.locator('#vizTypeSelector').selectOption('scatter');
    await expect(page.locator('#analysisChartOptions')).toBeVisible();
    await expectValueRow();
    const scatterSelector = await page.locator('#vizTypeSelector').evaluate(node => node.getBoundingClientRect().top + scrollY);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    expect(await page.locator('#vizTypeSelector').evaluate(node => node.getBoundingClientRect().top + scrollY)).toBeCloseTo(scatterSelector, 1);
    const controls = await page.evaluate(() => {
        const options = document.getElementById('analysisChartOptions').getBoundingClientRect();
        const caption = document.getElementById('analysisValueDate').getBoundingClientRect();
        const dates = document.getElementById('chartControlsContainer').getBoundingClientRect();
        return { optionsTop: options.top, optionsBottom: options.bottom, captionBottom: caption.bottom, datesTop: dates.top };
    });
    expect(controls.optionsTop).toBeGreaterThanOrEqual(controls.captionBottom);
    expect(controls.optionsBottom).toBeLessThan(controls.datesTop);
    await page.locator('#vizTypeSelector').selectOption('box');
    await expect(page.locator('#chartContainer .box-mark').first()).toBeVisible();
    await page.locator('#analysisCloseBtn').click();
    await expect(page.locator('#visualizationPanel')).toBeHidden();
    expect(await page.locator('.app-main').evaluate(node => getComputedStyle(node).paddingBottom)).toBe('0px');
});
}
