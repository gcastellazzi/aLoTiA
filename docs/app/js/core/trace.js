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

/** Point at arc length `target` along a polyline with cumulative lengths `s`. */
function pointAtLength(pts, s, target) {
  const total = s[s.length - 1];
  const t = Math.max(0, Math.min(total, target));
  let i = 0;
  while (i + 2 < pts.length && s[i + 1] < t) i++;
  const w = (t - s[i]) / (s[i + 1] - s[i] || 1);
  return [
    pts[i][0] + w * (pts[i + 1][0] - pts[i][0]),
    pts[i][1] + w * (pts[i + 1][1] - pts[i][1]),
  ];
}

/**
 * Every crossing of a polyline with an infinite line: the point, its signed
 * distance along the unit `direction`, and its arc-length fraction `u` along
 * the curve.
 */
function lineHits(pts, s, origin, direction) {
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const total = s[s.length - 1] || 1;
  const hits = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const e = [pts[i + 1][0] - a[0], pts[i + 1][1] - a[1]];
    const den = cross(e, direction);
    if (Math.abs(den) <= 1e-14 * Math.hypot(e[0], e[1])) continue;
    const r = [origin[0] - a[0], origin[1] - a[1]];
    const u = cross(r, direction) / den;
    if (u < -1e-10 || u > 1 + 1e-10) continue;
    const q = [a[0] + u * e[0], a[1] + u * e[1]];
    hits.push({
      point: q,
      t: (q[0] - origin[0]) * direction[0] + (q[1] - origin[1]) * direction[1],
      u: (s[i] + Math.max(0, Math.min(1, u)) * (s[i + 1] - s[i])) / total,
    });
  }
  return hits;
}

/** Do the segments p1-p2 and p3-p4 cross at a point interior to both? */
function segmentsCross(p1, p2, p3, p4, tol) {
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const d1 = cr(p3, p4, p1);
  const d2 = cr(p3, p4, p2);
  const d3 = cr(p1, p2, p3);
  const d4 = cr(p1, p2, p4);
  return ((d1 > tol && d2 < -tol) || (d1 < -tol && d2 > tol))
    && ((d3 > tol && d4 < -tol) || (d3 < -tol && d4 > tol));
}

/**
 * The reference curve and the oriented joint direction at every station.
 *
 * The normal is taken from the chord between the points half a block either
 * side of the station, not from the single traced segment the station falls
 * on. On a circle that chord is exactly perpendicular to the radius; on a
 * curve traced with a few clicks, or at a kink such as the crown of a pointed
 * arch or the corner of a flat extrados, it turns gradually instead of
 * jumping from one segment's normal to the next and crossing the cuts. The
 * mean line is built from densely resampled curves for the same reason: built
 * from the n + 1 block stations it was itself a coarse polygon.
 *
 * EVERY NORMAL IS ORIENTED FROM THE INTRADOS TOWARDS THE EXTRADOS, so on a
 * ring it points left on the left haunch and right on the right one. That
 * orientation is what lets each cut look for the intrados on one side of the
 * reference and the extrados on the other, rather than at whichever crossing
 * of an infinite line happens to be nearest.
 */
