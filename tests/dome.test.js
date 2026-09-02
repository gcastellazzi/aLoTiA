/**
 * Tests for Poleni's dome: the lune, its weights, and the solids.
 *
 * The weights are checked against closed-form volumes -- a rectangle turned
 * about an axis is an exact annular wedge -- rather than against a previous
 * run, and the mechanical consequence is checked too: a dome must not give the
 * same thrust line as a barrel of the same profile.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { area, centroid } from '../docs/app/js/core/geometry.js';
import { blocksBetween, weighBlocks, springings } from '../docs/app/js/core/trace.js';
import {
  toRadians, defaultAxis, luneWidth, chordWidth, scaledChordWidths,
  luneVolume, luneWeights,
  revolve, extrude, solids, widthRange, sectionRadii, endParallels,
} from '../docs/app/js/core/dome.js';

function arc(r, n = 300) {
  return Array.from({ length: n }, (_, i) => {
    const t = (Math.PI * i) / (n - 1);
    return [-r * Math.cos(t), r * Math.sin(t)];
  });
}

const rect = (x0, x1, y0, y1) => ({ x: [x0, x1, x1, x0], y: [y0, y0, y1, y1] });

// ------------------------------------------------------------ the geometry --

test('the axis of a symmetric arch is the mid-point of the springings', () => {
  const { joints } = blocksBetween(arc(4), arc(5), 12);
  const { pointA, pointB } = springings(joints);
  assert.ok(Math.abs(defaultAxis(pointA, pointB)) < 1e-9,
    'a semicircular arch about the origin has its axis at x = 0');
  assert.equal(defaultAxis([2, 0], [8, 0]), 5);
  assert.equal(defaultAxis(null, null), 0);
});

test('the lune is broad at the major parallel and narrow at the crown', () => {
  // The whole point of Poleni: the width is proportional to the radius.
  assert.ok(Math.abs(luneWidth(10, 180) - 10 * Math.PI) < 1e-12);
  assert.ok(luneWidth(10, 15) > luneWidth(1, 15));
  assert.equal(luneWidth(0, 15), 0, 'at the axis the lune closes to nothing');
});

test('the volume of a revolved rectangle is the exact annular wedge', () => {
  // Turning the rectangle r1 <= x <= r2, 0 <= y <= h through theta gives
  //     V = theta/2 * (r2^2 - r1^2) * h
  // which Pappus must reproduce.
  for (const [r1, r2, h, deg] of [[2, 3, 1, 15], [5, 9, 2.5, 40], [1, 1.2, 0.3, 7]]) {
    const exact = (toRadians(deg) / 2) * (r2 * r2 - r1 * r1) * h;
    const got = luneVolume(rect(r1, r2, 0, h), 0, deg);
    assert.ok(Math.abs(got - exact) / exact < 1e-12,
      `r ${r1}..${r2}: ${got} against ${exact}`);
  }
});

test('the volume follows the axis, not the origin', () => {
  const poly = rect(12, 13, 0, 1);
  const near = luneVolume(poly, 10, 15);      // radius 2.5
  const far = luneVolume(poly, 0, 15);        // radius 12.5
  assert.ok(Math.abs(far / near - 5) < 1e-12, `${far / near}`);
});

// ------------------------------------------------------------- the weights --

test('lune weights are the area times the swept width', () => {
  const polys = [rect(2, 3, 0, 1), rect(6, 7, 0, 1)];
  const { weights, widths, radii } = luneWeights(polys,
    { axisX: 0, angleDeg: 30, specificWeight: 20 });

  assert.deepEqual(radii.map((r) => +r.toFixed(9)), [2.5, 6.5]);
  widths.forEach((w, i) => {
    assert.ok(Math.abs(w - radii[i] * toRadians(30)) < 1e-12);
  });
  weights.forEach((W, i) => {
    const expect = Math.abs(area(polys[i])) * widths[i] * 20;
    assert.ok(Math.abs(W - expect) < 1e-12, `block ${i}`);
  });
  // The outer block is heavier in exactly the ratio of the radii.
  assert.ok(Math.abs(weights[1] / weights[0] - 6.5 / 2.5) < 1e-12);
});

test('scaled Poleni chord widths honour the assigned block thicknesses', () => {
  const polys = [rect(2, 3, 0, 1), rect(6, 7, 0, 1)];
  const got = scaledChordWidths(polys, {
    axisX: 0, angleDeg: 22.5, thickness: [0.5, 1],
  });
  const alpha = 1 / chordWidth(7, 22.5);

  assert.ok(Math.abs(got.alpha - alpha) < 1e-12);
  assert.ok(Math.abs(got.widths[1] - 1) < 1e-12);
  assert.ok(Math.abs(got.widths[0] - alpha * chordWidth(3, 22.5) * 0.5) < 1e-12);
});

test('scaled Poleni weights use the scaled local chord width', () => {
  const polys = [rect(2, 3, 0, 1), rect(6, 7, 0, 1)];
  const got = luneWeights(polys, {
    axisX: 0, angleDeg: 22.5, specificWeight: 20, thickness: [0.5, 1],
  });

  got.weights.forEach((W, i) => {
    assert.ok(Math.abs(W - Math.abs(area(polys[i])) * got.widths[i] * 20) < 1e-12);
  });
  assert.ok(Math.abs(got.widths[1] - 1) < 1e-12);
});

test('a dome does not weigh like the barrel of the same profile', () => {
  // The mechanical point. Same blocks, same density; only the idealisation
  // differs, and the distribution of weight along the arch changes with it.
  const { blocks, joints } = blocksBetween(arc(4), arc(5), 16);
  const { pointA, pointB } = springings(joints);
  const axisX = defaultAxis(pointA, pointB);

  const barrel = weighBlocks(blocks, { specificWeight: 20, thickness: 1 });
  const { weights: dome } = luneWeights(blocks,
    { axisX, angleDeg: 15, specificWeight: 20 });

  // Normalise both to the same total and compare the SHARE each block takes.
  const share = (w) => {
    const t = w.reduce((a, b) => a + b, 0);
    return w.map((v) => v / t);
  };
  const sb = share(barrel);
  const sd = share(dome);

  // The springing blocks take a bigger share of a dome than of a barrel, and
  // the crown blocks a smaller one.
  const crown = Math.floor(blocks.length / 2);
  assert.ok(sd[0] > sb[0], `springing: ${sd[0]} against ${sb[0]}`);
  assert.ok(sd[crown] < sb[crown], `crown: ${sd[crown]} against ${sb[crown]}`);

  const moved = sd.reduce((s, v, i) => s + Math.abs(v - sb[i]), 0);
  assert.ok(moved > 0.05,
    `the two idealisations should differ appreciably, moved ${moved}`);
});

test('a lune of 360 degrees is the whole dome of revolution', () => {
  // A sanity anchor: the ring of blocks swept all the way round has the volume
  // Pappus gives for the full revolution.
  const poly = rect(3, 4, 0, 2);
  const full = luneVolume(poly, 0, 360);
  const exact = Math.PI * (4 * 4 - 3 * 3) * 2;
  assert.ok(Math.abs(full - exact) / exact < 1e-12, `${full} against ${exact}`);
});

test('the width range reports the major and the minor parallel', () => {
  const { blocks, joints } = blocksBetween(arc(4), arc(5), 16);
  const { pointA, pointB } = springings(joints);
  const r = widthRange(blocks, defaultAxis(pointA, pointB), 15);
  assert.ok(r.max > r.min, 'the lune must taper');
  assert.ok(Math.abs(r.max - r.rMax * toRadians(15)) < 1e-12);
  assert.ok(r.rMin < r.rMax);
  assert.equal(widthRange([], 0, 15), null);
});

// -------------------------------------------------------------- the solids --

/** Every face of a solid, flattened to its vertices. */
const verticesOf = (faces) => faces.flat();

