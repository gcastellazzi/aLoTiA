/** Planar dead-load regions: structural extrados projections define vertical
 * strips; their weights become unamplified applied loads, never rigid bodies. */
import { piecesOf, blockArea, blockCentroid, signedArea, pointInPolygon } from './geometry.js';
import { blockRole, structuralRegions } from './region-roles.js';
import { blockLayerKey, blockZ } from './layers.js';
import { vertices, triangulate, clipSlab, geometricTolerance, polygonsOverlap, mergeClippedPieces, onSegment } from './region-geometry.js';

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

export function regionLoads(model, forces = {}, { poleni = false } = {}) {
  const sourceForces = forces.points ?? [];
  const result = { ...forces, points: sourceForces.map((p) => [...p]),
    magnitudes: sourceForces.map((_, i) => forces.magnitudes?.[i] ?? 0), x: sourceForces.map((_, i) => forces.x?.[i] ?? 0),
    z: sourceForces.map((_, i) => forces.z?.[i] ?? 0), layer: sourceForces.map((_, i) => forces.layer?.[i] ?? null),
    ownerSources: sourceForces.map(() => null), regionSources: sourceForces.map(() => null) };
  const issues = [], transfers = [];
  if (!model?.blocks?.length) return { model, forces: result, issues, transfers };
  const structural = model.blocks.map((_, i) => i).filter((i) => blockRole(model, i) === 'structure');
  const extras = model.blocks.map((_, i) => i).filter((i) => blockRole(model, i) !== 'structure');
  if (extras.length && (poleni || model.layerMode === 'poleni')) {
    issues.push({ layer: 'all', reason: 'Load and fixed regions currently require planar Z layers; Poleni is excluded.' });
    return { model: structuralRegions(model), forces: result, issues, transfers };
  }
  const tol = geometricTolerance(model.blocks.flatMap(piecesOf));
  for (const i of extras.filter((k) => blockRole(model, k) === 'load')) {
    const key = blockLayerKey(model, i), point = model.centroids[i], weight = model.weights[i];
    let owner = -1, top = -Infinity;
    for (const j of structural.filter((k) => blockLayerKey(model, k) === key)) {
      const y = loadSurface(model.blocks[j], point, tol);
      if (y > top) { top = y; owner = j; }
    }
    if (owner < 0) { issues.push({ layer: key, reason: `Load block #${i + 1}: no structural block below its vertical line of action in this Z layer.` }); continue; }
    if (!Number.isFinite(weight) || weight < 0) { issues.push({ layer: key, reason: `Load block #${i + 1}: invalid weight.` }); continue; }
    const application = [point[0], top];
    result.points.push(application); result.magnitudes.push(weight); result.x.push(0);
    result.z.push(blockZ(model, i)); result.layer.push(null); result.ownerSources.push(owner); result.regionSources.push(i);
    transfers.push({ source: i, owner, point: application, weight, layer: key });
  }
  return { model: structuralRegions(model), forces: result, issues, transfers };
}
