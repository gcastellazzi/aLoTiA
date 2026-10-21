/**
 * Tests for the absolute centres of rotation of a mechanism, and for the two
 * things the Abaqus export does with them: it holds the model there, and it
 * ramps a lateral action so the deck reports its own activation multiplier.
 *
 * WHAT IS BEING CHECKED. That the hinges at rest are the ones the kinematics
 * says they are --- two of the four, the ones bearing on the abutments, unless
 * the mechanism is degenerate --- and that the point reported is the point the
 * hinge sits at, to the last digit, because the exported model is held there.
 * Then that the deck holds those points and nothing else, that the ramp is a
 * body force proportional to each part's own mass, and that the step time at
 * which the kinematic multiplier falls is the multiplier over the ceiling.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { circularRing } from '../docs/app/js/core/blocks.js';
import { weighBlocks, centroidsOf } from '../docs/app/js/core/trace.js';
import { extrude } from '../docs/app/js/core/dome.js';
import {
  multiplierInput, mechanismMultiplier, minimumMultiplier, rotationCentres,
} from '../docs/app/js/core/multiplier.js';
import { abaqusInput } from '../docs/app/js/core/abaqus.js';

function ringModel(ri, ro, count) {
  const { blocks, joints } = circularRing({ innerRadius: ri, outerRadius: ro, count });
  return {
    blocks,
    joints,
    weights: weighBlocks(blocks, { specificWeight: 20, thickness: 1 }),
    centroids: centroidsOf(blocks),
  };
}

/** The governing mechanism of a ring: what the application shows and exports. */
function governing(m) {
  const got = minimumMultiplier(multiplierInput(m));
  const both = [got.plus, got.minus].filter(Boolean);
  return both.sort((a, b) => a.alpha - b.alpha)[0];
}

// -------------------------------------------------- the centres of rotation --

test('two of the four hinges of a ring mechanism are at rest, and they are the outer two', () => {
  const m = ringModel(4, 4.6, 12);
  const mech = governing(m);
  const centres = rotationCentres(mech.hinges, mech.motion);
  assert.equal(centres.length, 4);
  const fixed = centres.filter((c) => c.fixed).map((c) => c.index);
  assert.deepEqual(fixed, [0, 3], `at rest: ${JSON.stringify(fixed)}`);
  // The two interior hinges move, and by a margin no tolerance could blur.
  centres.filter((c) => !c.fixed).forEach((c) => {
    assert.ok(c.speed > 1e-3, `interior hinge ${c.index} moves at ${c.speed}`);
  });
});

test('a centre is the hinge point itself, digit for digit', () => {
  const m = ringModel(4, 4.6, 12);
  const mech = governing(m);
  rotationCentres(mech.hinges, mech.motion).forEach((c, k) => {
    assert.deepEqual(c.point, [mech.hinges[k].point[0], mech.hinges[k].point[1]]);
    assert.equal(c.joint, mech.hinges[k].joint);
    assert.equal(c.face, mech.hinges[k].face);
  });
});

test('the velocity vanishes at a centre and nowhere else among the hinges', () => {
  // The null space scales the field arbitrarily, so what is checked is the
  // ratio: a hinge at rest is slower than the fastest by every power of ten
  // the arithmetic has, not merely slower.
  const m = ringModel(3, 3.9, 16);
  const mech = governing(m);
  const centres = rotationCentres(mech.hinges, mech.motion);
  const fastest = Math.max(...centres.map((c) => c.speed));
  centres.forEach((c) => {
    if (c.fixed) assert.ok(c.speed < fastest * 1e-12, `${c.speed} against ${fastest}`);
    else assert.ok(c.speed > fastest * 1e-3);
  });
});

test('a hinge at rest is reported however the mechanism was chosen', () => {
  const m = ringModel(4, 4.6, 12);
  const input = multiplierInput(m);
  const picks = [
    { joint: 0, face: 'intrados' },
    { joint: 3, face: 'extrados' },
    { joint: 8, face: 'intrados' },
    { joint: 12, face: 'extrados' },
  ];
  const mech = mechanismMultiplier(input, picks);
  assert.equal(mech.reason, null, mech.reason ?? '');
  const fixed = rotationCentres(mech.hinges, mech.motion).filter((c) => c.fixed);
  assert.equal(fixed.length, 2);
  assert.deepEqual(fixed.map((c) => c.joint), [0, 12]);
});

test('no motion at all leaves nothing moving to compare against', () => {
  const centres = rotationCentres(
    [{ joint: 0, face: 'intrados', point: [0, 0] }],
    { motions: [{ vx: 0, vy: 0, omega: 0 }] },
  );
  assert.equal(centres.length, 1);
  assert.ok(centres[0].fixed);
});

