import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { EQUIVALENT_LAYER } from '../docs/app/js/core/equivalent-layer.js';

const app = fs.readFileSync(new URL('../docs/app/js/app.js', import.meta.url), 'utf8');
function source(name) {
  const start = app.indexOf(`function ${name}(`), end = app.indexOf('\nfunction ', start + 1);
  assert.ok(start >= 0 && end > start); return app.slice(start, end);
}

test('equivalent selection uses derived geometry and force ownership; invalid rebuilds clear old mechanisms without falling back to all layers', () => {
  const original = { blocks: ['original'], weights: [1] }, derived = { blocks: ['derived'], weights: [2] }, forces = { points: [[0, 0]], blocks: [0] };
  const context = { EQUIVALENT_LAYER, state: { model: original, layers: { selection: EQUIVALENT_LAYER },
    equivalentLayer: { ok: true, model: derived, forces }, alpha: {}, mech: {} }, reportLayers() {} };
  vm.createContext(context);
  for (const name of ['editingLayer', 'prepareLayerAnalysis', 'analysisModel', 'analysisForces']) vm.runInContext(source(name), context);
  context.prepareLayerAnalysis();
  assert.equal(context.analysisModel(), derived); assert.equal(context.analysisForces(), forces);
  assert.equal(context.state.model, original);
  context.state.equivalentLayer = { ok: false, model: null, forces: null, reason: 'Incompatible joints' };
  context.prepareLayerAnalysis();
  assert.equal(context.analysisModel().blocks.length, 0); assert.equal(context.analysisModel().joints, null);
  assert.equal(context.analysisModel().jointRecovery.reason, 'Incompatible joints');
  assert.equal(context.state.alpha, null); assert.equal(context.state.mech, null);
  assert.equal(context.state.model, original);
});

test('changing centroids or force ownership invalidates a previous activation mechanism', () => {
  const m = { blocks: [{}], joints: [{ a: [0, 0], b: [1, 1] }], weights: [10], centroids: [[.5, .5]] };
  const forces = { points: [[.2, .2]], magnitudes: [1], x: [0], blocks: [0] };
  const context = { analysisModel: () => m, analysisForces: () => forces,
    ui: { imposeEnds: { checked: false } }, state: {} };
  vm.createContext(context);
  for (const name of ['alphaSignature', 'currentAlpha']) vm.runInContext(source(name), context);
  context.state.alpha = { key: context.alphaSignature() };
  assert.ok(context.currentAlpha());
  m.centroids[0][1] += .1; assert.equal(context.currentAlpha(), null);
  context.state.alpha = { key: context.alphaSignature() };
  forces.blocks[0] = 1; assert.equal(context.currentAlpha(), null);
});
