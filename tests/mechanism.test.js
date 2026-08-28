/**
 * Tests for hinge formation and the collapse mechanism.
 *
 * The counting is checked against the classical result -- two pins is once
 * hyperstatic, three pins is isostatic, four is a mechanism -- and the
 * kinematics is checked in two ways that do not depend on the implementation:
 * a hinge must come out in the same place whichever of the two bodies meeting
 * there is used to move it, and a body must not change shape.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { centroid } from '../docs/app/js/core/geometry.js';
import { blocksBetween, weighBlocks } from '../docs/app/js/core/trace.js';
import {
  TOUCH, bestLineForThrust, collapseRange, findHinges, bodies, bodyOfBlock,
  degreesOfFreedom, nullSpace, mechanismMotion, displaced, analyse,
  displacedConfiguration, transformPoint, separationSense, jointOpenings,
} from '../docs/app/js/core/mechanism.js';

function arc(r, n = 300) {
  return Array.from({ length: n }, (_, i) => {
    const t = (Math.PI * i) / (n - 1);
    return [-r * Math.cos(t), r * Math.sin(t)];
  });
}

/** A semicircular ring, weighed and ordered as the application orders it. */
function ring(ri, ro, n) {
  const { blocks, joints } = blocksBetween(arc(ri), arc(ro), n);
  const weights = weighBlocks(blocks, { specificWeight: 20, thickness: 1 });
  const centroids = blocks.map(centroid);
  const order = centroids
    .map((c, i) => [c[0], i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  return {
    blocks,
    joints,
    seq: {
      weights: order.map((i) => weights[i]),
      centroids: order.map((i) => centroids[i]),
    },
  };
}

// ------------------------------------------------------------- the counting --

test('the degree of freedom follows the classical count', () => {
  // Two pins: once hyperstatic. Three: isostatic. Four: a mechanism.
  const two = degreesOfFreedom(2);
  assert.equal(two.bodies, 1);
  assert.equal(two.constraints, 4);
  assert.equal(two.dof, -1);
  assert.match(two.verdict, /once hyperstatic/);

  const three = degreesOfFreedom(3);
  assert.equal(three.bodies, 2);
  assert.equal(three.constraints, 6);
  assert.equal(three.dof, 0);
  assert.match(three.verdict, /isostatic/);

  const four = degreesOfFreedom(4);
  assert.equal(four.bodies, 3);
  assert.equal(four.constraints, 8);
  assert.equal(four.dof, 1);
  assert.match(four.verdict, /mechanism, one degree/);

  // And it keeps going: five hinges is two degrees of freedom.
  assert.equal(degreesOfFreedom(5).dof, 2);
});

test('the springings are hinges even when the line runs clear of the faces', () => {
  const joints = Array.from({ length: 9 }, (_, i) => ({ a: [i, 0], b: [i, 1] }));
  const crossings = joints.map(() => ({ s: 0.5, point: [0, 0.5], inside: true }));
  const h = findHinges(crossings, joints);
  assert.equal(h.length, 2, 'only the two supports');
  assert.equal(h[0].joint, 0);
  assert.equal(h[1].joint, 8);
  assert.ok(h.every((x) => x.support));
  assert.equal(degreesOfFreedom(h.length).dof, -1);
});

test('one touch makes it isostatic, two make it a mechanism', () => {
  const joints = Array.from({ length: 9 }, (_, i) => ({ a: [i, 0], b: [i, 1] }));
  const mk = (touches) => joints.map((j, i) => ({
    s: touches[i] ?? 0.5, point: [i, touches[i] ?? 0.5], inside: true,
  }));

  const one = findHinges(mk({ 4: 0.0 }), joints);
  assert.equal(one.length, 3);
  assert.equal(one[1].face, 'intrados');
  assert.equal(degreesOfFreedom(one.length).dof, 0);

  const two = findHinges(mk({ 3: 1.0, 6: 0.0 }), joints);
  assert.equal(two.length, 4);
  assert.equal(two[1].face, 'extrados');
  assert.equal(two[2].face, 'intrados');
  assert.equal(degreesOfFreedom(two.length).dof, 1);
});

test('joints grazed in a row on one face are a single hinge', () => {
  // A line tangent to the intrados touches two or three joints at once.
  // Counting each would add bodies that are not there and give the wrong dof.
  const joints = Array.from({ length: 11 }, (_, i) => ({ a: [i, 0], b: [i, 1] }));
  const s = { 4: 0.004, 5: 0.001, 6: 0.008 };
  const crossings = joints.map((j, i) => ({
    s: s[i] ?? 0.5, point: [i, s[i] ?? 0.5], inside: true,
  }));

  const h = findHinges(crossings, joints);
  assert.equal(h.length, 3, `expected one interior hinge, got ${h.length - 2}`);
  assert.equal(h[1].joint, 5, 'placed at the joint of least clearance');
  assert.equal(degreesOfFreedom(h.length).dof, 0);

  // Two runs on DIFFERENT faces stay two hinges even when adjacent.
  const mixed = joints.map((j, i) => {
    const v = i === 4 ? 0.005 : i === 5 ? 0.995 : 0.5;
    return { s: v, point: [i, v], inside: true };
  });
  assert.equal(findHinges(mixed, joints).length, 4);
});

test('a run that leaves the face and returns is two hinges, not one', () => {
  // Measured on a semicircular ring at t/ri = 0.25 and maximum thrust: seven
  // consecutive joints fall inside the tolerance -- which is a fraction of a
  // long joint -- but the line actually lifts off at the crown between two
  // contacts. Taking the run as one hinge called the limit state isostatic.
  const joints = Array.from({ length: 17 }, (_, i) => ({ a: [i, 0], b: [i, 1] }));
  const profile = [
    0.00000, 0.39034, 0.35224, 0.17702, 0.07105, 0.01722, 0.00004,
    0.00140, 0.00430, 0.00140, 0.00004, 0.01722, 0.07105, 0.17702,
    0.35224, 0.39034, 0.00000,
  ];
  const crossings = profile.map((v, i) => ({ s: v, point: [i, v], inside: true }));

  const h = findHinges(crossings, joints);
  assert.deepEqual(h.map((x) => x.joint), [0, 6, 10, 16],
    'the two contacts either side of the crown must both be found');
  assert.equal(degreesOfFreedom(h.length).dof, 1, 'which makes it a mechanism');
});

test('a wobble inside a contact does not split it', () => {
  // The other side of the same rule: noise must not manufacture hinges.
  const joints = Array.from({ length: 11 }, (_, i) => ({ a: [i, 0], b: [i, 1] }));
  const profile = [0.5, 0.5, 0.5, 0.004, 0.001, 0.0015, 0.001, 0.004, 0.5, 0.5, 0.5];
  const crossings = profile.map((v, i) => ({ s: v, point: [i, v], inside: true }));
  assert.equal(findHinges(crossings, joints).length, 3, 'one interior hinge');
});

test('the collapse patterns are the classical ones', () => {
  // Minimum thrust: hinges at the springings, intrados at the haunches and
  // extrados at the crown. Maximum thrust: the crown hinge goes and the two
  // haunch hinges move outwards.
  const r = ring(4, 4.72, 16);                       // t/ri = 0.18
  const band = collapseRange(r.seq, r.joints);

  const pattern = (f) => {
    const best = bestLineForThrust(r.seq, r.joints, f);
    const a = analyse(best.crossings, r.joints, r.blocks.length);
    return a.hinges.map((h) => (h.support ? 'S' : h.face[0])).join('');
  };
  assert.equal(pattern(band.min), 'SieiS', 'minimum thrust: five hinges');
  assert.equal(pattern(band.max), 'SiiS', 'maximum thrust: four hinges');
});

test('the macro-blocks are the voussoirs between consecutive hinges', () => {
  const hinges = [{ joint: 0 }, { joint: 4 }, { joint: 9 }];
  const b = bodies(hinges, 12);
  assert.deepEqual(b, [{ from: 0, to: 4 }, { from: 4, to: 9 }]);
  const of = bodyOfBlock(b, 12);
  assert.equal(of[0], 0);
  assert.equal(of[3], 0);
  assert.equal(of[4], 1);
  assert.equal(of[8], 1);
  assert.equal(of[10], -1, 'past the last hinge, no body');
});

// ----------------------------------------------------------- the null space --

test('the null space is found, and is empty when the system determines all', () => {
  // x + y = 0, x - y = 0 has only the trivial solution.
  assert.equal(nullSpace([[1, 1], [1, -1]], 2).length, 0);
  // x + y = 0 alone leaves one dimension, and the vector satisfies it.
  const v = nullSpace([[1, 1]], 2);
  assert.equal(v.length, 1);
  assert.ok(Math.abs(v[0][0] + v[0][1]) < 1e-12);
  // A wholly empty row set leaves everything free.
  assert.equal(nullSpace([[0, 0, 0]], 3).length, 3);
});

// ---------------------------------------------------------- the kinematics --

/** Four hinges in an arch-like chain, with centres known by hand. */
function fourHingeChain() {
  // The interior hinges sit on OPPOSITE faces -- one intrados, one extrados --
  // which is what makes this a mechanism that can actually run: `opposite` is
  // the far end of each joint and `along` runs from the body before to the one
  // after. Two hinges on the same face either side of a rotating middle body
  // would open one joint while closing the other; that case is tested below.
  const hinges = [
    { joint: 0, point: [0, 0], support: true },
    { joint: 4, point: [2, 3], support: false, opposite: [2, 4], along: [1, 0] },
    { joint: 8, point: [6, 3], support: false, opposite: [6, 2], along: [1, 0] },
    { joint: 12, point: [8, 0], support: true },
  ];
  return { hinges, bodyList: bodies(hinges, 12) };
}

test('four hinges give a one-degree mechanism', () => {
  const { hinges, bodyList } = fourHingeChain();
  assert.equal(bodyList.length, 3);
  const m = mechanismMotion(hinges, bodyList);
  assert.equal(m.dof, 1);
  assert.equal(m.motions.length, 3);
  assert.ok(m.motions.some((b) => Math.abs(b.omega) > 1e-9), 'something must turn');
});

test('the instantaneous centres are the ones Kennedy gives', () => {
  // Bodies pinned to the ground turn about their own pin; the middle body
  // turns about the meeting of the two lines through the pins and the hinges
  // they share. For this chain that is (4, 6), by hand.
  const { hinges, bodyList } = fourHingeChain();
  const { motions } = mechanismMotion(hinges, bodyList);

  const near = (p, q, what) => {
    assert.ok(p, `${what}: no centre`);
    assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9,
      `${what}: ${JSON.stringify(p)} against ${JSON.stringify(q)}`);
  };
  near(motions[0].centre, [0, 0], 'first body turns about its pin');
  near(motions[2].centre, [8, 0], 'last body turns about its pin');
  near(motions[1].centre, [4, 6], 'middle body, by Kennedy');
});

test('a hinge stays shut however far the mechanism is pushed', () => {
  // THE test of the whole solve: the two bodies meeting at a hinge must move
  // that point together, or the arch comes apart instead of hinging.
  //
  // Instantaneous centres are instantaneous, so a single finite rotation about
  // them opens the hinges at second order -- 0.14 on a span of 8 at amplitude
  // 0.2, which is plainly visible. Integrating the motion instead brings that
  // to 1.2e-3, and it falls as amplitude^2 / steps.
  const { hinges, bodyList } = fourHingeChain();
  for (const amp of [0.05, 0.2, 0.4]) {
    const T = displacedConfiguration(hinges, bodyList, amp);
    for (let k = 1; k + 1 < hinges.length; k++) {
      const p = hinges[k].point;
      const before = transformPoint(T[k - 1], p);
      const after = transformPoint(T[k], p);
      const open = Math.hypot(before[0] - after[0], before[1] - after[1]);
      assert.ok(open < 6e-3 * (amp / 0.4 + 0.2),
        `hinge ${k} at amplitude ${amp} opened by ${open}`);
    }
  }
});

test('integrating closes the hinges that a single rotation opens', () => {
  // The reason the integration is there at all, stated as a test so that
  // anyone tempted to simplify it back sees what it costs.
  const { hinges, bodyList } = fourHingeChain();
  const open = (steps) => {
    const T = displacedConfiguration(hinges, bodyList, 0.3, steps);
    const p = hinges[1].point;
    const a = transformPoint(T[0], p);
    const b = transformPoint(T[1], p);
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  };
  const one = open(1);
  const many = open(120);
  assert.ok(one > 0.1, `a single rotation should open the hinge, got ${one}`);
  assert.ok(many < one / 50, `${many} against ${one}`);
});

test('the ground hinges do not move at all', () => {
  const { hinges, bodyList } = fourHingeChain();
  const T = displacedConfiguration(hinges, bodyList, 0.3);
  for (const [k, body] of [[0, 0], [3, 2]]) {
    const p = hinges[k].point;
    const q = transformPoint(T[body], p);
    assert.ok(Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9,
      `support hinge ${k} drifted`);
  }
});

test('the macro-blocks stay exactly rigid', () => {
  // Composing rigid transforms cannot deform anything, and this pins that
  // down: it is the guarantee the integration must not lose.
  const { hinges, bodyList } = fourHingeChain();
  const poly = { x: [1, 2, 2.5, 1.2], y: [0.5, 0.8, 2.0, 1.7] };
  const pairs = [[0, 1], [0, 2], [1, 3], [2, 3]];

  for (const amp of [0.05, 0.4, 1.2]) {
    const T = displacedConfiguration(hinges, bodyList, amp);
    const [moved] = displaced([poly], [1], T);
    for (const [i, j] of pairs) {
      const before = Math.hypot(poly.x[i] - poly.x[j], poly.y[i] - poly.y[j]);
      const after = Math.hypot(moved.x[i] - moved.x[j], moved.y[i] - moved.y[j]);
      assert.ok(Math.abs(before - after) < 1e-12,
        `amplitude ${amp}: ${before} became ${after}`);
    }
  }
});

test('a body with no macro-block of its own is left where it is', () => {
  const { hinges, bodyList } = fourHingeChain();
  const T = displacedConfiguration(hinges, bodyList, 0.3);
  const poly = { x: [1, 2], y: [0, 1] };
  const [same] = displaced([poly], [-1], T);
  assert.deepEqual(same, { x: [1, 2], y: [0, 1] });
});

// ------------------------------------------------ no interpenetration --

test('the mechanism is run in the sense that opens the joints', () => {
  // The sign of a null-space vector falls out of the elimination, not out of
  // the mechanics, so half the time it describes the blocks driving into one
  // another. separationSense takes the sign from the joints instead.
  const { hinges, bodyList } = fourHingeChain();
  const motion = mechanismMotion(hinges, bodyList);
  const forward = separationSense(hinges, bodyList, motion);

  const reversed = {
    ...motion,
    motions: motion.motions.map((m) => ({
      ...m, vx: -m.vx, vy: -m.vy, omega: -m.omega,
    })),
  };
  const back = separationSense(hinges, bodyList, reversed);
  assert.equal(back.sense, -forward.sense,
    'negating the motion must reverse the sense that is chosen');
  back.openings.forEach((v, i) => {
    assert.ok(Math.abs(v + forward.openings[i]) < 1e-12, `opening ${i}`);
  });
});

test('a pattern that could only interpenetrate is refused, not drawn as sound', () => {
  // Both interior hinges on the same face, either side of a middle body that
  // turns rather than drops: one joint opens exactly as the other shuts. No
  // sense of the motion opens them both, so it is not a collapse mode -- and
  // this is not hypothetical, it is what a symmetric ring produces at maximum
  // thrust.
  const hinges = [
    { joint: 0, point: [0, 0], support: true },
    { joint: 4, point: [2, 3], opposite: [2, 4], along: [1, 0] },
    { joint: 8, point: [6, 3], opposite: [6, 4], along: [1, 0] },
    { joint: 12, point: [8, 0], support: true },
  ];
  const bodyList = bodies(hinges, 12);
  const motion = mechanismMotion(hinges, bodyList);
  const { sense, openings } = separationSense(hinges, bodyList, motion);
  assert.equal(openings.length, 2);
  assert.ok(openings[0] * openings[1] < 0,
    `expected opposite openings, got ${openings}`);
  assert.equal(sense, 0, 'mixed openings must be refused');
});

test('at minimum thrust every joint of the real mechanism opens', () => {
  // The classical five-hinge collapse: a genuine mode, and every joint must
  // come apart at the face opposite its hinge.
  const r = ring(4, 4.72, 16);
  const band = collapseRange(r.seq, r.joints);
  const best = bestLineForThrust(r.seq, r.joints, band.min);
  const a = analyse(best.crossings, r.joints, r.blocks.length);

  assert.ok(a.dof > 0, 'minimum thrust must be a mechanism');
  assert.equal(a.kinematic, true, 'and a kinematically possible one');

  const T = displacedConfiguration(a.hinges, a.bodies, 0.12);
  for (let k = 1; k + 1 < a.hinges.length; k++) {
    const h = a.hinges[k];
    const L = transformPoint(T[k - 1], h.opposite);
    const R = transformPoint(T[k], h.opposite);
    const gap = (R[0] - L[0]) * h.along[0] + (R[1] - L[1]) * h.along[1];
    assert.ok(gap > 0,
      `joint ${h.joint} closed by ${-gap} instead of opening`);
  }
});

test('the sense does not depend on how the amplitude is reached', () => {
  // Whatever the elimination returns at each step, the integration must not
  // reverse partway: the joints open monotonically.
  const r = ring(4, 4.72, 16);
  const band = collapseRange(r.seq, r.joints);
  const best = bestLineForThrust(r.seq, r.joints, band.min);
  const a = analyse(best.crossings, r.joints, r.blocks.length);
  const h = a.hinges[1];

  let last = 0;
  for (const amp of [0.02, 0.05, 0.1, 0.2]) {
    const T = displacedConfiguration(a.hinges, a.bodies, amp);
    const L = transformPoint(T[0], h.opposite);
    const R = transformPoint(T[1], h.opposite);
    const gap = (R[0] - L[0]) * h.along[0] + (R[1] - L[1]) * h.along[1];
    assert.ok(gap > last, `at amplitude ${amp} the gap went from ${last} to ${gap}`);
    last = gap;
  }
});

test('a hinge carries the far end of its joint and the way along the arch', () => {
  const joints = Array.from({ length: 9 }, (_, i) => ({ a: [i, 0], b: [i, 1] }));
  const crossings = joints.map((j, i) => {
    const v = i === 4 ? 0.0 : i === 6 ? 1.0 : 0.5;
    return { s: v, point: [i, v], inside: true };
  });
  const h = findHinges(crossings, joints);
  const intrados = h.find((x) => x.joint === 4);
  const extrados = h.find((x) => x.joint === 6);
  // A hinge on the intrados must open at the extrados, and the reverse.
  assert.deepEqual(intrados.opposite, [4, 1]);
  assert.deepEqual(extrados.opposite, [6, 0]);
  // Along the arch, from the body before to the body after.
  assert.ok(intrados.along[0] > 0.99, `along ${intrados.along}`);
});

// ------------------------------------------------- the search and the band --

test('the best line at mid-band runs clear of both faces', () => {
  const r = ring(4, 5, 16);
  const band = collapseRange(r.seq, r.joints);
  assert.ok(band, 'this ring must stand somewhere');
  const middle = (band.min + band.max) / 2;

  const best = bestLineForThrust(r.seq, r.joints, middle);
  assert.ok(best, 'a line must be found at mid-band');
  assert.ok(best.clearance > TOUCH,
    `clearance ${best.clearance} should be well clear of the faces`);

  const a = analyse(best.crossings, r.joints, r.blocks.length);
  assert.equal(a.hingeCount, 2, 'no interior hinge in the middle of the band');
  assert.equal(a.dof, -1);
});

test('at the edges of the band the line is pinned against the faces', () => {
  const r = ring(4, 5, 16);
  const band = collapseRange(r.seq, r.joints);

  for (const edge of [band.min, band.max]) {
    const best = bestLineForThrust(r.seq, r.joints, edge);
    assert.ok(best, `no line at ${edge}`);
    assert.ok(best.clearance < TOUCH,
      `at the edge the clearance should vanish, got ${best.clearance}`);
    const a = analyse(best.crossings, r.joints, r.blocks.length);
    assert.ok(a.hingeCount >= 3,
      `expected hinges to have formed, got ${a.hingeCount}`);
    assert.ok(a.dof >= 0, `dof ${a.dof} at the edge of the band`);
  }
});

test('pushing past the band leaves no admissible line at all', () => {
  const r = ring(4, 5, 16);
  const band = collapseRange(r.seq, r.joints);
  for (const beyond of [band.min * 0.6, band.max * 1.6]) {
    const best = bestLineForThrust(r.seq, r.joints, beyond);
    assert.ok(!best || best.clearance < 0,
      `thrust ${beyond} should admit nothing, clearance ${best && best.clearance}`);
  }
});

test('a thicker ring stands over a wider range of thrust', () => {
  const thin = collapseRange(ring(4, 4.7, 16).seq, ring(4, 4.7, 16).joints);
  const thick = collapseRange(ring(4, 6, 16).seq, ring(4, 6, 16).joints);
  assert.ok(thick.max - thick.min > thin.max - thin.min,
    `${thick.max - thick.min} against ${thin.max - thin.min}`);
});

test('analyse ties the whole chain together on a real arch', () => {
  const r = ring(4, 5, 16);
  const band = collapseRange(r.seq, r.joints);
  const best = bestLineForThrust(r.seq, r.joints, band.max);
  const a = analyse(best.crossings, r.joints, r.blocks.length);

  assert.equal(a.bodies.length, a.hingeCount - 1);
  assert.equal(a.bodyCount, a.bodies.length);
  assert.equal(a.constraints, 2 * a.hingeCount);
  assert.equal(a.dof, 3 * a.bodyCount - 2 * a.hingeCount);
  assert.equal(a.bodyOf.length, r.blocks.length);
  if (a.dof > 0) {
    assert.ok(a.motion, 'a mechanism must carry a motion');
    assert.equal(a.motion.motions.length, a.bodies.length);
  }
});
