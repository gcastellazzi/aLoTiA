/**
 * Tests for the meshing that Abaqus rejected.
 *
 * The reported failure was "The volume of 8 elements is zero, small, or
 * negative". The cause was a fan triangulation of outlines that are not always
 * convex, and the reason it was not noticed earlier is that the exporter took
 * the modulus of each triangle's area --- so it reported a healthy total
 * volume while writing elements the solver would not accept.
 *
 * These tests therefore check the sign, not the size.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  earClip, wedgeVolume, insertOutlinePoint,
} from '../docs/app/js/core/abaqus.js';

/** Signed area of a polygon: positive when counter-clockwise. */
const area2 = (pts) => pts.reduce((s, p, i) => {
  const q = pts[(i + 1) % pts.length];
  return s + (p[0] * q[1] - q[0] * p[1]);
}, 0) / 2;

/** Extrude a triangle of the outline into the wedge the exporter builds. */
const wedgeOf = (pts, tri, w = 2) => {
  const [i0, i1, i2] = tri;
  const back = (i) => [pts[i][0], w / 2, pts[i][1]];
  const front = (i) => [pts[i][0], -w / 2, pts[i][1]];
  return [back(i0), back(i1), back(i2), front(i0), front(i1), front(i2)];
};

// A dart. The reflex vertex is not visible from vertex 0, which is what makes
// a fan anchored there produce an inverted triangle. An L is NOT enough: its
// first vertex sees the whole outline and the fan happens to come out right,
// which is worth knowing before choosing a test case.
const CONCAVE = [[0, 0], [4, 0], [4, 4], [2, 1], [0, 4]];
const CONVEX = [[0, 0], [3, 0], [3, 2], [0, 2]];

test('ear clipping covers the outline exactly, convex or not', () => {
  for (const pts of [CONVEX, CONCAVE]) {
    const tris = earClip(pts);
    assert.equal(tris.length, pts.length - 2, 'wrong number of triangles');
    const total = tris.reduce((s, [a, b, c]) =>
      s + area2([pts[a], pts[b], pts[c]]), 0);
    assert.ok(Math.abs(total - area2(pts)) < 1e-9,
      `triangles cover ${total}, outline is ${area2(pts)}`);
  }
});

test('every ear is wound the same way as the outline', () => {
  // This is the property the fan broke. An inverted triangle extrudes into a
  // wedge of negative volume, which is the error Abaqus reported.
  for (const [a, b, c] of earClip(CONCAVE)) {
    assert.ok(area2([CONCAVE[a], CONCAVE[b], CONCAVE[c]]) > 0,
      'an ear came out inverted');
  }
});

test('a fan on the same outline inverts a triangle, which is the bug', () => {
  // The regression witness. Note what it does NOT check: the fan's signed
  // areas still SUM to the correct total --- they always do for a simple
  // polygon --- so a test on the total would pass while the mesh was unusable.
  // The fault is only visible per triangle, and only in the sign. That is why
  // taking the modulus of each area hid it for so long.
  const fan = [];
  for (let i = 1; i + 1 < CONCAVE.length; i++) fan.push([0, i, i + 1]);

  const total = fan.reduce((s, [a, b, c]) =>
    s + area2([CONCAVE[a], CONCAVE[b], CONCAVE[c]]), 0);
  assert.ok(Math.abs(total - area2(CONCAVE)) < 1e-9,
    'the fan total should still be right: that is the point');

  const inverted = fan.filter(([a, b, c]) =>
    area2([CONCAVE[a], CONCAVE[b], CONCAVE[c]]) < 0);
  assert.ok(inverted.length > 0,
    'this outline no longer defeats a fan; the witness is stale');

  // And each of those extrudes into exactly what Abaqus refused.
  for (const tri of inverted) {
    assert.ok(wedgeVolume(wedgeOf(CONCAVE, tri)) < 0);
  }
});

test('every wedge built from an ear has strictly positive volume', () => {
  for (const pts of [CONVEX, CONCAVE]) {
    for (const tri of earClip(pts)) {
      const v = wedgeVolume(wedgeOf(pts, tri));
      assert.ok(v > 0, `wedge volume ${v} is not positive`);
    }
  }
});

test('wedge volumes sum to the extruded area', () => {
  const w = 2.5;
  const total = earClip(CONCAVE)
    .reduce((s, tri) => s + wedgeVolume(wedgeOf(CONCAVE, tri, w)), 0);
  assert.ok(Math.abs(total - area2(CONCAVE) * w) < 1e-9,
    `${total} against ${area2(CONCAVE) * w}`);
});

test('a collapsed triangle has no volume, and is detectable as such', () => {
  const flat = [[0, 0], [1, 0], [2, 0]];      // three points on a line
  assert.ok(Math.abs(wedgeVolume(wedgeOf(flat, [0, 1, 2]))) < 1e-12);
});

// ------------------------------------------------ A and B off the block --

test('a point off the block is projected onto the outline and inserted', () => {
  const p = [-2, 1];                          // well outside, to the left
  const got = insertOutlinePoint(CONVEX, p);
  assert.ok(got.inserted, 'no node was inserted for a point off the block');
  assert.equal(got.pts.length, CONVEX.length + 1);
  // The inserted vertex is the nearest point of the outline, not the point.
  const added = got.pts.find((q) => !CONVEX.some(
    (v) => v[0] === q[0] && v[1] === q[1]));
  assert.deepEqual(added, [0, 1]);
  assert.ok(Math.abs(got.distance - 2) < 1e-12);
});

test('the outline still triangulates after a point is inserted', () => {
  const { pts } = insertOutlinePoint(CONVEX, [-2, 1]);
  const tris = earClip(pts);
  const total = tris.reduce((s, [a, b, c]) =>
    s + area2([pts[a], pts[b], pts[c]]), 0);
  assert.ok(Math.abs(total - area2(CONVEX)) < 1e-9);
  for (const tri of tris) assert.ok(wedgeVolume(wedgeOf(pts, tri)) > 0);
});

test('a point already at a vertex inserts nothing', () => {
  // Inserting a duplicate would make a zero-length edge and a degenerate
  // element: exactly the fault being fixed.
  const got = insertOutlinePoint(CONVEX, [3, 2]);
  assert.equal(got.inserted, false);
  assert.equal(got.pts.length, CONVEX.length);
});

test('a point inside the block still lands on the outline', () => {
  // A support inside the section has no meaning for a surface condition; the
  // nearest boundary point is the defensible place for it.
  const got = insertOutlinePoint(CONVEX, [1.5, 1.5]);
  assert.ok(got.inserted);
  assert.ok(got.distance <= 0.5 + 1e-12);
});
