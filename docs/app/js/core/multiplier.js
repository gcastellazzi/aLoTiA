/**
 * The activation multiplier of a collapse mechanism.
 *
 * THE LOADS. The weights W of the voussoirs and the forces applied by hand stay
 * as they are; to them are added horizontal forces alpha * W at the centroids,
 * pointing in +x or in -x -- the seismic action proportional to the masses of
 * the linear kinematic analysis (NTC 2018, C8.7.1). The forces applied by hand
 * are not amplified and carry no mass.
 *
 * THE PRINCIPLE OF VIRTUAL WORK. For a one-degree mechanism with virtual
 * displacements delta, the work of all the loads vanishes at activation:
 *
 *     alpha * d * Lh + Lw = 0,   Lh = sum W_k dx_k,   Lw = sum (-W_k) dy_k + F . delta
 *
 * so alpha = -Lw / (d Lh). The mechanism can run only in the sense that opens
 * its joints, which fixes the sign of delta; it is then activated by the one
 * direction d with d Lh > 0, and alpha = -Lw / |Lh|. A negative value means the
 * vertical loads alone already drive it: the multiplier is zero.
 *
 * WHY NOT THE MECHANISM OF THE MECHANISM TAB. That one is read off a line of
 * thrust under the vertical loads, and that line passes through its hinges.
 * Each macro-block is then in equilibrium under its weights and two forces
 * through its hinges, and their virtual work is zero for any motion about those
 * hinges: alpha = 0 identically. It confirms the limit state and says nothing
 * about the horizontal action. The mechanisms here are chosen by hand or found
 * by searching all of them for the least multiplier (the kinematic theorem).
 *
 * Voussoir k lies between joints k and k + 1; joint.a is on the intrados and
 * joint.b on the extrados, as everywhere else in core/.
 */

import {
  hingeAt, jointAlong, bodies, bodyOfBlock, mechanismMotion,
} from './mechanism.js';
import { pointInPolygon, piecesOf, distance } from './geometry.js';

const FACES = ['intrados', 'extrados'];

function vertical(w) {
  return Array.isArray(w) ? Number(w[1]) || 0 : Number(w) || 0;
}

/**
 * The loads of the model in the form both searches use: per voussoir the weight
 * and its centroid, and each applied force with the voussoir it acts on.
 *
 * @param {object} model   `{blocks, weights, centroids, joints}`
 * @param {object} forces  `{points, magnitudes, x}` as the application stores them
 */
export function multiplierInput(model, forces = null) {
  const blocks = model?.blocks ?? [];
  const joints = model?.joints ?? null;
  if (!joints || joints.length !== blocks.length + 1) {
    throw new Error('the activation multiplier needs a chain of voussoirs with its joints');
  }
  const weights = blocks.map((_, k) => vertical(model.weights?.[k]));
  const centroids = blocks.map((_, k) => model.centroids[k]);
  const applied = [];
  (forces?.points ?? []).forEach((p, i) => {
    if (!p) return;
    const raw = forces.magnitudes?.[i];
    // Fy is stored positive downward; the vector here is y-up.
    const [fx, fy] = Array.isArray(raw)
      ? [Number(raw[0]) || 0, Number(raw[1]) || 0]
      : [Number(forces.x?.[i] ?? 0) || 0, Number(raw) || 0];
    if (!fx && !fy) return;
    let block = blocks.findIndex((b) => piecesOf(b).some((q) => pointInPolygon(p, q)));
    if (block < 0) {
      block = centroids.reduce((best, c, k) => (best < 0
        || distance(c, p) < distance(centroids[best], p) ? k : best), -1);
    }
    applied.push({ point: [p[0], p[1]], vector: [fx, -fy], block });
  });
  return { joints, weights, centroids, applied, nBlocks: blocks.length };
}

/** Velocity of point p on a rigid body moving as {vx, vy, omega}. */
function velocity(m, p) {
  return [m.vx - m.omega * p[1], m.vy + m.omega * p[0]];
}

