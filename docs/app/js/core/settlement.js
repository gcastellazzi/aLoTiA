/** Prescribed support translations, first-order planar rigid-block kinematics.
 * This verifies a chosen hinge pattern; it does not search for a collapse mode
 * or compute activation multipliers/reactions. Original geometry is immutable. */
import { nullSpace } from './linalg.js';
import { blockRole } from './region-roles.js';
import { blockLayerKey } from './layers.js';
import { piecesOf } from './geometry.js';
import { distanceToBoundary } from './joints.js';
import { geometricTolerance, vertices, onSegment } from './region-geometry.js';
import { boundaryMotionAllowed } from './region-boundaries.js';

export function supportTranslations(source) {
  return source.blocks.map((b, i) => blockRole(source, i) === 'fixed' ? b.supportDisplacement ?? [0, 0] : [0, 0]);
}
const velocity = (m, p) => [m.vx - m.omega * p[1], m.vy + m.omega * p[0]];
const zero = { vx: 0, vy: 0, omega: 0 };

export function settlementMotion(source, section, hinges, bodyList, bodyOf) {
  const fail = (reason) => ({ ok: false, reason });
  if (source.layerMode === 'poleni') return fail('Support settlement is available for planar Z layers.');
  if (!hinges || hinges.length < 3 || hinges.length > 4 || bodyList.length !== hinges.length - 1)
    return fail('Choose three or four ordered hinges, including the two support contacts.');
  if (!hinges.every((h) => h.opposite && h.along)) return fail('Choose hinges at the intrados or extrados ends of the joints.');
  const shifts = supportTranslations(source), tol = geometricTolerance(source.blocks.flatMap(piecesOf));
  const sources = section.sources ?? section.blocks.map((_, i) => [i]);
  const activeLayers = new Set(sources.flat().map((i) => blockLayerKey(source, i)));
  const active = shifts.map((d, i) => i).filter((i) => activeLayers.has(blockLayerKey(source, i)) && shifts[i].some((v) => v !== 0));
  if (!active.length) return fail('Assign a nonzero translation to a fixed boundary block in the active layer.');
  if (active.some((i) => shifts[i].length !== 2 || !shifts[i].every(Number.isFinite))) return fail('Support translations must be finite Δx, Δy values.');
  const used = new Set();
  const ends = [0, hinges.length - 1].map((k, end) => {
    const block = end ? bodyList.at(-1).to - 1 : bodyList[0].from;
    const layers = new Set(sources[block].map((i) => blockLayerKey(source, i)));
    const values = [];
    for (const layer of layers) {
      const touching = source.blocks.map((_, i) => i).filter((i) => blockRole(source, i) === 'fixed'
        && blockLayerKey(source, i) === layer
        && piecesOf(source.blocks[i]).some((p) => distanceToBoundary(hinges[k].point, vertices(p)) <= tol));
      touching.forEach((i) => used.add(i));
      values.push(...(touching.length ? touching.map((i) => shifts[i]) : [[0, 0]]));
    }
    return values;
  });
  const magnitude = Math.max(...active.map((i) => Math.hypot(...shifts[i])));
  if (ends.some((v) => v.some((d) => Math.hypot(d[0] - v[0][0], d[1] - v[0][1]) > magnitude * 1e-9)))
    return fail('Conflicting translations at a support contact: corresponding supports in a solidary section must move together.');
  if (active.some((i) => !used.has(i))) return fail('A moving support is not connected to an outer chosen hinge. Include its actual contact in the hinge pattern.');
  const prescribed = ends.map((v) => v[0]);
  const origin = hinges[0].point;
  const L = Math.max(...hinges.map((h) => Math.hypot(h.point[0] - origin[0], h.point[1] - origin[1])), tol);
  const n = bodyList.length, cols = n * 3, A = [], rhs = [];
  hinges.forEach((h, k) => {
    const p = [(h.point[0] - origin[0]) / L, (h.point[1] - origin[1]) / L];
    const row = [Array(cols).fill(0), Array(cols).fill(0)];
    for (const [i, sign] of [[k - 1, 1], [k, -1]]) if (i >= 0 && i < n) {
      row[0][3 * i] = sign; row[0][3 * i + 2] = -sign * p[1];
      row[1][3 * i + 1] = sign; row[1][3 * i + 2] = sign * p[0];
    }
    const d = k === 0 ? prescribed[0].map((v) => -v / L)
      : k === hinges.length - 1 ? prescribed[1].map((v) => v / L) : [0, 0];
    A.push(...row); rhs.push(...d);
  });
  const augmented = nullSpace(A.map((row, i) => [...row, -rhs[i]]), cols + 1, 1e-11);
  const seed = augmented.find((v) => Math.abs(v[cols]) > 1e-9);
  if (!seed) return fail('The chosen hinges cannot accommodate this support translation.');
  const particular = seed.slice(0, cols).map((v) => v / seed[cols]);
  const free = nullSpace(A, cols, 1e-11);
  if (free.length > 1) return fail('The chosen pattern has more than one free motion; choose three or four independent hinges.');
  const unpack = (v) => bodyList.map((_, i) => {
    const omega = v[3 * i + 2], vx = L * v[3 * i] + omega * origin[1], vy = L * v[3 * i + 1] - omega * origin[0];
    return { vx, vy, omega, centre: Math.abs(omega) > 1e-14 ? [-vy / omega, vx / omega] : null };
  });
  const openings = (motions) => hinges.map((h, k) => {
    const left = k ? velocity(motions[k - 1], h.opposite) : prescribed[0];
    const right = k < n ? velocity(motions[k], h.opposite) : prescribed[1];
    return (right[0] - left[0]) * h.along[0] + (right[1] - left[1]) * h.along[1];
  });
  const constraints = section.boundaries ?? [];
  const rates = (motions) => {
    const out = openings(motions);
    for (const c of constraints) {
      const v = velocity(motions[bodyOf[c.block]] ?? zero, c.point), d = shifts[c.fixed];
      const rel = [v[0] - d[0], v[1] - d[1]];
      if (c.normal) out.push(rel[0] * c.normal[0] + rel[1] * c.normal[1]);
      else {
        // Corner admissibility is a tangent-cone test. Edge roots partition
        // the free parameter into intervals on which that test is constant.
        const p = vertices(c.polygon);
        p.forEach((a, i) => { const b = p[(i + 1) % p.length];
          if (onSegment(c.point, a, b, c.tol)) out.push(rel[0] * (b[1] - a[1]) - rel[1] * (b[0] - a[0]));
        });
      }
    }
    return out;
  };
  const allowed = (motions) => {
    const scale = Math.max(magnitude, ...motions.flatMap((m) => hinges.map((h) => Math.hypot(...velocity(m, h.point)))));
    return openings(motions).every((v) => v >= -scale * 1e-9)
      && boundaryMotionAllowed(constraints, bodyOf, motions, 1, shifts);
  };
  let selected = particular;
  if (free.length) {
    const dir = free[0], dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
    const optimum = -dot(particular, dir) / dot(dir, dir);
    const at = (t) => particular.map((v, i) => v + t * dir[i]);
    const r0 = rates(unpack(at(0))), r1 = rates(unpack(at(1)));
    const roots = r0.map((v, i) => Math.abs(r1[i] - v) > 1e-14 * L ? -v / (r1[i] - v) : NaN).filter(Number.isFinite).sort((a, b) => a - b);
    const bounds = [-Infinity, ...roots, Infinity];
    const candidates = [optimum, ...roots];
    for (let i = 0; i + 1 < bounds.length; i++) candidates.push(Math.max(bounds[i], Math.min(bounds[i + 1], optimum)));
    const feasible = candidates.filter(Number.isFinite).filter((t) => allowed(unpack(at(t))));
    if (!feasible.length) return fail('This hinge pattern would penetrate a joint or a boundary for the prescribed translation.');
    feasible.sort((a, b) => dot(at(a), at(a)) - dot(at(b), at(b)));
    selected = at(feasible[0]);
  }
  const motions = unpack(selected);
  if (!allowed(motions)) return fail('This hinge pattern would penetrate a joint or a boundary for the prescribed translation.');
  return { ok: true, supports: active, motions, dof: free.length, prescribed, shifts, openings: openings(motions),
    maxRotation: Math.max(...motions.map((m) => Math.abs(m.omega))),
    reason: free.length ? 'Compatible first-order motion; one free mode remains. A minimum-norm compatible representative is displayed.' : 'Compatible first-order motion, uniquely determined by the chosen hinges.' };
}

/** Rigid visualization of a first-order field, not a finite-settlement solve. */
export function settlementTransforms(motions, fraction) {
  return motions.map((m) => {
    const a = m.omega * fraction, cos = Math.cos(a), sin = Math.sin(a);
    if (Math.abs(a) < 1e-12) return { cos, sin, tx: m.vx * fraction, ty: m.vy * fraction };
    const cx = -m.vy / m.omega, cy = m.vx / m.omega;
    return { cos, sin, tx: cx - cos * cx + sin * cy, ty: cy - sin * cx - cos * cy };
  });
}
