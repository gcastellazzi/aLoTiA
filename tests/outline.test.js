/**
 * Tests for recovering a profile from the blocks that were cut out of it, and
 * for cutting it again along a given family of lines.
 *
 * The areas are the check throughout: an outline recovered from blocks that
 * share their vertices must have exactly the area of those blocks, and a
 * section cut again must give it back. Anything else means material has been
 * invented or lost, which on a dome is weight invented or lost.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { area, piecesOf } from '../docs/app/js/core/geometry.js';
import { boundaryLoops, outlinesOfModel } from '../docs/app/js/core/outline.js';
import { cutAlongLines, lineSpans } from '../docs/app/js/core/profile.js';

const rect = (x0, x1, y0, y1) => ({ x: [x0, x1, x1, x0], y: [y0, y0, y1, y1] });
const polyOf = (points) => ({ x: points.map((p) => p[0]), y: points.map((p) => p[1]) });

// --------------------------------------------------------- the boundary --

test('two blocks sharing a face come back as one outline', () => {
  const loops = boundaryLoops([rect(0, 1, 0, 1), rect(1, 2, 0, 1)]);
  assert.equal(loops.length, 1);
  assert.ok(Math.abs(loops[0].area - 2) < 1e-12, `area ${loops[0].area}`);
  assert.ok(!loops[0].hole);
});

test('blocks that do not touch come back as separate outlines', () => {
  // The lower dome of St Peter's is a left half and a right half: a curve
  // drawn through the gap would be a curve through air.
  const loops = boundaryLoops([rect(0, 1, 0, 1), rect(5, 6, 0, 1)]);
  assert.equal(loops.length, 2);
  assert.ok(loops.every((l) => Math.abs(l.area - 1) < 1e-12));
});

test('a ring of blocks keeps its hole, and the hole is marked', () => {
  // Unit squares, because the cancellation is exact: an edge counts as shared
  // only when both blocks walk the whole of it. Blocks that overlap along part
  // of an edge -- courses in running bond -- are not a union this way, and the
  // module says so rather than guessing.
  const ring = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (i === 1 && j === 1) continue;
      ring.push(rect(i, i + 1, j, j + 1));
    }
  }
  const loops = boundaryLoops(ring);
  assert.equal(loops.length, 2, 'the outside and the void inside');
  assert.ok(!loops[0].hole && loops[1].hole);
  assert.ok(Math.abs(loops[0].area - 9) < 1e-12);
  assert.ok(Math.abs(loops[1].area - 1) < 1e-12, 'the hole is the missing middle');
});

test('a group of a model carries its own identity out with it', () => {
  const model = {
    groups: [{ id: 1, name: 'Shell', thickness: 16.3, gamma: 20 },
      { id: 2, name: 'Rib', thickness: 3.8, gamma: 20 },
      { id: 3, name: 'Lantern', thickness: 16.3, gamma: 20 }],
    blockGroups: [1, 1, 2, 3],
    blocks: [rect(0, 1, 0, 1), rect(1, 2, 0, 1), rect(0, 2, 1, 2), rect(0, 1, 5, 6)],
  };
  const got = outlinesOfModel(model, { skip: [3] });
  assert.equal(got.length, 2, 'the lantern is left out, the other two come back');
  assert.deepEqual(got.map((r) => r.group.name), ['Shell', 'Rib']);
  assert.ok(Math.abs(got[0].area - 2) < 1e-12);
  assert.ok(Math.abs(got[1].thickness ?? got[1].group.thickness - 3.8) < 1e-12);
});

// ------------------------------------------------------------ the cutter --

test('a line crosses a rectangle once in and once out', () => {
  const square = [[0, 0], [2, 0], [2, 2], [0, 2]];
  const spans = lineSpans(square, [1, -1], [0, 1]);
  assert.equal(spans.length, 1);
  assert.ok(Math.abs(spans[0][0] - 1) < 1e-12 && Math.abs(spans[0][1] - 3) < 1e-12);
});

test('cutting a profile along parallel lines gives back its area', () => {
  const profile = { points: [[0, 0], [4, 0], [4, 1], [0, 1]], group: { name: 'wall' } };
  const lines = [0, 1, 2, 3, 4].map((x) => ({ origin: [x, -1], dir: [0, 1] }));
  const got = cutAlongLines([profile], lines);
  assert.equal(got.blocks.length, 4);
  assert.equal(got.joints.length, 5);
  const total = got.blocks.reduce(
    (s, b) => s + piecesOf(b).reduce((t, p) => t + area(p), 0), 0,
  );
  // The end cuts are drawn a millionth inside the end faces, so the two end
  // voussoirs are that much short: the tolerance says so rather than hiding it.
  assert.ok(Math.abs(total - 4) < 1e-5, `cut area ${total}`);
  assert.ok(got.blocks.every((b) => piecesOf(b).length === 1));
});

test('two shells and a rib stay three pieces, each knowing its group', () => {
  // The arrangement of the upper dome: two shells with a rib between them,
  // all cut by the same lines. A piece must not be paired with its neighbour.
  const shellIn = { points: [[0, 0], [4, 0], [4, 1], [0, 1]], group: { name: 'inner', thickness: 16.3 } };
  const rib = { points: [[0, 1], [4, 1], [4, 2], [0, 2]], group: { name: 'rib', thickness: 3.8 } };
  const shellOut = { points: [[0, 2], [4, 2], [4, 3], [0, 3]], group: { name: 'outer', thickness: 16.3 } };
  const lines = [0, 2, 4].map((x) => ({ origin: [x, -1], dir: [0, 1] }));
  const got = cutAlongLines([shellIn, rib, shellOut], lines);

  assert.equal(got.blocks.length, 2);
  assert.ok(got.blocks.every((b) => piecesOf(b).length === 3));
  assert.deepEqual(got.pieceGroups[0].map((g) => g.group.name), ['inner', 'rib', 'outer']);
  assert.deepEqual(got.pieceGroups[0].map((g) => g.group.thickness), [16.3, 3.8, 16.3]);
  const total = got.blocks.reduce(
    (s, b) => s + piecesOf(b).reduce((t, p) => t + area(p), 0), 0,
  );
  // Three profiles, two cuts inset: three times the millionth of the test above.
  assert.ok(Math.abs(total - 12) < 1e-4, `cut area ${total}`);
});

test('a cut that misses the section is reported rather than drawn', () => {
  const profile = { points: [[0, 0], [1, 0], [1, 1], [0, 1]], group: { name: 'wall' } };
  const lines = [{ origin: [0.5, -1], dir: [0, 1] }, { origin: [9, -1], dir: [0, 1] }];
  const got = cutAlongLines([profile], lines);
  assert.ok(got.warnings.some((w) => /misses the section/.test(w)));
  assert.equal(got.blocks.length, 0);
});

// ----------------------------------------------- the two, end to end --

test('a section recovered from its blocks and cut again keeps its area', () => {
  const blocks = [rect(0, 1, 0, 2), rect(1, 2, 0, 2), rect(2, 3, 0, 2)];
  const loops = boundaryLoops(blocks);
  assert.equal(loops.length, 1);
  const before = blocks.reduce((s, b) => s + area(b), 0);
  assert.ok(Math.abs(loops[0].area - before) < 1e-12);

  const lines = [0, 0.75, 1.5, 2.25, 3].map((x) => ({ origin: [x, -1], dir: [0, 1] }));
  const got = cutAlongLines([{ points: loops[0].points, group: { name: 'wall' } }], lines);
  const after = got.blocks.reduce(
    (s, b) => s + piecesOf(b).reduce((t, p) => t + area(p), 0), 0,
  );
  assert.equal(got.blocks.length, 4, 'four voussoirs where three were drawn');
  assert.ok(Math.abs(after - before) < 1e-5, `${after} against ${before}`);
});
