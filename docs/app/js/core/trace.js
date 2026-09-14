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

/** Point, tangent, and normal at a fraction of a polyline's arc length. */
export function curveFrame(pts, fraction) {
  if (!pts || pts.length < 2) throw new Error('the curve needs at least two points');
  const s = arcLengths(pts);
  const total = s[s.length - 1];
  if (!(total > 0)) throw new Error('the curve has zero length');
  const target = Math.max(0, Math.min(1, fraction)) * total;
  let i = 0;
  while (i + 2 < pts.length && s[i + 1] < target) i++;
  let i0 = i;
  let i1 = i + 1;
  if (i > 0 && Math.abs(target - s[i]) <= total * 1e-10) i0 = i - 1;
  if (i + 2 < pts.length && Math.abs(target - s[i + 1]) <= total * 1e-10) i1 = i + 2;
  const dx = pts[i1][0] - pts[i0][0];
  const dy = pts[i1][1] - pts[i0][1];
  const d = Math.hypot(dx, dy) || 1;
  const w = (target - s[i]) / (s[i + 1] - s[i] || 1);
  return {
    point: [
      pts[i][0] + w * (pts[i + 1][0] - pts[i][0]),
      pts[i][1] + w * (pts[i + 1][1] - pts[i][1]),
    ],
    tangent: [dx / d, dy / d],
    normal: [Math.abs(dy) < 1e-15 ? 0 : -dy / d,
      Math.abs(dx) < 1e-15 ? 0 : dx / d],
  };
}

/** Nearest intersection between a polyline and an infinite line. */
function lineHit(pts, origin, direction) {
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  let best = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const e = [pts[i + 1][0] - a[0], pts[i + 1][1] - a[1]];
    const den = cross(e, direction);
    if (Math.abs(den) < 1e-14) continue;
    const r = [origin[0] - a[0], origin[1] - a[1]];
    const u = cross(r, direction) / den;
    if (u < -1e-10 || u > 1 + 1e-10) continue;
    const q = [a[0] + u * e[0], a[1] + u * e[1]];
    const d = Math.hypot(q[0] - origin[0], q[1] - origin[1]);
    if (!best || d < best.d) best = { point: q, d };
  }
  for (const q of [pts[0], pts[pts.length - 1]]) {
    const r = [q[0] - origin[0], q[1] - origin[1]];
    const off = Math.abs(cross(r, direction));
    const d = Math.hypot(r[0], r[1]);
    if (off <= Math.max(1, d) * 1e-10 && (!best || d < best.d)) best = { point: q, d };
  }
  return best?.point ?? null;
}

/**
 * Joint lines based on the local normal of the extrados or mean curve.
 * Sub-normal and super-normal are the limiting horizontal-course (tholos)
 * and vertical-cut (lintel) stereotomies.
 */
export function normalCuts(inner, outer, n, mode = 'normal-midline') {
  const out = sameDirection(inner, outer) ? outer : reverse(outer);
  const ai = resample(inner, n + 1);
  const ao = resample(out, n + 1);
  const middle = ai.map((p, i) => [(p[0] + ao[i][0]) / 2, (p[1] + ao[i][1]) / 2]);
  const reference = mode === 'normal-outer' ? out : middle;
  const joints = [];
  for (let k = 0; k <= n; k++) {
    const frame = curveFrame(reference, k / n);
    const direction = mode === 'subnormal' ? [1, 0]
      : mode === 'supernormal' ? [0, 1] : frame.normal;
    // Parallel-course cuts are stationed on the intrados, whose coordinate
    // range is the smaller one for the usual ring. Stationing them on the
    // midline would put the last horizontal course above a tholos intrados
    // (or the first vertical cut outside a lintel) and the line would miss it.
    const origin = mode === 'subnormal' ? [frame.point[0], ai[k][1]]
      : mode === 'supernormal' ? [ai[k][0], frame.point[1]] : frame.point;
    // The first and last joint are the traced end faces. A one-sided tangent
    // of a polygonal approximation points half a segment away from the exact
    // tangent and its normal can consequently miss the other finite curve.
    const atEnd = k === 0 || k === n;
    const a = atEnd ? (k === 0 ? inner[0] : inner[inner.length - 1])
      : lineHit(inner, origin, direction);
    const b = atEnd ? (k === 0 ? out[0] : out[out.length - 1])
      : lineHit(out, origin, direction);
    if (!a || !b) throw new Error(`cut ${k + 1} does not cross both traced curves`);
    joints.push({
      a, b, normal: frame.normal.slice(), cutDirection: direction.slice(),
      normalSource: mode === 'normal-outer' ? 'outer' : 'midline',
    });
  }
  const scale = Math.max(length(inner), length(out), 1);
  for (let k = 1; k < joints.length; k++) {
    const p = joints[k - 1];
    const q = joints[k];
    if (Math.hypot(p.a[0] - q.a[0], p.a[1] - q.a[1]) < scale * 1e-8
      || Math.hypot(p.b[0] - q.b[0], p.b[1] - q.b[1]) < scale * 1e-8) {
      throw new Error('this stereotomy produces coincident cuts; trace one monotonic branch at a time');
    }
  }
  return joints;
}

function clipHalfPlane(poly, inside, intersection) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ain = inside(a);
    const bin = inside(b);
    if (ain) out.push(a);
    if (ain !== bin) out.push(intersection(a, b));
  }
  return out;
}

