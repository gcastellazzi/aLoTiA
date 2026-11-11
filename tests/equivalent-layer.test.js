import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circularRing } from '../docs/app/js/core/blocks.js';
import { centroidsOf, weighBlocks } from '../docs/app/js/core/trace.js';
import { blockArea, piecesOf } from '../docs/app/js/core/geometry.js';
import { modelInLayer } from '../docs/app/js/core/layers.js';
import { equivalentLayer } from '../docs/app/js/core/equivalent-layer.js';
import { multiplierInput, minimumMultiplier, virtualWork, openingRates } from '../docs/app/js/core/multiplier.js';
import { displaced } from '../docs/app/js/core/mechanism.js';
import { serialise, deserialise } from '../docs/app/js/core/persist.js';
import { convertModel } from '../docs/app/js/core/units.js';

const close = (a, b) => assert.ok(Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b)), `${a} != ${b}`);
function bridge(different = true) {
  const rings = [circularRing({ innerRadius: 4, outerRadius: 5, count: 12 }),
    circularRing({ innerRadius: different ? 4.2 : 4, outerRadius: different ? 5.3 : 5, count: 12 }),
    circularRing({ innerRadius: 4, outerRadius: 5, count: 12 })];
  const groups = [{ id: 1, z: 0, thickness: 1 }, { id: 2, z: 1, thickness: 5 }, { id: 3, z: 6, thickness: 1 }];
  const blocks = rings.flatMap((r) => r.blocks);
  return { blocks, centroids: centroidsOf(blocks), areas: blocks.map(blockArea),
    weights: rings.flatMap((r, k) => weighBlocks(r.blocks, { thickness: groups[k].thickness, specificWeight: 20 + k })),
    thickness: groups.flatMap((g) => rings[0].blocks.map(() => g.thickness)), groups,
    blockGroups: groups.flatMap((g) => rings[0].blocks.map(() => g.id)),
    frame: { coordinates: 'physical', units_per_pixel: 1 } };
}

test('equivalent layer conserves weights and first moments, retains sources, central reference and original geometry', () => {
  const m = bridge(), original = structuredClone(m), eq = equivalentLayer(m);
  assert.ok(eq.ok, eq.reason);
  assert.equal(eq.model.blocks.length, 12); assert.equal(eq.model.joints.length, 13);
  assert.equal(eq.model.equivalent.centralZ, 3.5);
  eq.model.sources.forEach((ids, k) => {
    assert.equal(ids.length, 3);
    close(eq.model.weights[k], ids.reduce((s, i) => s + m.weights[i], 0));
    for (const axis of [0, 1]) close(eq.model.weights[k] * eq.model.centroids[k][axis], ids.reduce((s, i) => s + m.weights[i] * m.centroids[i][axis], 0));
    assert.equal(piecesOf(eq.model.blocks[k]).length, 3);
  });
  eq.model.joints.forEach((j) => { close(Math.hypot(...j.a), 4); close(Math.hypot(...j.b), 5.3); });
  assert.deepEqual(m, original);
  eq.model.blocks[0].pieces[0].x[0] = 12345;
  assert.deepEqual(m, original);
});

test('reversed layer block order is matched by joints, not array position', () => {
  const m = bridge(), base = equivalentLayer(m);
  for (const field of ['blocks', 'centroids', 'weights', 'thickness', 'areas', 'blockGroups']) {
    m[field].splice(12, 12, ...m[field].slice(12, 24).reverse());
  }
  const eq = equivalentLayer(m); assert.ok(eq.ok, eq.reason);
  assert.deepEqual(eq.model.joints, base.model.joints);
  eq.model.weights.forEach((w, i) => close(w, base.model.weights[i]));
});

test('incompatible joints, point contact, missing blocks and Poleni are refused with diagnostics', () => {
  for (const [ri, ro] of [[5, 6], [5.1, 6.1]]) {
    const m = bridge(), ring = circularRing({ innerRadius: ri, outerRadius: ro, count: 12 });
    m.blocks.splice(12, 12, ...ring.blocks); m.centroids = centroidsOf(m.blocks);
    const eq = equivalentLayer(m); assert.equal(eq.ok, false); assert.match(eq.reason, /compatible ordered chain/);
  }
  const m = bridge();
  m.blocks.slice(12, 24).forEach((b) => { b.x = b.x.map((x) => x + .1); });
  assert.equal(equivalentLayer(m).ok, false);
  assert.match(equivalentLayer({ ...bridge(), layerMode: 'poleni' }).reason, /Poleni is excluded/);
  assert.equal(equivalentLayer(bridge(), {}, { poleni: true }).ok, false);
  const missing = bridge(); missing.blockGroups[12] = 1;
  assert.match(equivalentLayer(missing).reason, /same number/);
  assert.equal(equivalentLayer(null).ok, false);
});

test('equivalent alpha equals the original chain for identical profiles and is independent of uniform thickness scaling', () => {
  const m = bridge(false), eq = equivalentLayer(m);
  assert.ok(eq.ok, eq.reason);
  const a = minimumMultiplier(multiplierInput(eq.model));
  const single = { ...eq.model, blocks: m.blocks.slice(0, 12), weights: m.weights.slice(0, 12), centroids: m.centroids.slice(0, 12) };
  const b = minimumMultiplier(multiplierInput(single));
  for (const side of ['plus', 'minus']) close(a[side].alpha, b[side].alpha);
  m.weights = m.weights.map((w) => 7 * w); m.thickness = m.thickness.map((t) => t * 7);
  const scaled = equivalentLayer(m), c = minimumMultiplier(multiplierInput(scaled.model));
  for (const side of ['plus', 'minus']) close(a[side].alpha, c[side].alpha);
});

