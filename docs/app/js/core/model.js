/**
 * Loading a saved example into the shape the core functions expect.
 *
 * The JSON keeps the MATLAB field names verbatim, misspellings included, so
 * that any value can be checked against the original .mat by eye. This module
 * is the one place where those names are translated into something readable,
 * and the only place that has to change if the stored format ever does.
 *
 * One field is not translated but RECONSTRUCTED. The .mat files never stored
 * the joints, and without them admissibility and the whole mechanism analysis
 * have nothing to work on; `joints.js` recovers them from the voussoirs
 * themselves. Where the stored blocks are not a chain of abutting voussoirs
 * the recovery refuses, and `jointRecovery` carries the reason for the panel
 * to show.
 *
 * One field is ADDED to the stored format rather than read from MATLAB:
 * `_scale`. The .mat files hold pixel coordinates and no statement of what the
 * picture measures, so an arch of a real building comes up labelled in pixels
 * and the scale bar can only say `px`. `_scale` supplies the missing sentence
 * -- how many units one pixel is worth, in which system, and, REQUIRED,
 * `source`: where the dimension comes from. A number without a provenance is
 * exactly what should not be shipped in a published dataset, so one without a
 * source is refused and the example is left in pixels. Examples with no
 * `_scale` at all are untouched, which is most of them.
 */

import { jointsFromBlocks } from './joints.js';
import { scaleStoredExample } from './units.js';

/** A MATLAB field that may be a scalar, a 1-element list, or absent. */
function scalar(v, fallback = null) {
  if (Array.isArray(v)) v = v.length ? v[0] : null;
  return typeof v === 'number' ? v : fallback;
}

/**
 * @param {object} json  the parsed <name>.json
 * @returns {object} a model with plain names, or throws if it has no blocks
 */
export function fromExample(json) {
  const d = json.data ?? json;

  const polys = d.Blocks_coordinates_4_points ?? [];
  if (!polys.length) throw new Error('this example carries no blocks');

  const frame = d._frame ?? { coordinates: 'pixels', units_per_pixel: 1 };
  const recovered = jointsFromBlocks(polys);

  const model = {
    name: json._meta?.source ?? null,

    // Geometry, in the frame declared by _frame. READ THE FRAME: in twelve of
    // the twenty-eight examples these are physical units, not pixels.
    blocks: polys,
    centroids: d.xyg_Blocks ?? null,
    areas: d.A_Blocks ?? null,
    weights: d.W_Blocks ?? null,
    thickness: d.Thickness_Blocks ?? null,
    count: scalar(d.Number_of_Blocks, polys.length),

    // The cuts between the voussoirs, recovered rather than read: see joints.js.
    joints: recovered.ok ? recovered.joints : null,
    jointRecovery: {
      ok: recovered.ok,
      reason: recovered.warnings[0] ?? null,
      gaps: recovered.gaps.length,
    },

    // The two springings, and the centre of the circular generator.
    pointA: d.xy_Point_A ?? null,
    pointB: d.xy_Point_B ?? null,
    centre: d.xy_Center ?? null,

    // The stored solution, used to check a recomputation.
    forcePolygon: d.Force_Funicolar_Polygon ?? null,
    thrustLine: d.LOT_xy ?? null,
    thrustForce: d.LOT_Force ?? null,
    poleTrial: d.xy_Pole_Prime ?? null,
    poleFinal: d.xy_Pole_Def ?? null,
    horizontalThrust: scalar(d.HorizontalThrust),

    // Units and scaling.
    units: d.UNISYS ?? null,
    lengthScaling: scalar(d.Unit_Length_scaling, 1),
    massToWeight: scalar(d.Unit_Mass_to_Weight, 1),

    // Background image, and the ORIGINAL pixel size the coordinates refer to.
    image: d.ImageFileName ?? null,
    imageSize: d.ImageSize ?? null,

    frame,
  };

  return applyStoredScale(model, d._scale);
}

