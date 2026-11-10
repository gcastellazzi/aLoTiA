/** Z locates the first face; a block occupies [Z, Z + thickness].
 * Z partitions the XY problem, never changes its equations. */
import { angularLayerForBlock, referenceChord } from './poleni-layers.js';
import { piecesOf } from './geometry.js';
import { jointsFromBlocks } from './joints.js';
import { blockCentroid } from './profile.js';
import { springings } from './trace.js';
import { blocksLike, betweenEnds } from './blocks.js';
import { forcePolygon, poleForEnds, funicular, freeThrustLine, jointCrossings } from './statics.js';

export const zKey = (z) => String(Number(z) || 0);
export function blockZ(model, i) {
  return Number(model.groups?.find((g) => g.id === model.blockGroups?.[i])?.z) || 0;
}
export function blockLayerKey(model, i) {
  return model?.layerMode === 'poleni' ? angularLayerForBlock(model, i)?.id ?? 'unassigned' : zKey(blockZ(model, i));
}
export function layersOf(model) {
  if (model?.layerMode === 'poleni') {
    return (model.poleniLayers ?? []).map((l) => ({ ...l, key: l.id,
      indices: (model.blocks ?? []).map((_, i) => i).filter((i) => blockLayerKey(model, i) === l.id) }))
      .filter((l) => l.indices.length).sort((a, b) => a.startAngle - b.startAngle || a.angleDeg - b.angleDeg);
  }
  const values = new Map();
  (model?.blocks ?? []).forEach((_, i) => {
    const z = blockZ(model, i), key = zKey(z);
    if (!values.has(key)) values.set(key, { key, z, indices: [] });
    values.get(key).indices.push(i);
  });
  return [...values.values()].sort((a, b) => a.z - b.z);
}
export function layerThickness(model, key) {
  const indices = layersOf(model).find((l) => l.key === key)?.indices ?? [];
  const t = model.thickness?.[indices[0]];
  if (!(t > 0) || !indices.every((i) => Math.abs(model.thickness[i] - t) <= 1e-9 * Math.max(t, 1))) {
    return null;
  }
  return t;
}
export function layerReferenceWidth(model, key) {
  if (model?.layerMode !== 'poleni') return layerThickness(model, key);
  const l = model.poleniLayers?.find((l) => l.id === key);
  return l ? referenceChord(model.poleniRadius, l.angleDeg) : null;
}
export function forcesInLayer(forces, key = 'all', model = null) {
  const indices = (forces?.points ?? []).map((_, i) => i)
    .filter((i) => key === 'all' || (model?.layerMode === 'poleni' ? forces.layer?.[i] === key : zKey(forces.z?.[i]) === key));
  const pick = (name) => indices.map((i) => forces[name]?.[i] ?? (name === 'z' ? 0 : 0));
  return { points: pick('points'), magnitudes: pick('magnitudes'), x: pick('x'),
    z: pick('z'), layer: indices.map((i) => forces.layer?.[i] ?? null), sourceIndices: indices };
}

// Vertex order/direction do not distinguish coincident XY blocks. Their weights
// add once in the combined section, rather than inventing coincident joints.
function pieceKey(p) {
  const pts = p.x.map((x, i) => `${x},${p.y[i]}`);
  return [pts, [...pts].reverse()].flatMap((a) => a.map((_, i) =>
    [...a.slice(i), ...a.slice(0, i)].join(';'))).sort()[0];
}
function polygonKey(block) {
  return piecesOf(block).map(pieceKey).sort().join('|');
}
export function modelInLayer(model, key = 'all') {
  if (!model) return null;
  const ls = layersOf(model);
  if (ls.length <= 1 && (key === 'all' || ls[0]?.key === key)) return model;
  const indices = (model.blocks ?? []).map((_, i) => i)
    .filter((i) => key === 'all' || blockLayerKey(model, i) === key);
  const rows = [], coincident = new Map();
  for (const i of indices) {
    const k = key === 'all' ? polygonKey(model.blocks[i]) : `block:${i}`;
    if (coincident.has(k)) {
      const row = rows[coincident.get(k)];
      row.weights += model.weights[i];
      row.thickness += model.thickness?.[i] ?? 0;
      row.sources.push(i);
    } else {
      coincident.set(k, rows.length);
      rows.push({ blocks: model.blocks[i], centroids: model.centroids[i],
        areas: model.areas?.[i] ?? 0, weights: model.weights[i],
        thickness: model.thickness?.[i] ?? 0, blockGroups: model.blockGroups?.[i], sources: [i] });
    }
  }
  const identity = rows.map((_, i) => i);
  const byX = [...identity].sort((a, b) => blockCentroid(rows[b].blocks)[0] - blockCentroid(rows[a].blocks)[0]);
  let order = identity, recovered = null;
  for (const trial of [identity, [...identity].reverse(), byX, [...byX].reverse()]) {
    const got = jointsFromBlocks(trial.map((i) => rows[i].blocks));
    if (got.ok) { order = trial; recovered = got; break; }
  }
  const out = { ...model, joints: recovered?.joints ?? null,
    jointRecovery: { ok: !!recovered, reason: 'This XY section is not a single chain; pick A and B to construct the line.' },
    forcePolygon: null, thrustLine: null };
  for (const field of ['blocks', 'centroids', 'areas', 'weights', 'thickness', 'blockGroups', 'sources']) {
    out[field] = order.map((i) => rows[i][field]);
  }
  if (recovered) Object.assign(out, springings(recovered.joints));
  else { out.pointA = null; out.pointB = null; }
  return out;
}

/** Independent layer solution at a prescribed *absolute* H. No H/W scaling. */
export function solveLayer(model, forces, settings, H) {
  const seq = blocksLike(model, forces);
  if (!seq.weights.length || !(H > 0)) return { lot: null, seq };
  const total = seq.weights.reduce((s, v) => s + (Array.isArray(v) ? v[1] : v), 0);
  let pole = [H, -total * (settings.split ?? 50) / 100];
  let lot, fp, construction = null, spanKept = null, fpKinds = seq.kind;
  const { A, B, imposed } = settings;
  if (imposed && A && B) {
    const [P, Q] = A[0] >= B[0] ? [A, B] : [B, A];
    const span = betweenEnds(seq, P, Q);
    spanKept = span.kept; fpKinds = span.kind;
    if (!span.weights.length) return { lot: null, seq };
    const corrected = poleForEnds(span.weights, span.centroids, P, Q, H, pole[1], span.actionDirs);
    if (!corrected) return { lot: null, seq };
    construction = corrected;
    fp = forcePolygon(span.weights, corrected.pole);
    lot = funicular(fp, span.centroids, P, Q, span.actionDirs);
  } else {
    fp = forcePolygon(seq.weights, pole);
    const joints = model.joints;
    if (joints?.length >= 2) {
      let start = joints[0], end = joints.at(-1);
      if (start.a[0] + start.b[0] < end.a[0] + end.b[0]) [start, end] = [end, start];
      lot = freeThrustLine(fp, seq.centroids, start, end, (settings.startPos ?? 50) / 100, seq.actionDirs);
    } else if (model.pointA && model.pointB) {
      lot = funicular(fp, seq.centroids, model.pointB, model.pointA, seq.actionDirs);
    }
  }
  const crossings = lot && model.joints ? jointCrossings(lot.points, model.joints) : null;
  return { lot, fp, seq, crossings, construction, spanKept, fpKinds, segForces: fp?.magnitudes.map((r) => r[2]) ?? [] };
}
