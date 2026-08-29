/**
 * Blocks: geometrical features, ordering, and the merge with applied forces.
 *
 * Ported from compute_Blocks_geometrical_features, sorting_Blocks and
 * sorted_Blocks_like in the MATLAB app.
 */

import { area, centroid } from './geometry.js';

/**
 * Areas, centroids and weights of the voussoirs.
 *
 * MATLAB applies Unit_Length_scaling to the area (squared) and to the
 * thickness, then
 *     W = A * specificWeight * thickness * unitMassToWeight
 * The scaling is carried explicitly rather than folded in, because the
 * examples were saved in two different frames and the caller has to know
 * which one it is in. See docs/app/data/README.md.
 *
 * @param {Array<{x:number[],y:number[]}>} polys
 * @param {object} opt
 * @param {number[]} opt.thickness      per block, before scaling
 * @param {number}   opt.specificWeight
 * @param {number}   opt.lengthScaling  Unit_Length_scaling, default 1
 * @param {number}   opt.massToWeight   Unit_Mass_to_Weight, default 1
 */
export function blockFeatures(polys, opt = {}) {
  const {
    thickness = [],
    specificWeight = 1,
    lengthScaling = 1,
    massToWeight = 1,
  } = opt;

  const areas = [];
  const centroids = [];
  const weights = [];
  const thick = [];

  polys.forEach((p, k) => {
    const a = area(p) * lengthScaling * lengthScaling;
    const t = (thickness[k] ?? 1) * lengthScaling;
    areas.push(a);
    thick.push(t);
    centroids.push(centroid(p));
    weights.push(a * specificWeight * t * massToWeight);
  });

  return { areas, centroids, weights, thickness: thick };
}

/**
 * The order the whole construction depends on: blocks by centroid x,
 * DESCENDING, exactly as MATLAB's sort(..., 'descend').
 *
 * Getting this backwards does not throw: it silently produces a thrust line
 * that runs the wrong way and closes nowhere near the far springing.
 *
 * @returns {number[]} indices into the original arrays
 */
export function sortOrder(centroids) {
  return centroids
    .map((c, i) => [c[0], i])
    .sort((a, b) => b[0] - a[0])
    .map(([, i]) => i);
}

/** Reorder any array with the indices from sortOrder. */
export function applyOrder(arr, order) {
  return order.map((i) => arr[i]);
}

/**
 * Merge blocks and applied point forces into one sequence, "blocks_like".
 *
 * A force is carried as a block with no area and no outline, whose weight is
 * the force magnitude and whose centroid is its point of application. From
 * the funicular construction's point of view the two are the same thing: a
 * vertical load at a station, and it is much simpler to treat them alike than
 * to special-case forces later.
 *
 * @param {object} blocks   {centroids, weights, areas, thickness}
 * @param {object} forces   {points: [[x,y],...], magnitudes: [...]}
 * @returns {object} merged and already sorted, with `kind` 0 block / 1 force
 */
export function blocksLike(blocks, forces = { points: [], magnitudes: [] }) {
  const centroids = [...blocks.centroids, ...forces.points];
  const weights = [...blocks.weights, ...forces.magnitudes];
  const areas = [...blocks.areas, ...forces.points.map(() => 0)];
  const thickness = [...blocks.thickness, ...forces.points.map(() => 0)];
  const kind = [
    ...blocks.centroids.map(() => 0),
    ...forces.points.map(() => 1),
  ];

  const order = sortOrder(centroids);
  return {
    centroids: applyOrder(centroids, order),
    weights: applyOrder(weights, order),
    areas: applyOrder(areas, order),
    thickness: applyOrder(thickness, order),
    kind: applyOrder(kind, order),
    order,
  };
}

/**
 * The blocks that lie between two imposed ends, and so carry the line.
 *
 * A and B are the user's to place, anywhere on the drawing. Where they are
 * placed decides WHICH VOUSSOIRS THE LINE IS CARRYING: a block whose centroid
 * falls outside them is not between the two points the line runs between, and
 * its weight belongs to the abutment rather than to the arch. Put A to the
 * right of the first block's centroid and that block drops out; raise A above
 * it and it drops out too. Both tests are needed, and the second is the one
 * that is easy to forget: near a springing the ring is steep, so a point moved
 * a little up the face passes several centroids without moving in x at all.
 *
 * The end that lies to the left bounds from the left, the other from the
 * right, whichever way round the caller happens to pass them.
 *
 * @param {object} seq  as `blocksLike` returns it, sorted
 * @param {number[]} A @param {number[]} B  the two imposed points
 * @returns {object} the same shape, with `kept` giving the indices that stayed
 */
