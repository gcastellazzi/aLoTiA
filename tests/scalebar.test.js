/**
 * Tests for the chequered scale bar.
 *
 * The drawing is paint; what can be wrong is the NUMBER. A bar is worth having
 * only if the value on it is round, is the same value the axis ticks would
 * choose, and comes out at a size the eye can measure against. Those three are
 * what is checked here, without a canvas.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { niceLength, barSpan, barLabel } from '../docs/app/js/render/scalebar.js';
import { niceTicks } from '../docs/app/js/render/axes.js';

test('the ladder rounds down to 1, 2 or 5 times a power of ten', () => {
  const cases = [
    [0.7, 0.5], [1, 1], [1.9, 1], [2, 2], [4.9, 2], [5, 5], [9.9, 5],
    [13, 10], [240, 200], [0.0031, 0.002], [7.1e6, 5e6],
  ];
  for (const [raw, want] of cases) {
    const got = niceLength(raw);
    assert.ok(Math.abs(got - want) < want * 1e-12,
      `niceLength(${raw}) = ${got}, expected ${want}`);
    assert.ok(got <= raw, `${got} is not below ${raw}`);
  }
});

test('nothing round comes of nothing', () => {
  for (const bad of [0, -1, NaN, Infinity, null, undefined]) {
    assert.equal(niceLength(bad), null, String(bad));
  }
});

test('the bar keeps a usable size however far the view is zoomed', () => {
  // Six decades of zoom, on a box of a size the application actually uses.
  const boxW = 520;
  for (let e = -3; e <= 3; e++) {
    const upp = Math.pow(10, e) / boxW;      // the whole box spans 10^e
    const got = barSpan(upp, boxW);
    assert.ok(got, `no bar at 10^${e} across the box`);
    assert.ok(got.widthPx > 24 && got.widthPx < boxW * 0.8,
      `at 10^${e} the bar is ${got.widthPx}px of ${boxW}`);
    // And it really is that many units long.
    assert.ok(Math.abs(got.widthPx * upp - got.span) < got.span * 1e-9);
  }
});

test('the bar and the axis ticks agree, because they share the ladder', () => {
  // A bar labelled 5 m beside ticks every 2 m would be two answers to one
  // question. Both come off the 1-2-5 ladder, so the bar is always a whole
  // number of tick steps or a simple fraction of one.
  const boxW = 520;
  for (const span of [1, 3.7, 12, 480, 0.045]) {
    const upp = span / boxW;
    const got = barSpan(upp, boxW);
    if (!got) continue;
    const ticks = niceTicks(0, span);
    const step = Math.abs(ticks[1] - ticks[0]);
    const ratio = got.span / step;
    const near = Math.abs(ratio - Math.round(ratio)) < 1e-9
      || Math.abs(1 / ratio - Math.round(1 / ratio)) < 1e-9;
    assert.ok(near, `bar ${got.span} against tick step ${step}: ratio ${ratio}`);
  }
});

test('a box too small, or a scale that is not a number, draws nothing', () => {
  assert.equal(barSpan(0, 500), null);
  assert.equal(barSpan(NaN, 500), null);
  assert.equal(barSpan(1, 0), null);
  // A box narrower than the smallest legible bar.
  assert.equal(barSpan(1, 20), null);
});

test('the label carries the unit and no spurious digits', () => {
  assert.equal(barLabel(5, 'm'), '5 m');
  assert.equal(barLabel(200, 'px'), '200 px');
  assert.equal(barLabel(0.5, 'm'), '0.5 m');
  assert.equal(barLabel(2000000, 'N'), '2.0e+6 N');
  assert.equal(barLabel(0.00005, 'kN'), '5.0e-5 kN');
  // No unit is a legitimate state: the arch has not been scaled.
  assert.equal(barLabel(50), '50');
});

test('the sign of the scale does not matter', () => {
  // An axis may run the other way; the bar is a length either way.
  const a = barSpan(0.05, 500);
  const b = barSpan(-0.05, 500);
  assert.deepEqual(a, b);
});
