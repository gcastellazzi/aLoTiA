/**
 * The shipped session for Perronet's arch of Saint-Edme at Nogent-sur-Seine.
 *
 *   node tools/reproduce/perronet/make.mjs
 *
 * An example that ships as a 400 kB JSON blob is an example nobody can check,
 * so this is how that one was made, and running it again reproduces it.
 *
 * THE SOURCE. Plate XXVIII of Perronet's `Description des projets et de la
 * construction des ponts de Neuilly, de Mantes, d'Orleans et autres` (Paris,
 * Imprimerie Royale, 1782) draws the same arch twice on one sheet -- on its
 * centering and after decentering, the voussoirs numbered 1 to 47 from the
 * springing to the crown -- and writes 90 pieds across the springings. The
 * drawing therefore carries its own scale: nothing has to be rectified and no
 * scale bar found in the picture. The scan is the one published by Corradi and
 * Filemio, ARCH'04 (CIMNE, Barcelona, 2004); the engraving is public domain.
 *
 * WHAT IS MEASURED AND WHAT IS ASSUMED. `trace.json` holds the pixel trace of
 * the intrados and of the road, both taken off the half drawn AFTER
 * decentering, because that is the arch as it stands; the left half is the
 * bridge on its centering and sits some twelve pixels higher, which is the
 * settlement the plate was drawn to record. The depth of the ring is the one
 * thing the scan resolves, and only at the crown, where the voussoir heads are
 * drawn: 25.5 px, 0.85 m. It is held constant. That is an assumption.
 *
 * WHY TEN VOUSSOIRS AT EACH END ARE NOT IN THE ARCH. Perronet's end arcs stand
 * vertical at the springing, so the bed joint there is horizontal and the ring
 * runs straight into the pier. No line of thrust turns with them: over the
 * whole ring none fits at any thrust, with the spandrel or without it. Ten at
 * each end is where a line first fits, and the number is reported rather than
 * chosen to flatter the result.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');
const core = (n) => import(`file://${join(ROOT, 'docs/app/js/core', n)}`);

const { blocksBetween, weighBlocks, centroidsOf, springings } = await core('trace.js');
const { blockArea } = await core('geometry.js');
const { blocksLike } = await core('blocks.js');
const { serialise, deserialise } = await core('persist.js');
const { collapseRange, bestLineForThrust } = await core('mechanism.js');
const { jointCrossings, jointForces, forcePolygon, freeThrustLine,
  thrustRangeFactor } = await core('statics.js');

const OUT = process.argv[2]
  ?? join(ROOT, 'docs/app/data/examples/Example_8_Perronet_Nogent_sur_Seine.json');

const src = JSON.parse(readFileSync(join(HERE, 'trace.json'), 'utf8'));
const P = src.plate;
const S = (P.spanPieds * P.pied) / (2 * (P.springX - P.crownX));   // m per pixel
const RING = P.ringCrownPx * S;
const N = 94;
const TRIM = 10;
const GAMMA = 20;             // kN/m3, ring and spandrel alike
const WIDTH = 1;              // per metre of bridge width

function loess(xs, ys, x0, h) {
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = Math.abs(xs[i] - x0) / h;
    if (d >= 1) continue;
    const w = (1 - d ** 3) ** 3;
    sw += w; sx += w * xs[i]; sy += w * ys[i];
    sxx += w * xs[i] * xs[i]; sxy += w * xs[i] * ys[i];
  }
  const den = sw * sxx - sx * sx;
  if (Math.abs(den) < 1e-9) return sy / (sw || 1);
  const b = (sw * sxy - sx * sy) / den;
  return (sy - b * sx) / sw + b * x0;
}
const ix = Object.keys(src.intrados).map(Number).sort((a, b) => a - b);
const iy = ix.map((x) => src.intrados[x]);
// The curve turns steep over the last pixels; a wide window would cut the corner.
const smooth = (x) => loess(ix, iy, x, x > P.springX - 30 ? 12 : 30);
const toModel = ([x, y]) => [x * S, (P.height - y) * S];
const half = [];
for (let x = P.crownX; x <= P.springX; x += 2) {
  half.push([x, x === P.crownX ? smooth(P.crownX + 1) : smooth(x)]);
}
half.push([P.springX, P.springY]);
const inner = [
  ...half.slice(1).reverse().map(([x, y]) => toModel([2 * P.crownX - x, y])),
  ...half.map(toModel),
];
const outer = inner.map((p, i) => {
  const a = inner[Math.max(0, i - 1)];
  const b = inner[Math.min(inner.length - 1, i + 1)];
  const tx = b[0] - a[0], ty = b[1] - a[1];
  const L = Math.hypot(tx, ty) || 1;
  return [p[0] - (ty / L) * RING, p[1] + (tx / L) * RING];
});

const road = (() => {
  const xs = Object.keys(src.road).map(Number).sort((a, b) => a - b);
  let n = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
  for (const x of xs) {
    const u = (x - P.crownX) / 100, y = src.road[x];
    n++; s1 += u; s2 += u * u; s3 += u ** 3; s4 += u ** 4;
    t0 += y; t1 += u * y; t2 += u * u * y;
  }
  const A = [[n, s1, s2], [s1, s2, s3], [s2, s3, s4]], b = [t0, t1, t2];
  for (let i = 0; i < 3; i++) {
    const p = A[i][i];
    for (let j = i; j < 3; j++) A[i][j] /= p;
    b[i] /= p;
    for (let k = i + 1; k < 3; k++) {
      const f = A[k][i];
      for (let j = i; j < 3; j++) A[k][j] -= f * A[i][j];
      b[k] -= f * b[i];
    }
  }
  const c = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    c[i] = b[i];
    for (let j = i + 1; j < 3; j++) c[i] -= A[i][j] * c[j];
  }
  return (X) => {
    const u = Math.abs(X / S - P.crownX) / 100;
    return (P.height - (c[0] + c[1] * u + c[2] * u * u)) * S;
  };
})();

const cut = blocksBetween(inner, outer, N, { cutMode: 'normal-midline' });
const blocks = cut.blocks.slice(TRIM, N - TRIM);
const joints = cut.joints.slice(TRIM, N - TRIM + 1);
const weights = weighBlocks(blocks, { specificWeight: GAMMA, thickness: WIDTH });
const centroids = centroidsOf(blocks);
const areas = blocks.map(blockArea);
const { pointA, pointB } = springings(joints);

// The spandrel: one vertical load over each voussoir, standing on its own
// stretch of extrados between the verticals through the two joint heads.
const fp = [];
const fm = [];
for (let i = 0; i + 1 < joints.length; i++) {
  const q0 = joints[i].b, q1 = joints[i + 1].b;
  const x0 = Math.min(q0[0], q1[0]), x1 = Math.max(q0[0], q1[0]);
  if (!(x1 > x0)) continue;
  const ext = (x) => q0[1] + ((q1[1] - q0[1]) * (x - q0[0])) / (q1[0] - q0[0] || 1);
  let a = 0, mx = 0, my = 0;
  const M = 24;
  for (let k = 0; k < M; k++) {
    const x = x0 + ((x1 - x0) * (k + 0.5)) / M;
    const h = road(x) - ext(x);
    if (!(h > 0)) continue;
    const dA = h * ((x1 - x0) / M);
    a += dA; mx += dA * x; my += dA * (ext(x) + h / 2);
  }
  if (!(a > 0)) continue;
  fp.push([mx / a, my / a]); fm.push(a * GAMMA * WIDTH);
}
const forces = { points: fp, magnitudes: fm };
const total = weights.reduce((p, q) => p + q, 0) + fm.reduce((p, q) => p + q, 0);
// THE WHOLE SEQUENCE. With the ends free -- the state this session is saved in
// -- the application carries every block and every load; `betweenEnds` belongs
// to the imposed-ends branch, and analysing the trimmed sequence here would
// save slider positions the interface cannot reproduce.
const seq = blocksLike(
  { centroids, weights, areas, thickness: blocks.map(() => WIDTH) }, forces);
const band = collapseRange(seq, joints);
if (!band) throw new Error('no admissible line: the session would open on a lie');
const chosen = (band.min + band.max) / 2;
const best = bestLineForThrust(seq, joints, chosen, { grid: 31, rounds: 4 });
const basePole = [total / 4, -total / 2];

// THE SLIDERS ARE SAVED WHERE THE LINE IS ADMISSIBLE, and at positions the
// sliders can actually take: the start and the split move in whole percent.
const controls = (() => {
  const mid = (j) => (j.a[0] + j.b[0]) / 2;
  const first = joints[0], last = joints[joints.length - 1];
  const startJoint = mid(last) >= mid(first) ? last : first;
  const endJoint = startJoint === last ? first : last;
  const clearanceOf = (H, sFrac, share) => {
    const lot = freeThrustLine(forcePolygon(seq.weights, [H, -total * share]),
      seq.centroids, startJoint, endJoint, sFrac, seq.actionDirs);
    if (!lot.points || lot.points.length < 2) return -Infinity;
    let c = Infinity;
    for (const x of jointCrossings(lot.points, joints)) {
      if (!x) return -Infinity;
      c = Math.min(c, x.s, 1 - x.s);
    }
    return c;
  };
  let bestSet = null;
  for (let v = 0; v <= 10000; v += 5) {
    const H = basePole[0] * thrustRangeFactor(v / 100, 5);
    if (H < band.min * total * 0.9 || H > band.max * total * 1.1) continue;
    for (let sp = 40; sp <= 60; sp++) {
      for (let st = 0; st <= 100; st++) {
        const c = clearanceOf(H, st / 100, sp / 100);
        if (!bestSet || c > bestSet.c) {
          bestSet = { c, thrust: v / 100, startPos: st, split: sp };
        }
      }
    }
  }
  return bestSet;
})();

// THE BACKGROUND GOES IN UPSIDE DOWN. The renderer lands the source top row on
// the lower edge of the model frame, so `plate.png` is stored flipped, as
// every shipped example's image is.
const png = readFileSync(join(HERE, 'plate.png'));
const imageData = {
  name: 'Example_8_Perronet_Nogent_sur_Seine.png',
  type: 'image/png',
  width: P.width,
  height: P.height,
  dataUrl: `data:image/png;base64,${png.toString('base64')}`,
};

const state = {
  exampleName: imageData.name,
  notes: readFileSync(join(HERE, 'notes.md'), 'utf8'),
  log: [
    'image loaded: plate XXVIII of Perronet, Description des projets (1782)',
    'scale from the engraved dimension: 90 pieds du roi across the springings',
    'intrados traced on the half drawn after decentering, and mirrored',
    `extrados offset ${RING.toFixed(2)} m, the depth measured at the crown`,
    `${N} voussoirs cut on joints normal to the mid-line, as the plate numbers them`,
    `the lowest ${TRIM} at each end left to the abutment: the ring is vertical there`,
    `spandrel added as ${fm.length} vertical loads, one over each voussoir`,
  ],
  imageData,
  system: 'SI',
  trace: null,
  model: {
    name: 'Perronet, arche Saint-Edme, Nogent-sur-Seine (1768)',
    image: imageData.name,
    imageSize: [P.width, P.height],
    imageDrawSize: null,
    groups: [{
      id: 1, name: 'Trace intrados/extrados 1', method: 'trace',
      gamma: GAMMA, thickness: WIDTH, color: '#8ecae6',
    }],
    blockGroups: blocks.map(() => 1),
    stereotomy: { mode: 'normal-midline', courseHeight: 0, meanWidth: 0, requestedWidth: 0 },
    blocks, joints, centroids, weights, areas,
    thickness: blocks.map(() => WIDTH),
    pointA, pointB,
    frame: { coordinates: 'physical', units_per_pixel: S, inferred: false },
  },
  ends: { A: pointA, B: pointB },
  forces,
  basePole,
  dome: { poleni: false, angleDeg: 15, axisX: (pointA[0] + pointB[0]) / 2 },
};

writeFileSync(OUT, `${JSON.stringify(serialise(state, controls, imageData.name))}\n`);
const back = deserialise(readFileSync(OUT, 'utf8'));
const mu = jointForces(best.fp, best.crossings, joints);
console.log(`${back.model.blocks.length} voussoirs of ${N}, ${back.forces.magnitudes.length} loads, `
  + `${total.toFixed(0)} kN/m in all`);
console.log(`band ${band.min.toFixed(3)}..${band.max.toFixed(3)} W, friction ${mu.muReq.toFixed(2)}, `
  + `saved at thrust ${controls.thrust} / start ${controls.startPos} / split ${controls.split}, `
  + `clearance ${controls.c.toFixed(3)}`);
console.log(`wrote ${OUT}`);