export function betweenEnds(seq, A, B) {
  if (!A || !B || !seq || !seq.centroids.length) {
    return { ...seq, kept: seq ? seq.centroids.map((_, i) => i) : [] };
  }
  const left = A[0] <= B[0] ? A : B;
  const right = A[0] <= B[0] ? B : A;

  const kept = [];
  seq.centroids.forEach((g, i) => {
    // Outside in x: beyond either end along the span.
    if (g[0] < left[0] || g[0] > right[0]) return;
    // Below an end in y: the end has been raised past this block, so the block
    // sits outside the stretch the line spans. TESTED AGAINST THE NEARER END
    // ONLY. Against both, raising one end cut the block at the other end too:
    // on a symmetric ring, lifting B above the first centroid dropped the last
    // block as well, and moving one point silently changed the far abutment.
    const near = Math.abs(g[0] - left[0]) <= Math.abs(g[0] - right[0])
      ? left : right;
    if (g[1] < near[1]) return;
    kept.push(i);
  });

  const pick = (arr) => kept.map((i) => arr[i]);
  return {
    centroids: pick(seq.centroids),
    weights: pick(seq.weights),
    areas: pick(seq.areas),
    thickness: pick(seq.thickness),
    kind: seq.kind ? pick(seq.kind) : undefined,
    order: seq.order,
    kept,
  };
}

/**
 * Voussoirs of a circular arch, as CalculateArchButtonPushed builds them.
 *
 * Angles in degrees, measured as MATLAB's pol2cart does: counter-clockwise
 * from the positive x axis.
 */
/**
 * A circular ring, blocks AND joints, from the numbers rather than a trace.
 *
 * WHY IT IS REACHABLE FROM THE INTERFACE. The published figures for the
 * admissible thrust band and the least admissible thickness are computed on an
 * exact semicircular ring at a stated $t/r_i$, and until now that ring could
 * only be built from a script: `circularArch` existed but nothing outside the
 * tests called it, and a reader wanting to check one point of those figures had
 * to trace two arcs over an image by hand and would not have got the same
 * numbers. The MATLAB predecessor had the button; this restores it.
 *
 * The joints are built from the same angles as the blocks rather than
 * recovered from them, so they are exact; a test asserts that recovering them
 * with `jointsFromBlocks` agrees.
 *
 * @returns {{blocks: Array, joints: Array<{a:number[], b:number[]}>}}
 *          in the order the application uses: centroid x descending, which for
 *          angles increasing from 0 means the ring is walked from the right.
 */
export function circularRing(opt) {
  const {
    centre = [0, 0], innerRadius, outerRadius,
    startAngle = 0, endAngle = 180, count,
  } = opt;
  const blocks = circularArch({
    centre, innerRadius, outerRadius, startAngle, endAngle, count,
  });
  const step = (endAngle - startAngle) / count;
  const at = (r, k) => {
    const th = ((startAngle + k * step) * Math.PI) / 180;
    return [centre[0] + r * Math.cos(th), centre[1] + r * Math.sin(th)];
  };
  const joints = [];
  for (let k = 0; k <= count; k++) {
    joints.push({ a: at(innerRadius, k), b: at(outerRadius, k) });
  }
  // Blocks run from startAngle upwards, so with the usual 0 to 180 they come
  // out left to right and both lists have to be turned to match the sort the
  // rest of the application applies.
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  const cx = (p) => p.x.reduce((a, b) => a + b, 0) / p.x.length;
  if (blocks.length > 1 && cx(first) < cx(last)) {
    blocks.reverse();
    joints.reverse();
  }
  return { blocks, joints };
}

export function circularArch({
  centre = [0, 0],
  innerRadius,
  outerRadius,
  startAngle,
  endAngle,
  count,
}) {
  const polys = [];
  const step = (endAngle - startAngle) / count;
  const at = (r, k) => {
    const th = ((startAngle + k * step) * Math.PI) / 180;
    return [centre[0] + r * Math.cos(th), centre[1] + r * Math.sin(th)];
  };
  for (let j = 0; j < count; j++) {
    const i0 = at(innerRadius, j);
    const o0 = at(outerRadius, j);
    const o1 = at(outerRadius, j + 1);
    const i1 = at(innerRadius, j + 1);
    polys.push({
      x: [i0[0], o0[0], o1[0], i1[0]],
      y: [i0[1], o0[1], o1[1], i1[1]],
    });
  }
  return polys;
}