export function normalFrames(inner, outer, n, mode = 'normal-midline') {
  const out = sameDirection(inner, outer) ? outer : reverse(outer);
  const si = arcLengths(inner);
  const so = arcLengths(out);
  const innerLength = si[si.length - 1];
  const outerLength = so[so.length - 1];
  let reference;
  if (mode === 'normal-outer') {
    reference = out;
  } else {
    const dense = Math.max(200, 16 * n);
    const di = resample(inner, dense + 1);
    const dout = resample(out, dense + 1);
    reference = di.map((p, i) => [(p[0] + dout[i][0]) / 2, (p[1] + dout[i][1]) / 2]);
  }
  const s = arcLengths(reference);
  const total = s[s.length - 1];
  if (!(total > 0)) throw new Error('the reference curve has zero length');
  // Never narrower than the traced segments themselves, or a hand-traced
  // polygon would still hand each station the normal of one straight piece.
  const traced = mode === 'normal-outer'
    ? total / Math.max(1, out.length - 1)
    : Math.max(innerLength / Math.max(1, inner.length - 1),
      outerLength / Math.max(1, out.length - 1));
  const window = Math.max(total / (2 * n), traced);

  const ai = resample(inner, n + 1);
  const frames = [];
  let normalSum = 0;
  let directionSum = 0;
  const P = (at) => pointAtLength(reference, s, at);
  const tiny = total * 1e-9;
  for (let k = 0; k <= n; k++) {
    const at = (total * k) / n;
    // A three-point derivative, exact for a parabola: central where the full
    // window fits, uneven near an end, one-sided at the end itself. Simply
    // shrinking a symmetric window near the springings fell back to the
    // normal of one traced segment there.
    const h1 = Math.min(window, at);
    const h2 = Math.min(window, total - at);
    let t;
    if (h1 <= tiny) {
      const h = Math.min(window, total / 2);
      const [p0, p1, p2] = [P(at), P(at + h), P(at + 2 * h)];
      t = [-3 * p0[0] + 4 * p1[0] - p2[0], -3 * p0[1] + 4 * p1[1] - p2[1]];
    } else if (h2 <= tiny) {
      const h = Math.min(window, total / 2);
      const [p0, p1, p2] = [P(at), P(at - h), P(at - 2 * h)];
      t = [3 * p0[0] - 4 * p1[0] + p2[0], 3 * p0[1] - 4 * p1[1] + p2[1]];
    } else {
      const [p0, p1, p2] = [P(at - h1), P(at), P(at + h2)];
      const c0 = -h2 / (h1 * (h1 + h2));
      const c1 = (h2 - h1) / (h1 * h2);
      const c2 = h1 / (h2 * (h1 + h2));
      t = [c0 * p0[0] + c1 * p1[0] + c2 * p2[0], c0 * p0[1] + c1 * p1[1] + c2 * p2[1]];
    }
    const d = Math.hypot(t[0], t[1]) || 1;
    const tangent = [t[0] / d, t[1] / d];
    const normal = [-tangent[1], tangent[0]];
    const direction = mode === 'supernormal' ? [0, 1] : normal.slice();
    const pi = pointAtLength(inner, si, (innerLength * k) / n);
    const po = pointAtLength(out, so, (outerLength * k) / n);
    const across = [po[0] - pi[0], po[1] - pi[1]];
    normalSum += across[0] * normal[0] + across[1] * normal[1];
    directionSum += across[0] * direction[0] + across[1] * direction[1];
    const point = pointAtLength(reference, s, at);
    const origin = mode === 'supernormal' ? [ai[k][0], point[1]] : point;
    frames.push({ point, origin, tangent, normal, direction });
  }
  const sn = normalSum < 0 ? -1 : 1;
  const sd = directionSum < 0 ? -1 : 1;
  for (const f of frames) {
    f.normal = [sn * f.normal[0] || 0, sn * f.normal[1] || 0];
    f.direction = [sd * f.direction[0] || 0, sd * f.direction[1] || 0];
  }
  return { reference, frames, out };
}

/**
 * Joint lines along the local normal of the extrados or of the mean line, or
 * vertical (super-normal, the lintel limit).
 *
 * Returns `{ joints, frames, reference, error, failed }` and does not throw on
 * an impossible construction, so the interface can draw how far it got and
 * which cut failed.
 */
