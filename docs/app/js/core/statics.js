/**
 * Graphical statics: the force polygon, the funicular polygon, the line of
 * thrust, and Hooke's cable analogy.
 *
 * This is the heart of aLOTofImaginArches, ported from the FOP/FUP routines of
 * the MATLAB app. Every formula here was checked against the twenty-eight
 * saved examples; see js/core/README.md and the tests.
 *
 * THE CONSTRUCTION, IN ONE PARAGRAPH
 * The weights of the voussoirs, taken in order from one springing to the
 * other, are laid end to end down a vertical LOAD LINE. A point off that line,
 * the POLE, is joined to every division of it; those segments are the RAYS.
 * Back in the drawing, starting from a springing, one walks a segment parallel
 * to the first ray until the vertical through the first block centroid, turns
 * onto the second ray, and so on. The polygon that results is the FUNICULAR
 * POLYGON, and for an arch it is the LINE OF THRUST. Moving the pole further
 * from the load line raises the horizontal thrust and flattens the line; that
 * one degree of freedom, plus the two free ends, is the infinity-cubed of
 * possible equilibrium states.
 */

import { distance, lineIntersection } from './geometry.js';

/**
 * The force polygon.
 *
 * The load line runs down x = 0 from y = 0; the pole sits at [xO, yO].
 *
 * Returned `magnitudes` reproduces MATLAB's Force_Funicolar_Polygon, one row
 * per block:
 *   [0] the weight itself
 *   [1] the ray to the division BELOW the block
 *   [2] the ray to the division ABOVE the block
 * so that magnitudes[j][2] === magnitudes[j-1][1]. The horizontal component of
 * every ray is the same, and equals the horizontal thrust.
 *
 * @param {number[]} weights  in the sorted order of blocksLike
 * @param {number[]} pole     [xO, yO]
 */
export function forcePolygon(weights, pole) {
  const [xO, yO] = pole;
  const n = weights.length;

  // Divisions of the load line: y0 = 0, then running down by each weight.
  const stations = [0];
  for (let j = 0; j < n; j++) stations.push(stations[j] - weights[j]);

  const magnitudes = [];
  const rays = [];
  for (let j = 0; j < n; j++) {
    const above = [0, stations[j]];
    const below = [0, stations[j + 1]];
    magnitudes.push([
      weights[j],
      distance(pole, below),
      distance(pole, above),
    ]);
    // The ray direction used by the funicular: from the pole to the division
    // above the block, taken pole-to-line as MATLAB writes it.
    rays.push([above[0] - xO, above[1] - yO]);
  }
  // One more ray, to the division below the last block: it carries the
  // closing segment of the funicular into the far springing.
  const last = [0, stations[n]];
  rays.push([last[0] - xO, last[1] - yO]);

  return { stations, magnitudes, rays, thrust: Math.abs(xO), pole };
}

/**
 * The funicular polygon, and for an arch the line of thrust.
 *
 * Starts at `start` (the springing B), and for each block turns onto the next
 * ray at the vertical through that block's centroid. The final ray is taken
 * reversed, as MATLAB does, so the polygon closes onto the other springing.
 *
 * @param {object} fp        the result of forcePolygon
 * @param {number[][]} centroids  block centroids, sorted
 * @param {number[]} start   springing the walk begins from, [x, y]
 * @param {number[]} end     the other springing, [x, y]
 * @returns {{points: number[][], closed: boolean, closureError: number}}
 */
export function funicular(fp, centroids, start, end) {
  // NO SPRINGINGS, NO WALK. Six of the stored examples were saved before a
  // solution was computed and several of those carry no xy_Point_A either, so
  // there is nowhere to begin. Throwing here aborted the whole update in the
  // middle: the drawing kept the previous arch and the panels kept the
  // previous arch's verdicts, which is the one outcome worse than an empty
  // plot. An empty result lets the caller say what is missing.
  if (!Array.isArray(start) || !Array.isArray(end)) {
    return { points: [], closed: false, closureError: Infinity };
  }
  const vertical = [0, 1];
  const points = [start.slice()];
  let current = start.slice();

  for (let j = 0; j <= centroids.length; j++) {
    const last = j === centroids.length;
    const dir = last ? fp.rays[j].map((v) => -v) : fp.rays[j];
    const through = last ? end : centroids[j];
    const hit = lineIntersection(current, dir, through, vertical);
    if (!hit) break; // a horizontal ray never meets a vertical line
    points.push(hit);
    current = hit;
  }

  const closureError = distance(points[points.length - 1], end);
  return { points, closed: closureError < 1e-6, closureError };
}

