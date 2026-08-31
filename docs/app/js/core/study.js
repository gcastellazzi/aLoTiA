/**
 * Plot data for the teaching graphs.
 *
 * Kept pure so the browser wiring can draw it and the tests can check the
 * mechanics without a canvas.
 */

import { distance } from './geometry.js';
import { circularRing, blocksLike } from './blocks.js';
import { weighBlocks, centroidsOf } from './trace.js';
import { collapseRange } from './mechanism.js';
import { luneWeights } from './dome.js';
import {
  forcePolygon, funicular, jointCrossings, poleForEnds,
} from './statics.js';

const STUDY_COLLAPSE = {
  coarse: 24,
  refine: 10,
  zooms: 2,
  search: { grid: 9, rounds: 1 },
};

function studySearch(opt) {
  return { ...STUDY_COLLAPSE, ...(opt.search ?? {}) };
}

/** A weighed circular ring, in the same shape the mechanism solver expects. */
export function circularRingCase({
  ri, tri, n, gamma = 20, thickness = 1,
  poleni = false, axisX = 0, angleDeg = 15,
}) {
  const { blocks, joints } = circularRing({
    centre: [0, 0],
    innerRadius: ri,
    outerRadius: ri * (1 + tri),
    startAngle: 0,
    endAngle: 180,
    count: n,
  });
  const weighed = poleni
    ? luneWeights(blocks, { axisX, angleDeg, specificWeight: gamma })
    : {
      weights: weighBlocks(blocks, { specificWeight: gamma, thickness }),
      widths: blocks.map(() => thickness),
    };
  const { weights } = weighed;
  const centroids = centroidsOf(blocks);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  return {
    blocks,
    joints,
    weights,
    centroids,
    totalWeight,
    thickness: weighed.widths,
    seq: blocksLike({
      centroids,
      weights,
      areas: blocks.map(() => 0),
      thickness: weighed.widths,
    }),
  };
}

/** True when the free thrust family admits at least one line in the ring. */
export function ringAdmissible(opt) {
  const r = circularRingCase(opt);
  return !!collapseRange(r.seq, r.joints, studySearch(opt));
}

/** One plotted t/ri state, coloured by whether a thrust line fits. */
export function ringStudyPoint(opt) {
  const r = circularRingCase(opt);
  const band = collapseRange(r.seq, r.joints, studySearch(opt));
  return {
    tri: opt.tri,
    weight: r.totalWeight,
    admissible: !!band,
    band,
  };
}

function springingJoints(joints) {
  const midX = (j) => (j.a[0] + j.b[0]) / 2;
  const first = joints[0];
  const last = joints[joints.length - 1];
  return midX(first) >= midX(last)
    ? { right: first, left: last }
    : { right: last, left: first };
}

function thrustFractions(band) {
  if (!band) return [0.04, 0.08, 0.12, 0.18, 0.26, 0.4, 0.7, 1.0];
  const mid = (band.min + band.max) / 2;
  return [
    Math.max(0.005, band.min * 0.55),
    band.min * 0.85,
    band.min,
    mid,
    band.max,
    band.max * 1.15,
    band.max * 1.6,
  ];
}

function steppedFractions(count, lo = 0, hi = 1, includeMid = false) {
  const n = Math.max(2, Math.round(count || 2));
  const vals = [];
  for (let i = 0; i < n; i++) {
    vals.push(lo + ((hi - lo) * i) / (n - 1));
  }
  if (includeMid && n >= 3) vals[Math.floor((n - 1) / 2)] = (lo + hi) / 2;
  return [...new Set(vals.map((v) => Number(v.toPrecision(12))))].sort((a, b) => a - b);
}

function steppedThrustFractions(band, count) {
  if (!count) return thrustFractions(band);
  if (!band) return steppedFractions(count, 0.04, 1.0);
  return steppedFractions(count, Math.max(0.005, band.min * 0.55), band.max * 1.6);
}

function horizontalPointOnBase(joint, s, side, centroidX) {
  const xmin = Math.min(joint.a[0], joint.b[0]);
  const xmax = Math.max(joint.a[0], joint.b[0]);
  const lo = side === 'left' ? xmin : Math.max(xmin, centroidX);
  const hi = side === 'left' ? Math.min(xmax, centroidX) : xmax;
  const x = lo + s * (hi - lo);
  const y = (joint.a[1] + joint.b[1]) / 2;
  return [x, y];
}

/**
 * The automatic t/ri teaching scan.
 *
 * For one geometry it varies both end points along the two springing joints
 * and the horizontal thrust across a range that deliberately crosses the
 * lower and upper limit states. Each trial is one plotted state.
 */
