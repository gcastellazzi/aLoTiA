/** Planar dead-load regions: structural extrados projections define vertical
 * strips; their weights become unamplified applied loads, never rigid bodies. */
import { piecesOf, blockArea, blockCentroid, signedArea, pointInPolygon, bounds } from './geometry.js';
import { blockRole, structuralRegions } from './region-roles.js';
import { blockLayerKey, blockZ } from './layers.js';
import { vertices, triangulate, clipSlab, geometricTolerance, polygonsOverlap, mergeClippedPieces, onSegment, cross } from './region-geometry.js';

export function verticalHit(block, x, ceiling, tol = 1e-9) {
  let y = -Infinity;
  for (const poly of piecesOf(block)) {
    const v = vertices(poly);
    for (let i = 0; i < v.length; i++) {
      const a = v[i], b = v[(i + 1) % v.length];
      if (x < Math.min(a[0], b[0]) - tol || x > Math.max(a[0], b[0]) + tol) continue;
      if (Math.abs(a[0] - b[0]) <= tol) {
        const top = Math.max(a[1], b[1]);
        if (top <= ceiling + tol) y = Math.max(y, top);
      } else {
        const at = a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
        if (at <= ceiling + tol) y = Math.max(y, at);
      }
    }
  }
  return y;
}

/** The load resultant can fall inside masonry because the traced outlines
 * overlap. Use that piece's upper face, rather than mistakenly hitting its
 * intrados; the full dead load and its vertical moment are unchanged. */
export function loadSurface(block, point, tol = 1e-9) {
  let top = -Infinity;
  for (const p of piecesOf(block)) {
    const y = verticalHit(p, point[0], Infinity, tol);
    if (!Number.isFinite(y)) continue;
    const v = vertices(p);
    const contains = pointInPolygon(point, p) || v.some((a, i) => onSegment(point, a, v[(i + 1) % v.length], tol));
    if (y <= point[1] + tol || contains) top = Math.max(top, y);
  }
  return top;
}

export function subdivideLoadRegion(outlines, model, layerKey = '0') {
  if (model?.layerMode === 'poleni') throw new Error('Automatic load-region subdivision currently requires planar Z layers.');
  const ids = (model?.blocks ?? []).map((_, i) => i).filter((i) => blockRole(model, i) === 'structure' && blockLayerKey(model, i) === layerKey);
  if (!ids.length) throw new Error('Create structural blocks in this Z layer before subdividing a load region.');
  if (!outlines.length) throw new Error('Trace and close a load-region outline first.');
  const polygons = outlines.map((p) => Array.isArray(p) ? { x: p.map((q) => q[0]), y: p.map((q) => q[1]) } : p);
  const tol = geometricTolerance([...polygons, ...ids.flatMap((i) => piecesOf(model.blocks[i]))]);
  for (let i = 0; i < polygons.length; i++) for (let j = 0; j < i; j++) {
    if (polygonsOverlap(polygons[i], polygons[j], tol)) throw new Error('Load outlines must be disjoint and non-overlapping; nested outlines/holes are not supported.');
  }
  const projected = [];
  for (const i of ids) for (const p of piecesOf(model.blocks[i])) {
    const v = vertices(p), orientation = Math.sign(signedArea(p));
    for (let k = 0; k < v.length; k++) {
      const a = v[k], b = v[(k + 1) % v.length];
      if (-(b[0] - a[0]) * orientation <= tol) continue; // outward normal points up
      const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2;
      const top = Math.max(...ids.map((j) => verticalHit(model.blocks[j], x, Infinity, tol)));
      if (Math.abs(top - y) <= tol * 4) projected.push(a[0], b[0]);
    }
  }
  const xs = polygons.flatMap((p) => p.x), min = Math.min(...xs), max = Math.max(...xs);
  const cuts = [min, ...projected.filter((x) => x > min + tol && x < max - tol), max]
    .sort((a, b) => a - b).filter((x, i, a) => !i || x - a[i - 1] > tol);
  const triangles = polygons.flatMap(triangulate), blocks = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const pieces = triangles.map((t) => clipSlab(t, cuts[k], cuts[k + 1])).filter((p) => p.x.length >= 3 && blockArea(p) > tol * tol);
    const merged = mergeClippedPieces(pieces, tol);
    if (merged.length) blocks.push(merged.length === 1 ? merged[0] : { pieces: merged });
  }
  if (!blocks.length) throw new Error('The load region has no positive area.');
  return { blocks, cuts, centroids: blocks.map(blockCentroid), areas: blocks.map(blockArea) };
}

/** A shared face (positive length) or overlapping material joins load strips.
 * Merely touching at one vertex does not make a load-bearing connection. */
