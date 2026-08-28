/**
 * Poleni's dome: an arch that is a slice of a shell, not a slice of a barrel.
 *
 * A barrel vault cut into voussoirs gives blocks of constant width, and the
 * weight of a block is its area times that width. A DOME cut into lunes gives
 * nothing of the sort. Each lune is bounded by two meridian planes, so its
 * width at any point is proportional to the distance from the axis: broad at
 * the springing, where the major parallel is, and narrowing to nothing at the
 * crown, where the parallel closes to a point.
 *
 * That is what Poleni saw in 1748, and it is why a dome is not an arch. The
 * voussoirs near the springing weigh far more than the drawing suggests, and
 * the line of thrust that results is not the one a barrel of the same profile
 * would give.
 *
 * THE WEIGHT OF A LUNE BLOCK. By Pappus' theorem the volume swept by a plane
 * region turned through an angle theta about an axis in its plane is exactly
 *
 *     V = A * theta * rbar
 *
 * with A the area and rbar the distance of the CENTROID from the axis. Exact,
 * not approximate, and it needs nothing but the area and the centroid -- both
 * of which the model already carries. (The MATLAB app instead summed
 * `bounding box area * radius of one vertex * dtheta` over the revolution,
 * which is neither.)
 */

import { piecesOf, blockArea, blockCentroid } from './geometry.js';

/** Degrees to radians, kept here so the callers can speak in degrees. */
export const toRadians = (deg) => (deg * Math.PI) / 180;

/**
 * Where the axis of revolution stands.
 *
 * For a symmetric arch it is the vertical through the mid-point of the two
 * springings, which is right without asking. A stored example may carry no
 * springings at all, and then the middle of the blocks is the best guess.
 */
export function defaultAxis(pointA, pointB, polys) {
  if (pointA && pointB) return (pointA[0] + pointB[0]) / 2;
  // A stored example may carry no springings. Fall back to the middle of the
  // blocks themselves -- never to zero, which for an arch traced over a plate
  // in pixel coordinates would put the axis off the edge of the drawing and
  // make every lune far too wide.
  if (polys && polys.length) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of polys) {
      for (const x of p.x) {
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
    }
    if (Number.isFinite(lo)) return (lo + hi) / 2;
  }
  return 0;
}

/**
 * The width of the lune at a given distance from the axis.
 *
 * The number the user is really choosing when they set the slice angle: at the
 * major parallel it is this, and at the crown it goes to zero.
 */
export function luneWidth(radius, angleDeg) {
  return Math.abs(radius) * toRadians(angleDeg);
}

/**
 * The volume of one voussoir of a lune, by Pappus.
 *
 * @param {{x:number[],y:number[]}} poly
 * @param {number} axisX     where the axis of revolution stands
 * @param {number} angleDeg  the angle of the slice
 */
export function luneVolume(poly, axisX, angleDeg) {
  const a = blockArea(poly);
  const g = blockCentroid(poly);
  return a * toRadians(angleDeg) * Math.abs(g[0] - axisX);
}

/**
 * The weights of a whole lune, block by block.
 *
 * Returns the widths as well, because they are what the panel should report:
 * a student who sees the width fall from 1.2 m at the springing to 0.1 m at
 * the crown understands the result before seeing the thrust line move.
 *
 * @returns {{weights:number[], widths:number[], radii:number[]}}
 */
export function luneWeights(polys, opt = {}) {
  const { axisX = 0, angleDeg = 15, specificWeight = 20 } = opt;
  const theta = toRadians(angleDeg);
  const weights = [];
  const widths = [];
  const radii = [];
  for (const p of polys) {
    // Pieces first: a two-piece voussoir has its weight where the pieces put
    // it, not where the first of them happens to be.
    const g = blockCentroid(p);
    const r = Math.abs(g[0] - axisX);
    radii.push(r);
    widths.push(r * theta);
    weights.push(blockArea(p) * theta * r * specificWeight);
  }
  return { weights, widths, radii };
}

// ------------------------------------------------------------ the 3-D solid --

/**
 * A voussoir of a lune, as a surface: the profile turned about the axis.
 *
 * Returns quadrilateral faces in three dimensions, with the vertical as the
 * third coordinate, ready for projection. The two ends are capped so the block
 * reads as a solid rather than as a shell.
 *
 * @param {{x:number[],y:number[]}} poly
 * @param {number} axisX
 * @param {number} angleDeg
 * @param {number} steps    angular divisions; 1 gives a flat wedge
 */
export function revolve(poly, axisX, angleDeg, steps = 6) {
  const theta = toRadians(angleDeg);
  const n = poly.x.length;
  const m = Math.max(1, Math.round(steps));

  // Every vertex, at every angular station.
  const ring = [];
  for (let j = 0; j <= m; j++) {
    const t = (theta * j) / m;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const row = [];
    for (let i = 0; i < n; i++) {
      const r = poly.x[i] - axisX;
      row.push([axisX + r * cos, r * sin, poly.y[i]]);
    }
    ring.push(row);
  }

  const faces = [];
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      faces.push([ring[j][i], ring[j][k], ring[j + 1][k], ring[j + 1][i]]);
    }
  }
  faces.push(ring[0].slice().reverse());
  faces.push(ring[m].slice());
  return faces;
}

/**
 * A voussoir of a barrel vault: the profile pushed straight back.
 *
 * The constant-thickness case, given the same shape of result as `revolve` so
 * that the renderer does not have to know which it is looking at.
 */
export function extrude(poly, thickness) {
  const n = poly.x.length;
  const h = Math.abs(thickness) / 2;
  const front = [];
  const back = [];
  for (let i = 0; i < n; i++) {
    front.push([poly.x[i], -h, poly.y[i]]);
    back.push([poly.x[i], h, poly.y[i]]);
  }
  const faces = [];
  for (let i = 0; i < n; i++) {
    const k = (i + 1) % n;
    faces.push([front[i], front[k], back[k], back[i]]);
  }
  faces.push(front.slice().reverse());
  faces.push(back.slice());
  return faces;
}

/**
 * Every block as a solid, in whichever of the two idealisations is in force.
 *
 * @param {Array} polys
 * @param {object} opt
 * @param {boolean} opt.poleni      revolve rather than extrude
 * @param {number}  opt.axisX
 * @param {number}  opt.angleDeg
 * @param {number[]} opt.thickness  per block, for the barrel case
 */
export function solids(polys, opt = {}) {
  const {
    poleni = false, axisX = 0, angleDeg = 15, thickness = [], steps = 6,
  } = opt;
  // One solid per PIECE, flattened per block, so a double shell shows as the
  // two rings it is.
  return polys.map((block, k) => piecesOf(block).flatMap((p) => (poleni
    ? revolve(p, axisX, angleDeg, steps)
    : extrude(p, thickness[k] ?? 1))));
}

/**
 * The span of widths down the lune, for the panel to report.
 *
 * "The major parallel and the minor parallel at the centre of the dome" in the
 * user's words: the widest block and the narrowest.
 */
export function widthRange(polys, axisX, angleDeg) {
  if (!polys || !polys.length) return null;
  const { widths, radii } = luneWeights(polys, { axisX, angleDeg });
  return {
    min: Math.min(...widths),
    max: Math.max(...widths),
    rMin: Math.min(...radii),
    rMax: Math.max(...radii),
  };
}