export function ringStudySamples(opt) {
  const r = circularRingCase(opt);
  const band = collapseRange(r.seq, r.joints, studySearch(opt));
  const { right, left } = springingJoints(r.joints);
  const rightCentroidX = Math.max(...r.centroids.map((c) => c[0]));
  const leftCentroidX = Math.min(...r.centroids.map((c) => c[0]));
  const sRights = opt.rightFractions
    ?? opt.endFractions
    ?? steppedFractions(Math.max(3, opt.rightSteps ?? opt.endSteps ?? 5), 0, 1, true);
  const sLefts = opt.leftFractions
    ?? opt.endFractions
    ?? steppedFractions(Math.max(3, opt.leftSteps ?? opt.endSteps ?? 5), 0, 1, true);
  const thrusts = opt.thrustFractions ?? steppedThrustFractions(band, opt.thrustSteps);
  const total = r.seq.weights.reduce((a, b) => a + b, 0);
  const samples = [];
  const spread = Math.max(0.0008, Math.abs(opt.tri) * 0.018);
  const count = sRights.length * sLefts.length * thrusts.length;
  let serial = 0;

  for (const sRight of sRights) {
    for (const sLeft of sLefts) {
      const P = horizontalPointOnBase(right, sRight, 'right', rightCentroidX);
      const Q = horizontalPointOnBase(left, sLeft, 'left', leftCentroidX);
      for (const f of thrusts) {
        const got = poleForEnds(r.seq.weights, r.seq.centroids, P, Q,
          total * f, -total / 2);
        let admissible = false;
        let lotPoints = [];
        if (got) {
          const fp = forcePolygon(r.seq.weights, got.pole);
          const lot = funicular(fp, r.seq.centroids, P, Q);
          lotPoints = lot.points.map((p) => p.slice());
          const cr = jointCrossings(lot.points, r.joints);
          admissible = cr.length === r.joints.length
            && cr.every((c) => c && c.inside !== false && c.s >= 0 && c.s <= 1);
        }
        const u = count > 1 ? serial / (count - 1) - 0.5 : 0;
        samples.push({
          tri: opt.tri,
          plotTri: opt.tri + u * spread,
          weight: r.totalWeight,
          admissible,
          lot: lotPoints,
          thrust: f,
          horizontalThrust: total * f,
          A: Q,
          B: P,
          sRight,
          sLeft,
          midBase: Math.abs(sRight - 0.5) < 1e-12 && Math.abs(sLeft - 0.5) < 1e-12,
        });
        serial += 1;
      }
    }
  }
  return { ok: true, points: samples, band };
}

/**
 * Find the least admissible t/ri below a known-good starting thickness.
 *
 * The returned value is an engineering plotting limit, not a formal theorem:
 * the same solver and tolerances used by the live mechanism panel define it.
 */
export function leastAdmissibleTri(opt) {
  const {
    tri, minTri = Math.max(1e-4, tri * 0.2), scan = 40, refine = 18,
  } = opt;
  if (!ringAdmissible(opt)) return null;

  let good = tri;
  let bad = null;
  for (let i = 1; i <= scan; i++) {
    const f = i / scan;
    const t = tri + (minTri - tri) * f;
    if (ringAdmissible({ ...opt, tri: t })) good = t;
    else { bad = t; break; }
  }
  if (bad === null) return minTri;

  for (let i = 0; i < refine; i++) {
    const mid = (good + bad) / 2;
    if (ringAdmissible({ ...opt, tri: mid })) good = mid;
    else bad = mid;
  }
  return good;
}

/**
 * Weight curve for a circular ring from its current thickness down to the
 * least thickness the line of thrust can fit inside.
 */
export function thicknessWeightStudy(opt) {
  const min = leastAdmissibleTri(opt);
  if (min === null) return { ok: false, reason: 'current ring is not admissible', points: [] };
  const samples = opt.samples ?? 40;
  const points = [];
  for (let i = 0; i < samples; i++) {
    const u = samples === 1 ? 0 : i / (samples - 1);
    const tri = min + (opt.tri - min) * u;
    const p = ringStudyPoint({ ...opt, tri });
    if (p.admissible) points.push(p);
  }
  return { ok: points.length > 0, minTri: min, maxTri: opt.tri, points };
}

/** N-M point at one joint, with compression negative. */
export function heymanPoint(joint, crossing, segForce) {
  if (!joint || !crossing || !Number.isFinite(segForce)) return null;
  const t = distance(joint.a, joint.b);
  const ecc = (crossing.s - 0.5) * t;
  const N = -Math.abs(segForce);
  return {
    N,
    M: N * ecc,
    ecc,
    thickness: t,
    inside: crossing.inside !== false && crossing.s >= 0 && crossing.s <= 1,
  };
}

export function heymanGeometricalSafety(points) {
  const checked = (points ?? [])
    .map((p) => {
      if (!p || !Number.isFinite(p.ecc) || !Number.isFinite(p.thickness)) return null;
      const limit = Math.abs(p.thickness) / 2;
      const demand = Math.abs(p.ecc);
      if (!(limit > 0)) return null;
      return {
        point: p,
        limit,
        demand,
        margin: limit - demand,
        factor: demand <= 1e-12 ? Infinity : limit / demand,
      };
    })
    .filter(Boolean);
  if (!checked.length) return null;
  checked.sort((a, b) => a.margin - b.margin);
  return checked[0];
}

/** Bounds of Heyman's no-tension triangle for drawing. */
export function heymanDomain(thickness, nMax) {
  const N = -Math.abs(nMax);
  const h = Math.abs(thickness) / 2;
  return heymanBand(thickness, N, h);
}

/** The two Heyman admissibility lines for a given eccentricity limit. */
export function heymanBand(thickness, nMax, eccentricityLimit = Math.abs(thickness) / 2) {
  const N = -Math.abs(nMax);
  const e = Math.abs(eccentricityLimit);
  return [
    { N: 0, M: 0 },
    { N, M: -N * e },
    { N, M: N * e },
  ];
}

/** Third-middle reference lines inside the no-tension triangle. */
export function thirdMiddleBand(thickness, nMax) {
  return heymanBand(thickness, nMax, Math.abs(thickness) / 6);
}
