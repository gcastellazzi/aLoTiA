/**
 * The three answers to one question, side by side.
 *
 *   node tools/compare_alpha.mjs <session.json> [alpha.json] [--tex out.tex]
 *
 * THE QUESTION. At what multiple alpha of their own weight does a horizontal
 * action applied to the voussoirs set the arch in motion, and about which
 * hinges? Three pieces of this application answer it, and they share no
 * machinery beyond the geometry:
 *
 *   KINEMATIC   multiplier.js: minimumMultiplier searches every four-hinge
 *               mechanism and takes the least multiplier the principle of
 *               virtual work gives. Upper bound, by the kinematic theorem.
 *   STATIC      mechanism.js: collapseRange asks, at a given alpha, whether a
 *               line of thrust fits inside the section. The largest alpha for
 *               which one does is the lower bound of the safe theorem, and the
 *               line at that alpha touches the boundary at the hinges --- the
 *               pattern the Mechanism tab draws.
 *   ABAQUS      the exported deck, with the lateral step, carries the same
 *               action as a ramped body force on frictional contact. Read back
 *               by tools/odb_alpha.py; pass its JSON here as the second
 *               argument.
 *
 * WHAT AGREEMENT WOULD MEAN. The two bounds pinch the limit load from either
 * side and must meet: they are two theorems about the same rigid, infinitely
 * strong, non-sliding masonry, and a gap between them is an error in one of the
 * two searches. Abaqus is not bound to meet them. It lets the joints slide at a
 * finite coefficient of friction, gives the stone a finite stiffness and takes
 * the blocks through a finite motion, so it may collapse earlier --- by sliding
 * Heyman's third assumption forbids --- and it carries the discretisation of
 * the section into prismatic voussoirs. The comparison is worth making for
 * exactly that reason: where the three agree, the hinge mechanism is the one
 * that governs, and where Abaqus falls below, something the limit analysis
 * assumes away is doing the work.
 */
import fs from 'node:fs';
import path from 'node:path';

import { deserialise } from '../docs/app/js/core/persist.js';
import { collapseRange, bestLineForThrust, analyse } from '../docs/app/js/core/mechanism.js';
import {
  multiplierInput, mechanismMultiplier, minimumMultiplier, rotationCentres,
} from '../docs/app/js/core/multiplier.js';

const args = process.argv.slice(2);
const texAt = args.indexOf('--tex');
const texPath = texAt >= 0 ? args[texAt + 1] : null;
const files = args.filter((a, i) => (texAt < 0 ? true : i !== texAt && i !== texAt + 1));
if (!files.length) {
  console.error('usage: node tools/compare_alpha.mjs <session.json> [alpha.json] [--tex out.tex]');
  process.exit(2);
}

const session = deserialise(fs.readFileSync(files[0], 'utf8'));
const model = session.model;
if (!model?.joints) {
  console.error(`${path.basename(files[0])} is not a chain of voussoirs: no joints`);
  process.exit(1);
}
const forces = session.forces ?? null;
const odb = files[1] ? JSON.parse(fs.readFileSync(files[1], 'utf8')) : null;

// ------------------------------------------------------------- the kinematics --
const input = multiplierInput(model, forces);
const found = minimumMultiplier(input);
const governing = [found.plus, found.minus]
  .filter((r) => r && Number.isFinite(r.alpha))
  .sort((a, b) => a.alpha - b.alpha)[0];
if (!governing) {
  console.error('no four-hinge mechanism of this section can be activated');
  process.exit(1);
}
const dir = governing.direction;
const centres = rotationCentres(governing.hinges, governing.motion);

// --------------------------------------------------- the line of thrust --
/** The loads at multiplier alpha, as the funicular construction takes them. */
const inclined = (alpha) => ({
  centroids: model.centroids,
  weights: model.weights.map((w) => [dir * alpha * w, w]),
  actionDirs: model.weights.map((w) => [dir * alpha * w, -w]),
});

