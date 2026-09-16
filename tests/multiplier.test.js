/**
 * Tests for the activation multiplier of a collapse mechanism.
 *
 * The closed-form search is checked against the general virtual-work solve on
 * every mechanism of a small ring, and the least multiplier is checked against
 * the static theorem: with horizontal loads a little below it a line of thrust
 * still fits inside the ring, a little above it none does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { circularRing } from '../docs/app/js/core/blocks.js';
import { weighBlocks, centroidsOf } from '../docs/app/js/core/trace.js';
import { collapseRange, bestLineForThrust, analyse } from '../docs/app/js/core/mechanism.js';
import {
  multiplierInput, mechanismMultiplier, minimumMultiplier, virtualWork,
} from '../docs/app/js/core/multiplier.js';

const FACES = ['intrados', 'extrados'];

function ringModel(ri, ro, count) {
  const { blocks, joints } = circularRing({ innerRadius: ri, outerRadius: ro, count });
  return {
    blocks,
    joints,
    weights: weighBlocks(blocks, { specificWeight: 20, thickness: 1 }),
    centroids: centroidsOf(blocks),
  };
}

/** Horizontal loads alpha * W in direction dir, as the funicular takes them. */
function inclined(m, alpha, dir) {
  return {
    centroids: m.centroids,
    weights: m.weights.map((w) => [dir * alpha * w, w]),
    actionDirs: m.weights.map((w) => [dir * alpha * w, -w]),
  };
}

test('the closed-form search finds the same minimum as virtual work on every mechanism', () => {
  const m = ringModel(4, 4.6, 12);
  const input = multiplierInput(m);
  const best = { 1: Infinity, [-1]: Infinity };
  const n = m.blocks.length;
  for (let i = 0; i <= n; i++) {
    for (let j = i + 1; j <= n; j++) {
      for (let k = j + 1; k <= n; k++) {
        for (let l = k + 1; l <= n; l++) {
          for (let f = 0; f < 16; f++) {
            const picks = [i, j, k, l].map((joint, h) => ({ joint, face: FACES[(f >> h) & 1] }));
            const got = mechanismMultiplier(input, picks);
            if (!got.reason) best[got.direction] = Math.min(best[got.direction], got.alpha);
          }
        }
      }
    }
  }
  const found = minimumMultiplier(input);
  assert.ok(Math.abs(found.plus.alpha - best[1]) < 1e-9, `+x ${found.plus.alpha} vs ${best[1]}`);
  assert.ok(Math.abs(found.minus.alpha - best[-1]) < 1e-9, `-x ${found.minus.alpha} vs ${best[-1]}`);
});

test('a symmetric ring is activated equally from either side, by mirrored hinges', () => {
  const m = ringModel(4, 5, 16);
  const { plus, minus, standsUnderGravity } = minimumMultiplier(multiplierInput(m));
  assert.ok(standsUnderGravity);
  assert.ok(plus.alpha > 0 && Math.abs(plus.alpha - minus.alpha) < 1e-9);
  assert.equal(plus.direction, 1);
  assert.equal(minus.direction, -1);
  const mirror = plus.picks.map(({ joint, face }) => `${16 - joint}${face}`).sort();
  assert.deepEqual(minus.picks.map(({ joint, face }) => `${joint}${face}`).sort(), mirror);
  // Hinges alternate between the faces along the chain.
  plus.picks.forEach((p, k) => {
    if (k) assert.notEqual(p.face, plus.picks[k - 1].face);
  });
});

test('a thicker ring needs a larger multiplier, and one that cannot stand needs none', () => {
  const alpha = (ro) => minimumMultiplier(multiplierInput(ringModel(4, ro, 24))).plus.alpha;
  const thin = alpha(4.6);
  const thick = alpha(5);
  assert.ok(thin > 0 && thick > thin, `${thin} then ${thick}`);
  // t/R = 0.095, below Heyman's minimum thickness: gravity alone collapses it.
  const weak = minimumMultiplier(multiplierInput(ringModel(10, 11, 24)));
  assert.equal(weak.standsUnderGravity, false);
  assert.equal(weak.plus.alpha, 0);
});

