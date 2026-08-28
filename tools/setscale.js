/**
 * Give a stored example a real size, and say where the size came from.
 *
 *   node tools/setscale.js <example> --span 88 --source "NPS: 290 ft"
 *   node tools/setscale.js <example> --clear
 *   node tools/setscale.js --list
 *
 * The .mat files hold pixel coordinates and no statement of what the picture
 * measures, so an arch of a real building comes up labelled in pixels. This
 * writes the missing sentence into the JSON as `_scale`: how many units one
 * pixel is worth, in which system, and where the dimension comes from.
 *
 * `--source` IS REQUIRED and the loader refuses a scale without one. A number
 * with no provenance in a published dataset is indistinguishable from a guess,
 * and a reader comparing the span of a real building against the literature
 * deserves to know which they are looking at. For a textbook figure that has
 * no true size, say so: `--source nominal`.
 *
 * The span is measured across the JOINTS where they can be recovered, and
 * across the blocks otherwise, which is the same number the application
 * reports. Nothing else in the file is touched: the coordinates and the stored
 * MATLAB solution are left exactly as they are, and the scaling is applied on
 * loading, so the audit against the original still holds.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fromExample } from '../docs/app/js/core/model.js';
import { archDimensions } from '../docs/app/js/core/units.js';

const DIR = fileURLToPath(new URL('../docs/app/data/examples/', import.meta.url));

/** The span of an example as it stands in the file, before any scaling. */
function rawSpan(file) {
  const json = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  const saved = json.data._scale;
  delete json.data._scale;                     // measure the file, not the scale
  const m = fromExample(json);
  json.data._scale = saved;
  if (m.joints) {
    const d = archDimensions(m.joints);
    if (d && d.span > 0) return { span: d.span, from: 'the joints' };
  }
  const xs = m.blocks.flatMap((b) => b.x);
  return { span: Math.max(...xs) - Math.min(...xs), from: 'the blocks' };
}

function list() {
  const files = fs.readdirSync(DIR)
    .filter((f) => f.endsWith('.json') && f !== 'index.json').sort();
  console.log('example'.padEnd(36), 'span in file'.padStart(13), '  scale');
  for (const f of files) {
    const json = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    const s = json.data._scale;
    const { span } = rawSpan(f);
    const note = s
      ? `${s.units_per_pixel.toPrecision(4)} ${s.system ?? '?'}/px — ${s.source}`
      : json.data._frame?.coordinates === 'physical'
        ? 'already physical'
        : '— none, stays in pixels';
    console.log(f.replace('.json', '').padEnd(36), span.toPrecision(6).padStart(13), '  ' + note);
  }
}

function usage(msg) {
  if (msg) console.error(`\n  ${msg}\n`);
  console.error(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')
    .split('*/')[0].split('\n').slice(1, 10).map((l) => l.replace(/^ \*ary?/, ' ')).join('\n'));
  process.exit(msg ? 1 : 0);
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes('--help')) usage();
if (argv[0] === '--list') { list(); process.exit(0); }

const name = argv[0].replace(/\.json$/, '');
const file = `${name}.json`;
if (!fs.existsSync(path.join(DIR, file))) usage(`no such example: ${name}`);

const arg = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
};

const json = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));

if (argv.includes('--clear')) {
  delete json.data._scale;
  fs.writeFileSync(path.join(DIR, file), `${JSON.stringify(json, null, 1)}\n`);
  console.log(`${name}: scale removed, back to pixels`);
  process.exit(0);
}

const span = Number(arg('--span'));
const source = arg('--source');
const system = arg('--system') ?? 'SI';
if (!(span > 0)) usage('--span must be a positive number');
if (!source) usage('--source is required: say where the dimension comes from');
if (json.data._frame?.coordinates === 'physical') {
  usage(`${name} is already in physical units; there is nothing to scale`);
}

const { span: pixels, from } = rawSpan(file);
const k = span / pixels;

json.data._scale = {
  units_per_pixel: Number(k.toPrecision(10)),
  system,
  source,
  declared_span: span,
};
fs.writeFileSync(path.join(DIR, file), `${JSON.stringify(json, null, 1)}\n`);

console.log(`${name}`);
console.log(`  span in the file   ${pixels.toPrecision(6)}  (measured across ${from})`);
console.log(`  declared span      ${span} ${system}`);
console.log(`  units per pixel    ${k.toPrecision(6)}`);
console.log(`  source             ${source}`);
