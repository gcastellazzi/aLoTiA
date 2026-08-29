/**
 * Hinges, macro-blocks, and the collapse mechanism.
 *
 * THE RULE. The line of thrust cannot leave the thickness of the arch. Where
 * it would, it stays hooked at the point -- intrados or extrados -- between two
 * voussoirs, and that point is a HINGE. While the line runs clear of both
 * faces, nothing is located: the arch is one body on two supports, and the
 * equilibrium state is not determined. Each face the line touches divides the
 * arch into one more rigid macro-block.
 *
 * THE COUNT. Take the two springings as hinges throughout, so a chain of h
 * hinges carries b = h - 1 bodies:
 *
 *   interior   h   b    3b - 2h   state
 *   ---------------------------------------------------------------
 *       0      2   1      -1      once hyperstatic, not determined
 *       1      3   2       0      isostatic: three hinges
 *       2      4   3      +1      one-degree mechanism: collapse
 *
 * so the whole count is dof = h - 3. Two bodies with three hinges is the
 * three-pin arch of every textbook; a fourth hinge turns it into a mechanism.
 *
 * THE KINEMATICS. Rather than applying Kennedy's theorem case by case, the
 * velocity field is assembled and its null space taken. Each body carries
 * three unknowns (vx, vy, omega); each hinge equates the velocity of the point
 * it shares, and a hinge to the ground sets that velocity to zero. The null
 * space is the mechanism -- of whatever dimension -- and the instantaneous
 * centres fall out of it. A general solve costs a few lines more than the
 * special case and does not have to be revisited when the arch produces five
 * hinges instead of four.
 */

import {
  forcePolygon, freeThrustLine, jointCrossings,
} from './statics.js';

/** How close to a face counts as touching it, as a fraction of the joint. */
export const TOUCH = 0.02;

// ------------------------------------------------------------- the search --

/**
 * The most comfortable line of thrust at a given horizontal thrust.
 *
 * Two parameters are left once the thrust is fixed: where the line starts on
 * its springing joint, and how the total load divides between the reactions.
 * This maximises the least clearance from the two faces over both, which is
 * what makes hinges appear on their own: at the middle of the admissible band
 * the best line runs clear of everything, and as the thrust is pushed towards
 * either end the best line is squeezed against the faces until it touches.
 *
 * A coarse grid then two shrinking local rounds. Measured at 0.023 ms per
 * candidate for 16 voussoirs and 0.054 ms for 56, so the whole search is tens
 * of milliseconds and runs inside a slider drag.
 *
 * @param {object} seq        centroids and weights, in the sorted order
 * @param {object[]} joints   the joints, springing to springing
 * @param {number} thrust     horizontal thrust, as a fraction of the total load
 * @returns {{lot, crossings, clearance, s, split}|null}
 */
export const SEARCH = { grid: 15, rounds: 2 };

export function bestLineForThrust(seq, joints, thrust, opt = {}) {
  const { grid = SEARCH.grid, rounds = SEARCH.rounds } = opt;
  if (!joints || joints.length < 2 || !seq.weights.length) return null;

  const total = seq.weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;

  const mid = (j) => (j.a[0] + j.b[0]) / 2;
  const first = joints[0];
  const last = joints[joints.length - 1];
  const startJoint = mid(last) >= mid(first) ? last : first;
  const endJoint = startJoint === last ? first : last;

  const evaluate = (s, split) => {
    const fp = forcePolygon(seq.weights, [total * thrust, -total * split]);
    const lot = freeThrustLine(fp, seq.centroids, startJoint, endJoint, s);
    if (!lot.points || lot.points.length < 2) return null;
    const crossings = jointCrossings(lot.points, joints);
    let clearance = Infinity;
    for (const c of crossings) {
      if (!c) return null;                       // a joint never crossed
      clearance = Math.min(clearance, c.s, 1 - c.s);
    }
    return { lot, fp, crossings, clearance, s, split };
  };

  let best = null;
  let sLo = 0;
  let sHi = 1;
  let pLo = 0.05;
  let pHi = 0.95;

  for (let round = 0; round <= rounds; round++) {
    for (let i = 0; i < grid; i++) {
      const s = sLo + ((sHi - sLo) * i) / (grid - 1);
      for (let j = 0; j < grid; j++) {
        const split = pLo + ((pHi - pLo) * j) / (grid - 1);
        const got = evaluate(s, split);
        if (got && (!best || got.clearance > best.clearance)) best = got;
      }
    }
    if (!best) return null;
    // Close in around the best so far, keeping the window inside the domain.
    const ds = (sHi - sLo) / 4;
    const dp = (pHi - pLo) / 4;
    sLo = Math.max(0, best.s - ds);
    sHi = Math.min(1, best.s + ds);
    pLo = Math.max(0.02, best.split - dp);
    pHi = Math.min(0.98, best.split + dp);
  }
  return best;
}

