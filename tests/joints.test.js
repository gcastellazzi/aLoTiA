/**
 * Tests for recovering the joints of a stored example from its voussoirs.
 *
 * The strongest check available is a round trip: `blocksBetween` builds both
 * the blocks and the joints, so throwing the joints away, recovering them from
 * the blocks alone, and comparing against the ones that were discarded tests
 * the recovery against a known answer rather than against itself. That is done
 * first, on rings of several thicknesses and subdivisions.
 *
 * The rest is what the converted examples actually contain: the recovery has
 * to succeed on the arches, refuse on the sections that are not a chain of
 * abutting voussoirs, and never quietly hand back something a joint short or a
 * joint long. Those checks are written against WHATEVER corpus is shipped
 * rather than against a count, because the count differs between this
 * repository and the reduced set published with the paper; what is pinned by
 * name is the handful of examples the paper's own figures depend on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { blocksBetween, weighBlocks, centroidsOf } from '../docs/app/js/core/trace.js';
import { distance } from '../docs/app/js/core/geometry.js';
import {
  jointsFromBlocks, contactJoint, endJoint, orientJoints, distanceToBoundary,
} from '../docs/app/js/core/joints.js';
import { fromExample } from '../docs/app/js/core/model.js';
import { jointCrossings } from '../docs/app/js/core/statics.js';
import { blocksLike, circularRing } from '../docs/app/js/core/blocks.js';
import { collapseRange, bestLineForThrust, analyse } from '../docs/app/js/core/mechanism.js';

// The earlier MATLAB corpus, kept as a fixture: see tests/fixtures/matlab.
const EXAMPLES = new URL('./fixtures/matlab/', import.meta.url).pathname;

function arc(r, n = 300) {
  return Array.from({ length: n }, (_, i) => {
    const t = (Math.PI * i) / (n - 1);
    return [-r * Math.cos(t), r * Math.sin(t)];
  });
}

const readExample = (name) =>
  fromExample(JSON.parse(fs.readFileSync(path.join(EXAMPLES, name), 'utf8')));

// ----------------------------------------------------- against a known ring --

test('a ring recovers the joints it was built with', () => {
  for (const [ri, ro, n] of [[4, 5, 12], [4, 5, 24], [3, 4.2, 16], [10, 11, 9]]) {
    const built = blocksBetween(arc(ri), arc(ro), n);
    const got = jointsFromBlocks(built.blocks);
    assert.ok(got.ok, `ri=${ri} n=${n}: ${got.warnings[0]}`);
    assert.equal(got.joints.length, built.joints.length);

    // The scale to judge "the same joint" against: the thickness of the ring.
    const tol = (ro - ri) * 1e-6;
    got.joints.forEach((j, i) => {
      const truth = built.joints[i];
      assert.ok(distance(j.a, truth.a) < tol,
        `ri=${ri} n=${n} joint ${i}: intrados end off by ${distance(j.a, truth.a)}`);
      assert.ok(distance(j.b, truth.b) < tol,
        `ri=${ri} n=${n} joint ${i}: extrados end off by ${distance(j.b, truth.b)}`);
    });
  }
});

test('the intrados end comes back as `a`, whichever way the ring was traced', () => {
  // Both faces reversed: the blocks are the same ring, walked the other way.
  const forward = blocksBetween(arc(4), arc(5), 14);
  const backward = blocksBetween([...arc(4)].reverse(), [...arc(5)].reverse(), 14);

  for (const built of [forward, backward]) {
    const { joints, ok } = jointsFromBlocks(built.blocks);
    assert.ok(ok);
    // `a` is the intrados: it must be the nearer of the two to the centre,
    // which for these rings is the origin.
    for (const j of joints) {
      assert.ok(Math.hypot(j.a[0], j.a[1]) < Math.hypot(j.b[0], j.b[1]),
        `a is not the intrados end: |a| = ${Math.hypot(j.a[0], j.a[1])}`);
    }
  }
});

test('one joint more than there are blocks, springing to springing', () => {
  for (const n of [3, 7, 16, 33]) {
    const { blocks } = blocksBetween(arc(4), arc(5), n);
    const got = jointsFromBlocks(blocks);
    assert.ok(got.ok);
    assert.equal(got.joints.length, n + 1);
  }
});

// ------------------------------------------------------------ the refusals --

test('a chain broken in the middle is refused, and says so', () => {
  const { blocks } = blocksBetween(arc(4), arc(5), 12);
  // Move one voussoir bodily away: it now abuts neither neighbour.
  const moved = blocks.map((b, i) => (i === 5
    ? { x: b.x.map((v) => v + 3), y: [...b.y] } : b));
  const got = jointsFromBlocks(moved);
  assert.equal(got.ok, false);
  assert.equal(got.joints.length, 0);
  assert.ok(got.gaps.includes(4) && got.gaps.includes(5));
  assert.match(got.warnings[0], /not one chain/);
});

test('a joint of no thickness is refused rather than reported as a hinge', () => {
  const { blocks } = blocksBetween(arc(4), arc(5), 10);
  // Pinch two voussoirs to a point where they meet: the cut has no length,
  // and a crossing of it would be read at an arbitrary fraction.
  const k = 4;
  const pinched = blocks.map((b, i) => {
    if (i !== k && i !== k + 1) return b;
    const c = [b.x.reduce((s, v) => s + v, 0) / b.x.length,
      b.y.reduce((s, v) => s + v, 0) / b.y.length];
    // Collapse the shared face onto its own mid-point.
    return {
      x: b.x.map((v, m) => ((i === k && m >= 2) || (i === k + 1 && m < 2)
        ? c[0] : v)),
      y: b.y.map((v, m) => ((i === k && m >= 2) || (i === k + 1 && m < 2)
        ? c[1] : v)),
    };
  });
  const got = jointsFromBlocks(pinched);
  assert.equal(got.ok, false);
  assert.ok(got.warnings.some((w) => /no thickness|not one chain/.test(w)));
});

test('fewer than two blocks has no chain to walk', () => {
  assert.equal(jointsFromBlocks([]).ok, false);
  assert.equal(jointsFromBlocks(null).ok, false);
});

// ------------------------------------------------------------ the pieces --

test('the distance to a boundary is measured to the edges, not the vertices', () => {
  const square = [[0, 0], [2, 0], [2, 2], [0, 2]];
  // Directly off the middle of an edge: nearest vertex is 1.005 away.
  assert.ok(Math.abs(distanceToBoundary([1, -0.1], square) - 0.1) < 1e-12);
  assert.ok(Math.abs(distanceToBoundary([1, 1], square) - 1) < 1e-12);
});

test('two blocks that do not touch have no joint between them', () => {
  const A = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const B = [[5, 0], [6, 0], [6, 1], [5, 1]];
  assert.equal(contactJoint(A, B, 1e-3), null);
  assert.ok(contactJoint(A, B, 5));            // loose enough, it finds one
});

test('the end face is the one across the arch, not the long face along it', () => {
  // A voussoir far wider than it is long: the extrados face is the longest
  // edge and the furthest from the joint by raw distance, and taking it would
  // put the springing along the back of the arch.
  const P = [[0, 0], [10, 0], [10, 2], [0, 2]];
  const inner = { a: [0, 0], b: [10, 0] };
  const end = endJoint(P, inner);
  assert.ok(end);
  const ys = [end.a[1], end.b[1]].sort();
  assert.deepEqual(ys, [2, 2]);
  assert.ok(Math.abs(distance(end.a, end.b) - 10) < 1e-12);
});

test('orientJoints does not let the chain cross over itself', () => {
  const flipped = [
    { a: [0, 0], b: [0, 1] },
    { a: [1, 1], b: [1, 0] },       // handed the other way round
    { a: [2, 0], b: [2, 1] },
  ];
  const out = orientJoints(flipped);
  const as = out.map((j) => j.a[1]);
  assert.ok(as.every((v) => v === as[0]), `the a-chain jumps faces: ${as}`);
});

// -------------------------------------------------- the stored examples --

test('every stored example either recovers a whole chain or says why not', () => {
  const files = fs.readdirSync(EXAMPLES)
    .filter((f) => f.endsWith('.json') && f !== 'index.json');
  assert.ok(files.length >= 8, 'the corpus has been emptied');

  let recovered = 0;
  for (const f of files) {
    let model;
    try {
      model = readExample(f);
    } catch {
      continue;                                 // the empty template
    }
    const r = model.jointRecovery;
    assert.ok(r, `${f} carries no jointRecovery`);
    if (r.ok) {
      recovered++;
      assert.equal(model.joints.length, model.blocks.length + 1, f);
      for (const j of model.joints) assert.ok(distance(j.a, j.b) > 0, f);
    } else {
      assert.equal(model.joints, null, f);
      assert.ok(r.reason && r.reason.length > 10,
        `${f} refuses without saying why`);
    }
  }
  // Not a count -- the corpus differs between this repository and the reduced
  // set published with the paper -- but a floor, so that a change in the
  // tolerances cannot silently halve what the Mechanism tab can open.
  assert.ok(recovered >= Math.min(5, files.length),
    `only ${recovered} of ${files.length} examples recovered a joint chain`);
});

test('the examples the paper leans on all recover their joints', () => {
  // These are named because a figure, a table or a stated result depends on
  // them; losing the joints of one would falsify something in print.
  for (const name of [
    'Example_3_Heyman_arch.json',
    'Example_1_Circular_arch_comparison.json',
    'Example_0_Landscape_arch.json',
  ]) {
    const m = readExample(name);
    assert.ok(m.jointRecovery.ok, `${name}: ${m.jointRecovery.reason}`);
    assert.equal(m.joints.length, m.blocks.length + 1, name);
  }
});

test('a recovered arch reaches the classical hinge patterns', () => {
  // Two ends of the band on the arch the tutorials use.
  const m = readExample('Example_3_Heyman_arch.json');
  assert.ok(m.jointRecovery.ok);

  const seq = blocksLike({
    centroids: m.centroids,
    weights: m.weights,
    areas: m.areas,
    thickness: m.centroids.map(() => 0),
  });
  const band = collapseRange(seq, m.joints);
  assert.ok(band, 'no admissible line at any thrust');
  assert.ok(band.min > 0 && band.max > band.min);

  // At either end of the band the line is squeezed against a face and the arch
  // is no longer undetermined; in the middle it runs clear and is hyperstatic.
  const state = (f) => {
    const best = bestLineForThrust(seq, m.joints, f);
    assert.ok(best, `no line at H/W = ${f}`);
    return analyse(best.crossings, m.joints, m.blocks.length);
  };
  assert.ok(state(band.min).hingeCount >= 3);
  assert.ok(state(band.max).hingeCount >= 3);
  assert.equal(state((band.min + band.max) / 2).dof, -1);

  // And the faces are the classical ones: the crown hinge moves from the
  // extrados at the lowest thrust to the intrados at the highest.
  const interior = (f) => state(f).hinges.filter((h) => !h.support).map((h) => h.face);
  assert.ok(interior(band.min).includes('extrados'));
  assert.ok(interior(band.max).includes('intrados'));
});

test('the recovered joints are the ones the stored thrust line was drawn through', () => {
  // A cross-check that owes nothing to this module: MATLAB drew LOT_xy inside
  // the ring, so the crossings of the recovered joints must land inside them.
  const m = readExample('Example_0_Landscape_arch.json');
  assert.ok(m.jointRecovery.ok);
  const cr = jointCrossings(m.thrustLine, m.joints);

  // The stored line BEGINS on the first springing rather than crossing it, so
  // no segment of it meets that joint and the crossing is rightly null. Every
  // other joint is crossed, and well inside: 0.28 to 0.71 of the thickness.
  assert.equal(cr[0], null);
  const rest = cr.slice(1);
  assert.equal(rest.filter((c) => c === null).length, 0);
  for (const c of rest) {
    assert.ok(c.s > 0 && c.s < 1,
      `the stored line crosses a recovered joint outside it, at s = ${c.s}`);
  }
});

test('a band narrower than the coarse grid is still found', () => {
  // THE REGRESSION. `collapseRange` used to stop at the first sample of a
  // sixty-step grid that happened to be admissible, which tests a boolean on a
  // grid: a band narrower than the grid step falls straight through it, and a
  // ring that stands is reported as standing at no thrust at all. A ring just
  // above its least admissible thickness -- t/ri = 0.1155 at sixteen blocks --
  // is exactly that case, and it is built here rather than read from an
  // example so the guard travels with the code.
  const tri = 0.117;
  const { blocks, joints } = circularRing({
    centre: [0, 0], innerRadius: 1, outerRadius: 1 + tri,
    startAngle: 0, endAngle: 180, count: 16,
  });
  const weights = weighBlocks(blocks, { specificWeight: 20, thickness: 1 });
  const seq = blocksLike({
    centroids: centroidsOf(blocks),
    weights,
    areas: blocks.map(() => 0),
    thickness: blocks.map(() => 0),
  });

  const band = collapseRange(seq, joints);
  assert.ok(band, 'the narrow band was missed');
  assert.ok(band.max - band.min < 0.05,
    `this ring is meant to have a narrow band, got ${band.max - band.min}`);
  assert.ok(bestLineForThrust(seq, joints, (band.min + band.max) / 2)
    .clearance > 0);

  // And the seed that used to be taken -- the first sample of the plain grid --
  // does NOT land inside it, which is what made the old search fail.
  const lo = 0.02;
  const hi = 1.2;
  const hits = [];
  for (let i = 0; i <= 60; i++) {
    const f = lo + ((hi - lo) * i) / 60;
    if (f >= band.min && f <= band.max) hits.push(f);
  }
  assert.equal(hits.length, 0,
    'the grid now lands inside the band, so this no longer tests the fix');
});

// ------------------------------------------------- the exact circular ring --

test('the ring built from numbers has the joints the recovery finds', () => {
  // The joints of `circularRing` are built from the same angles as the blocks,
  // so they are exact. Recovering them from the blocks alone must agree --
  // which checks the two independent paths against each other, and pins the
  // ring the published figures are computed on.
  for (const [ri, tri, n] of [[4, 0.15, 16], [4, 0.30, 24], [10, 0.08, 12]]) {
    const { blocks, joints } = circularRing({
      centre: [0, 0], innerRadius: ri, outerRadius: ri * (1 + tri),
      startAngle: 0, endAngle: 180, count: n,
    });
    assert.equal(blocks.length, n);
    assert.equal(joints.length, n + 1);

    const got = jointsFromBlocks(blocks);
    assert.ok(got.ok, got.warnings[0]);
    assert.equal(got.joints.length, n + 1);
    const tol = ri * tri * 1e-9;
    got.joints.forEach((j, i) => {
      assert.ok(distance(j.a, joints[i].a) < tol, `joint ${i} intrados`);
      assert.ok(distance(j.b, joints[i].b) < tol, `joint ${i} extrados`);
    });
    // `a` is the intrados: exactly at the inner radius.
    for (const j of joints) {
      assert.ok(Math.abs(Math.hypot(j.a[0], j.a[1]) - ri) < 1e-9);
      assert.ok(Math.abs(Math.hypot(j.b[0], j.b[1]) - ri * (1 + tri)) < 1e-9);
    }
  }
});

test('the ring is ordered the way the application orders blocks', () => {
  const { blocks } = circularRing({
    centre: [0, 0], innerRadius: 4, outerRadius: 4.6,
    startAngle: 0, endAngle: 180, count: 16,
  });
  const cx = (p) => p.x.reduce((a, b) => a + b, 0) / p.x.length;
  for (let i = 1; i < blocks.length; i++) {
    assert.ok(cx(blocks[i]) < cx(blocks[i - 1]),
      'blocks must run with centroid x descending');
  }
});
