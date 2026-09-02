/**
 * Tests for the geometric core, run against the converted MATLAB examples.
 *
 *     node --test tests/
 *
 * No dependencies and no test framework beyond the one built into Node.
 *
 * WHAT THESE TESTS ARE FOR. They are the cross-check between the JavaScript
 * port and the MATLAB original: every example carries the solution MATLAB
 * computed, and the port has to reproduce it from the same inputs. A test
 * failing here means the port has drifted, not that a number is untidy.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { area, centroid, lineIntersection, distance } from
  '../docs/app/js/core/geometry.js';
import { sortOrder, circularArch } from '../docs/app/js/core/blocks.js';
import {
  forcePolygon, funicular, poleFromForcePolygon, hookeCable,
} from '../docs/app/js/core/statics.js';
import { fromExample, poleOf, consistency } from
  '../docs/app/js/core/model.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// THE MATLAB CORPUS IS A TEST FIXTURE, NOT A SHIPPED EXAMPLE. The
// application offers a student the sessions under docs/app/data/examples
// -- the very files a student saves. These are the earlier generation,
// kept because they are what proves this module reproduces the solutions
// MATLAB stored, block for block and ray for ray.
const DATA = join(HERE, 'fixtures', 'matlab');

function load(name) {
  return JSON.parse(readFileSync(join(DATA, name), 'utf8'));
}

/** Every example that carries a full stored solution. */
function solvedExamples() {
  return readdirSync(DATA)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .map((f) => [f, load(f)])
    .filter(([, j]) => {
      const d = j.data;
      return d.Blocks_coordinates_4_points && d.W_Blocks &&
        d.Force_Funicolar_Polygon && d.LOT_xy && d.xy_Point_A && d.xy_Point_B;
    });
}

/**
 * The examples whose stored solution belongs to their stored geometry.
 *
 * Six of the twenty-two solved ones do not: some merged applied point loads
 * that were never saved, others were saved after the weights had changed. Those are not
 * skipped quietly -- a test below asserts that each of them is DETECTED.
 */
function consistentExamples() {
  return solvedExamples().filter(([, j]) => consistency(fromExample(j)).ok);
}

/** Largest relative difference between two flat numeric arrays. */
function maxRelDiff(a, b, scale) {
  let worst = 0;
  for (let i = 0; i < a.length; i++) {
    worst = Math.max(worst, Math.abs(a[i] - b[i]) / scale);
  }
  return worst;
}

// --------------------------------------------------------------- geometry --

test('area and centroid of a unit square', () => {
  const sq = { x: [0, 1, 1, 0], y: [0, 0, 1, 1] };
  assert.equal(area(sq), 1);
  assert.deepEqual(centroid(sq), [0.5, 0.5]);
});

test('area is orientation independent', () => {
  const ccw = { x: [0, 2, 2, 0], y: [0, 0, 1, 1] };
  const cw = { x: [0, 0, 2, 2], y: [0, 1, 1, 0] };
  assert.equal(area(ccw), area(cw));
});

test('centroid of a degenerate polygon falls back to the vertex mean', () => {
  // The stand-in blocks for applied forces are four coincident points.
  const degenerate = { x: [3, 3, 3, 3], y: [7, 7, 7, 7] };
  assert.deepEqual(centroid(degenerate), [3, 7]);
});

test('line intersection, and parallel lines return null', () => {
  assert.deepEqual(lineIntersection([0, 0], [1, 0], [2, -5], [0, 1]), [2, 0]);
  assert.equal(lineIntersection([0, 0], [1, 1], [1, 0], [2, 2]), null);
});

test('blocks are ordered by centroid x, descending', () => {
  const order = sortOrder([[1, 0], [5, 0], [3, 0]]);
  assert.deepEqual(order, [1, 2, 0]);
});

test('a circular arch closes on itself and has the requested count', () => {
  const polys = circularArch({
    centre: [0, 0], innerRadius: 4, outerRadius: 5,
    startAngle: 0, endAngle: 180, count: 9,
  });
  assert.equal(polys.length, 9);
  for (const p of polys) {
    assert.equal(p.x.length, 4);
    assert.ok(area(p) > 0);
  }
});