// THE PATTERN IS READ AT THE EDGE OF THE THRUST BAND, under the loads of the
// activation state. At alpha0 the arch is on the point of collapse but the
// family of admissible lines is not yet a single line: there is still a band of
// horizontal thrust, and inside the band no line touches the boundary and no
// hinge has formed. At either EDGE of that band one does -- that is what the
// edge is -- and the joints it touches are the hinges the Mechanism tab draws.
// Two patterns come out of it, the minimum-thrust one and the maximum-thrust
// one, and the mechanism the arch actually takes is the one the kinematics
// activates; both are reported rather than the agreeing one being picked out.
const search = { grid: 31, rounds: 4 };

// AT alpha0 ITSELF THE BAND MAY BE EMPTY. The funicular family is swept over
// three parameters on a grid, and at a state this near collapse the band can be
// narrower than the sweep resolves -- the application says as much about thin
// rings. The multiplier is not re-estimated here on that account: the pattern
// is simply read at the largest fraction of alpha0 that still carries a line,
// and the fraction is reported with it, so a reader can see how far from the
// activation state the pattern was taken.
const SWEEP = { lo: 0.005, hi: 4 };
let bandAlpha = governing.alpha;
let band = null;
for (const share of [1, 0.99, 0.97, 0.95, 0.9, 0.8, 0.6]) {
  bandAlpha = governing.alpha * share;
  band = collapseRange(inclined(bandAlpha), model.joints, { ...SWEEP, search });
  if (band) break;
}
const atEdge = (f) => {
  if (!Number.isFinite(f)) return null;
  // An edge sitting on the floor or the ceiling of the sweep is not a limit
  // state: it is where the sweep stopped looking. The line there is admissible
  // but touches nothing, and the pattern read off it would be noise.
  if (f <= SWEEP.lo * 1.001 || f >= SWEEP.hi * 0.999) {
    return { f, hinges: [], dof: null, kinematic: false, unresolved: true };
  }
  const line = bestLineForThrust(inclined(bandAlpha), model.joints, f, search);
  if (!line) return null;
  const got = analyse(line.crossings, model.joints, model.blocks.length);
  return { f, hinges: got.hinges, dof: got.dof, kinematic: got.kinematic };
};
const edges = band
  ? [['minimum thrust', atEdge(band.min)], ['maximum thrust', atEdge(band.max)]]
    .filter(([, got]) => got)
  : [];

// ------------------------------------------------------------------ the Abaqus --
/**
 * Which face each parted joint hinged on.
 *
 * A hinge is the end of the joint that stays shut while the other opens, so the
 * node of least opening says where it is, and the two ends of the joint --
 * `a` on the intrados and `b` on the extrados -- say which face that is.
 */
function abaqusHinges(rows) {
  const out = [];
  for (const [key, row] of Object.entries(rows ?? {})) {
    const j = Number(key);
    const joint = model.joints[j];
    if (!joint || !row.max || row.max.gap <= 0) continue;
    const shut = row.min?.point ?? null;
    let face = null;
    if (shut) {
      const da = Math.hypot(shut[0] - joint.a[0], shut[1] - joint.a[1]);
      const db = Math.hypot(shut[0] - joint.b[0], shut[1] - joint.b[1]);
      face = da <= db ? 'intrados' : 'extrados';
    }
    // The extraction flags a joint open at one end and shut at the other; an
    // older file without the flag is judged here by the same rule.
    const closed = row.min?.gap ?? null;
    const hinge = row.hinge ?? (closed !== null && closed < 0.05 * row.max.gap);
    out.push({ joint: j, face, gap: row.max.gap, closed, hinge });
  }
  return out.sort((p, q) => q.gap - p.gap);
}
/**
 * The joints at the frame the arch last held, from the evolution alone.
 *
 * WHY THIS PATH EXISTS. An extraction that chose its frame by a threshold
 * reports the openings of the first frame of the step, where nothing has
 * happened yet; and an older one wrote the last frame, where everything has.
 * The frame-by-frame table it also wrote is enough to find the right frame
 * here: the collapse is where the widest opening in the arch runs away from
 * the frame before it, and the state to read is the one before that.
 *
 * The faces cannot be recovered this way --- the table carries the size of
 * each opening and not the coordinates of the node that stayed shut --- so the
 * joints come back with their face unknown, and the comparison says so rather
 * than guessing between the intrados and the extrados.
 */