export function normalCutsPreview(inner, outer, n, mode = 'normal-midline') {
  const { reference, frames, out } = normalFrames(inner, outer, n, mode);
  const si = arcLengths(inner);
  const so = arcLengths(out);
  const scale = Math.max(si[si.length - 1], so[so.length - 1], 1e-12);
  const tol = scale * 1e-9;
  const source = mode === 'normal-outer' ? 'outer'
    : mode === 'supernormal' ? 'vertical' : 'midline';
  const joints = [];
  const fail = (k, error) => ({ joints, frames, reference, error, failed: k });
  const advice = mode === 'normal-outer' ? ' or the mean-line normal' : '';
  let prevInner = 0;
  let prevOuter = 0;
  for (let k = 0; k <= n; k++) {
    const f = frames[k];
    const meta = {
      normal: f.normal.slice(), cutDirection: f.direction.slice(),
      station: f.point.slice(), normalSource: source,
    };
    // The first and last joint are the traced end faces.
    if (k === 0 || k === n) {
      joints.push({
        a: k === 0 ? inner[0] : inner[inner.length - 1],
        b: k === 0 ? out[0] : out[out.length - 1],
        ...meta,
      });
      continue;
    }
    // The intrados lies behind the reference and the extrados ahead of it,
    // and each hit must lie further along its curve than the previous cut.
    // The nearest crossing of the infinite line may be on the far haunch, or
    // back behind the joint just placed, and taking it crossed the cuts.
    const pick = (hits, side, prev) => hits
      .filter((q) => side * q.t >= -tol && q.u > prev + 1e-9 && q.u < 1 - 1e-9)
      .sort((p, q) => Math.abs(p.t) - Math.abs(q.t))[0] ?? null;
    const a = pick(lineHits(inner, si, f.origin, f.direction), -1, prevInner);
    // On the extrados the station itself is the outer end of the cut; a
    // search there would only find the zigzag of a hand-traced curve.
    const b = mode === 'normal-outer'
      ? { point: f.point.slice(), u: k / n }
      : pick(lineHits(out, so, f.origin, f.direction), 1, prevOuter);
    if (!a || !b) {
      const which = !a && !b ? 'either traced curve' : !a ? 'the intrados' : 'the extrados';
      const name = mode === 'normal-outer' ? 'extrados normal'
        : mode === 'supernormal' ? 'vertical cut' : 'mean-line normal';
      return fail(k, `cut ${k + 1}: the ${name} does not reach ${which} beyond cut ${k}; `
        + `use fewer blocks${advice}`);
    }
    prevInner = a.u;
    prevOuter = b.u;
    joints.push({ a: a.point, b: b.point, ...meta });
  }

  for (let k = 1; k < joints.length; k++) {
    const p = joints[k - 1];
    const q = joints[k];
    if (Math.hypot(p.a[0] - q.a[0], p.a[1] - q.a[1]) < scale * 1e-8
      || Math.hypot(p.b[0] - q.b[0], p.b[1] - q.b[1]) < scale * 1e-8) {
      return fail(k, 'this stereotomy produces coincident cuts; trace one monotonic branch at a time');
    }
    if (segmentsCross(p.a, p.b, q.a, q.b, scale * scale * 1e-12)) {
      return fail(k, `cuts ${k} and ${k + 1} cross inside the ring; use fewer blocks${advice}`);
    }
  }
  // A cut that passes out of the ring and back crosses a traced curve
  // somewhere between its two ends. Crossings within a few per cent of either
  // end are the wobble of a hand-traced curve around the end point itself.
  for (let k = 1; k < n; k++) {
    const { a, b } = joints[k];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!(len > 0)) continue;
    const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const between = (q) => q.t > len * 0.05 && q.t < len * 0.95;
    if (lineHits(inner, si, a, dir).some(between) || lineHits(out, so, a, dir).some(between)) {
      return fail(k, `cut ${k + 1} leaves the ring before reaching both curves; use fewer blocks${advice}`);
    }
  }
  return { joints, frames, reference, error: null, failed: null };
}

/** The joints of `normalCutsPreview`, or an error naming the cut that fails. */
export function normalCuts(inner, outer, n, mode = 'normal-midline') {
  const made = normalCutsPreview(inner, outer, n, mode);
  if (made.error) throw new Error(made.error);
  return made.joints;
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
  q = q.filter((p, i) => {
    const a = q[(i - 1 + q.length) % q.length];
    return !a || Math.hypot(p[0] - a[0], p[1] - a[1]) > 1e-10;
  });
  return splitBridges(q, [[0, x0], [0, x1], [1, y0], [1, y1]]);
}

