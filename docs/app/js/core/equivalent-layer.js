/** Transient planar reduction under the explicit assumption of solidary motion.
 * Source geometry/materials remain untouched. Z is a display reference only.
 */
import { layersOf, blockZ, forcesInLayer } from './layers.js';
import { piecesOf, distance, pointInPolygon } from './geometry.js';
import { contactJoint, endJoint, orientJoints } from './joints.js';
import { springings } from './trace.js';

export const EQUIVALENT_LAYER = 'equivalent';
const points = (b) => piecesOf(b).flatMap((p) => p.x.map((x, i) => [x, p.y[i]]));
const vertical = (w) => Array.isArray(w) ? w[1] : w;

// All segments must lie on one straight line and form a connected union with
// positive overlap. Point contact never suffices. Extremes bound every source
// contact, so the ordinary opening test also prevents source interpenetration.
function unite(segments, tol) {
  const ref = segments[0], len = distance(ref.a, ref.b);
  if (!(len > tol)) return null;
  const u = ref.b.map((v, i) => (v - ref.a[i]) / len);
  const along = (p) => (p[0] - ref.a[0]) * u[0] + (p[1] - ref.a[1]) * u[1];
  const off = (p) => Math.abs((p[0] - ref.a[0]) * u[1] - (p[1] - ref.a[1]) * u[0]);
  if (segments.some((s) => off(s.a) > tol || off(s.b) > tol || distance(s.a, s.b) <= tol)) return null;
  const intervals = segments.map((s) => [along(s.a), along(s.b)].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);
  let hi = intervals[0][1];
  for (const [a, b] of intervals.slice(1)) {
    if (Math.min(hi, b) - a <= tol) return null;
    hi = Math.max(hi, b);
  }
  const at = (t) => ref.a.map((v, i) => v + t * u[i]);
  return { a: at(intervals[0][0]), b: at(hi) };
}

function recover(blocks, tol) {
  const inner = [];
  for (let i = 1; i < blocks.length; i++) {
    const contacts = piecesOf(blocks[i - 1]).flatMap((a) => piecesOf(blocks[i]).map((b) =>
      contactJoint(points(a), points(b), tol))).filter(Boolean);
    if (!contacts.length) return null;
    // Separate pieces may leave voids within a contact. Collinearity still
    // matters; the end points are the support envelope used by core joints.
    const endpoints = contacts.flatMap((j) => [j.a, j.b]);
    let pair = contacts[0];
    for (const a of endpoints) for (const b of endpoints) {
      if (distance(a, b) > distance(pair.a, pair.b)) pair = { a, b };
    }
    if (!contacts.every((s) => unite([pair, s], tol))) return null;
    // A contact separates consecutive stones. Overlapping or duplicate XY
    // stones within one layer must not manufacture a diagonal 'joint'.
    const length = distance(pair.a, pair.b);
    const side = (block) => {
      const offsets = points(block).map((p) => ((pair.b[0] - pair.a[0]) * (p[1] - pair.a[1])
        - (pair.b[1] - pair.a[1]) * (p[0] - pair.a[0])) / length);
      const lo = Math.min(...offsets), hi = Math.max(...offsets);
      return lo >= -tol && hi > tol ? 1 : hi <= tol && lo < -tol ? -1 : 0;
    };
    if (!side(blocks[i - 1]) || side(blocks[i - 1]) !== -side(blocks[i])) return null;
    inner.push(pair);
  }
  const first = endJoint(points(blocks[0]), inner[0]);
  const last = endJoint(points(blocks.at(-1)), inner.at(-1));
  return first && last ? orientJoints([first, ...inner, last]) : null;
}

