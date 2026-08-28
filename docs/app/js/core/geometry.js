/**
 * Plane geometry for aLOTofImaginArches.
 *
 * Ported from the MATLAB app and from external_functions/lines_intersection.m.
 * No dependencies: these are ES modules the browser loads directly, so there
 * is no build step and the source you read is the source that runs.
 *
 * Convention: a point is [x, y], a direction is [dx, dy], a polygon is
 * {x: [...], y: [...]} exactly as it arrives from the converted examples.
 */

/** Tolerance for treating a cross product as zero (parallel lines). */
export const EPS = 1e-12;

/**
 * Signed area of a polygon by the shoelace formula.
 * Positive when the vertices run counter-clockwise.
 */
export function signedArea(poly) {
  const { x, y } = poly;
  const n = x.length;
  let s = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    s += x[j] * y[i] - x[i] * y[j];
  }
  return s / 2;
}

/** Unsigned area, which is what MATLAB's area(polyshape) returns. */
export function area(poly) {
  return Math.abs(signedArea(poly));
}

/**
 * Centroid of a polygon, matching MATLAB's centroid(polyshape).
 *
 * Falls back to the mean of the vertices for a degenerate polygon, which is
 * what the "fake blocks" standing in for applied forces are: four coincident
 * points at the origin.
 */
export function centroid(poly) {
  const { x, y } = poly;
  const n = x.length;
  const a = signedArea(poly);
  if (Math.abs(a) < EPS) {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i++) {
      sx += x[i];
      sy += y[i];
    }
    return [sx / n, sy / n];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const cross = x[j] * y[i] - x[i] * y[j];
    cx += (x[j] + x[i]) * cross;
    cy += (y[j] + y[i]) * cross;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/**
 * Intersection of two lines, each given by a point and a direction.
 *
 * Returns [x, y], or null when the lines are parallel. This is the operation
 * the whole funicular construction is built on: every vertex of the thrust
 * line is the meeting of a ray from the force polygon with the vertical
 * through a block centroid.
 */
export function lineIntersection(p1, u1, p2, u2) {
  const den = u1[0] * u2[1] - u1[1] * u2[0];
  if (Math.abs(den) < EPS) return null;
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const t = (dx * u2[1] - dy * u2[0]) / den;
  return [p1[0] + t * u1[0], p1[1] + t * u1[1]];
}

/** Euclidean distance between two points. */
export function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Is the point inside the polygon? Ray casting, boundary counts as inside. */
export function pointInPolygon(pt, poly) {
  const { x, y } = poly;
  const n = x.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const intersects =
      y[i] > pt[1] !== y[j] > pt[1] &&
      pt[0] < ((x[j] - x[i]) * (pt[1] - y[i])) / (y[j] - y[i]) + x[i];
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Axis-aligned bounding box of a set of polygons: {xmin, xmax, ymin, ymax}. */
export function bounds(polys) {
  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const p of polys) {
    for (const v of p.x) {
      if (v < xmin) xmin = v;
      if (v > xmax) xmax = v;
    }
    for (const v of p.y) {
      if (v < ymin) ymin = v;
      if (v > ymax) ymax = v;
    }
  }
  return { xmin, xmax, ymin, ymax };
}

/**
 * A block may be made of several polygons.
 *
 * A radial cut through a double shell -- St Peter's inner and outer dome --
 * passes through masonry, air, and masonry again, so one voussoir is two
 * disjoint pieces. Blocks therefore may carry a `pieces` array; a block
 * without one is its own single piece, which is what the tracer has always
 * produced. Everything downstream reads blocks through these three, so the
 * distinction stays in one place.
 */
export function piecesOf(block) {
  return block && block.pieces ? block.pieces : [block];
}

/** The area of a block, summed over its pieces. */
export function blockArea(block) {
  return piecesOf(block).reduce((s, p) => s + Math.abs(area(p)), 0);
}

/**
 * The centroid of a block, weighted by the area of each piece.
 *
 * Taking the first piece alone would put the weight at the wrong radius, and
 * for a dome that is precisely the quantity the analysis turns on.
 */
export function blockCentroid(block) {
  const pieces = piecesOf(block);
  let ax = 0;
  let ay = 0;
  let total = 0;
  for (const p of pieces) {
    const a = Math.abs(area(p));
    const g = centroid(p);
    ax += g[0] * a;
    ay += g[1] * a;
    total += a;
  }
  if (!(total > 0)) return centroid(pieces[0]);
  return [ax / total, ay / total];
}