function fromEvolution(evolution, jump = 5) {
  const rows = (evolution ?? []).map((row) => ({
    t: Number(row.t),
    joints: Object.entries(row.joints ?? {}).map(([key, v]) => ({
      joint: Number(key), max: Number(v.max), min: Number(v.min),
    })),
    widest: Math.max(0, ...Object.values(row.joints ?? {}).map((v) => Number(v.max))),
  }));
  if (rows.length < 2) return null;
  let diverged = null;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].widest > 0 && (rows[i - 1].widest <= 0
      || rows[i].widest > jump * rows[i - 1].widest)) {
      diverged = i;
      break;
    }
  }
  const held = diverged === null ? rows.length - 1 : diverged - 1;
  return { rows, diverged, held };
}

// The extraction's own choice of frame is trusted only when it is not the
// first frame of the step, which is the signature of the threshold mistake.
const evolution = fromEvolution(odb?.evolution);
const trustJoints = odb?.joints && Object.keys(odb.joints).length
  && odb.onset_frame !== 0 && odb.held_frame !== 0;
const abaqusAll = trustJoints
  ? abaqusHinges(odb.joints)
  : (evolution?.held != null
    ? evolution.rows[evolution.held].joints
      .filter((r) => r.max > 0)
      .map((r) => ({
        joint: r.joint, face: null, gap: r.max, closed: r.min,
        hinge: r.min < 0.05 * r.max,
      }))
      .sort((p, q) => q.gap - p.gap)
    : []);
// THE HINGES FIRST, AND ONLY THEN THE WIDEST. A joint that has lifted at both
// ends is a block coming away, not a hinge, and taking the four widest
// openings without that distinction reads a mechanism of four hinges off an
// arch that has come apart.
const abaqusHinging = abaqusAll.filter((h) => h.hinge);
const abaqusFour = (abaqusHinging.length >= 4 ? abaqusHinging : abaqusAll)
  .slice(0, 4).sort((p, q) => p.joint - q.joint);

// ------------------------------------------------------------------ the report --
const f4 = (v) => (Number.isFinite(v) ? v.toFixed(4) : '—');
// i and e are the two faces. A hinge the line of thrust puts INSIDE the
// thickness of an end joint is marked *: it is where the thrust meets the
// abutment, not a hinge at a face, and calling it one of the two would invent
// a face the construction never chose. A face that is simply not in the file,
// as in an extraction that carries opening sizes without coordinates, is ?.
const faceMark = (h) => {
  if (h.face === 'intrados') return 'i';
  if (h.face === 'extrados') return 'e';
  if (h.face === 'interior') return '*';
  return '?';
};
const pattern = (hinges) => (hinges?.length
  ? hinges.map((h) => `${h.joint}${faceMark(h)}`).join(' ')
  : '—');
// The step time is the multiplier over the ceiling of the ramp, so either the
// extraction has already scaled it or it is scaled here; a file carrying only
// the step times is still readable.
const scaled = (named, time) => odb?.[named]
  ?? (odb?.alpha_max != null && odb?.[time] != null ? odb.alpha_max * odb[time] : null);
// Where the extraction's own frame is not trusted, the times come from the
// evolution table on the same footing as the joints do.
const atFrame = (index) => (index == null || odb?.alpha_max == null
  ? null
  : odb.alpha_max * evolution.rows[index].t);
