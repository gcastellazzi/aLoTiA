import { test } from 'node:test';
import assert from 'node:assert/strict';
import { referenceChord, angleForChord, angularBlockProperties, angularBlockSolid,
  angularPeriod, radialFirstMoment, validateAngularLayer } from '../docs/app/js/core/poleni-layers.js';
import { blockLayerKey, layersOf, layerReferenceWidth, modelInLayer, forcesInLayer, solveLayer } from '../docs/app/js/core/layers.js';
import { solids } from '../docs/app/js/core/dome.js';
import { convertModel } from '../docs/app/js/core/units.js';
import { serialise, deserialise } from '../docs/app/js/core/persist.js';
import { circularRing } from '../docs/app/js/core/blocks.js';
import { blockArea, blockCentroid } from '../docs/app/js/core/profile.js';
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const rect = (x0, x1, y0 = 0, y1 = 1) => ({ x: [x0, x1, x1, x0], y: [y0, y0, y1, y1] });
const layer = (id, mode, startAngle = 0, angleDeg = 20) => ({ id, mode, startAngle, angleDeg });
function dome() {
  const ring = circularRing({ centre: [0, 0], innerRadius: 4, outerRadius: 5, startAngle: 0, endAngle: 180, count: 12 }).blocks;
  const poleniLayers = [layer('p:1', 'tapered'), layer('p:2', 'rib', 30), layer('p:3', 'tapered', 60, 10)];
  const groups = poleniLayers.map((l, i) => ({ id: i + 1, poleniLayer: l.id, z: 0, gamma: 20, thickness: 1 }));
  const blocks = groups.flatMap(() => ring);
  const props = groups.flatMap((g, k) => ring.map((b) => angularBlockProperties(b, poleniLayers[k], { axisX: 0, referenceRadius: 5, gamma: g.gamma })));
  return { layerMode: 'poleni', poleniLayers, poleniRadius: 5, groups, blocks,
    blockGroups: groups.flatMap((g) => ring.map(() => g.id)), centroids: blocks.map(blockCentroid),
    areas: blocks.map(blockArea), weights: props.map((d) => d.weight), thickness: props.map((d) => d.width),
    frame: { coordinates: 'physical', units_per_pixel: 1 } };
}

test('angle and reference chord are inverse representations of the minor sector', () => {
  for (const r of [1, 5, 1000]) for (const a of [0.1, 15, 90, 180]) close(angleForChord(r, referenceChord(r, a)), a);
  assert.throws(() => angleForChord(5, 11), /2R/);
  assert.throws(() => referenceChord(0, 20));
  assert.throws(() => referenceChord(5, 181));
  assert.equal(validateAngularLayer(layer('p:1', 'rib', 0, 20)), true);
  assert.equal(validateAngularLayer(layer('p:1', 'rib', 0, 0)), false);
});

test('tapered volumes integrate the radial first moment; ribs keep area times constant width', () => {
  const options = { axisX: 0, referenceRadius: 5, gamma: 20 };
  const near = rect(1, 2), far = rect(3, 4);
  const taperNear = angularBlockProperties(near, layer('p:1', 'tapered'), options);
  const taperFar = angularBlockProperties(far, layer('p:1', 'tapered'), options);
  close(taperNear.volume, 1.5 * 20 * Math.PI / 180);
  close(taperFar.volume / taperNear.volume, 3.5 / 1.5);
  assert.ok(taperFar.width > taperNear.width);
  const ribNear = angularBlockProperties(near, layer('p:2', 'rib'), options);
  const ribFar = angularBlockProperties(far, layer('p:2', 'rib'), options);
  close(ribNear.width, ribFar.width); close(ribNear.volume, ribFar.volume);
  close(ribNear.weight, 20 * referenceChord(5, 20));
  // R is a reference for a sector, and a physical width-setting datum for a rib.
  close(angularBlockProperties(near, layer('p:1', 'tapered'), { ...options, referenceRadius: 10 }).weight, taperNear.weight);
  close(angularBlockProperties(near, layer('p:2', 'rib'), { ...options, referenceRadius: 10 }).weight, 2 * ribNear.weight);
});

test('a crown block crossing the axis has positive volume and is invariant to vertex winding', () => {
  const block = rect(-1, 1);
  close(radialFirstMoment(block), 1);
  close(radialFirstMoment({ x: [...block.x].reverse(), y: [...block.y].reverse() }), 1);
  const shifted = rect(9, 11); close(radialFirstMoment(shifted, 10), 1);
  close(angularBlockProperties(block, layer('p:1', 'tapered'), { referenceRadius: 5 }).volume, 20 * Math.PI / 180);
});