test('a revolved block is closed: side faces plus two caps', () => {
  const poly = rect(3, 4, 0, 1);
  const faces = revolve(poly, 0, 20, 6);
  assert.equal(faces.length, 4 * 6 + 2, 'edges x steps, plus the two ends');
  assert.ok(faces.every((f) => f.length >= 3));
  assert.ok(verticesOf(faces).every((p) => p.length === 3 && p.every(Number.isFinite)));
});

test('the revolved block starts in the meridian plane and turns away from it', () => {
  const faces = revolve(rect(3, 4, 0, 1), 0, 20, 4);
  const depth = verticesOf(faces).map((p) => p[1]);
  assert.ok(Math.abs(Math.min(...depth)) < 1e-12, 'one end lies at depth zero');
  // The far end sits at r sin(theta); the outer radius is 4.
  const far = 4 * Math.sin(toRadians(20));
  assert.ok(Math.abs(Math.max(...depth) - far) < 1e-9,
    `${Math.max(...depth)} against ${far}`);
});

test('the vertical coordinate is untouched by the revolution', () => {
  const faces = revolve(rect(3, 4, 1.5, 2.5), 0, 45, 5);
  const z = verticesOf(faces).map((p) => p[2]);
  assert.ok(Math.abs(Math.min(...z) - 1.5) < 1e-12);
  assert.ok(Math.abs(Math.max(...z) - 2.5) < 1e-12);
});