test('layer-owned forces and virtual work survive reduction, without averaging layer multipliers', () => {
  const m = bridge(), p = [9, 4]; // outside the masonry: nearest block must be sought in its own layer
  const forces = { points: [p, m.centroids[28]], magnitudes: [9, 4], x: [3, -2], z: [1, 6] };
  const eq = equivalentLayer(m, forces); assert.ok(eq.ok, eq.reason);
  const input = multiplierInput(eq.model, eq.forces), result = minimumMultiplier(input).plus;
  assert.ok(result && !result.reason);
  assert.deepEqual(input.applied.map((f) => f.point), forces.points);
  assert.deepEqual(input.applied.map((f) => f.vector), [[3, -9], [-2, -4]]);
  forces.points.forEach((point, i) => {
    const own = modelInLayer(m, String(forces.z[i]));
    const local = multiplierInput(own, { points: [point], magnitudes: [forces.magnitudes[i]], x: [forces.x[i]] }).applied[0].block;
    const originalIndex = own.sources[local][0];
    assert.equal(input.applied[i].block, eq.model.sources.findIndex((ids) => ids.includes(originalIndex)));
  });
  const bodyOf = m.blocks.map((_, i) => result.bodyOf[eq.model.sources.findIndex((ids) => ids.includes(i))]);
  const original = { ...input, weights: m.weights, centroids: m.centroids, nBlocks: m.blocks.length,
    applied: input.applied.map((f, i) => ({ ...f, block: eq.model.sources[f.block].find((id) => m.groups.find((g) => g.id === m.blockGroups[id]).z === forces.z[i]) })) };
  const a = virtualWork(input, result.bodyOf, result.motion);
  const b = virtualWork(original, bodyOf, result.motion);
  close(a.Lh, b.Lh); close(a.Lw, b.Lw);
  assert.ok(openingRates(result.hinges, result.motion).every((v) => v >= -1e-8));
  // At both endpoints of every source contact, relative velocity has the
  // opening sign of the union. No original straight contact penetrates.
  for (const key of ['0', '1', '6']) for (const face of ['a', 'b']) {
    const originalJoints = modelInLayer(m, key).joints;
    const hinges = result.hinges.map((h) => ({ ...h, opposite: originalJoints[h.joint][face] }));
    assert.ok(openingRates(hinges, result.motion).every((v) => v >= -1e-8));
  }
  assert.match(equivalentLayer(m, { points: [[0, 0]], magnitudes: [1], z: [100] }).reason, /no blocks/);
});

test('displacements preserve each source shape and also support compound equivalent blocks', () => {
  const m = bridge(), eq = equivalentLayer(m), transforms = [{ cos: 0, sin: 1, tx: 2, ty: -1 }];
  const moved = displaced(eq.model.blocks, eq.model.blocks.map(() => 0), transforms);
  moved.forEach((b, k) => piecesOf(b).forEach((p, part) => {
    const src = m.blocks[eq.model.sources[k][part]];
    p.x.forEach((x, i) => close(x, 2 - src.y[i]));
    p.y.forEach((y, i) => close(y, src.x[i] - 1));
  }));
  assert.deepEqual(displaced(eq.model.blocks, [], []), eq.model.blocks);
});

test('only equivalent selection persists; the derived layer is rebuilt from editable sources after loading or unit conversion', () => {
  const m = bridge(), state = { model: m, system: 'SI', forces: { points: [], magnitudes: [] },
    layers: { selection: 'equivalent', settings: { equivalent: { A: [4, 0], B: [-4, 0] } } } };
  const json = serialise(state), restored = deserialise(json);
  assert.equal(restored.layers.selection, 'equivalent');
  assert.equal(json.model.equivalent, undefined);
  assert.ok(equivalentLayer(restored.model).ok);
  const converted = equivalentLayer(convertModel(m, 'SI', 'Nmm'));
  assert.ok(converted.ok, converted.reason); close(converted.model.equivalent.centralZ, 3500);
});

test('compatibility is independent of units and coordinate origin; crossed or duplicate stones cannot invent contacts', () => {
  for (const [factor, shift] of [[1e-4, 0], [1, 1e6], [1000, -1e7]]) {
    const m = bridge();
    m.blocks.forEach((b) => { b.x = b.x.map((x) => x * factor + shift); b.y = b.y.map((y) => y * factor + shift); });
    m.centroids = centroidsOf(m.blocks);
    const eq = equivalentLayer(m); assert.ok(eq.ok, `${factor}, ${shift}: ${eq.reason}`);
    close((eq.model.joints[0].b[0] - eq.model.joints[0].a[0]) / factor, 1.3);
  }
  const m = bridge(); m.blocks[1] = structuredClone(m.blocks[0]); m.centroids = centroidsOf(m.blocks);
  assert.equal(equivalentLayer(m).ok, false);
});
