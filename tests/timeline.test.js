import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

function harness(t, { value = 0, max = 20 } = {}) {
    const dom = new JSDOM(`<!doctype html><body>
        <button id="playTimelineBtn" aria-label="Play timeline" aria-pressed="false">▶</button>
        <select id="timelineSpeed" aria-label="Timeline playback speed">
            <option value="0.5">0.5×</option><option value="1" selected>1×</option>
            <option value="2">2×</option><option value="4">4×</option>
        </select>
        <input id="dateSlider" type="range" min="0" max="${max}" value="${value}">
    </body>`, { runScripts: 'outside-only', pretendToBeVisual: true });
    t.after(() => dom.window.close());
    const { window } = dom, { document } = window;
    const intervals = new Map();
    let now = 0, nextId = 1, inputCount = 0;
    window.setInterval = (callback, delay) => {
        const id = nextId++;
        intervals.set(id, { callback, delay, next: now + delay });
        return id;
    };
    window.clearInterval = id => intervals.delete(id);
    const clock = {
        get active() { return intervals.size; },
        tick(duration) {
            const target = now + duration;
            let ticks = 0;
            for (;;) {
                const next = [...intervals.values()].sort((a, b) => a.next - b.next)[0];
                if (!next || next.next > target) break;
                assert.ok(++ticks <= 10000, `Invalid fake interval at ${now}ms: ${JSON.stringify(next)}`);
                now = next.next;
                next.next += next.delay;
                next.callback();
            }
            now = target;
        }
    };
    window.dataService = { currentDataset: 'epidem', availableDates: Array.from({ length: max + 1 }, (_, index) => String(index)) };
    const slider = document.getElementById('dateSlider');
    const sliderListeners = [];
    const listen = slider.addEventListener.bind(slider);
    slider.addEventListener = (type, listener, options) => {
        if (type === 'input') sliderListeners.push(listener);
        listen(type, listener, options);
    };
    vm.runInContext(readFileSync(new URL('../src/ui/uiUtils.js', import.meta.url), 'utf8'), dom.getInternalVMContext());
    window.initializeUI();
    listen('input', () => inputCount++);
    const button = document.getElementById('playTimelineBtn'), speed = document.getElementById('timelineSpeed');
    return { window, document, slider, button, speed, clock,
        get inputs() { return inputCount; },
        setSpeed(value) { speed.value = String(value); speed.dispatchEvent(new window.Event('change')); },
        manualInput() { sliderListeners.forEach(listener => listener({ isTrusted: true })); }
    };
}

test('timeline speeds advance one reporting date at the selected rate without starting while paused', t => {
    for (const [speed, interval] of [[0.5, 1000], [1, 500], [2, 250], [4, 125]]) {
        const h = harness(t);
        h.setSpeed(speed);
        assert.equal(h.clock.active, 0);
        assert.equal(h.button.getAttribute('aria-pressed'), 'false');
        h.clock.tick(2000);
        assert.equal(h.slider.value, '0');
        h.button.click();
        assert.equal(h.clock.active, 1);
        assert.equal(h.button.getAttribute('aria-label'), 'Pause timeline');
        h.clock.tick(interval - 1);
        assert.equal(h.slider.value, '0');
        h.clock.tick(1);
        assert.equal(h.slider.value, '1');
        h.clock.tick(interval * 2);
        assert.equal(h.slider.value, '3');
        h.button.click();
        assert.equal(h.clock.active, 0);
        h.clock.tick(interval * 2);
        assert.equal(h.slider.value, '3');
    }
});

test('changing playback speed replaces the pending timer without advancing or resetting the date', t => {
    const h = harness(t, { value: 6 });
    h.button.click();
    h.clock.tick(300);
    const inputs = h.inputs;
    h.setSpeed(2);
    assert.equal(h.slider.value, '6');
    assert.equal(h.inputs, inputs);
    assert.equal(h.clock.active, 1);
    h.clock.tick(200);
    assert.equal(h.slider.value, '6', 'the original 500ms timer was cancelled');
    h.clock.tick(50);
    assert.equal(h.slider.value, '7');
    for (const speed of [4, 0.5, 2, 1, 4]) h.setSpeed(speed);
    assert.equal(h.clock.active, 1, 'repeated speed changes keep one active timer');
    assert.equal(h.slider.value, '7');
    h.clock.tick(125);
    assert.equal(h.slider.value, '8');
});

test('playback stops at the last date and restarts from the first date at the chosen speed', t => {
    const h = harness(t, { value: 2, max: 3 });
    h.setSpeed(4);
    h.button.click();
    h.clock.tick(125);
    assert.equal(h.slider.value, '3');
    assert.equal(h.clock.active, 0);
    assert.equal(h.button.getAttribute('aria-label'), 'Play timeline');
    assert.equal(h.button.getAttribute('aria-pressed'), 'false');
    h.clock.tick(1000);
    assert.equal(h.slider.value, '3');
    h.button.click();
    assert.equal(h.slider.value, '0');
    h.clock.tick(124);
    assert.equal(h.slider.value, '0');
    h.clock.tick(1);
    assert.equal(h.slider.value, '1');
    assert.equal(h.speed.value, '4');
});

test('manual input and hidden pages still pause playback, and speed changes keep it paused', t => {
    const h = harness(t);
    h.button.click();
    h.slider.value = '8';
    h.manualInput();
    assert.equal(h.clock.active, 0);
    assert.equal(h.button.getAttribute('aria-pressed'), 'false');
    h.setSpeed(4);
    h.clock.tick(1000);
    assert.equal(h.slider.value, '8');
    assert.equal(h.clock.active, 0);
    h.button.click();
    Object.defineProperty(h.document, 'hidden', { configurable: true, value: true });
    h.document.dispatchEvent(new h.window.Event('visibilitychange'));
    assert.equal(h.clock.active, 0);
    h.setSpeed(0.5);
    h.clock.tick(2000);
    assert.equal(h.slider.value, '8');
    assert.equal(h.button.getAttribute('aria-label'), 'Play timeline');
});

test('invalid speed values fall back to the normal rate and repeated initialization adds no handlers', t => {
    const h = harness(t);
    h.window.initializeUI();
    h.window.initializeUI();
    h.setSpeed(4);
    h.setSpeed(100);
    assert.equal(h.speed.value, '1');
    h.button.click();
    assert.equal(h.clock.active, 1);
    h.clock.tick(499);
    assert.equal(h.slider.value, '0');
    h.clock.tick(1);
    assert.equal(h.slider.value, '1');
    h.setSpeed(-2);
    assert.equal(h.speed.value, '1');
    assert.equal(h.clock.active, 1);
    h.clock.tick(500);
    assert.equal(h.slider.value, '2');
});