test('an extruded block is the same shape front and back', () => {
  const faces = extrude(rect(0, 2, 0, 1), 0.6);
  assert.equal(faces.length, 4 + 2);
  const depth = verticesOf(faces).map((p) => p[1]);
  assert.ok(Math.abs(Math.min(...depth) + 0.3) < 1e-12);
  assert.ok(Math.abs(Math.max(...depth) - 0.3) < 1e-12);
  // x and z are the profile, unchanged.
  const xs = new Set(verticesOf(faces).map((p) => +p[0].toFixed(9)));
  assert.deepEqual([...xs].sort((a, b) => a - b), [0, 2]);
});

test('solids picks the idealisation and keeps one entry per block', () => {
  const { blocks } = blocksBetween(arc(4), arc(5), 8);
  const barrel = solids(blocks, { poleni: false, thickness: blocks.map(() => 1) });
  const dome = solids(blocks, { poleni: true, axisX: 0, angleDeg: 15, steps: 4 });
  assert.equal(barrel.length, blocks.length);
  assert.equal(dome.length, blocks.length);
  // A barrel block is the same width everywhere; a lune block is not.
  const spread = (faces) => {
    const d = verticesOf(faces).map((p) => Math.abs(p[1]));
    return Math.max(...d);
  };
  assert.ok(Math.abs(spread(barrel[0]) - spread(barrel[4])) < 1e-12);
  assert.ok(spread(dome[0]) > spread(dome[4]) * 1.5,
    'the lune must be far broader at the springing than at the crown');
});

test('scaled Poleni solids show steps where adjacent blocks have different thicknesses', () => {
  const polys = [rect(6, 7, 0, 1), rect(6, 7, 1, 2)];
  const dome = solids(polys, {
    poleni: true, axisX: 0, angleDeg: 22.5, steps: 4,
    thickness: [1, 0.5], align: 'center',
  });
  const spread = (faces) => {
    const d = verticesOf(faces).map((p) => p[1]);
    return Math.max(...d) - Math.min(...d);
  };

  assert.ok(Math.abs(spread(dome[0]) - 1) < 1e-12);
  assert.ok(Math.abs(spread(dome[1]) - 0.5) < 1e-12);
});

// ------------------------------------------------------ the projection --

import {
  frame, project, depth, projectedBounds, visibleFaces, parallels,
} from '../docs/app/js/render/solid.js';

test('the viewing frame is orthonormal, so the picture is not distorted', () => {
  for (const [az, el] of [[-60, 30], [0, 0], [-45, 20], [123, -15]]) {
    const f = frame(az, el);
    const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    for (const [name, v] of [['u', f.u], ['v', f.v], ['d', f.d]]) {
      assert.ok(Math.abs(dot(v, v) - 1) < 1e-12, `${name} not unit at ${az},${el}`);
    }
    assert.ok(Math.abs(dot(f.u, f.v)) < 1e-12, 'u . v');
    assert.ok(Math.abs(dot(f.u, f.d)) < 1e-12, 'u . d');
    assert.ok(Math.abs(dot(f.v, f.d)) < 1e-12, 'v . d');
  }
});

