/**
 * Tests for the projective map that rectifies the background photograph.
 *
 * The rendering itself needs a canvas and is not tested here. What is tested
 * is the only part that can be silently wrong: the homography. A map that is
 * subtly incorrect still produces a plausible-looking picture -- which is
 * exactly why the strip approximation it replaces went unnoticed until the
 * banding was pointed out.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { unitSquareTo, invert } from '../docs/app/js/render/warp.js';

/** Apply a nine-number 3x3 to a point. */
function apply9(m, x, y) {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

/** The eight-number form carries an implicit 1 in the ninth place. */
const nine = (m) => [...m, 1];

const near = (a, b, tol = 1e-9) =>
  assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

test('the unit square lands exactly on the four corners', () => {
  const quads = [
    // a plain rectangle: the affine branch
    [[0, 0], [10, 0], [10, 6], [0, 6]],
    // a keystone: the projective branch
    [[2, 0], [9, 1], [11, 7], [0, 6]],
    // strongly convergent, as a photograph taken from below
    [[3, 0], [8, 0], [12, 9], [-1, 9]],
  ];
  for (const [p0, p1, p2, p3] of quads) {
    const m = nine(unitSquareTo(p0, p1, p2, p3));
    const got = [apply9(m, 0, 0), apply9(m, 1, 0), apply9(m, 1, 1), apply9(m, 0, 1)];
    [p0, p1, p2, p3].forEach((p, i) => {
      near(got[i][0], p[0]);
      near(got[i][1], p[1]);
    });
  }
});

test('the inverse undoes the map, over the whole square', () => {
  const m = nine(unitSquareTo([2, 0], [9, 1], [11, 7], [0, 6]));
  const inv = invert(unitSquareTo([2, 0], [9, 1], [11, 7], [0, 6]));
  assert.ok(inv);
  for (let u = 0; u <= 1.0001; u += 0.125) {
    for (let v = 0; v <= 1.0001; v += 0.125) {
      const [x, y] = apply9(m, u, v);
      const [bu, bv] = apply9(inv, x, y);
      near(bu, u, 1e-8);
      near(bv, v, 1e-8);
    }
  }
});

test('straight lines stay straight, which the strip method could not manage', () => {
  // The property the whole change is for. A line in the source must map to a
  // line in the destination; a piecewise-affine approximation bends it at
  // every strip boundary.
  const m = nine(unitSquareTo([3, 0], [8, 0], [12, 9], [-1, 9]));
  for (const v0 of [0.2, 0.5, 0.8]) {
    const pts = [];
    for (let u = 0; u <= 1.0001; u += 0.1) pts.push(apply9(m, u, v0));
    const [ax, ay] = pts[0];
    const [bx, by] = pts[pts.length - 1];
    for (const [x, y] of pts) {
      // Twice the area of the triangle with the endpoints: zero on a line.
      const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      near(cross, 0, 1e-7);
    }
  }
});

test('a degenerate quadrilateral is refused rather than drawn wrong', () => {
  // Three corners collinear: there is no homography, and inventing one would
  // produce a picture that looks like an answer.
  const m = unitSquareTo([0, 0], [1, 1], [2, 2], [0, 5]);
  assert.ok(m === null || invert(m) === null);
});

test('a parallelogram takes the affine branch and has no projective part', () => {
  const m = unitSquareTo([0, 0], [10, 2], [12, 8], [2, 6]);
  near(m[6], 0);
  near(m[7], 0);
});