/**
 * The three degrees of freedom of the thrust line, made explicit.
 *
 * A funicular polygon is fixed by the pole and by where it starts. The pole
 * has two coordinates -- its abscissa is the horizontal thrust, its ordinate
 * distributes the slopes between the two halves -- and the starting point runs
 * along the springing joint. Three numbers: the infinity-cubed of Chapter 6.
 *
 * The tool used to pin the start and the end at the mid-points of the end
 * joints, which left only the thrust and made the admissibility criterion far
 * stricter than Heyman's: a semicircular ring needed t/ri well over 0.15
 * before any line fitted, against his 0.108.
 *
 * @param {object} joints          the joints, {a: intrados, b: extrados}
 * @param {number} s               0 at the intrados, 1 at the extrados
 * @returns {number[]} the point on that joint
 */
export function pointOnJoint(joint, s) {
  return [
    joint.a[0] + s * (joint.b[0] - joint.a[0]),
    joint.a[1] + s * (joint.b[1] - joint.a[1]),
  ];
}

/**
 * Where the line lands on a joint, as a fraction of it.
 *
 * The inverse of pointOnJoint, by projection, so that the end of a computed
 * thrust line can be reported in the same units as the start.
 */
export function fractionAlongJoint(joint, point) {
  const u = [joint.b[0] - joint.a[0], joint.b[1] - joint.a[1]];
  const len = u[0] * u[0] + u[1] * u[1];
  if (len === 0) return 0;
  return ((point[0] - joint.a[0]) * u[0]
    + (point[1] - joint.a[1]) * u[1]) / len;
}

/**
 * The pole that carries the line of thrust from A to B.
 *
 * THE CONSTRUCTION THE MATLAB VERSION SHOWED. Choose any trial pole at the
 * required thrust, draw the funicular from A, and see where it arrives; the
 * closing error tells you how far the pole's ORDINATE was out, and correcting
 * it lands the line on B. MATLAB drew this as a preliminary dashed polygon and
 * a projection of the trial pole onto the vertical through the load line
 * (`xy_Pole_Prime` to `xy_Pole_Def`), so the student could see the correction
 * rather than be handed the answer.
 *
 * IT IS A CORRECTION, NOT A SEARCH. At a fixed thrust the height the funicular
 * reaches over B's abscissa is exactly AFFINE in the pole ordinate: each
 * segment's slope is (yO - s_j)/xO, so the rise summed over the segments is
 *
 *     y_end = y_A + (yO (x_B - x_A) - sum s_j dx_j) / xO
 *
 * whose derivative in yO is (x_B - x_A)/xO. One trial and one linear step are
 * therefore exact, and the residual comes out at machine precision -- measured
 * at 1e-15 over a range of thrusts, with A and B deliberately asymmetric and
 * off the joints. Anything iterative here would be a misunderstanding.
 *
 * @param {number[]} weights     in the sorted order
 * @param {number[][]} centroids likewise
 * @param {number[]} A           where the line must start
 * @param {number[]} B           where it must end
 * @param {number} thrust        the horizontal thrust, the pole's abscissa
 * @param {number} [trialOrdinate]  any value; the answer does not depend on it
 * @returns {{pole, trial, preliminary, closureError, slope}}
 */
export function poleForEnds(weights, centroids, A, B, thrust, trialOrdinate) {
  const xO = Math.abs(thrust);
  const span = B[0] - A[0];
  if (!(xO > 0) || span === 0) return null;

  const total = weights.reduce((a, b) => a + b, 0);
  const trialY = trialOrdinate ?? -total / 2;
  const trial = [xO, trialY];

  const preliminary = funicular(forcePolygon(weights, trial), centroids, A, B);
  const reached = preliminary.points[preliminary.points.length - 1];

  // d(y_end)/d(yO), derived above and verified against the numbers.
  const slope = span / xO;
  const pole = [xO, trialY + (B[1] - reached[1]) / slope];

  const settled = funicular(forcePolygon(weights, pole), centroids, A, B);
  const end = settled.points[settled.points.length - 1];

  return {
    pole,
    trial,
    preliminary,
    slope,
    closureError: Math.hypot(end[0] - B[0], end[1] - B[1]),
  };
}