// ------------------------------------------------------- against the data --

test('every example reproduces its stored block centroids and areas', () => {
  let checked = 0;
  for (const [name, json] of solvedExamples()) {
    const m = fromExample(json);
    if (!m.centroids || !m.areas) continue;
    const scale = Math.max(...m.areas.map(Math.abs));
    m.blocks.forEach((p, k) => {
      const c = centroid(p);
      const ref = m.centroids[k];
      const span = Math.max(Math.abs(ref[0]), Math.abs(ref[1]), 1);
      assert.ok(
        distance(c, ref) / span < 1e-9,
        `${name} block ${k}: centroid ${c} vs ${ref}`,
      );
      // A_Blocks carries Unit_Length_scaling^2; undo it to compare.
      const a = area(p) * m.lengthScaling * m.lengthScaling;
      assert.ok(
        Math.abs(a - m.areas[k]) / scale < 1e-9,
        `${name} block ${k}: area ${a} vs ${m.areas[k]}`,
      );
    });
    checked += 1;
  }
  // This loop skips any example without stored centroids, so it is a floor
  // rather than an equality -- and a floor rather than a count, because the
  // corpus differs between this repository and the reduced set published with
  // the paper.
  assert.ok(checked >= 5, `only ${checked} examples checked`);
});

test('the pole recovered from the force polygon reproduces it exactly', () => {
  let checked = 0;
  for (const [name, json] of consistentExamples()) {
    const m = fromExample(json);
    const { pole } = poleOf(m, poleFromForcePolygon);
    const fp = forcePolygon(m.weights, pole);

    const ref = m.forcePolygon.flat();
    const got = fp.magnitudes.flat();
    assert.equal(got.length, ref.length, `${name}: wrong polygon size`);
    const scale = Math.max(...ref.map(Math.abs));
    assert.ok(
      maxRelDiff(got, ref, scale) < 1e-9,
      `${name}: force polygon differs by ${maxRelDiff(got, ref, scale)}`,
    );
    checked += 1;
  }
  // EVERY consistent example, whatever the corpus holds. A count would be
  // right here and wrong in the reduced set published with the paper.
  assert.equal(checked, consistentExamples().length,
    `${checked} of ${consistentExamples().length} examples checked`);
  assert.ok(checked >= 5, `only ${checked} examples to check`);
});

test('the first column of the force polygon is the weight itself', () => {
  for (const [name, json] of consistentExamples()) {
    const m = fromExample(json);
    const scale = Math.max(...m.weights.map(Math.abs));
    const order = sortOrder(m.centroids);
    order.forEach((src, j) => {
      assert.ok(
        Math.abs(m.forcePolygon[j][0] - m.weights[src]) / scale < 1e-9,
        `${name} block ${j}`,
      );
    });
  }
});

test('consecutive rays agree: ray above block j is ray below block j-1', () => {
  for (const [name, json] of consistentExamples()) {
    const m = fromExample(json);
    const scale = Math.max(...m.forcePolygon.flat().map(Math.abs));
    for (let j = 1; j < m.forcePolygon.length; j++) {
      assert.ok(
        Math.abs(m.forcePolygon[j][2] - m.forcePolygon[j - 1][1]) / scale < 1e-9,
        `${name} at block ${j}`,
      );
    }
  }
});