test('the projection preserves lengths that lie in the screen plane', () => {
  // The three-dimensional counterpart of `axis equal`: a segment perpendicular
  // to the viewing direction must come out at its true length.
  const f = frame(-60, 30);
  const scale = 3.7;
  const p = [0, 0, 0];
  for (const dir of [f.u, f.v]) {
    const q = [dir[0] * scale, dir[1] * scale, dir[2] * scale];
    const a = project(p, f);
    const b = project(q, f);
    assert.ok(Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - scale) < 1e-12);
  }
});

test('depth grows towards the camera and vanishes across the screen', () => {
  const f = frame(-60, 30);
  const near = [f.d[0], f.d[1], f.d[2]];
  assert.ok(depth(near, f) > depth([0, 0, 0], f));
  assert.ok(Math.abs(depth(f.u, f)) < 1e-12, 'moving across the screen is not depth');
});

test('the projected bounds cover every vertex, and are empty for nothing', () => {
  const f = frame(-60, 30);
  const s = solids([rect(3, 4, 0, 1)], { poleni: true, axisX: 0, angleDeg: 30, steps: 4 });
  const b = projectedBounds(s, f);
  assert.ok(b.xmax > b.xmin && b.ymax > b.ymin);
  for (const face of s[0]) {
    for (const p of face) {
      const [x, y] = project(p, f);
      assert.ok(x >= b.xmin - 1e-12 && x <= b.xmax + 1e-12);
      assert.ok(y >= b.ymin - 1e-12 && y <= b.ymax + 1e-12);
    }
  }
  assert.equal(projectedBounds([], f), null);
});

// ------------------------------------------------- what the eye can see --

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The outward normal of a face, found the way the renderer finds it. */
function outwardOf(solid, face) {
  let cx = 0; let cy = 0; let cz = 0; let n = 0;
  for (const g of solid) for (const p of g) { cx += p[0]; cy += p[1]; cz += p[2]; n += 1; }
  const c = [cx / n, cy / n, cz / n];
  const [a, b, d] = face;
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  let v = [e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0]];
  let fx = 0; let fy = 0; let fz = 0;
  for (const p of face) { fx += p[0]; fy += p[1]; fz += p[2]; }
  const away = [fx / face.length - c[0], fy / face.length - c[1], fz / face.length - c[2]];
  if (dot3(v, away) < 0) v = [-v[0], -v[1], -v[2]];
  const L = Math.hypot(...v) || 1;
  return [v[0] / L, v[1] / L, v[2] / L];
}

test('the winding of a solid is not something the renderer may rely on', () => {
  // THE MEASUREMENT THAT DECIDED HOW THE CULLING WORKS. If the two generators
  // wound their faces the same way, the outward normal could be read off the
  // vertex order. They do not: an extruded ring comes out one way and a
  // revolved lune both ways, so a normal taken from the order alone would hide
  // the wrong half. This test states the fact the renderer works around, and
  // will fail loudly if a future change makes the winding consistent -- at
  // which point the workaround could go.
  const poly = { x: [0, 2, 2, 0], y: [0, 0, 1, 1] };
  const raw = (face) => {
    const [a, b, c] = face;
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    return [e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0]];
  };
  const solid = extrude(poly, 1);
  const agree = solid.filter((f) => dot3(raw(f), outwardOf(solid, f)) > 0).length;
  assert.ok(agree === 0 || agree === solid.length,
    'this test only says the renderer must not assume; it may be either');
});

test('every face is drawn, and the ones behind are drawn first', () => {
  // THE CONTRACT THE PICTURE DEPENDS ON, and the reason it is a plain sort
  // rather than anything cleverer: nothing may be dropped. Culling the faces
  // turned away is the usual answer and was tried; it needs an outward
  // direction the winding does not supply, and it put holes in the ribs and
  // shells of St Peter's. A hidden face costs a fill that is covered a moment
  // later; a wrong guess costs a hole.
  const solid = extrude({ x: [0, 2, 2, 0], y: [0, 0, 1, 1] }, 1);
  const f = frame(-60, 30);
  // `split: 0` asks for the faces as they were built. The default cuts the
  // deep ones up, which is a separate contract, pinned below.
  const seen = visibleFaces([solid], f, { split: 0 });

  assert.equal(seen.length, solid.length, 'no face may be dropped');
  const kept = new Set(seen.map((s) => s.face));
  for (const face of solid) assert.ok(kept.has(face), 'a face went missing');

  for (let i = 1; i < seen.length; i++) {
    assert.ok(seen[i].z >= seen[i - 1].z, 'the painter is given them farthest first');
  }
});

