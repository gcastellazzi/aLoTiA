/**
 * Turning a traced outline into voussoirs.
 *
 * The workflow the tool is built around: the student loads a photograph or a
 * drawing of a real arch, traces its intrados and its extrados, and asks for
 * N blocks. Everything downstream -- weights, force polygon, thrust line --
 * follows from those two curves.
 *
 * Pure functions only. The clicking and the drawing live elsewhere.
 */

import { area, centroid, signedArea, blockArea } from './geometry.js';

/** Cumulative arc length along a polyline. Returns [0, ..., total]. */
export function arcLengths(pts) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) {
    s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0],
      pts[i][1] - pts[i - 1][1]));
  }
  return s;
}

/** Total length of a polyline. */
export function length(pts) {
  const s = arcLengths(pts);
  return s[s.length - 1];
}

/**
 * Resample a polyline to `n` points equally spaced ALONG THE CURVE.
 *
 * Equal spacing in arc length, not in x: on a semicircular arch the two differ
 * enormously near the springings, and spacing by x would give voussoirs that
 * grow without bound as the tangent turns vertical.
 */
export function resample(pts, n) {
  if (n < 2) throw new Error('need at least two points');
  if (pts.length < 2) throw new Error('the polyline needs at least two points');
  const s = arcLengths(pts);
  const total = s[s.length - 1];
  if (total === 0) return Array.from({ length: n }, () => pts[0].slice());

  const out = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (seg < s.length - 2 && s[seg + 1] < target) seg += 1;
    const t = (target - s[seg]) / (s[seg + 1] - s[seg] || 1);
    out.push([
      pts[seg][0] + t * (pts[seg + 1][0] - pts[seg][0]),
      pts[seg][1] + t * (pts[seg + 1][1] - pts[seg][1]),
    ]);
  }
  return out;
}

/** Reverse a polyline. */
export function reverse(pts) {
  return pts.slice().reverse();
}

/**
 * Are the two traced curves running the same way round?
 *
 * A student tracing the extrados left-to-right and the intrados right-to-left
 * would otherwise get bow-tie blocks: every quadrilateral self-intersecting,
 * every area wrong, and no error message. Comparing the distance between the
 * two starting points against the distance from one start to the other end
 * settles it.
 */
export function sameDirection(a, b) {
  const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const head = d(a[0], b[0]) + d(a[a.length - 1], b[b.length - 1]);
  const crossed = d(a[0], b[b.length - 1]) + d(a[a.length - 1], b[0]);
  return head <= crossed;
}

/**
 * Build `n` voussoirs between an intrados and an extrados curve.
 *
 * Each block is the quadrilateral between two consecutive stations, given
 * counter-clockwise as inner-j, outer-j, outer-j+1, inner-j+1 -- the same
 * ordering the MATLAB app writes into Blocks_coordinates_4_points, so the
 * result drops straight into the rest of the pipeline.
 *
 * @param {number[][]} inner  the intrados, traced end to end
 * @param {number[][]} outer  the extrados
 * @param {number} n          how many blocks
 * @returns {{blocks: Array<{x:number[],y:number[]}>, joints: Array,
 *            flipped: boolean}}
 */
export function blocksBetween(inner, outer, n) {
  if (n < 1) throw new Error('need at least one block');
  let out = outer;
  let flipped = false;
  if (!sameDirection(inner, outer)) {
    out = reverse(outer);
    flipped = true;
  }

  const a = resample(inner, n + 1);
  const b = resample(out, n + 1);

  const blocks = [];
  const joints = [];
  for (let j = 0; j < n; j++) {
    blocks.push({
      x: [a[j][0], b[j][0], b[j + 1][0], a[j + 1][0]],
      y: [a[j][1], b[j][1], b[j + 1][1], a[j + 1][1]],
    });
  }
  for (let j = 0; j <= n; j++) joints.push({ a: a[j], b: b[j] });

  return { blocks, joints, flipped };
}

/**
 * Complain about a traced pair before it silently produces nonsense.
 *
 * Returns a list of human-readable problems; empty means the trace is usable.
 */
export function checkTrace(inner, outer, n) {
  const problems = [];
  if (!inner || inner.length < 2) problems.push('the intrados needs at least two points');
  if (!outer || outer.length < 2) problems.push('the extrados needs at least two points');
  if (problems.length) return problems;

  if (length(inner) === 0 || length(outer) === 0) {
    problems.push('one of the curves has zero length');
    return problems;
  }
  const { blocks } = blocksBetween(inner, outer, n);
  const signed = blocks.map(signedArea);
  const total = signed.reduce((s, v) => s + Math.abs(v), 0);
  if (total === 0) {
    problems.push('the two curves coincide: there is no masonry between them');
    return problems;
  }

  // CROSSING CURVES TURN BLOCKS INSIDE OUT, they do not make them small. Where
  // the extrados dips inside the intrados the quadrilateral reverses its
  // orientation, so the signed areas change sign. Testing for small |area|
  // misses this completely: an inverted block can be as large as a good one.
  const positive = signed.filter((v) => v > 0).length;
  const negative = signed.filter((v) => v < 0).length;
  if (positive && negative) {
    problems.push(`the two curves cross: ${Math.min(positive, negative)} ` +
      'of the blocks come out inside out');
  }

  const tiny = signed
    .map(Math.abs)
    .filter((v) => v < total / (blocks.length * 50)).length;
  if (tiny) {
    problems.push(`${tiny} block(s) come out almost degenerate`);
  }
  return problems;
}

/**
 * Weights of traced blocks.
 *
 * Kept here rather than in blocks.js because a traced arch has no per-block
 * thickness table: one thickness applies to all of them until the user says
 * otherwise.
 */
export function weighBlocks(blocks, { specificWeight = 20, thickness = 1 } = {}) {
  // blockArea sums over the pieces, so a voussoir cut from a double shell
  // weighs what both of its pieces weigh.
  return blocks.map((b) => blockArea(b) * specificWeight * thickness);
}

/** Centroids of traced blocks. */
export function centroidsOf(blocks) {
  return blocks.map(centroid);
}

/**
 * The two springings, taken as the outer ends of the first and last joints.
 *
 * The funicular has to start and finish somewhere, and the mid-point of the
 * end joint is the honest choice: it is where the thrust crosses the abutment
 * if it is centred there.
 */
export function springings(joints) {
  const mid = (j) => [(j.a[0] + j.b[0]) / 2, (j.a[1] + j.b[1]) / 2];
  const first = mid(joints[0]);
  const last = mid(joints[joints.length - 1]);
  // B is the one further to the right: the construction walks from B to A,
  // taking blocks in order of descending centroid x.
  return first[0] >= last[0] ? { pointB: first, pointA: last }
    : { pointB: last, pointA: first };
}