const alphaMotion = trustJoints
  ? scaled('alpha_motion', 'step_time_motion')
  : atFrame(evolution?.diverged);
// THE ENERGY IS THE COLLAPSE INDICATOR. The kinetic energy leaves zero as soon
// as the blocks begin to move; a gap has to grow to a visible size before a
// ratio between consecutive frames can see it diverge, so the openings run away
// a frame or two later and reading the multiplier off them overstates it. The
// openings say where the mechanism is, the energy says when it formed.
const alphaEnergy = scaled('alpha_energy', 'step_time_energy');
const alphaEnergyBefore = scaled('alpha_energy_before', 'step_time_energy_before');
const alphaRunaway = trustJoints
  ? scaled('alpha_motion', 'step_time_motion')
  : atFrame(evolution?.diverged);
const alphaBefore = alphaEnergyBefore
  ?? (trustJoints ? scaled('alpha_before', 'step_time_before') : atFrame(evolution?.held));
const alphaLast = scaled('alpha_last', 'step_time_last');
// NOT alpha_last as a fallback. When the step runs to its end -- which an
// implicit quasi-static step does whether or not the arch gave way -- that
// number is the ceiling of the ramp, chosen before the analysis. Reporting it
// as the multiplier would report the question as the answer.
const alphaAbaqus = alphaEnergy ?? alphaMotion ?? null;
const same = (a, b) => pattern(a) === pattern(b);

/**
 * The multiplier of a hinge pattern that came from somewhere else.
 *
 * A pattern read off a line of thrust, or off the joints that parted in
 * Abaqus, is a mechanism like any other, and the principle of virtual work
 * gives its multiplier. This is the sharpest form of the comparison: a pattern
 * that differs from the kinematic one but carries a multiplier a fraction of a
 * per cent above it is the same answer reached by another route, while one
 * carrying a much larger multiplier is a different answer. By the kinematic
 * theorem no pattern can carry less than the minimum, so a value below it
 * would mean the search had missed a mechanism.
 */
function multiplierOf(hinges) {
  if (hinges?.length !== 4) return null;
  const got = mechanismMultiplier(input, hinges.map(({ joint, face }) => ({ joint, face })));
  return got.reason ? { reason: got.reason } : { alpha: got.alpha };
}
/**
 * The edge of the band whose pattern is the collapse mechanism.
 *
 * Only one edge of the band is the collapse state for an action in a given
 * direction: at the other the line touches the faces in a pattern whose joints
 * cannot all open, which is not a mechanism at all. The one with the least
 * multiplier among those that are is the pattern to quote.
 */
const governingEdge = () => edges
  .map(([name, got]) => [name, got, multiplierOf(got.hinges)])
  .filter(([, got, m]) => !got.unresolved && m && m.alpha !== undefined)
  .sort((p, q) => p[2].alpha - q[2].alpha)[0] ?? null;

const note = (hinges) => {
  const got = multiplierOf(hinges);
  if (!got) return '';
  if (got.reason) return `  [not a mechanism: ${got.reason}]`;
  const excess = 100 * (got.alpha / governing.alpha - 1);
  return `  [α = ${f4(got.alpha)}, ${excess >= 0 ? '+' : ''}${excess.toFixed(2)}%]`;
};

console.log(`${path.basename(files[0])}: ${model.blocks.length} voussoirs, `
  + `${model.joints.length} joints, action in ${dir > 0 ? '+x' : '−x'}`);
