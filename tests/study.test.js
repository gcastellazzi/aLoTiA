import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  circularRingCase, leastAdmissibleTri, thicknessWeightStudy,
  ringStudyPoint, ringStudySamples, ringBands, pinnedRange, thicknesses,
  heymanPoint, heymanDomain, thirdMiddleBand,
  heymanGeometricalSafety,
} from '../docs/app/js/core/study.js';

test('circular ring weight grows with t/ri', () => {
  const base = { ri: 4, n: 16, gamma: 20, thickness: 1 };
  const thin = circularRingCase({ ...base, tri: 0.15 });
  const thick = circularRingCase({ ...base, tri: 0.25 });
  assert.ok(thick.totalWeight > thin.totalWeight);
});

test('Poleni ring study uses variable lune widths and weights', () => {
  const base = { ri: 4, n: 16, tri: 0.25, gamma: 20, thickness: 1 };
  const barrel = circularRingCase(base);
  const poleni = circularRingCase({
    ...base, poleni: true, axisX: 0, angleDeg: 15,
  });

  assert.notEqual(poleni.totalWeight, barrel.totalWeight);
  assert.ok(Math.max(...poleni.thickness) - Math.min(...poleni.thickness) > 1e-9);

  const got = ringStudySamples({
    ...base, poleni: true, axisX: 0, angleDeg: 15,
  });
  assert.ok(got.points.length > 20);
  assert.ok(got.points.every((p) => Number.isFinite(p.weight)));
  assert.ok(got.points.every((p) => Array.isArray(p.lot) && p.lot.length > 2));
});

test('a plotted ring state carries its admissibility verdict', () => {
  const base = { ri: 4, n: 16, gamma: 20, thickness: 1 };
  assert.equal(ringStudyPoint({ ...base, tri: 0.08 }).admissible, false);
  assert.equal(ringStudyPoint({ ...base, tri: 0.25 }).admissible, true);
});

test('automatic ring study varies A, B and thrust and keeps red and green states',
  () => {
    const got = ringStudySamples({ ri: 4, n: 16, tri: 0.25, gamma: 20, thickness: 1 });
    assert.ok(got.points.length > 20);
    assert.ok(got.points.some((p) => p.admissible), 'no admissible state plotted');
    assert.ok(got.points.some((p) => !p.admissible), 'no escaping state plotted');
    assert.ok(new Set(got.points.map((p) => p.sRight)).size > 1);
    assert.ok(new Set(got.points.map((p) => p.sLeft)).size > 1);
    assert.ok(new Set(got.points.map((p) => p.thrust.toPrecision(6))).size > 1);
    assert.ok(got.points.every((p) => Math.abs(p.horizontalThrust - p.weight * p.thrust) < 1e-9));
    assert.ok(got.points.every((p) => Math.abs((p.horizontalThrust / p.weight) - p.thrust) < 1e-12));
    assert.ok(got.points.every((p) => Array.isArray(p.lot) && p.lot.length > 2));
  });

test('automatic ring study moves A and B only horizontally on the springing bases',
  () => {
    const opt = { ri: 4, n: 16, tri: 0.25, gamma: 20, thickness: 1 };
    const model = circularRingCase(opt);
    const leftLimit = Math.min(...model.centroids.map((c) => c[0]));
    const rightLimit = Math.max(...model.centroids.map((c) => c[0]));
    const got = ringStudySamples(opt);
    const ay = got.points[0].A[1];
    const by = got.points[0].B[1];
    assert.ok(new Set(got.points.map((p) => p.A[0].toPrecision(8))).size > 1);
    assert.ok(new Set(got.points.map((p) => p.B[0].toPrecision(8))).size > 1);
    assert.ok(got.points.every((p) => Math.abs(p.A[1] - ay) < 1e-12));
    assert.ok(got.points.every((p) => Math.abs(p.B[1] - by) < 1e-12));
    assert.ok(got.points.every((p) => p.A[0] <= leftLimit + 1e-12));
    assert.ok(got.points.every((p) => p.B[0] >= rightLimit - 1e-12));
  });