/**
 * The least and greatest thrust admitting a line: the two collapse states.
 *
 * Between them the arch stands, and at either end it is on the point of
 * becoming a mechanism. Found by scanning coarsely for something admissible
 * and then bisecting outwards, which is robust to the band being narrow.
 */
export function collapseRange(seq, joints, opt = {}) {
  const {
    lo = 0.02, hi = 1.2, coarse = 60, refine = 18, zooms = 3, search = {},
  } = opt;
  // The SAME search that will report the state, or the edge would be found
  // with a coarse look and then described with a finer one, and the reported
  // clearance at the edge would not be zero.
  const clearanceAt = (f) => {
    const got = bestLineForThrust(seq, joints, f, search);
    return got ? got.clearance : -Infinity;
  };
  const fits = (f) => clearanceAt(f) >= 0;

  // SEED ON THE CLEARANCE, NOT ON WHETHER IT FITS. Stopping at the first
  // sample that happens to be admissible tests a boolean on a grid, and a band
  // narrower than the grid step falls straight through it. Ctesifonte_01 is
  // that case: it stands between f = 0.041 and 0.061, and the sixty-step grid
  // samples 0.0397 and 0.0593 -- clearance -0.005 on both sides, the band
  // missed by a hair, and a real arch reported as standing at no thrust at
  // all. The clearance itself is continuous and its maximum is resolved by the
  // same grid, so the search follows the maximum down instead and only gives
  // up when a local zoom cannot lift it above zero.
  let seed = null;
  let best = { f: lo, clearance: -Infinity };
  for (let i = 0; i <= coarse; i++) {
    const f = lo + ((hi - lo) * i) / coarse;
    const c = clearanceAt(f);
    if (c > best.clearance) best = { f, clearance: c };
    if (c >= 0) { seed = f; break; }
  }

  if (seed === null) {
    let step = (hi - lo) / coarse;
    for (let z = 0; z < zooms && seed === null; z++) {
      const from = Math.max(lo, best.f - step);
      const to = Math.min(hi, best.f + step);
      for (let i = 0; i <= coarse; i++) {
        const f = from + ((to - from) * i) / coarse;
        const c = clearanceAt(f);
        if (c > best.clearance) best = { f, clearance: c };
        if (c >= 0) { seed = f; break; }
      }
      step = (to - from) / coarse;
    }
  }
  if (seed === null) return null;

  // Widen from the seed: the band is connected in the thrust, so bisecting
  // each side of a point known to fit finds both ends.
  const edge = (from, towards) => {
    let good = from;
    let bad = towards;
    for (let i = 0; i < refine; i++) {
      const m = (good + bad) / 2;
      if (fits(m)) good = m; else bad = m;
    }
    return good;
  };
  return { min: edge(seed, lo), max: edge(seed, hi), seed };
}

