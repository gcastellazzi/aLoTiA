import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circularRing } from '../docs/app/js/core/blocks.js';
import { weighBlocks, centroidsOf, springings } from '../docs/app/js/core/trace.js';
import { blockArea } from '../docs/app/js/core/profile.js';
import { blockZ, layersOf, modelInLayer, forcesInLayer, layerThickness, solveLayer } from '../docs/app/js/core/layers.js';
import { solids } from '../docs/app/js/core/dome.js';
import { convertModel } from '../docs/app/js/core/units.js';
import { serialise, deserialise } from '../docs/app/js/core/persist.js';

function bridge() {
  const ring = circularRing({ centre: [0, 0], innerRadius: 4, outerRadius: 5,
    startAngle: 0, endAngle: 180, count: 12 });
  const groups = [{ id: 1, z: 0, thickness: 1 }, { id: 2, z: 1, thickness: 5 }, { id: 3, z: 6, thickness: 1 }];
  const blocks = groups.flatMap(() => ring.blocks);
  const thickness = groups.flatMap((g) => ring.blocks.map(() => g.thickness));
  return { blocks, centroids: centroidsOf(blocks), areas: blocks.map(blockArea), thickness,
    weights: groups.flatMap((g) => weighBlocks(ring.blocks, { specificWeight: 20, thickness: g.thickness })),
    blockGroups: groups.flatMap((g) => ring.blocks.map(() => g.id)), groups,
    frame: { coordinates: 'physical', units_per_pixel: 1 }, ...springings(ring.joints) };
}
const emptyForces = { points: [], magnitudes: [] };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8 * Math.max(1, Math.abs(b)), `${a} != ${b}`);

test('three bridge layers occupy 0..1, 1..6 and 6..7 in 3D without changing XY', () => {
  const m = bridge();
  assert.deepEqual(layersOf(m).map((l) => l.z), [0, 1, 6]);
  const list = solids(m.blocks, { thickness: m.thickness, z: m.blocks.map((_, i) => blockZ(m, i)) });
  [0, 1, 6].forEach((z, k) => {
    const depths = list[k * 12].flat().map((p) => p[1]);
    close(Math.min(...depths), z); close(Math.max(...depths), z + m.groups[k].thickness);
  });
  const moved = structuredClone(m); moved.groups[0].z = -200;
  assert.deepEqual(modelInLayer(moved, '-200').weights, modelInLayer(m, '0').weights);
});

test('combined XY section adds coincident block weights and thickness without duplicating joints', () => {
  const m = bridge(), all = modelInLayer(m);
  assert.equal(all.blocks.length, 12);
  assert.equal(all.joints.length, 13);
  assert.equal(all.sources[0].length, 3);
  const left = modelInLayer(m, '0');
  all.weights.forEach((w, i) => close(w, 7 * left.weights[i]));
  assert.ok(all.thickness.every((t) => t === 7));
  close(all.weights.reduce((s, w) => s + w, 0), m.weights.reduce((s, w) => s + w, 0));
});

test('H/t, rather than H/W, is shared: thicker identical layers trace the same line', () => {
  const m = bridge();
  const solutions = ['0', '1', '6'].map((key) => {
    const section = modelInLayer(m, key), t = layerThickness(m, key);
    return solveLayer(section, emptyForces, { startPos: 50, split: 50 }, 30 * t);
  });
  close(solutions[1].fp.thrust, 5 * solutions[0].fp.thrust);
  solutions[0].lot.points.forEach((p, i) => p.forEach((v, j) => close(v, solutions[1].lot.points[i][j])));
  // Different material changes the geometry of the line at the same H/t.
  m.weights = m.weights.map((w, i) => blockZ(m, i) === 1 ? w * 1.5 : w);
  const changed = solveLayer(modelInLayer(m, '1'), emptyForces, { startPos: 50, split: 50 }, 150);
  assert.ok(changed.lot.points.some((p, i) => Math.abs(p[1] - solutions[0].lot.points[i][1]) > 0.01));
});

test('loads belong to one layer and are counted once by the combined problem', () => {
  const f = { points: [[0, 5], [1, 4], [2, 3]], magnitudes: [10, 20, 30], x: [1, 2, 3], z: [0, 1, 6] };
  assert.deepEqual(forcesInLayer(f, '1').magnitudes, [20]);
  assert.deepEqual(forcesInLayer(f, '6').x, [3]);
  assert.deepEqual(forcesInLayer(f).magnitudes, [10, 20, 30]);
  assert.deepEqual(forcesInLayer(f).sourceIndices, [0, 1, 2]);
  const m = bridge(), section = modelInLayer(m, '1');
  const plain = solveLayer(section, emptyForces, {}, 150);
  const loaded = solveLayer(section, forcesInLayer(f, '1'), {}, 150);
  assert.equal(loaded.seq.weights.length, plain.seq.weights.length + 1);
});

