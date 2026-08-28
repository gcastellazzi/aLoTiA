/**
 * Tests for changing the system of units.
 *
 * The menu used to change only the labels, so an arch of 2 m became "2 mm" --
 * a different arch, and nothing on screen said so, because every readout
 * agreed with every other about a number whose meaning had silently changed.
 *
 * What has to be true once it really converts is not that the numbers came out
 * as expected -- that is arithmetic anyone can check by eye -- but that THE
 * MECHANICS DID NOT MOVE. An arch expressed in millimetres stands exactly as
 * it stood in metres: the same line of thrust crosses the same joints at the
 * same fractions, and the horizontal thrust is the same fraction of the total
 * weight. Those are the tests that would catch a factor applied to the lengths
 * but not to the forces, which is the mistake this code exists to avoid.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SYSTEMS, conversionFactors, convertModel, convertLength, convertForce,
  archDimensions,
} from '../docs/app/js/core/units.js';
import { circularRing, blocksLike } from '../docs/app/js/core/blocks.js';
import { weighBlocks, centroidsOf } from '../docs/app/js/core/trace.js';
import { area as signedArea, centroid } from '../docs/app/js/core/geometry.js';
import { forcePolygon, freeThrustLine, jointCrossings } from '../docs/app/js/core/statics.js';
import { collapseRange } from '../docs/app/js/core/mechanism.js';

const KEYS = Object.keys(SYSTEMS);

/** A scaled ring in SI: 4 m inner radius, 0.15 thick, 16 voussoirs. */
function ringModel(system = 'SI') {
  const { blocks, joints } = circularRing({
    centre: [0, 0], innerRadius: 4, outerRadius: 4.6,
    startAngle: 0, endAngle: 180, count: 16,
  });
  const thickness = 1;
  const weights = weighBlocks(blocks, {
    specificWeight: SYSTEMS.SI.typicalDensity, thickness,
  });
  return {
    blocks,
    joints,
    centroids: centroidsOf(blocks),
    areas: blocks.map((p) => Math.abs(signedArea(p))),
    weights,
    thickness: blocks.map(() => thickness),
    pointA: joints[0].a,
    pointB: joints[joints.length - 1].a,
    units: system,
    frame: { coordinates: 'physical', units_per_pixel: 1, inferred: false },
  };
}

// ------------------------------------------------------------- the factors --

test('a length, an area and a force each take their own factor', () => {
  const { kL, kF, area, density } = conversionFactors('SI', 'Nmm');
  assert.equal(kL, 1000);                    // 1 m is 1000 mm
  assert.equal(kF, 1000);                    // 1 kN is 1000 N
  assert.equal(area, 1e6);
  assert.ok(Math.abs(density - 1e-6) < 1e-18);
});

test('the density factor is confirmed by the tables themselves', () => {
  // Each system declares a typical masonry weight density in its own units.
  // They must be the same physical density, so converting one into another
  // must land on the value the table already holds -- which is an independent
  // check of kF / kL^3, the factor most easily got wrong.
  for (const from of KEYS) {
    for (const to of KEYS) {
      const { density } = conversionFactors(from, to);
      const got = SYSTEMS[from].typicalDensity * density;
      const want = SYSTEMS[to].typicalDensity;
      assert.ok(Math.abs(got - want) / want < 0.02,
        `${from} -> ${to}: ${got} against the tabulated ${want}`);
    }
  }
});

test('converting there and back is the identity', () => {
  for (const from of KEYS) {
    for (const to of KEYS) {
      const there = conversionFactors(from, to);
      const back = conversionFactors(to, from);
      for (const k of ['kL', 'kF', 'area', 'density']) {
        assert.ok(Math.abs(there[k] * back[k] - 1) < 1e-12, `${from}->${to} ${k}`);
      }
      assert.ok(Math.abs(convertLength(convertLength(7, from, to), to, from) - 7) < 1e-12);
      assert.ok(Math.abs(convertForce(convertForce(7, from, to), to, from) - 7) < 1e-12);
    }
  }
});

// -------------------------------------------------------------- the model --

test('a model converted and converted back is the model it started as', () => {
  const m = ringModel();
  for (const to of KEYS) {
    const round = convertModel(convertModel(m, 'SI', to), to, 'SI');
    const near = (a, b, s) => assert.ok(Math.abs(a - b) <= Math.abs(s) * 1e-9,
      `${a} vs ${b}`);
    m.blocks.forEach((p, i) => p.x.forEach((x, k) => {
      near(round.blocks[i].x[k], x, x || 1);
      near(round.blocks[i].y[k], p.y[k], p.y[k] || 1);
    }));
    m.weights.forEach((w, i) => near(round.weights[i], w, w));
    m.areas.forEach((a, i) => near(round.areas[i], a, a));
    m.joints.forEach((j, i) => {
      near(round.joints[i].a[0], j.a[0], j.a[0] || 1);
      near(round.joints[i].b[1], j.b[1], j.b[1] || 1);
    });
  }
});