/**
 * The line at a demanded thrust, held inside the masonry.
 *
 * THE LINE OF THRUST CANNOT LEAVE THE RING. Outside the admissible band no
 * line fits, and the free funicular computed there is not a solution of
 * anything: on the reference ring at 1.25 times the maximum thrust it left the
 * masonry by four fifths of a joint on one face and four fifths again on the
 * other, and twelve joints of seventeen were crossed outside the thickness.
 * Drawing that alongside a verdict invited the reading that such a state is
 * merely inadmissible, when in truth it does not exist.
 *
 * So a thrust beyond either edge holds the line AT that edge -- the limit
 * state, which is a real admissible line, tangent to the faces at the hinges
 * it forms. What is reported alongside is that the line is being held there
 * and that past it the arch is a mechanism, which is what the kinematic
 * theorem says about a thrust outside the band.
 *
 * The two springings remain hinges to the ground throughout, so A and B carry
 * $u_x = u_y = 0$ whatever the thrust; see `mechanismMotion`.
 *
 * @param {object} seq          centroids and weights, sorted
 * @param {object[]} joints
 * @param {{min:number,max:number}} band  from `collapseRange`
 * @param {number} thrust       the demanded thrust, as a fraction of the load
 * @returns {{lot, fp, crossings, clearance, s, split, thrust, beyond}|null}
 *          `beyond` is +1 held at the maximum, -1 at the minimum, 0 inside
 */
export function constrainedLine(seq, joints, band, thrust, opt = {}) {
  if (!band) return null;
  const held = Math.min(Math.max(thrust, band.min), band.max);
  const beyond = thrust > band.max ? 1 : thrust < band.min ? -1 : 0;
  const best = bestLineForThrust(seq, joints, held, opt);
  return best ? { ...best, thrust: held, beyond } : null;
}

// -------------------------------------------------------------- the hinges --

/**
 * Where the line touches a face, and so where the arch hinges.
 *
 * Consecutive joints touching the SAME face are one hinge, not several. A line
 * running tangent to the intrados grazes two or three joints at once, and
 * counting each would inflate the number of bodies and give the wrong degree
 * of freedom -- the arithmetic would look fine and the answer would be wrong.
 *
 * The two springings are hinges throughout, at wherever the line actually
 * crosses them: the support is there whether or not the line has yet been
 * driven against a face.
 *
 * @returns {Array<{joint:number, s:number, point:number[], face:string,
 *                  support:boolean}>} in joint order
 */
export function findHinges(crossings, joints, tol = TOUCH) {
  if (!crossings || !joints || joints.length < 2) return [];
  const last = joints.length - 1;
  const clearance = (c) => (c ? Math.min(c.s, 1 - c.s) : -Infinity);
  const faceOf = (c) => (c.s < 0.5 ? 'intrados' : 'extrados');

  // Interior joints that touch, grouped into runs on the same face.
  const runs = [];
  for (let i = 1; i < last; i++) {
    const c = crossings[i];
    if (!c || clearance(c) > tol) continue;
    const face = faceOf(c);
    const tail = runs[runs.length - 1];
    if (tail && tail.face === face && tail.end === i - 1) tail.end = i;
    else runs.push({ face, start: i, end: i });
  }

  // A RUN IS NOT ALWAYS ONE HINGE. On a thick ring the tolerance is a fraction
  // of a long joint, so a whole stretch either side of the crown can fall
  // inside it while the line actually leaves the face in between and comes
  // back. Measured on a semicircular ring at t/ri = 0.25 and maximum thrust:
  // joints 5 to 11 all within tolerance, but the clearance reads
  //   0.0172  0.00004  0.0014  0.0043  0.0014  0.00004  0.0172
  // -- two contacts at 6 and 10 with the crown standing clear between them.
  // Taking the run as one hinge gave three hinges and called the limit state
  // isostatic; splitting at the interior maximum gives four and calls it the
  // mechanism it is.
  const split = (run) => {
    const cl = [];
    for (let i = run.start; i <= run.end; i++) cl.push(clearance(crossings[i]));
    const cuts = [];
    for (let k = 1; k + 1 < cl.length; k++) {
      // A real return off the face, not a wobble: twice the flanking contact.
      const flank = Math.min(cl[k - 1], cl[k + 1]);
      if (cl[k] > cl[k - 1] && cl[k] > cl[k + 1] && cl[k] > 2 * flank + 1e-12) {
        cuts.push(k);
      }
    }
    const edges = [0, ...cuts, cl.length - 1];
    const out = [];
    for (let e = 0; e + 1 < edges.length; e++) {
      let at = edges[e];
      for (let k = edges[e]; k <= edges[e + 1]; k++) if (cl[k] < cl[at]) at = k;
      out.push(run.start + at);
    }
    return out;
  };

  // Each hinge also carries what is needed to tell an opening joint from an
  // interpenetrating one: the FAR end of its joint, which is the material that
  // has to separate, and the direction along the arch from the body before the
  // hinge to the body after it.
  const mid = (j) => [(j.a[0] + j.b[0]) / 2, (j.a[1] + j.b[1]) / 2];
  const along = (i) => {
    if (i <= 0 || i >= last) return null;
    const p = mid(joints[i - 1]);
    const q = mid(joints[i + 1]);
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    return [(q[0] - p[0]) / d, (q[1] - p[1]) / d];
  };

  const hinge = (i, support) => {
    const c = crossings[i];
    const f = support && clearance(c) > tol ? 'interior' : faceOf(c);
    const j = joints[i];
    return {
      joint: i,
      s: c.s,
      point: [c.point[0], c.point[1]],
      face: f,
      support,
      // The end of the joint the hinge is NOT at: where the joint must open.
      opposite: f === 'intrados' ? [j.b[0], j.b[1]] : [j.a[0], j.a[1]],
      along: along(i),
    };
  };

  const out = [];
  if (crossings[0]) out.push(hinge(0, true));
  for (const r of runs) for (const at of split(r)) out.push(hinge(at, false));
  if (crossings[last]) out.push(hinge(last, true));
  // Joint order, so the chain runs from one springing to the other.
  return out.sort((a, b) => a.joint - b.joint);
}

