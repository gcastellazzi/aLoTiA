/**
 * The outline of a set of blocks, recovered from the blocks themselves.
 *
 * WHY THIS EXISTS. A session carries voussoirs, not the curves they were cut
 * from: Poleni's dome is eighty-three blocks in five material groups, and the
 * profile each group was cut from was never saved. Anything that wants to cut
 * the same section again -- with the joints turned sub-normal, say -- has to
 * recover that profile first.
 *
 * HOW. Two blocks that abut share the edge between them, and in a stored
 * session they share it EXACTLY: the vertices of consecutive blocks of a group
 * coincide to the last digit, because the cut that made them wrote the same
 * numbers into both. So the boundary of a group is what is left when every
 * edge that appears twice, once in each direction, is struck out. What remains
 * chains into closed loops: one for each connected run of blocks, and one more
 * for each hole.
 *
 * This is exact arithmetic on shared vertices, not a geometric union, and that
 * is deliberate. A tolerance wide enough to merge two faces that were drawn
 * separately is also wide enough to swallow a real gap -- the lower dome of St
 * Peter's is drawn as a left half and a right half that do not touch -- and a
 * profile drawn through a gap is a profile through air. Blocks that do not
 * share their vertices come back as separate loops, which is what they are.
 *
 * WHAT IS KEPT. The group travels with its outline. The out-of-plane thickness
 * and the unit weight are what make a rib a rib, and a section cut again
 * without them would weigh the wrong amount.
 */

import { area, bounds, piecesOf, signedArea } from './geometry.js';

/** A vertex key: exact when the numbers match, snapped when `tol` is given. */
function keyOf(p, tol) {
  if (!(tol > 0)) return `${p[0]},${p[1]}`;
  return `${Math.round(p[0] / tol)},${Math.round(p[1] / tol)}`;
}

/** Every polygon counter-clockwise, so that a shared edge is seen twice, once each way. */
function anticlockwise(poly) {
  const pts = poly.x.map((x, i) => [x, poly.y[i]]);
  return signedArea(poly) >= 0 ? pts : pts.reverse();
}

/**
 * The boundary loops of a set of polygons that share their vertices.
 *
 * @param {Array} polys  polygons `{x, y}`, or blocks: `piecesOf` is applied
 * @param {object} [opt]
 * @param {number} [opt.tol]  snap, as a fraction of the model diagonal. Zero,
 *        the default, means exact: the vertices must match digit for digit.
 * @returns {Array<{points: number[][], area: number, hole: boolean}>}
 *          loops, largest first; a loop wound the other way is a hole.
 */
export function boundaryLoops(polys, opt = {}) {
  const { tol = 0 } = opt;
  const pieces = (polys ?? []).flatMap((p) => (p?.x ? [p] : piecesOf(p)));
  if (!pieces.length) return [];
  const b = bounds(pieces);
  const snap = tol > 0
    ? tol * Math.hypot(b.xmax - b.xmin, b.ymax - b.ymin)
    : 0;

  // Every directed edge, and the count of each. An edge walked one way by one
  // polygon and the other way by its neighbour is interior to the pair.
  const edges = new Map();
  for (const poly of pieces) {
    const pts = anticlockwise(poly);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const c = pts[(i + 1) % pts.length];
      const ka = keyOf(a, snap);
      const kc = keyOf(c, snap);
      if (ka === kc) continue;                     // a repeated vertex
      const back = `${kc}|${ka}`;
      if (edges.has(back)) {
        const row = edges.get(back);
        row.n -= 1;
        if (!row.n) edges.delete(back);
        continue;
      }
      const key = `${ka}|${kc}`;
      const row = edges.get(key);
      if (row) row.n += 1;
      else edges.set(key, { from: a, to: c, fromKey: ka, toKey: kc, n: 1 });
    }
  }

  // What is left are the boundary edges. Chain them end to end.
  const starts = new Map();
  for (const row of edges.values()) {
    for (let i = 0; i < row.n; i++) {
      if (!starts.has(row.fromKey)) starts.set(row.fromKey, []);
      starts.get(row.fromKey).push(row);
    }
  }

  const loops = [];
  const used = new Set();
  for (const row of edges.values()) {
    if (used.has(row)) continue;
    const points = [row.from];
    let current = row;
    let guard = 0;
    while (current && guard++ <= edges.size + 1) {
      used.add(current);
      points.push(current.to);
      const next = (starts.get(current.toKey) ?? []).find((e) => !used.has(e));
      if (!next || next === row) break;
      current = next;
    }
    if (points.length < 4) continue;
    points.pop();                                  // the walk closes on itself
    const poly = { x: points.map((p) => p[0]), y: points.map((p) => p[1]) };
    loops.push({ points, area: area(poly), hole: signedArea(poly) < 0 });
  }
  return loops.sort((p, q) => q.area - p.area);
}

/**
 * Every group of a model as the outlines its blocks make.
 *
 * @param {object} model  `{blocks, blockGroups, groups}` as a session carries
 * @param {object} [opt]
 * @param {number[]} [opt.skip]  group ids to leave out: the lantern of St
 *        Peter's is carried as a load on the crown, not as part of the section
 * @param {number} [opt.minArea] loops smaller than this fraction of the
 *        group's own area are dropped as slivers of the recovery
 * @returns {Array<{group: object, points: number[][], area: number}>}
 *          one entry per connected run of each group, largest first
 */
export function outlinesOfModel(model, opt = {}) {
  const { skip = [], tol = 0, minArea = 1e-6 } = opt;
  const groups = model?.groups ?? [];
  const blockGroups = model?.blockGroups ?? [];
  const out = [];
  groups.forEach((group) => {
    if (skip.includes(group.id)) return;
    const blocks = (model.blocks ?? []).filter((_, i) => blockGroups[i] === group.id);
    if (!blocks.length) return;
    const total = blocks.reduce((s, b) => s + piecesOf(b).reduce((t, p) => t + area(p), 0), 0);
    for (const loop of boundaryLoops(blocks, { tol })) {
      if (loop.hole || loop.area < minArea * total) continue;
      out.push({ group, points: loop.points, area: loop.area, blocks: blocks.length });
    }
  });
  return out;
}