console.log('');
console.log('  the multiplier');
console.log(`    kinematic, every four-hinge mechanism   α0 = ${f4(governing.alpha)}`);
if (odb) {
  // An interval, not a figure: the model carried the one frame and not the
  // next, so that is what it establishes.
  console.log(`    Abaqus, the ramped body force          α `
    + (alphaAbaqus == null
      ? ' — (nothing ran away: the arch stood to the ceiling of the ramp)'
      : alphaBefore != null
        ? ` ∈ [${f4(alphaBefore)}, ${f4(alphaAbaqus)}]`
        : ` = ${f4(alphaAbaqus)}`)
    + (alphaAbaqus != null && alphaEnergy != null ? '  (the kinetic energy)' : ''));
  if (alphaRunaway != null && alphaEnergy != null && alphaRunaway > alphaEnergy) {
    console.log(`      the openings run away later, by α = ${f4(alphaRunaway)}`);
  }
  if (alphaAbaqus != null) {
    // `band` below is the thrust band; this one is the spread of the bracket.
    const spread = [alphaBefore, alphaAbaqus].filter((v) => v != null)
      .map((v) => `${(100 * (v / governing.alpha - 1)).toFixed(2)} per cent`);
    console.log('    Abaqus against the kinematic value          '
      + (spread.length > 1 ? `between ${spread[0]} and ${spread[1]}` : spread[0]));
  }
} else {
  console.log('    Abaqus                                 — (no odb given)');
}

console.log('');
console.log('  the hinges  (joint number, i = intrados, e = extrados,');
console.log('   * = inside the thickness of an end joint, ? = face not in the file)');
if (band && Math.abs(bandAlpha - governing.alpha) > 1e-12) {
  console.log(`    the thrust line is read at α = ${f4(bandAlpha)}, `
    + `${(100 * bandAlpha / governing.alpha).toFixed(0)} per cent of α0:`);
  console.log('    at α0 itself the funicular sweep found no admissible line.');
}
console.log(`    kinematic                    ${pattern(governing.hinges)}`);
if (band) {
  edges.forEach(([name, got]) => {
    if (got.unresolved) {
      console.log(`    thrust line, ${name.padEnd(16)}—   `
        + `(h = ${f4(got.f)} is the edge of the sweep, not a limit state)`);
      return;
    }
    console.log(`    thrust line, ${name.padEnd(16)}${pattern(got.hinges)}`
      + `   (h = ${f4(got.f)}, ${got.dof} dof`
      + `${got.kinematic ? '' : ', the joints cannot all open'})`
      + (same(got.hinges, governing.hinges) ? '  = the kinematic pattern' : note(got.hinges)));
  });
} else {
  console.log('    thrust line                  no line of thrust fits down to 0.6 α0:');
  console.log('      the funicular family is searched over three parameters, and on');
  console.log('      this section the sweep does not resolve the band. Raise');
  console.log('      search.grid, or read the pattern from the application itself.');
}
if (odb) {
  console.log(`    Abaqus                       ${pattern(abaqusFour)}`
    + (same(abaqusFour, governing.hinges) ? '  = the kinematic pattern' : note(abaqusFour)));

  // ONLY THE INTERIOR JOINTS CAN BE COMPARED. A contact pair exists between
  // two voussoirs; the two end faces bear on the abutments through boundary
  // conditions, so a hinge at a springing opens no contact and leaves no trace
  // in COPEN. Setting a four-hinge pattern that includes a springing against
  // one that cannot contain a springing counts a disagreement that is an
  // artefact of what the output can see.
  const last = model.joints.length - 1;
  const inner = (hinges) => (hinges ?? []).filter((h) => h.joint > 0 && h.joint < last);
  const kin = inner(governing.hinges);
  const abq = inner(abaqusFour);
  const faced = abq.some((k) => k.face);
  const agree = faced
    ? kin.filter((h) => abq.some((k) => k.joint === h.joint && k.face === h.face))
    : [];
  const place = kin.filter((h) => abq.some((k) => k.joint === h.joint));
  console.log('');
  console.log('    on the joints a contact pair can see — 1 to '
    + `${last - 1}, the springings excluded:`);
  console.log(`      kinematic ${pattern(kin)}   ·   Abaqus ${pattern(abq)}`);
  console.log(faced
    ? `      ${agree.length} of ${kin.length} agree in joint and face, `
      + `${place.length} in joint alone`
    : `      ${place.length} of ${kin.length} agree in joint; the faces are not `
      + 'in this file');
}

