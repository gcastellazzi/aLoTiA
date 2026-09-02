/**
 * The stored-example figure of the SoftwareX paper, as data.
 *
 *     node paper/figures/makeexample.js
 *
 * Draws nothing: it emits the blocks, the thrust line and the force polygon of
 * one stored example, plus the extent of the plate they were traced over, so
 * that the paper can draw them as VECTOR graphics over the photograph. A
 * screenshot of the canvas would have been easier and worse -- it would carry
 * the browser's rasterisation into print, and it could drift away from the
 * software the moment the renderer changed.
 *
 * The example is Poleni's own plate of 1748 for the dome of St Peter's, which
 * is where the method in this software comes from.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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

const { fromExample, poleOf, consistency } = await core('model.js');
const { forcePolygon, funicular, poleFromForcePolygon, hookeCable, } = await core('statics.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'data');
// The MATLAB corpus is a test fixture now: what the application ships are
// sessions, and the figure of Poleni's dome in the paper is computed from
// the file MATLAB wrote, which is where the stored solution it is checked
// against lives. See tests/fixtures/matlab.
const EXAMPLES = join(REPO, 'tests/fixtures/matlab');
mkdirSync(OUT, { recursive: true });

const NAME = process.argv[2] ?? 'Poleni_Example_01';

const write = (name, header, rows) => {
  writeFileSync(join(OUT, name), `${header}\n${rows.map((r) => r.join(' ')).join('\n')}\n`);
  return `${name} (${rows.length} rows)`;
};

const raw = JSON.parse(readFileSync(join(EXAMPLES, `${NAME}.json`), 'utf8'));
const m = fromExample(raw);
const c = consistency(m);
if (!c.ok) throw new Error(`${NAME} is not reproducible: ${c.reason}`);

// Recompute the whole solution from the geometry, exactly as the app does.
const pole = poleOf(m, poleFromForcePolygon).pole;
const fp = forcePolygon(m.weights, pole);
const lot = funicular(fp, m.centroids, m.pointB, m.pointA);

// How far the recomputed solution is from the one MATLAB saved. This number
// goes in the caption, so the figure states its own fidelity.
let err = 0;
let scale = 0;
m.thrustLine.forEach((p, i) => {
  for (let k = 0; k < 2; k++) {
    err = Math.max(err, Math.abs(p[k] - lot.points[i][k]));
    scale = Math.max(scale, Math.abs(p[k]));
  }
});

const log = [];

// Blocks, as one closed path each, separated by a blank line so that pgfplots
// starts a new patch rather than joining them.
const blockRows = [];
for (const p of m.blocks) {
  for (let i = 0; i < p.x.length; i++) {
    blockRows.push([p.x[i].toFixed(3), p.y[i].toFixed(3)]);
  }
  blockRows.push([p.x[0].toFixed(3), p.y[0].toFixed(3)]);   // close it
  blockRows.push(['nan', 'nan']);
}
log.push(write(`${NAME}_blocks.dat`, 'x y', blockRows));

log.push(write(`${NAME}_lot.dat`, 'x y',
  lot.points.map(([x, y]) => [x.toFixed(3), y.toFixed(3)])));
log.push(write(`${NAME}_cable.dat`, 'x y',
  hookeCable(lot.points).map(([x, y]) => [x.toFixed(3), y.toFixed(3)])));
log.push(write(`${NAME}_centroids.dat`, 'x y',
  m.centroids.map(([x, y]) => [x.toFixed(3), y.toFixed(3)])));

// The force polygon: the load line, and one ray to every division of it.
const stations = fp.stations;
log.push(write(`${NAME}_loadline.dat`, 'x y',
  stations.map((y) => ['0', y.toFixed(3)])));
log.push(write(`${NAME}_rays.dat`, 'x y',
  stations.flatMap((y) => [
    [pole[0].toFixed(3), pole[1].toFixed(3)],
    ['0', y.toFixed(3)],
    ['nan', 'nan'],
  ])));

const size = m.imageSize ?? [null, null];
writeFileSync(join(OUT, `${NAME}_meta.tex`), [
  `\\def\\exName{${NAME.replace(/_/g, '\\_')}}`,
  `\\def\\exBlocks{${m.blocks.length}}`,
  `\\def\\exImage{${m.image ?? ''}}`,
  `\\def\\exImgW{${size[0] ?? 0}}`,
  `\\def\\exImgH{${size[1] ?? 0}}`,
  `\\def\\exThrust{${fp.thrust.toPrecision(4)}}`,
  `\\def\\exPoleX{${pole[0].toFixed(3)}}`,
  `\\def\\exPoleY{${pole[1].toFixed(3)}}`,
  `\\def\\exRelErr{${(err / scale).toExponential(1)}}`,
  '',
].join('\n'));

console.log(log.join('\n'));
console.log(`\n${NAME}: ${m.blocks.length} blocks, image ${m.image} `
  + `${size[0]}x${size[1]}, thrust ${fp.thrust.toPrecision(4)}`);
console.log(`recomputed against the stored solution: relative error `
  + `${(err / scale).toExponential(2)}`);
