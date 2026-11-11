import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockArea, blockCentroid, piecesOf } from '../docs/app/js/core/geometry.js';
import { subdivideLoadRegion, regionLoads, loadSurface } from '../docs/app/js/core/region-loads.js';
import { modelInLayer } from '../docs/app/js/core/layers.js';
import { multiplierInput, virtualWork } from '../docs/app/js/core/multiplier.js';
import { convertModel } from '../docs/app/js/core/units.js';
import { serialise, deserialise } from '../docs/app/js/core/persist.js';

const rect = (x0, y0, x1, y1) => ({ x: [x0, x1, x1, x0], y: [y0, y0, y1, y1] });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8 * Math.max(1, Math.abs(b)), `${a} != ${b}`);
function base() {
  const blocks = [rect(0, 0, 1, 1), rect(1, 0, 2, 1)];
  return { blocks, centroids: blocks.map(blockCentroid), areas: blocks.map(blockArea), weights: [20, 20], thickness: [1, 1],
    groups: [{ id: 1, role: 'structure', z: 0, gamma: 20, thickness: 1 }], blockGroups: [1, 1],
    frame: { coordinates: 'physical', units_per_pixel: 1 } };
}
function addRegion(m, blocks, role = 'load', z = 0) {
  const id = m.groups.length + 1; m.groups.push({ id, role, z, gamma: 20, thickness: 1 });
  for (const b of blocks) {
    m.blocks.push(b); m.centroids.push(blockCentroid(b)); m.areas.push(blockArea(b));
    m.weights.push(blockArea(b) * 20); m.thickness.push(1); m.blockGroups.push(id);
  }
}

test('structural upper-face endpoints project vertical cuts and preserve area and first moments', () => {
  const m = base(), outline = rect(0, 1, 2, 3), before = structuredClone(m);
  const cut = subdivideLoadRegion([outline], m);
  assert.deepEqual(cut.cuts, [0, 1, 2]); assert.equal(cut.blocks.length, 2);
  cut.areas.forEach((a) => close(a, 2));
  close(cut.areas.reduce((s, a) => s + a, 0), blockArea(outline));
  for (const axis of [0, 1]) close(cut.areas.reduce((s, a, k) => s + a * cut.centroids[k][axis], 0), blockArea(outline) * blockCentroid(outline)[axis]);
  assert.deepEqual(m, before);
});

test('concave disconnected slab pieces retain their actual material without invented bridges', () => {
  const m = base(), p = { x: [0, 2, 2, .5, .5, 2, 2, 0], y: [1, 1, 1.5, 1.5, 2.5, 2.5, 3, 3] };
  const cut = subdivideLoadRegion([p], m);
  close(cut.areas.reduce((s, a) => s + a, 0), blockArea(p));
  for (const axis of [0, 1]) close(cut.areas.reduce((s, a, k) => s + a * cut.centroids[k][axis], 0), blockArea(p) * blockCentroid(p)[axis]);
});

test('load regions are unamplified applied weights, with preserved line of action and structural ownership', () => {
  const m = base(), cut = subdivideLoadRegion([rect(0, 1, 2, 3)], m); addRegion(m, cut.blocks);
  addRegion(m, [rect(-1, -1, 0, 0)], 'fixed');
  const data = regionLoads(m), active = modelInLayer(m);
  assert.equal(data.issues.length, 0); assert.equal(data.transfers.length, 2);
  assert.deepEqual(active.sources, [[0], [1]]); assert.deepEqual(active.weights, [20, 20]);
  const input = multiplierInput(active, data.forces);
  assert.deepEqual(input.applied.map((f) => f.block), [0, 1]);
  assert.deepEqual(input.applied.map((f) => f.vector), [[0, -40], [0, -40]]);
  close(data.forces.magnitudes.reduce((s, w) => s + w, 0), 80);
  close(data.forces.points.reduce((s, p, k) => s + p[0] * data.forces.magnitudes[k], 0), 80);
  const work = virtualWork(input, [0, 0], { motions: [{ vx: 1, vy: 2, omega: .3 }] });
  // Horizontal seismic work uses structural masses only; dead loads do work in Lw.
  close(work.Lh, 34); close(work.Lw, -(20 * 2.15 + 20 * 2.45 + 40 * 2.15 + 40 * 2.45));
});