test('3D ribs have constant transverse width and rotate without changing volume or height', () => {
  const l = layer('p:1', 'rib', 70, 10), c = referenceChord(5, 10);
  const a = (70 + 5) * Math.PI / 180;
  for (const block of [rect(1, 2), rect(3, 4)]) {
    const faces = angularBlockSolid(block, l, { referenceRadius: 5 });
    const transverse = faces.flat().map(([x, d]) => -x * Math.sin(a) + d * Math.cos(a));
    close(Math.max(...transverse) - Math.min(...transverse), c);
    assert.ok(faces.flat().every((p) => p.every(Number.isFinite)));
    close(Math.max(...faces.flat().map((p) => p[2])), 1);
  }
});

test('tapered solids keep their true radius and explicit start/end angles', () => {
  const faces = angularBlockSolid(rect(2, 3), layer('p:1', 'tapered', 25, 20), { referenceRadius: 5 });
  const angles = faces.flat().map(([x, d]) => Math.atan2(d, x) * 180 / Math.PI);
  close(Math.min(...angles), 25); close(Math.max(...angles), 45);
  const radii = faces.flat().map(([x, d]) => Math.hypot(x, d));
  close(Math.min(...radii), 2); close(Math.max(...radii), 3);
  assert.equal(angularPeriod([rect(-5, -4), rect(4, 5)]), 180);
  assert.equal(angularPeriod([rect(4, 5)]), 360);
});

test('explicit angular solids keep their configured positions and are never auto-repeated', () => {
  const m = dome(), definitions = m.blocks.map((_, i) => m.poleniLayers.find((l) => l.id === blockLayerKey(m, i)));
  const opt = { poleni: true, referenceRadius: m.poleniRadius, layerDefinitions: definitions };
  assert.deepEqual(solids(m.blocks, { ...opt, full: true }), solids(m.blocks, { ...opt, full: false }));
  assert.deepEqual(solids([m.blocks[0]], { ...opt, layerDefinitions: [definitions[0]] })[0], angularBlockSolid(m.blocks[0], definitions[0], { referenceRadius: 5 }));
});

test('angular layers split and combine XY weights while retaining force ownership', () => {
  const m = dome(); assert.equal(layersOf(m).length, 3);
  const f = { points: [[0, 5], [1, 4]], magnitudes: [30, 50], x: [0, 10], z: [0, 0], layer: ['p:1', 'p:2'] };
  assert.deepEqual(forcesInLayer(f, 'p:2', m).magnitudes, [50]);
  assert.equal(forcesInLayer(f, 'p:3', m).points.length, 0);
  assert.equal(forcesInLayer(f, 'all', m).points.length, 2);
  const combined = modelInLayer(m); assert.equal(combined.blocks.length, 12); assert.equal(combined.joints.length, 13);
  close(combined.weights.reduce((a, b) => a + b, 0), m.weights.reduce((a, b) => a + b, 0));
  assert.equal(modelInLayer(m, 'p:2').blocks.length, 12);
});

test('overlay uses H/c_ref for both modes even when local tapered widths vary', () => {
  const m = dome(), results = layersOf(m).map((l) => {
    const c = layerReferenceWidth(m, l.key);
    const solution = solveLayer(modelInLayer(m, l.key), { points: [], magnitudes: [] }, {}, 30 * c);
    close(solution.fp.thrust / c, 30);
    assert.ok(solution.lot.points.every((p) => p.every(Number.isFinite)));
    return solution;
  });
  close(results[0].fp.thrust, results[1].fp.thrust); // same reference chord, different mass law
  assert.ok(results[0].lot.points.some((p, i) => Math.abs(p[1] - results[1].lot.points[i][1]) > 0.01));
});

test('angular IDs, modes, radius, forces and per-layer ends survive session and unit round trips', () => {
  const m = dome();
  const state = { model: m, forces: { points: [[0, 5]], magnitudes: [40], z: [0], layer: ['p:2'] },
    layers: { selection: 'p:2', overlayLayer: 'p:1', normalizedBase: 30,
      settings: { 'p:2': { A: [-4, 0], B: [4, 0], imposed: true, thrust: 60 } } }, dome: { poleni: true } };
  const read = deserialise(JSON.stringify(serialise(state)));
  assert.deepEqual(read.model.poleniLayers, m.poleniLayers);
  assert.equal(read.model.layerMode, 'poleni'); assert.equal(read.model.poleniRadius, 5);
  assert.deepEqual(read.forces.layer, ['p:2']); assert.deepEqual(read.layers, state.layers);
  const mm = convertModel(m, 'SI', 'Nmm'); assert.equal(mm.poleniRadius, 5000);
  assert.deepEqual(mm.poleniLayers, m.poleniLayers);
  close(layerReferenceWidth(mm, 'p:2'), 1000 * layerReferenceWidth(m, 'p:2'));
  const back = convertModel(mm, 'Nmm', 'SI'); close(back.poleniRadius, m.poleniRadius);
  const invalid = serialise(state); invalid.model.poleniLayers[0].angleDeg = 200;
  assert.throws(() => deserialise(invalid), /invalid angular layer geometry/);
});