export function equivalentLayer(source, forces = {}, { poleni = false } = {}) {
  const fail = (reason) => ({ ok: false, reason, model: null, forces: null });
  if (poleni || source?.layerMode === 'poleni') return fail('The solidary equivalent layer is available for planar Z layers; Poleni is excluded.');
  const ls = layersOf(source);
  if (ls.length < 2) return fail('At least two populated Z layers are required.');
  const uneven = ls.find((l) => l.indices.length < 2 || l.indices.length !== ls[0].indices.length);
  if (uneven) return fail(`Z = ${uneven.z}: layers must have the same number of blocks (at least two), with corresponding joints.`);
  const all = source.blocks.flatMap(points);
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const scale = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const tol = Math.max(scale * 1e-8, Number.EPSILON * Math.max(...all.flat().map(Math.abs)) * 32);
  const chains = [];
  for (const l of ls) {
    const sorted = [...l.indices].sort((a, b) => source.centroids[b][0] - source.centroids[a][0]);
    let found;
    for (const ids of [l.indices, [...l.indices].reverse(), sorted, [...sorted].reverse()]) {
      const joints = recover(ids.map((i) => source.blocks[i]), tol);
      if (!joints) continue;
      for (const reverse of [false, true]) {
        const js = reverse ? [...joints].reverse() : joints;
        if (!chains.length || js.every((j, k) => unite([chains[0].joints[k], j], tol))) {
          found = { ids: reverse ? [...ids].reverse() : ids, joints: js }; break;
        }
      }
      if (found) break;
    }
    if (!found) return fail(`Z = ${l.z}: no compatible ordered chain. Corresponding joints must be collinear and overlap over a positive length, including the supports.`);
    chains.push(found);
  }
  const joints = chains[0].joints.map((_, j) => unite(chains.map((c) => c.joints[j]), tol));
  if (joints.some((j) => !j)) return fail('Corresponding joint segments do not form an overlapping contact.');
  const sources = chains[0].ids.map((_, k) => chains.map((c) => c.ids[k]));
  if (sources.flat().some((i) => !Number.isFinite(vertical(source.weights[i])) || vertical(source.weights[i]) < 0
      || !source.centroids[i]?.every(Number.isFinite) || !(source.thickness?.[i] > 0))) {
    return fail('Equivalent blocks require finite non-negative weights, finite centroids and positive thicknesses.');
  }
  const weights = sources.map((ids) => ids.reduce((s, i) => s + vertical(source.weights[i]), 0));
  if (weights.some((w) => !(w > 0))) return fail('Every equivalent block must have positive total weight.');
  const centroids = sources.map((ids, k) => [0, 1].map((axis) => ids.reduce((s, i) => s + vertical(source.weights[i]) * source.centroids[i][axis], 0) / weights[k]));
  const zMin = Math.min(...source.blocks.map((_, i) => blockZ(source, i)));
  const zMax = Math.max(...source.blocks.map((_, i) => blockZ(source, i) + source.thickness[i]));
  const centralZ = (zMin + zMax) / 2;
  const model = { ...source, blocks: sources.map((ids) => ({ pieces: ids.flatMap((i) => piecesOf(source.blocks[i])).map((p) => ({ x: [...p.x], y: [...p.y] })) })),
    sources, joints, weights, centroids,
    // Accounting quantities, not a fictitious homogeneous material section.
    areas: sources.map((ids) => ids.reduce((s, i) => s + (source.areas?.[i] ?? 0), 0)),
    thickness: sources.map((ids) => ids.reduce((s, i) => s + source.thickness[i], 0)),
    groups: [{ id: 1, name: 'Solidary equivalent', z: centralZ }], blockGroups: sources.map(() => 1),
    equivalent: { centralZ, layerKeys: ls.map((l) => l.key) },
    forcePolygon: null, thrustLine: null, jointRecovery: { ok: true }, ...springings(joints) };
  const selectedForces = forcesInLayer(forces);
  selectedForces.blocks = [];
  for (let i = 0; i < selectedForces.points.length; i++) {
    const p = selectedForces.points[i], layer = ls.find((l) => l.key === String(Number(selectedForces.z[i]) || 0));
    if (!layer) return fail(`Force ${i + 1}: its Z layer has no blocks.`);
    let at = layer.indices.find((k) => piecesOf(source.blocks[k]).some((q) => pointInPolygon(p, q)));
    if (at == null) at = layer.indices.reduce((best, k) => distance(source.centroids[k], p) < distance(source.centroids[best], p) ? k : best);
    selectedForces.blocks.push(sources.findIndex((ids) => ids.includes(at)));
  }
  return { ok: true, model, forces: selectedForces, reason: `${ls.length} Z layers → ${sources.length} equivalent blocks; solidary planar motion. Central Z = ${centralZ}. Source layers retained in 3D.` };
}