test('the funicular polygon reproduces the stored line of thrust', () => {
  let checked = 0;
  const report = [];
  for (const [name, json] of consistentExamples()) {
    const m = fromExample(json);
    const { pole } = poleOf(m, poleFromForcePolygon);
    const fp = forcePolygon(m.weights, pole);
    const lot = funicular(fp, m.centroids, m.pointB, m.pointA);

    assert.equal(
      lot.points.length, m.thrustLine.length,
      `${name}: ${lot.points.length} points against ${m.thrustLine.length}`,
    );
    const span = Math.max(
      ...m.thrustLine.map((p) => Math.max(Math.abs(p[0]), Math.abs(p[1]))),
    );
    let worst = 0;
    lot.points.forEach((p, i) => {
      worst = Math.max(worst, distance(p, m.thrustLine[i]) / span);
    });
    report.push(`${name}: ${worst.toExponential(1)}`);
    assert.ok(worst < 1e-8, `${name}: thrust line differs by ${worst}`);
    checked += 1;
  }
  // EVERY consistent example, whatever the corpus holds. A count would be
  // right here and wrong in the reduced set published with the paper.
  assert.equal(checked, consistentExamples().length,
    `${checked} of ${consistentExamples().length} examples checked`);
  assert.ok(checked >= 5, `only ${checked} examples to check`);
});

test("Hooke's cable is the thrust line reflected, and reflects back", () => {
  const pts = [[0, 0], [1, 2], [2, 1], [3, 3]];
  const hung = hookeCable(pts, 0);
  assert.deepEqual(hung, [[0, 0], [1, -2], [2, -1], [3, -3]]);
  assert.deepEqual(hookeCable(hung, 0), pts);
});

test('raising the pole distance raises the thrust and flattens the line', () => {
  const [, json] = consistentExamples()[0];
  const m = fromExample(json);
  const { pole } = poleOf(m, poleFromForcePolygon);

  const near = funicular(forcePolygon(m.weights, [pole[0], pole[1]]),
    m.centroids, m.pointB, m.pointA);
  const far = funicular(forcePolygon(m.weights, [pole[0] * 3, pole[1]]),
    m.centroids, m.pointB, m.pointA);

  const rise = (p) => {
    const ys = p.points.map((q) => q[1]);
    return Math.max(...ys) - Math.min(...ys);
  };
  assert.ok(rise(far) < rise(near),
    'a pole three times further out must give a flatter funicular');
});

test('an inconsistent example is detected, never silently redrawn', () => {
  const flagged = [];
  for (const [name, json] of solvedExamples()) {
    const c = consistency(fromExample(json));
    if (!c.ok) flagged.push([name, c.reason]);
  }
  // At least one, and San Francesco by name: its point loads were merged into
  // the sequence and never saved, so its stored solution cannot be recomputed
  // from the file. It is in both this corpus and the reduced set published
  // with the paper, so the warning path is exercised wherever the tests run.
  // A bare count would be right here and wrong there.
  assert.ok(flagged.length >= 1, 'no inconsistent example left to detect');
  assert.ok(flagged.some(([n]) => /San_Francesco/.test(n)),
    `San Francesco is no longer detected: ${flagged.map(([n]) => n).join(', ')}`);
  for (const [, reason] of flagged) assert.ok(reason && reason.length > 10);
});

test('a consistent example survives a round trip through the model', () => {
  const [, json] = consistentExamples()[0];
  const m = fromExample(json);
  assert.equal(m.blocks.length, m.weights.length);
  assert.equal(m.centroids.length, m.weights.length);
  assert.ok(m.pointA && m.pointB);
  assert.ok(['pixels', 'physical'].includes(m.frame.coordinates));
});

// ------------------------------------------- the cable hung from A and B --

import { hangingCable } from '../docs/app/js/core/statics.js';

test('the hanging cable starts and ends exactly at the thrust line ends', () => {
  // The whole point: whatever the two springings do, the cable is anchored to
  // them, so the analogy is visible in one picture.
  for (const pts of [
    [[0, 0], [1, 2], [2, 2.4], [3, 2], [4, 0]],            // symmetric
    [[0, 0], [1, 2], [2, 2.4], [3, 1.6], [4, -1.3]],       // ends at different heights
    [[-3, 1.2], [-1, 3], [1, 3.1], [3, 0.4]],
  ]) {
    const cable = hangingCable(pts);
    assert.equal(cable.length, pts.length);
    for (const k of [0, pts.length - 1]) {
      assert.ok(Math.abs(cable[k][0] - pts[k][0]) < 1e-12, `x at end ${k}`);
      assert.ok(Math.abs(cable[k][1] - pts[k][1]) < 1e-12, `y at end ${k}`);
    }
  }
});

