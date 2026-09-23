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

import { area, centroid, signedArea } from '../docs/app/js/core/geometry.js';
import {
  arcLengths, length, resample, reverse, sameDirection, blocksBetween,
  checkTrace, weighBlocks, springings, curveFrame, normalCuts, normalCutsPreview,
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

test('local normals can be evaluated on the extrados and on the mean line', () => {
  const quarter = (r) => arc(r).slice(0, 101);
  const outer = normalCuts(quarter(4), quarter(5), 8, 'normal-outer');
  const middle = normalCuts(quarter(4), quarter(5), 8, 'normal-midline');
  for (const rows of [outer, middle]) {
    rows.slice(1, -1).forEach((j) => {
      const radial = j.normal[0] * j.b[1] - j.normal[1] * j.b[0];
      assert.ok(Math.abs(radial) < 0.03, `normal ${j.normal} is radial at ${j.b}`);
    });
  }
  const frame = curveFrame([[0, 0], [2, 0]], 0.5);
  assert.deepEqual(frame.tangent, [1, 0]);
  assert.deepEqual(frame.normal, [0, 1]);
});

test('joint normals point from the intrados to the extrados on both haunches', () => {
  for (const mode of ['normal-outer', 'normal-midline']) {
    for (const outer of [arc(5), arc(5).reverse()]) {
      const { frames, reference } = normalCutsPreview(arc(4), outer, 10, mode);
      assert.ok(reference.length >= 2, `${mode} exposes its reference curve`);
      frames.forEach((f) => {
        // Outward on a ring centred on the origin: along the position vector.
        assert.ok(f.normal[0] * f.point[0] + f.normal[1] * f.point[1] > 0,
          `${mode} normal ${f.normal} at ${f.point} points outwards`);
      });
      frames.filter((f) => Math.abs(f.point[0]) > 1).forEach((f) => {
        assert.equal(Math.sign(f.normal[0]), Math.sign(f.point[0]),
          'left on the left haunch, right on the right one');
      });
    }
  }
  // The mean line lies between the curves, not on either of them.
  const { reference } = normalCutsPreview(arc(4), arc(5), 6, 'normal-midline');
  reference.forEach((p) => assert.ok(Math.abs(Math.hypot(p[0], p[1]) - 4.5) < 0.01));
});

test('normal cuts never take a crossing behind the previous joint', () => {
  // A coarse hand trace in pixels. The nearest crossing of each infinite
  // extrados normal used to fall back behind the previous cut on this one,
  // and blocks came out inside out with no error at all.
  const inner = [[-304, 3], [163, 254], [248, 166], [249, 158], [301, 19], [303, 0]];
  const outer = [[-440, -3], [-419, 127], [-394, 182], [-235, 367], [245, 367], [278, 340], [441, 2]];
  const made = blocksBetween(inner, outer, 12, { cutMode: 'normal-outer' });
  const signs = new Set(made.blocks.map((b) => Math.sign(signedArea(b))));
  assert.equal(signs.size, 1, 'every block has the same orientation');
  assert.deepEqual(checkTrace(inner, outer, 12, { cutMode: 'normal-outer' }), []);
});

test('an impossible normal construction is reported for that mode, with the failing cut', () => {
  // A flat extrados over a semicircle: near the springings the vertical
  // extrados normal passes beside the intrados.
  const inner = arc(4);
  const flat = [[-6, 0], [-6, 5], [6, 5], [6, 0]];
  const preview = normalCutsPreview(inner, flat, 20, 'normal-outer');
  assert.ok(preview.error, 'the construction fails');
  assert.ok(Number.isInteger(preview.failed) && preview.failed > 0 && preview.failed < 20);
  assert.equal(preview.joints.length, preview.failed, 'the cuts before the failure are kept');
  assert.throws(() => normalCuts(inner, flat, 20, 'normal-outer'), /cut \d+/);
  assert.ok(checkTrace(inner, flat, 20, { cutMode: 'normal-outer' }).length,
    'the button is disabled for the mode that fails');
  assert.deepEqual(checkTrace(inner, flat, 20, { cutMode: 'normal-midline' }), [],
    'and enabled for the mode that works');
});

test('sub-normal courses are horizontal and super-normal cuts are vertical', () => {
  const quarter = (r) => Array.from({ length: 101 }, (_, i) => {
    const t = (Math.PI * i) / 200;
    return [r * Math.cos(t), r * Math.sin(t)];
  });
  const sub = blocksBetween(arc(4), arc(5), 8, { cutMode: 'subnormal' });
  const sup = blocksBetween(quarter(4), quarter(5), 8, { cutMode: 'supernormal' });
  assert.equal(sub.courses.length, 8);
  sub.courses.forEach((course, i) => {
    assert.ok(Math.abs(course.y1 - course.y0 - sub.courseHeight) < 1e-12,
      `course ${i} has the common height`);
  });
  assert.ok(sub.blocks.some((b) => Math.max(...b.y) > 4),
    'the crown above the highest point of the intrados is filled');
  assert.ok(sub.blocks.length > sub.courses.length,
    'wide courses are split into running-bond blocks');
  const gotArea = sub.blocks.reduce((sum, b) => sum + area(b), 0);
  const ringArea = (Math.PI / 2) * (25 - 16);
  assert.ok(Math.abs(gotArea - ringArea) / ringArea < 0.001,
    'the courses cover the whole traced ring without gaps');
  sup.joints.slice(1, -1).forEach((j) => assert.ok(Math.abs(j.a[0] - j.b[0]) < 1e-9));
  assert.equal(sup.blocks.length, 8);
});

test('an approximate horizontal module controls every sub-normal course', () => {
  const made = blocksBetween(arc(4), arc(5), 10, {
    cutMode: 'subnormal', blockWidth: 0.8,
  });
  assert.ok(made.courses.every((course) => Math.abs(course.module - 0.8) < 1e-12));
  assert.ok(made.blocks.length > 10, 'wide courses are divided at the requested module');
  const width = (b) => Math.max(...b.x) - Math.min(...b.x);
  // Without sliver merging no block is wider than the module.
  const raw = blocksBetween(arc(4), arc(5), 10, {
    cutMode: 'subnormal', blockWidth: 0.8, minBlockFraction: 0,
  });
  const maxWidth = Math.max(...raw.blocks.map(width));
  assert.ok(maxWidth <= 0.8 + 1e-9, `no block is wider than the 0.8 module (${maxWidth})`);
  // With it, only a block that absorbed a sliver may be.
  const wide = made.blocks.filter((b) => width(b) > 0.8 + 1e-9);
  assert.ok(wide.length <= made.slivers.merged, 'every over-wide block absorbed a sliver');
  wide.forEach((b) => assert.ok(width(b) <= 3 * 0.8 + 1e-9));
});

test('sliver blocks are merged into their course neighbour, keeping the ring whole', () => {
  const ringArea = (Math.PI / 2) * (25 - 16);
  const inner = arc(4, 64);
  const outer = arc(5, 64);
  let merged = 0;
  for (let n = 3; n <= 30; n++) {
    for (const blockWidth of [0, 0.8, 1.6, 2.5]) {
      const made = blocksBetween(inner, outer, n, { cutMode: 'subnormal', blockWidth });
      merged += made.slivers.merged;
      assert.equal(made.slivers.dropped, 0, `n=${n} w=${blockWidth}: nothing is thrown away`);
      let k = 0;
      made.courses.forEach((c) => {
        const full = c.module * (c.y1 - c.y0);
        for (let i = 0; i < c.blocks; i++, k++) {
          assert.ok(area(made.blocks[k]) >= 0.2 * full * (1 - 1e-9),
            `n=${n} w=${blockWidth}: block ${k} is ${area(made.blocks[k]) / full} of a full block`);
        }
      });
      const got = made.blocks.reduce((s, b) => s + area(b), 0);
      const polygonArea = Math.abs([...inner, ...outer.slice().reverse()].reduce((s, p, i, o) => {
        const q = o[(i + 1) % o.length];
        return s + p[0] * q[1] - q[0] * p[1];
      }, 0) / 2);
      assert.ok(Math.abs(got - polygonArea) / polygonArea < 1e-9, 'the courses still tile the ring');
      assert.ok(Math.abs(got - ringArea) / ringArea < 0.01);
    }
  }
  assert.ok(merged > 0, 'this sweep does produce slivers to merge');
});

test('a course cell holding two separate pieces of the ring gives two blocks, not a bridged one', () => {
  // With nine courses a bed joint falls just below the intrados crown, and a
  // module of 2 puts both sides of the crown in one cell. Clipping the concave
  // outline used to return them as one polygon joined by a zero-width bridge.
  const made = blocksBetween(arc(4), arc(5), 9, { cutMode: 'subnormal', blockWidth: 2 });
  const overlapping = (b) => {
    const p = b.x.map((x, i) => [x, b.y[i]]);
    const n = p.length;
    const cross = (o, a, c) => (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0]);
    for (let i = 0; i < n; i++) {
      const a = p[i];
      const c = p[(i + 1) % n];
      for (let j = i + 2; j < n; j++) {
        if ((j + 1) % n === i) continue;
        const d = p[j];
        const e = p[(j + 1) % n];
        if (Math.abs(cross(a, c, d)) > 1e-9 || Math.abs(cross(a, c, e)) > 1e-9) continue;
        const u = [c[0] - a[0], c[1] - a[1]];
        const len = u[0] * u[0] + u[1] * u[1];
        const t = [d, e].map((q) => ((q[0] - a[0]) * u[0] + (q[1] - a[1]) * u[1]) / len);
        if (Math.min(1, Math.max(...t)) - Math.max(0, Math.min(...t)) > 1e-6) return true;
      }
    }
    return false;
  };
  assert.ok(!made.blocks.some(overlapping), 'no block has collinear, overlapping edges');
  const gotArea = made.blocks.reduce((sum, b) => sum + area(b), 0);
  const ringArea = (Math.PI / 2) * (25 - 16);
  assert.ok(Math.abs(gotArea - ringArea) / ringArea < 0.001, 'the ring is still fully covered');
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

test('an inclined force carries horizontal and vertical components', () => {
  const m = blocksLike(threeBlocks(), {
    points: [[2.5, 4]], x: [3], magnitudes: [7],
  });
  assert.deepEqual(m.weights, [3, [3, 7], 2, 1]);
  assert.deepEqual(m.actionDirs[1], [3, -7]);
  const fp = forcePolygon(m.weights, [6, -6]);
  assert.deepEqual(fp.stations[1], [0, -3]);
  assert.deepEqual(fp.stations[2], [3, -10]);
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

test('layers share faces and conserve area, weight and springings', () => {
  const inner = arc(4);
  const outer = arc(6);
  for (const cutMode of ['stations', 'normal-midline', 'normal-outer', 'supernormal']) {
    const a = cutMode === 'supernormal' ? [[0, 0], [8, 0]] : inner;
    const b = cutMode === 'supernormal' ? [[0, 2], [8, 4]] : outer;
    const single = blocksBetween(a, b, 8, { cutMode });
    const made = blocksBetween(a, reverse(b), 8, { cutMode, thicknessBlocks: 3 });
    assert.equal(made.blocks.length, 24);
    assert.equal(made.joints, null);
    assert.equal(made.flipped, true);
    assert.deepEqual(springings(made.endJoints), springings(single.joints));
    assert.deepEqual(checkTrace(a, b, 8, { cutMode, thicknessBlocks: 3 }), []);
    const sum = (xs) => xs.reduce((s, x) => s + x, 0);
    assert.ok(Math.abs(sum(made.blocks.map(area)) - sum(single.blocks.map(area))) < 1e-9);
    assert.ok(Math.abs(sum(weighBlocks(made.blocks)) - sum(weighBlocks(single.blocks))) < 1e-8);
    for (let layer = 0; layer < 2; layer++) {
      for (let j = 0; j < 8; j++) {
        const lo = made.blocks[layer * 8 + j];
        const hi = made.blocks[(layer + 1) * 8 + j];
        for (const axis of ['x', 'y']) {
          assert.equal(lo[axis][1], hi[axis][0]);
          assert.equal(lo[axis][2], hi[axis][3]);
        }
        assert.ok(signedArea(lo) * signedArea(single.blocks[j]) > 0);
      }
    }
  }
});

test('one layer preserves existing geometry and invalid layer counts are rejected', () => {
  const a = [[0, 0], [8, 0]];
  const b = [[0, 2], [8, 4]];
  assert.deepEqual(blocksBetween(a, b, 4, { thicknessBlocks: 1 }), blocksBetween(a, b, 4));
  for (const thicknessBlocks of [0, -1, 1.5, NaN, Infinity, 201]) {
    assert.throws(() => blocksBetween(a, b, 4, { thicknessBlocks }), /integer/);
    assert.ok(checkTrace(a, b, 4, { thicknessBlocks }).length);
  }
  const made = blocksBetween(a, b, 4, { thicknessBlocks: 2 });
  // First station is 2 units deep; the last is 4. Each is halved locally.
  assert.equal(made.blocks[0].y[1], 1);
  assert.equal(made.blocks[3].y[2], 2);
});

test('staggered layers have half end blocks and alternate with aligned layers', () => {
  const inner = [[0, 0], [8, 0]];
  const outer = [[0, 3], [8, 3]];
  const made = blocksBetween(inner, outer, 4, { thicknessBlocks: 3, staggerPercent: 50 });
  assert.equal(made.blocks.length, 13);
  const widths = made.blocks.map((b) => Math.max(...b.x) - Math.min(...b.x));
  assert.deepEqual(widths, [2, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 2]);
  assert.equal(made.joints, null);
  assert.equal(made.blocks.reduce((s, b) => s + area(b), 0), 24);
  const quarter = blocksBetween(inner, outer, 4, { thicknessBlocks: 2, staggerPercent: 25 });
  assert.equal(Math.max(...quarter.blocks[4].x), 0.5);
  assert.equal(Math.min(...quarter.blocks[8].x), 6.5);
});

test('staggering preserves curved boundaries, area and first moments for all cut modes', () => {
  for (const cutMode of ['stations', 'normal-midline', 'normal-outer', 'supernormal']) {
    const inner = cutMode === 'supernormal' ? [[0, 0], [4, 0.2], [8, 0]] : arc(4);
    const outer = cutMode === 'supernormal' ? [[0, 3], [4, 4], [8, 3]] : arc(6);
    const opt = { cutMode, thicknessBlocks: 3 };
    const base = blocksBetween(inner, outer, 8, opt);
    const moments = (blocks) => blocks.reduce((s, b) => {
      const a = area(b), c = centroid(b);
      return [s[0] + a, s[1] + a * c[0], s[2] + a * c[1]];
    }, [0, 0, 0]);
    for (const staggerPercent of [1, 25, 50, 75, 99]) {
      const options = { ...opt, staggerPercent };
      const made = blocksBetween(inner, outer, 8, options);
      assert.equal(made.blocks.length, 25);
      assert.deepEqual(made.endJoints, base.endJoints);
      const want = moments(base.blocks);
      moments(made.blocks).forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-8));
      assert.deepEqual(checkTrace(inner, outer, 8, options), []);
      assert.deepEqual(blocksBetween(inner, reverse(outer), 8, options).blocks, made.blocks);
      assert.ok(made.blocks.some((b) => b.x.length === 6), 'boundary bends must be preserved');
    }
    for (const staggerPercent of [0, 100]) {
      assert.deepEqual(blocksBetween(inner, outer, 8, { ...opt, staggerPercent }), base);
    }
  }
});

test('stagger percentages are validated and a single layer remains unchanged', () => {
  const inner = [[0, 0], [8, 0]], outer = [[0, 2], [8, 2]];
  for (const staggerPercent of [-1, 101, NaN, Infinity]) {
    assert.throws(() => blocksBetween(inner, outer, 4, { staggerPercent }), /percentage/);
    assert.ok(checkTrace(inner, outer, 4, { staggerPercent }).length);
  }
  assert.deepEqual(blocksBetween(inner, outer, 4, { staggerPercent: 50 }),
    blocksBetween(inner, outer, 4));
});
