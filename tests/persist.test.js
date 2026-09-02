/**
 * Tests for saving and reopening a session.
 *
 * The property that matters is not that the file has the right keys, but that
 * a model read back produces the SAME MECHANICS: the same weights, the same
 * force polygon, the same thrust line. So the tests build a real traced arch,
 * put it through JSON, and compare the thrust lines vertex by vertex.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { area, centroid } from '../docs/app/js/core/geometry.js';
import { blocksBetween, weighBlocks } from '../docs/app/js/core/trace.js';
import { forcePolygon, freeThrustLine } from '../docs/app/js/core/statics.js';
import {
  serialise, deserialise, suggestedName, FORMAT, VERSION,
} from '../docs/app/js/core/persist.js';

function arc(r, n = 200) {
  return Array.from({ length: n }, (_, i) => {
    const t = (Math.PI * i) / (n - 1);
    return [-r * Math.cos(t), r * Math.sin(t)];
  });
}

/** A traced, weighed, scaled arch with a load on it, as the app would hold it. */
function session(n = 12) {
  const inner = arc(4);
  const outer = arc(5);
  const { blocks, joints } = blocksBetween(inner, outer, n);
  const model = {
    blocks,
    joints,
    centroids: blocks.map(centroid),
    weights: weighBlocks(blocks, { specificWeight: 20, thickness: 0.9 }),
    areas: blocks.map(area),
    thickness: blocks.map(() => 0.9),
    pointA: [-4.5, 0],
    pointB: [4.5, 0],
    frame: { coordinates: 'physical', units_per_pixel: 0.01, inferred: false },
  };
  const total = model.weights.reduce((s, v) => s + v, 0);
  return {
    state: {
      model,
      trace: { inner, outer },
      forces: { points: [[0.4, 4.8]], magnitudes: [12] },
      basePole: [total / 4, -total / 2],
      system: 'SI',
      exampleName: 'Traced arch',
    },
    controls: { thrust: 62, startPos: 80, split: 44 },
  };
}

test('a saved session declares its format and version', () => {
  const { state, controls } = session();
  const out = serialise(state, controls, 'bridge.jpg');
  assert.equal(out.format, FORMAT);
  assert.equal(out.version, VERSION);
  assert.equal(out.imageName, 'bridge.jpg');
  assert.match(out.saved, /^\d{4}-\d{2}-\d{2}T/);
});

test('a session survives the round trip through JSON unchanged', () => {
  const { state, controls } = session();
  const back = deserialise(JSON.stringify(serialise(state, controls)));

  assert.equal(back.system, 'SI');
  assert.deepEqual(back.controls, { thrust: 62, startPos: 80, split: 44 });
  assert.deepEqual(back.basePole, state.basePole);
  assert.equal(back.model.centroids.length, state.model.centroids.length);
  assert.deepEqual(back.forces.magnitudes, [12]);
  assert.deepEqual(back.trace.inner[0], state.trace.inner[0]);
  assert.equal(back.trace.outer.length, state.trace.outer.length);
});

test('a user-loaded background image is embedded in the saved JSON', () => {
  const { state, controls } = session();
  state.imageData = {
    name: 'bridge.png',
    type: 'image/png',
    width: 320,
    height: 240,
    dataUrl: 'data:image/png;base64,AAAA',
  };

  const saved = serialise(state, controls);
  const back = deserialise(JSON.stringify(saved));
  assert.equal(saved.image.name, 'bridge.png');
  assert.equal(saved.image.width, 320);
  assert.equal(back.imageData.dataUrl, 'data:image/png;base64,AAAA');
});

test('project notes and append-only log survive the round trip', () => {
  const { state, controls } = session();
  state.notes = 'Photo credit: archive\nRepeat with t/ri = 0.12';
  state.log = [
    '2026-08-31 10:00:00  Loaded image bridge.png',
    '2026-08-31 10:05:00  Generated 16 traced blocks',
  ];

  const back = deserialise(JSON.stringify(serialise(state, controls)));
  assert.equal(back.notes, state.notes);
  assert.deepEqual(back.log, state.log);
});

