/**
 * aLOTofImaginArches, in the browser.
 *
 * Wiring only: the mechanics lives in js/core, the drawing in js/render. This
 * file loads an example, keeps one piece of state, and redraws.
 */

import { Axes } from './render/axes.js';
import { drawScaleBar } from './render/scalebar.js';
import {
  drawBlocks, drawThrustLine, drawCable, drawWeights, drawSupports,
  drawForcePolygon, drawArrow, drawReactionLabel, drawThrustLabels, labelStride,
  drawHinges, drawMacroBlocks, drawMechanism, drawCentres,
  drawEnds, drawPreliminary,
} from './render/draw.js';
import { bounds, area as signedAreaOf } from './core/geometry.js';
import {
  forcePolygon, funicular, poleFromForcePolygon, hangingCable, jointCrossings,
  freeThrustLine, poleForEnds,
} from './core/statics.js';
import { fromExample, poleOf, consistency } from './core/model.js';
import {
  blocksBetween, checkTrace, weighBlocks, centroidsOf, springings,
} from './core/trace.js';
import {
  blocksLike, circularRing, circularRingThroughPoints, betweenEnds,
} from './core/blocks.js';
import {
  SYSTEMS, unitsPerPixel, scaleModel, format, archDimensions,
  convertModel, conversionFactors,
} from './core/units.js';

import { serialise, deserialise, suggestedName } from './core/persist.js';
import {
  bestLineForThrust, constrainedLine, collapseRange, analyse, imposedBand,
  displacedConfiguration, displaced, freezeBranch, lineWithFrozenBranch,
} from './core/mechanism.js';
import {
  ringStudySamples, heymanPoint, heymanDomain, thirdMiddleBand,
  heymanGeometricalSafety,
} from './core/study.js';
import {
  defaultAxis, luneWeights, solids, widthRange,
} from './core/dome.js';
import { cutRadially, blockCentroid, blockArea } from './core/profile.js';
import {
  frame, projectedBounds, solidCentre, recenteredSolids,
  drawSolids, drawAxis, drawReferenceFrame,
} from './render/solid.js';

const DATA = 'data/examples/';

const el = (id) => document.getElementById(id);
const ui = {
  example: el('example'), meta: el('meta'), warn: el('warn'),
  newWork: el('newWork'),
  scaleSource: el('scaleSource'),
  thrust: el('thrust'), thrustValue: el('thrustValue'), reset: el('reset'),
  startPos: el('startPos'), startValue: el('startValue'),
  split: el('split'), splitValue: el('splitValue'),
  saveState: el('saveState'), loadState: el('loadState'),
  stateFile: el('stateFile'), saveStatus: el('saveStatus'),
  showImage: el('showImage'), showBlocks: el('showBlocks'),
  showWeights: el('showWeights'), showThrust: el('showThrust'),
  showCable: el('showCable'), showLabels: el('showLabels'),
  showRays: el('showRays'), showReactions: el('showReactions'),
  showMech: el('showMech'),
  showScale: el('showScale'),
  mechOn: el('mechOn'), mechVerdict: el('mechVerdict'),
  mechCount: el('mechCount'), mechBand: el('mechBand'),
  mechAmp: el('mechAmp'), goHmin: el('goHmin'), goHmax: el('goHmax'),
  poleni: el('poleni'), domeAngle: el('domeAngle'), domeAxis: el('domeAxis'),
  pickAxis: el('pickAxis'), domeStatus: el('domeStatus'),
  tabForce: el('tabForce'), tabSolid: el('tabSolid'),
  tabHeyman: el('tabHeyman'), tabRadius: el('tabRadius'),
  radiusMetric: el('radiusMetric'),
  radiusByWeight: el('radiusByWeight'), radiusByThrust: el('radiusByThrust'),
  radiusASteps: el('radiusASteps'), radiusBSteps: el('radiusBSteps'),
  radiusNSteps: el('radiusNSteps'), radiusTriStep: el('radiusTriStep'),
  plotStatus: el('plotStatus'),
  sideCaption: el('sideCaption'),
  tabGeom: el('tabGeom'), tabLot: el('tabLot'), tabMech: el('tabMech'),
  paneGeom: el('paneGeom'), paneLot: el('paneLot'), paneMech: el('paneMech'),
  thrustM: el('thrustM'), thrustValueM: el('thrustValueM'),
  thrustP: el('thrustP'), thrustValueP: el('thrustValueP'),
  showCable2: el('showCable2'), cableWeights: el('cableWeights'),
  imposeEnds: el('imposeEnds'), pickA: el('pickA'), pickB: el('pickB'),
  endsStatus: el('endsStatus'),
  imposeEnds2: el('imposeEnds2'), pickA2: el('pickA2'), pickB2: el('pickB2'),
  traceProfile: el('traceProfile'), clearProfiles: el('clearProfiles'),
  pickCutCentre: el('pickCutCentre'), nCuts: el('nCuts'),
  cutProfile: el('cutProfile'), profileStatus: el('profileStatus'),
  nSides: el('nSides'), addBlock: el('addBlock'),
  showJoints: el('showJoints'), admissible: el('admissible'),
  flipY: el('flipY'),
  imageFile: el('imageFile'), traceInner: el('traceInner'),
  imageRealWidth: el('imageRealWidth'), imageRealHeight: el('imageRealHeight'),
  imageAspectLocked: el('imageAspectLocked'), imageLockIcon: el('imageLockIcon'),
  applyImageSize: el('applyImageSize'), pickImageRef: el('pickImageRef'),
  imageRefLength: el('imageRefLength'), applyImageRefScale: el('applyImageRefScale'),
  traceOuter: el('traceOuter'), traceHint: el('traceHint'),
  nBlocks: el('nBlocks'), gamma: el('gamma'), thick: el('thick'),
  ringRi: el('ringRi'), ringTri: el('ringTri'), ringN: el('ringN'),
  makeRing: el('makeRing'), ringStatus: el('ringStatus'),
  pickInner1: el('pickInner1'), pickInner2: el('pickInner2'), pickInner3: el('pickInner3'),
  pickOuter1: el('pickOuter1'), pickOuter2: el('pickOuter2'), pickOuter3: el('pickOuter3'),
  makeThreePointRing: el('makeThreePointRing'),
  clearThreePointRing: el('clearThreePointRing'),
  threePointRingStatus: el('threePointRingStatus'),
  thickLabel: el('thickLabel'),
  makeBlocks: el('makeBlocks'), clearTrace: el('clearTrace'),
  traceStatus: el('traceStatus'), gammaLabel: el('gammaLabel'),
  forceMag: el('forceMag'), forceLabel: el('forceLabel'),
  addForce: el('addForce'), clearForces: el('clearForces'),
  forceList: el('forceList'),
  system: el('system'), pickRef: el('pickRef'), refLength: el('refLength'),
  applyScale: el('applyScale'), scaleStatus: el('scaleStatus'),
};

const mainAx = new Axes(el('main'), { equal: true, yUp: true });
const forceAx = new Axes(el('force'), { equal: true, yUp: true });
const plotAx = new Axes(el('plot'), { equal: false, yUp: true });
// The block view lives on its own canvas, sharing the pane with the force
// polygon. Its "data" coordinates are the screen plane of the projection, so
// equal scales there mean the solid is drawn without distortion.
const solidAx = new Axes(el('solid'), { equal: true, yUp: true, margin: [8, 8, 8, 8] });
mainAx.xlabel = 'x';
mainAx.ylabel = 'y';
forceAx.title = 'Force polygon';
plotAx.title = 'Plots';

/** Everything the drawing depends on. */
const state = {
  model: null,
  image: null,
  imageData: null,
  basePole: null,   // the pole as saved: thrust slider is relative to it
  mech: null,       // the hinge analysis, when the mechanism tab is driving
  band: null,       // the two collapse thrusts, once computed
  camera: { az: -45, el: 30 },   // the 3-D viewpoint, in degrees
  ends: { A: null, B: null, picking: null, construction: null },
  // Whole-profile tracing: closed outlines, the centre the cuts radiate from,
  // and the free-hand block being drawn.
  profiles: { list: [], current: null, centre: null, picking: false },
  newBlock: null,
  solidBounds: null,             // its projected extent, for the fit buttons
  bandKey: null,    // what the band was computed for
  beyondBand: 0,    // +1 held at H max, -1 at H min, 0 inside the band
  spanKept: null,   // which blocks the imposed ends leave carrying the line
  imposedRange: null,  // the thrust band of the imposed-ends family
  imposedKey: null,
  selectedJoint: null,
  thicknessStudy: null,
  ringStudySource: null,
  ringAuto: false,
  visibleStudyTris: [],
  radiusMetric: 'weight',
  showSolidAxes: false,
  frozenBranch: null,
  pole: null,
  fp: null,
  lot: null,
  consistent: null,
  // Tracing: the two curves the user is drawing, and which one is armed.
  trace: { inner: [], outer: [], armed: null, cursor: null },
  threePointRing: { inner: [null, null, null], outer: [null, null, null], picking: null },
  // Scale: the two picked reference points, and the system in force.
  ref: { points: [], picking: false },
  system: 'SI',
  // Applied point loads: where they act, how big, and whether we are placing.
  forces: { points: [], magnitudes: [], placing: false },
};

function clearPlotState({ keepStudy = false } = {}) {
  state.selectedJoint = null;
  state.frozenBranch = null;
  if (!keepStudy) {
    state.thicknessStudy = null;
    state.ringStudySource = null;
    state.ringAuto = false;
    state.visibleStudyTris = [];
  }
}

function clearThreePointRing() {
  state.threePointRing = { inner: [null, null, null], outer: [null, null, null], picking: null };
  reportThreePointRing();
}

function traceArmed() {
  return !!state.trace?.armed;
}

function currentRingStudySource(base = {}) {
  const dome = domeOptions();
  const steps = (elm, fallback, min = 2) => Math.max(min, Math.round(Number(elm.value) || fallback));
  return {
    ...base,
    gamma: Number(ui.gamma.value) || 20,
    thickness: Math.max(0, Number(ui.thick.value) || 1),
    poleni: dome.poleni,
    axisX: dome.axisX,
    angleDeg: dome.angleDeg,
    leftSteps: steps(ui.radiusASteps, 5, 3),
    rightSteps: steps(ui.radiusBSteps, 5, 3),
    thrustSteps: steps(ui.radiusNSteps, 7),
  };
}

function radiusTriStepValue() {
  const step = Math.max(0.0001, Number(ui.radiusTriStep.value) || 0.01);
  return Number(step.toPrecision(8));
}

function applyRadiusTriStep({ commit = false } = {}) {
  const step = radiusTriStepValue();
  if (commit) ui.radiusTriStep.value = String(step);
  ui.ringTri.step = String(step);
}

function nudgeRingTri(direction) {
  applyRadiusTriStep();
  const step = radiusTriStepValue();
  const min = Number(ui.ringTri.min) || 0;
  const value = Number(ui.ringTri.value) || 0;
  const next = Math.max(min, value + direction * step);
  ui.ringTri.value = String(Number(next.toPrecision(10)));
  ui.ringTri.dispatchEvent(new Event('input', { bubbles: true }));
}