/**
 * The thrust line with both ends free.
 *
 * funicular() reproduces MATLAB: it starts at a given point and stops on the
 * vertical through the far springing, wherever that vertical happens to meet
 * the last ray. Two things follow, and both are wrong for an admissibility
 * check. The start is pinned at the mid-point of the joint, and the far end
 * does not actually reach its joint at all -- so asking where the line crosses
 * that joint returns the meeting of the joint's INFINITE line with some
 * unrelated segment, which on a semicircular arch reads as s = -14.
 *
 * Here instead the line begins at a chosen fraction of the starting joint and
 * its last segment is CARRIED ON until it meets the far joint. The result has
 * the three degrees of freedom of Chapter 6: the thrust (the pole abscissa),
 * the distribution of slope between the halves (the pole ordinate), and where
 * the line starts on its joint.
 *
 * @param {object} fp             the result of forcePolygon
 * @param {number[][]} centroids  block centroids, sorted as the weights are
 * @param {object} startJoint     the joint the walk begins from
 * @param {object} endJoint       the joint it must arrive at
 * @param {number} s              0 at the intrados of the starting joint, 1 at
 *                                the extrados
 */
export function freeThrustLine(fp, centroids, startJoint, endJoint, s = 0.5) {
  const vertical = [0, 1];
  const start = pointOnJoint(startJoint, s);
  const points = [start.slice()];
  let current = start.slice();

  // Every ray but the last, taken at the vertical through its centroid.
  for (let j = 0; j < centroids.length; j++) {
    const hit = lineIntersection(current, fp.rays[j], centroids[j], vertical);
    if (!hit) return { points, closed: false, end: null, endFraction: NaN };
    points.push(hit);
    current = hit;
  }

  // The last ray is not stopped at a vertical: it is carried on to the joint.
  const dir = fp.rays[centroids.length].map((v) => -v);
  const u = [endJoint.b[0] - endJoint.a[0], endJoint.b[1] - endJoint.a[1]];
  const hit = lineIntersection(current, dir, endJoint.a, u);
  if (!hit) return { points, closed: false, end: null, endFraction: NaN };
  points.push(hit);

  const endFraction = fractionAlongJoint(endJoint, hit);
  return {
    points,
    end: hit,
    endFraction,
    // "Closed" now means what it should: the line arrives WITHIN the joint,
    // that is, inside the masonry, rather than on its infinite prolongation.
    closed: endFraction >= 0 && endFraction <= 1,
  };
}

/**
 * Recover the pole from a stored force polygon.
 *
 * Needed because the saved examples are not consistent about where the final
 * pole was written: some carry it in xy_Pole_Def, others left that field at a
 * stale value with x = 0. The force polygon itself always determines the pole,
 * so it is recovered from the data rather than trusted from a field.
 *
 * Two rays through known divisions fix [xO, yO]: given the ray lengths a to
 * the division at yA and b to the division at yB,
 *     xO^2 + (yO - yA)^2 = a^2,   xO^2 + (yO - yB)^2 = b^2
 * subtracting removes xO and leaves yO linearly.
 *
 * @param {number[]} weights
 * @param {number[][]} magnitudes  rows of [w, rayBelow, rayAbove]
 */
export function poleFromForcePolygon(weights, magnitudes) {
  const stations = [0];
  for (let j = 0; j < weights.length; j++) {
    stations.push(stations[j] - weights[j]);
  }
  // Use the first and the last division, the furthest apart and so the best
  // conditioned pair.
  const yA = stations[0];
  const a = magnitudes[0][2];
  const yB = stations[weights.length];
  const b = magnitudes[weights.length - 1][1];

  const yO = (a * a - b * b - yA * yA + yB * yB) / (2 * (yB - yA));
  const x2 = a * a - (yO - yA) * (yO - yA);
  const xO = Math.sqrt(Math.max(0, x2));
  return [xO, yO];
}

