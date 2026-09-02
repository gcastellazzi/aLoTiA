/**
 * The data behind the computed figures of the SoftwareX paper.
 *
 *     node paper/figures/makedata.js
 *
 * Every number plotted in the paper is produced HERE, by the same modules the
 * application runs, so that a figure cannot drift away from the software it
 * describes. Nothing is drawn by hand and nothing is transcribed.
 *
 * Writes into paper/figures/data/:
 *   ring_intrados.dat, ring_extrados.dat   the reference semicircular ring
 *   lot_*.dat                              a family of thrust lines on it
 *   band_pinned.dat, band_free.dat         admissible thrust against t/ri
 *   minthick.dat                           least admissible t/ri against n
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * WHERE THE SOFTWARE LIVES.
 *
 * The manuscript no longer sits inside the repository, so the modules it
 * generates its figures from have to be found rather than reached by a
 * relative path. Set ALOT_REPO to point somewhere else:
 *
 *     ALOT_REPO=~/src/aLOTofImaginArches node figures/makedata.js
 *
 * The imports below are dynamic for that reason -- a static import cannot
 * take a path decided at run time.
 */
import { existsSync } from 'node:fs';

// In this repository the software sits two directories up; the manuscript
// keeps its own copy pointed elsewhere, so ALOT_REPO still overrides.
const REPO = process.env.ALOT_REPO
  ?? fileURLToPath(new URL('../..', import.meta.url));

if (!existsSync(join(REPO, 'docs/app/js/core/statics.js'))) {
  throw new Error(
    `cannot find the aLOTofImaginArches source under ${REPO}. `
    + 'Set ALOT_REPO to the repository root.',
  );
}

/** One module of the application's core. */
const core = (name) => import(
  new URL(`docs/app/js/core/${name}`, `file://${REPO}/`).href
);

const { centroid } = await core('geometry.js');
const { blocksBetween, weighBlocks } = await core('trace.js');
const { forcePolygon, funicular, freeThrustLine, jointCrossings, pointOnJoint, } = await core('statics.js');
const { collapseRange } = await core('mechanism.js');
const { circularRing } = await core('blocks.js');

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'data');
mkdirSync(OUT, { recursive: true });

const write = (name, header, rows) => {
  const text = `${header}\n${rows.map((r) => r.join(' ')).join('\n')}\n`;
  writeFileSync(join(OUT, name), text);
  return `${name} (${rows.length} rows)`;
};

/** A semicircular arc of radius r, from springing to springing. */
const arc = (r, n = 300) => Array.from({ length: n }, (_, i) => {
  const t = (Math.PI * i) / (n - 1);
  return [-r * Math.cos(t), r * Math.sin(t)];
});