/**
 * The rigid macro-blocks: the runs of voussoirs between consecutive hinges.
 *
 * Voussoir k lies between joints k and k+1, so a hinge at joint j cuts the
 * arch between voussoirs j-1 and j.
 *
 * @returns {Array<{from:number, to:number}>} block index ranges, `to` exclusive
 */
export function bodies(hinges, nBlocks) {
  if (hinges.length < 2) return [{ from: 0, to: nBlocks }];
  const out = [];
  for (let i = 0; i + 1 < hinges.length; i++) {
    const from = hinges[i].joint;
    const to = hinges[i + 1].joint;
    if (to > from) out.push({ from, to });
  }
  return out.length ? out : [{ from: 0, to: nBlocks }];
}

/** Which macro-block each voussoir belongs to, -1 if none. */
export function bodyOfBlock(bodyList, nBlocks) {
  const out = new Array(nBlocks).fill(-1);
  bodyList.forEach((b, i) => {
    for (let k = b.from; k < b.to && k < nBlocks; k++) out[k] = i;
  });
  return out;
}

/**
 * The degree of freedom of the chain, and what to call it.
 *
 * b bodies in the plane carry 3b freedoms; h hinges remove 2 each. With the
 * springings counted as hinges, b = h - 1 and the whole thing is h - 3.
 */
export function degreesOfFreedom(hingeCount) {
  const h = hingeCount;
  const b = Math.max(1, h - 1);
  const dof = 3 * b - 2 * h;
  let verdict;
  if (h < 2) {
    verdict = 'no support hinges located';
  } else if (dof < 0) {
    verdict = dof === -1
      ? 'once hyperstatic — the equilibrium state is not determined'
      : `${-dof} times hyperstatic — the equilibrium state is not determined`;
  } else if (dof === 0) {
    verdict = 'isostatic — three hinges, the equilibrium state is determined';
  } else {
    verdict = dof === 1
      ? 'a mechanism, one degree of freedom — collapse'
      : `a mechanism, ${dof} degrees of freedom — collapse`;
  }
  return { hinges: h, bodies: b, constraints: 2 * h, dof, verdict };
}

// ---------------------------------------------------------- the kinematics --

/**
 * Solve A x = 0 for a basis of the null space, by elimination with pivoting.
 *
 * Small dense systems only -- three unknowns per body, two equations per hinge.
 * Returns one vector per dimension of the null space, or an empty array when
 * the only solution is the trivial one.
 */