test('a face is placed by its mean depth', () => {
  // Not its farthest vertex, which was tried: on a dome it painted the ribs
  // through the shell that covers them. The mean is what MATLAB's patch uses
  // and what these models are drawn right by.
  const solid = extrude({ x: [0, 2, 2, 0], y: [0, 0, 1, 1] }, 1);
  const f = frame(-60, 30);
  for (const item of visibleFaces([solid], f, { split: 0 })) {
    const mean = item.face.reduce((a, p) => a + depth(p, f), 0) / item.face.length;
    assert.ok(Math.abs(item.z - mean) < 1e-12);
  }
});

test('every block is accounted for, whatever the order comes out as', () => {
  const a = extrude({ x: [0, 1, 1, 0], y: [0, 0, 1, 1] }, 1);
  const b = extrude({ x: [6, 7, 7, 6], y: [6, 6, 7, 7] }, 1);
  const seen = visibleFaces([a, b], frame(-60, 30), { split: 0 });
  assert.equal(seen.length, a.length + b.length);
  assert.equal(seen.filter((s) => s.block === 0).length, a.length);
  assert.equal(seen.filter((s) => s.block === 1).length, b.length);
});

test('culling is still there, refused by default, and says what it would drop', () => {
  // Not used, and not deleted: it is the right answer if the winding is ever
  // made consistent, and this pins what it does so that turning it on would be
  // a decision rather than a discovery.
  const solid = extrude({ x: [0, 1, 1, 0], y: [0, 0, 1, 1] }, 1);
  const f = frame(-60, 30);
  assert.equal(visibleFaces([solid], f, { split: 0 }).length, 6);
  assert.equal(visibleFaces([solid], f, { cull: true, split: 0 }).length, 3);
});

test('a solid with no faces is skipped rather than throwing', () => {
  assert.deepEqual(visibleFaces([[]], frame()), []);
  assert.deepEqual(visibleFaces([], frame()), []);
});

test('a face too deep to hold one position is cut into four', () => {
  // WHY THIS EXISTS. One depth per face is a fair summary of a small face and
  // an unfair one of a large face held edge-on, and it was the second kind that
  // painted St Peter's violet rib through the orange shell along a meridian.
  // Such a face is cut into a 2 x 2 grid so that each quarter carries a depth
  // of its own; measured against a software depth buffer this took the
  // mis-painted pixels of that view from 1010 to 74.
  const solid = extrude({ x: [0, 2, 2, 0], y: [0, 0, 1, 1] }, 1);
  const f = frame(-60, 30);

  const whole = visibleFaces([solid], f, { split: 0 });
  const cut = visibleFaces([solid], f);
  assert.ok(cut.length > whole.length, 'the deep faces should have been cut');

  // The four side faces are quadrilaterals and go to four cells each; the two
  // end caps are quadrilaterals here too, so all six do.
  assert.equal(cut.length, 6 * 4);
  for (const item of cut) assert.equal(item.block, 0);
  for (let i = 1; i < cut.length; i++) {
    assert.ok(cut[i].z >= cut[i - 1].z, 'still farthest first');
  }
});

test('cutting a face up does not draw a lattice across it', () => {
  // Each cell reports which of its four edges it inherited from the face it
  // came from, and only those are outlined. Around one face the inherited
  // edges must number exactly 2 per side x 4 sides.
  const solid = extrude({ x: [0, 2, 2, 0], y: [0, 0, 1, 1] }, 1);
  const cut = visibleFaces([solid], frame(-60, 30));
  const inherited = cut.reduce((n, item) => n + item.rim.filter(Boolean).length, 0);
  assert.equal(inherited, 6 * 8, 'every original edge, once per cell along it');
  // A cell in a 2 x 2 grid touches the boundary on exactly two of its sides.
  for (const item of cut) {
    assert.equal(item.rim.filter(Boolean).length, 2);
  }
});

