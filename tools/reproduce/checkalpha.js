/**
 * Independent static audit of the semicircular-ring activation multiplier.
 * Run: node tools/reproduce/checkalpha.js [--graphical]
 *
 * Four static unknowns: right reaction Rx, Ry, its moment about the origin M,
 * and alpha. Forces are normalised by total weight. At joint j, equilibrium
 * of voussoirs [0,j) gives the moment about p=(x,y):
 *
 *   m_j(p) = M - x Ry + y Rx - SX + x SW + alpha (y SW - SY).
 *
 * SW, SX, SY sum W, W*x, W*y before that joint. For this right-to-left ring,
 * no tension means m_j(a)>=0 and m_j(b)<=0. Together these also enforce
 * nonnegative normal compression. Shear is unrestricted (no sliding).
 *
 * Maximise alpha by enumerating every vertex of this four-variable linear
 * programme. No kinematic hinges, funicular intersections, grid, or external
 * solver enter this calculation. This small reference solver is for the audit,
 * not a replacement for the application's interactive search.
 */
import assert from 'node:assert/strict';
import { circularRingCase } from '../../docs/app/js/core/study.js';
import { minimumMultiplier, multiplierInput } from '../../docs/app/js/core/multiplier.js';
import { collapseRange } from '../../docs/app/js/core/mechanism.js';
import { forcePolygon, freeThrustLine, jointCrossings } from '../../docs/app/js/core/statics.js';

function solve(rows) {
  const a = rows.map(({ c, b }) => [...c, b]);
  for (let k = 0; k < 4; k++) {
    let p = k;
    for (let i = k + 1; i < 4; i++) if (Math.abs(a[i][k]) > Math.abs(a[p][k])) p = i;
    if (Math.abs(a[p][k]) < 1e-11) return null;
    [a[k], a[p]] = [a[p], a[k]];
    const d = a[k][k];
    for (let j = k; j <= 4; j++) a[k][j] /= d;
    for (let i = 0; i < 4; i++) {
      if (i === k) continue;
      const f = a[i][k];
      for (let j = k; j <= 4; j++) a[i][j] -= f * a[k][j];
    }
  }
  return a.map(row => row[4]);
}

const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

function constraints(r) {
  const rows = [];
  let sw = 0; let sx = 0; let sy = 0;
  r.joints.forEach((joint, j) => {
    for (const [face, sign] of [['a', -1], ['b', 1]]) {
      const [x, y] = joint[face];
      rows.push({ c: [y, -x, 1, y * sw - sy].map(v => v * sign), b: sign * (sx - x * sw) });
    }
    if (j < r.weights.length) {
      const w = r.weights[j] / r.totalWeight;
      sw += w; sx += w * r.centroids[j][0]; sy += w * r.centroids[j][1];
    }
  });
  return rows;
}

function staticMaximum(rows) {
  let best = null;
  for (let i = 0; i < rows.length - 3; i++) {
    for (let j = i + 1; j < rows.length - 2; j++) {
      for (let k = j + 1; k < rows.length - 1; k++) {
        for (let l = k + 1; l < rows.length; l++) {
          const x = solve([rows[i], rows[j], rows[k], rows[l]]);
          if (!x || x[3] < 0 || (best && x[3] <= best[3])) continue;
          if (rows.every(row => dot(row.c, x) <= row.b + 1e-10)) best = x;
        }
      }
    }
  }
  assert.ok(best, 'a feasible static vertex exists');
  return best;
}

function graphicalLimit(r, kin) {
  let lo = 0; let hi = kin * 1.02;
  for (let i = 0; i < 14; i++) {
    const alpha = (lo + hi) / 2;
    const seq = {
      centroids: r.centroids,
      weights: r.weights.map(w => [alpha * w, w]),
      actionDirs: r.weights.map(w => [alpha * w, -w]),
    };
    if (collapseRange(seq, r.joints)) lo = alpha; else hi = alpha;
  }
  return lo;
}

const graphical = process.argv.includes('--graphical');
console.log('n t/ri alpha_kin alpha_stat_equilibrium absolute_gap'
  + (graphical ? ' alpha_graphical gap_percent_of_kin' : ''));
for (const [n, tri] of [[8, .3], [12, .3], [16, .3], [24, .3], [32, .3], [16, .2], [16, .5]]) {
  const r = circularRingCase({ ri: 1, n, tri });
  const rows = constraints(r);
  const x = staticMaximum(rows);
  const kin = minimumMultiplier(multiplierInput(r)).plus.alpha;
  const gap = Math.abs(kin - x[3]);
  assert.ok(gap < 1e-9, `static/kinematic mismatch: ${gap}`);
  let line = `${n} ${tri.toFixed(2)} ${kin.toFixed(12)} ${x[3].toFixed(12)} ${gap.toExponential(2)}`;
  if (graphical) {
    const old = graphicalLimit(r, kin);
    line += ` ${old.toFixed(8)} ${(100 * (kin - old) / kin).toFixed(3)}`;
  }
  console.log(line);

  if (n === 16 && tri === .3) {
    // Give the existing graphical checker the EXACT equilibrium solution.
    const [rx, ry, m, alpha] = x;
    const s = (m / ry - 1) / tri; // starting joint is horizontal at y=0
    const fp = forcePolygon(r.weights.map(w => [alpha * w, w]),
      [-rx * r.totalWeight, -ry * r.totalWeight]);
    const lot = freeThrustLine(fp, r.centroids, r.joints[0], r.joints.at(-1), s,
      r.weights.map(w => [alpha * w, -w]));
    const crossings = jointCrossings(lot.points, r.joints);
    console.log('  exact static certificate [Rx/W, Ry/W, M/W, alpha]:', JSON.stringify(x));
    console.log('  geometric false rejections:', JSON.stringify(crossings.flatMap((c, j) =>
      !c || c.s < -1e-9 || c.s > 1 + 1e-9 ? [{ joint: j, s: c?.s, segment: c?.segment }] : [])));

    // Reflect the limiting equilibrium and interpolate the two certificates.
    // Convexity then supplies a feasible certificate specifically at alpha=.41.
    const sy = r.weights.reduce((sum, w, j) => sum + w * r.centroids[j][1], 0) / r.totalWeight;
    const reflected = [rx + alpha, 1 - ry, m - alpha * sy, -alpha];
    assert.ok(rows.every(row => dot(row.c, reflected) <= row.b + 1e-10));
    const t = (.41 / alpha + 1) / 2;
    const witness = x.map((v, i) => t * v + (1 - t) * reflected[i]);
    assert.ok(rows.every(row => dot(row.c, witness) <= row.b + 1e-10));
    console.log('  feasible alpha=.41 certificate:', JSON.stringify(witness));
  }
}
