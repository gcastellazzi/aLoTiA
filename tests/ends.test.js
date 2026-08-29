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
import { blocksBetween, weighBlocks, centroidsOf } from '../docs/app/js/core/trace.js';
import { circularRing } from '../docs/app/js/core/blocks.js';
import { findHinges } from '../docs/app/js/core/mechanism.js';
import {
  forcePolygon, funicular, poleForEnds, jointCrossings,
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

// ------------------------------------- an imposed end that misses the joint --

test('a line imposed inside the arch never reaches the springing joints', () => {
  // THE REPORT. Imposing both ends on interior joints of the circular arch left
  // the first and last joints uncrossed, so the mechanism analysis had no
  // support to hinge about and answered "no support hinges located" -- a true
  // statement that explains nothing. The cause is geometric and belongs here:
  // `funicular` starts AT the imposed point, so a point inside the arch leaves
  // the springing joint on the far side of where the line begins.
  const { blocks, joints } = circularRing({
    centre: [0, 0], innerRadius: 4, outerRadius: 4.6,
    startAngle: 0, endAngle: 180, count: 16,
  });
  const weights = weighBlocks(blocks, { specificWeight: 20, thickness: 1 });
  const centroids = centroidsOf(blocks);
  const total = weights.reduce((a, b) => a + b, 0);
  const fp = forcePolygon(weights, [total * 0.2, -total / 2]);
  const mid = (j) => [(j.a[0] + j.b[0]) / 2, (j.a[1] + j.b[1]) / 2];

  // Imposed at the springings: both end joints are crossed.
  const onEnds = funicular(fp, centroids, mid(joints[joints.length - 1]), mid(joints[0]));
  const c1 = jointCrossings(onEnds.points, joints);
  assert.ok(c1[0], 'the first joint is not crossed with the ends on the springings');
  assert.ok(c1[c1.length - 1], 'the last joint is not crossed either');

  // Imposed three joints in: the springings are out of reach, and the software
  // must say so rather than report a mechanism it cannot see.
  const inside = funicular(fp, centroids, mid(joints[joints.length - 4]), mid(joints[3]));
  const c2 = jointCrossings(inside.points, joints);
  // Not reached means: either never crossed at all, or crossed only where the
  // joint's infinite line runs, far outside the masonry. Both occur -- the
  // first on the arch that was reported, the second here -- and both must
  // count as "no support located" rather than as a hinge at s = -2.3.
  const reached = (c) => !!c && c.inside;
  assert.equal(reached(c2[0]), false, 'the first joint should be out of reach');
  assert.equal(reached(c2[c2.length - 1]), false, 'so should the last');
  assert.ok(reached(c1[0]) && reached(c1[c1.length - 1]),
    'imposed at the springings, both ends must be genuinely crossed');
});

// ------------------------------- which blocks the imposed ends leave behind --

import { betweenEnds, blocksLike } from '../docs/app/js/core/blocks.js';

/** The reference ring, as a sorted sequence. */
function ringSeq() {
  const { blocks, joints } = circularRing({
    centre: [0, 0], innerRadius: 4, outerRadius: 4.6,
    startAngle: 0, endAngle: 180, count: 16,
  });
  const seq = blocksLike({
    centroids: centroidsOf(blocks),
    weights: weighBlocks(blocks, { specificWeight: 20, thickness: 1 }),
    areas: blocks.map(() => 0),
    thickness: blocks.map(() => 0),
  });
  return { blocks, joints, seq };
}

test('an end moved past a centroid drops that block, and only that block', () => {
  const { joints, seq } = ringSeq();
  const mid = (j) => [(j.a[0] + j.b[0]) / 2, (j.a[1] + j.b[1]) / 2];
  const A = mid(joints[joints.length - 1]);          // the left end
  const B = mid(joints[0]);                          // the right end
  const n = seq.centroids.length;
  const right = seq.centroids.reduce((a, b) => (b[0] > a[0] ? b : a));
  const left = seq.centroids.reduce((a, b) => (b[0] < a[0] ? b : a));

  assert.equal(betweenEnds(seq, A, B).kept.length, n, 'on the springings, all');

  // Moved INWARD past the nearest centroid: that block is no longer between
  // the two points the line runs between.
  assert.equal(betweenEnds(seq, A, [right[0] - 0.05, B[1]]).kept.length, n - 1);
  assert.equal(betweenEnds(seq, [left[0] + 0.05, A[1]], B).kept.length, n - 1);

  // RAISED above it does the same: near a springing the ring is steep, so a
  // point moved up the face passes centroids without moving in x at all.
  assert.equal(betweenEnds(seq, A, [B[0], right[1] + 0.05]).kept.length, n - 1);
});

test('raising one end does not touch the block at the other', () => {
  // Tested against both ends' heights, lifting B dropped the block at A as
  // well: on a symmetric ring the two centroids sit at the same height, so
  // moving one point silently changed the far abutment.
  const { joints, seq } = ringSeq();
  const mid = (j) => [(j.a[0] + j.b[0]) / 2, (j.a[1] + j.b[1]) / 2];
  const A = mid(joints[joints.length - 1]);
  const B = mid(joints[0]);
  const right = seq.centroids.reduce((a, b) => (b[0] > a[0] ? b : a));
  const kept = betweenEnds(seq, A, [B[0], right[1] + 0.05]).kept;
  const n = seq.centroids.length;
  assert.equal(kept.length, n - 1);
  assert.equal(kept[kept.length - 1], n - 1, 'the block at A must survive');
});

test('imposed ends become the support hinges, wherever they are', () => {
  // A and B are fixed hinges throughout, at the points the user placed, not at
  // the end joints. Without this the chain is not closed and the kinematics
  // has nothing to turn about.
  const { blocks, joints, seq } = ringSeq();
  const total = seq.weights.reduce((a, b) => a + b, 0);
  const fp = forcePolygon(seq.weights, [total * 0.2, -total / 2]);
  const mid = (j) => [(j.a[0] + j.b[0]) / 2, (j.a[1] + j.b[1]) / 2];
  const lot = funicular(fp, seq.centroids, mid(joints[0]), mid(joints[joints.length - 1]));
  const crossings = jointCrossings(lot.points, joints);

  const A = [-3.9, 0.6];
  const B = [3.9, 0.6];
  const hinges = findHinges(crossings, joints, undefined, { A, B });
  const supports = hinges.filter((h) => h.support);
  assert.equal(supports.length, 2, 'both supports must be present');
  assert.deepEqual(supports[0].point, B);
  assert.deepEqual(supports[1].point, A);
});