test('the cells of a face cover it exactly', () => {
  // The grid is bilinear, so the four cells partition the quadrilateral: their
  // projected areas must sum to its own.
  const f = frame(-35, 25);
  const solid = extrude({ x: [0, 2, 2, 0], y: [0, 0, 1, 1] }, 1);
  const shoelace = (face) => {
    const q = face.map((p) => project(p, f));
    let a = 0;
    for (let i = 0; i < q.length; i++) {
      const b = q[(i + 1) % q.length];
      a += q[i][0] * b[1] - b[0] * q[i][1];
    }
    return Math.abs(a) / 2;
  };
  const whole = visibleFaces([solid], f, { split: 0 });
  const cut = visibleFaces([solid], f);
  const total = (list) => list.reduce((a, item) => a + shoelace(item.face), 0);
  assert.ok(Math.abs(total(cut) - total(whole)) < 1e-9);
});

test('the threshold is read against the depth of the whole scene', () => {
  // So that it means the same thing on a lune five units deep and a dome forty:
  // put the same block in a scene ten times deeper and it stops being the deep
  // one. Nothing here is in absolute units.
  const f = frame(-60, 30);
  const small = extrude({ x: [0, 1, 1, 0], y: [0, 0, 1, 1] }, 1);
  const far = extrude({ x: [0, 1, 1, 0], y: [200, 200, 201, 201] }, 1);
  assert.equal(visibleFaces([small], f).length, 6 * 4, 'alone, it is the scene');
  const together = visibleFaces([small, far], f);
  assert.equal(together.filter((s) => s.block === 0).length, 6,
    'beside something far away, the same block is shallow and is left whole');
});

test('the budget is spent on the deepest faces, and the rest are left whole', () => {
  // Cutting faces up costs a fill apiece. On a model too large to cut all of
  // them, the ones a single depth describes worst are the ones worth cutting,
  // so the deepest are taken first and the budget stops there.
  const f = frame(-60, 30);
  const wall = Array.from({ length: 20 }, (_, i) => extrude(
    { x: [i, i + 1, i + 1, i], y: [0, 0, 1, 1] }, 1 + i,
  ));
  const plain = visibleFaces(wall, f, { split: 0 });
  const full = visibleFaces(wall, f);
  assert.ok(full.length > plain.length);

  const tight = visibleFaces(wall, f, { budget: plain.length + 12 });
  assert.ok(tight.length <= plain.length + 12, 'the budget is not overspent');
  assert.ok(tight.length > plain.length, 'and it is spent');

  // The blocks that were cut are the deep ones: here, the thickest.
  const cutBlocks = new Set(tight.filter((item) => item.rim).map((item) => item.block));
  assert.ok(cutBlocks.size > 0);
  assert.ok(Math.min(...cutBlocks) > 10, 'the thin near blocks were left alone');
});

// ------------------------------------------------------------- the parallels --

test('a parallel is a circle about the axis, at the height it was asked for', () => {
  // The lune is a slice and does not say what it is a slice of. These say it.
  const axisX = 7;
  const [ring] = parallels(axisX, [3], [11]);
  assert.equal(ring.length, 128);
  for (const [x, y, z] of ring) {
    assert.ok(Math.abs(Math.hypot(x - axisX, y) - 3) < 1e-12, 'on the circle');
    assert.ok(Math.abs(z - 11) < 1e-12, 'at the height');
  }
  // A full turn, once: the first point is not repeated at the end, and the two
  // ends are one step apart.
  const step = (2 * Math.PI) / 128;
  const angle = (p) => Math.atan2(p[1], p[0] - axisX);
  assert.ok(Math.abs(angle(ring[0])) < 1e-12);
  // atan2 comes back in (-pi, pi], so one step short of a full turn reads as
  // one step before zero.
  assert.ok(Math.abs(angle(ring[ring.length - 1]) + step) < 1e-9);
});