// --------------------------------------------- what the exported deck does --

function exported(m, opt) {
  return abaqusInput(m, {
    solids: m.blocks.map((b) => extrude(b, 1)),
    sections: m.blocks,
    thickness: m.blocks.map(() => 1),
    supports: [m.joints[0].a, m.joints[m.joints.length - 1].a],
    joints: m.joints,
    refine: { across: 2, along: 2 },
    ...opt,
  });
}

test('asked for the mechanism, the deck is held at the centres and names them', () => {
  const m = ringModel(4, 4.6, 8);
  const mech = governing(m);
  const centres = rotationCentres(mech.hinges, mech.motion).filter((c) => c.fixed);
  const inp = exported(m, { supportMode: 'mechanism-rollers', centres });

  // One pinned line per centre, under its own name, and the A/B names gone.
  assert.match(inp, /\*Nset, nset=SUPPORT_C1_B\d+,/);
  assert.match(inp, /\*Nset, nset=SUPPORT_C2_B\d+,/);
  assert.doesNotMatch(inp, /nset=SUPPORT_A_B/);
  centres.forEach((c, i) => {
    assert.ok(inp.includes(`** C${i + 1} at (`), `C${i + 1} is named in the deck`);
    assert.ok(inp.includes(`joint ${c.joint}, ${c.face}`), `C${i + 1} says which hinge it is`);
  });
  // The pin is all three translations; the face beside it is one direction only.
  assert.match(inp, /\*Boundary\nSUPPORT_C1_B\d+, 1, 3, 0\./);
  // The roller beds keep the names of the abutments they are on: a hinge of
  // the mechanism need not form at a springing, and the masonry behind the end
  // block is there whether it does or not.
  assert.match(inp, /\*Nset, nset=SUPPORT_A_FACE_B\d+,/);
  assert.match(inp, /\*Boundary\nSUPPORT_A_FACE_B\d+, [13], [13], 0\./);
});

test('the mechanism mode without a mechanism falls back and says so', () => {
  const m = ringModel(4, 4.6, 8);
  const inp = exported(m, { supportMode: 'mechanism-rollers', centres: [] });
  assert.match(inp, /\*\* Mechanism supports requested, but no hinge at rest was supplied/);
  assert.match(inp, /\*Nset, nset=SUPPORT_A_B/);
});

test('a bare point is accepted as a centre', () => {
  const m = ringModel(4, 4.6, 8);
  const inp = exported(m, {
    supportMode: 'mechanism-rollers',
    centres: [m.joints[0].a, m.joints[m.joints.length - 1].a],
  });
  assert.match(inp, /\*Nset, nset=SUPPORT_C2_B\d+,/);
  assert.doesNotMatch(inp, /no hinge at rest was supplied/);
});

// ------------------------------------------------------- the lateral action --

test('the lateral step ramps a body force proportional to each block mass', () => {
  const m = ringModel(4, 4.6, 8);
  const mech = governing(m);
  const alphaMax = mech.alpha * 1.5;
  const inp = exported(m, { lateral: { alphaMax, direction: mech.direction } });

  // One step for gravity, one for the action, in that order.
  const steps = [...inp.matchAll(/^\*Step, name=(\w+)/gm)].map((r) => r[1]);
  assert.deepEqual(steps, ['Gravity_and_applied_loads', 'Lateral_action']);
  // The ramp is declared with the model: a *Dynamic step would otherwise apply
  // the force whole on the first increment and the step time would mean nothing.
  assert.match(inp, /\*Amplitude, name=ALPHA_RAMP\n0\., 0\., 1\., 1\./);
  assert.match(inp, /\*Dload, amplitude=ALPHA_RAMP/);

  // BX per block is its own density times g times the ceiling, and gravity is
  // not written again: it stands at its full value from the first step.
  const densities = [...inp.matchAll(/^\*Density\n([-\d.eE+]+)/gm)].map((r) => Number(r[1]));
  const forces = [...inp.matchAll(/BLOCK_(\d+)_ALL, BX, ([-\d.eE+]+)/g)]
    .map((r) => [Number(r[1]), Number(r[2])]);
  assert.equal(forces.length, m.blocks.length);
  forces.forEach(([block, bx]) => {
    const want = densities[block - 1] * 9.81 * alphaMax * Math.sign(mech.direction);
    assert.ok(Math.abs(bx - want) < Math.abs(want) * 1e-6, `BX ${bx} against ${want}`);
  });
  const lateral = inp.slice(inp.indexOf('*Step, name=Lateral_action'));
  assert.doesNotMatch(lateral, /GRAV/);

  // The multiplier the application computed falls two thirds of the way in.
  assert.ok(Math.abs(mech.alpha / alphaMax - 2 / 3) < 1e-9);
});

