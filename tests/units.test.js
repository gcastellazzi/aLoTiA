/**
 * Tests for scale and units.
 *
 * The reference case is again a semicircular ring, because its span, rise and
 * area are known exactly, so a scaled arch can be checked against arithmetic.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { area } from '../docs/app/js/core/geometry.js';
import { blocksBetween, weighBlocks, centroidsOf } from
  '../docs/app/js/core/trace.js';
import {
  SYSTEMS, unitsPerPixel, scalePolyline, scaleModel, convertLength,
  convertForce, format, archDimensions,
} from '../docs/app/js/core/units.js';

function arc(r, n = 300, cx = 0, cy = 0) {
  return Array.from({ length: n }, (_, i) => {
    const t = (Math.PI * i) / (n - 1);
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  });
}

/** A traced arch in "pixels": intrados 200 px, extrados 250 px. */
function pixelArch(n = 16) {
  const { blocks, joints } = blocksBetween(arc(200), arc(250), n);
  return {
    blocks,
    joints,
    centroids: centroidsOf(blocks),
    areas: blocks.map(area),
    weights: weighBlocks(blocks, { specificWeight: 20, thickness: 1 }),
    thickness: blocks.map(() => 1),
    pointA: [-225, 0],
    pointB: [225, 0],
    thrustLine: null,
    frame: { coordinates: 'pixels', units_per_pixel: 1, inferred: false },
  };
}

test('the scale is the real distance over the pixel distance', () => {
  assert.equal(unitsPerPixel([0, 0], [100, 0], 5), 0.05);
  assert.equal(unitsPerPixel([0, 0], [30, 40], 10), 0.2);
});

test('a degenerate or negative reference is refused', () => {
  assert.throws(() => unitsPerPixel([7, 7], [7, 7], 5), /coincide/);
  assert.throws(() => unitsPerPixel([0, 0], [10, 0], 0), /positive/);
});

test('scaling a polyline multiplies both coordinates', () => {
  assert.deepEqual(scalePolyline([[2, 4], [6, 8]], 0.5), [[1, 2], [3, 4]]);
});

test('lengths scale by k and areas by k squared', () => {
  const m = pixelArch();
  const k = 0.02;                       // 200 px intrados becomes 4 m
  const s = scaleModel(m, k, { thicknessInPixels: false });

  const before = m.blocks.reduce((t, p) => t + area(p), 0);
  const after = s.blocks.reduce((t, p) => t + area(p), 0);
  assert.ok(Math.abs(after - before * k * k) / (before * k * k) < 1e-12);

  assert.ok(Math.abs(s.pointB[0] - m.pointB[0] * k) < 1e-12);
  assert.equal(s.frame.coordinates, 'physical');
  assert.ok(Math.abs(s.frame.units_per_pixel - k) < 1e-15);
});

test('a thickness given in pixels makes the weights scale by k cubed', () => {
  const m = pixelArch();
  const k = 0.02;
  const asVolume = scaleModel(m, k, { thicknessInPixels: true });
  const asArea = scaleModel(m, k, { thicknessInPixels: false });
  const ratio = asVolume.weights[0] / asArea.weights[0];
  assert.ok(Math.abs(ratio - k) < 1e-12,
    `expected the two to differ by exactly k, got ${ratio}`);
});

test('the scaled arch has the span and rise the scale implies', () => {
  const m = pixelArch(24);
  // The mid-surface radius is 225 px, so the span is 450 px. Call it 9 m.
  const k = unitsPerPixel([-225, 0], [225, 0], 9);
  const s = scaleModel(m, k, { thicknessInPixels: false });
  const d = archDimensions(s.joints);

  assert.ok(Math.abs(d.span - 9) < 1e-9, `span ${d.span}`);
  assert.ok(Math.abs(d.rise - 4.5) < 0.02, `rise ${d.rise}`);
  assert.ok(Math.abs(d.ratio - 0.5) < 0.005, `rise/span ${d.ratio}`);
});

test('a scaled semicircular ring has the area the geometry demands', () => {
  const m = pixelArch(200);
  const k = unitsPerPixel([0, 0], [100, 0], 0.02);   // 100 px = 0.02 m
  const s = scaleModel(m, k, { thicknessInPixels: false });
  const total = s.blocks.reduce((t, p) => t + area(p), 0);
  const ri = 200 * k;
  const ro = 250 * k;
  const exact = (Math.PI / 2) * (ro * ro - ri * ri);
  assert.ok((exact - total) / exact < 1e-3,
    `${total} against ${exact}`);
});

test('unit conversions round trip and agree with the definitions', () => {
  assert.ok(Math.abs(convertLength(1, 'SI', 'Nmm') - 1000) < 1e-9);
  assert.ok(Math.abs(convertLength(1, 'SI', 'kgcm') - 100) < 1e-9);
  assert.ok(Math.abs(convertLength(2500, 'Nmm', 'SI') - 2.5) < 1e-12);
  assert.ok(Math.abs(convertForce(1, 'SI', 'Nmm') - 1000) < 1e-9);
  // A kilogram-force is 9.80665 N, so 1 kN is a little over 100 kgf.
  assert.ok(Math.abs(convertForce(1, 'SI', 'kgcm') - 101.9716) < 1e-3);
  for (const s of Object.keys(SYSTEMS)) {
    assert.ok(Math.abs(convertLength(convertLength(7, 'SI', s), s, 'SI') - 7)
      < 1e-12, `round trip through ${s}`);
  }
});