export function nullSpace(A, nCols, tol = 1e-9) {
  const M = A.map((row) => row.slice());
  const rows = M.length;
  const pivotOf = new Array(nCols).fill(-1);
  let r = 0;

  for (let c = 0; c < nCols && r < rows; c++) {
    let best = r;
    for (let i = r; i < rows; i++) {
      if (Math.abs(M[i][c]) > Math.abs(M[best][c])) best = i;
    }
    if (Math.abs(M[best][c]) < tol) continue;
    [M[r], M[best]] = [M[best], M[r]];
    const p = M[r][c];
    for (let j = c; j < nCols; j++) M[r][j] /= p;
    for (let i = 0; i < rows; i++) {
      if (i === r) continue;
      const f = M[i][c];
      if (f === 0) continue;
      for (let j = c; j < nCols; j++) M[i][j] -= f * M[r][j];
    }
    pivotOf[c] = r;
    r++;
  }

  const free = [];
  for (let c = 0; c < nCols; c++) if (pivotOf[c] < 0) free.push(c);

  return free.map((fc) => {
    const v = new Array(nCols).fill(0);
    v[fc] = 1;
    for (let c = 0; c < nCols; c++) {
      if (pivotOf[c] < 0) continue;
      v[c] = -M[pivotOf[c]][fc];
    }
    return v;
  });
}

/**
 * The velocity field of the chain: one rigid motion per macro-block.
 *
 * Unknowns per body i: (vx, vy, omega), the velocity of the ORIGIN and the
 * rotation, so the velocity of a point P is
 *     v = (vx - omega * Py, vy + omega * Px)
 * Each hinge between bodies i and i+1 equates the two expressions at its own
 * point; each hinge to the ground sets the velocity there to zero.
 *
 * @returns {{dof:number, motions:Array<{vx,vy,omega,centre:number[]|null}>}}
 */
export function mechanismMotion(hinges, bodyList) {
  const n = bodyList.length;
  const cols = 3 * n;
  const rows = [];
  const push = (row) => rows.push(row);

  const at = (row, body, P, sign) => {
    // v = (vx - omega*Py, vy + omega*Px), written into the two equation rows.
    row[0][3 * body] += sign;
    row[0][3 * body + 2] += -sign * P[1];
    row[1][3 * body + 1] += sign;
    row[1][3 * body + 2] += sign * P[0];
  };

  hinges.forEach((h, k) => {
    const left = k - 1;              // body before this hinge
    const right = k;                 // body after it
    const row = [new Array(cols).fill(0), new Array(cols).fill(0)];
    if (left >= 0 && left < n) at(row, left, h.point, 1);
    if (right >= 0 && right < n) at(row, right, h.point, -1);
    // A hinge with a body on one side only is a hinge to the ground: the
    // single term left is set to zero, which is exactly what is wanted.
    push(row[0]);
    push(row[1]);
  });

  const basis = nullSpace(rows, cols);
  const motions = (basis[0] ?? new Array(cols).fill(0));

  return {
    dof: basis.length,
    motions: bodyList.map((_, i) => {
      const vx = motions[3 * i];
      const vy = motions[3 * i + 1];
      const omega = motions[3 * i + 2];
      // The instantaneous centre, where the velocity vanishes. A body with no
      // rotation translates and has no centre.
      const centre = Math.abs(omega) < 1e-12
        ? null
        : [-vy / omega, vx / omega];
      return { vx, vy, omega, centre };
    }),
  };
}

/**
 * How fast the joints open, summed over the interior hinges.
 *
 * MASONRY CANNOT INTERPENETRATE. A hinge sits at one face of its joint, and
 * the joint must open at the OTHER face: a hinge on the intrados opens towards
 * the extrados, and one on the extrados towards the intrados. If the two
 * bodies instead drive that far end into each other, the mechanism is being
 * run backwards.
 *
 * Which happens exactly half the time, because the sign of a null-space vector
 * is arbitrary -- it falls out of the elimination, not out of the mechanics.
 * So the rate is measured and the amplitude takes its sign from it.
 *
 * At the far end O of the joint, the relative velocity of the body after the
 * hinge with respect to the body before it, along the arch, is the opening
 * rate. Positive is separation.
 */