test('the multiplier does not depend on the scale of the model', () => {
  const small = minimumMultiplier(multiplierInput(ringModel(4, 4.8, 16))).plus.alpha;
  const large = minimumMultiplier(multiplierInput(ringModel(400, 480, 16))).plus.alpha;
  assert.ok(Math.abs(small - large) < 1e-9 * Math.max(1, small));
});

test('the static theorem brackets the kinematic minimum', () => {
  const m = ringModel(4, 4.6, 12);
  const { plus } = minimumMultiplier(multiplierInput(m));
  const search = { grid: 31, rounds: 4 };
  const fits = (alpha) => !!collapseRange(inclined(m, alpha, 1), m.joints,
    { lo: 0.01, hi: 2, search });
  assert.ok(fits(0.8 * plus.alpha), 'below the multiplier a line of thrust still fits');
  assert.ok(!fits(1.1 * plus.alpha), 'above it no line of thrust fits');
});

test('the vertical loads do no work on the mechanism read off their own limit line', () => {
  // The line passes through its hinges, so each macro-block is in equilibrium
  // under its weights and two forces through its hinges: the virtual work of
  // the vertical loads vanishes and the multiplier would be zero. This is why
  // the Mechanism tab's own mechanism is not the one whose multiplier is sought.
  const { blocks, joints } = circularRing({
    innerRadius: 4, outerRadius: 4.5, startAngle: 0, endAngle: 160, count: 16,
  });
  const m = {
    blocks, joints,
    weights: weighBlocks(blocks, { specificWeight: 20, thickness: 1 }),
    centroids: centroidsOf(blocks),
  };
  const seq = { centroids: m.centroids, weights: m.weights };
  const band = collapseRange(seq, joints);
  const line = bestLineForThrust(seq, joints, band.min);
  const a = analyse(line.crossings, joints, blocks.length);
  assert.equal(a.dof, 1, 'the limit line forms a one-degree pattern');
  const { Lw, Lh, scale } = virtualWork(multiplierInput(m), a.bodyOf, a.motion);
  assert.ok(Math.abs(Lh) > 0.1 * scale, 'a horizontal action would do work');
  assert.ok(Math.abs(Lw) < 1e-3 * scale, `vertical loads do none: ${Lw / scale}`);
});

test('a mechanism that is not one is refused with a reason', () => {
  const input = multiplierInput(ringModel(4, 5, 12));
  assert.match(mechanismMultiplier(input, [
    { joint: 0, face: 'extrados' }, { joint: 4, face: 'intrados' }, { joint: 9, face: 'extrados' },
  ]).reason, /four hinges/);
  assert.match(mechanismMultiplier(input, [
    { joint: 0, face: 'extrados' }, { joint: 4, face: 'intrados' },
    { joint: 4, face: 'extrados' }, { joint: 12, face: 'intrados' },
  ]).reason, /same joint/);
  // All four on the intrados: the joints cannot all open.
  const shut = mechanismMultiplier(input, [0, 3, 8, 12].map((joint) => ({ joint, face: 'intrados' })));
  assert.ok(shut.reason, 'refused');
  assert.equal(shut.alpha, null);
});

test('an applied load does work on the mechanism but is not amplified', () => {
  const m = ringModel(4, 5, 16);
  const base = minimumMultiplier(multiplierInput(m)).plus;
  // A downward load on the crown voussoir: it drives or resists the governing
  // mechanism, so the multiplier of that same mechanism must change.
  const crown = m.centroids[8];
  const loaded = multiplierInput(m, { points: [crown], magnitudes: [50] });
  assert.equal(loaded.applied[0].block, 8);
  const same = mechanismMultiplier(loaded, base.picks);
  assert.ok(!same.reason);
  assert.ok(Math.abs(same.alpha - base.alpha) > 1e-6, `${same.alpha} vs ${base.alpha}`);
});

test('a model without a joint chain is refused', () => {
  assert.throws(() => multiplierInput({ blocks: [{ x: [0, 1, 1, 0], y: [0, 0, 1, 1] }], joints: null }),
    /chain of voussoirs/);
});

test('a finely divided ring is searched in well under a second', () => {
  const input = multiplierInput(ringModel(4, 4.8, 40));
  const t0 = performance.now();
  const got = minimumMultiplier(input);
  assert.ok(got.plus.alpha > 0);
  assert.ok(performance.now() - t0 < 1000, `${performance.now() - t0} ms`);
});
