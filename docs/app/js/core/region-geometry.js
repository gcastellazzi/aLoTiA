/** Polygon operations for traced planar regions. No dependency on mechanics. */
import { signedArea, area, pointInPolygon } from './geometry.js';
export const vertices = (p) => p.x.map((x, i) => [x, p.y[i]]);
export const polygon = (v) => ({ x: v.map((p) => p[0]), y: v.map((p) => p[1]) });
export const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
export function geometricTolerance(polys) {
  const v = polys.flatMap(vertices);
  if (!v.length) return 1e-10;
  const xs = v.map((p) => p[0]), ys = v.map((p) => p[1]);
  return Math.max(Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1e-9,
    Math.max(1, ...v.flat().map(Math.abs)) * Number.EPSILON * 32);
}
export function onSegment(p, a, b, tol) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return len > tol && Math.abs(cross(a, b, p)) <= tol * len
    && (p[0] - a[0]) * (p[0] - b[0]) + (p[1] - a[1]) * (p[1] - b[1]) <= tol * len;
}
export function strictlyInside(p, poly, tol) {
  const v = vertices(poly);
  return !v.some((a, i) => onSegment(p, a, v[(i + 1) % v.length], tol)) && pointInPolygon(p, poly);
}

/** Ear clipping preserves concave outlines when a vertical slab disconnects
 * them. Clipped triangles remain disjoint pieces; no artificial bridge area. */
export function triangulate(poly) {
  let v = vertices(poly);
  const tol = geometricTolerance([poly]);
  v = v.filter((p, i) => Math.hypot(p[0] - v[(i + 1) % v.length][0], p[1] - v[(i + 1) % v.length][1]) > tol);
  if (signedArea(polygon(v)) < 0) v.reverse();
  let changed = true;
  while (changed && v.length > 3) {
    changed = false;
    for (let i = 0; i < v.length; i++) {
      const a = v[(i + v.length - 1) % v.length], b = v[i], c = v[(i + 1) % v.length];
      if (Math.abs(cross(a, b, c)) <= tol * Math.hypot(c[0] - a[0], c[1] - a[1])) { v.splice(i, 1); changed = true; break; }
    }
  }
  const triangles = [];
  while (v.length > 3) {
    let ear = -1;
    for (let i = 0; i < v.length; i++) {
      const a = v[(i + v.length - 1) % v.length], b = v[i], c = v[(i + 1) % v.length];
      if (cross(a, b, c) <= 0) continue;
      const inside = (p) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
      if (!v.some((p) => p !== a && p !== b && p !== c && inside(p))) { ear = i; triangles.push(polygon([a, b, c])); break; }
    }
    if (ear < 0) throw new Error('The outline must be a simple closed polygon without crossings.');
    v.splice(ear, 1);
  }
  if (v.length === 3 && area(polygon(v)) > tol * tol) triangles.push(polygon(v));
  return triangles;
}
function clip(v, x, greater) {
  const out = [], inside = (p) => greater ? p[0] >= x : p[0] <= x;
  for (let i = 0; i < v.length; i++) {
    const a = v[i], b = v[(i + 1) % v.length], A = inside(a), B = inside(b);
    if (A) out.push(a);
    if (A !== B) out.push([x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])]);
  }
  return out;
}
export function clipSlab(triangle, lo, hi) {
  return polygon(clip(clip(vertices(triangle), lo, true), hi, false));
}
export function polygonsOverlap(a, b, tol) {
  const A = vertices(a), B = vertices(b);
  if (A.some((p) => strictlyInside(p, b, tol)) || B.some((p) => strictlyInside(p, a, tol))) return true;
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) {
    const p = A[i], q = A[(i + 1) % A.length], r = B[j], s = B[(j + 1) % B.length];
    const e = tol * Math.hypot(q[0] - p[0], q[1] - p[1]), f = tol * Math.hypot(s[0] - r[0], s[1] - r[1]);
    if (cross(p, q, r) * cross(p, q, s) < -e * e && cross(r, s, p) * cross(r, s, q) < -f * f) return true;
    // Aligned overlapping rectangles can share every vertex's y coordinate;
    // edge midpoints detect area overlap even without a proper crossing.
    if (strictlyInside([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], b, tol)) return true;
    if (strictlyInside([(r[0] + s[0]) / 2, (r[1] + s[1]) / 2], a, tol)) return true;
  }
  // Equal boundaries have no strictly interior vertices or edge midpoints.
  const tri = triangulate(a)[0];
  if (tri) {
    const v = vertices(tri), p = [v.reduce((s, q) => s + q[0], 0) / 3, v.reduce((s, q) => s + q[1], 0) / 3];
    if (strictlyInside(p, b, tol)) return true;
  }
  return false;
}

/** Remove triangulation edges after clipping, retaining disconnected components.
 * The pieces have disjoint interiors and CCW boundaries (from ear clipping).
 */
export function mergeClippedPieces(pieces, tol) {
  const nodes = [];
  const id = (p) => {
    const found = nodes.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= tol);
    if (found >= 0) return found;
    nodes.push(p); return nodes.length - 1;
  };
  pieces.forEach((p) => vertices(p).forEach(id));
  const edges = new Map();
  for (const piece of pieces) {
    const v = vertices(piece);
    for (let i = 0; i < v.length; i++) {
      const a = v[i], b = v[(i + 1) % v.length], dx = b[0] - a[0], dy = b[1] - a[1];
      const chain = nodes.map((p, k) => ({ p, k })).filter(({ p }) => onSegment(p, a, b, tol))
        .sort((p, q) => (p.p[0] - q.p[0]) * dx + (p.p[1] - q.p[1]) * dy);
      for (let k = 1; k < chain.length; k++) {
        const u = chain[k - 1].k, w = chain[k].k, reverse = `${w}:${u}`;
        if (edges.has(reverse)) edges.delete(reverse); else edges.set(`${u}:${w}`, [u, w]);
      }
    }
  }
  const outlines = [];
  while (edges.size) {
    const first = edges.values().next().value, start = first[0], path = [nodes[start]];
    let at = start;
    do {
      const entry = [...edges].find(([, e]) => e[0] === at);
      if (!entry) throw new Error('Cannot close the clipped region boundary.');
      edges.delete(entry[0]); at = entry[1][1];
      if (at !== start) path.push(nodes[at]);
    } while (at !== start);
    const p = polygon(path);
    if (path.length >= 3 && area(p) > tol * tol) outlines.push(p);
  }
  return outlines;
}
