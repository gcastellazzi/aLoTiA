/**
 * Whole profiles, cut into voussoirs by rays from a centre.
 *
 * Tracing an intrados and an extrados works for a ring of even thickness. It
 * does not work for a section whose outline is genuinely complicated -- a
 * haunch filled to a horizontal extrados, a pier widening at its base, or the
 * two shells of St Peter's dome, where a single radial cut passes through
 * masonry, then air, then masonry again.
 *
 * So the student may instead trace the OUTLINE, as many closed curves as the
 * section needs, and the joints are made by cutting it with rays from a picked
 * centre. One centre, one number of blocks, and every shell is cut at the same
 * angles -- which is what makes the pieces at a given cut belong to the same
 * voussoir.
 *
 * A BLOCK MAY BE IN SEVERAL PIECES. That is the whole reason for the double
 * shell, and it is why blocks here carry a `pieces` array. Area and centroid
 * are additive over the pieces, so the mechanics is unchanged; only the
 * drawing has to know there is more than one polygon.
 */

import { area, piecesOf, blockArea, blockCentroid } from './geometry.js';

export { piecesOf, blockArea, blockCentroid };

/** The angle of a point about the centre, in [-pi, pi]. */
const angleOf = (p, c) => Math.atan2(p[1] - c[1], p[0] - c[0]);

/**
 * Where a ray from `centre` at angle `t` crosses a closed polyline.
 *
 * Returns the distances along the ray, ascending. Only forward hits count: a
 * ray is a half-line, and counting backwards would pair the wrong crossings
 * into material.
 */
export function rayHits(profile, centre, t) {
  const dx = Math.cos(t);
  const dy = Math.sin(t);
  const out = [];
  const n = profile.length;
  for (let i = 0; i < n; i++) {
    const p = profile[i];
    const q = profile[(i + 1) % n];
    const ex = q[0] - p[0];
    const ey = q[1] - p[1];
    // s d - u e = p - centre, solved by Cramer. The determinant of
    // [d, -e] is ex dy - dx ey; getting its sign the other way round makes
    // every distance come out negative and the ray finds nothing at all.
    const den = ex * dy - dx * ey;
    if (Math.abs(den) < 1e-15) continue;              // parallel
    const rx = p[0] - centre[0];
    const ry = p[1] - centre[1];
    // centre + s d = p + u e
    const u = (dx * ry - dy * rx) / den;
    if (u < 0 || u >= 1) continue;                    // outside the edge
    const s = (ex * ry - ey * rx) / den;
    if (s > 0) out.push(s);
  }
  return out.sort((a, b) => a - b);
}

/**
 * The material a ray passes through, as [enter, leave] distance pairs.
 *
 * A closed curve is crossed an even number of times, so the hits pair off. An
 * odd count means the ray grazed a vertex or ran along an edge; the last hit
 * is dropped rather than pairing material with nothing.
 */
export function materialSpans(profiles, centre, t) {
  const hits = [];
  for (const p of profiles) hits.push(...rayHits(p, centre, t));
  hits.sort((a, b) => a - b);
  const spans = [];
  for (let i = 0; i + 1 < hits.length; i += 2) spans.push([hits[i], hits[i + 1]]);
  return spans;
}

/** The angular extent of the traced section about the centre. */
export function angularExtent(profiles, centre) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const prof of profiles) {
    for (const p of prof) {
      const a = angleOf(p, centre);
      if (a < lo) lo = a;
      if (a > hi) hi = a;
    }
  }
  return Number.isFinite(lo) ? { from: lo, to: hi } : null;
}

const at = (centre, t, s) => [
  centre[0] + s * Math.cos(t),
  centre[1] + s * Math.sin(t),
];

/**
 * Cut a traced section into voussoirs.
 *
 * @param {Array<Array<number[]>>} profiles  one or more closed outlines
 * @param {number[]} centre
 * @param {number} n            how many voussoirs
 * @param {object} [range]      {from, to} in radians; the extent by default
 * @returns {{blocks, joints, cuts, warnings}}
 */
export function cutRadially(profiles, centre, n, range) {
  const list = (profiles ?? []).filter((p) => p && p.length >= 3);
  const warnings = [];
  if (!list.length) return { blocks: [], joints: [], cuts: [], warnings: ['no profile traced'] };
  if (!(n >= 1)) return { blocks: [], joints: [], cuts: [], warnings: ['at least one block'] };

  let span = range ?? angularExtent(list, centre);
  if (!span) return { blocks: [], joints: [], cuts: [], warnings: ['cannot place the cuts'] };

  // THE EXTREME CUTS LIE IN THE END FACES. A section traced as a closed
  // outline ends in radial faces, and the first and last rays run exactly
  // along them: parallel lines never meet, so those cuts found no material at
  // all and the two end voussoirs went missing. Drawing them a hair inside
  // makes the crossing transversal. The inset is a millionth of the span --
  // far below anything that can be seen or measured.
  if (!range) {
    const inset = (span.to - span.from) * 1e-6;
    span = { from: span.from + inset, to: span.to - inset };
  }

  // The cuts, and the material each passes through.
  const cuts = [];
  for (let k = 0; k <= n; k++) {
    const t = span.from + ((span.to - span.from) * k) / n;
    const spans = materialSpans(list, centre, t);
    cuts.push({ t, spans });
    if (!spans.length) warnings.push(`cut ${k} misses the section`);
  }

  // The joint at a cut runs from the first material entered to the last left.
  // Where a cut crosses several shells the gaps between them are inside that
  // span; `segments` carries the material itself for anything that needs it.
  const joints = cuts.map((c) => {
    if (!c.spans.length) return null;
    const first = c.spans[0][0];
    const last = c.spans[c.spans.length - 1][1];
    return {
      a: at(centre, c.t, first),
      b: at(centre, c.t, last),
      segments: c.spans.map(([s0, s1]) => ({
        a: at(centre, c.t, s0), b: at(centre, c.t, s1),
      })),
    };
  }).filter(Boolean);

  // A block spans two consecutive cuts. Its pieces pair the material of one
  // cut with the material of the next, in order from the centre outwards.
  const blocks = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const A = cuts[k];
    const B = cuts[k + 1];
    const pairs = Math.min(A.spans.length, B.spans.length);
    if (A.spans.length !== B.spans.length) {
      warnings.push(
        `between cuts ${k} and ${k + 1} the section changes from `
        + `${A.spans.length} to ${B.spans.length} pieces`,
      );
    }
    const pieces = [];
    for (let m = 0; m < pairs; m++) {
      const [a0, a1] = A.spans[m];
      const [b0, b1] = B.spans[m];
      const quad = [
        at(centre, A.t, a0), at(centre, A.t, a1),
        at(centre, B.t, b1), at(centre, B.t, b0),
      ];
      const poly = { x: quad.map((p) => p[0]), y: quad.map((p) => p[1]) };
      // Counter-clockwise, as every other block in the application is.
      if (area(poly) < 0) {
        poly.x.reverse();
        poly.y.reverse();
      }
      pieces.push(poly);
    }
    if (pieces.length) blocks.push(makeBlock(pieces));
  }

  return { blocks, joints, cuts, warnings };
}

/**
 * A block from its pieces: one polygon carrying the rest.
 *
 * The first piece IS the block for everything that reads `x` and `y`, so a
 * single-piece block is indistinguishable from the quadrilaterals the tracer
 * has always produced. `pieces` is only consulted where it matters.
 */
export function makeBlock(pieces) {
  const first = pieces[0];
  return { x: first.x, y: first.y, pieces };
}