test('the cable is the arch inverted: reflecting twice returns the line', () => {
  const pts = [[0, 0], [1, 2], [2, 2.4], [3, 1.6], [4, -1.3]];
  const back = hangingCable(hangingCable(pts));
  pts.forEach((p, i) => {
    assert.ok(Math.abs(p[0] - back[i][0]) < 1e-12, `x at ${i}`);
    assert.ok(Math.abs(p[1] - back[i][1]) < 1e-12, `y at ${i}`);
  });
});

test('the cable hangs on the other side of the chord from the arch', () => {
  // A rise above the chord must become a sag below it, by the same amount.
  const pts = [[0, 0], [2, 3], [4, 0]];
  const cable = hangingCable(pts);
  assert.ok(Math.abs(cable[1][0] - 2) < 1e-12, 'the crown stays over the crown');
  assert.ok(Math.abs(cable[1][1] + 3) < 1e-12, `sag ${cable[1][1]}`);
});

test('on a symmetric line it agrees with the old horizontal reflection', () => {
  const pts = [[0, 0], [1, 2], [2, 2.4], [3, 2], [4, 0]];
  const chord = hangingCable(pts);
  const flat = hookeCable(pts, 0);
  chord.forEach((p, i) => {
    assert.ok(Math.abs(p[0] - flat[i][0]) < 1e-12, `x at ${i}`);
    assert.ok(Math.abs(p[1] - flat[i][1]) < 1e-12, `y at ${i}`);
  });
});

// ------------------------------------------------- Bow's notation letters --

import { rayLabel, labelStride, rgba } from '../docs/app/js/render/draw.js';

test('ray letters cycle the first character fastest, and never repeat', () => {
  // a .. z, then aa, ba, ca .. za, then ab, bb .. zb: bijective base 26
  // written least-significant first.
  assert.equal(rayLabel(0), 'a');
  assert.equal(rayLabel(25), 'z');
  assert.equal(rayLabel(26), 'aa');
  assert.equal(rayLabel(27), 'ba');
  assert.equal(rayLabel(51), 'za');
  assert.equal(rayLabel(52), 'ab');
  assert.equal(rayLabel(53), 'bb');
  assert.equal(rayLabel(77), 'zb');

  const seen = new Set();
  for (let j = 0; j < 800; j++) {
    const s = rayLabel(j);
    assert.ok(/^[a-z]+$/.test(s), `${j} -> ${s}`);
    assert.ok(!seen.has(s), `duplicate ${s} at ${j}`);
    seen.add(s);
  }
});

test('the stride keeps the letter count readable and is shared', () => {
  // 1 while everything fits, then enough to stay near the target.
  assert.equal(labelStride(5), 1);
  assert.equal(labelStride(18), 1);
  assert.ok(labelStride(19) > 1);
  for (const n of [19, 40, 57, 200]) {
    const k = labelStride(n);
    const shown = Math.ceil(n / k);
    assert.ok(shown <= 18, `${n} blocks would show ${shown} letters`);
  }
});

test('a palette colour can be made translucent without a library', () => {
  // The weight circles on Hooke's cable are the app's red at low opacity, and
  // the palette is six hex strings, so this is the one place any of them needs
  // an alpha.
  assert.equal(rgba('#A2142F', 0.18), 'rgba(162,20,47,0.18)');
  assert.equal(rgba('a2142f', 1), 'rgba(162,20,47,1)');
  assert.equal(rgba('#0072BD', 0.5), 'rgba(0,114,189,0.5)');
  // Anything it cannot read is handed back, so a caller passing an rgba() or a
  // colour name gets what it asked for rather than nothing.
  assert.equal(rgba('rgba(1,2,3,0.4)', 0.2), 'rgba(1,2,3,0.4)');
  assert.equal(rgba('red', 0.2), 'red');
});
