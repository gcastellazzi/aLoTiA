/**
 * Recovering the joints of a stored example from its voussoirs.
 *
 * WHY THIS EXISTS. Admissibility and the whole mechanism analysis are asked
 * one question — where does the line of thrust cross each joint — and a joint
 * is the only thing the twenty-eight converted MATLAB examples do not carry.
 * `Blocks_coordinates_4_points` holds the voussoirs; the cuts between them
 * were never written to the .mat file. Without them `jointCrossings` has
 * nothing to cross, so on every stored example the admissibility panel read
 * "available for a traced arch, which has joints", the Mechanism tab stayed
 * empty, and H min and H max did nothing. The features the software is for
 * were reachable only by tracing a photograph from scratch.
 *
 * The joints are not lost, though: they are the faces along which consecutive
 * voussoirs abut, and that is recoverable from the polygons themselves.
 *
 * THE INTERIOR JOINTS. Blocks k and k+1 touch along one face. Every vertex of
 * either block that lies on the boundary of the other is a point of that face,
 * and the joint is the segment between the two furthest apart. Taking the
 * extremes rather than a single shared edge is deliberate: it is the same
 * convention `cutRadially` already uses, where a cut through a double shell
 * "runs from the first material entered to the last left" with the voids
 * inside it, so a joint recovered here means exactly what a joint built there
 * means.
 *
 * THE TWO END JOINTS. The springings abut nothing, so they are found from the
 * one joint each end block does have. Measuring distance ALONG the arch — the
 * component on the normal to that joint, not the raw distance from it — the
 * end face is the material furthest away, and the joint is the segment across
 * it. Measuring the raw distance instead picks the extrados face on any
 * voussoir wider than it is long, which is most of them; that was the first
 * attempt and it put a springing joint along the back of the arch.
 *
 * WHAT CANNOT BE RECOVERED, AND IS SAID SO. Some stored examples are not a
 * chain of abutting voussoirs at all. The Poleni domes flattened their
 * two-piece blocks into one polygon each and interleaved the two shells, so
 * consecutive entries in the array are not neighbours in the ring; the Amiens
 * and San Francesco sections carry piers and detached members. There the
 * reconstruction reports a broken chain and the application leaves the arch
 * without joints, as before, rather than inventing cuts and drawing a verdict
 * on them. Those sections are reachable through "trace a whole profile", which
 * builds proper joints — including multi-piece ones — from the outline.
 */

import { distance } from './geometry.js';

/** A polygon `{x, y}` as a list of points, which is what this module works in. */
function points(poly) {
  if (Array.isArray(poly)) return poly;
  return poly.x.map((x, i) => [x, poly.y[i]]);
}

const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1];
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** How far a point lies from the boundary of a polygon. */
export function distanceToBoundary(p, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const v = sub(b, a);
    const len = dot(v, v);
    let t = len ? dot(sub(p, a), v) / len : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, distance(p, [a[0] + t * v[0], a[1] + t * v[1]]));
  }
  return best;
}

/**
 * The face along which two voussoirs abut, or null if they do not.
 *
 * @param {number[][]} A  one block, as points
 * @param {number[][]} B  the next block
 * @param {number} tol    how close counts as touching, in model units
 */
export function contactJoint(A, B, tol) {
  const on = [];
  for (const p of A) if (distanceToBoundary(p, B) <= tol) on.push(p);
  for (const q of B) if (distanceToBoundary(q, A) <= tol) on.push(q);
  if (on.length < 2) return null;

  let best = null;
  for (let i = 0; i < on.length; i++) {
    for (let j = i + 1; j < on.length; j++) {
      const d = distance(on[i], on[j]);
      if (!best || d > best.d) best = { d, a: on[i], b: on[j] };
    }
  }
  return best && best.d > 0 ? { a: best.a, b: best.b, contacts: on.length } : null;
}

/**
 * The free end face of a terminal block, from the one joint it does have.
 *
 * `band` is how much of the block's extent along the arch counts as "the end":
 * a face broken into two edges by a stray traced point, or the two shells of a
 * double section, both still come back as one joint spanning them. It has to
 * be generous. A voussoir is rarely square to its joints — on the Heyman arch
 * the two ends of the springing face sit at 63 % and 100 % of the block's
 * reach along the arch — so a narrow band keeps one of them and leaves nothing
 * to draw a joint between. Half the reach is the natural cut: the two vertices
 * of the joint we started from lie at zero.
 */
export function endJoint(P, inner, band = 0.5) {
  const m = mid(inner.a, inner.b);
  const u = sub(inner.b, inner.a);
  const len = Math.hypot(u[0], u[1]) || 1;
  const along = [u[0] / len, u[1] / len];
  const away = [-along[1], along[0]];          // ALONG the arch, not across it

  const s = P.map((p) => dot(sub(p, m), away));
  // Which way the block lies from its joint; the far side is the end face.
  const sign = s.reduce((a, b) => a + b, 0) >= 0 ? 1 : -1;
  const q = s.map((v) => v * sign);
  const hi = Math.max(...q);
  const lo = Math.min(...q);
  let far = P.filter((_, i) => q[i] >= hi - (hi - lo) * band);
  if (far.length < 2) {
    // Whatever the shape, the two points furthest along the arch are the end.
    far = P.map((p, i) => [q[i], p])
      .sort((x, y) => y[0] - x[0])
      .slice(0, 2)
      .map(([, p]) => p);
  }
  if (far.length < 2) return null;

  let a = far[0];
  let b = far[0];
  for (const p of far) {
    if (dot(p, along) < dot(a, along)) a = p;
    if (dot(p, along) > dot(b, along)) b = p;
  }
  return distance(a, b) > 0 ? { a, b } : null;
}