export function jointOpenings(hinges, bodyList, motion) {
  const at = (m, p) => [m.vx - m.omega * p[1], m.vy + m.omega * p[0]];
  const out = [];
  for (let k = 1; k + 1 < hinges.length; k++) {
    const h = hinges[k];
    const L = motion.motions[k - 1];
    const R = motion.motions[k];
    if (!h.along || !h.opposite || !L || !R) { out.push(0); continue; }
    const vL = at(L, h.opposite);
    const vR = at(R, h.opposite);
    out.push((vR[0] - vL[0]) * h.along[0] + (vR[1] - vL[1]) * h.along[1]);
  }
  return out;
}

/**
 * Which way to run the mechanism, or whether it can be run at all.
 *
 * +1 or -1 when one sense opens every joint; 0 when NO sense does, because
 * some joints would open only while others closed. A hinge pattern of that
 * kind is not a collapse mode at all: the masonry would have to pass through
 * itself. It shows up on a symmetric arch at maximum thrust, where the two
 * haunch hinges both fall on the intrados and the crown block is left rotating
 * about a point on the axis rather than dropping, so one haunch opens and the
 * other shuts.
 *
 * @returns {{sense:number, openings:number[]}}
 */
export function separationSense(hinges, bodyList, motion, tol = 1e-9) {
  const openings = jointOpenings(hinges, bodyList, motion);
  const live = openings.filter((v) => Math.abs(v) > tol);
  if (!live.length) return { sense: 1, openings };
  if (live.every((v) => v > 0)) return { sense: 1, openings };
  if (live.every((v) => v < 0)) return { sense: -1, openings };
  return { sense: 0, openings };
}

/** The summed opening rate, kept for the sign alone. */
export function separationRate(hinges, bodyList, motion) {
  return jointOpenings(hinges, bodyList, motion).reduce((a, b) => a + b, 0);
}

/**
 * The displaced arch, at a FINITE amplitude.
 *
 * The instantaneous centres are exactly that: instantaneous. Turning each body
 * about its centre by a finite angle keeps the bodies rigid but lets the
 * hinges open, by an amount second order in the angle -- at an amplitude large
 * enough to see, the arch visibly comes apart at the joints, which is the one
 * thing a collapse drawing must not do.
 *
 * So the motion is integrated instead. At every step the velocity field is
 * re-solved for the CURRENT positions of the hinges and each body is advanced
 * by a small rotation about its current centre. Every body therefore undergoes
 * a composition of rigid transforms and stays exactly rigid, while the hinges
 * close to first order in the step: the residual opening falls like
 * amplitude^2 / steps, and at the default it is far below a pixel.
 *
 * @param {object[]} hinges     as found, in the original configuration
 * @param {object[]} bodyList
 * @param {number} amplitude    radians turned by the fastest body
 * @returns {Array<{cos,sin,tx,ty}>} one rigid transform per body
 */