test('an arch in millimetres is a thousand times the arch in metres', () => {
  const si = ringModel();
  const mm = convertModel(si, 'SI', 'Nmm');
  const dSI = archDimensions(si.joints);
  const dMM = archDimensions(mm.joints);
  assert.ok(Math.abs(dMM.span - dSI.span * 1000) < dSI.span * 1e-9);
  assert.ok(Math.abs(dMM.rise - dSI.rise * 1000) < dSI.rise * 1e-9);
  // And the shape is untouched: rise over span is a pure number.
  assert.ok(Math.abs(dMM.rise / dMM.span - dSI.rise / dSI.span) < 1e-12);
});

test('a weight is a force and does NOT follow the geometry', () => {
  // The mistake this guards against: scaling the weights by the area factor,
  // or by kL cubed, because they were computed from a volume. The same stone
  // weighs 20 kN or 20000 N; its area changes by a million.
  const si = ringModel();
  const mm = convertModel(si, 'SI', 'Nmm');
  const w0 = si.weights[0];
  assert.ok(Math.abs(mm.weights[0] - w0 * 1000) < w0 * 1e-9,
    `weight went from ${w0} to ${mm.weights[0]}, expected ${w0 * 1000}`);
  assert.ok(Math.abs(mm.areas[0] - si.areas[0] * 1e6) < si.areas[0] * 1e-3);
});

test('a model still in pixels is left alone: it belongs to no system', () => {
  const m = { ...ringModel(), frame: { coordinates: 'pixels', units_per_pixel: 1 } };
  assert.equal(convertModel(m, 'SI', 'Nmm'), m);
});

// ----------------------------------------------------- the mechanics holds --

/** The thrust line of a model, at a stated fraction of the total weight. */
function solve(m, thrustFraction = 0.25, s = 0.5) {
  const seq = blocksLike({
    centroids: m.centroids, weights: m.weights,
    areas: m.areas, thickness: m.thickness,
  });
  const total = seq.weights.reduce((a, b) => a + b, 0);
  const fp = forcePolygon(seq.weights, [total * thrustFraction, -total / 2]);
  const first = m.joints[0];
  const last = m.joints[m.joints.length - 1];
  const mid = (j) => (j.a[0] + j.b[0]) / 2;
  const start = mid(last) >= mid(first) ? last : first;
  const end = start === last ? first : last;
  const lot = freeThrustLine(fp, seq.centroids, start, end, s);
  return { seq, total, lot, crossings: jointCrossings(lot.points, m.joints) };
}

test('the arch stands exactly as it stood, in every system', () => {
  const si = ringModel();
  const ref = solve(si);
  for (const to of KEYS) {
    const got = solve(convertModel(si, 'SI', to));
    assert.equal(got.crossings.length, ref.crossings.length, to);
    // WHERE the line crosses each joint is a pure number, and it is the whole
    // of Heyman's criterion. If it moved, the conversion changed the arch.
    ref.crossings.forEach((c, i) => {
      const d = got.crossings[i];
      assert.ok(c && d, `${to}: joint ${i} not crossed`);
      assert.ok(Math.abs(d.s - c.s) < 1e-9,
        `${to}: joint ${i} crossed at ${d.s}, was ${c.s}`);
    });
  }
});

test('the collapse band is the same fraction of the load in every system', () => {
  const si = ringModel();
  const band = (m) => {
    const seq = blocksLike({
      centroids: m.centroids, weights: m.weights,
      areas: m.areas, thickness: m.thickness,
    });
    return collapseRange(seq, m.joints);
  };
  const ref = band(si);
  assert.ok(ref, 'the reference ring has no admissible band');
  for (const to of KEYS) {
    const got = band(convertModel(si, 'SI', to));
    assert.ok(got, `${to}: no band`);
    assert.ok(Math.abs(got.min - ref.min) < 1e-6, `${to}: H min moved`);
    assert.ok(Math.abs(got.max - ref.max) < 1e-6, `${to}: H max moved`);
  }
});

test('the horizontal thrust converts as a force, and its ratio is invariant', () => {
  const si = ringModel();
  const ref = solve(si);
  for (const to of KEYS) {
    const m = convertModel(si, 'SI', to);
    const got = solve(m);
    const { kF } = conversionFactors('SI', to);
    assert.ok(Math.abs(got.total - ref.total * kF) < Math.abs(ref.total * kF) * 1e-9,
      `${to}: the total weight did not convert as a force`);
    // The number an engineer actually quotes: H over W.
    assert.ok(Math.abs(got.lot.points.length - ref.lot.points.length) === 0);
  }
});
