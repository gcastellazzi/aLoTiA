/**
 * The small dense linear algebra the mechanics needs, and nothing more.
 *
 * WHY THIS FILE EXISTS. `nullSpace` was written for the collapse kinematics and
 * lived inside `mechanism.js`, which is chain-bound from end to end -- hinges in
 * one order, bodies as consecutive index ranges, dof = 3(h-1) - 2h. The routine
 * itself knows none of that: it is elimination on a matrix, and anything else
 * that needs one would have had to import it from a module about arches, which
 * would be a lie about what depends on what. So it moved here, unchanged, and
 * `mechanism.js` re-exports it, which is why every caller and every test that
 * names it there still works.
 *
 * EVERYTHING HERE IS DENSE AND SMALL. The systems are a few hundred rows at the
 * very most -- three unknowns per body for a mechanism, three per contact for an
 * assembly of at most a few dozen blocks. Dense elimination on that is under a
 * millisecond, so there is no case for sparsity, none for iterative methods, and
 * none for anything clever. Written out longhand, it can be read.
 */

/**
 * Solve A x = 0 for a basis of the null space, by elimination with pivoting.
 *
 * Small dense systems only -- three unknowns per body, two equations per hinge.
 * Returns one vector per dimension of the null space, or an empty array when
 * the only solution is the trivial one.
 *
 * `tol` IS ABSOLUTE, which matters to the caller: a pivot is compared against it
 * directly. A matrix whose columns carry wildly different scales -- force
 * coefficients of order 1 beside moment coefficients of order of the model
 * diagonal -- is therefore not being judged fairly. The remedy belongs to the
 * assembly, not here: non-dimensionalise before building the matrix, so that
 * every entry is of order one and one tolerance means the same thing in every
 * column.
 */
export function nullSpace(A, nCols, tol = 1e-9) {
  const M = A.map((row) => row.slice());
  const rows = M.length;
  const pivotOf = new Array(nCols).fill(-1);
  let r = 0;

  for (let c = 0; c < nCols && r < rows; c++) {
    let best = r;
    for (let i = r; i < rows; i++) {
      if (Math.abs(M[i][c]) > Math.abs(M[best][c])) best = i;
    }
    if (Math.abs(M[best][c]) < tol) continue;
    [M[r], M[best]] = [M[best], M[r]];
    const p = M[r][c];
    for (let j = c; j < nCols; j++) M[r][j] /= p;
    for (let i = 0; i < rows; i++) {
      if (i === r) continue;
      const f = M[i][c];
      if (f === 0) continue;
      for (let j = c; j < nCols; j++) M[i][j] -= f * M[r][j];
    }
    pivotOf[c] = r;
    r++;
  }

  const free = [];
  for (let c = 0; c < nCols; c++) if (pivotOf[c] < 0) free.push(c);

  return free.map((fc) => {
    const v = new Array(nCols).fill(0);
    v[fc] = 1;
    for (let c = 0; c < nCols; c++) {
      if (pivotOf[c] < 0) continue;
      v[c] = -M[pivotOf[c]][fc];
    }
    return v;
  });
}

/**
 * How many independent rows the matrix has.
 *
 * The same elimination as `nullSpace`, counting pivots instead of collecting
 * free columns. Kept separate rather than returned alongside, because the two
 * are wanted in different places and neither reads better carrying the other.
 */
export function rank(A, nCols, tol = 1e-9) {
  const M = A.map((row) => row.slice());
  const rows = M.length;
  let r = 0;
  for (let c = 0; c < nCols && r < rows; c++) {
    let best = r;
    for (let i = r; i < rows; i++) {
      if (Math.abs(M[i][c]) > Math.abs(M[best][c])) best = i;
    }
    if (Math.abs(M[best][c]) < tol) continue;
    [M[r], M[best]] = [M[best], M[r]];
    const p = M[r][c];
    for (let j = c; j < nCols; j++) M[r][j] /= p;
    for (let i = r + 1; i < rows; i++) {
      const f = M[i][c];
      if (f === 0) continue;
      for (let j = c; j < nCols; j++) M[i][j] -= f * M[r][j];
    }
    r++;
  }
  return r;
}

/**
 * Solve a square A x = b by LU with partial pivoting.
 *
 * Returns null rather than throwing when the matrix is singular to `tol`: a
 * singular system here is a statement about the structure -- an assembly that
 * does not hold -- and the caller has something to say about it that this
 * routine does not.
 */
export function luSolve(A, b, tol = 1e-12) {
  const n = A.length;
  if (!n || A.some((row) => row.length !== n) || b.length !== n) return null;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let c = 0; c < n; c++) {
    let best = c;
    for (let i = c; i < n; i++) {
      if (Math.abs(M[i][c]) > Math.abs(M[best][c])) best = i;
    }
    if (Math.abs(M[best][c]) < tol) return null;
    [M[c], M[best]] = [M[best], M[c]];
    for (let i = c + 1; i < n; i++) {
      const f = M[i][c] / M[c][c];
      if (f === 0) continue;
      for (let j = c; j <= n; j++) M[i][j] -= f * M[c][j];
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

/** A x, for a dense A given as rows. */
export function matVec(A, x) {
  return A.map((row) => {
    let s = 0;
    for (let j = 0; j < row.length; j++) s += row[j] * x[j];
    return s;
  });
}

/**
 * How badly x fails to solve A x = b, as a relative infinity norm.
 *
 * Relative, because the only useful question is whether the residual is small
 * COMPARED WITH THE LOAD it is meant to balance. An absolute residual of 1e-9
 * means one thing on an arch weighing 200 kN and quite another on the same arch
 * measured in newtons.
 */
export function residual(A, x, b) {
  const r = matVec(A, x);
  let worst = 0;
  let scale = 0;
  for (let i = 0; i < r.length; i++) {
    worst = Math.max(worst, Math.abs(r[i] - (b?.[i] ?? 0)));
    scale = Math.max(scale, Math.abs(b?.[i] ?? 0));
  }
  return scale > 0 ? worst / scale : worst;
}
