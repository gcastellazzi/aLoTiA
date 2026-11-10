import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { angularPeriod, normalAngle, angularBlockProperties } from '../docs/app/js/core/poleni-layers.js';
import { blockCentroid, blockArea } from '../docs/app/js/core/profile.js';
const app = fs.readFileSync(new URL('../docs/app/js/app.js', import.meta.url), 'utf8');
function source(name) {
  const a = app.indexOf(`function ${name}(`), b = app.indexOf('\nfunction ', a + 1);
  assert.ok(a >= 0 && b > a); return app.slice(a, b);
}
function harness() {
  const blocks = [{ x: [3, 4, 4, 3], y: [0, 0, 1, 1] }, { x: [-4, -3, -3, -4], y: [0, 0, 1, 1] }];
  const definition = { id: 'p:1', startAngle: 0, angleDeg: 15, mode: 'tapered' };
  const m = { layerMode: 'poleni', poleniLayers: [definition], poleniRadius: 4,
    groups: [{ id: 1, poleniLayer: 'p:1', z: 0, gamma: 20, thickness: 1, name: 'base' }],
    blocks, blockGroups: [1, 1], centroids: blocks.map(blockCentroid), areas: blocks.map(blockArea), thickness: [1, 1], weights: [1, 1] };
  const forces = { points: [[3, 1]], magnitudes: [10], x: [2], bases: [[2, 10]], z: [0], layer: ['p:1'] };
  const context = { state: { model: m, forces, layers: { selection: 'p:1', settings: { 'p:1': { A: [-3, 1], B: [3, 1] } } } },
    ui: { poleniLayerSelect: { value: 'p:1' }, repeatAngularCount: { value: '4' }, domeAxis: { value: '0' }, angularStatus: {} },
    angularPeriod, normalAngle, structuredClone, rememberLayer() {}, ensureForceBases() {}, editingLayer: () => 'p:1',
    listForces() {}, recompute() {}, fitForceView() {}, draw() {},
  };
  context.reweigh = () => {
    m.weights = m.blocks.map((b, i) => {
      const g = m.groups.find((g) => g.id === m.blockGroups[i]);
      const l = m.poleniLayers.find((l) => l.id === g.poleniLayer);
      return angularBlockProperties(b, l, { referenceRadius: 4, gamma: g.gamma }).weight;
    });
  };
  context.reweigh(); vm.createContext(context); vm.runInContext(source('repeatAngularLayers'), context);
  return context;
}

test('explicit repetition of a paired meridian covers 180 degrees once and copies forces/settings once', () => {
  const ctx = harness(), originalWeight = ctx.state.model.weights.reduce((a, b) => a + b, 0);
  ctx.repeatAngularLayers();
  const { model: m, forces, layers } = ctx.state;
  assert.equal(m.poleniLayers.length, 4);
  assert.deepEqual(m.poleniLayers.map((l) => l.startAngle), [0, 45, 90, 135]);
  assert.equal(m.blocks.length, 8); assert.equal(m.groups.length, 4);
  assert.equal(forces.points.length, 4); assert.equal(new Set(forces.layer).size, 4);
  assert.equal(forces.magnitudes.reduce((a, b) => a + b, 0), 40);
  assert.ok(Math.abs(m.weights.reduce((a, b) => a + b, 0) - 4 * originalWeight) < 1e-9);
  assert.deepEqual(layers.settings['p:2'], layers.settings['p:1']);
  assert.notEqual(layers.settings['p:2'].A, layers.settings['p:1'].A);
  assert.match(ctx.ui.angularStatus.textContent, /360° dome/);
});

test('repetition rejects overlapping target openings or existing angles atomically', () => {
  const ctx = harness(), m = ctx.state.model;
  m.poleniLayers[0].angleDeg = 60;
  ctx.repeatAngularLayers(); assert.equal(m.blocks.length, 2); assert.match(ctx.ui.angularStatus.textContent, /overlap/);
  m.poleniLayers[0].angleDeg = 15;
  m.poleniLayers.push({ id: 'p:2', startAngle: 45, angleDeg: 15, mode: 'rib' });
  ctx.repeatAngularLayers(); assert.equal(m.blocks.length, 2); assert.match(ctx.ui.angularStatus.textContent, /already exists/);
});

test('single-sided meridians repeat over 360 degrees rather than assuming a paired profile', () => {
  const ctx = harness(), m = ctx.state.model;
  for (const field of ['blocks', 'blockGroups', 'centroids', 'areas', 'thickness', 'weights']) m[field] = m[field].slice(0, 1);
  ctx.repeatAngularLayers();
  assert.deepEqual(m.poleniLayers.map((l) => l.startAngle), [0, 90, 180, 270]);
  assert.equal(m.blocks.length, 4);
});
