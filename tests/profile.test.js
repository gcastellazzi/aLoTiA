/**
 * Tests for cutting a traced profile into voussoirs.
 *
 * The reference cases are a half-ring, whose exact area is known, and a
 * double shell, which is the case the whole feature exists for: one radial cut
 * passes through masonry, then air, then masonry again.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { area } from '../docs/app/js/core/geometry.js';
import {
  rayHits, materialSpans, angularExtent, cutRadially,
  piecesOf, blockArea, blockCentroid, makeBlock,
} from '../docs/app/js/core/profile.js';

/** The closed outline of a half-ring: out along the extrados, back the intrados. */
function halfRing(ri, ro, n = 120) {
  const outer = Array.from({ length: n }, (_, i) => {
    const t = (Math.PI * i) / (n - 1);
    return [ro * Math.cos(t), ro * Math.sin(t)];
  });
  const inner = Array.from({ length: n }, (_, i) => {
    const t = (Math.PI * (n - 1 - i)) / (n - 1);
    return [ri * Math.cos(t), ri * Math.sin(t)];
  });
  return [...outer, ...inner];
}

const rect = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

// ------------------------------------------------------------- the cutting --

test('a ray crosses a closed outline an even number of times', () => {
  const prof = halfRing(4, 5);
  for (const t of [0.3, 1.0, 2.4]) {
    const hits = rayHits(prof, [0, 0], t);
    assert.equal(hits.length % 2, 0, `angle ${t} gave ${hits.length} hits`);
    assert.ok(Math.abs(hits[0] - 4) < 0.01, `inner at ${hits[0]}`);
    assert.ok(Math.abs(hits[1] - 5) < 0.01, `outer at ${hits[1]}`);
  }
});

test('only forward hits count', () => {
  // A ray pointing away from the section must find nothing, not the crossings
  // behind it.
  assert.equal(rayHits(halfRing(4, 5), [0, 0], -Math.PI / 2).length, 0);
});

test('material spans pair the hits, and skip the air between shells', () => {
  // The double shell: inner dome 3..3.4, outer 4..4.6.
  const shells = [halfRing(3, 3.4), halfRing(4, 4.6)];
  const spans = materialSpans(shells, [0, 0], 1.0);
  assert.equal(spans.length, 2, 'two pieces of masonry on one cut');
  assert.ok(Math.abs(spans[0][0] - 3) < 0.01);
  assert.ok(Math.abs(spans[0][1] - 3.4) < 0.01);
  assert.ok(Math.abs(spans[1][0] - 4) < 0.01);
  assert.ok(Math.abs(spans[1][1] - 4.6) < 0.01);
});

test('the angular extent covers the traced section', () => {
  const e = angularExtent([halfRing(4, 5)], [0, 0]);
  assert.ok(e.from < 0.02, `from ${e.from}`);
  assert.ok(Math.abs(e.to - Math.PI) < 0.05, `to ${e.to}`);
});

// -------------------------------------------------------------- the blocks --

test('cutting a half-ring recovers its area', () => {
  const exact = (Math.PI / 2) * (25 - 16);
  const { blocks, joints, warnings } = cutRadially([halfRing(4, 5)], [0, 0], 24);
  assert.equal(blocks.length, 24);
  assert.equal(joints.length, 25, 'one more joint than blocks');
  assert.deepEqual(warnings, []);

  const total = blocks.reduce((s, b) => s + blockArea(b), 0);
  assert.ok(total < exact, 'straight-sided blocks cannot exceed the ring');
  assert.ok((exact - total) / exact < 0.01, `deficit ${(exact - total) / exact}`);
});

test('refining the cut converges on the exact area', () => {
  const exact = (Math.PI / 2) * (25 - 16);
  const deficit = (n) => exact
    - cutRadially([halfRing(4, 5)], [0, 0], n).blocks
      .reduce((s, b) => s + blockArea(b), 0);
  assert.ok(deficit(48) < deficit(12) / 10, `${deficit(12)} then ${deficit(48)}`);
});

test('a double shell gives blocks in two pieces, and both are weighed', () => {
  // THE case the feature exists for.
  const shells = [halfRing(3, 3.4), halfRing(4, 4.6)];
  const { blocks, warnings } = cutRadially(shells, [0, 0], 20);
  assert.deepEqual(warnings, []);
  assert.ok(blocks.every((b) => piecesOf(b).length === 2),
    'every block should straddle both shells');

  const exact = (Math.PI / 2) * ((3.4 ** 2 - 3 ** 2) + (4.6 ** 2 - 4 ** 2));
  const total = blocks.reduce((s, b) => s + blockArea(b), 0);
  assert.ok((exact - total) / exact < 0.01, `area ${total} against ${exact}`);
});

