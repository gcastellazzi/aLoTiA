/**
 * Tests for what the joints ask of friction.
 *
 * The quantity is checked against closed forms rather than against a previous
 * run. On a symmetric ring the springing joint is horizontal and carries half
 * the weight with the whole horizontal thrust, so the coefficient it demands
 * is exactly 2H/W; a horizontal bed and a vertical joint, taken on their own,
 * give the two limits that the corbelled section and the lintel live at.
 *
 * Heyman's third assumption -- no sliding -- is the one the drawing cannot
 * check for itself, which is why these numbers are computed and reported
 * rather than assumed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { circularRing } from '../docs/app/js/core/blocks.js';
import { blocksBetween, weighBlocks, centroidsOf } from '../docs/app/js/core/trace.js';
import { bestLineForThrust, collapseRange } from '../docs/app/js/core/mechanism.js';
import { jointForces } from '../docs/app/js/core/statics.js';

const arc = (r, n = 200) => Array.from({ length: n + 1 }, (_, i) => {
  const t = (Math.PI * i) / n;
  return [-r * Math.cos(t), r * Math.sin(t)];
});

/**
 * A traced ring whose joints are turned `bias` of the way onto the horizontal,
 * with the blocks in the order the funicular walk wants them, right to left.
 */
function traced(count, tri, bias) {
  const { blocks, joints } = blocksBetween(arc(1), arc(1 + tri), count,
    { cutMode: 'normal-midline', jointBias: bias });
  const centroids = centroidsOf(blocks);
  const weights = weighBlocks(blocks, { specificWeight: 20, thickness: 1 });
  const order = centroids.map((c, i) => [c[0], i])
    .sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  return {
    joints,
    weights: order.map((i) => weights[i]),
    centroids: order.map((i) => centroids[i]),
  };
}

function ring(count, tri, { radius = 1, specificWeight = 20 } = {}) {
  const { blocks, joints } = circularRing({
    innerRadius: radius, outerRadius: radius * (1 + tri), count,
  });
  return {
    blocks,
    joints,
    weights: weighBlocks(blocks, { specificWeight, thickness: 1 }),
    centroids: centroidsOf(blocks),
  };
}

/** The friction the best line at this thrust demands. */
function demand(m, thrust) {
  const got = bestLineForThrust(
    { weights: m.weights, centroids: m.centroids }, m.joints, thrust, {},
  );
  if (!got) return null;
  return { ...jointForces(got.fp, got.crossings, m.joints), clearance: got.clearance };
}

// ------------------------------------------------------- the two limits --

test('a horizontal bed demands the tangent of the thrust from the vertical', () => {
  // One joint along x, one force: N is the vertical component, T the
  // horizontal one. This is the corbelled course, where the bed carries no
  // thrust of its own and friction alone holds the stone.
  const joints = [{ a: [0, 0], b: [1, 0] }];
  const fp = { rays: [[3, -4]] };                 // H = 3, V = 4 downwards
  const got = jointForces(fp, [{ segment: 0 }], joints);
  assert.ok(Math.abs(got.joints[0].N - 4) < 1e-12);
  assert.ok(Math.abs(got.joints[0].T - 3) < 1e-12);
  assert.ok(Math.abs(got.muReq - 3 / 4) < 1e-12);
  assert.equal(got.worst, 0);
});

test('a vertical joint under a vertical force demands infinite friction', () => {
  // The lintel: the force runs along the joint, nothing presses across it, and
  // no coefficient of friction is enough. Reported as Infinity on purpose.
  const joints = [{ a: [0, 0], b: [0, 1] }];
  const got = jointForces({ rays: [[0, -5]] }, [{ segment: 0 }], joints);
  assert.equal(got.muReq, Infinity);
  assert.equal(got.joints[0].N, 0);
});

test('the same joint crossed by an inclined force demands V over H', () => {
  const joints = [{ a: [0, 0], b: [0, 1] }];
  const got = jointForces({ rays: [[3, -4]] }, [{ segment: 0 }], joints);
  assert.ok(Math.abs(got.joints[0].N - 3) < 1e-12);
  assert.ok(Math.abs(got.muReq - 4 / 3) < 1e-12);
});

// ------------------------------------------------------------- the arch --

test('the springing of a symmetric ring demands twice the thrust ratio', () => {
  // The end joints of a semicircular ring are horizontal, each carries half
  // the weight, and the horizontal thrust crosses them whole: mu = H / (W/2).
  const m = ring(16, 0.2);
  for (const thrust of [0.18, 0.2, 0.24]) {
    const got = demand(m, thrust);
    assert.ok(got, `no line at H/W = ${thrust}`);
    assert.ok(got.clearance >= 0, `the line leaves the ring at H/W = ${thrust}`);
    assert.ok(Math.abs(got.muReq - 2 * thrust) < 5e-3,
      `H/W ${thrust}: demanded ${got.muReq}, expected ${2 * thrust}`);
    assert.ok(got.worst === 0 || got.worst === m.joints.length - 1,
      'the governing joint is a springing');
  }
});

test('the demand does not depend on the scale or on the unit weight', () => {
  const small = demand(ring(16, 0.2, { radius: 1, specificWeight: 20 }), 0.2);
  const large = demand(ring(16, 0.2, { radius: 340, specificWeight: 0.7 }), 0.2);
  assert.ok(Math.abs(small.muReq - large.muReq) < 1e-6,
    `${small.muReq} against ${large.muReq}`);
});

test('turning the joints sub-normal leaves the band and moves the friction', () => {
  // THE POINT THE TWO NUMBERS MAKE TOGETHER. Rotating every joint part of the
  // way onto the horizontal -- the sub-normal family, whose limit is the
  // corbelled bed -- barely touches the range of thrust for which a line of
  // thrust fits, and that is the safe theorem being nearly blind to
  // stereotomy. What it does move is the friction the joints demand.
  const at = (bias) => {
    const m = traced(16, 0.3, bias);
    const seq = { weights: m.weights, centroids: m.centroids };
    const band = collapseRange(seq, m.joints, {});
    assert.ok(band, `no admissible line at bias ${bias}`);
    const got = bestLineForThrust(seq, m.joints, band.min * 1.001, {});
    return { band, mu: jointForces(got.fp, got.crossings, m.joints).muReq };
  };
  const radial = at(0);
  const sub = at(0.35);

  assert.ok(Math.abs(sub.band.min - radial.band.min) < 0.01
    && Math.abs(sub.band.max - radial.band.max) < 0.01,
  `the band moved: ${JSON.stringify(radial.band)} against ${JSON.stringify(sub.band)}`);
  assert.ok(sub.mu > radial.mu * 1.5,
    `sub-normal joints demanded ${sub.mu}, radial ones ${radial.mu}`);
});

test('beyond the sub-normal limit the voussoirs are no longer a chain', () => {
  // The beds turn so far that they stop crossing the intrados in order. The
  // construction says so rather than returning a geometry it cannot defend;
  // past this point the section is a bonded assembly of courses, which is what
  // `subnormalCourses` builds.
  assert.throws(() => traced(16, 0.3, 0.6), /does not reach|coincident|cross/);
});

test('a joint that is never crossed is reported, not counted', () => {
  const joints = [{ a: [0, 0], b: [1, 0] }, { a: [2, 0], b: [3, 0] }];
  const got = jointForces({ rays: [[3, -4]] }, [{ segment: 0 }, null], joints);
  assert.equal(got.joints[1], null);
  assert.ok(Math.abs(got.muReq - 0.75) < 1e-12);
});