test('automatic ring study accepts custom A, B and N step counts and keeps mid-base states',
  () => {
    const got = ringStudySamples({
      ri: 4, n: 16, tri: 0.25, gamma: 20, thickness: 1,
      leftSteps: 3, rightSteps: 4, thrustSteps: 5,
    });
    assert.equal(new Set(got.points.map((p) => p.sLeft)).size, 3);
    assert.equal(new Set(got.points.map((p) => p.sRight)).size, 4);
    assert.equal(new Set(got.points.map((p) => p.thrust.toPrecision(8))).size, 5);
    assert.ok(got.points.some((p) => p.midBase));
    assert.ok(got.points.filter((p) => p.midBase).every((p) => (
      Math.abs(p.sLeft - 0.5) < 1e-12 && Math.abs(p.sRight - 0.5) < 1e-12
    )));
  });

test('thickness study runs from the least admissible thickness to the current one',
  () => {
    const opt = { ri: 4, tri: 0.25, n: 16, gamma: 20, thickness: 1, samples: 12 };
    const got = thicknessWeightStudy(opt);
    assert.equal(got.ok, true);
    assert.ok(got.minTri < opt.tri);
    assert.ok(got.points.length > 2);
    assert.ok(got.points[0].tri >= got.minTri - 1e-9);
    assert.ok(Math.abs(got.points[got.points.length - 1].tri - opt.tri) < 1e-12);
    for (let i = 1; i < got.points.length; i++) {
      assert.ok(got.points[i].weight > got.points[i - 1].weight);
    }
  });

test('least admissible t/ri is near the documented discrete semicircle value',
  () => {
    const tri = leastAdmissibleTri({
      ri: 4, tri: 0.25, n: 16, gamma: 20, thickness: 1,
    });
    assert.ok(tri > 0.10 && tri < 0.14, `least t/ri = ${tri}`);
  });

test('Heyman N-M point uses compression-negative N and zero moment at centroid',
  () => {
    const joint = { a: [0, 0], b: [0, 2] };
    const p = heymanPoint(joint, { s: 0.5, inside: true, segment: 0 }, 10);
    assert.equal(p.N, -10);
    assert.equal(p.M, -0);
    assert.equal(p.ecc, 0);
  });

test('Heyman N-M points at the faces lie on the no-tension triangle', () => {
  const joint = { a: [0, 0], b: [0, 2] };
  const intrados = heymanPoint(joint, { s: 0, inside: true, segment: 0 }, 10);
  const extrados = heymanPoint(joint, { s: 1, inside: true, segment: 0 }, 10);
  const domain = heymanDomain(2, 10);

  assert.equal(intrados.N, -10);
  assert.equal(extrados.N, -10);
  assert.equal(intrados.M, 10);
  assert.equal(extrados.M, -10);
  assert.deepEqual(domain, [
    { N: 0, M: 0 },
    { N: -10, M: 10 },
    { N: -10, M: -10 },
  ]);
});

test('the third-middle reference sits one third inside the Heyman domain', () => {
  const b = thirdMiddleBand(2, 10);
  assert.equal(b[0].N, 0);
  assert.equal(b[0].M, 0);
  assert.equal(b[1].N, -10);
  assert.equal(b[2].N, -10);
  assert.ok(Math.abs(b[1].M - 10 / 3) < 1e-12);
  assert.ok(Math.abs(b[2].M + 10 / 3) < 1e-12);
});

test('Heyman geometrical safety is controlled by the closest point to the border', () => {
  const centred = { N: -10, M: 0, ecc: 0, thickness: 2, inside: true };
  const third = { N: -10, M: -10 / 3, ecc: 1 / 3, thickness: 2, inside: true };
  const edge = { N: -10, M: -10, ecc: 1, thickness: 2, inside: true };
  const outside = { N: -10, M: -12, ecc: 1.2, thickness: 2, inside: false };

  assert.equal(heymanGeometricalSafety([centred]).factor, Infinity);
  assert.ok(Math.abs(heymanGeometricalSafety([centred, third]).factor - 3) < 1e-12);
  assert.equal(heymanGeometricalSafety([centred, edge]).factor, 1);
  assert.ok(heymanGeometricalSafety([centred, edge, outside]).factor < 1);
});