test('nonuniform or zero thickness rejects normalized overlay without rejecting ordinary sections', () => {
  const m = bridge(); m.thickness[0] = 2;
  assert.equal(layerThickness(m, '0'), null);
  assert.equal(layerThickness(m, '1'), 5);
  assert.equal(modelInLayer(m, '0').blocks.length, 12);
  m.thickness.fill(0); assert.equal(layerThickness(m, '1'), null);
});

test('layer endpoints can differ and imposed endpoints close independently at the prescribed H', () => {
  const m = bridge();
  for (const [key, dy] of [['0', 0], ['1', 0.1]]) {
    const section = modelInLayer(m, key);
    const A = section.pointA.map((v, i) => v + (i ? dy : 0));
    const B = section.pointB.map((v, i) => v + (i ? dy : 0));
    const result = solveLayer(section, emptyForces, { A, B, imposed: true }, 30 * layerThickness(m, key));
    close(result.fp.thrust, 30 * layerThickness(m, key));
    close(result.lot.closureError, 0);
    assert.ok(result.lot.points.every((p) => p.every(Number.isFinite)));
  }
});

test('sessions round-trip Z, force layers, shared H/t and independent endpoints', () => {
  const layers = { selection: 'overlay', overlayLayer: '1', normalizedBase: 30,
    settings: { '0': { A: [-4, 0], B: [4, 0], imposed: true, thrust: 42 },
      '1': { A: [-4, 1], B: [4, 1], imposed: true, thrust: 61 } } };
  const state = { model: bridge(), layers, forces: { points: [[0, 4]], magnitudes: [12], z: [1] } };
  const restored = deserialise(JSON.stringify(serialise(state)));
  assert.deepEqual(restored.layers, layers);
  assert.deepEqual(restored.forces.z, [1]);
  assert.deepEqual(restored.model.groups.map((g) => g.z), [0, 1, 6]);
  const old = serialise(state); delete old.layers; delete old.forces.z;
  old.model.groups.forEach((g) => { delete g.z; });
  const compatible = deserialise(old);
  assert.deepEqual(layersOf(compatible.model).map((l) => l.z), [0]);
  assert.deepEqual(compatible.forces.z, [0]);
  const invalid = serialise(state); invalid.forces.z = [null];
  assert.throws(() => deserialise(invalid), /invalid force layers/);
});

test('converting units carries group Z as a length', () => {
  const m = bridge();
  const mm = convertModel(m, 'SI', 'Nmm');
  assert.deepEqual(mm.groups.map((g) => g.z), [0, 1000, 6000]);
  const restored = convertModel(mm, 'Nmm', 'SI');
  assert.deepEqual(restored.groups.map((g) => g.z), [0, 1, 6]);
});

test('filtering load regions recovers the exact cuts of a finely subdivided structural arch', () => {
  const ring = circularRing({ centre: [0, 0], innerRadius: 14, outerRadius: 17,
    startAngle: 0, endAngle: 180, count: 100 });
  const load = { x: [-18, 18, 18, -18], y: [18, 18, 19, 19] };
  const blocks = [...ring.blocks, load];
  const m = { blocks, centroids: centroidsOf(blocks), areas: blocks.map(blockArea),
    thickness: blocks.map(() => 1), weights: weighBlocks(blocks, { specificWeight: 20, thickness: 1 }),
    groups: [{ id: 1, role: 'structure', z: 0 }, { id: 2, role: 'load', z: 0 }],
    blockGroups: [...ring.blocks.map(() => 1), 2], joints: null };
  const before = structuredClone(m);
  for (const key of ['0', 'all']) {
    const section = modelInLayer(m, key);
    assert.equal(section.joints.length, 101);
    assert.deepEqual(section.sources, ring.blocks.map((_, i) => [i]));
    section.joints.forEach((j, i) => {
      for (const end of ['a', 'b']) for (const axis of [0, 1]) close(j[end][axis], ring.joints[i][end][axis]);
    });
  }
  assert.deepEqual(m, before);
});