/** A ring, weighed and ordered exactly as the application orders it. */
function ring(ri, ro, n) {
  // THE RING THE APPLICATION BUILDS, not one traced over it. `blocksBetween`
  // resamples two arcs by arc length, which is what a student's traced curve
  // gives and is very slightly not a circle; `circularRing` is the Circular
  // ring panel's own function, built from the angles. The figures are meant to
  // be checkable in that panel, and against the traced ring the band came out
  // 7e-4 different -- small, but the difference between "reproduces" and
  // "nearly reproduces".
  const { blocks, joints } = circularRing({
    centre: [0, 0], innerRadius: ri, outerRadius: ro,
    startAngle: 0, endAngle: 180, count: n,
  });
  const weights = weighBlocks(blocks, { specificWeight: 20, thickness: 1 });
  const centroids = blocks.map(centroid);
  const order = centroids
    .map((c, i) => [c[0], i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  const w = order.map((i) => weights[i]);
  const g = order.map((i) => centroids[i]);
  // BY POSITION, NOT BY INDEX. The construction walks from the right-hand
  // springing to the left, taking blocks in order of descending centroid x, so
  // the ends must be chosen by where they are. Taken by index they came out
  // swapped the moment the ring stopped being built by tracing two arcs, and
  // no admissible line could be found on a ring that plainly has one.
  const midX = (j) => (j.a[0] + j.b[0]) / 2;
  const first = joints[0];
  const last = joints[joints.length - 1];
  const [startJoint, endJoint] = midX(first) >= midX(last)
    ? [first, last] : [last, first];
  return {
    blocks, joints, w, g,
    total: w.reduce((s, v) => s + v, 0),
    startJoint,
    endJoint,
  };
}

/** One thrust line, and whether it is admissible. */
function line(r, f, s, split) {
  const fp = forcePolygon(r.w, [r.total * f, -r.total * split]);
  const lot = freeThrustLine(fp, r.g, r.startJoint, r.endJoint, s);
  const cr = jointCrossings(lot.points, r.joints);
  return {
    lot,
    admissible: lot.closed && cr.every((c) => c && c.inside),
  };
}

const log = [];

// ---------------------------------------------------------------- the ring --
// t/ri = 0.15, the ring the pinned construction rejected outright.
const RI = 1;
const RO = 1.15;
const N = 16;
const r = ring(RI, RO, N);

log.push(write('ring_intrados.dat', 'x y',
  arc(RI, 200).map(([x, y]) => [x.toFixed(6), y.toFixed(6)])));
log.push(write('ring_extrados.dat', 'x y',
  arc(RO, 200).map(([x, y]) => [x.toFixed(6), y.toFixed(6)])));
log.push(write('ring_joints.dat', 'x y',
  r.joints.flatMap((j) => [
    [j.a[0].toFixed(6), j.a[1].toFixed(6)],
    [j.b[0].toFixed(6), j.b[1].toFixed(6)],
    ['nan', 'nan'],                        // pgfplots breaks the line here
  ])));

// ------------------------------------------------- a family of thrust lines --
// Three states of the SAME arch, chosen to make one point: the ring is thin
// enough that the equilibrium state has to be hunted for, and pinning the ends
// puts it out of reach.
//
// The admissible one is SEARCHED FOR rather than written down, so the figure
// cannot claim an admissibility the code does not deliver.
const lin0 = (a, b, m) => Array.from({ length: m }, (_, i) => a + ((b - a) * i) / (m - 1));

function findAdmissible(rr) {
  let best = null;
  for (const f of lin0(0.05, 0.6, 111)) {
    for (const s of lin0(0, 1, 41)) {
      for (const sp of lin0(0.3, 0.7, 41)) {
        const got = line(rr, f, s, sp);
        if (!got.admissible) continue;
        // Keep the one with the most room to spare: the clearest to look at.
        const cr = jointCrossings(got.lot.points, rr.joints);
        const margin = Math.min(...cr.map((c) => Math.min(c.s, 1 - c.s)));
        if (!best || margin > best.margin) best = { f, s, sp, margin };
      }
    }
  }
  return best;
}

const found = findAdmissible(r);
if (!found) throw new Error('no admissible line on the reference ring');
log.push(`   admissible state found: H/W = ${found.f.toFixed(3)}, `
  + `s = ${found.s.toFixed(3)}, reaction = ${found.sp.toFixed(3)}, `
  + `margin = ${(100 * found.margin).toFixed(1)}% of a joint`);

const family = [
  // The symmetric line through the joint mid-points at the same thrust: this
  // is all the pinned construction could ever offer, and it does not fit.
  ['mid', found.f, 0.5, 0.5],
  ['free', found.f, found.s, found.sp],
  // And a flatter one, to show the other side of the band.
  ['flat', Math.min(0.6, found.f * 1.8), found.s, found.sp],
];

for (const [tag, f, s, split] of family) {
  const { lot, admissible } = line(r, f, s, split);
  // NO '#' anywhere in a header: pgfplots reads these files with TeX, for
  // which '#' is the macro parameter character, and the build dies with
  // "Illegal parameter number" pointing at the \addplot rather than the data.
  // The parameters of each line go in the log and in the caption instead.
  log.push(write(`lot_${tag}.dat`, 'x y',
    lot.points.map(([x, y]) => [x.toFixed(6), y.toFixed(6)])));
  log.push(`   -> lot_${tag}: H/W = ${f.toFixed(3)}, s = ${s.toFixed(3)}, `
    + `admissible = ${admissible}`);
}

// -------------------------------------------- the admissible thrust band --
// For each thickness, the least and greatest thrust that admits SOME line,
// with the ends pinned at the joint mid-points and with the ends free.
const lin = (a, b, m) => Array.from({ length: m }, (_, i) => a + ((b - a) * i) / (m - 1));

function band(tri, freeEnds) {
  const rr = ring(RI, RI * (1 + tri), N);

  // THE FREE FAMILY IS THE APPLICATION'S OWN ANSWER. This used to be a grid --
  // 111 thrusts by 21 starts by 37 splits -- which is a second implementation
  // of the physics the application already implements, and it disagreed with
  // it: the grid quantises the thrust to its step of 0.005, records the last
  // sample that fits, and so UNDERSTATES the band at both ends. At t/ri = 0.12
  // it reported a band of width zero where the application finds 0.008. A
  // figure that a reader cannot reproduce with the tool the paper describes is
  // worse than no figure, so the figure now calls `collapseRange`.
  if (freeEnds) {
    const seq = {
      centroids: rr.g,
      weights: rr.w,
      areas: rr.g.map(() => 0),
      thickness: rr.g.map(() => 0),
    };
    const b = collapseRange(seq, rr.joints);
    return b ? [b.min, b.max] : null;
  }

  // THE PINNED FAMILY has no counterpart in the application -- it is the
  // superseded construction, kept because the comparison is the point of the
  // figure -- so it is bisected here, by the same scheme `collapseRange` uses,
  // rather than scanned. One parameter: both ends sit at the joint mid-points.
  const fits = (f) => {
    const fp = forcePolygon(rr.w, [rr.total * f, -rr.total / 2]);
    const lot = funicular(fp, rr.g,
      pointOnJoint(rr.startJoint, 0.5), pointOnJoint(rr.endJoint, 0.5));
    return jointCrossings(lot.points, rr.joints).every((c) => c && c.inside);
  };
  let seed = null;
  for (let i = 0; i <= 60; i++) {
    const f = 0.02 + ((1.2 - 0.02) * i) / 60;
    if (fits(f)) { seed = f; break; }
  }
  if (seed === null) return null;
  const edge = (from, towards) => {
    let good = from;
    let bad = towards;
    for (let i = 0; i < 18; i++) {
      const m = (good + bad) / 2;
      if (fits(m)) good = m; else bad = m;
    }
    return good;
  };
  return [edge(seed, 0.02), edge(seed, 1.2)];
}

for (const [name, freeEnds] of [['band_pinned.dat', false], ['band_free.dat', true]]) {
  const rows = [];
  for (const tri of lin(0.08, 0.6, 27)) {
    const b = band(tri, freeEnds);
    if (b) rows.push([tri.toFixed(4), b[0].toFixed(4), b[1].toFixed(4)]);
  }
  log.push(write(name, 'tri Hmin Hmax', rows));
}

// ------------------------------------- least admissible thickness against n --
function minimumThickness(n, freeEnds) {
  let lo = 0.02;
  let hi = 0.9;
  for (let i = 0; i < 13; i++) {
    const m = (lo + hi) / 2;
    const rr = ring(RI, RI * (1 + m), n);
    const starts = freeEnds ? lin(0, 1, 21) : [0.5];
    const splits = freeEnds ? lin(0.05, 0.95, 37) : [0.5];
    let fits = false;
    outer:
    for (const f of lin(0.05, 0.6, 111)) {
      for (const s of starts) {
        for (const sp of splits) {
          if (freeEnds) {
            if (line(rr, f, s, sp).admissible) { fits = true; break outer; }
          } else {
            const fp = forcePolygon(rr.w, [rr.total * f, -rr.total / 2]);
            const lot = funicular(fp, rr.g,
              pointOnJoint(rr.startJoint, 0.5), pointOnJoint(rr.endJoint, 0.5));
            if (jointCrossings(lot.points, rr.joints).every((c) => c && c.inside)) {
              fits = true; break outer;
            }
          }
        }
      }
    }
    if (fits) hi = m; else lo = m;
  }
  return hi;
}

const rows = [];
for (const n of [8, 12, 16, 24, 32, 48, 64]) {
  rows.push([n, minimumThickness(n, false).toFixed(4),
    minimumThickness(n, true).toFixed(4)]);
}
log.push(write('minthick.dat', 'n pinned free', rows));

// The same numbers as a LaTeX table body, so the paper neither transcribes
// them nor depends on pgfplotstable to read the .dat back.
// The WHOLE tabular, not just its rows. An \\input that lands inside a
// tabular is fragile -- the row the file ends on has to be terminated exactly
// right -- so the generated file carries its own \\begin and \\end and the
// paper inputs it in the table environment instead.
writeFileSync(join(OUT, 'minthick_table.tex'), [
  '% Generated by paper/figures/makedata.js -- do not edit.',
  '\\begin{tabular}{@{}rcc@{}}',
  '\\toprule',
  '$n$ & ends pinned & ends free \\\\',
  '\\midrule',
  ...rows.map(([n, p, f]) => `${n} & ${p} & ${f} \\\\`),
  '\\bottomrule',
  '\\end{tabular}',
  '',
].join('\n'));
log.push('minthick_table.tex');


// ------------------------------------------------ the collapse mechanism --
// The five-hinge minimum-thrust mechanism of a semicircular ring, displaced.
// Generated rather than drawn, so the figure cannot claim a motion the code
// does not produce -- including that every joint OPENS.
const { bestLineForThrust, analyse, displacedConfiguration, displaced: displacedBlocks, transformPoint, } = await core('mechanism.js');

{
  const RI2 = 1;
  const TRI = 0.18;
  const N2 = 16;
  const rr = ring(RI2, RI2 * (1 + TRI), N2);
  const { blocks, joints } = blocksBetween(arc(RI2), arc(RI2 * (1 + TRI)), N2);
  // The mechanism module takes the sorted weights and centroids, which the
  // local `ring` helper calls w and g.
  const seq = { weights: rr.w, centroids: rr.g };

  const band = collapseRange(seq, joints);
  const best = bestLineForThrust(seq, joints, band.min);
  const a = analyse(best.crossings, joints, blocks.length);
  // Large enough that the mechanism is unmistakable on the page; the joints
  // still close to a few parts in ten thousand of the span.
  const T = displacedConfiguration(a.hinges, a.bodies, 0.24);
  const moved = displacedBlocks(blocks, a.bodyOf, T);

  const path = (polys) => polys.flatMap((p) => [
    ...p.x.map((x, i) => [x.toFixed(6), p.y[i].toFixed(6)]),
    [p.x[0].toFixed(6), p.y[0].toFixed(6)],
    ['nan', 'nan'],
  ]);
  log.push(write('mech_rest.dat', 'x y', path(blocks)));
  log.push(write('mech_moved.dat', 'x y', path(moved)));
  log.push(write('mech_hinges.dat', 'x y',
    a.hinges.map((h) => [h.point[0].toFixed(6), h.point[1].toFixed(6)])));

  // Every joint must come apart, and by how much goes in the caption.
  const gaps = [];
  for (let k = 1; k + 1 < a.hinges.length; k++) {
    const h = a.hinges[k];
    const L = transformPoint(T[k - 1], h.opposite);
    const R = transformPoint(T[k], h.opposite);
    gaps.push((R[0] - L[0]) * h.along[0] + (R[1] - L[1]) * h.along[1]);
  }
  writeFileSync(join(OUT, 'mech_meta.tex'), [
    `\\def\\mechHinges{${a.hingeCount}}`,
    `\\def\\mechBodies{${a.bodyCount}}`,
    `\\def\\mechDof{${a.dof}}`,
    `\\def\\mechThrust{${band.min.toFixed(3)}}`,
    `\\def\\mechPattern{${a.hinges.map((h) => (h.support ? 'S' : h.face[0])).join('')}}`,
    '',
  ].join('\n'));
  log.push(`   mechanism: ${a.hingeCount} hinges, dof ${a.dof}, `
    + `openings ${gaps.map((v) => v.toFixed(3)).join(' ')}`);
}

// The summary goes LAST, or the sections written after it are silent -- as
// the mechanism block was, while its caption claimed the joints all open.
console.log(log.join('\n'));
console.log('\nleast admissible t/ri (Heyman, continuous ring: 0.108)');
rows.forEach(([n, p, f]) => console.log(`  n = ${String(n).padStart(2)}   pinned ${p}   free ${f}`));
