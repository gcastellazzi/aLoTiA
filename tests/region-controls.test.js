import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { zKey, layerThickness } from '../docs/app/js/core/layers.js';
import { circularRing } from '../docs/app/js/core/blocks.js';
import { centroidsOf, weighBlocks } from '../docs/app/js/core/trace.js';
import { blockArea } from '../docs/app/js/core/geometry.js';
import { equivalentLayer } from '../docs/app/js/core/equivalent-layer.js';
import { regionLoads } from '../docs/app/js/core/region-loads.js';
import { multiplierInput } from '../docs/app/js/core/multiplier.js';
const app = fs.readFileSync(new URL('../docs/app/js/app.js', import.meta.url), 'utf8');
function source(name) {
  const start = app.indexOf(`function ${name}(`), end = app.indexOf('\nfunction ', start + 1);
  return app.slice(start, end);
}

test('regenerating a load profile preserves structural and fixed profiles in the same Z', () => {
  const previous = { blocks: ['structure', 'old load', 'fixed'], centroids: [[0, 0], [1, 1], [2, 2]],
    groups: [{ id: 1, method: 'profile', z: 0 }, { id: 2, method: 'profile', role: 'load', z: 0 },
      { id: 3, method: 'profile', role: 'fixed', z: 0 }], blockGroups: [1, 2, 3] };
  const ctx = { state: { model: { blocks: ['new load'], centroids: [[1, 2]] } },
    ui: { blockZ: { value: '0' }, regionRole: { value: 'load' } }, zKey };
  vm.createContext(ctx); vm.runInContext(source('mergeGeneratedLayer'), ctx); ctx.mergeGeneratedLayer(previous, 'profile');
  assert.deepEqual(Array.from(ctx.state.model.blocks), ['structure', 'fixed', 'new load']);
  assert.deepEqual(Array.from(ctx.state.model.blockGroups), [1, 3]);
});

test('equivalent reduction retains only structure while transferring region loads to globally mapped owners', () => {
  const ring = circularRing({ innerRadius: 4, outerRadius: 5, count: 8 });
  const load = { x: [-.5, .5, .5, -.5], y: [6, 6, 7, 7] };
  const fixed = { x: [-5, 5, 5, -5], y: [-1, -1, 0, 0] };
  const blocks = [...ring.blocks, load, fixed, ...ring.blocks, load, fixed];
  const groups = [{ id: 1, z: 0 }, { id: 2, z: 0, role: 'load' }, { id: 3, z: 0, role: 'fixed' },
    { id: 4, z: 2 }, { id: 5, z: 2, role: 'load' }, { id: 6, z: 2, role: 'fixed' }];
  const m = { blocks, centroids: centroidsOf(blocks), areas: blocks.map(blockArea),
    weights: [...weighBlocks(ring.blocks, { specificWeight: 20, thickness: 1 }), 20, 200,
      ...weighBlocks(ring.blocks, { specificWeight: 20, thickness: 1 }), 20, 200],
    thickness: blocks.map((_, i) => [8, 9, 18, 19].includes(i) ? 99 : 1), groups,
    blockGroups: [...ring.blocks.map(() => 1), 2, 3, ...ring.blocks.map(() => 4), 5, 6] };
  assert.equal(layerThickness(m, '0'), 1); // nonstructural depths do not spoil H/t
  const data = regionLoads(m), eq = equivalentLayer(m, data.forces);
  assert.equal(data.issues.length, 0); assert.ok(eq.ok, eq.reason);
  assert.equal(eq.model.blocks.length, 8);
  assert.ok(eq.model.sources.flat().every((i) => ![8, 9, 18, 19].includes(i)));
  const input = multiplierInput(eq.model, eq.forces);
  assert.equal(input.applied.length, 2);
  data.transfers.forEach((t, i) => assert.equal(input.applied[i].block, eq.model.sources.findIndex((ids) => ids.includes(t.owner))));
});