test('block groups survive the round trip', () => {
  const { state, controls } = session();
  state.model.groups = [
    { id: 1, name: 'Trace intrados/extrados 1', method: 'trace', gamma: 20, thickness: 0.8, color: '#8ecae6' },
    { id: 2, name: 'Drawn blocks 2', method: 'draw', gamma: 22, thickness: 1.1, color: '#ffb703' },
  ];
  state.model.blockGroups = state.model.blocks.map((_, i) => (i < 6 ? 1 : 2));

  const back = deserialise(JSON.stringify(serialise(state, controls)));
  assert.deepEqual(back.model.groups, state.model.groups);
  assert.deepEqual(back.model.blockGroups, state.model.blockGroups);
});

test('an image-only session can be saved before tracing blocks', () => {
  const state = {
    model: {
      name: 'survey.jpg',
      blocks: [],
      centroids: [],
      weights: [],
      areas: [],
      thickness: [],
      joints: [],
      image: 'survey.jpg',
      imageSize: [800, 600],
      frame: { coordinates: 'pixels', units_per_pixel: 1, inferred: false },
    },
    imageData: {
      name: 'survey.jpg',
      type: 'image/jpeg',
      width: 800,
      height: 600,
      dataUrl: 'data:image/jpeg;base64,AAAA',
    },
  };
  const back = deserialise(JSON.stringify(serialise(state)));
  assert.equal(back.model.blocks.length, 0);
  assert.equal(back.model.imageSize[0], 800);
  assert.equal(back.imageData.name, 'survey.jpg');
});

test('a stretched background image keeps its drawn size', () => {
  const { state } = session();
  state.model.image = 'survey.jpg';
  state.model.imageSize = [800, 600];
  state.model.imageDrawSize = [12, 7];

  const back = deserialise(JSON.stringify(serialise(state)));
  assert.deepEqual(back.model.imageDrawSize, [12, 7]);
});