/**
 * The disjoint pieces of a Sutherland-Hodgman result.
 *
 * Clipping a CONCAVE outline keeps it as one polygon: where the cell holds two
 * separate pieces of the ring (the two sides of the crown above a course
 * joint, or both legs of a wide course) they come back joined by a
 * zero-width bridge along a clip line, traversed once forwards and once
 * backwards. Exported as one part, that bridge is a pair of exterior faces
 * over the void, and the two pieces are glued into one rigid body. On each
 * clip line the edges are reduced to their net coverage, so the bridges
 * cancel, and the remaining edges are chained back into closed loops.
 */
function splitBridges(poly, lines) {
  if (poly.length < 3) return [];
  const span = Math.max(
    Math.max(...poly.map((p) => p[0])) - Math.min(...poly.map((p) => p[0])),
    Math.max(...poly.map((p) => p[1])) - Math.min(...poly.map((p) => p[1])),
    1e-12,
  );
  const tol = span * 1e-9;
  const edges = [];
  const buckets = lines.map(() => []);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) <= tol) continue;
    const k = lines.findIndex(([axis, v]) =>
      Math.abs(p[axis] - v) <= tol && Math.abs(q[axis] - v) <= tol);
    if (k < 0) edges.push([p, q]);
    else buckets[k].push([p[1 - lines[k][0]], q[1 - lines[k][0]]]);
  }
  buckets.forEach((rows, k) => {
    if (!rows.length) return;
    const [axis, v] = lines[k];
    const at = (c) => (axis === 0 ? [v, c] : [c, v]);
    const stops = [...new Set(rows.flat())].sort((a, b) => a - b);
    let run = null;
    const flush = () => {
      if (run) edges.push(run.sign > 0 ? [at(run.lo), at(run.hi)] : [at(run.hi), at(run.lo)]);
      run = null;
    };
    for (let i = 0; i + 1 < stops.length; i++) {
      const lo = stops[i];
      const hi = stops[i + 1];
      if (hi - lo <= tol) continue;
      const mid = (lo + hi) / 2;
      const net = rows.reduce((s, [a, b]) =>
        s + (Math.min(a, b) < mid && mid < Math.max(a, b) ? Math.sign(b - a) : 0), 0);
      const sign = Math.sign(net);
      if (run && sign === run.sign) { run.hi = hi; continue; }
      flush();
      if (sign) run = { lo, hi, sign };
    }
    flush();
  });

  const loops = [];
  const used = new Array(edges.length).fill(false);
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= span * 1e-7;
  for (let s = 0; s < edges.length; s++) {
    if (used[s]) continue;
    used[s] = true;
    const loop = [edges[s][0]];
    let end = edges[s][1];
    for (;;) {
      if (near(end, loop[0])) break;
      const next = edges.findIndex((e, i) => !used[i] && near(e[0], end));
      if (next < 0) break;
      used[next] = true;
      loop.push(edges[next][0]);
      end = edges[next][1];
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
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
  // Below this fraction of a full block (module x course height) a piece is a
  // sliver and is merged into its neighbour. Zero keeps every piece.
  const sliverFraction = Math.max(0, opt.minBlockFraction ?? 0.2);
  let merged = 0;
  let dropped = 0;
  let droppedArea = 0;

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
    const pieces = [];
    for (let k = 0; k + 1 < cuts.length; k++) {
      for (const pts of clipRectangle(outline, cuts[k], cuts[k + 1], y0, y1)) {
        const a = Math.abs(ringArea(pts));
        if (a <= areaFloor) continue;
        pieces.push({ pts, x0: cuts[k], x1: cuts[k + 1], area: a });
      }
    }
    const minArea = sliverFraction * module * (y1 - y0);
    const fix = mergeSlivers(outline, pieces, y0, y1, minArea, (xmax - xmin) * 1e-9);
    merged += fix.merged;
    dropped += fix.dropped;
    droppedArea += fix.droppedArea;
    for (const { pts } of pieces) {
      const block = { x: pts.map((p) => p[0]), y: pts.map((p) => p[1]) };
      if (signedArea(block) < 0) { block.x.reverse(); block.y.reverse(); }
      rowBlocks.push(block);
      const width = Math.max(...block.x) - Math.min(...block.x);
      // Half blocks at the ends create the bond but must not progressively
      // shrink its module as the construction rises, nor may a block that
      // absorbed a sliver widen it.
      if (width >= module * 0.45 && width <= module * 1.05) establishedWidths.push(width);
    }
    blocks.push(...rowBlocks);
    courses.push({ y0, y1, blocks: rowBlocks.length, module, merged: fix.merged, dropped: fix.dropped });
  }
  if (!blocks.length) throw new Error('the horizontal courses miss the traced ring');
  const endJoints = [
    { a: inner[0], b: out[0] },
    { a: inner[inner.length - 1], b: out[out.length - 1] },
  ];
  return { blocks, joints: null, endJoints, courses, courseHeight: h,
    meanWidth: establishedWidths.reduce((s, v) => s + v, 0) / (establishedWidths.length || 1),
    slivers: { merged, dropped, droppedArea, fraction: sliverFraction } };
}

function ringArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    s += p[0] * q[1] - q[0] * p[1];
  }
  return s / 2;
}

function insidePolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if ((a[1] > p[1]) !== (b[1] > p[1])
      && p[0] < a[0] + ((p[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) inside = !inside;
  }
  return inside;
}

/** A point strictly inside a simple polygon: the middle of its widest mid-height span. */
function interiorPoint(pts) {
  const ys = pts.map((p) => p[1]);
  const y = (Math.min(...ys) + Math.max(...ys)) / 2;
  const spans = horizontalSpans(pts, y);
  const widest = spans.reduce((best, s) => (!best || s[1] - s[0] > best[1] - best[0] ? s : best), null);
  return widest ? [(widest[0] + widest[1]) / 2, y] : pts[0];
}

/** The overlapping stretches two pieces have along the vertical line x. */
function sharedOnCut(p, q, x, tol) {
  const spans = (pts) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (Math.abs(a[0] - x) <= tol && Math.abs(b[0] - x) <= tol) {
        out.push([Math.min(a[1], b[1]), Math.max(a[1], b[1])]);
      }
    }
    return out;
  };
  let length = 0;
  let longest = null;
  for (const [a0, a1] of spans(p)) {
    for (const [b0, b1] of spans(q)) {
      const lo = Math.max(a0, b0);
      const hi = Math.min(a1, b1);
      if (hi - lo <= tol) continue;
      length += hi - lo;
      if (!longest || hi - lo > longest[1] - longest[0]) longest = [lo, hi];
    }
  }
  return { length, probe: longest ? [x, (longest[0] + longest[1]) / 2] : null };
}

/**
 * Fold the slivers of one course into the neighbour they share the longest
 * vertical joint with.
 *
 * Where a cut falls just beside the intrados or extrados, or just short of a
 * springing, the cell holds a crumb of masonry: a triangle a few hundredths of
 * the block size, which Abaqus rejects as an element of zero or negative
 * volume once it is extruded through the depth of the barrel, and which is no
 * block anybody would cut. The joint between the sliver and its neighbour is
 * removed by clipping the outline once more with the two cells together; the
 * merged block is the piece of that clip containing the old joint. A sliver
 * with no neighbour in its course is dropped, and the area lost is reported.
 * Pieces are modified in place.
 */