function refreshRingStudy() {
  if (!state.ringStudySource) return;
  state.ringStudySource = currentRingStudySource(state.ringStudySource);
  const seen = new Set();
  const tris = (state.thicknessStudy?.points ?? [])
    .map((p) => p.tri)
    .filter((tri) => {
      const key = tri.toPrecision(12);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  state.thicknessStudy = {
    ...state.thicknessStudy,
    points: tris.map((tri) => ringStudySamples({
      ...state.ringStudySource,
      tri,
    }).points).flat(),
  };
  state.visibleStudyTris = state.visibleStudyTris.filter((tri) => (
    tris.some((t) => Math.abs(t - tri) < 1e-9)
  ));
  state.plotFitKey = null;
}

function recordRingState(opt) {
  const got = ringStudySamples(opt);
  const current = state.thicknessStudy?.points ?? [];
  const same = (p) => Math.abs(p.tri - opt.tri) < 1e-9;
  state.thicknessStudy = {
    ok: true,
    points: [...current.filter((p) => !same(p)), ...got.points]
      .sort((a, b) => (a.plotTri ?? a.tri) - (b.plotTri ?? b.tri)),
  };
  state.visibleStudyTris = [...state.visibleStudyTris.filter((tri) => (
    Math.abs(tri - opt.tri) >= 1e-9
  )), opt.tri].slice(-3);
  state.plotFitKey = null;
  return got;
}

async function loadCatalogue() {
  const res = await fetch(`${DATA}index.json`);
  const cat = await res.json();
  ui.example.innerHTML = '';
  for (const e of cat.examples) {
    const o = document.createElement('option');
    o.value = e.file;
    o.textContent = `${e.name.replace(/_/g, ' ')}  (${e.blocks ?? '?'} blocks)`;
    ui.example.append(o);
  }
  // AN EMPTY DESK TO BEGIN WITH. Opening straight into an example put an arch
  // on screen that nobody had asked for, and a student tracing their own had
  // to clear it first. The menu now starts on a blank entry: choosing one
  // loads it, and "Start a new arch" comes back here.
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = '— choose an example, or trace your own —';
  ui.example.prepend(blank);
  ui.example.value = '';
  newWork();
}

/**
 * Clear the desk.
 *
 * Everything the session holds goes: the arch, the trace, the outlines, the
 * loads, the imposed ends, the image. Not the unit system or the typed
 * densities, which are settings rather than work.
 */
function newWork() {
  state.model = null;
  state.image = null;
  state.imageData = null;
  state.exampleName = null;
  state.trace = { inner: [], outer: [], armed: null, cursor: null };
  clearThreePointRing();
  state.profiles = { list: [], current: null, centre: null, picking: false };
  state.forces = { points: [], magnitudes: [], placing: false };
  state.ends = { A: null, B: null, picking: null, construction: null };
  state.ref = { points: [], picking: false };
  state.newBlock = null;
  state.basePole = null;
  state.pole = null;
  state.fp = null;
  state.lot = null;
  state.mech = null;
  state.crossings = null;
  state.band = null;
  state.bandKey = null;
  state.imposedRange = null;
  state.imposedKey = null;
  state.spanKept = null;
  state.selectedJoint = null;
  state.thicknessStudy = null;
  state.ringStudySource = null;
  state.ringAuto = false;
  state.frozenBranch = null;
  state.consistent = { ok: true, reason: null, extraRows: 0 };
  state.axisPicked = false;
  ui.example.value = '';
  ui.imposeEnds.checked = false;
  ui.imposeEnds2.checked = false;
  ui.meta.textContent = 'no arch yet — choose an example, or trace your own';
  ui.scaleSource.hidden = true;
  ui.warn.hidden = true;
  ui.imageRealWidth.value = '';
  ui.imageRealHeight.value = '';
  ui.imageRefLength.value = ui.refLength.value;
  ui.imageAspectLocked.checked = true;
  reportImageLock();
  reportScale();
  listForces();
  reportProfiles();
  reportMechanism();
  mainAx.begin(); mainAx.decorate();
  forceAx.begin(); forceAx.decorate();
  draw();
}

/**
 * An example that cannot be loaded must SAY SO and leave nothing behind.
 *
 * `FileName_Example` is the empty template and carries no blocks, so
 * `fromExample` throws. The rejection went nowhere: the previous arch stayed on
 * screen, with its joints, its thrust line and its verdict, under the name of
 * the example that had just failed to load. That is worse than an error
 * message, because everything on screen is a correct answer to a question
 * nobody asked.
 */
async function loadExample(file) {
  let json;
  let model;
  try {
    const res = await fetch(DATA + file);
    if (!res.ok) throw new Error(`could not be read (HTTP ${res.status})`);
    json = await res.json();
    model = fromExample(json);
  } catch (err) {
    ui.warn.hidden = false;
    ui.warn.textContent = `${file}: ${err.message}`;
    ui.meta.textContent = 'nothing loaded';
    state.model = { blocks: [], centroids: [], weights: [], joints: null,
      frame: { coordinates: 'pixels', units_per_pixel: 1 } };
    state.consistent = { ok: false, reason: err.message, extraRows: 0 };
    state.lot = null;
    state.fp = null;
    state.crossings = null;
    state.mech = null;
    state.band = null;
    state.bandKey = null;
    state.selectedJoint = null;
    state.thicknessStudy = null;
    state.ringStudySource = null;
    state.ringAuto = false;
    state.frozenBranch = null;
    state.image = null;
    state.imageData = null;
    state.trace = { inner: [], outer: [], armed: null, cursor: null };
    clearThreePointRing();
    state.forces = { points: [], magnitudes: [], placing: false };
    assessAdmissibility();
    reportMechanism();
    draw();
    return;
  }
  state.model = model;
  state.consistent = consistency(model);
  clearPlotState();

  // The pole the example was saved with; the slider moves around it.
  try {
    state.basePole = poleOf(model, poleFromForcePolygon).pole;
  } catch {
    // NO STORED SOLUTION IS NOT A REASON TO REFUSE THE ARCH. Six of the
    // examples were saved before a line of thrust was ever computed, and there
    // is nothing wrong with them: the blocks, the weights and now the joints
    // are all there, and the only thing missing is a pole -- which the
    // mechanism search computes for itself and the sliders can move freely.
    // Leaving basePole null made recompute() bail out, so the Nervi bridge and
    // the Pippard-Ashby arch could not be analysed at all, and the panel said
    // "not available for this example" about an arch it had everything for.
    // Start from a thrust of three tenths of the load, split evenly.
    const total = (model.weights ?? []).reduce((a, b) => a + b, 0);
    state.basePole = total > 0 ? [0.3 * total, -0.5 * total] : null;
  }
  ui.thrust.value = 50;

  // The saved examples were traced in MATLAB axes with y increasing UPWARD,
  // even when the coordinates are image pixels, because the user flips the
  // axis before tracing. So the default is the mathematical convention, and
  // the Flip Y button is there for the cases where it was not.
  ui.flipY.checked = false;
  mainAx.yUp = true;

  state.trace = { inner: [], outer: [], armed: null, cursor: null };
  clearThreePointRing();
  state.forces = { points: [], magnitudes: [], placing: false };
  // The collapse band belongs to the arch that was on screen, not to this one.
  // The signature guard recomputes it for another arch WITH joints, but an
  // arch without them never reaches that branch and inherited the last band
  // it saw.
  state.band = null;
  state.bandKey = null;
  state.selectedJoint = null;
  state.thicknessStudy = null;
  state.ringStudySource = null;
  state.ringAuto = false;
  state.frozenBranch = null;
  state.mech = null;
  state.crossings = null;
  state.image = null;
  state.imageData = null;
  if (model.image) {
    const img = new Image();
    img.onload = () => { state.image = img; draw(); };
    img.src = DATA + model.image;
  }

  describe();
  resetAxis();
  reportDome();
  recompute();
  fitViews();
  draw();
}

function describe() {
  const m = state.model;
  const parts = [
    `${m.weights?.length ?? m.blocks.length} blocks`,
    m.units ? `units: ${m.units}` : null,
    `coordinates: ${m.frame.coordinates}`,
  ].filter(Boolean);
  ui.meta.textContent = parts.join(' · ');

  // WHERE THE SIZE CAME FROM, on screen and not only in the file. An example
  // scaled from a published span and one scaled to a round number for the sake
  // of the drawing look identical once drawn, and a reader comparing a span
  // against the literature has to be able to tell them apart. The scale bar
  // says how big; this says how much to believe it.
  ui.scaleSource.hidden = !m.scaleSource;
  ui.scaleSource.textContent = m.scaleSource
    ? `scale: ${m.scaleSource}` : '';

  if (state.consistent && !state.consistent.ok) {
    ui.warn.hidden = false;
    ui.warn.textContent =
      `Stored solution not recomputable: ${state.consistent.reason}. ` +
      'The thrust line shown is the one saved with the example.';
  } else {
    ui.warn.hidden = true;
  }
}

/**
 * Why this arch has no joints, in a sentence the student can act on.
 *
 * A stored example carries voussoirs but never carried its cuts; `joints.js`
 * recovers them where the blocks are a chain of abutting quadrilaterals and
 * refuses where they are not -- the Poleni domes flattened their two-piece
 * blocks and interleaved the two shells, the cathedral sections carry piers
 * and detached members. Saying only "needs a traced arch" left the student
 * with no idea which examples would work or why.
 */
function noJointsReason(m) {
  const r = m && m.jointRecovery;
  if (r && r.reason) {
    return `no joints for this example — ${r.reason}. `
      + 'Trace the outline, or the two faces, to cut it yourself.';
  }
  return 'available for a traced arch, which has joints';
}

/**
 * The two joints the thrust line runs between, or null.
 *
 * `start` is the right-hand springing, because the weights are ordered by
 * descending x and the walk goes with them. Only a traced arch has joints; a
 * stored example carries just its two springing POINTS, and its ends stay
 * where the file put them.
 */
function endJoints() {
  const j = state.model?.joints;
  if (!j || j.length < 2) return null;
  const midX = (k) => (k.a[0] + k.b[0]) / 2;
  const first = j[0];
  const last = j[j.length - 1];
  return midX(last) >= midX(first)
    ? { start: last, end: first }
    : { start: first, end: last };
}

/** The total load, blocks and applied forces together. */
function totalLoad() {
  const w = (state.model?.weights ?? []).reduce((s, v) => s + v, 0);
  const f = (state.forces?.magnitudes ?? []).reduce((s, v) => s + v, 0);
  return w + f;
}

/** Say where the line leaves one springing and where it arrives at the other. */
function reportEnds(ends) {
  const on = !!ends;
  ui.startPos.disabled = !on;
  ui.split.disabled = !on;
  if (!on) {
    ui.startValue.textContent = 'needs a traced arch';
    ui.splitValue.textContent = 'fixed by the stored force polygon';
    return;
  }
  const place = (s) => (s < 0 ? `${(-100 * s).toFixed(0)}% below the intrados`
    : s > 1 ? `${(100 * (s - 1)).toFixed(0)}% beyond the extrados`
      : `${(100 * s).toFixed(0)}% of the way to the extrados`);
  ui.startValue.textContent = `leaves the springing ${place(state.startFraction)}`;
  ui.splitValue.textContent = Number.isFinite(state.endFraction)
    ? `${ui.split.value}% of the weight here; the line arrives `
      + `${place(state.endFraction)}`
    : `${ui.split.value}% of the weight here; the line does not reach the joint`;
}

/**
 * How often to letter the rays, shared by both drawings.
 *
 * Segment j of the thrust line is parallel to ray j and carries the same
 * letter, so the two drawings MUST be lettered with the same stride or the
 * correspondence -- the entire point of the notation -- silently breaks.
 */
function raysStride() {
  return labelStride(state.fp ? state.fp.stations.length : 0);
}

/**
 * Hinges, macro-blocks and the degree of freedom, from the line just computed.
 *
 * The count is the classical one: the two springings are hinges throughout, so
 * h hinges carry h-1 bodies and the arch has 3(h-1) - 2h = h - 3 degrees of
 * freedom. Two hinges is once hyperstatic and undetermined, three is the
 * three-pin arch, four is a mechanism.
 */
function reportMechanism(thrustFraction) {
  const m = state.model;
  // An empty desk is a legitimate state: the app opens on one.
  if (!m) {
    state.mech = null;
    ui.mechVerdict.className = 'verdict';
    ui.mechVerdict.textContent = '—';
    ui.mechCount.textContent = '';
    ui.mechBand.textContent = '';
    ui.mechAmp.disabled = true;
    return;
  }
  if (!m.joints || !state.crossings) {
    state.mech = null;
    ui.mechVerdict.className = 'verdict';
    ui.mechVerdict.textContent = m.joints ? '—' : noJointsReason(m);
    ui.mechCount.textContent = '';
    ui.mechBand.textContent = '';
    ui.mechAmp.disabled = true;
    return;
  }

  // With both ends imposed, A and B ARE the supports: the arch is held where
  // the user put them, not at the end joints, and the chain must be closed
  // there or the kinematics has nothing to turn about.
  const imposedSupports = (ui.imposeEnds.checked && state.ends.A && state.ends.B)
    ? (state.ends.A[0] >= state.ends.B[0]
      ? { B: state.ends.A, A: state.ends.B }
      : { B: state.ends.B, A: state.ends.A })
    : null;
  const a = analyse(state.crossings, m.joints, m.blocks.length,
    undefined, imposedSupports);
  state.mech = a;

  ui.mechVerdict.className = `verdict ${a.dof > 0 ? 'bad' : a.dof === 0 ? 'ok' : ''}`;
  // "no support hinges located" states the symptom. When the ends have been
  // imposed inside the arch the line never reaches the springing joints, and
  // saying which of the two is unreachable is the difference between a message
  // that puzzles and one that can be acted on.
  const cr = state.crossings;
  // Out of reach is not only "never crossed": a line that stops short still
  // meets the joint's INFINITE line, and jointCrossings hands that back with
  // `inside` false and an s far outside [0,1]. Counting it as a support would
  // put a hinge at s = -2.3.
  const reached = (c) => !!c && c.inside !== false;
  const lost = cr
    ? (reached(cr[0]) ? 0 : 1) + (reached(cr[cr.length - 1]) ? 0 : 1) : 0;
  ui.mechVerdict.textContent = (a.hingeCount < 2 && lost)
    ? `the line of thrust does not reach ${lost === 2 ? 'either springing' : 'one springing'}`
      + ' — imposed ends inside the arch leave nothing to hinge about'
    : a.verdict;

  const faces = a.hinges
    .map((h, i) => `${String.fromCharCode(65 + i)} ${h.support ? 'support' : h.face}`)
    .join(', ');
  ui.mechCount.textContent =
    `${a.hingeCount} hinges (${faces}) · ${a.bodyCount} `
    + `${a.bodyCount === 1 ? 'body' : 'bodies'} · constraint multiplicity `
    + `${a.constraints} · 3×${a.bodyCount} − ${a.constraints} = ${a.dof}`;

  // A positive degree of freedom is not by itself a collapse. If no sense of
  // the motion opens every joint, the pattern would need the masonry to pass
  // through itself, and there is nothing to animate.
  const runnable = a.dof > 0 && a.kinematic;
  ui.mechAmp.disabled = !runnable;
  if (!runnable) ui.mechAmp.value = 0;
  if (a.dof > 0 && !a.kinematic) {
    ui.mechVerdict.className = 'verdict';
    ui.mechCount.textContent += `  ·  joint openings `
      + `${a.openings.map((v) => v.toPrecision(2)).join(', ')}`;
  }

  ui.mechBand.textContent = '';
  if (state.band && thrustFraction !== undefined) {
    const scaled = m.frame && m.frame.coordinates === 'physical';
    const show = (f) => (scaled
      ? format(f * totalLoad(), 'force', state.system)
      : `${(f * totalLoad()).toPrecision(4)} (unscaled)`);
    const beyond = state.beyondBand;
    ui.mechBand.textContent =
      `stands between H = ${show(state.band.min)} and ${show(state.band.max)}`
      + (beyond
        ? `  ·  held at H ${beyond > 0 ? 'max' : 'min'}: past it no line fits `
          + 'inside the ring, and the arch is moving'
        : `  ·  now ${(thrustFraction / state.band.max).toFixed(2)} of H max`);
  }
}

/** Say where the ends are and how well the construction closed. */
function reportImposed(got) {
  const m = state.model;
  const scaled = m.frame && m.frame.coordinates === 'physical';
  const at = (p) => `(${p[0].toPrecision(4)}, ${p[1].toPrecision(4)})`;
  const err = got
    ? (got.closureError < 1e-9
      ? 'closes to machine precision'
      : `closes to ${got.closureError.toPrecision(2)}`)
    : '';
  ui.endsStatus.textContent = state.ends.A && state.ends.B
    ? `A ${at(state.ends.A)} · B ${at(state.ends.B)}`
      + (ui.imposeEnds.checked ? ` · ${err}` : ' · not imposed')
    : 'not set — the ends follow the joints';
  if (scaled) { /* the coordinates already carry the physical frame */ }
}

/** Arm a click on the arch to place one of the two ends. */
function armEnd(which) {
  state.ends.picking = state.ends.picking === which ? null : which;
  if (state.ends.picking) {
    if (traceArmed()) finishTrace();
    if (state.ref.picking) disarmReference();
    if (state.pickingAxis) ui.pickAxis.click();
  }
  for (const [w, ...btns] of [['A', ui.pickA, ui.pickA2], ['B', ui.pickB, ui.pickB2]]) {
    for (const b of btns) {
      b.classList.toggle('armed', state.ends.picking === w);
      b.textContent = state.ends.picking === w ? 'Click on the arch…' : `Pick ${w}`;
    }
  }
  draw();
}

/** Where the thrust slider must sit to ask for a given thrust fraction. */
function sliderForThrust(f) {
  const band = state.band;
  if (!band) return 50;
  // The same mapping the slider is read through, or the buttons land elsewhere
  // than where they say: the travel spans the band and nothing more, so H min
  // is 0 and H max is 100.
  const lo = band.min;
  const hi = band.max;
  // NOT ROUNDED TO A WHOLE PER CENT. H min and H max name a collapse state,
  // and rounding the slider to the nearest integer step lands beside it: on
  // Example_3_Heyman_arch the button asked for 4.24 % of the travel, got 4 %,
  // and the least clearance came out at 0.026 -- above the 0.02 that counts as
  // touching, so the panel answered "once hyperstatic" to a press of "H min".
  // The slider's step is 0.01, so the position it is given survives.
  return Math.max(0, Math.min(100, (100 * (f - lo)) / (hi - lo)));
}

/** Rebuild the force polygon and the thrust line for the current pole. */
function recompute() {
  const m = state.model;
  state.fp = null;
  state.lot = null;
  if (!m || !m.blocks || !m.blocks.length || !state.basePole) {
    state.seq = null;
    state.pole = null;
    state.segForces = null;
    state.crossings = null;
    setThrustEnabled(false);
    ui.thrustValue.textContent = 'trace the arch first';
    ui.thrustValueM.textContent = ui.thrustValue.textContent;
    ui.thrustValueP.textContent = ui.thrustValue.textContent;
    reportEnds(null);
    reportMechanism();
    return;
  }

  // ONLY WHEN THERE IS A STORED SOLUTION TO FALL BACK ON. `consistency` fails
  // for two quite different reasons: a stored solution that does not match its
  // geometry, which must be shown as saved and not redrawn, and NO stored
  // solution at all, which is not a defect and leaves the arch free to be
  // solved from scratch.
  if (!state.consistent.ok && (m.forcePolygon || !state.basePole)) {
    // Cannot recompute; show what was stored, and say so.
    state.lot = m.thrustLine
      ? { points: m.thrustLine, closed: true, closureError: 0 }
      : null;
    setThrustEnabled(false);
    ui.thrustValue.textContent = 'not available for this example';
    reportEnds(null);
    assessAdmissibility();
    reportMechanism();
    return;
  }
  setThrustEnabled(true);

  // The slider scales the pole's distance from the load line between a fifth
  // and five times what the example was saved with, on a log scale so the
  // middle of the travel is the saved state.
  const t = (Number(ui.thrust.value) - 50) / 50;      // -1 .. 1
  const factor = Math.pow(5, t);
  // The pole's ORDINATE is left exactly where it was. For a stored example it
  // is the one recovered from the saved force polygon, and moving it would
  // stop the app reproducing that example at the middle of the slider.
  // Adding a load lengthens the load line, which is the view's problem, not
  // the pole's.
  // The pole's ORDINATE divides the load line, and so divides the total weight
  // between the two vertical reactions: at half the load the arch is
  // symmetric. For a stored example it is left exactly where the saved force
  // polygon put it -- moving it would stop the app reproducing that example at
  // the middle of the slider -- and the slider is disabled. A traced arch has
  // joints, so its ends can slide and the ordinate becomes a free parameter.
  const ends = endJoints();
  let ordinate = state.basePole[1];
  if (ends) {
    const share = Number(ui.split.value) / 100;      // of the total weight
    ordinate = -totalLoad() * share;
  }
  const pole = [state.basePole[0] * factor, ordinate];
  state.pole = pole;

  // Blocks and applied forces go into ONE sequence, ordered by x. From the
  // funicular's point of view a point load at a station is a load at a
  // station, and the whole construction is indifferent to which it is.
  const seq = blocksLike(
    { centroids: m.centroids, weights: m.weights,
      areas: m.areas ?? m.centroids.map(() => 0),
      thickness: m.thickness ?? m.centroids.map(() => 0) },
    state.forces,
  );
  state.seq = seq;

  // MECHANISM MODE. The thrust slider alone commands the line: the other two
  // parameters are chosen to hold it as far from both faces as it will go, so
  // that hinges appear only when the thrust really forces them to. The travel
  // runs a little past both collapse thrusts, so the far end of the slider
  // shows the arch turned into a mechanism rather than simply stopping.
  if (ends && ui.mechOn.checked) {
    // Keyed on a signature rather than invalidated by hand from each of the
    // half-dozen places that can change the arch: tracing, scaling, adding a
    // load, reopening a file. A missed one would leave a stale band on screen.
    const key = `${m.blocks.length}:${m.joints.length}:${totalLoad().toPrecision(12)}`;
    if (state.bandKey !== key) {
      state.band = collapseRange(seq, m.joints);
      state.bandKey = key;
    }
    const band = state.band;
    if (band) {
      // THE SLIDER SPANS THE BAND AND NOTHING MORE. It used to run 15 per cent
      // past both edges, so that the far end would show the arch as a
      // mechanism; but with the line now held inside the masonry, that
      // overshoot is travel that does nothing -- the state at 80 per cent and
      // at 100 per cent are the same held limit state. Mapping the travel onto
      // the band exactly makes every position of the slider a distinct
      // equilibrium, and puts the two collapse states at the two ends, where
      // the hinges appear and the verdict turns.
      const u = Number(ui.thrust.value) / 100;
      const asked = band.min + (band.max - band.min) * u;
      // THE LINE OF THRUST CANNOT LEAVE THE MASONRY. Outside the band no line
      // fits, and the free funicular drawn there was not a solution of
      // anything: at 1.25 H max it left the ring by four fifths of a joint on
      // one face and by four fifths again on the other. Asking for a thrust
      // beyond the band therefore holds the line at the limit state, which is
      // a real admissible line, tangent to the faces at the hinges; the panel
      // says that this is what it is and that beyond it the arch is moving.
      const best = constrainedLine(seq, m.joints, band, asked);
      const f = best ? best.thrust : asked;
      state.beyondBand = best ? best.beyond : 0;
      if (best) {
        if (!state.frozenBranch) {
          state.frozenBranch = freezeBranch(best.lot, best.crossings,
            m.joints, m.blocks.length);
        }
        const frozen = state.frozenBranch
          ? lineWithFrozenBranch(seq, m.joints, state.frozenBranch, asked)
          : null;
        if (frozen && frozen.crossings.every((c) => c && c.inside !== false)) {
          best.lot = frozen.lot;
          best.fp = frozen.fp;
          best.crossings = frozen.crossings;
          best.clearance = frozen.clearance;
        }
        state.pole = best.fp.pole;
        state.fp = best.fp;
        state.lot = best.lot;
        state.startFraction = best.s;
        state.endFraction = best.lot.endFraction;
        state.segForces = state.fp.magnitudes.length === best.lot.points.length - 1
          ? state.fp.magnitudes.map((r) => r[2])
          : Array.from({ length: best.lot.points.length - 1 },
            () => state.fp.thrust);
        // The sliders are shown following the search rather than commanding
        // it, so what is on screen always describes the line being drawn.
        ui.startPos.value = Math.round(best.s * 100);
        ui.split.value = Math.round(best.split * 100);
        assessAdmissibility();
        reportEnds(ends);
        reportMechanism(f);
        return;
      }
    }
  }
  state.mech = null;
  state.beyondBand = 0;
  if (!ui.mechOn.checked) state.frozenBranch = null;

  // BOTH ENDS IMPOSED. The thrust stays the student's; the pole's ordinate is
  // whatever carries the line from A to B, found by one trial and one exact
  // correction. The other two sliders become readouts, as in mechanism mode.
  if (state.ends.A && state.ends.B && ui.imposeEnds.checked) {
    const [P, Q] = state.ends.A[0] >= state.ends.B[0]
      ? [state.ends.A, state.ends.B] : [state.ends.B, state.ends.A];
    // WHICH VOUSSOIRS THE LINE IS CARRYING follows from where the ends were
    // put. A block whose centroid falls outside A and B is not between the two
    // points the line runs between, and its weight belongs to the abutment.
    const span = betweenEnds(seq, P, Q);
    state.spanKept = span.kept;
    // The TRIAL is the pole the sliders are currently asking for. That makes
    // the construction responsive: moving the reaction slider moves O' and
    // stretches the correction, while O stays exactly where it was -- which is
    // the property worth seeing, and the one the tests assert.
    // With the mechanism on, the line must stay inside the masonry here too.
    // Only the thrust is free once the ends are fixed, so the family has a
    // band of its own -- narrower than the free one, two of the three degrees
    // of freedom having been spent on the two points -- and the demanded
    // thrust is held inside it.
    const solveAt = (f) => {
      const total = span.weights.reduce((a, b) => a + b, 0);
      const g = poleForEnds(span.weights, span.centroids, P, Q,
        total * f, pole[1]);
      if (!g) return null;
      const fpTry = forcePolygon(span.weights, g.pole);
      const lotTry = funicular(fpTry, span.centroids, P, Q);
      return { g, fp: fpTry, lot: lotTry,
        crossings: jointCrossings(lotTry.points, m.joints) };
    };
    const first = span.weights.length
      ? poleForEnds(span.weights, span.centroids, P, Q, pole[0], pole[1])
      : null;
    let solved = null;
    if (first) {
      const fpTry = forcePolygon(span.weights, first.pole);
      const lotTry = funicular(fpTry, span.centroids, P, Q);
      solved = {
        g: first,
        fp: fpTry,
        lot: lotTry,
        crossings: jointCrossings(lotTry.points, m.joints),
      };
    }
    // WHENEVER THE MECHANISM IS ACTIVE, not only when the thrust is driving it.
    // Showing the mechanism is activating it: the hinges are being read off the
    // line, so the line has to be one the masonry could carry. Gated on
    // `mechOn` alone, a user who imposed the ends and simply switched the
    // mechanism on saw the line stay fixed at A and B -- and leave the ring at
    // the interior hinge, which is the case that was reported.
    const mechActive = ui.mechOn.checked || ui.showMech.checked;
    if (solved && mechActive && span.weights.length) {
      const total = span.weights.reduce((a, b) => a + b, 0);
      const key = `imposed:${span.kept.length}:${total.toPrecision(12)}:`
        + `${P.map((v) => v.toFixed(4))}:${Q.map((v) => v.toFixed(4))}`;
      if (state.imposedKey !== key) {
        state.imposedRange = imposedBand(solveAt);
        state.imposedKey = key;
      }
      const range = state.imposedRange;
      if (range) {
        const asked = Math.abs(solved.g.pole[0]) / total;
        const held = Math.min(Math.max(asked, range.min), range.max);
        state.beyondBand = asked > range.max ? 1 : asked < range.min ? -1 : 0;
        if (state.beyondBand) {
          const redone = solveAt(held);
          if (redone) solved = redone;
        }
      }
    }
    if (solved) {
      state.pole = solved.g.pole;
      state.fp = solved.fp;
      state.lot = solved.lot;
      state.ends.construction = solved.g;
      state.startFraction = null;
      state.endFraction = null;
      state.segForces = state.fp.magnitudes.map((r) => r[2]);
      assessAdmissibility();
      reportEnds(null);
      reportImposed(got);
      reportMechanism();
      return;
    }
  }
  state.ends.construction = null;

  state.fp = forcePolygon(seq.weights, pole);
  if (ends) {
    // BOTH ENDS FREE. The line starts at a chosen fraction of one springing
    // joint and its last segment is carried on until it meets the other. The
    // old construction pinned both at the joint mid-points, which threw away
    // two of the three degrees of freedom and made this tool reject rings that
    // Heyman's criterion accepts: a semicircular ring needed t/ri of about
    // 0.20 against his 0.108. With the ends free the same ring manages 0.115,
    // and the limit line comes out running through the extrados at both
    // springings, exactly as the theory says it should.
    state.startFraction = Number(ui.startPos.value) / 100;
    state.lot = freeThrustLine(state.fp, seq.centroids,
      ends.start, ends.end, state.startFraction);
    state.endFraction = state.lot.endFraction;
  } else if (m.pointA && m.pointB) {
    state.startFraction = null;
    state.endFraction = null;
    state.lot = funicular(state.fp, seq.centroids, m.pointB, m.pointA);
  } else {
    // Neither joints for the ends to slide along nor stored springings to pin
    // them to. The force polygon is still right and is drawn; the line needs
    // two points, and the student has a picker for exactly that.
    state.startFraction = null;
    state.endFraction = null;
    state.lot = null;
    state.segForces = state.fp.magnitudes.map((r) => r[2]);
    assessAdmissibility();
    reportEnds(null);
    reportMechanism();
    ui.endsStatus.textContent =
      'this example carries no joints and no springings — pick both ends, '
      + 'or trace the arch, to place the line';
    ui.thrustValue.textContent = 'H = '
      + `${state.fp.thrust.toPrecision(4)} (unscaled)`;
    ui.thrustValueM.textContent = ui.thrustValue.textContent;
    ui.thrustValueP.textContent = ui.thrustValue.textContent;
    return;
  }
  state.segForces = state.fp.magnitudes.map((r) => r[2]);
  assessAdmissibility();
  reportEnds(ends);
  // ALWAYS, not only in mechanism mode. Reporting the hinges only on the
  // branch that drives from the thrust left the previous arch's verdict on
  // screen: choosing a Poleni dome after a Heyman arch went on saying
  // "isostatic -- three hinges" about an arch the panel had no joints for.
  reportMechanism();

  const scaled = m.frame && m.frame.coordinates === 'physical';
  const reading = `H = ${scaled ? format(state.fp.thrust, 'force', state.system)
    : `${state.fp.thrust.toPrecision(4)} (unscaled)`}`
    + `  ·  ×${factor.toFixed(2)} of the reference pole`;
  ui.thrustValue.textContent = reading;
  ui.thrustValueM.textContent = reading;
  ui.thrustValueP.textContent = reading;
}

/**
 * Heyman's condition: does the thrust line stay inside the ring?
 *
 * Reported joint by joint. `s` runs from 0 at the intrados to 1 at the
 * extrados, so anything outside [0, 1] is a joint where the line has left the
 * masonry and no equilibrium is possible in that configuration.
 */
function assessAdmissibility() {
  const m = state.model;
  state.crossings = null;
  if (!m.joints || !state.lot) {
    ui.admissible.className = 'verdict';
    ui.admissible.textContent = m.joints ? '—' : noJointsReason(m);
    return;
  }

  const cr = jointCrossings(state.lot.points, m.joints);
  state.crossings = cr;
  const missing = cr.filter((c) => c === null).length;
  const out = cr.filter((c) => c && !c.inside);
  const inside = cr.filter((c) => c && c.inside);

  if (missing) {
    ui.admissible.className = 'verdict bad';
    ui.admissible.textContent =
      `${missing} joint(s) are not crossed at all: the line does not span ` +
      'the arch.';
    return;
  }
  if (out.length) {
    // How far out, and where: the worst joint is the one to look at.
    let worst = out[0];
    for (const c of out) {
      const miss = (x) => (x.s < 0 ? -x.s : x.s - 1);
      if (miss(c) > miss(worst)) worst = c;
    }
    const side = worst.s < 0 ? 'below the intrados' : 'beyond the extrados';
    ui.admissible.className = 'verdict bad';
    ui.admissible.textContent =
      `NOT admissible — the line leaves the ring at ${out.length} of ` +
      `${cr.length} joints, worst ${side} by ` +
      `${(100 * Math.abs(worst.s < 0 ? worst.s : worst.s - 1)).toFixed(0)}% ` +
      'of the joint.';
    return;
  }
  // Inside everywhere: report how much room is left, which is the closest the
  // line comes to either face.
  const margin = Math.min(...inside.map((c) => Math.min(c.s, 1 - c.s)));
  ui.admissible.className = 'verdict ok';
  ui.admissible.textContent =
    `Admissible — the line stays inside all ${cr.length} joints, closest ` +
    `approach ${(100 * margin).toFixed(0)}% of the joint from a face. ` +
    'By the safe theorem, the arch stands.';
}

function imageBounds(m) {
  if (!m) return null;
  if (m.imageDrawSize) {
    return { xmin: 0, xmax: m.imageDrawSize[0], ymin: 0, ymax: m.imageDrawSize[1] };
  }
  if (m.imageSize) {
    const upp = m.frame?.coordinates === 'physical'
      ? m.frame.units_per_pixel : 1;
    return { xmin: 0, xmax: m.imageSize[0] * upp, ymin: 0, ymax: m.imageSize[1] * upp };
  }
  return null;
}

function mergeBounds(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    xmin: Math.min(a.xmin, b.xmin),
    xmax: Math.max(a.xmax, b.xmax),
    ymin: Math.min(a.ymin, b.ymin),
    ymax: Math.max(a.ymax, b.ymax),
  };
}

function fitViews() {
  const m = state.model;
  if (!m) return;
  mainAx.syncSize();
  forceAx.syncSize();
  plotAx.syncSize();

  const blockBounds = m.blocks && m.blocks.length ? bounds(m.blocks) : null;
  const b = mergeBounds(blockBounds, imageBounds(m))
    ?? { xmin: 0, xmax: 1, ymin: 0, ymax: 1 };
  mainAx.fit(b);

  fitForceView();
  plotAx.fit(plotContentBounds(), 0.12);
  state.plotFitKey = null;
}

function fitForceView() {
  if (!state.fp) return;
  forceAx.syncSize();
  const xs = [0, state.fp.pole[0]];
  const ys = [...state.fp.stations, state.fp.pole[1]];
  forceAx.fit({
    xmin: Math.min(...xs), xmax: Math.max(...xs),
    ymin: Math.min(...ys), ymax: Math.max(...ys),
  }, 0.12);
}

/**
 * What one data unit is called, in each of the two panes.
 *
 * The arch is drawn in the model's own frame, so it is metres only once the
 * arch has been scaled and pixels until then -- and a bar reading "200 px" is
 * the most visible warning on the drawing that the numbers are not yet
 * lengths. On the force polygon EVERY LENGTH IS A FORCE: the load line is the
 * weights end to end and the pole's abscissa is the horizontal thrust, so that
 * bar carries the force label of the same system, and "(unscaled)" where the
 * panels say the same.
 */
function barUnits() {
  const m = state.model;
  const scaled = m && m.frame && m.frame.coordinates === 'physical';
  const sys = SYSTEMS[state.system];
  return {
    length: scaled ? (sys?.length.label ?? '') : 'px',
    force: scaled ? (sys?.force.label ?? '') : '(unscaled)',
  };
}

function draw() {
  const m = state.model;
  if (!m) return;

  mainAx.begin();
  mainAx.reequalize();
  if (ui.showImage.checked && state.image && m.imageSize) {
    mainAx.clipped((c) => {
      // The stored file may be downscaled; the coordinates always refer to the
      // ORIGINAL pixel size, so the image is stretched onto that frame.
      const upp = m.frame.coordinates === 'physical'
        ? m.frame.units_per_pixel : 1;
      const W = m.imageDrawSize ? m.imageDrawSize[0] : m.imageSize[0] * upp;
      const H = m.imageDrawSize ? m.imageDrawSize[1] : m.imageSize[1] * upp;
      const [xa, ya] = mainAx.toPx([0, 0]);
      const [xb, yb] = mainAx.toPx([W, H]);
      const x = Math.min(xa, xb);
      const y = Math.min(ya, yb);
      const w = Math.abs(xb - xa);
      const h = Math.abs(yb - ya);
      c.save();
      c.globalAlpha = 0.85;
      // Row 0 of a photograph is its TOP, which in the pixel frame is y = 0.
      // With the axis running upward, y = 0 is at the bottom of the box, so
      // the image has to be reflected about its own rectangle or it comes out
      // upside down -- the whole figure, lettering included.
      if (mainAx.yUp) {
        c.translate(0, 2 * y + h);
        c.scale(1, -1);
      }
      c.drawImage(state.image, x, y, w, h);
      c.restore();
    });
  }
  if (ui.showBlocks.checked) {
    if (ui.showMech.checked && state.mech) {
      // While a mechanism is on show, what matters is which pieces move
      // together, not that adjacent stones are distinguishable.
      drawMacroBlocks(mainAx, m.blocks, state.mech.bodyOf);
    } else {
      drawBlocks(mainAx, m.blocks, { labels: ui.showLabels.checked });
    }
  }
  if (ui.showWeights.checked && m.centroids && m.weights) {
    drawWeights(mainAx, m.centroids, m.weights);
  }
  if (sideView() === 'radius' && state.ringAuto) drawRingStudyCurves();
  if (ui.showThrust.checked && state.lot) {
    drawThrustLine(mainAx, state.lot.points, state.segForces);
    if (ui.showRays.checked) {
      drawThrustLabels(mainAx, state.lot.points, { stride: raysStride() });
    }
  }
  if (ui.showReactions.checked && state.lot && state.fp) {
    drawSupportReactions();
  }
  if (ui.showCable.checked && state.lot) {
    // Reflected about the CHORD through the two ends, so the cable is hung
    // from A and B themselves. Reflecting about a horizontal line, as this
    // used to, left the cable floating clear of the springings on any arch
    // that was not symmetric -- which is exactly when the analogy is worth
    // looking at.
    drawCable(mainAx, hangingCable(state.lot.points), {
      weights: state.seq ? state.seq.weights : null,
      weightScale: (Number(ui.cableWeights.value) / 100) * 40,
    });
  }
  if (ui.showMech.checked && state.mech) {
    const a = state.mech;
    const amp = (Number(ui.mechAmp.value) / 100) * 0.25;   // radians, capped
    if (a.dof > 0 && amp > 0) {
      const T = displacedConfiguration(a.hinges, a.bodies, amp);
      drawMechanism(mainAx, displaced(m.blocks, a.bodyOf, T));
      drawCentres(mainAx, a.motion);
    }
    drawHinges(mainAx, a.hinges);
  }
  if (state.ends.construction) {
    drawPreliminary(mainAx, state.ends.construction.preliminary.points);
  }
  if (state.ends.A || state.ends.B) drawEnds(mainAx, state.ends.A, state.ends.B);
  drawSupports(mainAx, m.pointA, m.pointB);
  if (ui.showJoints.checked || state.selectedJoint !== null) drawJoints();
  drawTrace();
  drawThreePointRingPicks();
  drawProfiles();
  drawForces();
  drawReference();
  mainAx.decorate();
  if (ui.showScale.checked) drawScaleBar(mainAx, { unit: barUnits().length });

  if (sideView() === 'solid') {
    drawSolidView();
    return;
  }
  if (sideView() === 'heyman') {
    drawHeymanView();
    return;
  }
  if (sideView() === 'radius') {
    drawRadiusView();
    return;
  }
  forceAx.begin();
  forceAx.reequalize();
  if (state.fp) {
    drawForcePolygon(forceAx, state.fp, {
      rayLabels: ui.showRays.checked,
      stride: raysStride(),
      reactions: ui.showReactions.checked,
      reactionLabels: reactionLabels(),
      construction: state.ends.construction,
    });
  }
  forceAx.decorate();
  if (ui.showScale.checked) drawScaleBar(forceAx, { unit: barUnits().force });
}

function segmentForceAt(segment) {
  if (!state.segForces || !state.segForces.length) return NaN;
  return state.segForces[Math.min(segment, state.segForces.length - 1)];
}

function selectedHeymanPoint() {
  const i = state.selectedJoint;
  const m = state.model;
  if (i === null || !m?.joints || !state.crossings) return null;
  const crossing = state.crossings[i];
  if (!crossing) return null;
  return heymanPoint(m.joints[i], crossing, segmentForceAt(crossing.segment ?? i));
}

function allHeymanPoints() {
  const m = state.model;
  if (!m?.joints || !state.crossings) return [];
  return state.crossings
    .map((c, i) => {
      if (!c) return null;
      const p = heymanPoint(m.joints[i], c, segmentForceAt(c.segment ?? i));
      return p ? { ...p, joint: i } : null;
    })
    .filter(Boolean);
}

function heymanSafetyPoints(points) {
  const last = (state.model?.joints?.length ?? 0) - 1;
  const imposed = ui.imposeEnds.checked && state.ends.A && state.ends.B;
  if (!imposed || last < 1) return points;
  return points.filter((p) => p.joint !== 0 && p.joint !== last);
}

function heymanSafetyLabel(safety) {
  if (!safety) return 'GSF = n/a';
  if (!Number.isFinite(safety.factor)) return 'GSF = inf';
  return `GSF = ${safety.factor.toPrecision(3)}`;
}

function heymanFrame() {
  const pts = allHeymanPoints();
  const joints = state.model?.joints ?? [];
  const nMax = 1.1 * Math.max(1, ...pts.map((p) => Math.abs(p.N)));
  const tMax = Math.max(1, ...joints.map((j) => Math.hypot(
    j.b[0] - j.a[0], j.b[1] - j.a[1],
  )));
  return { nMax, tMax };
}

function radiusYValue(p) {
  return state.radiusMetric === 'thrust'
    ? (p.horizontalThrust ?? p.weight * p.thrust)
    : p.weight;
}

function radiusYLabel() {
  return state.radiusMetric === 'thrust' ? 'horizontal thrust' : 'total weight';
}

function formatRadiusY(value, scaled) {
  return scaled ? format(value, 'force', state.system) : value.toPrecision(4);
}

function reactionForces() {
  const fp = state.fp;
  if (!fp || !fp.stations || !fp.stations.length) return null;
  const top = fp.stations[0];
  const bottom = fp.stations[fp.stations.length - 1];
  return {
    RB: Math.hypot(fp.pole[0], top - fp.pole[1]),
    RA: Math.hypot(fp.pole[0], bottom - fp.pole[1]),
    H: fp.thrust,
  };
}

function drawSupportReactions() {
  const pts = state.lot?.points;
  const r = reactionForces();
  if (!pts || pts.length < 2 || !r) return;
  const scaled = state.model?.frame?.coordinates === 'physical';
  const label = (value) => (scaled
    ? format(value, 'force', state.system)
    : value.toPrecision(4));
  const span = Math.hypot(
    mainAx.view.xmax - mainAx.view.xmin,
    mainAx.view.ymax - mainAx.view.ymin,
  );
  const arrowLen = span * 0.07;
  const drawOne = (at, toward, name, value, side) => {
    const dx = toward[0] - at[0];
    const dy = toward[1] - at[1];
    const len = Math.hypot(dx, dy) || 1;
    const start = [at[0] - (dx / len) * arrowLen, at[1] - (dy / len) * arrowLen];
    drawArrow(mainAx, start, at, '#0072BD', 12, 2.6);
    mainAx.clipped((c) => {
      const [X, Y] = mainAx.toPx(start);
      drawReactionLabel(c, X + (side === 'left' ? -5 : 5), Y - 4, name, label(value), {
        align: side,
        baseline: 'bottom',
      });
    });
  };
  drawOne(pts[0], pts[1], 'R_B', r.RB, 'left');
  drawOne(pts[pts.length - 1], pts[pts.length - 2], 'R_A', r.RA, 'right');
}

function reactionLabels() {
  const r = reactionForces();
  if (!r) return null;
  const scaled = state.model?.frame?.coordinates === 'physical';
  const f = (v) => (scaled ? format(v, 'force', state.system) : v.toPrecision(4));
  return {
    RA: f(r.RA),
    RB: f(r.RB),
    H: `H = ${f(r.H)}`,
  };
}

function plotContentBounds() {
  if (sideView() === 'heyman') {
    const { nMax, tMax } = heymanFrame();
    const domain = heymanDomain(tMax, nMax);
    const pts = allHeymanPoints();
    const xs = domain.map((q) => q.N).concat(pts.map((q) => q.N), 0);
    const ys = domain.map((q) => q.M).concat(pts.map((q) => q.M), 0);
    return {
      xmin: Math.min(...xs), xmax: Math.max(...xs),
      ymin: Math.min(...ys), ymax: Math.max(...ys),
    };
  }
  const pts = state.thicknessStudy?.points ?? [];
  if (!pts.length) return { xmin: 0, xmax: 1, ymin: 0, ymax: 1 };
  return {
    xmin: Math.min(...pts.map((q) => q.plotTri ?? q.tri)),
    xmax: Math.max(...pts.map((q) => q.plotTri ?? q.tri)),
    ymin: 0,
    ymax: Math.max(...pts.map((q) => radiusYValue(q))),
  };
}

function ensurePlotFit() {
  const frame = heymanFrame();
  const mode = sideView() === 'heyman'
    ? `nm:${state.model?.joints?.length ?? 0}:${state.segForces?.join(',') ?? ''}:`
      + `${frame.nMax}:${frame.tMax}`
    : `study:${state.thicknessStudy?.points?.length ?? 0}:`
      + `${state.thicknessStudy?.minTri ?? ''}:${state.thicknessStudy?.maxTri ?? ''}:`
      + `${state.radiusMetric}`;
  if (state.plotFitKey === mode) return;
  plotAx.syncSize();
  plotAx.fit(plotContentBounds(), 0.12);
  state.plotFitKey = mode;
}

function drawPolyline(ax, pts, colour = '#0072BD', width = 2) {
  if (!pts.length) return;
  ax.clipped((c) => {
    c.beginPath();
    pts.forEach((p, i) => {
      const [X, Y] = ax.toPx(p);
      if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
    });
    c.strokeStyle = colour;
    c.lineWidth = width;
    c.stroke();
  });
}

function drawMarker(ax, p, colour = '#A2142F', radius = 4, stroke = null) {
  ax.clipped((c) => {
    const [X, Y] = ax.toPx(p);
    c.beginPath();
    c.arc(X, Y, radius, 0, 2 * Math.PI);
    c.fillStyle = colour;
    c.fill();
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 1.4;
      c.stroke();
    }
  });
}

