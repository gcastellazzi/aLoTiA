/**
 * Tests for imposing both ends of the line of thrust.
 *
 * The classical construction is a trial pole and a correction. What has to be
 * shown is that the correction is EXACT -- that the answer does not depend on
 * the trial, and that the line really arrives at B -- because if it were only
 * approximate the drawing would be teaching something false.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { centroid } from '../docs/app/js/core/geometry.js';
import { blocksBetween, weighBlocks } from '../docs/app/js/core/trace.js';
import {
  forcePolygon, funicular, poleForEnds,
} from '../docs/app/js/core/statics.js';

function arc(r, n = 200) {
  return Array.from({ length: n }, (_, i) => {
    const t = (Math.PI * i) / (n - 1);
    return [-r * Math.cos(t), r * Math.sin(t)];
  });
}

/** A ring, weighed and ordered as the application orders it. */
function ring(ri = 4, ro = 5, n = 12) {
  const { blocks, joints } = blocksBetween(arc(ri), arc(ro), n);
  const weights = weighBlocks(blocks, { specificWeight: 20, thickness: 1 });
  const centroids = blocks.map(centroid);
  const order = centroids
    .map((c, i) => [c[0], i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  const w = order.map((i) => weights[i]);
  return {
    joints,
    w,
    g: order.map((i) => centroids[i]),
    total: w.reduce((a, b) => a + b, 0),
  };
}

// A and B deliberately asymmetric, off the joints and at different heights:
// the symmetric case would hide a sign error.
const A = [4.6, 0.3];
const B = [-4.55, -0.2];

test('the line arrives at B, to machine precision', () => {
  const r = ring();
  for (const f of [0.12, 0.2, 0.35, 0.6]) {
    const got = poleForEnds(r.w, r.g, A, B, r.total * f);
    assert.ok(got, `no pole at H/W = ${f}`);
    assert.ok(got.closureError < 1e-9,
      `H/W = ${f}: missed B by ${got.closureError}`);

    // And independently: rebuild the line from the returned pole.
    const lot = funicular(forcePolygon(r.w, got.pole), r.g, A, B);
    const end = lot.points[lot.points.length - 1];
    assert.ok(Math.hypot(end[0] - B[0], end[1] - B[1]) < 1e-9);
    assert.deepEqual(lot.points[0], A, 'and it starts at A');
  }
});

test('the answer does not depend on the trial pole', () => {
  // THE assertion that says this is a correction and not a search: three very
  // different trials, one answer.
  const r = ring();
  const H = r.total * 0.22;
  const poles = [-r.total * 0.05, -r.total * 0.5, -r.total * 3, 0, r.total]
    .map((y) => poleForEnds(r.w, r.g, A, B, H, y).pole[1]);

  for (const y of poles) {
    assert.ok(Math.abs(y - poles[0]) < 1e-9,
      `trial poles disagree: ${poles.join(', ')}`);
  }
});

test('the closure law has the slope the geometry demands', () => {
  // d(y_end)/d(yO) = (x_B - x_A) / xO, and nothing else.
  const r = ring();
  for (const f of [0.15, 0.3]) {
    const H = r.total * f;
    const got = poleForEnds(r.w, r.g, A, B, H);
    assert.ok(Math.abs(got.slope - (B[0] - A[0]) / H) < 1e-12);

    // Measured, not just declared: move the ordinate and see the end move.
    const at = (y) => {
      const lot = funicular(forcePolygon(r.w, [H, y]), r.g, A, B);
      return lot.points[lot.points.length - 1][1];
    };
    const measured = (at(-r.total * 0.9) - at(-r.total * 0.2))
      / (-r.total * 0.9 + r.total * 0.2);
    assert.ok(Math.abs(measured - got.slope) / Math.abs(got.slope) < 1e-9,
      `measured ${measured}, declared ${got.slope}`);
  }
});

test('the trial polygon is returned, so the construction can be drawn', () => {
  const r = ring();
  const got = poleForEnds(r.w, r.g, A, B, r.total * 0.25, -r.total * 0.15);
  assert.deepEqual(got.trial, [r.total * 0.25, -r.total * 0.15]);
  assert.ok(got.preliminary.points.length > 2);
  assert.deepEqual(got.preliminary.points[0], A, 'the trial starts at A too');

  // It is a TRIAL: it must miss B, or there would be nothing to correct.
  const missed = got.preliminary.points[got.preliminary.points.length - 1];
  assert.ok(Math.hypot(missed[0] - B[0], missed[1] - B[1]) > 1e-6);
  // And the correction must have moved the pole.
  assert.ok(Math.abs(got.pole[1] - got.trial[1]) > 1e-6);
  assert.equal(got.pole[0], got.trial[0], 'the thrust is not what changes');
});

test('a degenerate request is refused rather than answered wrongly', () => {
  const r = ring();
  assert.equal(poleForEnds(r.w, r.g, A, B, 0), null, 'no thrust, no pole');
  assert.equal(poleForEnds(r.w, r.g, A, [A[0], -3], r.total * 0.2), null,
    'A and B on one vertical determine nothing');
});

test('raising B raises the far end of the line by the same amount', () => {
  // A property with an obvious meaning: the construction really is placing
  // the end where it is told.
  const r = ring();
  const H = r.total * 0.25;
  for (const dy of [0.4, -0.9]) {
    const moved = [B[0], B[1] + dy];
    const got = poleForEnds(r.w, r.g, A, moved, H);
    const lot = funicular(forcePolygon(r.w, got.pole), r.g, A, moved);
    const end = lot.points[lot.points.length - 1];
    assert.ok(Math.abs(end[1] - (B[1] + dy)) < 1e-9);
  }
});