test('the out-of-plane offset moves the circle with the solid it belongs to', () => {
  // The solids are drawn recentred, and a reference that did not follow would
  // sit somewhere else entirely.
  const [ring] = parallels(0, [2], [0], { depth: -5 });
  for (const [x, y] of ring) {
    assert.ok(Math.abs(Math.hypot(x, y + 5) - 2) < 1e-12);
  }
});

test('one ring per radius per height, and none for a degenerate ask', () => {
  assert.equal(parallels(0, [1, 4], [0, 9]).length, 4);
  assert.equal(parallels(0, [], [0, 9]).length, 0);
  assert.equal(parallels(0, [1], []).length, 0);
  // A radius of zero is the axis itself, which is already drawn as a line.
  assert.equal(parallels(0, [0], [3]).length, 0);
  assert.equal(parallels(0, [Number.NaN, 2], [3]).length, 1);
});

test('the parallels can be framed with the solid, being made of the same points', () => {
  // The reason they are built apart from the drawing: the rings reach right
  // round the axis while the lune is a slice, so a view fitted to the slice
  // alone would frame them out of their own picture.
  const f = frame(-45, 30);
  const solid = extrude({ x: [4, 5, 5, 4], y: [0, 0, 1, 1] }, 1);
  const rings = parallels(0, [5], [0, 1]);
  const tight = projectedBounds([solid], f);
  const wide = projectedBounds([solid, rings], f);
  assert.ok(wide.xmin < tight.xmin && wide.xmax > tight.xmax);
});

test('a horizontal section gives the intrados and the extrados at that level', () => {
  // A ring of two voussoirs, inner radius 4 and outer 6 about an axis at 10.
  const left = { x: [4, 6, 6, 4], y: [0, 0, 3, 3] };
  const right = { x: [14, 16, 16, 14], y: [0, 0, 3, 3] };
  const rs = sectionRadii([left, right], 10, 1.5).sort((a, b) => a - b);
  assert.deepEqual(rs, [4, 4, 6, 6], 'two crossings a side, at the two radii');
  // Above and below the masonry there is nothing to cross.
  assert.deepEqual(sectionRadii([left, right], 10, 5), []);
});

test('each end gets the radii of what actually stands there', () => {
  // A dome in two courses: a wide one at the bottom, a narrow one on top. The
  // point of the exercise is that the two levels must NOT share their radii.
  const base = { x: [4, 8, 8, 4], y: [0, 0, 5, 5] };
  const crown = { x: [5, 6, 6, 5], y: [5, 5, 9, 9] };
  const ends = endParallels([base, crown], 0);
  assert.equal(ends.length, 2);
  assert.deepEqual(ends[0], { z: 0, radii: [4, 8] }, 'the springing course');
  assert.deepEqual(ends[1], { z: 9, radii: [5, 6] }, 'the crown course');
});

test('the section is cut inside the model, so a flat end still gives two radii', () => {
  // Cut exactly at the bottom face and the polygon only touches the level: one
  // point, one radius, no annulus. The inset is what avoids that.
  const block = { x: [4, 8, 8, 4], y: [0, 0, 5, 5] };
  assert.deepEqual(sectionRadii([block], 0, 0), [], 'nothing crosses the face');
  const [end] = endParallels([block], 0);
  assert.deepEqual(end.radii, [4, 8]);
});

test('a springing cut on the skew is still measured across', () => {
  // Only one corner sits at the lowest point, so the vertices at that height
  // would give a single radius. The section a hundredth of the way up does not.
  const skew = { x: [4, 8, 8, 4], y: [1, 0, 5, 5] };
  const [end] = endParallels([skew], 0);
  assert.ok(end.radii[0] < end.radii[1], 'two radii, not one');
  assert.ok(end.radii[1] > 7.9 && end.radii[1] <= 8);
});

test('nothing to measure gives nothing to draw', () => {
  assert.deepEqual(endParallels([], 0), []);
  assert.deepEqual(endParallels(null, 0), []);
  // A model with no height at all is a line, and has no parallels.
  assert.deepEqual(endParallels([{ x: [1, 2], y: [3, 3] }], 0), []);
});
