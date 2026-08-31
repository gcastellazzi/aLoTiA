/**
 * Tests for turning a traced outline into voussoirs.
 *
 *     npm test
 *
 * The reference case is a semicircular ring traced as two arcs: it has an
 * exact area and exact centroids, so the generated blocks can be checked
 * against arithmetic rather than against a previous run.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { area, centroid } from '../docs/app/js/core/geometry.js';
import {
  arcLengths, length, resample, reverse, sameDirection, blocksBetween,
  checkTrace, weighBlocks, springings,
} from '../docs/app/js/core/trace.js';
import { forcePolygon, funicular } from '../docs/app/js/core/statics.js';

/** A semicircular arc from angle 0 to pi, sampled finely. */
function arc(r, n = 400, cx = 0, cy = 0) {
  return Array.from({ length: n }, (_, i) => {
    const t = (Math.PI * i) / (n - 1);
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  });
}

test('arc length of a straight line is its length', () => {
  const s = arcLengths([[0, 0], [3, 4], [3, 8]]);
  assert.deepEqual(s, [0, 5, 9]);
  assert.equal(length([[0, 0], [3, 4], [3, 8]]), 9);
});

test('resampling keeps the ends and spaces the rest equally', () => {
  const pts = resample([[0, 0], [10, 0]], 5);
  assert.deepEqual(pts[0], [0, 0]);
  assert.deepEqual(pts[4], [10, 0]);
  assert.deepEqual(pts[2], [5, 0]);
});

test('resampling spaces by arc length, not by x', () => {
  // On a semicircle, equal spacing in x would crowd the crown; equal spacing
  // in arc length puts the middle sample exactly at the top.
  const pts = resample(arc(1), 3);
  assert.ok(Math.abs(pts[1][0]) < 1e-6, `crown at x=${pts[1][0]}`);
  assert.ok(Math.abs(pts[1][1] - 1) < 1e-4, `crown at y=${pts[1][1]}`);
});

test('a reversed extrados is detected and put right', () => {
  const inner = arc(4);
  const outer = arc(5);
  assert.equal(sameDirection(inner, outer), true);
  assert.equal(sameDirection(inner, reverse(outer)), false);

  const good = blocksBetween(inner, outer, 8);
  const bad = blocksBetween(inner, reverse(outer), 8);
  assert.equal(good.flipped, false);
  assert.equal(bad.flipped, true);
  // Having been put right, the two agree block for block.
  good.blocks.forEach((p, k) => {
    assert.ok(Math.abs(area(p) - area(bad.blocks[k])) < 1e-9,
      `block ${k}: ${area(p)} vs ${area(bad.blocks[k])}`);
  });
});

test('the blocks tile the ring: their areas sum to the ring area', () => {
  const ri = 4;
  const ro = 5;
  const { blocks } = blocksBetween(arc(ri), arc(ro), 24);
  const total = blocks.reduce((s, p) => s + area(p), 0);
  const exact = (Math.PI / 2) * (ro * ro - ri * ri);
  // The blocks are straight-sided and inscribed, so they fall a little short;
  // with 24 of them the deficit is well under a per cent.
  assert.ok(total < exact, 'inscribed blocks cannot exceed the ring');
  assert.ok((exact - total) / exact < 0.01,
    `deficit ${(100 * (exact - total)) / exact}%`);
});

test('refining the subdivision converges on the exact ring area', () => {
  const exact = (Math.PI / 2) * (25 - 16);
  const err = (n) => {
    const { blocks } = blocksBetween(arc(4), arc(5), n);
    return exact - blocks.reduce((s, p) => s + area(p), 0);
  };
  const e10 = err(10);
  const e40 = err(40);
  assert.ok(e40 < e10 / 10, `10 blocks: ${e10}, 40 blocks: ${e40}`);
});

test('blocks come out in counter-clockwise order, so areas are positive', () => {
  const { blocks } = blocksBetween(arc(4), arc(5), 12);
  for (const p of blocks) assert.ok(area(p) > 0);
});

test('there is one more joint than there are blocks', () => {
  const { blocks, joints } = blocksBetween(arc(4), arc(5), 15);
  assert.equal(blocks.length, 15);
  assert.equal(joints.length, 16);
});

test('a bad trace is reported rather than silently drawn', () => {
  assert.ok(checkTrace([[0, 0]], arc(5), 6).length, 'too few points');
  // Two coincident curves: no masonry at all.
  assert.ok(checkTrace(arc(4), arc(4), 6).some((s) => /coincide/.test(s)));
  // A sound trace has nothing to say.
  assert.deepEqual(checkTrace(arc(4), arc(5), 6), []);
});

test('crossing curves are caught', () => {
  // An extrados that dives inside the intrados over part of its length.
  const inner = arc(4);
  const outer = arc(5).map(([x, y], i) => (i > 200 ? [x * 0.6, y * 0.6] : [x, y]));
  const problems = checkTrace(inner, outer, 12);
  assert.ok(problems.length, 'a crossing trace must be reported');
});

test('the springings are the mid-points of the end joints, B to the right', () => {
  const { joints } = blocksBetween(arc(4), arc(5), 10);
  const { pointA, pointB } = springings(joints);
  assert.ok(pointB[0] > pointA[0], 'B must be the right-hand springing');
  assert.ok(Math.abs(Math.abs(pointB[0]) - 4.5) < 1e-6, `B at x=${pointB[0]}`);
  assert.ok(Math.abs(pointB[1]) < 1e-6, `B at y=${pointB[1]}`);
});

