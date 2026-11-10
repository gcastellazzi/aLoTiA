/** Explicit angular layers. Tapered layers are sectors; ribs keep a constant
 * transverse width and parallel meridional faces. Reference chords only set
 * their width and comparison scale, never multiply an already computed volume. */
import { piecesOf } from './geometry.js';
import { blockArea, blockCentroid } from './profile.js';
const radians = (a) => a * Math.PI / 180;
export const normalAngle = (a) => ((Number(a) % 360) + 360) % 360;
export function referenceChord(radius, angleDeg) {
  if (!Number.isFinite(radius) || !Number.isFinite(angleDeg) || !(radius > 0) || !(angleDeg > 0 && angleDeg <= 180)) throw new Error('Use R > 0 and an opening between 0 and 180 degrees.');
  return 2 * radius * Math.sin(radians(angleDeg) / 2);
}
export function angleForChord(radius, chord) {
  if (!Number.isFinite(radius) || !Number.isFinite(chord) || !(radius > 0) || !(chord > 0 && chord <= 2 * radius)) throw new Error('The reference chord must be positive and no larger than 2R.');
  return 2 * Math.asin(chord / (2 * radius)) * 180 / Math.PI;
}
export function validateAngularLayer(layer) {
  return !!layer && typeof layer.id === 'string' && /^p:[1-9]\d*$/.test(layer.id)
    && Number.isFinite(layer.startAngle) && Number.isFinite(layer.angleDeg)
    && layer.angleDeg > 0 && layer.angleDeg <= 180 && ['tapered', 'rib'].includes(layer.mode);
}
export function angularLayerForBlock(model, i) {
  const group = model.groups?.find((g) => g.id === model.blockGroups?.[i]);
  return model.poleniLayers?.find((l) => l.id === group?.poleniLayer) ?? null;
}
export function radialExtent(polys, axisX = 0) {
  return Math.max(0, ...polys.flatMap((b) => piecesOf(b).flatMap((p) => p.x.map((x) => Math.abs(x - axisX)))));
}
export function angularPeriod(polys, axisX = 0) {
  const xs = polys.flatMap((b) => piecesOf(b).flatMap((p) => p.x));
  return Math.min(...xs) < axisX && Math.max(...xs) > axisX ? 180 : 360;
}
// Integrate |x-axis| over a polygon, including blocks crossing the axis.
function clipAtAxis(p, axisX, side) {
  const points = p.x.map((x, i) => [x, p.y[i]]), out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const insideA = side * (a[0] - axisX) >= 0, insideB = side * (b[0] - axisX) >= 0;
    if (insideA) out.push(a);
    if (insideA !== insideB) {
      const t = (axisX - a[0]) / (b[0] - a[0]);
      out.push([axisX, a[1] + t * (b[1] - a[1])]);
    }
  }
  return { x: out.map((p) => p[0]), y: out.map((p) => p[1]) };
}
export function radialFirstMoment(block, axisX = 0) {
  let moment = 0;
  for (const p of piecesOf(block)) for (const side of [-1, 1]) {
    const q = clipAtAxis(p, axisX, side);
    if (q.x.length < 3) continue;
    const area = blockArea(q);
    if (!(area > 0)) continue;
    moment += area * Math.abs(blockCentroid(q)[0] - axisX);
  }
  return moment;
}
export function angularBlockProperties(block, layer, { axisX = 0, referenceRadius, gamma = 1 }) {
  const chord = referenceChord(referenceRadius, layer.angleDeg);
  const volume = layer.mode === 'rib' ? blockArea(block) * chord
    : radians(layer.angleDeg) * radialFirstMoment(block, axisX);
  const width = layer.mode === 'rib' ? chord
    : 2 * radialExtent([block], axisX) * Math.sin(radians(layer.angleDeg) / 2);
  return { weight: volume * gamma, volume, width, referenceChord: chord };
}
function facesOfRings(rings) {
  const n = rings[0].length, faces = [];
  for (let j = 0; j + 1 < rings.length; j++) for (let i = 0; i < n; i++) {
    const k = (i + 1) % n;
    faces.push([rings[j][i], rings[j][k], rings[j + 1][k], rings[j + 1][i]]);
  }
  faces.push(rings[0].slice().reverse(), rings.at(-1).slice());
  return faces;
}
export function angularBlockSolid(block, layer, { axisX = 0, referenceRadius, steps = null } = {}) {
  const theta = radians(layer.angleDeg), start = radians(layer.startAngle);
  const c = referenceChord(referenceRadius, layer.angleDeg);
  return piecesOf(block).flatMap((p) => {
    if (layer.mode === 'rib') {
      const centre = start + theta / 2, co = Math.cos(centre), si = Math.sin(centre);
      return facesOfRings([-c / 2, c / 2].map((d) => p.x.map((x, i) => {
        const r = x - axisX;
        return [axisX + r * co - d * si, r * si + d * co, p.y[i]];
      })));
    }
    const count = Math.max(1, steps ?? Math.ceil(layer.angleDeg / 3));
    return facesOfRings(Array.from({ length: count + 1 }, (_, j) => {
      const a = start + theta * j / count;
      return p.x.map((x, i) => [axisX + (x - axisX) * Math.cos(a), (x - axisX) * Math.sin(a), p.y[i]]);
    }));
  });
}