export function displacedConfiguration(hinges, bodyList, amplitude, steps = 120) {
  const n = bodyList.length;
  const T = Array.from({ length: n }, () => ({ cos: 1, sin: 0, tx: 0, ty: 0 }));
  if (!n || !amplitude) return T;

  const apply = (t, p) => [
    t.cos * p[0] - t.sin * p[1] + t.tx,
    t.sin * p[0] + t.cos * p[1] + t.ty,
  ];
  // A hinge rides on the body before it, or on the body after it at the first
  // springing. Either gives the same point while the chain stays closed.
  const bodyCarrying = (k) => (k - 1 >= 0 && k - 1 < n ? k - 1 : Math.min(k, n - 1));

  // Take the sign from the mechanics rather than from the elimination: the
  // blocks must come apart at the hinges, not drive into one another.
  const first = mechanismMotion(hinges, bodyList);
  // Masonry cannot pass through itself, so the mechanism is run in the sense
  // that opens the joints. Where no sense does that the pattern is not a
  // collapse mode; it is drawn anyway, and analyse() flags it, rather than
  // being silently suppressed.
  const { sense } = separationSense(hinges, bodyList, first);
  let previous = first.motions.map((m) => (sense || 1) * m.omega);

  const dt = amplitude / steps;
  for (let step = 0; step < steps; step++) {
    // The whole hinge travels with the body that carries it: its point, the
    // far end of its joint, and the direction along the arch.
    const T0 = T.map((t) => t);
    const now = hinges.map((h, k) => {
      const t = T0[bodyCarrying(k)];
      return {
        ...h,
        point: apply(t, h.point),
        opposite: h.opposite ? apply(t, h.opposite) : null,
        along: h.along
          ? [t.cos * h.along[0] - t.sin * h.along[1],
            t.sin * h.along[0] + t.cos * h.along[1]]
          : null,
      };
    });

    const motion = mechanismMotion(now, bodyList);
    // The null space is recomputed every step and its sign falls out of the
    // elimination, so it can flip from one step to the next. Left alone the
    // arch would judder back and forth instead of opening. Align each step
    // with the one before it.
    const dot = motion.motions
      .reduce((sum, m, i) => sum + m.omega * previous[i], 0);
    const flip = dot < 0 ? -1 : 1;

    const peak = Math.max(...motion.motions.map((m) => Math.abs(m.omega)), 0);
    if (!(peak > 0)) break;                       // nothing turns: no mechanism
    previous = motion.motions.map((m) => flip * m.omega);

    motion.motions.forEach((m, i) => {
      const w = (flip * m.omega) / peak;
      const t = T[i];
      if (m.centre && Math.abs(w) > 1e-12) {
        const ang = w * dt;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const [cx, cy] = m.centre;
        // Rotate about the centre, composed onto what the body has already
        // done: p -> R(ang) (T p - c) + c.
        const cos = ca * t.cos - sa * t.sin;
        const sin = sa * t.cos + ca * t.sin;
        const tx = ca * t.tx - sa * t.ty + (cx - (ca * cx - sa * cy));
        const ty = sa * t.tx + ca * t.ty + (cy - (sa * cx + ca * cy));
        T[i] = { cos, sin, tx, ty };
      } else {
        const k = (flip * dt) / peak;
        T[i] = { ...t, tx: t.tx + m.vx * k, ty: t.ty + m.vy * k };
      }
    });
  }
  return T;
}

/** Move a point by a body's transform. */
export function transformPoint(t, p) {
  return [
    t.cos * p[0] - t.sin * p[1] + t.tx,
    t.sin * p[0] + t.cos * p[1] + t.ty,
  ];
}

/**
 * Every voussoir, moved with the macro-block it belongs to.
 *
 * @param {Array} polys
 * @param {number[]} bodyOf
 * @param {Array} transforms   the result of displacedConfiguration
 */
export function displaced(polys, bodyOf, transforms) {
  return polys.map((p, k) => {
    const t = transforms[bodyOf[k]];
    if (!t) return { x: [...p.x], y: [...p.y] };
    return {
      x: p.x.map((x, i) => t.cos * x - t.sin * p.y[i] + t.tx),
      y: p.y.map((y, i) => t.sin * p.x[i] + t.cos * y + t.ty),
    };
  });
}

/**
 * Everything the Mechanism panel needs, from one line of thrust.
 *
 * @param {number[][]} lotPoints
 * @param {object[]} crossings
 * @param {object[]} joints
 * @param {number} nBlocks
 */
export function analyse(crossings, joints, nBlocks, tol = TOUCH) {
  const hinges = findHinges(crossings, joints, tol);
  const bodyList = bodies(hinges, nBlocks);
  const bodyOf = bodyOfBlock(bodyList, nBlocks);
  const count = degreesOfFreedom(hinges.length);
  const motion = count.dof > 0 ? mechanismMotion(hinges, bodyList) : null;
  // A positive degree of freedom is not by itself a collapse: the joints have
  // to be able to open. See separationSense.
  const sep = motion
    ? separationSense(hinges, bodyList, motion)
    : { sense: 1, openings: [] };
  // NOT `...count`: it carries `hinges` and `bodies` as counts, and spreading
  // it over the arrays of the same name silently replaced them with numbers.
  return {
    hinges,
    bodies: bodyList,
    bodyOf,
    hingeCount: count.hinges,
    bodyCount: count.bodies,
    constraints: count.constraints,
    dof: count.dof,
    verdict: sep.sense === 0
      ? `${count.verdict}, but the joints cannot all open: `
        + 'this hinge pattern would need the masonry to interpenetrate'
      : count.verdict,
    motion,
    openings: sep.openings,
    kinematic: sep.sense !== 0,
  };
}
