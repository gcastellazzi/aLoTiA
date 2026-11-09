import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { zKey } from '../docs/app/js/core/layers.js';
import { blockArea } from '../docs/app/js/core/profile.js';

const app = fs.readFileSync(new URL('../docs/app/js/app.js', import.meta.url), 'utf8');
function source(name) {
  const start = app.indexOf(`function ${name}(`);
  const next = app.indexOf('\nfunction ', start + 1);
  assert.ok(start >= 0 && next > start);
  return app.slice(start, next);
}
const plain = (v) => JSON.parse(JSON.stringify(v));

test('regenerating one generator at one Z retains other layers and other groups', () => {
  const previous = {
    blocks: ['left', 'centre', 'right', 'fill'], centroids: [[0, 0], [1, 1], [2, 2], [3, 3]],
    areas: [1, 2, 3, 4], weights: [10, 100, 20, 5], thickness: [1, 5, 1, 5],
    groups: [{ id: 1, method: 'ring', z: 0 }, { id: 2, method: 'ring', z: 1 },
      { id: 3, method: 'ring', z: 6 }, { id: 4, method: 'draw', z: 1 }],
    blockGroups: [1, 2, 3, 4],
  };
  const fresh = { blocks: ['new centre'], centroids: [[9, 9]], areas: [3], weights: [150], thickness: [5] };
  const context = { state: { model: fresh }, ui: { blockZ: { value: '1' } }, zKey };
  vm.createContext(context); vm.runInContext(source('mergeGeneratedLayer'), context);
  context.mergeGeneratedLayer(previous, 'ring');
  assert.deepEqual(plain(context.state.model.blocks), ['left', 'right', 'fill', 'new centre']);
  assert.deepEqual(plain(context.state.model.weights), [10, 20, 5, 150]);
  assert.deepEqual(plain(context.state.model.blockGroups), [1, 3, 4]);
  assert.deepEqual(plain(context.state.model.groups).map((g) => g.id), [1, 3, 4]);
  // With a new Z, all existing layers survive.
  context.state.model = fresh; context.ui.blockZ.value = '9';
  context.mergeGeneratedLayer(previous, 'ring');
  assert.equal(context.state.model.blocks.length, 5);
  assert.equal(context.state.model.groups.length, 4);
});

test('switching layers restores independent A/B, start position, split and thrust; overlay retains common slider', () => {
  const context = {
    state: { layers: { selection: '0', settings: {}, overlayLayer: '0', overlayThrust: 50 },
      ends: { A: [-4, 0], B: [4, 0] } },
    ui: { imposeEnds: { checked: true }, imposeEnds2: {}, startPos: { value: '15' },
      split: { value: '42' }, thrust: { value: '30' }, mechOn: { checked: false } },
  };
  context.setThrustSlider = (v) => { context.ui.thrust.value = String(v); };
  vm.createContext(context);
  for (const name of ['editingLayer', 'rememberLayer', 'restoreLayer']) vm.runInContext(source(name), context);
  context.rememberLayer(); context.state.layers.selection = '1'; context.restoreLayer();
  assert.equal(context.ui.startPos.value, '50'); assert.equal(context.state.ends.A, null);
  context.state.ends = { A: [-3, 1], B: [3, 1] };
  context.ui.startPos.value = '80'; context.ui.split.value = '55'; context.ui.thrust.value = '70';
  context.rememberLayer(); context.state.layers.selection = '0'; context.restoreLayer();
  assert.deepEqual(plain(context.state.ends.A), [-4, 0]);
  assert.equal(context.ui.startPos.value, '15'); assert.equal(context.ui.split.value, '42'); assert.equal(context.ui.thrust.value, '30');
  context.state.layers.selection = 'overlay'; context.restoreLayer(); context.ui.thrust.value = '62'; context.rememberLayer();
  context.state.layers.overlayLayer = '1'; context.restoreLayer();
  assert.equal(context.ui.startPos.value, '80'); assert.equal(context.ui.thrust.value, '62');
  assert.deepEqual(plain(context.state.ends.A), [-3, 1]);
  assert.equal(context.state.layers.settings['1'].thrust, 70);
});

test('old projects without groups retain their thickness and weight when grouping for layer Z=0', () => {
  const rect = { x: [0, 2, 2, 0], y: [0, 0, 1, 1] };
  const m = { blocks: [rect, rect, rect], thickness: [1, 5, 1], weights: [40, 300, 40], groups: [], blockGroups: [] };
  const context = { blockArea, groupName: (_, i) => `Imported ${i}`, groupColour: () => '#aaa' };
  vm.createContext(context); vm.runInContext(source('importLegacyGroups'), context);
  context.importLegacyGroups(m, 3, 20, 1);
  assert.equal(m.groups.length, 2);
  assert.ok(m.groups.every((g) => g.z === 0));
  m.blocks.forEach((b, i) => {
    const g = m.groups.find((g) => g.id === m.blockGroups[i]);
    assert.equal(g.thickness, m.thickness[i]);
    assert.equal(blockArea(b) * g.thickness * g.gamma, m.weights[i]);
  });
});