/**
 * Hooke's cable: the same polygon hanging as a chain.
 *
 * "As hangs the flexible line, so but inverted will stand the rigid arch."
 * The construction is identical; the reflection is what makes the analogy
 * visible, so the app can show the two together.
 *
 * @param {number[][]} points  the funicular polygon
 * @param {number} axis        the y about which to reflect; defaults to the
 *                             mid-height of the polygon
 */
export function hookeCable(points, axis) {
  const ys = points.map((p) => p[1]);
  const y0 = axis ?? (Math.min(...ys) + Math.max(...ys)) / 2;
  return points.map(([x, y]) => [x, 2 * y0 - y]);
}

/**
 * Hooke's cable, hung from the two ends of the thrust line itself.
 *
 * hookeCable reflects about a horizontal line, which is right for a symmetric
 * arch and wrong for every other one: the cable floats away from the arch and
 * no longer starts at the springings, so the analogy stops being visible in
 * the one picture that is supposed to show it.
 *
 * Reflecting about the CHORD through the two ends fixes both ends exactly,
 * whatever their heights, because a reflection leaves the mirror line
 * pointwise fixed and A and B lie on it. For a symmetric arch, where the chord
 * is horizontal, it agrees with hookeCable.
 *
 * @param {number[][]} points  the thrust line, A ... B
 */
export function hangingCable(points) {
  if (!points || points.length < 2) return [];
  const a = points[0];
  const b = points[points.length - 1];
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const len2 = ux * ux + uy * uy;
  if (len2 === 0) return points.map((p) => p.slice());

  return points.map(([x, y]) => {
    // Reflect P in the line through A with direction u:
    //   P' = A + 2 (proj of AP on u) - AP
    const px = x - a[0];
    const py = y - a[1];
    const t = (px * ux + py * uy) / len2;
    return [
      a[0] + 2 * t * ux - px,
      a[1] + 2 * t * uy - py,
    ];
  });
}

/**
 * Where the thrust line crosses each joint, as a fraction of the joint.
 *
 * 0 is the intrados end of the joint, 1 the extrados end; anything outside
 * [0, 1] means the line has left the masonry and the arch, on Heyman's
 * assumptions, cannot be in equilibrium in that configuration.
 *
 * @param {number[][]} lot     the thrust line
 * @param {Array<{a:number[], b:number[]}>} joints  joint segments
 */
export function jointCrossings(lot, joints) {
  const out = [];
  for (const joint of joints) {
    const u = [joint.b[0] - joint.a[0], joint.b[1] - joint.a[1]];
    const len = u[0] * u[0] + u[1] * u[1];
    const candidates = [];

    for (let i = 0; i + 1 < lot.length; i++) {
      const p = lot[i];
      const d = [lot[i + 1][0] - p[0], lot[i + 1][1] - p[1]];
      const hit = lineIntersection(p, d, joint.a, u);
      if (!hit) continue;
      const s =
        ((hit[0] - joint.a[0]) * u[0] + (hit[1] - joint.a[1]) * u[1]) / len;
      const t =
        Math.abs(d[0]) > Math.abs(d[1])
          ? (hit[0] - p[0]) / d[0]
          : (hit[1] - p[1]) / d[1];
      if (t >= -1e-9 && t <= 1 + 1e-9) {
        candidates.push({ point: hit, s, inside: s >= 0 && s <= 1, segment: i });
      }
    }

    // A JOINT NEAR A SPRINGING IS ALMOST HORIZONTAL, and its infinite line
    // meets segments of the thrust line far away that have nothing to do with
    // it. Taking the first candidate found gives crossings that are not even
    // symmetric on a symmetric arch. Prefer a crossing that lies WITHIN the
    // joint; failing that, the one that misses it by least.
    let found = null;
    for (const c of candidates) {
      if (!found) { found = c; continue; }
      const miss = (x) => (x.s < 0 ? -x.s : x.s > 1 ? x.s - 1 : 0);
      if (miss(c) < miss(found)) found = c;
    }
    out.push(found);
  }
  return out;
}
