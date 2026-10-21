import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

function control(t, dates = ['2020-01-01', '2020-01-02', '2020-01-03'], range) {
    const dom = new JSDOM('<div id="control"></div>', { runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    vm.runInContext(readFileSync(new URL('../ui/dateRange.js', import.meta.url), 'utf8'), dom.getInternalVMContext());
    const changes = [];
    const instance = new dom.window.DateRangeControl(dom.window.document.getElementById('control'), {
        dates, range, onChange: (value, selected) => changes.push({ value, selected })
    });
    return { window: dom.window, document: dom.window.document, instance, changes };
}

test('range handles cannot cross and expose exact dates to keyboard users', t => {
    const { instance, window } = control(t);
    instance.inputs.end.value = '1'; instance.inputs.end.dispatchEvent(new window.Event('change'));
    instance.inputs.start.value = '2'; instance.inputs.start.dispatchEvent(new window.Event('input'));
    assert.equal(instance.inputs.start.value, '1'); assert.equal(instance.inputs.end.value, '1');
    assert.equal(instance.inputs.start.getAttribute('aria-valuetext'), '2020-01-02');
    assert.equal(instance.inputs.start.getAttribute('aria-valuemax'), '1');
    assert.equal(instance.inputs.end.getAttribute('aria-valuemin'), '1');
    assert.equal(instance.dateInputs.start.max, '2020-01-02');
    assert.equal(instance.selection.textContent, '2020-01-02');
});

test('date fields snap unobserved boundary dates visibly and keep valid percentage endpoints', t => {
    const { instance, window, changes } = control(t, ['2020-01-01', '2020-01-05', '2020-01-10']);
    instance.dateInputs.start.value = '2020-01-04'; instance.dateInputs.start.dispatchEvent(new window.Event('change'));
    assert.equal(instance.dateInputs.start.value, '2020-01-05');
    assert.equal(instance.selection.textContent, '2020-01-05 – 2020-01-10');
    assert.match(instance.status.textContent, /nearest available date/);
    assert.equal(changes.at(-1).value.start, 50);
    assert.equal(changes.at(-1).selected.start, '2020-01-05');
    instance.dateInputs.end.value = '2019-12-01'; instance.dateInputs.end.dispatchEvent(new window.Event('change'));
    assert.equal(instance.dateInputs.end.value, '2020-01-05');
    assert.equal(instance.highlight.style.width, '0%');
});

test('one-date and empty periods remain explicit and disable inapplicable handles', t => {
    const one = control(t, ['2020-01-01']).instance;
    assert.equal(one.inputs.start.disabled, true); assert.equal(one.inputs.end.disabled, true);
    assert.equal(one.dateInputs.start.disabled, false); assert.equal(one.selection.textContent, '2020-01-01');
    const empty = control(t, []).instance;
    assert.equal(empty.inputs.start.disabled, true); assert.equal(empty.dateInputs.start.disabled, true);
    assert.equal(empty.selection.textContent, 'No observations');
});