test('formatting carries the unit of the system', () => {
  assert.match(format(12.3456, 'length', 'SI'), /^12\.35 m$/);
  assert.match(format(12.3456, 'force', 'Nmm'), /N$/);
  assert.match(format(0, 'length', 'SI'), /^0 m$/);
  assert.match(format(1e-7, 'force', 'SI'), /e-7 kN$/);
  assert.match(format(Infinity, 'length', 'SI'), /^— m$/);
});

test('every system declares a plausible masonry density', () => {
  // Around 20 kN/m^3, expressed in each system's own units.
  for (const [key, s] of Object.entries(SYSTEMS)) {
    const perCubicMetre = s.typicalDensity
      * SYSTEMS[key].force.toBase
      / Math.pow(SYSTEMS[key].length.toBase, 3);
    assert.ok(perCubicMetre > 1.5e4 && perCubicMetre < 2.5e4,
      `${key}: ${perCubicMetre} N/m^3`);
  }
});

test('scaling twice is the same as scaling once by the product', () => {
  const m = pixelArch(12);
  const once = scaleModel(m, 0.006, { thicknessInPixels: false });
  const twice = scaleModel(
    scaleModel(m, 0.002, { thicknessInPixels: false }),
    3, { thicknessInPixels: false },
  );
  once.centroids.forEach((c, i) => {
    assert.ok(Math.abs(c[0] - twice.centroids[i][0]) < 1e-12);
    assert.ok(Math.abs(c[1] - twice.centroids[i][1]) < 1e-12);
  });
  assert.ok(Math.abs(once.frame.units_per_pixel - twice.frame.units_per_pixel)
    < 1e-15);
});

test('the axes restore equal scales when the box changes shape', async () => {
  const { Axes } = await import('../docs/app/js/render/axes.js');
  // A stand-in canvas: reequalize only needs the box, which comes from
  // width/height and the margins.
  const ax = Object.create(Axes.prototype);
  ax.margin = [0, 0, 0, 0];
  ax.equal = true;
  ax.width = 400; ax.height = 400;
  ax.view = { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };

  // A square box and a square view are already equal: nothing moves.
  ax.reequalize();
  assert.deepEqual(ax.view, { xmin: -10, xmax: 10, ymin: -10, ymax: 10 });

  // Widen the box: the view must widen in x by the same factor, keeping y.
  ax.width = 800;
  ax.reequalize();
  assert.ok(Math.abs(ax.view.xmax - 20) < 1e-9, `xmax ${ax.view.xmax}`);
  assert.ok(Math.abs(ax.view.xmin + 20) < 1e-9);
  assert.equal(ax.view.ymin, -10);
  assert.equal(ax.view.ymax, 10);

  // Scales now agree in both directions, which is the property that matters.
  const sx = 800 / (ax.view.xmax - ax.view.xmin);
  const sy = 400 / (ax.view.ymax - ax.view.ymin);
  assert.ok(Math.abs(sx - sy) < 1e-12, `${sx} against ${sy}`);
});

test('fit itself produces equal scales, whatever the box or the data', async () => {
  const { Axes } = await import('../docs/app/js/render/axes.js');
  const make = (w, h) => {
    const ax = Object.create(Axes.prototype);
    ax.margin = [52, 18, 18, 40];
    ax.equal = true;
    ax.width = w; ax.height = h;
    ax.view = { xmin: 0, xmax: 1, ymin: 0, ymax: 1 };
    return ax;
  };
  const scales = (ax) => {
    const b = ax.box;
    return [b.w / (ax.view.xmax - ax.view.xmin),
      b.h / (ax.view.ymax - ax.view.ymin)];
  };

  for (const [w, h] of [[800, 600], [400, 900], [1200, 300]]) {
    for (const b of [
      { xmin: 0, xmax: 744, ymin: 0, ymax: 879 },     // an image
      { xmin: -450, xmax: 450, ymin: 0, ymax: 450 },  // a semicircular ring
      { xmin: 3, xmax: 3.5, ymin: -1000, ymax: 1000 }, // a force polygon
    ]) {
      const ax = make(w, h);
      ax.fit(b);
      const [sx, sy] = scales(ax);
      assert.ok(Math.abs(sx / sy - 1) < 1e-12,
        `box ${w}x${h}: scales ${sx} and ${sy}`);
    }
  }
});

test('a semicircular ring keeps rise over span at one half', () => {
  // The property that exposed the anisotropy in the browser: it is exactly
  // 0.5 for any subdivision and any radius, so any departure is a transform
  // problem, not a geometry one.
  for (const R of [50, 150, 342.2]) {
    for (const n of [8, 16, 40]) {
      const inner = Array.from({ length: n + 1 }, (_, i) => {
        const t = (Math.PI * i) / n;
        return [-R * Math.cos(t), R * Math.sin(t)];
      });
      const outer = inner.map(([x, y]) => [x * 1.35, y * 1.35]);
      const { joints } = blocksBetween(inner, outer, n);
      const d = archDimensions(joints);
      assert.ok(Math.abs(d.ratio - 0.5) < 1e-9,
        `R=${R}, n=${n}: ${d.ratio}`);
    }
  }
});