test('a traced arch runs the whole way to a thrust line', () => {
  // The point of the module: trace, weigh, and the existing statics takes over.
  const { blocks, joints } = blocksBetween(arc(4), arc(5), 12);
  const weights = weighBlocks(blocks, { specificWeight: 20, thickness: 1 });
  const centroids = blocks.map(centroid);
  const { pointA, pointB } = springings(joints);

  const order = centroids
    .map((c, i) => [c[0], i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  const w = order.map((i) => weights[i]);
  const g = order.map((i) => centroids[i]);

  const total = w.reduce((s, v) => s + v, 0);
  const fp = forcePolygon(w, [total / 4, -total / 2]);
  const lot = funicular(fp, g, pointB, pointA);

  assert.equal(lot.points.length, blocks.length + 2);
  assert.ok(lot.points.every((p) => p.every(Number.isFinite)));
  // By symmetry the crown of the thrust line sits over the crown of the arch.
  const xs = lot.points.map((p) => p[0]);
  assert.ok(Math.abs(Math.min(...xs) + Math.max(...xs)) < 1e-6,
    'a symmetric arch must give a symmetric thrust line');
});

test('a symmetric arch gives symmetric weights', () => {
  const { blocks } = blocksBetween(arc(4), arc(5), 10);
  const w = weighBlocks(blocks);
  for (let i = 0; i < w.length / 2; i++) {
    assert.ok(Math.abs(w[i] - w[w.length - 1 - i]) < 1e-9,
      `block ${i} against its mirror`);
  }
});

// ------------------------------------------------------- applied forces --

import { blocksLike, circularRingThroughPoints } from '../docs/app/js/core/blocks.js';

test('a circular arch can be defined by three intrados and three extrados points', () => {
  const got = circularRingThroughPoints({
    inner: [[4, 0], [0, 4], [-4, 0]],
    outer: [[5, 0], [0, 5], [-5, 0]],
    count: 8,
  });
  assert.equal(got.blocks.length, 8);
  assert.equal(got.joints.length, 9);
  for (const j of got.joints) {
    assert.ok(Math.abs(Math.hypot(j.a[0], j.a[1]) - 4) < 1e-10);
    assert.ok(Math.abs(Math.hypot(j.b[0], j.b[1]) - 5) < 1e-10);
  }
});

/** A three-block arch, weights 1, 2, 3, centroids at x = 1, 2, 3. */
function threeBlocks() {
  return {
    centroids: [[1, 0], [2, 0], [3, 0]],
    weights: [1, 2, 3],
    areas: [10, 20, 30],
    thickness: [1, 1, 1],
  };
}

test('with no forces, blocksLike is just the blocks in descending x', () => {
  const m = blocksLike(threeBlocks());
  assert.deepEqual(m.weights, [3, 2, 1]);
  assert.deepEqual(m.kind, [0, 0, 0]);
  assert.deepEqual(m.order, [2, 1, 0]);
});

test('a force is merged into the sequence at its own station', () => {
  const m = blocksLike(threeBlocks(), {
    points: [[2.5, 4]], magnitudes: [7],
  });
  // Descending x: 3, 2.5 (the force), 2, 1.
  assert.deepEqual(m.weights, [3, 7, 2, 1]);
  assert.deepEqual(m.kind, [0, 1, 0, 0]);
  assert.deepEqual(m.centroids[1], [2.5, 4]);
});

test('a force carries no area and no thickness', () => {
  const m = blocksLike(threeBlocks(), { points: [[2.5, 4]], magnitudes: [7] });
  assert.equal(m.areas[1], 0);
  assert.equal(m.thickness[1], 0);
});

test('several forces interleave correctly, whatever order they were added', () => {
  const a = blocksLike(threeBlocks(), {
    points: [[0.5, 0], [2.5, 0]], magnitudes: [9, 7],
  });
  const b = blocksLike(threeBlocks(), {
    points: [[2.5, 0], [0.5, 0]], magnitudes: [7, 9],
  });
  assert.deepEqual(a.weights, [3, 7, 2, 1, 9]);
  assert.deepEqual(a.weights, b.weights);
  assert.deepEqual(a.kind, b.kind);
});

test('a force at the same x as a block does not lose either of them', () => {
  const m = blocksLike(threeBlocks(), { points: [[2, 5]], magnitudes: [4] });
  assert.equal(m.weights.length, 4);
  assert.equal(m.weights.reduce((s, v) => s + v, 0), 1 + 2 + 3 + 4);
});

test('an arch with a point load reaches a thrust line, and it is heavier', () => {
  const { blocks, joints } = blocksBetween(arc(4), arc(5), 10);
  const base = {
    centroids: blocks.map(centroid),
    weights: weighBlocks(blocks),
    areas: blocks.map(area),
    thickness: blocks.map(() => 1),
  };
  const { pointA, pointB } = springings(joints);

  const bare = blocksLike(base);
  const laden = blocksLike(base, { points: [[0, 5]], magnitudes: [500] });

  const run = (m) => {
    const total = m.weights.reduce((s, v) => s + v, 0);
    const fp = forcePolygon(m.weights, [total / 4, -total / 2]);
    return funicular(fp, m.centroids, pointB, pointA);
  };
  const l1 = run(bare);
  const l2 = run(laden);

  // One more station means one more vertex on the thrust line.
  assert.equal(l2.points.length, l1.points.length + 1);
  assert.ok(l2.points.every((p) => p.every(Number.isFinite)));
  assert.ok(laden.weights.reduce((s, v) => s + v, 0)
    > bare.weights.reduce((s, v) => s + v, 0) + 499);
});