function adjacentLoads(A, B, tol) {
  if (A.bounds.xmax < B.bounds.xmin - tol || B.bounds.xmax < A.bounds.xmin - tol
      || A.bounds.ymax < B.bounds.ymin - tol || B.bounds.ymax < A.bounds.ymin - tol) return false;
  for (const p of piecesOf(A.geometry)) for (const q of piecesOf(B.geometry)) {
    const P = vertices(p), Q = vertices(q);
    for (let i = 0; i < P.length; i++) for (let j = 0; j < Q.length; j++) {
      const a = P[i], b = P[(i + 1) % P.length], c = Q[j], d = Q[(j + 1) % Q.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      if (len <= tol || Math.abs(cross(a, b, c)) > tol * len || Math.abs(cross(a, b, d)) > tol * len) continue;
      const at = (v) => ((v[0] - a[0]) * dx + (v[1] - a[1]) * dy) / len;
      const lo = Math.min(at(c), at(d)), hi = Math.max(at(c), at(d));
      if (Math.min(len, hi) - Math.max(0, lo) > tol) return true;
    }
    if (polygonsOverlap(p, q, tol)) return true;
  }
  return false;
}

export function regionLoads(model, forces = {}, { poleni = false } = {}) {
  const sourceForces = forces.points ?? [];
  const result = { ...forces, points: sourceForces.map((p) => [...p]),
    magnitudes: sourceForces.map((_, i) => forces.magnitudes?.[i] ?? 0), x: sourceForces.map((_, i) => forces.x?.[i] ?? 0),
    z: sourceForces.map((_, i) => forces.z?.[i] ?? 0), layer: sourceForces.map((_, i) => forces.layer?.[i] ?? null),
    ownerSources: sourceForces.map(() => null), regionSources: sourceForces.map(() => null) };
  const issues = [], transfers = [], resultants = [];
  if (!model?.blocks?.length) return { model, forces: result, issues, transfers, resultants };
  const structural = model.blocks.map((_, i) => i).filter((i) => blockRole(model, i) === 'structure');
  const extras = model.blocks.map((_, i) => i).filter((i) => blockRole(model, i) !== 'structure');
  if (extras.length && (poleni || model.layerMode === 'poleni')) {
    issues.push({ layer: 'all', reason: 'Load and fixed regions currently require planar Z layers; Poleni is excluded.' });
    return { model: structuralRegions(model), forces: result, issues, transfers, resultants };
  }
  const tol = geometricTolerance(model.blocks.flatMap(piecesOf));
  const loads = [];
  for (const i of extras.filter((k) => blockRole(model, k) === 'load')) {
    const key = blockLayerKey(model, i), point = model.centroids[i], weight = model.weights[i];
    if (!Number.isFinite(weight) || weight < 0) { issues.push({ layer: key, reason: `Load block #${i + 1}: invalid weight.` }); continue; }
    let owner = -1, top = -Infinity;
    for (const j of structural.filter((k) => blockLayerKey(model, k) === key)) {
      const y = loadSurface(model.blocks[j], point, tol);
      if (y > top) { top = y; owner = j; }
    }
    loads.push({ source: i, layer: key, centroid: point, weight, owner, top,
      geometry: model.blocks[i], bounds: bounds(piecesOf(model.blocks[i])) });
  }
  // Multi-source shortest paths attach each unsupported strip to its closest
  // supported neighbour through an actual chain of adjacent load material.
  // Supported strips keep their own structural receivers, even at equal cost.
  const links = loads.map(() => []);
  if (loads.some((l) => l.owner < 0)) {
    for (let i = 0; i < loads.length; i++) for (let j = 0; j < i; j++) {
      if (loads[i].layer !== loads[j].layer || (loads[i].owner >= 0 && loads[j].owner >= 0)) continue;
      if (!adjacentLoads(loads[i], loads[j], tol)) continue;
      const cost = Math.max(tol, Math.hypot(loads[i].centroid[0] - loads[j].centroid[0], loads[i].centroid[1] - loads[j].centroid[1]));
      links[i].push([j, cost]); links[j].push([i, cost]);
    }
  }
  const distance = loads.map((l) => l.owner >= 0 ? 0 : Infinity);
  const anchor = loads.map((l, i) => l.owner >= 0 ? i : -1), visited = new Set();
  for (let step = 0; step < loads.length; step++) {
    let next = -1;
    for (let i = 0; i < loads.length; i++) if (!visited.has(i) && Number.isFinite(distance[i])
        && (next < 0 || distance[i] < distance[next])) next = i;
    if (next < 0) break;
    visited.add(next);
    for (const [j, cost] of links[next]) {
      const candidate = distance[next] + cost;
      if (loads[j].owner < 0 && candidate < distance[j]) { distance[j] = candidate; anchor[j] = anchor[next]; }
    }
  }
  const groups = new Map();
  loads.forEach((l, i) => {
    if (anchor[i] < 0) {
      issues.push({ layer: l.layer, reason: `Load block #${l.source + 1}: no structural block below its vertical line of action and no adjacent supported load block in this Z layer.` }); return;
    }
    if (!groups.has(anchor[i])) groups.set(anchor[i], []);
    groups.get(anchor[i]).push(l);
  });
  for (const [seed, members] of groups) {
    const root = loads[seed], weight = members.reduce((s, l) => s + l.weight, 0);
    const factor = (l) => weight > 0 ? l.weight : blockArea(l.geometry);
    const total = members.reduce((s, l) => s + factor(l), 0);
    const centroid = [0, 1].map((axis) => total > 0 ? members.reduce((s, l) => s + factor(l) * l.centroid[axis], 0) / total : root.centroid[axis]);
    const surface = loadSurface(model.blocks[root.owner], centroid, tol);
    // An overhang can have an eccentric resultant outside its receiver. Keep
    // its X instead of moving the force onto the support and losing its moment.
    const application = [centroid[0], Number.isFinite(surface) ? surface : root.top];
    result.points.push(application); result.magnitudes.push(weight); result.x.push(0);
    result.z.push(blockZ(model, root.source)); result.layer.push(null); result.ownerSources.push(root.owner); result.regionSources.push(root.source);
    resultants.push({ sources: members.map((l) => l.source), anchor: root.source, owner: root.owner, weight, centroid, point: application, layer: root.layer });
    for (const l of members) transfers.push({ source: l.source, owner: root.owner, point: [l.centroid[0], application[1]],
      weight: l.weight, layer: l.layer, mergedInto: root.source });
  }
  transfers.sort((a, b) => a.source - b.source);
  return { model: structuralRegions(model), forces: result, issues, transfers, resultants };
}