/**
 * How fast each joint of the mechanism opens at its far end, the two springing
 * hinges included: a body turning about a hinge on the ground must lift off
 * the fixed masonry, not drive into it. Positive is separation.
 */
export function openingRates(hinges, motion) {
  const zero = { vx: 0, vy: 0, omega: 0 };
  const n = motion.motions.length;
  return hinges.map((h, k) => {
    if (!h.opposite || !h.along) return 0;
    const L = k - 1 >= 0 ? motion.motions[k - 1] : zero;
    const R = k < n ? motion.motions[k] : zero;
    const vL = velocity(L, h.opposite);
    const vR = velocity(R, h.opposite);
    return (vR[0] - vL[0]) * h.along[0] + (vR[1] - vL[1]) * h.along[1];
  });
}

/**
 * The virtual work of the loads on a rigid-block motion: `Lh` of unit
 * horizontal forces W in +x, and `Lw` of the weights and the applied forces.
 *
 * @param {object} input   from `multiplierInput`
 * @param {number[]} bodyOf  macro-block of each voussoir, -1 when it stays put
 * @param {object} motion  from `mechanismMotion`
 */
export function virtualWork(input, bodyOf, motion) {
  const { weights, centroids, applied, nBlocks } = input;
  let Lh = 0;
  let Lw = 0;
  let scale = 0;
  for (let k = 0; k < nBlocks; k++) {
    const b = bodyOf[k];
    if (b === undefined || b < 0) continue;
    const v = velocity(motion.motions[b], centroids[k]);
    Lh += weights[k] * v[0];
    Lw -= weights[k] * v[1];
    scale += Math.abs(weights[k]) * Math.hypot(v[0], v[1]);
  }
  for (const f of applied) {
    const b = bodyOf[f.block];
    if (b === undefined || b < 0) continue;
    const v = velocity(motion.motions[b], f.point);
    Lw += f.vector[0] * v[0] + f.vector[1] * v[1];
    scale += Math.hypot(f.vector[0], f.vector[1]) * Math.hypot(v[0], v[1]);
  }
  return { Lh, Lw, scale };
}

/**
 * The activation multiplier of one mechanism, by the principle of virtual work.
 *
 * @param {object} input   from `multiplierInput`
 * @param {Array<{joint:number, face:string}>} picks  four hinges
 * @returns {object} in the shape of `analyse()`, plus `alpha`, `direction`
 *          (+1 or -1) and `reason` when the mechanism is not admissible
 */
export function mechanismMultiplier(input, picks) {
  const { joints, nBlocks } = input;
  const sorted = [...picks].sort((p, q) => p.joint - q.joint);
  const fail = (reason) => ({
    alpha: null, direction: 0, reason, hinges: [], bodies: [], bodyOf: [],
    dof: 0, motion: null, openings: [], kinematic: false, verdict: reason,
  });
  if (sorted.length !== 4) return fail('a mechanism of the arch needs exactly four hinges');
  if (new Set(sorted.map((p) => p.joint)).size !== 4) {
    return fail('two hinges on the same joint');
  }
  const last = sorted.length - 1;
  const hinges = sorted.map((p, k) => hingeAt(joints, p.joint, p.face, {
    support: k === 0 || k === last, ends: true,
  }));
  const bodyList = bodies(hinges, nBlocks);
  const bodyOf = bodyOfBlock(bodyList, nBlocks);
  const motion = mechanismMotion(hinges, bodyList);
  if (motion.dof !== 1) {
    return fail(motion.dof === 0
      ? 'these hinges lock the arch: no motion is possible'
      : `these hinges leave ${motion.dof} degrees of freedom`);
  }
  const rates = openingRates(hinges, motion);
  const fastest = Math.max(...rates.map(Math.abs), 0);
  const live = rates.filter((v) => Math.abs(v) > fastest * 1e-9);
  const sense = !live.length ? 0 : live.every((v) => v > 0) ? 1 : live.every((v) => v < 0) ? -1 : 0;
  if (!sense) return fail('the joints cannot all open: the masonry would interpenetrate');
  motion.motions.forEach((m) => {
    m.vx *= sense; m.vy *= sense; m.omega *= sense;
  });
  const openings = rates.map((v) => v * sense);

  const { Lh, Lw, scale } = virtualWork(input, bodyOf, motion);
  if (!(Math.abs(Lh) > scale * 1e-9)) {
    return fail('a horizontal action does no work on this mechanism');
  }
  const direction = Lh > 0 ? 1 : -1;
  const alpha = Math.max(0, -Lw / Math.abs(Lh));
  const where = hinges
    .map((h) => `${h.joint} ${h.face}`)
    .join(', ');
  return {
    alpha,
    direction,
    reason: null,
    picks: sorted.map(({ joint, face }) => ({ joint, face })),
    hinges,
    bodies: bodyList,
    bodyOf,
    hingeCount: 4,
    bodyCount: bodyList.length,
    constraints: 8,
    dof: 1,
    motion,
    openings,
    kinematic: true,
    verdict: `activated by ${direction > 0 ? '+x' : '−x'} at α0 = ${alpha.toPrecision(4)}`
      + (alpha === 0 ? ' — the vertical loads alone already drive it' : '')
      + ` · hinges at joints ${where}`,
  };
}