// ------------------------------------------- the admissible thrust bands --
//
// These are the numbers behind the published figure of admissible thrust
// against thickness. They are pinned here as golden values so that the figure
// and the tool cannot drift apart: the paper's own data file is generated by
// `tools/reproduce/makedata.js` calling these same functions, and it agrees
// with the values below to the four decimals it is written to.

const RING = { ri: 4, n: 16 };
const near = (got, want, tol = 5e-4) => assert.ok(Math.abs(got - want) < tol,
  `${got} is not ${want} to ${tol}`);

test('the free band is the published one, thickness by thickness', () => {
  for (const [tri, lo, hi] of [
    [0.12, 0.1956, 0.2036],
    [0.32, 0.1350, 0.2896],
    [0.52, 0.1019, 0.3545],
    [0.60, 0.0903, 0.3802],
  ]) {
    const b = ringBands({ ...RING, tri });
    near(b.free.min, lo);
    near(b.free.max, hi);
  }
});

test('the pinned band is the published one, and starts later', () => {
  // The classical construction -- both ends at the joint mid-points -- rejects
  // rings that plainly stand. That it has NO band at t/ri = 0.15 while the free
  // family has one is the whole point of drawing the two together.
  for (const tri of [0.12, 0.15, 0.22]) {
    assert.equal(ringBands({ ...RING, tri }).pinned, null);
    assert.ok(ringBands({ ...RING, tri }).free, 'the free family stands there');
  }
  for (const [tri, lo, hi] of [
    [0.24, 0.1639, 0.1798],
    [0.32, 0.1588, 0.1972],
    [0.60, 0.1439, 0.2302],
  ]) {
    const b = ringBands({ ...RING, tri });
    near(b.pinned.min, lo);
    near(b.pinned.max, hi);
  }
});

test('the pinned band lies inside the free one', () => {
  // It must: pinning the ends removes freedom, it does not add any. A sign
  // error in the end points would break this before it broke anything visible.
  for (const tri of [0.24, 0.3, 0.4, 0.5, 0.6]) {
    const { free, pinned } = ringBands({ ...RING, tri });
    assert.ok(pinned.min >= free.min - 1e-6, `t/ri ${tri}: below the free band`);
    assert.ok(pinned.max <= free.max + 1e-6, `t/ri ${tri}: above the free band`);
  }
});

test('the bands are dimensionless: the radius does not change them', () => {
  // H/W of a ring of given t/ri is a pure number, so a figure computed on
  // ri = 1 must be checkable in the panel at its default ri = 4.
  const a = ringBands({ ri: 1, n: 16, tri: 0.32 });
  const b = ringBands({ ri: 9, n: 16, tri: 0.32 });
  near(a.free.min, b.free.min, 1e-9);
  near(a.free.max, b.free.max, 1e-9);
  near(a.pinned.min, b.pinned.min, 1e-9);
  near(a.pinned.max, b.pinned.max, 1e-9);
});

test('pinnedRange refuses a ring too thin rather than inventing a band', () => {
  const thin = circularRingCase({ ...RING, tri: 0.05 });
  assert.equal(pinnedRange(thin), null);
});

test('the thicknesses of a scan are evenly spaced and include both ends', () => {
  const got = thicknesses({ from: 0.1, to: 0.5, steps: 5 });
  assert.equal(got.length, 5);
  near(got[0], 0.1, 1e-12);
  near(got[4], 0.5, 1e-12);
  for (let i = 1; i < got.length; i++) near(got[i] - got[i - 1], 0.1, 1e-12);
  assert.equal(thicknesses({ from: 0.2, to: 0.2, steps: 1 }).length, 2);
});
