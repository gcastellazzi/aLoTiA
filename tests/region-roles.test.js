import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockRole, structuralRegions, remapRegionSources } from '../docs/app/js/core/region-roles.js';

test('old groups and ungrouped blocks remain structural', () => {
  assert.equal(blockRole({ blocks: [{}] }, 0), 'structure');
  const m = { blocks: [{}], groups: [{ id: 1 }], blockGroups: [1] };
  assert.equal(blockRole(m, 0), 'structure'); assert.equal(structuralRegions(m), m);
});

test('structural subset excludes load and fixed blocks while preserving global ownership', () => {
  const m = { blocks: ['a', 'load', 'b', 'fixed'], centroids: [[0, 0], [1, 1], [2, 2], [3, 3]],
    weights: [1, 20, 3, 40], areas: [1, 2, 3, 4], thickness: [1, 1, 1, 1],
    groups: [{ id: 1, role: 'structure' }, { id: 2, role: 'load' }, { id: 3, role: 'fixed' }],
    blockGroups: [1, 2, 1, 3], joints: ['old'] };
  const before = structuredClone(m), part = structuralRegions(m);
  assert.deepEqual(part.blocks, ['a', 'b']); assert.deepEqual(part.weights, [1, 3]);
  assert.equal(part.joints, null);
  assert.deepEqual(remapRegionSources({ blocks: ['b', 'a'], sources: [[1], [0]] }, part).sources, [[2], [0]]);
  assert.deepEqual(remapRegionSources({ blocks: ['a', 'b'] }, part).sources, [[0], [2]]);
  assert.deepEqual(m, before);
});