test('the direction of the action is the one that activates the mechanism', () => {
  const m = ringModel(4, 4.6, 8);
  const minus = exported(m, { lateral: { alphaMax: 0.5, direction: -1 } });
  const plus = exported(m, { lateral: { alphaMax: 0.5, direction: 1 } });
  const bx = (inp) => Number(inp.match(/BLOCK_1_ALL, BX, ([-\d.eE+]+)/)[1]);
  assert.ok(bx(minus) < 0 && bx(plus) > 0);
  assert.ok(Math.abs(bx(minus) + bx(plus)) < Math.abs(bx(plus)) * 1e-12);
});

test('without the option the deck is the single step it always was', () => {
  const m = ringModel(4, 4.6, 8);
  const inp = exported(m, {});
  assert.equal([...inp.matchAll(/^\*Step, /gm)].length, 1);
  assert.doesNotMatch(inp, /ALPHA_RAMP|Lateral_action|, BX, /);
});

// ------------------------------------------- where the keywords must stand --

test('the contact pairs are model data, written before the first step', () => {
  // Abaqus/Standard refuses a *Contact Pair inside a step --- "the contact pair
  // keyword should be used before any *step keyword" --- and stops in the input
  // file processor with one error per joint. Written inside the step, the deck
  // ran only when Abaqus/CAE was asked to submit it, because CAE writes an
  // input file of its own and puts them where they belong; run directly it
  // never started. Nothing in the suite noticed, so this is here now.
  const m = ringModel(4, 4.6, 8);
  const inp = exported(m, { lateral: { alphaMax: 0.5, direction: 1 } });
  const lines = inp.split('\n');
  const firstStep = lines.findIndex((l) => l.startsWith('*Step'));
  assert.ok(firstStep > 0, 'the deck has a step');
  const pairs = lines
    .map((l, i) => [l, i])
    .filter(([l]) => l.startsWith('*Contact Pair'))
    .map(([, i]) => i);
  assert.equal(pairs.length, m.blocks.length - 1, 'one pair per interior joint');
  pairs.forEach((at) => assert.ok(at < firstStep,
    `*Contact Pair at line ${at} is inside the step that begins at ${firstStep}`));
  // The amplitude of the ramp is model data for the same reason.
  assert.ok(inp.indexOf('*Amplitude') < inp.indexOf('*Step'));
});

test('the step carries the loads and the boundaries, and no interaction', () => {
  const m = ringModel(4, 4.6, 8);
  const inp = exported(m, { lateral: { alphaMax: 0.5, direction: 1 } });
  const step = inp.slice(inp.indexOf('*Step'));
  // *Contact Output is an output request and belongs in the step; what must
  // not be there is the interaction itself.
  assert.doesNotMatch(step, /^\*Contact Pair/m);
  assert.doesNotMatch(step, /^\*Contact,/m);
  assert.doesNotMatch(step, /^\*Contact Inclusions/m);
  assert.match(step, /^\*Contact Output/m, 'the output request stays');
  assert.match(step, /^\*Boundary/m);
  assert.match(step, /^\*Dload/m);
});

test('the roller bed stays over a face that carries a hinge, and is marked as such', () => {
  // Removing it was tried and is worse: a pinned line at one corner leaves the
  // block free to rotate INTO the abutment, and the model then has a mechanism
  // under gravity alone --- the first increment of the circular arch opened its
  // joints by a hundred and fifteen units. The restraint an abutment is, is
  // unilateral, which a *Boundary cannot express; until that is written the bed
  // stays and the deck says what it costs.
  const m = ringModel(4, 4.6, 8);
  const mech = governing(m);
  const centres = rotationCentres(mech.hinges, mech.motion).filter((c) => c.fixed);
  const faces = (inp) => [...inp.matchAll(/\*Nset, nset=(SUPPORT_\w*_FACE_B\d+),/g)]
    .map((r) => r[1]);
  const plain = faces(exported(m, { supportMode: 'face-rollers' }));
  const onMech = faces(exported(m, { supportMode: 'mechanism-rollers', centres }));
  assert.ok(plain.length > 0);
  assert.deepEqual(onMech, plain, 'the same beds, whatever the pins are');
  const inp = exported(m, { supportMode: 'mechanism-rollers', centres });
  assert.match(inp, /\*Boundary\nSUPPORT_C1_B\d+, 1, 3, 0\./);
});