/**
 * The least activation multiplier over every four-hinge mechanism, for loads
 * in +x and in -x.
 *
 * Every choice of joints i < j < k < l and of the face of each hinge is tried.
 * Bodies 1 and 3 turn about the ground hinges A and D; the centre of body 2 is
 * where line AB meets line DC (Kennedy), and the rotations follow from the
 * signed distances along those lines. With prefix sums of W, Wx and Wy per
 * voussoir the virtual work of each choice is a handful of products, so the
 * whole search is C(N, 4) * 16 of them. The best mechanism in each direction is
 * then recomputed with `mechanismMotion` as a check, and returned from there.
 *
 * @param {object} input  from `multiplierInput`
 * @param {object} [opt]  `range: [first, last]` joints (imposed ends),
 *                        `limit` evaluations before a coarse-then-refine search
 * @returns {{plus: object|null, minus: object|null, evaluated: number,
 *            standsUnderGravity: boolean}}
 */
export function minimumMultiplier(input, opt = {}) {
  const { joints, weights, centroids, applied, nBlocks } = input;
  const first = Math.max(0, opt.range?.[0] ?? 0);
  const lastJoint = Math.min(nBlocks, opt.range?.[1] ?? nBlocks);
  const limit = opt.limit ?? 3e7;

  // Prefix sums over voussoirs: S[k] is the sum over voussoirs 0..k-1.
  const n = nBlocks;
  const SW = new Float64Array(n + 1);
  const SX = new Float64Array(n + 1);
  const SY = new Float64Array(n + 1);
  const FX = new Float64Array(n + 1);
  const FY = new Float64Array(n + 1);
  const FXY = new Float64Array(n + 1);   // sum Fx * Py
  const FYX = new Float64Array(n + 1);   // sum Fy * Px
  const perBlock = Array.from({ length: n }, () => [0, 0, 0, 0]);
  for (const f of applied) {
    if (f.block < 0 || f.block >= n) continue;
    const r = perBlock[f.block];
    r[0] += f.vector[0];
    r[1] += f.vector[1];
    r[2] += f.vector[0] * f.point[1];
    r[3] += f.vector[1] * f.point[0];
  }
  for (let k = 0; k < n; k++) {
    const w = weights[k];
    SW[k + 1] = SW[k] + w;
    SX[k + 1] = SX[k] + w * centroids[k][0];
    SY[k + 1] = SY[k] + w * centroids[k][1];
    FX[k + 1] = FX[k] + perBlock[k][0];
    FY[k + 1] = FY[k] + perBlock[k][1];
    FXY[k + 1] = FXY[k] + perBlock[k][2];
    FYX[k + 1] = FYX[k] + perBlock[k][3];
  }

  // Hinge geometry per joint and face: the point, the far end, the direction.
  const geo = joints.map((j, i) => FACES.map((face) => ({
    p: face === 'extrados' ? j.b : j.a,
    o: face === 'extrados' ? j.a : j.b,
    t: jointAlong(joints, i, true) ?? [0, 0],
  })));

  const span = Math.max(...joints.flatMap((j) => [j.a[0], j.b[0]]))
    - Math.min(...joints.flatMap((j) => [j.a[0], j.b[0]]));
  const tiny = (span || 1) * 1e-12;

  // Horizontal and vertical work of a body over voussoirs [p, q) turning at
  // omega about O: Lh = omega (Oy SW - SY), Lw = -omega (SX - Ox SW) + forces.
  const work = (p, q, omega, ox, oy, out) => {
    const sw = SW[q] - SW[p];
    out.h += omega * (oy * sw - (SY[q] - SY[p]));
    out.w += -omega * ((SX[q] - SX[p]) - ox * sw);
    const fx = FX[q] - FX[p];
    const fy = FY[q] - FY[p];
    out.w += omega * (-(FXY[q] - FXY[p]) + oy * fx + (FYX[q] - FYX[p]) - ox * fy);
  };
  // Opening at the far end o along t of body R relative to body L, each a
  // rotation {omega, ox, oy} (omega 0 for the ground).
  const rel = (o, t, L, R) => {
    const vL = [-L.omega * (o[1] - L.oy), L.omega * (o[0] - L.ox)];
    const vR = [-R.omega * (o[1] - R.oy), R.omega * (o[0] - R.ox)];
    return (vR[0] - vL[0]) * t[0] + (vR[1] - vL[1]) * t[1];
  };

  const best = { plus: null, minus: null };
  let evaluated = 0;
  let gravityDrives = false;
  const ground = { omega: 0, ox: 0, oy: 0 };

  const evaluate = (i, j, k, l, fi, fj, fk, fl) => {
    evaluated++;
    const A = geo[i][fi];
    const B = geo[j][fj];
    const C = geo[k][fk];
    const D = geo[l][fl];
    // Centre of body 2: lines A-B and D-C.
    const u = [B.p[0] - A.p[0], B.p[1] - A.p[1]];
    const v = [C.p[0] - D.p[0], C.p[1] - D.p[1]];
    const den = u[0] * v[1] - u[1] * v[0];
    const lu = Math.hypot(u[0], u[1]);
    const lv = Math.hypot(v[0], v[1]);
    if (!(lu > tiny) || !(lv > tiny)) return;
    if (Math.abs(den) <= lu * lv * 1e-10) return;    // parallel: translation, rare
    const r = [D.p[0] - A.p[0], D.p[1] - A.p[1]];
    const s = (r[0] * v[1] - r[1] * v[0]) / den;
    const O = [A.p[0] + s * u[0], A.p[1] + s * u[1]];
    // Along AB: B - A = 1 * u, B - O = (1 - s) * u. omega1 (B - A) = omega2 (B - O).
    if (Math.abs(1 - s) <= 1e-10) return;
    const w1 = 1;
    const w2 = w1 / (1 - s);
    // Along DC: C - D = 1 * v, C - O = (C - O) . v / |v|^2 in units of v.
    const t2 = ((C.p[0] - O[0]) * v[0] + (C.p[1] - O[1]) * v[1]) / (lv * lv);
    const w3 = w2 * t2;
    const b1 = { omega: w1, ox: A.p[0], oy: A.p[1] };
    const b2 = { omega: w2, ox: O[0], oy: O[1] };
    const b3 = { omega: w3, ox: D.p[0], oy: D.p[1] };

    const o1 = rel(A.o, A.t, ground, b1);
    const o2 = rel(B.o, B.t, b1, b2);
    const o3 = rel(C.o, C.t, b2, b3);
    const o4 = rel(D.o, D.t, b3, ground);
    const big = Math.max(Math.abs(o1), Math.abs(o2), Math.abs(o3), Math.abs(o4));
    if (!(big > 0)) return;
    const eps = big * 1e-9;
    let sense;
    if (o1 >= -eps && o2 >= -eps && o3 >= -eps && o4 >= -eps) sense = 1;
    else if (o1 <= eps && o2 <= eps && o3 <= eps && o4 <= eps) sense = -1;
    else return;

    const acc = { h: 0, w: 0 };
    work(i, j, w1, b1.ox, b1.oy, acc);
    work(j, k, w2, b2.ox, b2.oy, acc);
    work(k, l, w3, b3.ox, b3.oy, acc);
    const Lh = sense * acc.h;
    const Lw = sense * acc.w;
    const scale = (SW[l] - SW[i]) * Math.max(Math.abs(w1), Math.abs(w2), Math.abs(w3)) * (span || 1);
    if (!(Math.abs(Lh) > scale * 1e-12)) return;
    const raw = -Lw / Math.abs(Lh);
    if (raw < 0) gravityDrives = true;
    const alpha = Math.max(0, raw);
    const key = Lh > 0 ? 'plus' : 'minus';
    if (!best[key] || alpha < best[key].alpha) {
      best[key] = { alpha, picks: [[i, fi], [j, fj], [k, fk], [l, fl]] };
    }
  };

  const sweep = (idx) => {
    const m = idx.length;
    for (let a = 0; a < m; a++) {
      for (let b = a + 1; b < m; b++) {
        for (let c = b + 1; c < m; c++) {
          for (let d = c + 1; d < m; d++) {
            for (let f = 0; f < 16; f++) {
              evaluate(idx[a], idx[b], idx[c], idx[d], f & 1, (f >> 1) & 1, (f >> 2) & 1, (f >> 3) & 1);
            }
          }
        }
      }
    }
  };

  const all = [];
  for (let i = first; i <= lastJoint; i++) all.push(i);
  const combos = (m) => (m * (m - 1) * (m - 2) * (m - 3)) / 24 * 16;
  if (combos(all.length) <= limit) {
    sweep(all);
  } else {
    // Coarse pass on every stride-th joint, then walk each hinge of the best
    // mechanisms joint by joint while it improves.
    let stride = 2;
    while (combos(Math.ceil(all.length / stride) + 1) > limit) stride++;
    const coarse = all.filter((_, t) => t % stride === 0);
    if (coarse[coarse.length - 1] !== lastJoint) coarse.push(lastJoint);
    sweep(coarse);
    for (const key of ['plus', 'minus']) {
      let improved = true;
      while (improved && best[key]) {
        improved = false;
        const start = best[key].alpha;
        const picks = best[key].picks;
        for (let h = 0; h < 4; h++) {
          for (let step = -stride; step <= stride; step++) {
            for (let face = 0; face < 2; face++) {
              const trial = picks.map((p) => p.slice());
              trial[h] = [picks[h][0] + step, face];
              const js = trial.map((p) => p[0]);
              if (js[0] < first || js[3] > lastJoint) continue;
              if (!(js[0] < js[1] && js[1] < js[2] && js[2] < js[3])) continue;
              evaluate(...js, ...trial.map((p) => p[1]));
            }
          }
        }
        if (best[key].alpha < start - 1e-12) improved = true;
      }
    }
  }

  const finish = (entry) => {
    if (!entry) return null;
    const picks = entry.picks.map(([joint, f]) => ({ joint, face: FACES[f] }));
    const exact = mechanismMultiplier(input, picks);
    return exact.reason ? null : exact;
  };
  return {
    plus: finish(best.plus),
    minus: finish(best.minus),
    evaluated,
    standsUnderGravity: !gravityDrives,
  };
}