console.log('');
console.log('  at rest in the kinematic mechanism — the absolute centres of rotation,');
console.log('  which are what the exported model is held at:');
centres.forEach((c) => {
  console.log(`    joint ${String(c.joint).padStart(3)} ${String(c.face).padEnd(10)}`
    + (c.fixed ? 'at rest' : `moving, ${c.speed.toExponential(2)} of the field`));
});

if (odb && abaqusAll.length) {
  console.log('');
  console.log(`  ${abaqusAll.length} joint(s) parted in Abaqus, `
    + `${abaqusHinging.length} of them open at one end only.`);
  if (abaqusHinging.length > 4) {
    console.log('  More than four hinges: the pattern below is the four widest of');
    console.log('  them, and the others are listed so that a fifth comparable');
    console.log('  opening is not passed over in silence.');
  } else if (abaqusHinging.length < 4) {
    console.log('  Fewer than four hinges at this frame. Either the onset was');
    console.log('  caught before the mechanism was complete, or the collapse was');
    console.log('  not one of hinges — sliding, which Heyman\'s third assumption');
    console.log('  excludes, leaves joints that shear rather than open.');
  }
  abaqusAll.forEach((h) => {
    const chosen = abaqusFour.some((k) => k.joint === h.joint);
    console.log(`    joint ${String(h.joint).padStart(3)} opened ${h.gap.toExponential(3)}`
      + `, far end ${(h.closed ?? NaN).toExponential(2)}`
      + `  ${h.hinge ? 'hinge' : 'open at both ends'}${chosen ? ', taken' : ''}`);
  });
}

if (texPath) {
  const lines = [
    '% generated by tools/compare_alpha.mjs -- do not edit',
    `\\def\\valCase{${path.basename(files[0]).replace(/\.json$/, '').replace(/_/g, ' ')}}`,
    `\\def\\valBlocks{${model.blocks.length}}`,
    `\\def\\valDirection{${dir > 0 ? '+x' : '-x'}}`,
    `\\def\\valAlphaKin{${f4(governing.alpha)}}`,
    // The bracket, both ends: the model carried the one frame and not the
    // next, and a table that printed one end would claim the other.
    `\\def\\valAlphaAbqLo{${f4(alphaBefore ?? NaN)}}`,
    `\\def\\valAlphaAbqHi{${f4(alphaAbaqus ?? NaN)}}`,
    `\\def\\valHingesKin{${pattern(governing.hinges)}}`,
    `\\def\\valHingesThrust{${pattern(governingEdge()?.[1]?.hinges)}}`,
    `\\def\\valAlphaThrust{${f4(governingEdge()?.[2]?.alpha ?? NaN)}}`,
    `\\def\\valThrustAt{${f4(bandAlpha)}}`,
    `\\def\\valHingesAbq{${pattern(abaqusFour)}}`,
    `\\def\\valCentres{${centres.filter((c) => c.fixed)
      .map((c) => `${c.joint}${c.face === 'intrados' ? 'i' : 'e'}`).join(', ')}}`,
    alphaBefore != null
      ? `\\def\\valAbqRatioLo{${(100 * (alphaBefore / governing.alpha - 1)).toFixed(1)}}`
      : '\\def\\valAbqRatioLo{--}',
    alphaAbaqus != null
      ? `\\def\\valAbqRatioHi{${(100 * (alphaAbaqus / governing.alpha - 1)).toFixed(1)}}`
      : '\\def\\valAbqRatioHi{--}',
    // The joints a contact pair can see: the springings are held by boundary
    // conditions and open no contact.
    `\\def\\valJointsSeen{1--${model.joints.length - 2}}`,
    '',
  ];
  fs.writeFileSync(texPath, lines.join('\n'));
  console.log(`\nwrote ${texPath}`);
}