test('load transfer is layer-specific; missing receivers are reported instead of silently omitted', () => {
  const m = base(); addRegion(m, [rect(0, 2, 1, 3)], 'load', 2);
  assert.match(regionLoads(m).issues[0].reason, /no structural block below/);
  assert.throws(() => subdivideLoadRegion([rect(0, 2, 1, 3)], m, '2'), /Create structural blocks/);
  assert.match(regionLoads({ ...m, layerMode: 'poleni' }).issues[0].reason, /Poleni is excluded/);
});

test('roles and compound load strips survive saving, loading and unit conversion', () => {
  const m = base();
  const outline = { x: [0, 2, 2, .5, .5, 2, 2, 0], y: [1, 1, 1.5, 1.5, 2.5, 2.5, 3, 3] };
  addRegion(m, subdivideLoadRegion([outline], m).blocks);
  const json = serialise({ model: m, system: 'SI', forces: { points: [], magnitudes: [] } });
  const restored = deserialise(json).model;
  assert.deepEqual(restored.groups, m.groups); assert.deepEqual(restored.blocks, m.blocks);
  const mm = convertModel(restored, 'SI', 'Nmm');
  close(regionLoads(mm).transfers.reduce((s, t) => s + t.weight, 0), blockArea(outline) * 20000);
  assert.ok(mm.blocks.some((b) => piecesOf(b).length > 1));
  json.model.groups[0].role = 'unsupported'; assert.throws(() => deserialise(json), /invalid region role/);
});

test('overlapping load outlines remain ambiguous, while overlap with structure is tolerated', () => {
  const m = base();
  assert.throws(() => subdivideLoadRegion([rect(0, 1, 2, 3), rect(.5, 2, 1.5, 4)], m), /non-overlapping/);
  addRegion(m, [rect(.2, .5, .8, 1.5)]);
  const before = structuredClone(m), data = regionLoads(m);
  assert.equal(data.issues.length, 0); assert.equal(data.transfers.length, 1);
  assert.equal(data.transfers[0].owner, 0);
  close(data.transfers[0].weight, m.weights[2]);
  close(data.transfers[0].point[0], m.centroids[2][0]);
  close(data.transfers[0].point[1], 1);
  assert.deepEqual(m, before);
});

test('appending generated loads keeps legacy manual-force metadata aligned', () => {
  const m = base(); m.groups[0].z = 2;
  addRegion(m, [rect(0, 1, 1, 2)], 'load', 2);
  const f = { points: [[1, 4]], magnitudes: [3], x: [], z: [], layer: [] };
  const before = structuredClone(f), data = regionLoads(m, f);
  assert.deepEqual(data.forces.z, [0, 2]);
  assert.deepEqual(data.forces.x, [0, 0]);
  assert.deepEqual(data.forces.magnitudes, [3, 20]);
  assert.deepEqual(data.forces.regionSources, [null, 2]);
  assert.deepEqual(f, before);
});


test('a resultant inside structural material transfers to its upper face with unchanged weight and moment', () => {
  const m = base(); addRegion(m, [rect(.2, .6, .8, 1.2)]);
  const data = regionLoads(m);
  assert.equal(data.issues.length, 0); assert.equal(data.transfers.length, 1);
  const t = data.transfers[0];
  close(t.point[0], .5); close(t.point[1], 1); close(t.weight, .6 * .6 * 20);
  close(t.point[0] * t.weight, m.centroids[2][0] * m.weights[2]);
  const compound = { pieces: [rect(0, 0, 1, 1), rect(0, 3, 1, 4)] };
  close(loadSurface(compound, [.5, .9]), 1); // never lift onto unrelated material above
  assert.equal(loadSurface(compound, [.5, -1]), -Infinity);
});