/** The diagonal of the bounding box of every block: the scale of the model. */
function modelDiagonal(P) {
  const all = P.flat();
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  return Math.hypot(Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys));
}

/**
 * Order every joint so that `a` is the intrados end and `b` the extrados.
 *
 * `jointCrossings` reports the crossing as a fraction from `a` to `b` and the
 * whole of `mechanism.js` reads 0 as the intrados, so getting this backwards
 * does not throw — it reports hinges on the wrong face and animates a
 * mechanism that is the mirror of the real one.
 *
 * Two steps. Each joint is first aligned with the one before it, so the chain
 * does not cross over itself; then the two chains are compared and the SHORTER
 * one is taken as the intrados, which it is for any ring.
 */
export function orientJoints(joints) {
  const out = joints.map((j) => ({ ...j, a: j.a, b: j.b }));
  for (let i = 1; i < out.length; i++) {
    const p = out[i - 1];
    const straight = distance(out[i].a, p.a) + distance(out[i].b, p.b);
    const crossed = distance(out[i].a, p.b) + distance(out[i].b, p.a);
    if (crossed < straight) {
      const t = out[i].a;
      out[i].a = out[i].b;
      out[i].b = t;
    }
  }
  const chain = (key) => {
    let s = 0;
    for (let i = 1; i < out.length; i++) s += distance(out[i][key], out[i - 1][key]);
    return s;
  };
  if (chain('a') > chain('b')) {
    for (const j of out) {
      const t = j.a;
      j.a = j.b;
      j.b = t;
    }
  }
  return out;
}

/**
 * The joint chain of a sequence of voussoirs, springing to springing.
 *
 * The blocks must already be in the order the rest of the application uses:
 * centroid x descending, one abutting the next.
 *
 * @param {Array} blocks     polygons `{x, y}` or lists of points
 * @param {object} [opt]     `tol` as a fraction of the model diagonal
 * @returns {{joints: Array<{a:number[], b:number[]}>, ok: boolean,
 *            gaps: number[], warnings: string[]}}
 *          `joints` has one more entry than there are blocks when the chain is
 *          whole; `ok` is false — and `joints` empty — when it is not.
 */
export function jointsFromBlocks(blocks, opt = {}) {
  const { tol = 1e-3, slack = 20, degenerate = 0.05 } = opt;
  const warnings = [];
  const P = (blocks ?? []).map(points);
  if (P.length < 2) {
    return { joints: [], ok: false, gaps: [], warnings: ['fewer than two blocks'] };
  }

  const diag = modelDiagonal(P);
  const near = tol * diag;

  const inner = [];
  const gaps = [];
  for (let k = 0; k + 1 < P.length; k++) {
    // A hand-traced example does not close to floating point, so a looser pass
    // runs beside the strict one. KEEP THE LONGER OF THE TWO, rather than
    // taking the loose one only when the strict one finds nothing: at the apex
    // of Example_6_Pointed_Arch the two faces are half a pixel apart, the
    // strict pass caught the single vertex pair that happened to fall inside
    // its tolerance and returned a joint 0.15 units long across a ring 10
    // units thick, and having succeeded it kept the looser pass from ever
    // running. A short joint is read as a crossing at a wild fraction and
    // reported as a hinge that is not there.
    const strict = contactJoint(P[k], P[k + 1], near);
    const loose = contactJoint(P[k], P[k + 1], near * slack);
    const span = (j) => (j ? distance(j.a, j.b) : -1);
    const j = span(loose) > span(strict) ? loose : strict;
    if (!j) gaps.push(k);
    inner.push(j);
  }

  if (gaps.length) {
    warnings.push(
      `the blocks are not one chain: ${gaps.length} of ${inner.length} `
      + 'consecutive pairs do not touch',
    );
    return { joints: [], ok: false, gaps, warnings };
  }

  const first = endJoint(P[0], inner[0]);
  const last = endJoint(P[P.length - 1], inner[inner.length - 1]);
  if (!first || !last) {
    warnings.push('an end face could not be located');
    return { joints: [], ok: false, gaps, warnings };
  }

  const chain = orientJoints([first, ...inner, last]);

  // A joint of no length is not a joint. It happens where two stored voussoirs
  // meet at a point rather than a face -- the apex of Example_6_Pointed_Arch
  // does exactly this -- and it would be read as a crossing at s = +/- infinity
  // and reported as a spurious hinge, so it is refused loudly instead.
  const lengths = chain.map((j) => distance(j.a, j.b));
  const median = [...lengths].sort((x, y) => x - y)[Math.floor(lengths.length / 2)];
  const thin = lengths
    .map((v, i) => (v < median * degenerate ? i : -1))
    .filter((i) => i >= 0);
  if (thin.length) {
    warnings.push(
      `joint${thin.length > 1 ? 's' : ''} ${thin.join(', ')} `
      + 'came out with no thickness: the voussoirs meet at a point there',
    );
    return { joints: [], ok: false, gaps, warnings };
  }

  return { joints: chain, ok: true, gaps, warnings };
}