function mergeSlivers(outline, pieces, y0, y1, minArea, tol) {
  let merged = 0;
  let dropped = 0;
  let droppedArea = 0;
  const stuck = new Set();
  for (;;) {
    let i = -1;
    pieces.forEach((p, k) => {
      if (p.area < minArea && !stuck.has(p) && (i < 0 || p.area < pieces[i].area)) i = k;
    });
    if (i < 0) break;
    const s = pieces[i];
    let best = null;
    pieces.forEach((q, j) => {
      if (j === i) return;
      const x = Math.abs(q.x1 - s.x0) <= tol ? s.x0 : Math.abs(q.x0 - s.x1) <= tol ? s.x1 : null;
      if (x === null) return;
      const shared = sharedOnCut(s.pts, q.pts, x, tol);
      if (shared.probe && (!best || shared.length > best.length)) best = { j, ...shared };
    });
    if (!best) {
      pieces.splice(i, 1);
      dropped += 1;
      droppedArea += s.area;
      continue;
    }
    const q = pieces[best.j];
    const x0 = Math.min(s.x0, q.x0);
    const x1 = Math.max(s.x1, q.x1);
    const union = clipRectangle(outline, x0, x1, y0, y1)
      .find((pts) => insidePolygon(best.probe, pts));
    // Everything that union now contains goes: the sliver, its neighbour, and
    // any other piece of the same cells the removed joint connects to them.
    const absorbed = union ? pieces.filter((p) => p.x0 >= x0 - tol && p.x1 <= x1 + tol
      && insidePolygon(interiorPoint(p.pts), union)) : [];
    const area = union ? Math.abs(ringArea(union)) : 0;
    const accounted = absorbed.reduce((sum, p) => sum + p.area, 0);
    if (!union || !absorbed.includes(s) || Math.abs(area - accounted) > Math.max(area, 1e-300) * 1e-6) {
      stuck.add(s);
      continue;
    }
    const at = pieces.indexOf(q);
    pieces[at] = { pts: union, x0, x1, area };
    for (const p of absorbed) {
      const k = pieces.indexOf(p);
      if (k >= 0 && k !== at) pieces.splice(k, 1);
    }
    merged += 1;
  }
  // A sliver whose merge could not be verified is still no block to export.
  for (const s of stuck) {
    const k = pieces.indexOf(s);
    if (k < 0 || s.area >= minArea) continue;
    pieces.splice(k, 1);
    dropped += 1;
    droppedArea += s.area;
  }
  return { merged, dropped, droppedArea };
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
 * @param {number} n          blocks along each layer
 * @param {object} opt        thicknessBlocks: equal divisions across each cut (default 1);
 *                           staggerPercent: alternating-layer offset (0–100, default 0);
 *                           subnormal courses use blockWidth instead
 * @returns {{blocks: Array<{x:number[],y:number[]}>, joints: Array,
 *            flipped: boolean}}
 */
export function blocksBetween(inner, outer, n, opt = {}) {
  if (!Number.isInteger(n) || n < 1) throw new Error('need a positive integer block count');
  const layers = opt.thicknessBlocks ?? 1;
  if (!Number.isInteger(layers) || layers < 1 || layers > 200) {
    throw new Error('blocks through thickness must be an integer between 1 and 200');
  }
  const staggerPercent = opt.staggerPercent ?? 0;
  if (!Number.isFinite(staggerPercent) || staggerPercent < 0 || staggerPercent > 100) {
    throw new Error('layer stagger must be a percentage between 0 and 100');
  }
  let out = outer;
  let flipped = false;
  if (!sameDirection(inner, outer)) {
    out = reverse(outer);
    flipped = true;
  }

  const mode = opt.cutMode ?? 'stations';
  if (mode === 'subnormal') {
    return { ...subnormalCourses(inner, out, n, {
      blockWidth: opt.blockWidth, minBlockFraction: opt.minBlockFraction,
    }), flipped };
  }
  const computed = mode === 'stations' ? null : normalCuts(inner, out, n, mode);
  const a = computed ? computed.map((j) => j.a) : resample(inner, n + 1);
  const b = computed ? computed.map((j) => j.b) : resample(out, n + 1);

  const blocks = [];
  const joints = [];
  // Subdivide the same cuts so neighbouring layers share exact vertices.
  const levels = Array.from({ length: layers + 1 }, (_, layer) =>
    a.map((p, j) => layer === 0 ? p : layer === layers ? b[j] : [
      p[0] + (b[j][0] - p[0]) * layer / layers,
      p[1] + (b[j][1] - p[1]) * layer / layers,
    ]));
  // Keep every intervening vertex on a layer boundary. Connecting only the
  // shifted endpoints would cut across a curved boundary, leaving gaps or overlaps.
  const along = (points, t) => {
    if (Number.isInteger(t)) return points[t];
    const j = Math.floor(t);
    const f = t - j;
    return points[j].map((v, axis) => v + f * (points[j + 1][axis] - v));
  };
  const boundary = (points, start, end) => {
    const path = [along(points, start)];
    for (let j = Math.floor(start) + 1; j < end; j++) path.push(points[j]);
    path.push(along(points, end));
    return path;
  };
  for (let layer = 0; layer < layers; layer++) {
    const lo = levels[layer];
    const hi = levels[layer + 1];
    const offset = layer % 2 ? (staggerPercent / 100) % 1 : 0;
    const stops = offset > 0
      ? [0, ...Array.from({ length: n }, (_, j) => j + offset), n]
      : Array.from({ length: n + 1 }, (_, j) => j);
    for (let j = 0; j + 1 < stops.length; j++) {
      const start = stops[j];
      const end = stops[j + 1];
      const lower = boundary(lo, start, end);
      const upper = boundary(hi, start, end);
      const pts = [lower[0], ...upper, ...lower.slice(1).reverse()];
      blocks.push({ x: pts.map((p) => p[0]), y: pts.map((p) => p[1]) });
    }
  }
  for (let j = 0; j <= n; j++) joints.push(computed?.[j] ?? { a: a[j], b: b[j] });

  // Multiple layers are an assembly, not a single chain of voussoirs.
  if (layers > 1) return { blocks, joints: null,
    endJoints: [joints[0], joints[n]], flipped };
  return { blocks, joints, flipped };
}

/**
 * Complain about a traced pair before it silently produces nonsense.
 *
 * Returns a list of human-readable problems; empty means the trace is usable.
 */
export function checkTrace(inner, outer, n, opt = {}) {
  const problems = [];
  if (!inner || inner.length < 2) problems.push('the intrados needs at least two points');
  if (!outer || outer.length < 2) problems.push('the extrados needs at least two points');
  if (problems.length) return problems;

  if (length(inner) === 0 || length(outer) === 0) {
    problems.push('one of the curves has zero length');
    return problems;
  }
  // The matched stations say whether the two curves make a ring at all. The
  // blocks that are then judged are THE ONES THE CHOSEN STEREOTOMY BUILDS:
  // judging the legacy stations instead enabled the button for normal cuts
  // that crossed, and disabled it for sound ones whose stations were poor.
  const mode = opt.cutMode ?? 'stations';
  let { blocks } = blocksBetween(inner, outer, n);
  if (blocks.every((b) => signedArea(b) === 0)) {
    problems.push('the two curves coincide: there is no masonry between them');
    return problems;
  }
  if (mode !== 'stations' || (opt.thicknessBlocks ?? 1) !== 1 || opt.staggerPercent != null) {
    try {
      const built = blocksBetween(inner, outer, n, opt);
      // Coursed blocks are normalised polygons, not ordered quadrilaterals:
      // only the stations can still tell whether the curves cross.
      if (mode !== 'subnormal') blocks = built.blocks;
    } catch (e) {
      problems.push(e.message);
      return problems;
    }
  }
  const signed = blocks.map(signedArea);
  const total = signed.reduce((s, v) => s + Math.abs(v), 0);

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

  // Short end blocks are intentional in a staggered layer, even at small offsets.
  const staggered = (opt.thicknessBlocks ?? 1) > 1
    && opt.staggerPercent > 0 && opt.staggerPercent < 100;
  const tiny = mode === 'subnormal' ? 0 : signed
    .map(Math.abs)
    .filter((v) => v < (staggered ? total * 1e-12 : total / (blocks.length * 50))).length;
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