/**
 * Apply an example's declared scale, if it has one worth trusting.
 *
 * REFUSED WITHOUT A SOURCE. `units_per_pixel` alone is a bare number, and a
 * bare number in a published dataset is indistinguishable from a guess. The
 * field has to say where the dimension came from -- a measured drawing, a
 * published span, or the word "nominal" for a textbook figure that has no true
 * size at all -- and an example that cannot say is left in pixels, where the
 * scale bar reads `px` and claims nothing.
 *
 * @param {object} model
 * @param {object} [scale]  {units_per_pixel, system, source}
 */
function applyStoredScale(model, scale) {
  if (!scale) return model;
  const k = scalar(scale.units_per_pixel);
  const source = typeof scale.source === 'string' ? scale.source.trim() : '';
  if (!(k > 0) || !source) {
    return { ...model, scaleWarning: 'the declared scale has no source and was ignored' };
  }
  if (model.frame?.coordinates === 'physical') return model;   // already scaled
  return {
    ...scaleStoredExample(model, k),
    units: scale.system ?? model.units,
    scaleSource: source,
  };
}

/**
 * The pole of the final force polygon.
 *
 * xy_Pole_Def is not reliable: in several examples it was left with x = 0
 * while the polygon was drawn from a pole elsewhere. The x is taken from the
 * second row of xy_Pole_Prime, which is the end of the trial thrust line and
 * always agrees with the polygon; the y is accepted from xy_Pole_Def only if
 * the two are consistent, and otherwise recovered from the force polygon.
 *
 * @param {object} model
 * @param {function} recover  poleFromForcePolygon, injected to keep this
 *                            module free of any dependency on statics.js
 */
export function poleOf(model, recover) {
  const stored = model.poleFinal;
  const trial = model.poleTrial;
  const xFromTrial =
    Array.isArray(trial) && Array.isArray(trial[1]) ? trial[1][0] : null;

  if (model.weights && model.forcePolygon) {
    const [xR, yR] = recover(model.weights, model.forcePolygon);
    // Prefer the recovered pole: it is the one the stored polygon was drawn
    // with, by construction.
    return { pole: [xR, yR], source: 'recovered', stored, xFromTrial };
  }
  if (stored && xFromTrial !== null) {
    return { pole: [xFromTrial, stored[1]], source: 'fields', stored };
  }
  throw new Error('cannot determine the pole of this example');
}

/**
 * Is the stored solution consistent with the stored geometry?
 *
 * SIX OF THE TWENTY-TWO SOLVED EXAMPLES ARE NOT, and the application must say so
 * rather than draw a thrust line that does not belong to the arch on screen.
 * Two distinct causes:
 *
 *  - APPLIED FORCES. The force polygon has more rows than there are blocks,
 *    because point loads were merged into the sequence. The loads themselves
 *    were never saved by the MATLAB app, so the solution cannot be recomputed
 *    from the file; it can only be displayed as it was stored.
 *
 *  - A STALE SOLUTION. The counts agree but the first column of the force
 *    polygon, which is the weight of each block, does not match W_Blocks. The
 *    specific weight or a thickness was changed after the polygon was drawn
 *    and the state was saved without recomputing.
 *
 * @returns {{ok: boolean, reason: string|null, extraRows: number}}
 */
export function consistency(model) {
  const fp = model.forcePolygon;
  const w = model.weights;
  if (!fp || !w) return { ok: false, reason: 'no stored solution', extraRows: 0 };

  const extraRows = fp.length - w.length;
  if (extraRows !== 0) {
    return {
      ok: false,
      reason: extraRows > 0
        ? `${extraRows} applied force(s) merged into the sequence, and the ` +
          'loads themselves were not saved'
        : `${-extraRows} block(s) added after the solution was computed`,
      extraRows,
    };
  }

  // Compare against the weights in the order the construction uses them.
  const order = model.centroids
    .map((c, i) => [c[0], i])
    .sort((a, b) => b[0] - a[0])
    .map(([, i]) => i);
  const scale = Math.max(...w.map(Math.abs), 1);
  for (let j = 0; j < w.length; j++) {
    if (Math.abs(w[order[j]] - fp[j][0]) / scale > 1e-9) {
      return {
        ok: false,
        reason: 'the stored force polygon was drawn with different weights: ' +
          'the solution is stale',
        extraRows: 0,
      };
    }
  }
  return { ok: true, reason: null, extraRows: 0 };
}
