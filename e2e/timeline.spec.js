import { test, expect } from '@playwright/test';

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