function radiusEnvelope(pts, admissible) {
  return radiusHull(pts.filter((p) => !!p.admissible === admissible));
}

function radiusHull(pts) {
  const entries = pts
    .map((p) => ({ p, x: p.plotTri ?? p.tri, y: radiusYValue(p) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .sort((a, b) => (a.x - b.x) || (a.y - b.y));
  if (entries.length <= 2) return entries;

  const unique = [];
  for (const item of entries) {
    const last = unique[unique.length - 1];
    if (!last || Math.abs(last.x - item.x) > 1e-12 || Math.abs(last.y - item.y) > 1e-12) {
      unique.push(item);
    }
  }
  if (unique.length <= 2) return unique;

  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (const p of unique.slice().reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function drawRadiusEnvelope(pts, admissible) {
  const env = radiusEnvelope(pts, admissible);
  if (env.length < 2) return new Set(env.map((q) => q.p));
  const fill = admissible ? 'rgba(46,125,50,0.13)' : 'rgba(162,20,47,0.10)';
  const stroke = admissible ? 'rgba(46,125,50,0.45)' : 'rgba(162,20,47,0.38)';
  plotAx.clipped((c) => {
    c.beginPath();
    env.forEach((p, i) => {
      const [X, Y] = plotAx.toPx([p.x, p.y]);
      if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
    });
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    c.strokeStyle = stroke;
    c.lineWidth = 1.1;
    c.stroke();
  });
  return new Set(env.map((q) => q.p));
}

function drawRingStudyCurves() {
  const pts = state.thicknessStudy?.points ?? [];
  const visible = new Set(state.visibleStudyTris.map((tri) => tri.toPrecision(12)));
  mainAx.clipped((c) => {
    for (const p of pts) {
      if (!visible.has(p.tri.toPrecision(12))) continue;
      if (!p.lot || p.lot.length < 2) continue;
      c.beginPath();
      p.lot.forEach((q, i) => {
        const [X, Y] = mainAx.toPx(q);
        if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
      });
      c.strokeStyle = p.admissible ? 'rgba(46,125,50,0.45)' : 'rgba(162,20,47,0.28)';
      c.lineWidth = p.admissible ? 1.8 : 0.8;
      c.stroke();
    }
  });
}

function drawAxisLetters(ax) {
  ax.clipped((c) => {
    const b = ax.box;
    const [x0, y0] = ax.toPx([0, 0]);
    c.save();
    c.strokeStyle = '#000';
    c.fillStyle = '#262626';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(b.x, y0); c.lineTo(b.x + b.w, y0);
    c.moveTo(x0, b.y); c.lineTo(x0, b.y + b.h);
    c.stroke();

    c.beginPath();
    c.moveTo(b.x + b.w, y0);
    c.lineTo(b.x + b.w - 8, y0 - 4);
    c.moveTo(b.x + b.w, y0);
    c.lineTo(b.x + b.w - 8, y0 + 4);
    c.moveTo(x0, b.y);
    c.lineTo(x0 - 4, b.y + 8);
    c.moveTo(x0, b.y);
    c.lineTo(x0 + 4, b.y + 8);
    c.stroke();

    c.font = 'bold 13.2px Helvetica, Arial, sans-serif';
    c.textAlign = 'right';
    c.textBaseline = 'bottom';
    c.fillText('N', b.x + b.w - 10, y0 - 5);
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillText('M', x0 + 6, b.y + 9);
    c.restore();
  });
}

function drawHeymanView() {
  ensurePlotFit();
  plotAx.begin();
  plotAx.title = state.selectedJoint !== null
    ? `Heyman N-M, joint ${state.selectedJoint}` : 'Heyman N-M';
  plotAx.xlabel = 'N';
  plotAx.ylabel = 'M';
  const nm = selectedHeymanPoint();
  const allPts = allHeymanPoints();
  const safety = heymanGeometricalSafety(heymanSafetyPoints(allPts));
  if (!nm) {
    drawAxisLetters(plotAx);
    ui.plotStatus.textContent = state.selectedJoint !== null
      ? `joint ${state.selectedJoint}: joint not crossed`
      : `Click a joint to show its Heyman N-M diagram. ${heymanSafetyLabel(safety)}`;
    plotAx.decorate();
    return;
  }

  const { nMax } = heymanFrame();
  const d = heymanDomain(nm.thickness, nMax);
  const third = thirdMiddleBand(nm.thickness, nMax);
  plotAx.clipped((c) => {
    c.beginPath();
    d.forEach((q, i) => {
      const [X, Y] = plotAx.toPx([q.N, q.M]);
      if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
    });
    c.closePath();
    c.fillStyle = 'rgba(46,125,50,0.16)';
    c.fill();
    c.strokeStyle = '#000';
    c.lineWidth = 1.4;
    for (const end of d.slice(1)) {
      c.beginPath();
      let [X, Y] = plotAx.toPx([0, 0]);
      c.moveTo(X, Y);
      [X, Y] = plotAx.toPx([end.N, end.M]);
      c.lineTo(X, Y);
      c.stroke();
    }

    c.setLineDash([6, 4]);
    c.strokeStyle = '#2e7d32';
    c.lineWidth = 1;
    for (const end of third.slice(1)) {
      c.beginPath();
      let [X, Y] = plotAx.toPx([0, 0]);
      c.moveTo(X, Y);
      [X, Y] = plotAx.toPx([end.N, end.M]);
      c.lineTo(X, Y);
      c.stroke();
    }
    c.setLineDash([]);

    c.font = '10px Helvetica, Arial, sans-serif';
    c.fillStyle = '#2e7d32';
    c.textAlign = 'left';
    let [lx, ly] = plotAx.toPx([d[1].N, d[1].M]);
    c.textBaseline = 'bottom';
    c.fillText('extrados', lx + 5, ly - 2);
    [lx, ly] = plotAx.toPx([d[2].N, d[2].M]);
    c.textBaseline = 'top';
    c.fillText('intrados', lx + 5, ly + 2);
    [lx, ly] = plotAx.toPx([third[1].N, third[1].M]);
    c.textBaseline = 'bottom';
    c.fillText('middle third', lx + 5, ly - 2);
  });
  drawAxisLetters(plotAx);
  for (const p of allPts) {
    drawMarker(plotAx, [p.N, p.M], 'rgba(110,110,110,0.45)', 2.8);
  }
  if (safety?.point) {
    drawMarker(plotAx, [safety.point.N, safety.point.M], '#fff', 6.2,
      safety.factor >= 1 ? '#2e7d32' : '#A2142F');
  }
  drawMarker(plotAx, [nm.N, nm.M], nm.inside ? '#2e7d32' : '#A2142F');
  plotAx.clipped((c) => {
    const [X, Y] = plotAx.toPx([nm.N, nm.M]);
    c.font = 'bold 10px Helvetica, Arial, sans-serif';
    c.fillStyle = nm.inside ? '#2e7d32' : '#A2142F';
    c.textAlign = 'left';
    c.textBaseline = 'bottom';
    c.fillText('current', X + 6, Y - 5);

    c.font = 'bold 12px Helvetica, Arial, sans-serif';
    c.fillStyle = safety?.factor >= 1 ? '#2e7d32' : '#A2142F';
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillText(heymanSafetyLabel(safety), plotAx.box.x + 10, plotAx.box.y + 10);
    if (safety?.point?.joint !== undefined) {
      c.font = '10px Helvetica, Arial, sans-serif';
      c.fillText(`critical joint ${safety.point.joint}`,
        plotAx.box.x + 10, plotAx.box.y + 27);
    }
  });
  const scaled = state.model?.frame?.coordinates === 'physical';
  ui.plotStatus.textContent = `joint ${state.selectedJoint}: N = `
    + (scaled ? format(nm.N, 'force', state.system) : nm.N.toPrecision(4))
    + `, M = ${nm.M.toPrecision(4)}, ecc = ${nm.ecc.toPrecision(4)}, `
    + `${heymanSafetyLabel(safety)}`;
  plotAx.decorate();
}

function drawRadiusView() {
  ensurePlotFit();
  plotAx.begin();
  plotAx.title = 'Circular ring thickness study';
  plotAx.xlabel = 't/ri';
  plotAx.ylabel = radiusYLabel();
  const pts = state.thicknessStudy?.points ?? [];
  if (pts.length) {
    const visible = new Set([
      ...drawRadiusEnvelope(pts, false),
      ...drawRadiusEnvelope(pts, true),
    ]);
    const shown = pts.filter((p) => visible.has(p));
    for (const p of shown.filter((q) => !q.midBase)) {
      drawMarker(plotAx, [p.plotTri ?? p.tri, radiusYValue(p)],
        p.admissible ? '#2e7d32' : '#A2142F', p.admissible ? 5 : 2.8);
    }
    for (const p of shown.filter((q) => q.midBase)) {
      drawMarker(plotAx, [p.plotTri ?? p.tri, radiusYValue(p)],
        p.admissible ? '#2e7d32' : '#A2142F', p.admissible ? 5.6 : 3.4, '#000');
    }
    const scaled = state.model?.frame?.coordinates === 'physical';
    const current = pts.find((p) => Math.abs(p.tri - state.ringStudySource?.tri) < 1e-9)
      ?? pts[pts.length - 1];
    const good = pts.filter((p) => p.admissible).length;
    const bad = pts.length - good;
    const mode = state.ringStudySource?.poleni ? 'Poleni dome lune' : 'constant thickness';
    ui.plotStatus.textContent =
      `${mode} · ${pts.length} states · ${good} admissible · ${bad} not admissible · `
      + `${shown.length} hull points shown · `
      + `${pts.filter((p) => p.midBase).length} mid-base · `
      + `t/ri step ${ui.ringTri.step} · `
      + `current t/ri = ${current.tri.toPrecision(4)}, ${radiusYLabel()} `
      + formatRadiusY(radiusYValue(current), scaled);
  } else {
    ui.plotStatus.textContent =
      state.thicknessStudy?.reason ?? 'Generate a circular ring to plot t/ri.';
  }
  plotAx.decorate();
}

/* ---------------------------------------------------------------- tracing -- */

const TRACE_COLOUR = { inner: '#0072BD', outer: '#7E2F8E' };

function drawTrace() {
  const t = state.trace;
  if (!t) return;
  mainAx.clipped((c) => {
    for (const which of ['inner', 'outer']) {
      const pts = t[which];
      if (!pts.length) continue;
      const live = t.armed === which && t.cursor
        ? [...pts, t.cursor] : pts;
      c.strokeStyle = TRACE_COLOUR[which];
      c.lineWidth = 2;
      c.setLineDash(t.armed === which ? [5, 3] : []);
      c.beginPath();
      live.forEach((p, i) => {
        const [X, Y] = mainAx.toPx(p);
        if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
      });
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = TRACE_COLOUR[which];
      pts.forEach((p) => {
        const [X, Y] = mainAx.toPx(p);
        c.beginPath();
        c.arc(X, Y, 3, 0, 2 * Math.PI);
        c.fill();
      });
    }
  });
}

function drawJoints() {
  const m = state.model;
  if (!m.joints) return;
  const cr = state.crossings;
  mainAx.clipped((c) => {
    m.joints.forEach((j, i) => {
      const hit = cr && cr[i];
      const bad = hit && !hit.inside;
      const selected = i === state.selectedJoint;
      const [x0, y0] = mainAx.toPx(j.a);
      const [x1, y1] = mainAx.toPx(j.b);
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.strokeStyle = selected ? '#D95319'
        : bad ? '#A2142F' : 'rgba(60,60,60,0.55)';
      c.lineWidth = selected ? 3 : bad ? 2.2 : 0.9;
      c.stroke();
      if (hit) {
        const [X, Y] = mainAx.toPx(hit.point);
        c.beginPath();
        c.arc(X, Y, bad ? 4 : 3, 0, 2 * Math.PI);
        c.fillStyle = bad ? '#A2142F' : '#2e7d32';
        c.fill();
      }
    });
  });
}

function distPointToSegmentPx(p, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0
    : Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
  const x = a[0] + t * vx;
  const y = a[1] + t * vy;
  return Math.hypot(p[0] - x, p[1] - y);
}

function pickJointAt(px) {
  const joints = state.model?.joints;
  if (!joints || !joints.length) return null;
  let best = { i: null, d: Infinity };
  joints.forEach((j, i) => {
    const a = mainAx.toPx(j.a);
    const b = mainAx.toPx(j.b);
    const d = distPointToSegmentPx(px, a, b);
    if (d < best.d) best = { i, d };
  });
  return best.d <= 9 ? best.i : null;
}

function drawForces() {
  const f = state.forces;
  if (!f.points.length) return;
  const max = Math.max(...f.magnitudes.map(Math.abs), 1);
  const span = (mainAx.view.ymax - mainAx.view.ymin) * 0.16;
  mainAx.clipped((c) => {
    f.points.forEach((p, i) => {
      const l = (Math.abs(f.magnitudes[i]) / max) * span;
      // Drawn arriving AT the point of application, which is where it acts.
      drawArrow(mainAx, [p[0], p[1] + l], p, '#A2142F', 10);
      const [X, Y] = mainAx.toPx([p[0], p[1] + l]);
      c.font = 'bold 10px Helvetica, Arial, sans-serif';
      c.fillStyle = '#A2142F';
      c.textAlign = 'left';
      c.textBaseline = 'bottom';
      c.fillText(`F${i + 1}`, X + 4, Y);
    });
  });
}

function armForce() {
  state.forces.placing = !state.forces.placing;
  if (state.forces.placing) {
    if (state.trace?.armed) finishTrace();
    if (state.ref.picking) disarmReference();
  }
  ui.addForce.classList.toggle('armed', state.forces.placing);
  ui.addForce.textContent = state.forces.placing
    ? 'Click where it acts…' : 'Add a force';
  draw();
}

function listForces() {
  const f = state.forces ?? { points: [], magnitudes: [] };
  state.forces = { placing: false, ...f };
  const scaled = state.model?.frame?.coordinates === 'physical';
  ui.forceList.innerHTML = '';
  f.points.forEach((p, i) => {
    const li = document.createElement('li');
    const mag = scaled ? format(f.magnitudes[i], 'force', state.system)
      : `${f.magnitudes[i].toPrecision(4)}`;
    li.append(document.createTextNode(
      `F${i + 1}  ${mag}  at x = ${p[0].toPrecision(4)}`));
    const del = document.createElement('button');
    del.textContent = 'remove';
    del.addEventListener('click', () => {
      f.points.splice(i, 1);
      f.magnitudes.splice(i, 1);
      listForces();
      recompute();
      fitForceView();
      draw();
    });
    li.append(del);
    ui.forceList.append(li);
  });
  ui.forceLabel.textContent =
    `Magnitude ${SYSTEMS[state.system].force.label}`;
}

function drawReference() {
  const pts = state.ref.points;
  if (!pts.length) return;
  mainAx.clipped((c) => {
    c.strokeStyle = '#C88A2E';
    c.fillStyle = '#C88A2E';
    c.lineWidth = 2;
    if (pts.length === 2) {
      const [x0, y0] = mainAx.toPx(pts[0]);
      const [x1, y1] = mainAx.toPx(pts[1]);
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
      c.font = 'bold 11px Helvetica, Arial, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'bottom';
      const label = `${ui.refLength.value} ${SYSTEMS[state.system].length.label}`;
      c.fillText(label, (x0 + x1) / 2, (y0 + y1) / 2 - 5);
    }
    for (const p of pts) {
      const [X, Y] = mainAx.toPx(p);
      c.beginPath();
      c.moveTo(X - 6, Y); c.lineTo(X + 6, Y);
      c.moveTo(X, Y - 6); c.lineTo(X, Y + 6);
      c.stroke();
    }
  });
}

function updateReferencePickerUi() {
  ui.pickRef.classList.toggle('armed', state.ref.picking);
  ui.pickImageRef.classList.toggle('armed', state.ref.picking);
  ui.pickRef.textContent = state.ref.picking
    ? 'Click the two ends…' : 'Pick a reference length';
  ui.pickImageRef.textContent = state.ref.picking
    ? 'Click the two ends…' : 'Pick known distance';
  reportScale();
  draw();
}

function disarmReference() {
  state.ref.picking = false;
  updateReferencePickerUi();
}

function armReference() {
  if (!state.trace) state.trace = { inner: [], outer: [], armed: null, cursor: null };
  state.ref.picking = !state.ref.picking;
  if (state.ref.picking) {
    state.ref.points = [];
    // Picking a reference and tracing a curve would fight over the clicks.
    if (state.trace?.armed) finishTrace();
  }
  updateReferencePickerUi();
}

function reportBlocks(n, flipped) {
  const m = state.model;
  if (!m) {
    ui.traceStatus.textContent = 'no blocks';
    return;
  }
  const total = (m.weights ?? []).reduce((s, v) => s + v, 0);
  const scaled = m.frame && m.frame.coordinates === 'physical';
  ui.traceStatus.textContent =
    `${n ?? (m.blocks ?? []).length} blocks · total weight ` +
    (scaled ? format(total, 'force', state.system) : total.toPrecision(4)) +
    (flipped ? ' · extrados direction corrected' : '');
}

function reportScale() {
  const m = state.model;
  const sys = SYSTEMS[state.system];
  const refCount = state.ref?.points?.length ?? 0;
  ui.applyScale.disabled = refCount !== 2;
  ui.applyImageRefScale.disabled = refCount !== 2;
  ui.applyImageSize.disabled = !(m && m.imageSize);
  ui.gammaLabel.textContent = `Unit weight ${sys.density.label}`;
  ui.thickLabel.textContent = `Thickness ${sys.length.label}`;

  if (m && m.frame && m.frame.coordinates === 'physical' && m.joints) {
    const d = archDimensions(m.joints);
    if (d) {
      ui.scaleStatus.textContent =
        `span ${format(d.span, 'length', state.system)} · ` +
        `rise ${format(d.rise, 'length', state.system)} · ` +
        `rise/span ${d.ratio.toFixed(3)}`;
      return;
    }
  }
  ui.scaleStatus.textContent = refCount === 2
    ? 'reference picked — set the length, then apply'
    : 'not scaled — lengths are pixels';
}

function reportImageLock() {
  ui.imageLockIcon.textContent = ui.imageAspectLocked.checked
    ? 'locked proportions' : 'unlocked stretch';
}

function syncImageSizeField(changed) {
  if (!ui.imageAspectLocked.checked) return;
  const m = state.model;
  if (!m?.imageSize) return;
  const [pixW, pixH] = m.imageSize;
  if (!(pixW > 0) || !(pixH > 0)) return;
  if (changed === 'width') {
    const w = Number(ui.imageRealWidth.value);
    if (w > 0) ui.imageRealHeight.value = (w * pixH / pixW).toPrecision(6);
  } else {
    const h = Number(ui.imageRealHeight.value);
    if (h > 0) ui.imageRealWidth.value = (h * pixW / pixH).toPrecision(6);
  }
}

function ensureTraceModel() {
  if (!state.trace) state.trace = { inner: [], outer: [], armed: null, cursor: null };
  if (state.model) return;
  state.model = {
    name: 'untitled trace',
    blocks: [], centroids: [], weights: [], areas: [], thickness: [],
    joints: null,
    pointA: null, pointB: null, forcePolygon: null, thrustLine: null,
    units: null, lengthScaling: 1, massToWeight: 1,
    image: null, imageSize: null,
    frame: { coordinates: 'pixels', units_per_pixel: 1, inferred: false },
  };
  state.consistent = { ok: true, reason: null, extraRows: 0 };
  mainAx.syncSize();
  mainAx.fit({ xmin: 0, xmax: 10, ymin: 0, ymax: 10 });
}

function scalePoints(pts, k) {
  return (pts ?? []).map(([x, y]) => [x * k, y * k]);
}

function scaleMaybePoint(p, k) {
  return p ? [p[0] * k, p[1] * k] : null;
}

function scalePixelWorkspace(k, source) {
  if (!state.model) return;
  const imageDrawSize = state.model.imageDrawSize
    ? state.model.imageDrawSize.map((v) => v * k) : null;
  state.model = scaleModel(state.model, k, { thicknessInPixels: false });
  if (imageDrawSize) state.model.imageDrawSize = imageDrawSize;
  state.model.units = state.system;
  state.model.scaleSource = source;
  if (state.trace) {
    state.trace.inner = scalePoints(state.trace.inner, k);
    state.trace.outer = scalePoints(state.trace.outer, k);
  }
  state.ref = state.ref ?? { points: [], picking: false };
  state.ref.points = scalePoints(state.ref.points, k);
  state.forces = state.forces ?? { points: [], magnitudes: [], placing: false };
  state.forces.points = scalePoints(state.forces.points, k);
  state.ends = state.ends ?? { A: null, B: null, picking: null, construction: null };
  state.ends.A = scaleMaybePoint(state.ends.A, k);
  state.ends.B = scaleMaybePoint(state.ends.B, k);
  state.profiles = state.profiles ?? { list: [], current: null, centre: null, picking: false };
  state.profiles.list = (state.profiles.list ?? []).map((p) => scalePoints(p, k));
  state.profiles.current = state.profiles.current ? scalePoints(state.profiles.current, k) : null;
  state.profiles.centre = scaleMaybePoint(state.profiles.centre, k);
  state.threePointRing = state.threePointRing
    ?? { inner: [null, null, null], outer: [null, null, null], picking: null };
  state.threePointRing.inner = state.threePointRing.inner.map((p) => scaleMaybePoint(p, k));
  state.threePointRing.outer = state.threePointRing.outer.map((p) => scaleMaybePoint(p, k));
  ui.domeAxis.value = (Number(ui.domeAxis.value) * k).toPrecision(6);
  reweigh();
  state.band = null; state.bandKey = null;
  state.solidFit = null;

  const total = (state.model.weights ?? []).reduce((s, v) => s + v, 0);
  state.basePole = [total / 4, -total / 2];
}

/** Turn pixels into physical units, once and for all. */
function applyScale() {
  if (!state.model) {
    ui.warn.hidden = false;
    ui.warn.textContent = 'draw or load an arch before applying a scale';
    return;
  }
  const [p1, p2] = state.ref.points;
  const real = Number(ui.refLength.value);
  let k;
  try {
    k = unitsPerPixel(p1, p2, real);
  } catch (err) {
    ui.warn.hidden = false;
    ui.warn.textContent = err.message;
    return;
  }

  // The out-of-plane thickness is a PHYSICAL quantity the user typed, not a
  // pixel count, so it does not scale with the picture and the weights go as
  // k^2. Treating it as pixels once gave an arch 25 mm thick and a thrust of
  // 1.8 kN, which is arithmetically right and physically absurd.
  scalePixelWorkspace(k, `reference length ${real} ${SYSTEMS[state.system].length.label}`);
  ui.refLength.value = String(real);
  ui.imageRefLength.value = String(real);
  ui.thrust.value = 50;

  disarmReference();
  reportScale();
  reportBlocks();
  listForces();
  describe();
  recompute();
  fitViews();
  draw();
  ui.warn.hidden = true;
}

function applyImageSize() {
  const m = state.model;
  if (!m?.imageSize) {
    ui.warn.hidden = false;
    ui.warn.textContent = 'load an image before applying its size';
    return;
  }
  const realW = Number(ui.imageRealWidth.value);
  const realH = Number(ui.imageRealHeight.value);
  if (!(realW > 0) && !(realH > 0)) {
    ui.warn.hidden = false;
    ui.warn.textContent = 'enter the real image width, height, or both';
    return;
  }
  const [pixW, pixH] = m.imageSize;
  const kW = realW > 0 ? realW / pixW : null;
  const kH = realH > 0 ? realH / pixH : null;
  const locked = ui.imageAspectLocked.checked;
  if (locked && m.frame?.coordinates === 'physical') {
    ui.warn.hidden = false;
    ui.warn.textContent = 'the structure is already scaled; unlock stretch to resize only the background image';
    return;
  }
  if (locked && kW && kH && Math.abs(kW - kH) / Math.max(kW, kH) > 0.01) {
    ui.warn.hidden = false;
    ui.warn.textContent = 'width and height do not match the image proportions';
    return;
  }
  if (!locked && (!(realW > 0) || !(realH > 0))) {
    ui.warn.hidden = false;
    ui.warn.textContent = 'unlocked stretch needs both width and height';
    return;
  }
  if (!locked) {
    if (m.frame?.coordinates !== 'physical' && m.blocks?.length) {
      ui.warn.hidden = false;
      ui.warn.textContent =
        'unlocked stretch is only for a new image or an already scaled structure';
      return;
    }
    state.model = {
      ...m,
      imageDrawSize: [realW, realH],
      frame: m.frame?.coordinates === 'physical'
        ? m.frame
        : { coordinates: 'physical', units_per_pixel: kW ?? 1, inferred: false },
      units: state.system,
      scaleSource: `image stretch ${realW.toPrecision(6)} × `
        + `${realH.toPrecision(6)} ${SYSTEMS[state.system].length.label}`,
    };
    ui.thrust.value = 50;
    reportScale();
    reportBlocks();
    reportTrace();
    listForces();
    describe();
    if (state.basePole) recompute();
    fitViews();
    draw();
    ui.warn.hidden = true;
    return;
  }
  const k = kW ?? kH;
  const sys = SYSTEMS[state.system];
  scalePixelWorkspace(k, `image size ${((pixW * k)).toPrecision(6)} × `
    + `${((pixH * k)).toPrecision(6)} ${sys.length.label}`);
  state.model.imageDrawSize = null;
  ui.imageRealWidth.value = (pixW * k).toPrecision(6);
  ui.imageRealHeight.value = (pixH * k).toPrecision(6);
  ui.thrust.value = 50;
  reportScale();
  reportBlocks();
  reportTrace();
  listForces();
  describe();
  recompute();
  fitViews();
  draw();
  ui.warn.hidden = true;
}

function replaceBackgroundImage(dataUrl, meta = {}, onload = null) {
  const img = new Image();
  img.onload = () => {
    state.image = img;
    const name = meta.name ?? state.imageData?.name ?? state.model?.image ?? 'background image';
    state.imageData = {
      name,
      type: meta.type ?? state.imageData?.type ?? 'image/png',
      width: img.naturalWidth,
      height: img.naturalHeight,
      dataUrl,
    };
    if (state.model) {
      state.model.image = name;
      state.model.imageSize = [img.naturalWidth, img.naturalHeight];
    }
    if (onload) onload(img);
    draw();
  };
  img.onerror = () => {
    ui.warn.hidden = false;
    ui.warn.textContent = 'could not decode the background image';
  };
  img.src = dataUrl;
}

function flipBackgroundImage() {
  if (!state.image) {
    ui.flipY.checked = false;
    ui.warn.hidden = false;
    ui.warn.textContent = 'load an image before flipping it';
    return;
  }
  const w = state.image.naturalWidth || state.image.width;
  const h = state.image.naturalHeight || state.image.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d');
  c.translate(0, h);
  c.scale(1, -1);
  c.drawImage(state.image, 0, 0, w, h);
  const dataUrl = canvas.toDataURL(state.imageData?.type || 'image/png');
  replaceBackgroundImage(dataUrl, {
    name: state.imageData?.name ?? state.model?.image,
    type: state.imageData?.type ?? 'image/png',
  });
  ui.flipY.checked = false;
  ui.warn.hidden = true;
}

function arm(which) {
  ensureTraceModel();
  const t = state.trace;
  t.armed = t.armed === which ? null : which;
  if (t.armed) t[t.armed] = [];
  t.cursor = null;
  ui.traceInner.classList.toggle('armed', t.armed === 'inner');
  ui.traceOuter.classList.toggle('armed', t.armed === 'outer');
  ui.traceHint.textContent = t.armed
    ? `Clicking along the ${t.armed === 'inner' ? 'intrados' : 'extrados'}. ` +
      'Double-click or press Enter to finish, Esc to cancel.'
    : 'Click along a curve; double-click, or press Enter, to finish. ' +
      'Esc cancels.';
  reportTrace();
  draw();
}

function finishTrace() {
  if (!traceArmed()) return;
  state.trace.armed = null;
  state.trace.cursor = null;
  ui.traceInner.classList.remove('armed');
  ui.traceOuter.classList.remove('armed');
  ui.traceHint.textContent =
    'Click along a curve; double-click, or press Enter, to finish. Esc cancels.';
  reportTrace();
  draw();
}

function reportTrace() {
  const t = state.trace;
  const n = Number(ui.nBlocks.value) || 1;
  const bits = [`intrados ${t.inner.length} pts`,
    `extrados ${t.outer.length} pts`];
  let problems = [];
  if (t.inner.length >= 2 && t.outer.length >= 2) {
    problems = checkTrace(t.inner, t.outer, n);
  }
  ui.traceStatus.textContent = bits.join(' · ');
  ui.makeBlocks.disabled = t.inner.length < 2 || t.outer.length < 2;
  if (problems.length) {
    ui.warn.hidden = false;
    ui.warn.textContent = problems.join('; ') + '.';
  } else if (state.consistent && state.consistent.ok !== false) {
    ui.warn.hidden = true;
  }
}

function reportThreePointRing() {
  const p = state.threePointRing;
  const nIn = p.inner.filter(Boolean).length;
  const nOut = p.outer.filter(Boolean).length;
  const ready = nIn === 3 && nOut === 3;
  ui.makeThreePointRing.disabled = !ready;
  ui.threePointRingStatus.textContent = ready
    ? 'ready to generate'
    : `${nIn}/3 intrados · ${nOut}/3 extrados`;
  for (const [key, btn] of [
    ['inner:0', ui.pickInner1], ['inner:1', ui.pickInner2], ['inner:2', ui.pickInner3],
    ['outer:0', ui.pickOuter1], ['outer:1', ui.pickOuter2], ['outer:2', ui.pickOuter3],
  ]) {
    btn.classList.toggle('armed', p.picking === key);
  }
}

function armThreePointRing(which, index) {
  const key = `${which}:${index}`;
  state.threePointRing.picking = state.threePointRing.picking === key ? null : key;
  if (state.threePointRing.picking) {
    if (traceArmed()) finishTrace();
    if (state.ref.picking) disarmReference();
    if (state.pickingAxis) ui.pickAxis.click();
  }
  reportThreePointRing();
  draw();
}

function drawThreePointRingPicks() {
  const p = state.threePointRing;
  const items = [
    ...p.inner.map((q, i) => ({ p: q, label: `I${i + 1}`, colour: '#0072BD' })),
    ...p.outer.map((q, i) => ({ p: q, label: `E${i + 1}`, colour: '#7E2F8E' })),
  ].filter((q) => q.p);
  if (!items.length) return;
  mainAx.clipped((c) => {
    c.font = 'bold 11px Helvetica, Arial, sans-serif';
    for (const item of items) {
      const [X, Y] = mainAx.toPx(item.p);
      c.beginPath();
      c.arc(X, Y, 4, 0, 2 * Math.PI);
      c.fillStyle = item.colour;
      c.fill();
      c.strokeStyle = '#fff';
      c.lineWidth = 1.4;
      c.stroke();
      c.fillStyle = item.colour;
      c.textAlign = 'left';
      c.textBaseline = 'bottom';
      c.fillText(item.label, X + 6, Y - 4);
    }
  });
}

// ------------------------------------------------- whole profiles --

function reportProfiles() {
  const p = state.profiles;
  const n = p.list.length + (p.current && p.current.length >= 3 ? 1 : 0);
  const ready = n > 0 && p.centre;
  ui.cutProfile.disabled = !ready;
  ui.profileStatus.textContent = !n
    ? 'no outline traced'
    : `${n} outline${n === 1 ? '' : 's'}`
      + (p.centre
        ? ` · centre at (${p.centre[0].toPrecision(4)}, ${p.centre[1].toPrecision(4)})`
        : ' · pick the centre of the cuts');
}

/** Start, or finish, a closed outline. */
function armProfile() {
  const p = state.profiles;
  if (p.current) {
    if (p.current.length >= 3) p.list.push(p.current);
    p.current = null;
  } else {
    if (traceArmed()) finishTrace();
    p.current = [];
  }
  ui.traceProfile.classList.toggle('armed', !!p.current);
  ui.traceProfile.textContent = p.current
    ? 'Close this outline' : 'Trace an outline';
  reportProfiles();
  draw();
}

/** Turn the traced outlines into voussoirs by cutting them radially. */
function cutProfiles() {
  const p = state.profiles;
  if (p.current && p.current.length >= 3) armProfile();      // close it first
  const n = Math.max(1, Number(ui.nCuts.value) || 16);
  const { blocks, joints, warnings } = cutRadially(p.list, p.centre, n);
  if (!blocks.length) {
    ui.warn.hidden = false;
    ui.warn.textContent = warnings.join('; ') || 'nothing to cut';
    return;
  }

  const centroids = blocks.map(blockCentroid);
  const ends = joints.length >= 2
    ? [joints[0], joints[joints.length - 1]].map((j) => [
      (j.a[0] + j.b[0]) / 2, (j.a[1] + j.b[1]) / 2,
    ])
    : [null, null];
  const [e0, e1] = ends;
  state.model = {
    ...state.model,
    blocks, joints, centroids,
    areas: blocks.map((b) => blockArea(b)),
    pointA: e0 && e1 ? (e0[0] <= e1[0] ? e0 : e1) : null,
    pointB: e0 && e1 ? (e0[0] <= e1[0] ? e1 : e0) : null,
    forcePolygon: null, thrustLine: null,
    units: null,
    frame: { coordinates: 'pixels', units_per_pixel: 1, inferred: false },
  };
  clearPlotState();
  state.consistent = { ok: true, reason: null, extraRows: 0 };
  if (!state.axisPicked) resetAxis();
  reweigh();
  state.band = null; state.bandKey = null; state.solidFit = null;

  ui.warn.hidden = !warnings.length;
  if (warnings.length) ui.warn.textContent = warnings.join('; ') + '.';
  reportProfiles();
  recompute();
  fitViews();
  draw();
}

/** Arm the free-hand block tool. */
function armBlock() {
  state.newBlock = state.newBlock ? null : [];
  ui.addBlock.classList.toggle('armed', !!state.newBlock);
  ui.addBlock.textContent = state.newBlock ? 'Click the corners…' : 'Draw a block';
  draw();
}

/** Add the block just drawn to the model and re-weigh. */
function commitBlock() {
  const pts = state.newBlock;
  const m = state.model;
  const poly = { x: pts.map((p) => p[0]), y: pts.map((p) => p[1]) };
  if (signedAreaOf(poly) < 0) { poly.x.reverse(); poly.y.reverse(); }
  m.blocks = [...(m.blocks ?? []), poly];
  m.centroids = m.blocks.map(blockCentroid);
  m.areas = m.blocks.map((b) => blockArea(b));
  // armBlock is a TOGGLE: clearing the state first and then calling it would
  // arm the tool again instead of putting it away.
  armBlock();
  reweigh();
  state.band = null; state.bandKey = null; state.solidFit = null;
  recompute();
  draw();
}

/** The outlines, the centre of the cuts, and the block being drawn. */
function drawProfiles() {
  const p = state.profiles;
  const live = p.current && p.current.length ? [p.current] : [];
  const all = [...p.list, ...live];
  if (!all.length && !p.centre && !state.newBlock) return;

  mainAx.clipped((c) => {
    c.lineWidth = 1.6;
    all.forEach((prof, i) => {
      if (prof.length < 2) return;
      c.beginPath();
      prof.forEach((q, k) => {
        const [X, Y] = mainAx.toPx(q);
        if (k === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
      });
      // A closed outline is shown closed; the one being drawn is not.
      const closing = i < p.list.length;
      if (closing) c.closePath();
      c.strokeStyle = closing ? '#7d3c98' : '#c0392b';
      c.setLineDash(closing ? [] : [5, 3]);
      c.stroke();
      c.setLineDash([]);
    });

    if (state.newBlock && state.newBlock.length) {
      c.beginPath();
      state.newBlock.forEach((q, k) => {
        const [X, Y] = mainAx.toPx(q);
        if (k === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
      });
      c.strokeStyle = '#c0392b';
      c.setLineDash([4, 3]);
      c.stroke();
      c.setLineDash([]);
      for (const q of state.newBlock) {
        const [X, Y] = mainAx.toPx(q);
        c.beginPath(); c.arc(X, Y, 3, 0, 2 * Math.PI);
        c.fillStyle = '#c0392b'; c.fill();
      }
    }

    if (p.centre) {
      const [X, Y] = mainAx.toPx(p.centre);
      c.strokeStyle = '#7d3c98';
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(X - 7, Y); c.lineTo(X + 7, Y);
      c.moveTo(X, Y - 7); c.lineTo(X, Y + 7);
      c.stroke();
    }
  });
}

/** Which of the two views the right-hand pane is showing. */
function sideView() {
  if (ui.tabSolid.classList.contains('active')) return 'solid';
  if (ui.tabHeyman.classList.contains('active')) return 'heyman';
  if (ui.tabRadius.classList.contains('active')) return 'radius';
  return 'force';
}

/**
 * The block arch in three dimensions.
 *
 * The projection is orthonormal, so the picture is undistorted; the axes are
 * fitted to the PROJECTED bounds, which keeps the drawing inside the box
 * whatever the viewpoint. The viewpoint follows the MATLAB app: turned a
 * little further round as the slice angle opens, so a wide lune does not hide
 * behind itself.
 */
function drawSolidView() {
  const m = state.model;
  solidAx.begin();
  if (!m || !m.blocks || !m.blocks.length) {
    solidAx.decorate();
    return;
  }
  const dome = domeOptions();
  const f = frame(state.camera.az, state.camera.el);

  // THE MECHANISM IS SHOWN HERE TOO. The two views should not disagree about
  // where the arch is: while the amplitude slider is up, the solids are built
  // from the DISPLACED voussoirs, so the collapse can be watched in three
  // dimensions and, on a dome, seen to open along the lunes. The colouring by
  // macro-block below is kept either way.
  let shown = m.blocks;
  if (ui.showMech.checked && state.mech && state.mech.dof > 0) {
    const amp = (Number(ui.mechAmp.value) / 100) * 0.25;
    if (amp > 0) {
      const T = displacedConfiguration(state.mech.hinges, state.mech.bodies, amp);
      shown = displaced(m.blocks, state.mech.bodyOf, T);
    }
  }

  const rawList = solids(shown, {
    poleni: dome.poleni,
    axisX: dome.axisX,
    angleDeg: dome.angleDeg,
    thickness: m.thickness ?? m.blocks.map(() => 1),
    steps: dome.poleni ? Math.max(2, Math.round(dome.angleDeg / 4)) : 1,
  });
  const centre3 = solidCentre(rawList);
  const list = recenteredSolids(rawList, centre3);

  // The projected extent moves with the camera, so it is recomputed every
  // frame and kept for the fit buttons; the view is only re-framed when the
  // SUBJECT changes, or turning the solid would fight the user's zoom.
  state.solidBounds = projectedBounds(list, f);
  if (state.solidFit !== sideKey() && state.solidBounds) {
    solidAx.fit(state.solidBounds);
    state.solidFit = sideKey();
  }
  solidAx.reequalize();

  // While the mechanism is on show, colour the solids by macro-block too, so
  // the two views agree about which pieces move together.
  const highlight = ui.showMech.checked && state.mech
    ? m.blocks.map((_, k) => {
      const b = state.mech.bodyOf[k];
      const c = BODY_RGB[b % BODY_RGB.length];
      return b < 0 ? [200, 200, 200] : c;
    })
    : null;

  drawSolids(solidAx, list, { f, highlight });
  if (dome.poleni) {
    const ys = m.blocks.flatMap((p) => p.y);
    drawAxis(solidAx, dome.axisX - centre3[0],
      [Math.min(...ys) - centre3[2], Math.max(...ys) - centre3[2]], f,
      { depth: -centre3[1] });
  }
  if (state.showSolidAxes) drawReferenceFrame(solidAx, state.solidBounds, f);
}

/** What the solid view is a picture of; a change means refit. */
function sideKey() {
  const m = state.model;
  const d = domeOptions();
  return `${m && m.blocks ? m.blocks.length : 0}:${d.poleni}:`
    + `${d.angleDeg}:${d.axisX}:${state.camera.az}:${state.camera.el}:`
    + `${m && m.frame ? m.frame.units_per_pixel : 1}`;
}

/** The macro-block colours, as triples, to tint the solids with. */
const BODY_RGB = [
  [127, 179, 213], [240, 178, 122], [169, 223, 191],
  [215, 189, 226], [249, 231, 159], [174, 182, 191],
];

/**
 * Put the axis of revolution where the arch is, unless the user has moved it.
 *
 * Called whenever a model arrives from somewhere other than the tracer -- a
 * stored example, a reopened file -- because leaving it at zero would put the
 * axis off the edge of a plate traced in pixel coordinates and make every lune
 * absurdly wide.
 */
function resetAxis() {
  if (state.axisPicked) return;
  const m = state.model;
  if (!m) return;
  ui.domeAxis.value = defaultAxis(m.pointA, m.pointB, m.blocks).toPrecision(6);
}

/** What the Dome panel is asking for. */
function domeOptions() {
  return {
    poleni: ui.poleni.checked,
    angleDeg: Math.max(0.1, Number(ui.domeAngle.value) || 15),
    axisX: Number(ui.domeAxis.value) || 0,
  };
}

/**
 * Re-weigh the blocks under whichever idealisation is in force.
 *
 * Called wherever the geometry or the dome parameters move -- tracing,
 * scaling, changing the angle or the axis -- because the weights are the
 * ONLY thing the Poleni switch changes, and everything downstream reads them.
 */
function reweigh() {
  const m = state.model;
  if (!m || !m.blocks || !m.blocks.length) return;
  const gamma = Number(ui.gamma.value) || 20;
  const dome = domeOptions();

  if (dome.poleni) {
    // W = gamma * A * theta * rbar, by Pappus: exact for a plane region turned
    // about an axis in its plane, and it needs only the area and the centroid.
    const { weights, widths } = luneWeights(m.blocks, {
      axisX: dome.axisX, angleDeg: dome.angleDeg, specificWeight: gamma,
    });
    m.weights = weights;
    // The out-of-plane dimension is no longer a constant the user typed: it is
    // the width of the lune, and it varies block by block.
    m.thickness = widths;
  } else {
    const thickness = Math.max(0, Number(ui.thick.value) || 1);
    m.weights = weighBlocks(m.blocks, { specificWeight: gamma, thickness });
    m.thickness = m.blocks.map(() => thickness);
  }

  const total = m.weights.reduce((a, b) => a + b, 0);
  state.basePole = [total / 4, -total / 2];
  reportDome();
}

/** Say how far the lune tapers, which is the number that explains the result. */
function reportDome() {
  const m = state.model;
  const dome = domeOptions();
  ui.domeAngle.disabled = !dome.poleni;
  ui.domeAxis.disabled = !dome.poleni;
  ui.pickAxis.disabled = !dome.poleni;

  if (!dome.poleni) {
    ui.domeStatus.textContent = 'off — constant thickness';
    return;
  }
  if (!m || !m.blocks || !m.blocks.length) {
    ui.domeStatus.textContent = 'needs a traced arch';
    return;
  }
  const r = widthRange(m.blocks, dome.axisX, dome.angleDeg);
  const scaled = m.frame && m.frame.coordinates === 'physical';
  const show = (v) => (scaled ? format(v, 'length', state.system)
    : `${v.toPrecision(3)} px`);
  ui.domeStatus.textContent =
    `lune ${show(r.max)} wide at the major parallel, `
    + `${show(r.min)} at the crown`;
}

/**
 * An exact circular ring from the three numbers, with no image to trace.
 *
 * The published figures for the admissible thrust band and the least
 * admissible thickness are computed on a semicircular ring at a stated
 * t/ri. Until this button existed that ring could only be built from a script,
 * and a reader wanting to check one point of those figures had to trace two
 * arcs over an image by hand -- which does not give the same numbers. With the
 * ring built here, switching on "Drive from the thrust" reports the band
 * directly, and it is the same quantity the figures plot.
 */
function generateRing(opt = {}) {
  applyRadiusTriStep();
  const resetStudy = opt && opt.resetStudy !== false;
  const ri = Math.max(1e-6, Number(ui.ringRi.value) || 4);
  const tri = Math.max(1e-6, Number(ui.ringTri.value) || 0.15);
  const n = Math.max(1, Math.round(Number(ui.ringN.value) || 16));
  const gamma = Number(ui.gamma.value) || 20;
  const thickness = Math.max(0, Number(ui.thick.value) || 1);

  const { blocks, joints } = circularRing({
    centre: [0, 0], innerRadius: ri, outerRadius: ri * (1 + tri),
    startAngle: 0, endAngle: 180, count: n,
  });
  const weights = weighBlocks(blocks, { specificWeight: gamma, thickness });
  const centroids = centroidsOf(blocks);
  const { pointA, pointB } = springings(joints);

  state.trace = { inner: [], outer: [], armed: null, cursor: null };
  state.profiles = { list: [], current: null, centre: null, picking: false };
  state.forces = { points: [], magnitudes: [], placing: false };
  state.image = null;
  state.imageData = null;
  state.ends = { A: null, B: null, picking: null, construction: null };
  state.model = {
    blocks, centroids, weights, joints,
    areas: blocks.map((p) => Math.abs(signedAreaOf(p))),
    thickness: blocks.map(() => thickness),
    pointA, pointB,
    forcePolygon: null, thrustLine: null,
    name: `circular ring, t/ri = ${tri}`,
    units: null,
    // The ring is built in the units the fields are typed in, not in pixels:
    // the radius is a length and the weights follow from it.
    frame: { coordinates: 'physical', units_per_pixel: 1, inferred: false },
  };
  if (!state.axisPicked) {
    ui.domeAxis.value = defaultAxis(pointA, pointB, blocks).toPrecision(6);
  }
  reweigh();
  const total = state.model.weights.reduce((a, b) => a + b, 0);
  state.ringStudySource = currentRingStudySource({ ri, tri, n });
  state.ringAuto = true;
  if (resetStudy) state.thicknessStudy = { ok: true, points: [] };
  const plotted = recordRingState(state.ringStudySource);
  state.selectedJoint = null;
  state.frozenBranch = null;
  state.plotFitKey = null;
  state.consistent = { ok: true, reason: null, extraRows: 0 };
  state.band = null; state.bandKey = null;
  state.mech = null; state.crossings = null;
  state.basePole = [total / 4, -total / 2];
  ui.thrust.value = 50;

  ui.ringStatus.textContent =
    `${n} blocks, ri = ${ri}, ro = ${(ri * (1 + tri)).toPrecision(6)}, `
    + `t/ri = ${tri} · ${state.ringStudySource.poleni ? 'Poleni' : 'barrel'} · `
    + `${plotted.points.filter((p) => p.admissible).length}/`
    + `${plotted.points.length} admissible states`;
  ui.warn.hidden = true;
  ui.meta.textContent = `${n} blocks · circular ring · t/ri = ${tri}`;

  recompute();
  fitViews();
  draw();
}

function generateThreePointRing() {
  const picked = state.threePointRing;
  const inner = picked.inner.map((p) => p && p.slice());
  const outer = picked.outer.map((p) => p && p.slice());
  const n = Math.max(1, Math.round(Number(ui.ringN.value) || Number(ui.nBlocks.value) || 16));
  const gamma = Number(ui.gamma.value) || 20;
  const thickness = Math.max(0, Number(ui.thick.value) || 1);
  let built;
  try {
    built = circularRingThroughPoints({ inner, outer, count: n });
  } catch (err) {
    ui.warn.hidden = false;
    ui.warn.textContent = err.message;
    return;
  }
  const { blocks, joints } = built;
  const weights = weighBlocks(blocks, { specificWeight: gamma, thickness });
  const centroids = centroidsOf(blocks);
  const { pointA, pointB } = springings(joints);

  state.trace = { inner: [], outer: [], armed: null, cursor: null };
  state.profiles = { list: [], current: null, centre: null, picking: false };
  state.forces = { points: [], magnitudes: [], placing: false };
  state.ends = { A: null, B: null, picking: null, construction: null };
  state.model = {
    ...(state.model ?? {}),
    blocks, centroids, weights, joints,
    areas: blocks.map((p) => Math.abs(signedAreaOf(p))),
    thickness: blocks.map(() => thickness),
    pointA, pointB,
    forcePolygon: null, thrustLine: null,
    name: '3-point circular arch',
    units: null,
    frame: state.model?.frame ?? { coordinates: 'pixels', units_per_pixel: 1, inferred: false },
  };
  clearPlotState();
  if (!state.axisPicked) {
    ui.domeAxis.value = defaultAxis(pointA, pointB, blocks).toPrecision(6);
  }
  reweigh();
  const total = state.model.weights.reduce((a, b) => a + b, 0);
  state.consistent = { ok: true, reason: null, extraRows: 0 };
  state.band = null; state.bandKey = null;
  state.mech = null; state.crossings = null;
  state.basePole = [total / 4, -total / 2];
  ui.thrust.value = 50;

  ui.threePointRingStatus.textContent = `${n} blocks · generated from 3+3 points`;
  ui.warn.hidden = true;
  ui.meta.textContent = `${n} blocks · 3-point circular arch`;

  recompute();
  fitViews();
  draw();
}

/** Turn the two traced curves into an arch and hand it to the statics. */
function generateBlocks() {
  const t = state.trace;
  const n = Math.max(1, Number(ui.nBlocks.value) || 1);
  const gamma = Number(ui.gamma.value) || 20;

  const thickness = Math.max(0, Number(ui.thick.value) || 1);
  const built = blocksBetween(t.inner, t.outer, n);
  const previous = state.model ?? null;
  const existing = previous?.blocks?.length ? previous : null;
  const blocks = existing ? [...existing.blocks, ...built.blocks] : built.blocks;
  const joints = existing?.joints ? [...existing.joints, ...built.joints] : built.joints;
  const weights = weighBlocks(blocks, { specificWeight: gamma, thickness });
  const centroids = centroidsOf(blocks);
  const { pointA, pointB } = springings(joints);
  const frame = previous?.frame
    ?? { coordinates: 'pixels', units_per_pixel: 1, inferred: false };

  state.model = {
    ...(previous ?? {}),
    blocks, centroids, weights, joints,
    areas: blocks.map((p) => Math.abs(signedAreaOf(p))),
    thickness: blocks.map(() => thickness),
    pointA, pointB,
    forcePolygon: null, thrustLine: null,
    units: previous?.units ?? null,
    frame,
  };
  clearPlotState();
  state.trace = { inner: [], outer: [], armed: null, cursor: null };
  // A traced arch has no stored solution to be inconsistent with.
  state.consistent = { ok: true, reason: null, extraRows: 0 };
  // The axis of revolution defaults to the mid-point of the springings, which
  // is right for any symmetric arch; the field and the picker override it.
  if (!state.axisPicked) {
    ui.domeAxis.value = defaultAxis(pointA, pointB, blocks).toPrecision(6);
  }
  reweigh();
  const total = state.model.weights.reduce((s, v) => s + v, 0);
  state.band = null; state.bandKey = null;
  // Start from a pole giving a thrust of about a quarter of the total weight,
  // which for a normal arch puts the line roughly inside the ring.
  state.basePole = [total / 4, -total / 2];
  ui.thrust.value = 50;

  reportBlocks(blocks.length, built.flipped);
  ui.warn.hidden = true;

  recompute();
  fitViews();
  draw();
}

/* ------------------------------------------------------------ interaction -- */

function attachNavigation(ax) {
  let dragging = false;
  let last = null;
  ax.canvas.addEventListener('pointerdown', (e) => {
    // Bring the transform up to date before reading a pointer position: the
    // layout may have moved since the last frame.
    ax.syncSize();
    // While a curve is armed, a click on the main axes adds a point instead
    // of starting a pan.
    if (ax === mainAx && state.forces.placing) {
      const mag = Number(ui.forceMag.value);
      if (mag > 0) {
        state.forces.points.push(mainAx.toData([e.offsetX, e.offsetY]));
        state.forces.magnitudes.push(mag);
        listForces();
        recompute();
        fitForceView();
      }
      armForce();
      return;
    }
    if (ax === mainAx && state.threePointRing.picking) {
      const [which, raw] = state.threePointRing.picking.split(':');
      state.threePointRing[which][Number(raw)] = mainAx.toData([e.offsetX, e.offsetY]);
      state.threePointRing.picking = null;
      reportThreePointRing();
      draw();
      return;
    }
    if (ax === mainAx && state.profiles.current) {
      state.profiles.current.push(mainAx.toData([e.offsetX, e.offsetY]));
      reportProfiles();
      draw();
      return;
    }
    if (ax === mainAx && state.profiles.picking) {
      state.profiles.centre = mainAx.toData([e.offsetX, e.offsetY]);
      state.profiles.picking = false;
      ui.pickCutCentre.classList.remove('armed');
      ui.pickCutCentre.textContent = 'Pick the centre of the cuts';
      reportProfiles();
      draw();
      return;
    }
    if (ax === mainAx && state.newBlock) {
      state.newBlock.push(mainAx.toData([e.offsetX, e.offsetY]));
      if (state.newBlock.length >= Math.max(3, Number(ui.nSides.value) || 4)) {
        commitBlock();
      } else {
        draw();
      }
      return;
    }
    if (ax === mainAx && state.ends.picking) {
      state.ends[state.ends.picking] = mainAx.toData([e.offsetX, e.offsetY]);
      armEnd(state.ends.picking);          // disarms
      recompute();
      fitForceView();
      draw();
      return;
    }
    if (ax === mainAx && state.pickingAxis) {
      // Only the abscissa matters: the axis of a dome is vertical.
      ui.domeAxis.value = mainAx.toData([e.offsetX, e.offsetY])[0].toPrecision(6);
      state.axisPicked = true;
      state.pickingAxis = false;
      ui.pickAxis.classList.remove('armed');
      ui.pickAxis.textContent = 'Pick the axis on the drawing';
      reweigh();
      state.band = null; state.bandKey = null;
      state.solidFit = null;
      recompute();
      fitForceView();
      draw();
      return;
    }
    if (ax === mainAx && state.ref.picking) {
      state.ref.points.push(mainAx.toData([e.offsetX, e.offsetY]));
      if (state.ref.points.length >= 2) {
        state.ref.points = state.ref.points.slice(0, 2);
        disarmReference();
      }
      reportScale();
      draw();
      return;
    }
    if (ax === mainAx && traceArmed()) {
      state.trace[state.trace.armed].push(mainAx.toData([e.offsetX, e.offsetY]));
      reportTrace();
      draw();
      return;
    }
    if (ax === mainAx) {
      const picked = pickJointAt([e.offsetX, e.offsetY]);
      if (picked !== null) {
        state.selectedJoint = picked;
        state.plotFitKey = null;
        showSide('heyman');
        draw();
        return;
      }
    }
    dragging = true;
    last = [e.offsetX, e.offsetY];
    ax.canvas.setPointerCapture(e.pointerId);
  });
  ax.canvas.addEventListener('pointermove', (e) => {
    if (ax === mainAx && traceArmed()) {
      state.trace.cursor = mainAx.toData([e.offsetX, e.offsetY]);
      draw();
      return;
    }
    if (!dragging) return;
    const dx = e.offsetX - last[0];
    const dy = e.offsetY - last[1];
    if (ax === solidAx && !e.shiftKey) {
      // A three-dimensional view turns under the drag; panning it takes shift.
      // Elevation is clamped short of the poles, where the azimuth stops
      // meaning anything and the picture flips.
      state.camera.az -= dx * 0.5;
      state.camera.el = Math.max(-89, Math.min(89, state.camera.el + dy * 0.5));
    } else {
      ax.pan(dx, dy);
    }
    last = [e.offsetX, e.offsetY];
    draw();
  });
  const stop = () => { dragging = false; };
  ax.canvas.addEventListener('pointerup', stop);
  ax.canvas.addEventListener('pointercancel', stop);
  ax.canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    ax.zoomAt([e.offsetX, e.offsetY], e.deltaY > 0 ? 1.1 : 1 / 1.1);
    draw();
  }, { passive: false });
}

attachNavigation(mainAx);
attachNavigation(forceAx);
attachNavigation(solidAx);
attachNavigation(plotAx);

el('main').addEventListener('dblclick', (e) => { e.preventDefault(); finishTrace(); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') finishTrace();
  if (e.key === 'Escape' && traceArmed()) {
    state.trace[state.trace.armed] = [];
    finishTrace();
  }
});

ui.addForce.addEventListener('click', armForce);
ui.clearForces.addEventListener('click', () => {
  state.forces.points = [];
  state.forces.magnitudes = [];
  listForces();
  recompute();
  fitForceView();
  draw();
});

ui.pickRef.addEventListener('click', armReference);
ui.pickImageRef.addEventListener('click', armReference);
ui.applyScale.addEventListener('click', applyScale);
ui.applyImageRefScale.addEventListener('click', applyScale);
ui.refLength.addEventListener('input', () => {
  ui.imageRefLength.value = ui.refLength.value;
  reportScale();
  draw();
});
ui.imageRefLength.addEventListener('input', () => {
  ui.refLength.value = ui.imageRefLength.value;
  reportScale();
  draw();
});
ui.imageAspectLocked.addEventListener('change', () => {
  reportImageLock();
  syncImageSizeField('width');
  reportScale();
});
ui.imageRealWidth.addEventListener('input', () => syncImageSizeField('width'));
ui.imageRealHeight.addEventListener('input', () => syncImageSizeField('height'));
/**
 * Change the system of units, and CARRY EVERY QUANTITY WITH IT.
 *
 * The menu used to change only the labels, so an arch of 2 m became "2 mm" --
 * a different arch, with nothing on screen to say so, because every readout
 * agreed with every other about a number whose meaning had silently changed.
 *
 * Three kinds of quantity live in the state and they do not scale alike. A
 * length goes as kL and an area as kL squared; a FORCE goes as kF, which is a
 * different factor, because the three systems choose their force unit
 * independently of their length unit. The unit weight is a force over a
 * volume and goes as kF/kL^3 -- a factor of a millionth between SI and N-mm,
 * and the one that would be silently wrong if it followed the lengths.
 *
 * Nothing is converted while the arch is still in pixels: those numbers belong
 * to no system, and the menu then does what it always did, naming the system
 * the arch will be scaled into.
 */
ui.system.addEventListener('change', () => {
  const from = state.system;
  const to = ui.system.value;
  state.system = to;

  const scaled = state.model?.frame?.coordinates === 'physical';
  if (scaled && from !== to) {
    const { kL, kF, density } = conversionFactors(from, to);
    const pt = (p) => (p ? [p[0] * kL, p[1] * kL] : p);
    const poly = (q) => (q ?? []).map(pt);

    state.model = convertModel(state.model, from, to);
    const forces = state.forces ?? { points: [], magnitudes: [] };
    state.forces = {
      ...forces,
      points: poly(forces.points),
      magnitudes: (forces.magnitudes ?? []).map((v) => v * kF),
    };
    // BOTH coordinates of the pole are forces: the abscissa is the horizontal
    // thrust and the ordinate divides the total weight between the reactions.
    state.basePole = state.basePole
      ? [state.basePole[0] * kF, state.basePole[1] * kF] : null;
    state.ends = {
      ...state.ends, A: pt(state.ends.A), B: pt(state.ends.B),
      construction: null,
    };
    const trace = state.trace ?? { inner: [], outer: [], armed: null, cursor: null };
    state.trace = {
      ...trace, inner: poly(trace.inner),
      outer: poly(trace.outer), cursor: null,
    };
    const profiles = state.profiles ?? { list: [], current: null, centre: null, picking: false };
    state.profiles = {
      ...profiles,
      list: (profiles.list ?? []).map(poly),
      current: profiles.current ? poly(profiles.current) : null,
      centre: pt(profiles.centre),
    };
    state.ref = { ...state.ref, points: poly(state.ref.points) };
    state.newBlock = state.newBlock ? poly(state.newBlock) : null;
    // The band is a FRACTION of the total load and so is dimensionless, but
    // its key is keyed on the load, which has just changed.
    state.band = null;
    state.bandKey = null;
    state.mech = null;
    state.crossings = null;

    // The typed fields carry units too. Converting the unit weight beats
    // resetting it to the typical value, which threw away whatever the student
    // had entered.
    const field = (elm, k) => {
      const v = Number(elm.value);
      if (isFinite(v)) elm.value = String(Number((v * k).toPrecision(6)));
    };
    field(ui.gamma, density);
    field(ui.thick, kL);
    field(ui.ringRi, kL);
    field(ui.refLength, kL);
    field(ui.domeAxis, kL);
    field(ui.forceMag, kF);
  } else if (!scaled) {
    // Nothing to carry: offer the density that suits the system instead.
    ui.gamma.value = String(SYSTEMS[to].typicalDensity);
  }

  reportScale();
  reportDome();
  listForces();
  recompute();
  fitViews();
  draw();
});

ui.traceInner.addEventListener('click', () => arm('inner'));
ui.traceOuter.addEventListener('click', () => arm('outer'));
ui.makeBlocks.addEventListener('click', generateBlocks);
ui.nBlocks.addEventListener('change', reportTrace);
for (const f of [ui.gamma, ui.thick]) {
  f.addEventListener('input', () => {
    if (!state.model || !state.model.blocks || !state.model.blocks.length) return;
    reweigh();
    refreshRingStudy();
    state.band = null; state.bandKey = null;
    state.frozenBranch = null;
    recompute();
    fitForceView();
    draw();
  });
}
ui.clearTrace.addEventListener('click', () => {
  state.trace = { inner: [], outer: [], armed: null, cursor: null };
  state.model = {
    ...(state.model ?? {}),
    blocks: [],
    centroids: [],
    weights: [],
    joints: null,
    areas: [],
    thickness: [],
    pointA: null,
    pointB: null,
    forcePolygon: null,
    thrustLine: null,
  };
  clearPlotState();
  state.consistent = { ok: true, reason: null, extraRows: 0 };
  state.fp = null; state.lot = null; state.basePole = null;
  state.band = null; state.bandKey = null;
  state.mech = null; state.crossings = null;
  finishTrace();
  reportTrace();
  reportBlocks();
  recompute();
  fitViews();
  draw();
});

ui.imageFile.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result);
    const img = new Image();
    img.onload = () => {
      const hasWork = !!(
        state.model?.blocks?.length
        || state.trace?.inner?.length
        || state.trace?.outer?.length
        || state.forces?.points?.length
      );
      state.image = img;
      state.imageData = {
        name: file.name,
        type: file.type || 'image/*',
        width: img.naturalWidth,
        height: img.naturalHeight,
        dataUrl,
      };
      if (hasWork && state.model) {
        state.model = {
          ...state.model,
          image: file.name,
          imageSize: [img.naturalWidth, img.naturalHeight],
        };
      } else {
        // A first image creates an empty arch in ITS pixel frame, so a trace on
        // top of it lands in the right coordinates.
        state.model = {
          name: file.name, blocks: [], centroids: [], weights: [],
          pointA: null, pointB: null, forcePolygon: null, thrustLine: null,
          units: null, lengthScaling: 1, massToWeight: 1,
          image: file.name, imageSize: [img.naturalWidth, img.naturalHeight],
          frame: { coordinates: 'pixels', units_per_pixel: 1, inferred: false },
        };
        clearPlotState();
        state.consistent = { ok: true, reason: null, extraRows: 0 };
        state.fp = null; state.lot = null; state.basePole = null;
        state.trace = { inner: [], outer: [], armed: null, cursor: null };
        ui.thrustValue.textContent = 'trace the arch first';
        ui.thrustValueM.textContent = ui.thrustValue.textContent;
        ui.thrustValueP.textContent = ui.thrustValue.textContent;
      }
      const upp = state.model.frame?.coordinates === 'physical'
        ? state.model.frame.units_per_pixel : 1;
      ui.imageRealWidth.value = (img.naturalWidth * upp).toPrecision(6);
      ui.imageRealHeight.value = (img.naturalHeight * upp).toPrecision(6);
      ui.meta.textContent =
        `${file.name} · ${img.naturalWidth}×${img.naturalHeight} px`;
      ui.warn.hidden = true;
      if (hasWork) {
        if (state.basePole) {
          recompute();
          fitForceView();
        }
      } else {
        mainAx.syncSize();
        mainAx.fit({ xmin: 0, xmax: img.naturalWidth,
          ymin: 0, ymax: img.naturalHeight });
      }
      reportScale();
      reportTrace();
      reportBlocks();
      draw();
    };
    img.onerror = () => {
      ui.warn.hidden = false;
      ui.warn.textContent = 'could not decode that image';
    };
    img.src = dataUrl;
  };
  reader.onerror = () => {
    ui.warn.hidden = false;
    ui.warn.textContent = 'could not read that image';
  };
  reader.readAsDataURL(file);
});

ui.example.addEventListener('change', () => {
  // The blank entry is a real choice: it clears the desk.
  if (ui.example.value) loadExample(ui.example.value);
  else newWork();
});
ui.newWork.addEventListener('click', newWork);
ui.thrust.addEventListener('input', () => {
  recompute();
  // Refit the force plane only: the pole travels a long way and would leave
  // the view. The arch view is left alone, so the flattening of the thrust
  // line stays visible against a fixed frame.
  fitForceView();
  draw();
});
for (const k of ['startPos', 'split']) {
  ui[k].addEventListener('input', () => {
    recompute();
    // The pole moves along the load line, so the force plane must follow; the
    // arch view is left alone so the line's swing stays visible.
    fitForceView();
    draw();
  });
}
// ------------------------------------------------------------ view tools --

/** What the given axes is currently a picture of, in data coordinates. */
function contentBounds(ax) {
  const m = state.model;
  if (ax === mainAx) {
    const blockBounds = m && m.blocks && m.blocks.length ? bounds(m.blocks) : null;
    return mergeBounds(blockBounds, imageBounds(m));
  }
  if (ax === forceAx) {
    if (!state.fp) return null;
    const xs = [0, state.fp.pole[0]];
    const ys = [...state.fp.stations, state.fp.pole[1]];
    return {
      xmin: Math.min(...xs), xmax: Math.max(...xs),
      ymin: Math.min(...ys), ymax: Math.max(...ys),
    };
  }
  if (ax === plotAx) return plotContentBounds();
  // The solid view: the bounds of the projection, which move with the camera.
  return state.solidBounds ?? null;
}

/** Fit, fit-width, fit-height, zoom, on whichever plot the buttons belong to. */
function viewAction(ax, act) {
  ax.syncSize();
  if (act === 'in' || act === 'out') {
    // zoomAt takes CSS PIXELS, not data coordinates: zoom about the middle of
    // the drawing area, which is the centre of the box and not of the canvas.
    const b = ax.box;
    ax.zoomAt([b.x + b.w / 2, b.y + b.h / 2], act === 'in' ? 1 / 1.25 : 1.25);
  } else {
    const b = contentBounds(ax);
    if (!b) return;
    ax.fit(b, 0.06, act === 'fitx' ? 'x' : act === 'fity' ? 'y' : null);
  }
  draw();
}

for (const row of document.querySelectorAll('.viewtools[data-ax]')) {
  row.addEventListener('click', (e) => {
    const act = e.target.dataset.act;
    if (!act) return;
    const which = row.dataset.ax;
    viewAction(which === 'main' ? mainAx
      : sideView() === 'solid' ? solidAx
        : (sideView() === 'heyman' || sideView() === 'radius') ? plotAx : forceAx, act);
  });
}

el('solidTools').addEventListener('click', (e) => {
  const which = e.target.dataset.view3d;
  if (!which) return;
  if (which === 'axes') {
    state.showSolidAxes = !state.showSolidAxes;
    el('showSolidAxes').classList.toggle('active', state.showSolidAxes);
    draw();
    return;
  }
  state.camera = which === 'front'
    ? { az: -90, el: 0 }              // straight at the meridian plane
    : { az: -45, el: 30 };            // the three-quarter view MATLAB used
  state.solidFit = null;
  draw();
});

// -------------------------------------------------- the panel's three tabs --

function showPanel(which) {
  for (const [name, tab, pane] of [
    ['geom', ui.tabGeom, ui.paneGeom],
    ['lot', ui.tabLot, ui.paneLot],
    ['mech', ui.tabMech, ui.paneMech],
  ]) {
    const on = name === which;
    tab.classList.toggle('active', on);
    pane.hidden = !on;
  }
  el('panel').scrollTop = 0;
}
ui.tabGeom.addEventListener('click', () => showPanel('geom'));
ui.tabLot.addEventListener('click', () => showPanel('lot'));
ui.tabMech.addEventListener('click', () => showPanel('mech'));

/**
 * Keep a duplicated control in step with the one the application listens to.
 *
 * Some controls appear in two tabs -- the thrust slider drives the mechanism
 * as much as the thrust line -- and a value must not live in two places. The
 * PRIMARY element stays the one `ui` refers to and every handler is attached
 * to; the clone writes into it and re-dispatches, so nothing else in the
 * application has to know the clone exists. The guard stops the echo: without
 * it each element would answer the other for ever.
 */
/**
 * Whether the thrust can be moved at all, said once for every copy of the
 * slider. Three controls carrying one parameter must not disagree about
 * being available: a live slider beside a dead one reads as a bug.
 */
function setThrustEnabled(on) {
  for (const el of [ui.thrust, ui.thrustM, ui.thrustP]) {
    if (el) el.disabled = !on;
  }
}

function mirror(primary, clone, event = 'input') {
  if (!primary || !clone) return;
  let echoing = false;
  const copy = (from, to) => {
    if (echoing) return;
    echoing = true;
    if (to.type === 'checkbox') to.checked = from.checked;
    else to.value = from.value;
    to.dispatchEvent(new Event(event, { bubbles: false }));
    echoing = false;
  };
  clone.addEventListener(event, () => copy(clone, primary));
  primary.addEventListener(event, () => copy(primary, clone));
}
// A star, not a chain: each copy mirrors the panel's slider, and the panel's
// own 'input' listener does the recomputation once, whichever was moved.
mirror(ui.thrust, ui.thrustM, 'input');
mirror(ui.thrust, ui.thrustP, 'input');
mirror(ui.imposeEnds, ui.imposeEnds2, 'change');
for (const b of [ui.pickA, ui.pickA2]) b.addEventListener('click', () => armEnd('A'));
for (const b of [ui.pickB, ui.pickB2]) b.addEventListener('click', () => armEnd('B'));
ui.imposeEnds.addEventListener('change', () => {
  // Ticking the box with nothing picked has nothing to impose: A and B are the
  // user's to place, anywhere they like, and the springings are only the most
  // common choice. The panel says which are still to be picked.
  if (ui.imposeEnds.checked && !(state.ends.A && state.ends.B)) {
    const m = state.model;
    if (m && m.joints && m.joints.length >= 2) {
      const { pointA, pointB } = springings(m.joints);
      state.ends.A = state.ends.A ?? pointA;
      state.ends.B = state.ends.B ?? pointB;
    }
  }
  recompute();
  fitForceView();
  draw();
});
mirror(ui.showCable, ui.showCable2, 'change');

// ------------------------------------------------ the side views --

function showSide(which) {
  const solid = which === 'solid';
  const heyman = which === 'heyman';
  const radius = which === 'radius';
  ui.tabSolid.classList.toggle('active', solid);
  ui.tabHeyman.classList.toggle('active', heyman);
  ui.tabRadius.classList.toggle('active', radius);
  ui.tabForce.classList.toggle('active', !solid && !heyman && !radius);
  el('solid').hidden = !solid;
  el('plot').hidden = !heyman && !radius;
  el('force').hidden = solid || heyman || radius;
  el('solidTools').hidden = !solid;
  ui.radiusMetric.hidden = !radius;
  ui.plotStatus.hidden = !heyman && !radius;
  ui.sideCaption.textContent = solid
    ? (ui.poleni.checked ? 'Blocks — dome lune' : 'Blocks — constant thickness')
    : heyman ? 'Heyman N-M diagram'
      : radius ? 'Thickness study'
    : 'Force polygon';
  // The canvas that was hidden has no size to speak of, so it must be
  // re-measured the moment it is shown or the first draw lands on a stale box.
  solidAx.syncSize();
  forceAx.syncSize();
  plotAx.syncSize();
  if (solid) state.solidFit = null;
  if (heyman || radius) state.plotFitKey = null;
  draw();
}
ui.tabForce.addEventListener('click', () => showSide('force'));
ui.tabSolid.addEventListener('click', () => showSide('solid'));
ui.tabHeyman.addEventListener('click', () => showSide('heyman'));
ui.tabRadius.addEventListener('click', () => showSide('radius'));
function setRadiusMetric(metric) {
  state.radiusMetric = metric;
  ui.radiusByWeight.classList.toggle('active', metric === 'weight');
  ui.radiusByThrust.classList.toggle('active', metric === 'thrust');
  state.plotFitKey = null;
  draw();
}
ui.radiusByWeight.addEventListener('click', () => setRadiusMetric('weight'));
ui.radiusByThrust.addEventListener('click', () => setRadiusMetric('thrust'));
for (const f of [ui.radiusASteps, ui.radiusBSteps, ui.radiusNSteps]) {
  f.addEventListener('change', () => {
    refreshRingStudy();
    draw();
  });
}
ui.radiusTriStep.addEventListener('input', () => {
  applyRadiusTriStep();
  draw();
});
ui.radiusTriStep.addEventListener('change', () => {
  applyRadiusTriStep({ commit: true });
  draw();
});

ui.poleni.addEventListener('change', () => {
  reweigh();
  refreshRingStudy();
  state.band = null; state.bandKey = null;
  state.solidFit = null;
  ui.sideCaption.textContent = sideView() === 'solid'
    ? (ui.poleni.checked ? 'Blocks — dome lune' : 'Blocks — constant thickness')
    : sideView() === 'heyman' ? 'Heyman N-M diagram'
      : sideView() === 'radius' ? 'Thickness study'
    : 'Force polygon';
  recompute();
  fitForceView();
  draw();
});
for (const f of [ui.domeAngle, ui.domeAxis]) {
  f.addEventListener('input', () => {
    if (!ui.poleni.checked) return;
    if (f === ui.domeAxis) state.axisPicked = true;
    reweigh();
    refreshRingStudy();
    state.band = null; state.bandKey = null;
    state.solidFit = null;
    recompute();
    fitForceView();
    draw();
  });
}
ui.pickAxis.addEventListener('click', () => {
  state.pickingAxis = !state.pickingAxis;
  if (state.pickingAxis) {
    if (traceArmed()) finishTrace();
    if (state.ref.picking) disarmReference();
  }
  ui.pickAxis.classList.toggle('armed', state.pickingAxis);
  ui.pickAxis.textContent = state.pickingAxis
    ? 'Click on the axis…' : 'Pick the axis on the drawing';
  draw();
});

ui.mechOn.addEventListener('change', () => {
  if (!ui.mechOn.checked) {
    state.mech = null;
    ui.mechVerdict.className = 'verdict';
    ui.mechVerdict.textContent = '—';
    ui.mechCount.textContent = '';
    ui.mechBand.textContent = '';
    ui.mechAmp.disabled = true;
  } else if (!ui.showMech.checked) {
    // Turning the analysis on without showing it would be a readout with
    // nothing on the drawing to match.
    ui.showMech.checked = true;
  }
  ui.goHmin.disabled = !ui.mechOn.checked;
  ui.goHmax.disabled = !ui.mechOn.checked;
  recompute();
  fitForceView();
  draw();
});
ui.mechAmp.addEventListener('input', draw);
ui.traceProfile.addEventListener('click', armProfile);
ui.clearProfiles.addEventListener('click', () => {
  state.profiles.list = [];
  state.profiles.current = null;
  ui.traceProfile.classList.remove('armed');
  ui.traceProfile.textContent = 'Trace an outline';
  reportProfiles();
  draw();
});
ui.pickCutCentre.addEventListener('click', () => {
  state.profiles.picking = !state.profiles.picking;
  if (state.profiles.picking && state.profiles.current) armProfile();
  ui.pickCutCentre.classList.toggle('armed', state.profiles.picking);
  ui.pickCutCentre.textContent = state.profiles.picking
    ? 'Click the centre…' : 'Pick the centre of the cuts';
  draw();
});
ui.cutProfile.addEventListener('click', cutProfiles);
ui.makeRing.addEventListener('click', () => {
  generateRing();
  showSide('radius');
});
ui.pickInner1.addEventListener('click', () => armThreePointRing('inner', 0));
ui.pickInner2.addEventListener('click', () => armThreePointRing('inner', 1));
ui.pickInner3.addEventListener('click', () => armThreePointRing('inner', 2));
ui.pickOuter1.addEventListener('click', () => armThreePointRing('outer', 0));
ui.pickOuter2.addEventListener('click', () => armThreePointRing('outer', 1));
ui.pickOuter3.addEventListener('click', () => armThreePointRing('outer', 2));
ui.makeThreePointRing.addEventListener('click', generateThreePointRing);
ui.clearThreePointRing.addEventListener('click', () => {
  clearThreePointRing();
  reportThreePointRing();
  draw();
});
ui.ringTri.addEventListener('input', () => {
  applyRadiusTriStep();
  if (!state.ringAuto) return;
  generateRing({ resetStudy: false });
});
ui.ringTri.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  nudgeRingTri(e.key === 'ArrowUp' ? 1 : -1);
});
ui.ringTri.addEventListener('wheel', (e) => {
  if (document.activeElement !== ui.ringTri) return;
  e.preventDefault();
  nudgeRingTri(e.deltaY < 0 ? 1 : -1);
}, { passive: false });
for (const f of [ui.ringRi, ui.ringN]) {
  f.addEventListener('change', () => {
    if (!state.ringAuto) return;
    generateRing();
  });
}
ui.addBlock.addEventListener('click', armBlock);
ui.cableWeights.addEventListener('input', draw);
for (const [b, pick] of [[ui.goHmin, (x) => x.min], [ui.goHmax, (x) => x.max]]) {
  b.addEventListener('click', () => {
    if (!state.band) return;
    ui.thrust.value = sliderForThrust(pick(state.band));
    recompute();
    fitForceView();
    draw();
  });
}
ui.reset.addEventListener('click', () => { fitViews(); draw(); });
ui.applyImageSize.addEventListener('click', applyImageSize);

