import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regionBodyAssignments, regionMotionGeometry } from '../docs/app/js/core/region-motion.js';
import { displaced } from '../docs/app/js/core/mechanism.js';
const rect = (x) => ({ x: [x, x + 1, x + 1, x], y: [0, 0, 1, 1] });
function fixture() {
  const source = { blocks: [rect(0), rect(1), rect(2), { pieces: [rect(3), rect(4)] }, rect(5), rect(6), rect(7)],
    groups: [{ id: 1 }, { id: 2, role: 'load' }, { id: 3, role: 'fixed' }, { id: 4 }], blockGroups: [1, 2, 1, 2, 3, 4, 2] };
  const transfers = [{ source: 1, owner: 0 }, { source: 3, owner: 0, mergedInto: 1 }, { source: 6, owner: 5 }];
  return { source, transfers };
}
test('load geometry follows the same rigid body as its receiver after structural filtering and reordering', () => {
  const { source, transfers } = fixture(), original = structuredClone(source);
  const section = { blocks: [source.blocks[2], source.blocks[0]], sources: [[2], [0]] };
  const assignment = regionBodyAssignments(source, section, [1, 0], transfers);
  assert.deepEqual(assignment, [0, 0, 1, 0, -1, -1, -1]);
  const transforms = [{ cos: 0, sin: 1, tx: 2, ty: 3 }, { cos: 1, sin: 0, tx: -2, ty: 0 }];
  const moved = displaced(source.blocks, assignment, transforms);
  assert.deepEqual(moved[1].x, source.blocks[1].y.map((y) => 2 - y));
  assert.deepEqual(moved[1].y, source.blocks[1].x.map((x) => 3 + x));
  assert.deepEqual(moved[3].pieces[0].y, source.blocks[3].pieces[0].x.map((x) => 3 + x));
  assert.deepEqual(moved[4], source.blocks[4]); // fixed boundary stays fixed
  assert.deepEqual(moved[6], source.blocks[6]); // inactive layer stays fixed
  const display = regionMotionGeometry(source, section, [1, 0], transfers);
  assert.deepEqual(display.loads, [1, 3]); assert.deepEqual(display.bodyOf, [1, 0, 0, 0]);
  assert.deepEqual(displaced(display.blocks, display.bodyOf, transforms).slice(2), [moved[1], moved[3]]);
  assert.deepEqual(source, original);
});
test('loads on different layers follow the shared body of a solidary equivalent block', () => {
  const { source, transfers } = fixture();
  const section = { blocks: [{ pieces: [source.blocks[0], source.blocks[5]] }, source.blocks[2]], sources: [[0, 5], [2]] };
  assert.deepEqual(regionBodyAssignments(source, section, [3, 7], transfers), [3, 3, 7, 3, -1, 3, 3]);
  assert.deepEqual(regionMotionGeometry(source, section, [3, 7], transfers).loads, [1, 3, 6]);
});
