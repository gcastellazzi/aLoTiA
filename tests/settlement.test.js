import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circularRing } from '../docs/app/js/core/blocks.js';
import { blockArea, blockCentroid } from '../docs/app/js/core/geometry.js';
import { hingeAt, bodies, bodyOfBlock, transformPoint, displaced } from '../docs/app/js/core/mechanism.js';
import { modelInLayer } from '../docs/app/js/core/layers.js';
import { boundaryConstraints, boundaryMotionAllowed } from '../docs/app/js/core/region-boundaries.js';
import { settlementMotion, settlementTransforms, supportTranslations } from '../docs/app/js/core/settlement.js';
import { convertModel } from '../docs/app/js/core/units.js';
import { serialise, deserialise } from '../docs/app/js/core/persist.js';
import { regionBodyAssignments } from '../docs/app/js/core/region-motion.js';
const rect = (a, b, c, d) => ({ x: [a, c, c, a], y: [b, b, d, d] });
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const velocity = (m, p) => [m.vx - m.omega * p[1], m.vy + m.omega * p[0]];
function fixture(d = [.01, 0]) {
  const ring = circularRing({ centre: [0, 0], innerRadius: 4, outerRadius: 5, startAngle: 0, endAngle: 180, count: 8 });
  const blocks = [...ring.blocks, rect(3.5, -1, 5.5, 0), rect(-5.5, -1, -3.5, 0)];
  blocks[8].supportDisplacement = d;
  return { blocks, centroids: blocks.map(blockCentroid), areas: blocks.map(blockArea), weights: blocks.map(() => 20),
    thickness: blocks.map(() => 1), groups: [{ id: 1, z: 0 }, { id: 2, role: 'fixed', z: 0 }],
    blockGroups: blocks.map((_, i) => i < 8 ? 1 : 2), frame: { coordinates: 'physical', units_per_pixel: 1 } };
}
function study(m, picks = [[0, 'intrados'], [4, 'extrados'], [8, 'intrados']]) {
  const section = modelInLayer(m, 'all');
  section.boundaries = boundaryConstraints(m, section).constraints;
  const hinges = picks.map(([i, face]) => hingeAt(section.joints, i, face, { ends: true }));
  const bodyList = bodies(hinges, section.blocks.length), bodyOf = bodyOfBlock(bodyList, section.blocks.length);
  return { section, hinges, bodyList, bodyOf, result: settlementMotion(m, section, hinges, bodyList, bodyOf) };
}
test('three hinges accommodate a moving support, close internally, and open every contact', () => {
  const m = fixture(), before = structuredClone(m), { result: r, hinges: h, section, bodyOf } = study(m);
  assert.equal(r.ok, true, r.reason); assert.equal(r.dof, 0); assert.deepEqual(r.supports, [8]);
  velocity(r.motions[0], h[0].point).forEach((v, i) => close(v, [.01, 0][i]));
  velocity(r.motions[1], h[2].point).forEach((v) => close(v, 0));
  velocity(r.motions[0], h[1].point).forEach((v, i) => close(v, velocity(r.motions[1], h[1].point)[i]));
  assert.ok(r.openings.every((v) => v > 0));
  assert.ok(boundaryMotionAllowed(section.boundaries, bodyOf, r.motions, 1, r.shifts));
  // At the translating contact the structural velocity is evaluated relative
  // to its support, so outward support motion is not mistaken for penetration.
  assert.deepEqual(m, before);
});
test('inward support motion is refused for the same hinge pattern', () => {
  const r = study(fixture([-.01, 0])).result;
  assert.equal(r.ok, false); assert.match(r.reason, /penetrate/);
});
test('four hinges retain a free mode and select an admissible representative', () => {
  const m = fixture();
  let found;
  for (let bits = 0; bits < 16; bits++) {
    const s = study(m, [0, 2, 5, 8].map((j, k) => [j, bits & (1 << k) ? 'extrados' : 'intrados']));
    if (s.result.ok) { found = s; break; }
  }
  assert.ok(found); assert.equal(found.result.dof, 1);
  assert.match(found.result.reason, /one free mode/);
  assert.ok(found.result.openings.every((v) => v >= -1e-10));
  for (let k = 1; k < 3; k++) velocity(found.result.motions[k - 1], found.hinges[k].point)
    .forEach((v, i) => close(v, velocity(found.result.motions[k], found.hinges[k].point)[i]));
});
test('settlement data follow the support through deletion/reordering, save/reopen and unit conversion', () => {
  const m = fixture([.01, -.02]);
  const saved = serialise({ model: m, system: 'SI' });
  const back = deserialise(JSON.stringify(saved)).model;
  assert.deepEqual(back.blocks[8].supportDisplacement, [.01, -.02]);
  const converted = convertModel(m, 'SI', 'Nmm');
  assert.deepEqual(converted.blocks[8].supportDisplacement, [10, -20]);
  const original = study(fixture()).result, scaled = study(convertModel(fixture(), 'SI', 'Nmm')).result;
  assert.ok(scaled.ok, scaled.reason);
  scaled.motions.forEach((motion, i) => { close(motion.omega, original.motions[i].omega); close(motion.vx, 1000 * original.motions[i].vx); close(motion.vy, 1000 * original.motions[i].vy); });
  const swapped = structuredClone(m); [swapped.blocks[8], swapped.blocks[9]] = [swapped.blocks[9], swapped.blocks[8]];
  assert.deepEqual(supportTranslations(swapped)[9], [.01, -.02]);
  saved.model.blocks[8].supportDisplacement = [1, null];
  assert.throws(() => deserialise(JSON.stringify(saved)), /invalid support translation/);
});
test('translations of unrelated layers and disconnected supports are never silently applied to the arch', () => {
  const m = fixture(); m.groups.push({ id: 3, role: 'fixed', z: 10 }); m.blockGroups[8] = 3;
  assert.match(study(m).result.reason, /active layer/);
  m.blockGroups[8] = 2; m.blocks[8] = { ...rect(20, 20, 21, 21), supportDisplacement: [.01, 0] };
  assert.match(study(m).result.reason, /not connected/);
});
test('solidary corresponding supports must have consistent translations', () => {
  const m = fixture();
  const blocks = structuredClone(m.blocks);
  m.blocks.push(...blocks); m.centroids.push(...blocks.map(blockCentroid)); m.weights.push(...blocks.map(() => 20));
  m.areas.push(...blocks.map(blockArea)); m.thickness.push(...blocks.map(() => 1));
  m.groups.push({ id: 3, z: 1 }, { id: 4, role: 'fixed', z: 1 });
  m.blockGroups.push(...blocks.map((_, i) => i < 8 ? 3 : 4));
  assert.ok(study(m).result.ok);
  m.blocks[18].supportDisplacement = [0, 0];
  assert.match(study(m).result.reason, /Conflicting translations/);
});
test('rigid visualization matches prescribed support translation and first-order hinge velocities', () => {
  const m = fixture(), s = study(m), r = s.result;
  const T0 = settlementTransforms(r.motions, 0), T = settlementTransforms(r.motions, 1e-5);
  for (let i = 0; i < 2; i++) {
    for (const [key, value] of Object.entries({ cos: 1, sin: 0, tx: 0, ty: 0 })) close(T0[i][key], value);
    const p = s.hinges[i].point, moved = transformPoint(T[i], p), v = velocity(r.motions[i], p);
    moved.forEach((x, j) => close((x - p[j]) / 1e-5, v[j], 1e-7));
    close(T[i].cos ** 2 + T[i].sin ** 2, 1);
  }
  // The same source-body map carries attached load pieces in both views.
  const load = rect(0, 6, 1, 7); m.blocks.push(load); m.blockGroups.push(3); m.groups.push({ id: 3, role: 'load', z: 0 });
  const assignments = regionBodyAssignments(m, s.section, s.bodyOf, [{ source: 10, owner: 0 }]);
  assignments[8] = 2;
  const allT = [...settlementTransforms(r.motions, 1), { cos: 1, sin: 0, tx: .01, ty: 0 }];
  const moved = displaced(m.blocks, assignments, allT);
  close(moved[8].x[0], m.blocks[8].x[0] + .01); assert.equal(assignments[10], assignments[0]);
  assert.deepEqual(moved[9], m.blocks[9]);
});
test('relative boundary contacts forbid a support moving into a stationary structural body', () => {
  const constraints = [{ block: 0, fixed: 1, point: [0, 0], normal: [0, 1] }];
  assert.equal(boundaryMotionAllowed(constraints, [-1], [], 1, [[0, 0], [0, .01]]), false);
  assert.equal(boundaryMotionAllowed(constraints, [-1], [], 1, [[0, 0], [0, -.01]]), true);
});

test('vertical settlement and equal translation of both supports satisfy the prescribed kinematics', () => {
  const m = fixture([0, -.01]);
  const picks = [[0, 'extrados'], [4, 'extrados'], [8, 'intrados']];
  const s = study(m, picks);
  assert.ok(s.result.ok, s.result.reason);
  velocity(s.result.motions[0], s.hinges[0].point).forEach((v, i) => close(v, [0, -.01][i]));
  velocity(s.result.motions[1], s.hinges[2].point).forEach((v) => close(v, 0));
  m.blocks[9].supportDisplacement = [0, -.01];
  const common = study(m, picks).result;
  assert.ok(common.ok, common.reason);
  common.motions.forEach((motion) => { close(motion.vx, 0); close(motion.vy, -.01); close(motion.omega, 0); });
  common.openings.forEach((v) => close(v, 0));
});
