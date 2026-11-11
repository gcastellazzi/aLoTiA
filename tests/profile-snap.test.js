import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { piecesOf } from '../docs/app/js/core/geometry.js';
import { zKey, blockLayerKey } from '../docs/app/js/core/layers.js';
const app = fs.readFileSync(new URL('../docs/app/js/app.js', import.meta.url), 'utf8');
function source(name) {
  const start = app.indexOf(`function ${name}(`), end = app.indexOf('\nfunction ', start + 1);
  assert.ok(start >= 0 && end > start); return app.slice(start, end);
}
function harness(scale = 10) {
  const model = { blocks: [{ x: [0, 1, 1], y: [0, 0, 1] }, { pieces: [{ x: [1.2, 3, 3], y: [0, 0, 1] }] }],
    groups: [{ id: 1, z: 0 }, { id: 2, z: 2 }], blockGroups: [1, 2] };
  const ctx = { state: { model }, SNAP_PX: 11, piecesOf, zKey, blockLayerKey,
    ui: { profileSnap: { checked: true }, blockZ: { value: '0' } }, angularMode: () => false,
    mainAx: { toPx: ([x, y]) => [x * scale, y * scale] } };
  vm.createContext(ctx);
  for (const name of ['cornerNear', 'profileSnapAt']) vm.runInContext(source(name), ctx);
  return ctx;
}
test('outline snap uses exact node coordinates from the creation layer and does not mutate geometry', () => {
  const ctx = harness(), before = structuredClone(ctx.state.model);
  const near = ctx.profileSnapAt([12, 0]);
  assert.equal(near.kind, 'corner'); assert.deepEqual(Array.from(near.point), [1, 0]);
  ctx.ui.blockZ.value = '2';
  assert.deepEqual(Array.from(ctx.profileSnapAt([12, 0]).point), [1.2, 0]);
  assert.deepEqual(ctx.state.model, before);
});
test('outline snapping can be disabled and has a pixel-based radius independent of zoom', () => {
  const ctx = harness(100);
  assert.deepEqual(Array.from(ctx.profileSnapAt([110, 0]).point), [1, 0]);
  assert.equal(ctx.profileSnapAt([112, 0]), null);
  ctx.ui.profileSnap.checked = false; assert.equal(ctx.profileSnapAt([100, 0]), null);
  // Existing block drawing still sees all layers and its old corner behavior.
  assert.deepEqual(Array.from(ctx.cornerNear([120, 0])), [1.2, 0]);
});
