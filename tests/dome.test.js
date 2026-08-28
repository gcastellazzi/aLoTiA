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
  toRadians, defaultAxis, luneWidth, luneVolume, luneWeights,
  revolve, extrude, solids, widthRange,
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

// ------------------------------------------------------ the projection --

import { frame, project, depth, projectedBounds } from '../docs/app/js/render/solid.js';

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
