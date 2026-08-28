/**
 * Tests for the admissibility check: does the thrust line stay in the masonry?
 *
 * This is Heyman's condition, and the whole point of the tool. A thrust line
 * that leaves the ring means no equilibrium is possible in that configuration;
 * one that stays inside proves, by the safe theorem, that the arch stands.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { centroid } from '../docs/app/js/core/geometry.js';
import { blocksBetween, weighBlocks, springings } from
  '../docs/app/js/core/trace.js';
import { forcePolygon, funicular, jointCrossings } from
  '../docs/app/js/core/statics.js';

function arc(r, n = 200) {
  return Array.from({ length: n }, (_, i) => {
    const t = (Math.PI * i) / (n - 1);
    return [-r * Math.cos(t), r * Math.sin(t)];
  });
}

/** A semicircular ring and the thrust line for a given pole abscissa. */
function ring(n = 16, thrustFactor = 0.25) {
  const { blocks, joints } = blocksBetween(arc(4), arc(5), n);
  const weights = weighBlocks(blocks, { specificWeight: 20, thickness: 1 });
  const centroids = blocks.map(centroid);
  const { pointA, pointB } = springings(joints);
  const order = centroids
    .map((c, i) => [c[0], i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  const w = order.map((i) => weights[i]);
  const g = order.map((i) => centroids[i]);
  const total = w.reduce((s, v) => s + v, 0);
  const fp = forcePolygon(w, [total * thrustFactor, -total / 2]);
  const lot = funicular(fp, g, pointB, pointA);
  return { blocks, joints, lot, fp };
}

test('a crossing is found on every joint of a normal arch', () => {
  const { joints, lot } = ring(16, 0.25);
  const cr = jointCrossings(lot.points, joints);
  assert.equal(cr.length, joints.length);
  assert.ok(cr.every((c) => c !== null), 'every joint must be crossed');
});

test('the crossing fraction runs from intrados to extrados', () => {
  // s = 0 is the intrados end of the joint, s = 1 the extrados end, because
  // blocksBetween builds each joint as {a: inner, b: outer}.
  const { joints } = ring(8);
  const j = joints[4];
  const mid = [(j.a[0] + j.b[0]) / 2, (j.a[1] + j.b[1]) / 2];
  // A horizontal line through the joint mid-point must cross at s = 0.5.
  const line = [[mid[0] - 10, mid[1]], [mid[0] + 10, mid[1]]];
  const [c] = jointCrossings(line, [j]);
  assert.ok(c, 'the line must cross the joint');
  assert.ok(Math.abs(c.s - 0.5) < 1e-9, `s = ${c.s}`);
  assert.equal(c.inside, true);
});

test('a crossing beyond the joint is reported as outside', () => {
  const { joints } = ring(8);
  const j = joints[4];
  // A line through the intrados end, displaced further in: s < 0.
  const d = [j.b[0] - j.a[0], j.b[1] - j.a[1]];
  const beyond = [j.a[0] - 0.5 * d[0], j.a[1] - 0.5 * d[1]];
  const line = [[beyond[0] - 10, beyond[1]], [beyond[0] + 10, beyond[1]]];
  const [c] = jointCrossings(line, [j]);
  assert.ok(c);
  assert.ok(c.s < 0, `s = ${c.s}`);
  assert.equal(c.inside, false);
});

test('a well-chosen thrust keeps the line inside the ring', () => {
  // The admissible window for this ring, with the ends pinned at the joint
  // mid-points, is roughly 0.165 to 0.180 of the total weight.
  const { joints, lot } = ring(24, 0.172);
  const cr = jointCrossings(lot.points, joints);
  const outside = cr.filter((c) => c && !c.inside).length;
  assert.equal(outside, 0, `${outside} joints violated`);
});

test('too little thrust drives the line out of the ring', () => {
  // A shallow pole means a steep funicular: it dives out through the haunches.
  const { joints, lot } = ring(24, 0.02);
  const cr = jointCrossings(lot.points, joints);
  const outside = cr.filter((c) => c && !c.inside).length;
  assert.ok(outside > 0, 'a very small thrust must violate the ring');
});

test('too much thrust also drives it out, the other way', () => {
  const { joints, lot } = ring(24, 5.0);
  const cr = jointCrossings(lot.points, joints);
  const outside = cr.filter((c) => c && !c.inside).length;
  assert.ok(outside > 0, 'a very large thrust must violate the ring');
});

/** The band of thrust factors for which every joint is crossed inside. */
function admissibleBand(ri, ro, n = 24) {
  const lo = [];
  for (let f = 0.02; f <= 1.2; f += 0.005) {
    const { blocks, joints } = blocksBetween(arc(ri), arc(ro), n);
    const weights = weighBlocks(blocks, { specificWeight: 20, thickness: 1 });
    const centroids = blocks.map(centroid);
    const { pointA, pointB } = springings(joints);
    const order = centroids
      .map((c, i) => [c[0], i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
    const w = order.map((i) => weights[i]);
    const g = order.map((i) => centroids[i]);
    const total = w.reduce((s, v) => s + v, 0);
    const fp = forcePolygon(w, [total * f, -total / 2]);
    const cr = jointCrossings(funicular(fp, g, pointB, pointA).points, joints);
    if (cr.every((c) => c && c.inside)) lo.push(f);
  }
  return lo;
}

test('the admissible thrusts form one contiguous band', () => {
  const band = admissibleBand(4, 5);
  assert.ok(band.length > 0, 'no admissible thrust found at all');
  const step = 0.005;
  for (let i = 1; i < band.length; i++) {
    assert.ok(band[i] - band[i - 1] < step * 1.5,
      `a gap at ${band[i - 1]} to ${band[i]}: the band is not contiguous`);
  }
});

test('the band widens with the thickness of the ring, and thin rings have none',
  () => {
    // This is the safe theorem made visible. A ring thin enough admits no
    // thrust line at all; thicken it and a window opens and grows.
    const thin = admissibleBand(4, 4.6);
    const normal = admissibleBand(4, 5);
    const thick = admissibleBand(4, 6);
    const veryThick = admissibleBand(4, 8);

    assert.equal(thin.length, 0, 't/ri = 0.15 must admit nothing here');
    assert.ok(normal.length > 0, 't/ri = 0.25 must admit something');
    assert.ok(thick.length > normal.length, 'a thicker ring must admit more');
    assert.ok(veryThick.length > thick.length);
  });

test('the limit is stricter than Heyman because the ends are pinned', () => {
  // Heyman's minimum for a semicircular arch is t/ri = 0.108, but that is
  // over ALL thrust lines: three degrees of freedom, the thrust and the two
  // end positions. Pinning both ends at the mid-points of the end joints
  // removes two of them, so the ring has to be thicker before the remaining
  // one-parameter family contains an admissible member.
  assert.equal(admissibleBand(4, 4 * 1.108).length, 0,
    'at exactly Heyman\'s limit the pinned family must still fail');
});

test('a symmetric arch crosses its crown joint symmetrically', () => {
  const { joints, lot } = ring(24, 0.30);
  const cr = jointCrossings(lot.points, joints);
  const n = cr.length;
  for (let i = 0; i < n / 2; i++) {
    const a = cr[i];
    const b = cr[n - 1 - i];
    assert.ok(a && b);
    assert.ok(Math.abs(a.s - b.s) < 1e-6,
      `joint ${i} at s=${a.s}, its mirror at s=${b.s}`);
  }
});

// ------------------------------------------------- the three free parameters --

import { pointOnJoint, fractionAlongJoint, freeThrustLine } from
  '../docs/app/js/core/statics.js';

test('a point on a joint and its fraction are inverse', () => {
  const j = { a: [1, 2], b: [4, 6] };
  for (const s of [0, 0.25, 0.5, 1, 1.4, -0.3]) {
    const p = pointOnJoint(j, s);
    assert.ok(Math.abs(fractionAlongJoint(j, p) - s) < 1e-12, `s = ${s}`);
  }
  assert.deepEqual(pointOnJoint(j, 0), [1, 2]);
  assert.deepEqual(pointOnJoint(j, 1), [4, 6]);
});

/** A ring, weighed and sorted, ready for either construction. */
function ringModel(ri, ro, n) {
  const { blocks, joints } = blocksBetween(arc(ri), arc(ro), n);
  const weights = weighBlocks(blocks, { specificWeight: 20, thickness: 1 });
  const centroids = blocks.map(centroid);
  const order = centroids
    .map((c, i) => [c[0], i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  const w = order.map((i) => weights[i]);
  const g = order.map((i) => centroids[i]);
  return {
    joints, w, g,
    total: w.reduce((s, v) => s + v, 0),
    startJoint: joints[joints.length - 1],   // the right-hand springing
    endJoint: joints[0],
  };
}

test('the free line arrives on its joint, which funicular does not', () => {
  const r = ringModel(4, 5, 16);
  const fp = forcePolygon(r.w, [r.total * 0.2, -r.total * 0.4]);
  // Deliberately unsymmetric (pole ordinate not at half the load), so the
  // MATLAB construction stops short of the far springing.
  const pinned = funicular(fp, r.g,
    pointOnJoint(r.startJoint, 0.5), pointOnJoint(r.endJoint, 0.5));
  const free = freeThrustLine(fp, r.g, r.startJoint, r.endJoint, 0.5);

  assert.ok(pinned.closureError > 0.1,
    `the pinned line should miss the springing, missed by ${pinned.closureError}`);
  // The free line's last point lies ON the end joint, by construction.
  const s = fractionAlongJoint(r.endJoint, free.points[free.points.length - 1]);
  assert.ok(Math.abs(s - free.endFraction) < 1e-12);
  const j = r.endJoint;
  const cross = (free.end[0] - j.a[0]) * (j.b[1] - j.a[1])
    - (free.end[1] - j.a[1]) * (j.b[0] - j.a[0]);
  assert.ok(Math.abs(cross) < 1e-9, `the end must lie on the joint line, ${cross}`);
});

test('the symmetric free line reproduces the pinned one exactly', () => {
  // Freeing the ends must ENLARGE the family, not replace it: at s = 1/2 and
  // a pole ordinate at half the total load, the two constructions agree.
  const r = ringModel(4, 5, 14);
  const fp = forcePolygon(r.w, [r.total * 0.2, -r.total / 2]);
  const pinned = funicular(fp, r.g,
    pointOnJoint(r.startJoint, 0.5), pointOnJoint(r.endJoint, 0.5));
  const free = freeThrustLine(fp, r.g, r.startJoint, r.endJoint, 0.5);

  assert.equal(free.points.length, pinned.points.length);
  free.points.forEach((p, i) => {
    assert.ok(Math.abs(p[0] - pinned.points[i][0]) < 1e-9, `x at ${i}`);
    assert.ok(Math.abs(p[1] - pinned.points[i][1]) < 1e-9, `y at ${i}`);
  });
});

/** Is any admissible line found for this ring? Returns the parameters or null. */
function search(ri, ro, n, freeEnds) {
  const r = ringModel(ri, ro, n);
  const lin = (a, b, m) => Array.from({ length: m }, (_, i) => a + ((b - a) * i) / (m - 1));
  // The grids MUST contain the symmetric case -- s = 1/2, pole ordinate at
  // half the load -- or the free search would exclude the pinned family it is
  // supposed to contain, and would come out looking worse.
  const starts = freeEnds ? lin(0, 1, 21) : [0.5];
  const tilts = freeEnds ? lin(-1.5, 0.5, 41) : [-0.5];

  for (const f of lin(0.05, 0.6, 56)) {
    for (const sA of starts) {
      for (const ty of tilts) {
        const fp = forcePolygon(r.w, [r.total * f, r.total * ty]);
        const lot = freeEnds
          ? freeThrustLine(fp, r.g, r.startJoint, r.endJoint, sA)
          : funicular(fp, r.g,
            pointOnJoint(r.startJoint, 0.5), pointOnJoint(r.endJoint, 0.5));
        if (freeEnds && !lot.closed) continue;
        if (jointCrossings(lot.points, r.joints).every((c) => c && c.inside)) {
          return { f, sA, ty, end: lot.endFraction };
        }
      }
    }
  }
  return null;
}

/** The least t/ri for which an admissible line exists, by bisection. */
function minimumThickness(n, freeEnds) {
  let lo = 0.02;
  let hi = 0.9;
  for (let i = 0; i < 12; i++) {
    const m = (lo + hi) / 2;
    if (search(4, 4 * (1 + m), n, freeEnds)) hi = m; else lo = m;
  }
  return hi;
}

test('freeing the ends nearly halves the least admissible thickness', () => {
  // THE POINT OF THE WHOLE CHANGE. With both ends pinned at the joint
  // mid-points only the thrust is free, and a semicircular ring needs t/ri of
  // about 0.20 before any line fits -- twice Heyman's 0.108. With the ends
  // free the same ring manages a little over 0.11.
  const pinned = minimumThickness(16, false);
  const free = minimumThickness(16, true);
  assert.ok(pinned > 0.19 && pinned < 0.21, `pinned came out at ${pinned}`);
  assert.ok(free > 0.10 && free < 0.14, `free came out at ${free}`);
  assert.ok(free < pinned / 1.6, `${free} against ${pinned}`);
});

test('the limit line touches the extrados at both springings', () => {
  // Heyman\'s minimum-thickness arch has hinges at the extrados of the two
  // springings and at the intrados of the haunches. The search should find
  // exactly that on its own: s = 1 at the start, s = 1 at the end.
  const t = minimumThickness(16, true);
  const best = search(4, 4 * (1 + t), 16, true);
  assert.ok(best, 'an admissible line must exist at the bisected thickness');
  // The search walks s upwards and stops at the first fit, so just above the
  // critical thickness it settles a grid step short of 1; the claim is that
  // the line is hard against the extrados, not exactly on it.
  assert.ok(best.sA > 0.9, `the line should start at the extrados, s = ${best.sA}`);
  assert.ok(best.end > 0.9, `and arrive at it, s = ${best.end}`);
  // And the thrust it needs is Heyman\'s, about a fifth of the total weight.
  assert.ok(best.f > 0.17 && best.f < 0.24, `thrust ${best.f} of the weight`);
});