test('the centroid of a two-piece block lies between its pieces', () => {
  // Taking the first piece alone would put the weight at the wrong radius,
  // which for a dome is the quantity the whole analysis turns on.
  const a = { x: [1, 2, 2, 1], y: [0, 0, 1, 1] };      // area 1 at x = 1.5
  const b = { x: [5, 7, 7, 5], y: [0, 0, 1, 1] };      // area 2 at x = 6
  const block = makeBlock([a, b]);
  assert.ok(Math.abs(blockArea(block) - 3) < 1e-12);
  const g = blockCentroid(block);
  assert.ok(Math.abs(g[0] - (1.5 * 1 + 6 * 2) / 3) < 1e-12, `x = ${g[0]}`);
  assert.ok(Math.abs(g[1] - 0.5) < 1e-12);
});

test('a single-piece block is what the tracer has always produced', () => {
  const { blocks } = cutRadially([halfRing(4, 5)], [0, 0], 8);
  const b = blocks[0];
  assert.equal(piecesOf(b).length, 1);
  // It reads as a plain polygon: x and y are the block itself.
  assert.ok(Array.isArray(b.x) && Array.isArray(b.y));
  assert.ok(Math.abs(blockArea(b) - Math.abs(area(b))) < 1e-12);
});

test('blocks come out counter-clockwise, as every other block does', () => {
  const { blocks } = cutRadially([halfRing(4, 5)], [0, 0], 10);
  for (const b of blocks) {
    for (const p of piecesOf(b)) assert.ok(area(p) > 0);
  }
});

test('the joints span the cut and carry the material segments', () => {
  const shells = [halfRing(3, 3.4), halfRing(4, 4.6)];
  const { joints } = cutRadially(shells, [0, 0], 12);
  const j = joints[6];
  assert.equal(j.segments.length, 2);
  // a and b span the whole cut, from the first material to the last.
  const r = (p) => Math.hypot(p[0], p[1]);
  assert.ok(Math.abs(r(j.a) - 3) < 0.02, `inner at ${r(j.a)}`);
  assert.ok(Math.abs(r(j.b) - 4.6) < 0.02, `outer at ${r(j.b)}`);
  assert.ok(r(j.segments[0].b) < r(j.segments[1].a), 'with air between them');
});

test('a section that changes topology is reported, not silently mangled', () => {
  // A cut that meets one shell where its neighbour meets two.
  const shells = [halfRing(4, 5), rect(1.0, 1.4, 0.2, 0.6)];
  const { warnings } = cutRadially(shells, [0, 0], 6);
  assert.ok(warnings.length, 'the change in the section should be reported');
});

test('nothing traced is refused with a reason', () => {
  assert.match(cutRadially([], [0, 0], 8).warnings[0], /no profile/);
  assert.match(cutRadially([halfRing(4, 5)], [0, 0], 0).warnings[0], /at least one/);
});

// -------------------------------------------- the ripple, end to end --

import { weighBlocks } from '../docs/app/js/core/trace.js';
import { luneWeights, solids } from '../docs/app/js/core/dome.js';

test('a two-piece voussoir weighs, revolves and is drawn as both pieces', () => {
  // The point of naming the ripple: everything downstream must see both
  // pieces, not just the first.
  const shells = [halfRing(3, 3.4), halfRing(4, 4.6)];
  const { blocks } = cutRadially(shells, [0, 0], 16);
  const b = blocks[8];
  assert.equal(piecesOf(b).length, 2);

  // Weighing: the block weighs both pieces, not the inner shell alone.
  const w = weighBlocks([b], { specificWeight: 20, thickness: 1 })[0];
  const alone = Math.abs(area(piecesOf(b)[0])) * 20;
  assert.ok(w > alone * 1.5, `${w} against ${alone} for the first piece alone`);
  assert.ok(Math.abs(w - blockArea(b) * 20) < 1e-12);

  // The dome weights use the combined centroid, which lies between the shells.
  const { weights, radii } = luneWeights([b], { axisX: 0, angleDeg: 15 });
  const g = blockCentroid(b);
  assert.ok(Math.abs(radii[0] - Math.abs(g[0])) < 1e-12);
  assert.ok(weights[0] > 0);

  // And the solid is built from both pieces.
  const [solid] = solids([b], { poleni: true, axisX: 0, angleDeg: 15, steps: 3 });
  const single = solids([{ x: piecesOf(b)[0].x, y: piecesOf(b)[0].y }],
    { poleni: true, axisX: 0, angleDeg: 15, steps: 3 })[0];
  assert.equal(solid.length, single.length * 2, 'two pieces, two solids');
});
