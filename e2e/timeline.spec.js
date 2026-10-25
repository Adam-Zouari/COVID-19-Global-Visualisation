import { test, expect } from '@playwright/test';

for (const width of [1440, 390]) {
    test(`Explore defaults to daily and its editable date stays synchronized at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto('/?data=sample&country=tn&date=2021-06-01');
        const field = page.locator('#timelineDateInput');
        await expect(page.locator('#dataSelector')).toBeEnabled();
        await expect.poll(() => page.evaluate(() => window.AtlasView.restoring)).toBe(false);
        await expect(page.locator('#rawBtn')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#averageBtn')).toHaveAttribute('aria-pressed', 'false');
        await expect(field).toHaveValue('2021-06-01');
        await expect(field).toBeEnabled();
        const bounds = await page.evaluate(() => dataService.getAvailableDates());
        await expect(field).toHaveAttribute('min', bounds[0]);
        await expect(field).toHaveAttribute('max', bounds.at(-1));

        await field.fill('2021-06-12');
        await field.dispatchEvent('change');
        await expect.poll(() => page.evaluate(() => dataService.currentDate)).toBe('2021-06-12');
        await expect(page.locator('#currentDate')).toHaveText('Jun 12, 2021');
        expect(new URL(page.url()).searchParams.get('date')).toBe('2021-06-12');
        await page.locator('#nextDateBtn').click();
        await expect(field).toHaveValue('2021-06-13');
        await page.locator('#dateSlider').evaluate(node => {
            node.value = String(Number(node.value) + 1);
            node.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await expect(field).toHaveValue('2021-06-14');

        await field.click({ position: { x: 10, y: 10 } });
        await expect(field).toHaveCSS('outline-style', 'none');
        await page.keyboard.press('Tab');
        await field.focus();
        await expect(field).toBeFocused();
        await expect(field).toHaveCSS('outline-style', 'solid');
        await expect.poll(() => field.evaluate(node => {
            const style = getComputedStyle(node);
            return node.matches(':focus-visible') && parseFloat(style.outlineWidth) > 0 &&
                !['transparent', 'rgba(0, 0, 0, 0)', style.backgroundColor].includes(style.outlineColor);
        })).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

        await page.locator('#averageBtn').click();
        expect(new URL(page.url()).searchParams.get('smooth')).toBe('7day');
        await page.reload();
        await expect(page.locator('#dataSelector')).toBeEnabled();
        await expect.poll(() => page.evaluate(() => window.AtlasView.restoring)).toBe(false);
        await expect(page.locator('#averageBtn')).toHaveAttribute('aria-pressed', 'true');
        await expect(field).toHaveValue('2021-06-14');
    });
}

test('compact playback speed updates the running timeline without moving a paused date', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?data=sample');
    await expect(page.locator('#loader')).toBeHidden();
    await expect(page.locator('#dataSelector')).toBeEnabled();
    await page.locator('#rawBtn').click();
    await page.locator('#dateSlider').focus();
    await page.keyboard.press('Home');

    await page.clock.install({ time: new Date('2020-01-01T12:00:00Z') });
    await page.clock.pauseAt(new Date('2020-01-01T12:00:01Z'));
    const slider = page.locator('#dateSlider'), speed = page.locator('#timelineSpeed'), play = page.locator('#playTimelineBtn');
    await expect(speed).toHaveAccessibleName('Timeline playback speed');
    await expect(speed).toHaveValue('1');
    await speed.selectOption('2');
    await page.clock.runFor(1000);
    await expect(slider).toHaveValue('0');
    await expect(play).toHaveAttribute('aria-pressed', 'false');

    await play.click();
    await page.clock.runFor(249);
    await expect(slider).toHaveValue('0');
    await page.clock.runFor(1);
    await expect(slider).toHaveValue('1');
    await speed.selectOption('4');
    await expect(slider).toHaveValue('1');
    await expect(play).toHaveAttribute('aria-pressed', 'true');
    await page.clock.runFor(124);
    await expect(slider).toHaveValue('1');
    await page.clock.runFor(1);
    await expect(slider).toHaveValue('2');

    await play.click();
    await speed.selectOption('0.5');
    await page.clock.runFor(2000);
    await expect(slider).toHaveValue('2');
    await play.click();
    await page.clock.runFor(999);
    await expect(slider).toHaveValue('2');
    await page.clock.runFor(1);
    await expect(slider).toHaveValue('3');
    await expect(page.locator('#currentDate')).toHaveText('Jan 4, 2020');
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(play).toHaveAttribute('aria-pressed', 'false');
    await page.clock.runFor(2000);
    await expect(slider).toHaveValue('4');

    await page.setViewportSize({ width: 320, height: 844 });
    await expect(speed).toBeVisible();
    await expect(slider).toBeVisible();
    expect((await slider.boundingBox()).width).toBeGreaterThan(50);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
});