// -------------------------------------------------------- save and reopen --

/**
 * Hand the file to the browser.
 *
 * A blob URL and a synthetic click is the only way a page with no server can
 * give a file to the person reading it. The URL is revoked afterwards, or the
 * blob stays in memory for the life of the tab.
 */
function saveWork() {
  try {
    // ALWAYS A SAVE AS. A page cannot write back to a file it opened, so every
    // save is a new file whatever it is called; asking for the name makes that
    // plain and lets a student keep a series -- "ring 0.15", "ring 0.20" --
    // instead of a directory of timestamps.
    const suggested = suggestedName(state);
    const chosen = window.prompt('Save the session as', suggested);
    if (chosen === null) return;                 // cancelled
    const name = chosen.trim() || suggested;
    state.dome = domeOptions();
    const data = serialise(state, {
      thrust: ui.thrust.value,
      startPos: ui.startPos.value,
      split: ui.split.value,
      imposeEnds: ui.imposeEnds.checked,
    });
    const text = JSON.stringify(data, null, 1);
    const url = URL.createObjectURL(
      new Blob([text], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = /\.json$/i.test(name) ? name : `${name}.json`;
    a.click();
    URL.revokeObjectURL(url);
    const kb = (text.length / 1024).toFixed(0);
    ui.saveStatus.textContent = `saved ${a.download} (${kb} kB)`;
  } catch (e) {
    ui.saveStatus.textContent = `could not save: ${e.message}`;
  }
}

/** Read a saved session back and put the app into it. */
function openWork(text) {
  let data;
  try {
    data = deserialise(text);
  } catch (e) {
    ui.saveStatus.textContent = `could not open: ${e.message}`;
    return;
  }

  state.model = data.model;
  clearPlotState();
  state.trace = data.trace
    ? { inner: data.trace.inner, outer: data.trace.outer,
      armed: null, cursor: null }
    : null;
  state.forces = data.forces;
  state.basePole = data.basePole
    ?? [totalLoad() / 4, -totalLoad() / 2];
  state.system = data.system;
  state.exampleName = data.exampleName;
  state.image = null;
  state.imageData = data.imageData ?? null;
  state.consistent = { ok: true, problems: [] };

  ui.system.value = data.system;
  ui.poleni.checked = !!data.dome.poleni;
  ui.domeAngle.value = data.dome.angleDeg;
  ui.domeAxis.value = data.dome.axisX;
  state.axisPicked = true;          // the file's axis, not a fresh default
  state.dome = data.dome;
  ui.thrust.value = data.controls.thrust;
  ui.startPos.value = data.controls.startPos;
  ui.split.value = data.controls.split;
  // The ends the student imposed, and whether they were imposed at all. A file
  // saved with A and B set used to reopen holding at nothing.
  state.ends = {
    A: data.ends && data.ends.A ? [...data.ends.A] : null,
    B: data.ends && data.ends.B ? [...data.ends.B] : null,
    picking: null,
    construction: null,
  };
  ui.imposeEnds.checked = !!(data.ends && data.ends.imposed);
  ui.imposeEnds2.checked = ui.imposeEnds.checked;

  resetAxis();
  reportDome();
  recompute();
  fitViews();
  draw();
  if (state.imageData?.dataUrl) {
    replaceBackgroundImage(state.imageData.dataUrl, {
      name: state.imageData.name,
      type: state.imageData.type,
    }, () => {
      fitViews();
      draw();
    });
  }
  listForces();
  reportScale();
  if (state.imageData?.dataUrl) {
    ui.saveStatus.textContent = `opened with background image (${state.imageData.name ?? 'embedded'})`;
  } else {
    ui.saveStatus.textContent = data.imageName
      ? `opened — the background image (${data.imageName}) is not in the file, `
        + 'load it again if you want it'
      : 'opened';
  }
}

ui.saveState.addEventListener('click', saveWork);
ui.loadState.addEventListener('click', () => ui.stateFile.click());
ui.stateFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => openWork(String(reader.result));
  reader.onerror = () => {
    ui.saveStatus.textContent = 'could not read that file';
  };
  reader.readAsText(file);
  // Clear it, or picking the same file twice in a row does nothing.
  e.target.value = '';
});
for (const k of ['showImage', 'showBlocks', 'showWeights', 'showThrust',
  'showCable', 'showLabels', 'showJoints', 'showRays', 'showReactions',
  'showScale']) {
  ui[k].addEventListener('change', draw);
}
// SHOWING THE MECHANISM CHANGES THE LINE, not only what is drawn of it: with
// the mechanism active the thrust is held inside the band so the line cannot
// leave the masonry. Bound to `draw` alone, switching it on left the previous,
// escaping line on screen until something else happened to recompute.
ui.showMech.addEventListener('change', () => {
  recompute();
  draw();
});
ui.flipY.addEventListener('change', () => {
  if (ui.flipY.checked) flipBackgroundImage();
});
window.addEventListener('resize', () => {
  // A resize changes the box without touching the view, which breaks the equal
  // aspect and quietly falsifies every length read off the drawing.
  mainAx.syncSize();
  forceAx.syncSize();
  solidAx.syncSize();
  plotAx.syncSize();
  mainAx.reequalize();
  forceAx.reequalize();
  solidAx.reequalize();
  plotAx.reequalize();
  draw();
});

/**
 * A diagnostic hook, deliberately kept.
 *
 * `axis equal` is the one property of this drawing that cannot be checked by
 * looking at it -- a ten per cent anisotropy is invisible and falsifies every
 * length read off the picture. This exposes the two scales so that the
 * property can be MEASURED, from the console or from a test:
 *
 *     aLOT.scales()   ->  { sx, sy, ratio }   ratio must be 1
 */
window.aLOT = {
  scales(ax = mainAx) {
    ax.syncSize();
    const b = ax.box;
    return {
      sx: b.w / (ax.view.xmax - ax.view.xmin),
      sy: b.h / (ax.view.ymax - ax.view.ymin),
      get ratio() { return this.sx / this.sy; },
    };
  },
  state,
  axes: { main: mainAx, force: forceAx },
};

applyRadiusTriStep({ commit: true });
reportThreePointRing();
loadCatalogue().catch((err) => {
  ui.meta.textContent = `could not load the examples: ${err.message}`;
});
