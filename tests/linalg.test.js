/**
 * Tests for the small dense linear algebra.
 *
 * `nullSpace` moved here from mechanism.js, where it was written for the
 * collapse kinematics, because it is elimination on a matrix and knows nothing
 * about arches. Its own tests stay in mechanism.test.js as well, which
 * is what pins the re-export -- delete them there and a broken re-export would
 * pass unnoticed.
 *
 * THE SCALING CASE IS THE ONE THAT MATTERS. `tol` is compared against a pivot
 * directly, so a matrix whose columns carry different scales is not being
 * judged fairly. The application meets exactly that: a model is in metres or in
 * pixels, three orders of magnitude apart, and a moment coefficient carries a
 * lever arm where a force coefficient carries one. The tests below pin what the
 * routine does at three scales so that the assembly knows what it must fix.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  nullSpace, rank, luSolve, matVec, residual,
} from '../docs/app/js/core/linalg.js';

// ------------------------------------------------------------- null space --

test('the null space is found, and is empty when the system determines all', () => {
  assert.equal(nullSpace([[1, 1], [1, -1]], 2).length, 0);
  const v = nullSpace([[1, 1]], 2);
  assert.equal(v.length, 1);
  assert.ok(Math.abs(v[0][0] + v[0][1]) < 1e-12);
  assert.equal(nullSpace([[0, 0, 0]], 3).length, 3);
});

test('every null-space vector really is annihilated by the matrix', () => {
  // Three unknowns, one equation: a two-dimensional null space, and both of its
  // vectors must satisfy the equation exactly and be independent.
  const A = [[2, -1, 3]];
  const basis = nullSpace(A, 3);
  assert.equal(basis.length, 2);
  for (const v of basis) {
    assert.ok(Math.abs(matVec(A, v)[0]) < 1e-12);
  }
  // Independent: neither is a multiple of the other.
  const [p, q] = basis;
  const cross = p[0] * q[1] - p[1] * q[0];
  const cross2 = p[0] * q[2] - p[2] * q[0];
  assert.ok(Math.abs(cross) + Math.abs(cross2) > 1e-9);
});

test('the nullity is the same at three coordinate scales', () => {
  // THE HAZARD THE ASSEMBLY MUST REMOVE. The rows below are a force row and a
  // moment row of the kind an equilibrium assembly builds: a moment carries a lever
  // arm, so scaling the model scales one column and not the other. At 1e3 --
  // the pixel frame -- and at 1e-4 the answer must still be one dimension.
  for (const L of [1, 1e3, 1e-4]) {
    const A = [
      [1, 0, 0],
      [0, 1, 0],
      [0, L, 1 * L],
    ];
    assert.equal(nullSpace(A, 3).length, 0, `scale ${L}`);
  }
  // And a genuinely rank-deficient one stays rank-deficient at every scale.
  for (const L of [1, 1e3, 1e-4]) {
    const A = [[L, 2 * L], [2 * L, 4 * L]];
    assert.equal(nullSpace(A, 2).length, 1, `scale ${L}`);
  }
});

test('rank and nullity account for every column between them', () => {
  const cases = [
    [[[1, 1], [1, -1]], 2],
    [[[1, 1]], 2],
    [[[0, 0, 0]], 3],
    [[[2, -1, 3]], 3],
    [[[1, 2], [2, 4]], 2],
  ];
  for (const [A, n] of cases) {
    assert.equal(rank(A, n) + nullSpace(A, n).length, n);
  }
});

// ----------------------------------------------------------------- luSolve --

test('a square system is solved exactly', () => {
  // 2x + y = 5, x - 3y = -8  ->  x = 1, y = 3.
  const x = luSolve([[2, 1], [1, -3]], [5, -8]);
  assert.ok(Math.abs(x[0] - 1) < 1e-12);
  assert.ok(Math.abs(x[1] - 3) < 1e-12);
});

test('a three by three system is solved, and the residual says so', () => {
  const A = [[2, 1, -1], [-3, -1, 2], [-2, 1, 2]];
  const b = [8, -11, -3];                     // x = 2, y = 3, z = -1
  const x = luSolve(A, b);
  assert.ok(Math.abs(x[0] - 2) < 1e-12);
  assert.ok(Math.abs(x[1] - 3) < 1e-12);
  assert.ok(Math.abs(x[2] + 1) < 1e-12);
  assert.ok(residual(A, x, b) < 1e-14);
});

test('a singular system is refused rather than answered', () => {
  // A singular matrix here means a structure that does not hold. The caller has
  // something to say about that; returning nonsense would take the chance away.
  assert.equal(luSolve([[1, 2], [2, 4]], [1, 2]), null);
  assert.equal(luSolve([[0, 0], [0, 0]], [0, 0]), null);
});

test('a system that is not square, or mismatched, is refused', () => {
  assert.equal(luSolve([[1, 2, 3], [4, 5, 6]], [1, 2]), null);
  assert.equal(luSolve([[1, 2], [3, 4]], [1]), null);
});

test('pivoting carries a system a naive elimination would divide by zero on', () => {
  // The first pivot is zero: without the row swap this is a division by zero.
  const A = [[0, 1], [1, 0]];
  const x = luSolve(A, [3, 7]);
  assert.ok(Math.abs(x[0] - 7) < 1e-12);
  assert.ok(Math.abs(x[1] - 3) < 1e-12);
});

// ---------------------------------------------------------------- residual --

test('the residual is relative to the load, not absolute', () => {
  // The same relative error on a system scaled by a million must read the same,
  // because "is this small" is only a question about the load it balances.
  const A = [[1, 0], [0, 1]];
  const small = residual(A, [1 + 1e-9, 2], [1, 2]);
  const big = residual(A, [1e6 + 1e-3, 2e6], [1e6, 2e6]);
  assert.ok(Math.abs(small - big) < 1e-12);
});

test('matVec multiplies rows in order', () => {
  assert.deepEqual(matVec([[1, 2], [3, 4]], [1, 1]), [3, 7]);
});
