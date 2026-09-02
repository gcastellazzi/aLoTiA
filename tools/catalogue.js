/**
 * Write the example catalogue the application loads first.
 *
 *   node tools/catalogue.js
 *
 * WHY A SCRIPT AND NOT A HAND-WRITTEN FILE. Every fact in the catalogue except
 * one is already in the example itself -- how many blocks, which unit system,
 * whether the coordinates are physical, whether the image is embedded -- and a
 * hand-kept copy of a derivable fact goes stale the first time an example is
 * re-saved. The one thing that cannot be derived is what an example is FOR, so
 * that sentence lives in the table below, keyed by file name, and everything
 * else is read off the file.
 *
 * An example with no entry in the table is still catalogued; it simply has no
 * sentence, which is a nudge to write one rather than a reason to fail.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('../docs/app/data/examples/', import.meta.url));

/**
 * What each example is for, and the order the menu offers them in.
 *
 * The order is the teaching order, not the alphabet: the laboratory arch that
 * introduces the construction, then the two collapse states it is bounded by,
 * then the ways of building geometry, and last the two assemblies that are not
 * a chain at all and say so.
 */
const ABOUT = [
  ['example_1_circular_arch.json',
    'A laboratory arch traced over its photograph with the three-point tool, '
    + 'in kg-cm, carrying one applied load.'],
  ['example_1_circular_arch_minimum_thrust.json',
    'The same arch at its least thrust: the line rides the extrados at the '
    + 'haunches and the intrados at the crown.'],
  ['example_1_circular_arch_maximum_thrust.json',
    'And at its greatest, where the pattern inverts. The two together are the '
    + 'admissible band, drawn.'],
  ['Example_2_Heyman_arch.json',
    'Seven voussoirs drawn corner by corner over a figure, with both ends of '
    + 'the line imposed at the springings.'],
  ['Example_3_Delicate_arch_sunset.json',
    'Delicate Arch, Utah: eight blocks drawn over a photograph. A natural arch '
    + 'stands by the same theorem a built one does.'],
  ['Example_4_Landscape_Arch_Utah.json',
    'Landscape Arch, the longest natural span in the world, traced intrados '
    + 'and extrados into fifty voussoirs. Carries its own notes.'],
  ['Example_6_Arc_boutant_Notre_Dame_de_Paris.json',
    'A flying buttress cut from a traced outline, with blocks added by hand. '
    + 'Not one chain, and the panel says which pair does not touch.'],
  ['example_5_flying_arch.json',
    'A flyer with its pier and pinnacle: three free ends, so no ordering of it '
    + 'is a chain. What branches off loads the arch rather than belonging to it.'],
  // Poleni's dome is being re-made as a session and will take its place here.
  // The MATLAB one it replaces is now a test fixture; see tests/fixtures/matlab.
];

/** A title a menu can show, from a file name nobody chose for a menu. */
function titleOf(file) {
  return file
    .replace(/\.json$/, '')
    .replace(/^example_/i, 'Example ')
    .replace(/^Example_/, 'Example ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Everything derivable, from either of the two formats a file may be in. */
function describe(file) {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  const bytes = fs.statSync(path.join(DIR, file)).size;

  if (raw.format === 'aLOTofImaginArches/state') {
    const m = raw.model ?? {};
    return {
      file,
      name: titleOf(file),
      format: 'session',
      blocks: (m.blocks ?? []).length,
      joints: m.joints ? m.joints.length : null,
      groups: (m.groups ?? []).map((g) => g.method),
      units: raw.system ?? null,
      frame: m.frame?.coordinates ?? 'pixels',
      image: raw.image ? 'embedded' : (raw.imageName ?? null),
      loads: (raw.forces?.points ?? []).length,
      kB: Math.round(bytes / 1024),
    };
  }

  // The MATLAB generation: the fields it is read through are different, and
  // `fromExample` is what turns them into a model.
  const d = raw.data ?? raw;
  return {
    file,
    name: titleOf(file),
    format: 'matlab',
    blocks: (d.Blocks_coordinates_4_points ?? []).length,
    joints: null,
    groups: [],
    units: d.UNISYS ?? null,
    frame: d._frame?.coordinates ?? 'pixels',
    image: d.ImageFileName ?? null,
    loads: 0,
    kB: Math.round(bytes / 1024),
  };
}

const present = fs.readdirSync(DIR)
  .filter((f) => f.endsWith('.json') && f !== 'index.json');

const known = ABOUT.map(([f]) => f);
const ordered = [
  ...known.filter((f) => present.includes(f)),
  ...present.filter((f) => !known.includes(f)).sort(),
];

const examples = ordered.map((f) => {
  const about = ABOUT.find(([name]) => name === f)?.[1] ?? null;
  return { ...describe(f), about };
});

const missing = examples.filter((e) => !e.about).map((e) => e.file);
if (missing.length) {
  console.warn(`no sentence yet for: ${missing.join(', ')}`);
}

const out = {
  generated: new Date().toISOString().slice(0, 10),
  count: examples.length,
  examples,
};
fs.writeFileSync(path.join(DIR, 'index.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`wrote ${examples.length} examples, `
  + `${Math.round((examples.reduce((a, e) => a + e.kB, 0) / 1024) * 10) / 10} MB in all`);
for (const e of examples) {
  console.log(`  ${e.file.padEnd(48)} ${String(e.blocks).padStart(3)} blocks  `
    + `${e.format.padEnd(7)} ${String(e.units).padEnd(5)} ${e.frame.padEnd(8)} ${e.kB} kB`);
}