function clipRectangle(poly, x0, x1, y0, y1) {
  const vertical = (x) => (a, b) => {
    const t = (x - a[0]) / (b[0] - a[0] || 1);
    return [x, a[1] + t * (b[1] - a[1])];
  };
  const horizontal = (y) => (a, b) => {
    const t = (y - a[1]) / (b[1] - a[1] || 1);
    return [a[0] + t * (b[0] - a[0]), y];
  };
  let q = clipHalfPlane(poly, (p) => p[0] >= x0 - 1e-12, vertical(x0));
  q = clipHalfPlane(q, (p) => p[0] <= x1 + 1e-12, vertical(x1));
  q = clipHalfPlane(q, (p) => p[1] >= y0 - 1e-12, horizontal(y0));
  q = clipHalfPlane(q, (p) => p[1] <= y1 + 1e-12, horizontal(y1));
  return q.filter((p, i) => {
    const a = q[(i - 1 + q.length) % q.length];
    return !a || Math.hypot(p[0] - a[0], p[1] - a[1]) > 1e-10;
  });
}

/** Material intervals cut by a horizontal scan line through a closed outline. */
function horizontalSpans(poly, y) {
  const hits = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
      const t = (y - a[1]) / (b[1] - a[1]);
      hits.push(a[0] + t * (b[0] - a[0]));
    }
  }
  hits.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < hits.length; i += 2) out.push([hits[i], hits[i + 1]]);
  return out;
}

/**
 * Horizontal, equal-height courses covering the complete traced ring.
 * Wide courses are divided to the mean width established below them; alternate
 * courses shift their vertical joints by half that running module.
 */
export function subnormalCourses(inner, outer, courseCount, opt = {}) {
  if (!(courseCount >= 1)) throw new Error('need at least one course');
  const out = sameDirection(inner, outer) ? outer : reverse(outer);
  let outline = [...inner, ...out.slice().reverse()];
  const polygon = { x: outline.map((p) => p[0]), y: outline.map((p) => p[1]) };
  if (signedArea(polygon) < 0) outline = outline.reverse();
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const ymin = Math.min(...ys);
  const ymax = Math.max(...ys);
  const height = ymax - ymin;
  if (!(height > 0)) throw new Error('the traced ring has zero vertical height');
  const h = height / courseCount;
  const blocks = [];
  const courses = [];
  const establishedWidths = [];
  const areaFloor = Math.max((xmax - xmin) * height, 1) * 1e-10;
  const requestedWidth = Math.max(0, Number(opt.blockWidth) || 0);

  for (let row = 0; row < courseCount; row++) {
    const y0 = ymin + row * h;
    const y1 = row + 1 === courseCount ? ymax : y0 + h;
    const spans = horizontalSpans(outline, (y0 + y1) / 2);
    if (!spans.length) continue;
    const seed = spans.reduce((s, p) => s + p[1] - p[0], 0) / spans.length;
    const mean = requestedWidth || (establishedWidths.length
      ? establishedWidths.reduce((s, v) => s + v, 0) / establishedWidths.length
      : seed);
    const module = Math.max(mean, (xmax - xmin) * 1e-6);
    const offset = row % 2 ? module / 2 : 0;
    const rowBlocks = [];

    // Partition the complete course width, not only its section at mid-height:
    // a curved face bulges beyond that section near either bed joint. Limiting
    // the cells to the midpoint spans left narrow uncovered crescents.
    const cuts = [xmin, xmax];
    const first = Math.ceil(-offset / module);
    const last = Math.floor((xmax - xmin - offset) / module);
    for (let k = first; k <= last; k++) {
      const x = xmin + offset + k * module;
      if (x > xmin + 1e-9 && x < xmax - 1e-9) cuts.push(x);
    }
    cuts.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cuts.length; k++) {
      const pts = clipRectangle(outline, cuts[k], cuts[k + 1], y0, y1);
      if (pts.length < 3) continue;
      const block = { x: pts.map((p) => p[0]), y: pts.map((p) => p[1]) };
      if (Math.abs(signedArea(block)) <= areaFloor) continue;
      if (signedArea(block) < 0) { block.x.reverse(); block.y.reverse(); }
      rowBlocks.push(block);
      const width = Math.max(...block.x) - Math.min(...block.x);
      // Half blocks at the ends create the bond but must not progressively
      // shrink its module as the construction rises.
      if (width >= module * 0.45) establishedWidths.push(width);
    }
    blocks.push(...rowBlocks);
    courses.push({ y0, y1, blocks: rowBlocks.length, module });
  }
  if (!blocks.length) throw new Error('the horizontal courses miss the traced ring');
  const endJoints = [
    { a: inner[0], b: out[0] },
    { a: inner[inner.length - 1], b: out[out.length - 1] },
  ];
  return { blocks, joints: null, endJoints, courses, courseHeight: h,
    meanWidth: establishedWidths.reduce((s, v) => s + v, 0) / (establishedWidths.length || 1) };
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
export function blocksBetween(inner, outer, n, opt = {}) {
  if (n < 1) throw new Error('need at least one block');
  let out = outer;
  let flipped = false;
  if (!sameDirection(inner, outer)) {
    out = reverse(outer);
    flipped = true;
  }

  const mode = opt.cutMode ?? 'stations';
  if (mode === 'subnormal') {
    return { ...subnormalCourses(inner, out, n, { blockWidth: opt.blockWidth }), flipped };
  }
  const computed = mode === 'stations' ? null : normalCuts(inner, out, n, mode);
  const a = computed ? computed.map((j) => j.a) : resample(inner, n + 1);
  const b = computed ? computed.map((j) => j.b) : resample(out, n + 1);

  const blocks = [];
  const joints = [];
  for (let j = 0; j < n; j++) {
    blocks.push({
      x: [a[j][0], b[j][0], b[j + 1][0], a[j + 1][0]],
      y: [a[j][1], b[j][1], b[j + 1][1], a[j + 1][1]],
    });
  }
  for (let j = 0; j <= n; j++) joints.push(computed?.[j] ?? { a: a[j], b: b[j] });

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