test('the reopened model gives exactly the same thrust line', () => {
  // The real test: not that the fields came back, but that the mechanics did.
  const { state } = session(16);
  const back = deserialise(JSON.stringify(serialise(state)));

  const run = (m) => {
    const order = m.centroids
      .map((c, i) => [c[0], i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
    const w = order.map((i) => m.weights[i]);
    const g = order.map((i) => m.centroids[i]);
    const total = w.reduce((s, v) => s + v, 0);
    const fp = forcePolygon(w, [total * 0.21, -total * 0.5]);
    return freeThrustLine(fp, g, m.joints[m.joints.length - 1], m.joints[0], 0.7);
  };

  const before = run(state.model);
  const after = run(back.model);
  assert.equal(after.points.length, before.points.length);
  before.points.forEach((p, i) => {
    assert.ok(Math.abs(p[0] - after.points[i][0]) < 1e-12, `x at vertex ${i}`);
    assert.ok(Math.abs(p[1] - after.points[i][1]) < 1e-12, `y at vertex ${i}`);
  });
  assert.ok(Math.abs(before.endFraction - after.endFraction) < 1e-12);
});

test('blocks keep their areas, so the weights would be recomputed the same', () => {
  const { state } = session(20);
  const back = deserialise(JSON.stringify(serialise(state)));
  state.model.blocks.forEach((p, i) => {
    assert.ok(Math.abs(area(p) - area(back.model.blocks[i])) < 1e-12,
      `block ${i}`);
  });
});

test('the scale and frame come back, so lengths keep their meaning', () => {
  const { state } = session();
  const back = deserialise(JSON.stringify(serialise(state)));
  assert.equal(back.model.frame.coordinates, 'physical');
  assert.equal(back.model.frame.units_per_pixel, 0.01);
});

test('a file from somewhere else is refused, not half-loaded', () => {
  assert.throws(() => deserialise('not json at all'), /not a JSON file/);
  assert.throws(() => deserialise('{"hello": 1}'), /not saved by/);
  assert.throws(
    () => deserialise(JSON.stringify({ format: FORMAT, version: 99 })),
    /later version/,
  );
});

test('a damaged file is refused with a sentence that says what is wrong', () => {
  const { state } = session(10);
  const good = serialise(state);

  const short = JSON.parse(JSON.stringify(good));
  short.model.weights.pop();
  assert.throws(() => deserialise(short), /9 weights against 10 blocks/);

  const jointless = JSON.parse(JSON.stringify(good));
  jointless.model.joints.pop();
  assert.throws(() => deserialise(jointless), /joints against 10 blocks/);

  const lame = JSON.parse(JSON.stringify(good));
  lame.forces.magnitudes = [];
  assert.throws(() => deserialise(lame), /without a magnitude/);

  const broken = JSON.parse(JSON.stringify(good));
  broken.model.blocks[3].y.pop();
  assert.throws(() => deserialise(broken), /malformed block/);
});

test('a session with nothing in it saves and reopens without complaint', () => {
  // Opening the app and pressing save immediately must not throw.
  const empty = deserialise(JSON.stringify(serialise({})));
  assert.equal(empty.model, null);
  assert.equal(empty.trace, null);
  assert.deepEqual(empty.forces, { points: [], magnitudes: [] });
  assert.deepEqual(empty.controls, { thrust: 50, startPos: 50, split: 50 });
});

test('the suggested file name is safe to write to disk', () => {
  const name = suggestedName({ exampleName: 'Poleni / Example 04' });
  assert.match(name, /^Poleni_Example_04-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/);
  assert.ok(!/[/\\:]/.test(name.slice(0, -5)), name);
  assert.match(suggestedName({}), /^arch-/);
});

// ------------------------------------------------------ the dome settings --

import { luneWeights, defaultAxis } from '../docs/app/js/core/dome.js';

test('the dome settings travel with the weights they produced', () => {
  // Saving a lune and reopening it must not show a panel switched off beside
  // weights that are still those of a lune.
  const { state } = session(12);
  const { weights } = luneWeights(state.model.blocks,
    { axisX: 0, angleDeg: 22, specificWeight: 20 });
  state.model.weights = weights;
  state.dome = { poleni: true, angleDeg: 22, axisX: 0.5 };

  const back = deserialise(JSON.stringify(serialise(state)));
  assert.deepEqual(back.dome, {
    poleni: true, angleDeg: 22, axisX: 0.5, align: 'center',
  });
  back.model.weights.forEach((w, i) => {
    assert.ok(Math.abs(w - weights[i]) < 1e-12, `weight ${i}`);
  });
});

test('a file saved before the dome existed opens as a barrel', () => {
  const { state } = session(8);
  const data = serialise(state);
  delete data.dome;
  const back = deserialise(JSON.stringify(data));
  assert.deepEqual(back.dome, {
    poleni: false, angleDeg: 22.5, axisX: 0, align: 'center',
  });
});

test('a model with no joints at all survives the round trip', () => {
  // A Poleni dome, a section with detached members, an assembly drawn by hand:
  // none of them is a chain of abutting voussoirs, so none of them has joints.
  // Such a session used to save and then refuse to reopen — "0 joints against
  // 31 blocks" — which is the one thing a save format must not do.
  const { state, controls } = session();
  state.model.joints = null;

  const back = deserialise(JSON.stringify(serialise(state, controls)));
  assert.equal(back.model.joints, null);
  assert.equal(back.model.blocks.length, state.model.blocks.length);
});

test('an empty joint list reads back as no joints, not as an empty one', () => {
  // [] is TRUTHY, so a file written by an older version came back claiming to
  // have joints and every `if (!m.joints)` guard downstream let it through.
  const { state, controls } = session();
  const saved = serialise(state, controls);
  saved.model.joints = [];

  const back = deserialise(JSON.stringify(saved));
  assert.equal(back.model.joints, null);
});

test('a joint list of the wrong length is still refused', () => {
  const { state, controls } = session();
  const saved = serialise(state, controls);
  saved.model.joints = saved.model.joints.slice(0, 2);

  assert.throws(() => deserialise(JSON.stringify(saved)), /joints against/);
});
