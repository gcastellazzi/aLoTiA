import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circularRing } from '../docs/app/js/core/blocks.js';
import { centroidsOf, weighBlocks } from '../docs/app/js/core/trace.js';
import { blockArea } from '../docs/app/js/core/geometry.js';
import { boundaryConstraints, boundaryMotionAllowed, boundaryCollision } from '../docs/app/js/core/region-boundaries.js';
import { modelInLayer } from '../docs/app/js/core/layers.js';
import { multiplierInput, minimumMultiplier, mechanismMultiplier } from '../docs/app/js/core/multiplier.js';
import { displaced, displacedConfiguration } from '../docs/app/js/core/mechanism.js';
import { polygon } from '../docs/app/js/core/region-geometry.js';

const rect = (x0, y0, x1, y1) => ({ x: [x0, x1, x1, x0], y: [y0, y0, y1, y1] });
function model(blocks, roles, zs = []) {
  return { blocks, centroids: centroidsOf(blocks), weights: blocks.map((b) => blockArea(b) * 20), areas: blocks.map(blockArea),
    thickness: blocks.map(() => 1), groups: roles.map((role, i) => ({ id: i + 1, role, z: zs[i] ?? 0 })), blockGroups: blocks.map((_, i) => i + 1) };
}

test('a fixed floor permits separation and tangential sliding but forbids penetration', () => {
  const m = model([rect(0, 0, 1, 1), rect(-1, -1, 2, 0)], ['structure', 'fixed']);
  const active = modelInLayer(m), { constraints, issues } = boundaryConstraints(m, active);
  assert.equal(issues.length, 0); assert.ok(constraints.length >= 2);
  const allowed = (vx, vy, omega = 0) => boundaryMotionAllowed(constraints, [0], [{ vx, vy, omega }]);
  assert.ok(allowed(0, 1)); assert.ok(allowed(1, 0)); assert.ok(allowed(-1, 0));
  assert.equal(allowed(0, -1), false); assert.equal(allowed(0, 0, -1), false);
  assert.ok(allowed(0, 0, 1));
});

test('corner contact does not impose two bilateral restraints; either outward side can detach', () => {
  const m = model([rect(0, 0, 1, 1), rect(-1, -1, 0, 0)], ['structure', 'fixed']);
  const { constraints, issues } = boundaryConstraints(m, modelInLayer(m));
  assert.equal(issues.length, 0); assert.ok(constraints.length > 0);
  for (const [vx, vy] of [[-1, 1], [1, -1], [1, 1]]) assert.ok(boundaryMotionAllowed(constraints, [0], [{ vx, vy, omega: 0 }]));
  assert.equal(boundaryMotionAllowed(constraints, [0], [{ vx: -1, vy: -1, omega: 0 }]), false);
});

test('fixed blocks only constrain the same Z layer; initial area overlap is an explicit error', () => {
  const separated = model([rect(0, 0, 1, 1), rect(-1, -1, 2, 0)], ['structure', 'fixed'], [0, 2]);
  assert.equal(boundaryConstraints(separated, modelInLayer(separated)).constraints.length, 0);
  const overlap = model([rect(0, 0, 1, 1), rect(.5, -.5, 1.5, .5)], ['structure', 'fixed']);
  assert.match(boundaryConstraints(overlap, modelInLayer(overlap)).issues[0].reason, /initially overlaps/);
  const equal = model([rect(0, 0, 1, 1), rect(0, 0, 1, 1)], ['structure', 'fixed']);
  assert.ok(boundaryConstraints(equal, modelInLayer(equal)).issues.length);
});

test('the automatic search filters every candidate rather than rejecting only its unconstrained minimum', () => {
  const ring = circularRing({ innerRadius: 4, outerRadius: 4.8, count: 8 });
  const m = { ...ring, centroids: centroidsOf(ring.blocks), weights: weighBlocks(ring.blocks, { specificWeight: 20, thickness: 1 }),
    areas: ring.blocks.map(blockArea), thickness: ring.blocks.map(() => 1), groups: [{ id: 1, role: 'structure', z: 0 }], blockGroups: ring.blocks.map(() => 1) };
  const plain = multiplierInput(m), baseline = minimumMultiplier(plain).plus;
  // One fixed pad rejects the unconstrained minimum while leaving other
  // mechanisms available. The search must actually find the next valid mode.
  for (let i = 0; i < 1; i++) {
    const a = ring.joints[i].b, b = ring.joints[i + 1].b;
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], len = Math.hypot(...mid);
    const d = mid.map((x) => .2 * x / len);
    m.blocks.push(polygon([a, b, [b[0] + d[0], b[1] + d[1]], [a[0] + d[0], a[1] + d[1]]]));
    m.centroids.push([mid[0] + d[0] / 2, mid[1] + d[1] / 2]); m.areas.push(.1); m.weights.push(10000); m.thickness.push(1); m.blockGroups.push(2);
  }
  m.groups.push({ id: 2, role: 'fixed', z: 0 });
  const active = modelInLayer(m), data = boundaryConstraints(m, active);
  assert.equal(data.issues.length, 0); assert.ok(data.constraints.length > 0);
  active.boundaries = data.constraints;
  const input = multiplierInput(active);
  const manual = mechanismMultiplier(input, baseline.picks);
  assert.match(manual.reason, /fixed boundary/);
  const found = minimumMultiplier(input);
  assert.ok(found.plus && found.minus);
  assert.ok(found.plus.alpha > baseline.alpha + 1e-6);
  const brute = { plus: Infinity, minus: Infinity };
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 7; j++)
    for (let k = j + 1; k < 8; k++) for (let l = k + 1; l <= 8; l++) for (let bits = 0; bits < 16; bits++) {
      const picks = [i, j, k, l].map((joint, h) => ({ joint, face: (bits >> h) & 1 ? 'extrados' : 'intrados' }));
      const result = mechanismMultiplier(input, picks);
      if (!result.reason) { const side = result.direction > 0 ? 'plus' : 'minus'; brute[side] = Math.min(brute[side], result.alpha); }
    }
  for (const side of ['plus', 'minus']) assert.ok(Math.abs(found[side].alpha - brute[side]) < 1e-8);
  for (const side of ['plus', 'minus']) if (found[side]) {
    assert.ok(boundaryMotionAllowed(data.constraints, found[side].bodyOf, found[side].motion.motions));
    assert.ok(found[side].alpha >= baseline.alpha - 1e-8);
  }
  assert.deepEqual(input.weights, plain.weights); // fixed masses never enter alpha
});

test('finite animation can stop at the last accepted configuration before fixed material', () => {
  const ring = circularRing({ innerRadius: 4, outerRadius: 4.8, count: 8 });
  const m = { ...ring, centroids: centroidsOf(ring.blocks), weights: weighBlocks(ring.blocks, { specificWeight: 20, thickness: 1 }) };
  const mechanism = minimumMultiplier(multiplierInput(m)).plus;
  let accepted = 0;
  const T = displacedConfiguration(mechanism.hinges, mechanism.bodies, .2, 120, () => ++accepted < 3);
  const early = displacedConfiguration(mechanism.hinges, mechanism.bodies, .2 / 120 * 2, 2);
  assert.equal(accepted, 3); assert.deepEqual(T, early);
  const floor = model([rect(0, 0, 1, 1), rect(-1, -1, 2, 0)], ['structure', 'fixed']);
  const section = modelInLayer(floor);
  assert.equal(boundaryCollision(floor, section, section.blocks), false);
  assert.equal(boundaryCollision(floor, section, displaced(section.blocks, [0], [{ cos: 1, sin: 0, tx: 0, ty: -.1 }])), true);
});
