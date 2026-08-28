/**
 * Scale and units.
 *
 * Until an arch is scaled, every number it produces is in pixels: an "area" is
 * pixels squared and a "weight" is whatever that times the density happens to
 * be. Scaling is what turns the drawing into mechanics, and it takes one
 * measurement -- two points on the image and the distance between them.
 *
 * A NOTE ON THE SPECIFIC WEIGHT. The MATLAB app takes a MASS density and
 * multiplies by Unit_Mass_to_Weight (10 for SI, 10000 for N-mm) to reach a
 * force. This module takes a WEIGHT density directly, so that
 *
 *     W = area x thickness x gamma
 *
 * with no hidden g. It is the unambiguous choice, and it is why a traced arch
 * scaled here will not reproduce a MATLAB weight unless the density is entered
 * as a weight density. Stored examples are unaffected: their weights come from
 * the file.
 */

/**
 * The three systems the MATLAB app offers, with the labels each quantity
 * carries and the factor to the SI base (metre, newton).
 */
export const SYSTEMS = {
  SI: {
    name: 'SI',
    length: { label: 'm', toBase: 1 },
    force: { label: 'kN', toBase: 1e3 },
    stress: { label: 'kPa' },
    density: { label: 'kN/m³' },
    // Typical masonry, as a weight density in this system.
    typicalDensity: 20,
  },
  Nmm: {
    name: 'N-mm',
    length: { label: 'mm', toBase: 1e-3 },
    force: { label: 'N', toBase: 1 },
    stress: { label: 'MPa' },
    density: { label: 'N/mm³' },
    typicalDensity: 2.0e-5,
  },
  kgcm: {
    name: 'kg-cm',
    length: { label: 'cm', toBase: 1e-2 },
    force: { label: 'kgf', toBase: 9.80665 },
    stress: { label: 'kgf/cm²' },
    density: { label: 'kgf/cm³' },
    typicalDensity: 2.0e-3,
  },
};

/** The tonne-to-force factor the MATLAB files carry, for reading them back. */
export const MATLAB_MASS_TO_WEIGHT = { SI: 10, Nmm: 10000, kgcm: 1000 };

/**
 * How many physical units one pixel is worth.
 *
 * @param {number[]} p1 @param {number[]} p2  the two picked points, in pixels
 * @param {number} realDistance               what that distance really is
 */
export function unitsPerPixel(p1, p2, realDistance) {
  const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  if (d === 0) throw new Error('the two reference points coincide');
  if (!(realDistance > 0)) throw new Error('the reference distance must be positive');
  return realDistance / d;
}

/** Multiply a polyline by k. */
export function scalePolyline(pts, k) {
  return pts.map(([x, y]) => [x * k, y * k]);
}

/** Multiply a polygon by k. */
export function scalePolygon(poly, k) {
  return { x: poly.x.map((v) => v * k), y: poly.y.map((v) => v * k) };
}

/**
 * Rescale a whole arch from pixels to physical units.
 *
 * Lengths scale by k, areas by k², and weights -- being area x thickness x
 * density -- by k² as well when the thickness is given physically, or by k³
 * when the thickness is itself in pixels. The second is the usual case
 * straight after tracing, and getting it wrong is a factor of the scale that
 * nothing downstream would flag.
 *
 * @param {object} model
 * @param {number} k                 units per pixel
 * @param {boolean} thicknessInPixels
 */
export function scaleModel(model, k, { thicknessInPixels = true } = {}) {
  const wPower = thicknessInPixels ? 3 : 2;
  return {
    ...model,
    blocks: (model.blocks ?? []).map((p) => scalePolygon(p, k)),
    centroids: (model.centroids ?? []).map(([x, y]) => [x * k, y * k]),
    areas: (model.areas ?? []).map((a) => a * k * k),
    weights: (model.weights ?? []).map((w) => w * Math.pow(k, wPower)),
    thickness: (model.thickness ?? []).map((t) => (thicknessInPixels ? t * k : t)),
    joints: (model.joints ?? []).map((j) => ({
      a: [j.a[0] * k, j.a[1] * k], b: [j.b[0] * k, j.b[1] * k],
    })),
    pointA: model.pointA ? [model.pointA[0] * k, model.pointA[1] * k] : null,
    pointB: model.pointB ? [model.pointB[0] * k, model.pointB[1] * k] : null,
    thrustLine: model.thrustLine
      ? scalePolyline(model.thrustLine, k) : null,
    frame: {
      coordinates: 'physical',
      units_per_pixel: (model.frame?.units_per_pixel ?? 1) * k,
      inferred: false,
    },
  };
}

/**
 * A STORED example rescaled, its saved solution carried with it.
 *
 * `scaleModel` is for the interactive path: the student traces an arch, picks
 * two points, states the distance, and the geometry is rescaled. A stored
 * example is different in one decisive way -- it carries the solution MATLAB
 * computed, and eight of the twelve shipped examples are checked against it to
 * machine precision. Rescaling the geometry and leaving the force polygon
 * where it was would break exactly the audit the paper rests on: the
 * consistency check compares the first column of the polygon against the
 * weights, and they would no longer agree.
 *
 * So the SOLUTION IS SCALED TOO, by the same factors the geometry is: lengths
 * by k, and every force by the same power that carries the weights. Both sides
 * of every comparison then move together, the relative errors are untouched,
 * and the example reproduces as exactly after scaling as before it.
 *
 * The weights follow the interactive convention -- k squared, the out-of-plane
 * thickness taken as a physical depth rather than a pixel count -- because that
 * is what the application does when a student scales an arch by hand, and two
 * conventions for one operation would be worse than either.
 *
 * @param {object} model  as `fromExample` builds it
 * @param {number} k      units per pixel
 */
export function scaleStoredExample(model, k) {
  if (!(k > 0) || k === 1) return model;
  const kF = k * k;                       // a force, following the weights
  const pt = (q) => (q ? [q[0] * k, q[1] * k] : q);

  return {
    ...scaleModel(model, k, { thicknessInPixels: false }),
    centre: pt(model.centre),
    // The stored solution, in step with the geometry.
    forcePolygon: model.forcePolygon
      ? model.forcePolygon.map((row) => row.map((v) => v * kF)) : null,
    thrustForce: Array.isArray(model.thrustForce)
      ? model.thrustForce.map((v) => v * kF) : model.thrustForce,
    horizontalThrust: typeof model.horizontalThrust === 'number'
      ? model.horizontalThrust * kF : model.horizontalThrust,
    poleTrial: Array.isArray(model.poleTrial)
      ? model.poleTrial.map((r) => (Array.isArray(r) ? r.map((v) => v * kF) : r * kF))
      : model.poleTrial,
    poleFinal: Array.isArray(model.poleFinal)
      ? model.poleFinal.map((v) => v * kF) : model.poleFinal,
  };
}

/** Convert a length between systems. */
export function convertLength(value, from, to) {
  return (value * SYSTEMS[from].length.toBase) / SYSTEMS[to].length.toBase;
}

/** Convert a force between systems. */
export function convertForce(value, from, to) {
  return (value * SYSTEMS[from].force.toBase) / SYSTEMS[to].force.toBase;
}

/**
 * The factors that carry every quantity from one system to another.
 *
 * A length goes as kL, an area as kL squared, a volume as kL cubed, and a
 * force as kF -- which is NOT kL: the three systems differ in their force unit
 * independently of their length unit, kN to N to kgf. A WEIGHT DENSITY, being
 * a force over a volume, therefore goes as kF / kL^3, and getting that one
 * wrong is a silent factor of a billion between SI and N-mm.
 */
export function conversionFactors(from, to) {
  const kL = SYSTEMS[from].length.toBase / SYSTEMS[to].length.toBase;
  const kF = SYSTEMS[from].force.toBase / SYSTEMS[to].force.toBase;
  return { kL, kF, area: kL * kL, density: kF / (kL * kL * kL) };
}

/**
 * The same arch, expressed in another system of units.
 *
 * WHY THIS EXISTS, AND WHY IT DID NOT. The unit menu used to change only the
 * LABELS: an arch of 2 m became "2 mm", which is a different arch. Every
 * readout in the application was internally consistent, so nothing looked
 * wrong -- the axis ticks, the panels and the scale bar all agreed with each
 * other about a number that had silently changed meaning. `convertLength` and
 * `convertForce` had been written for this and never called.
 *
 * ONLY A SCALED ARCH IS CONVERTED. While the frame is still `pixels` the
 * numbers belong to no system at all, so there is nothing to carry between
 * two, and the model is returned untouched. The unit menu then does what it
 * always did -- names the system the numbers will be in once a scale is set.
 *
 * @param {object} model
 * @param {string} from  a key of SYSTEMS
 * @param {string} to    a key of SYSTEMS
 * @returns {object} a new model, or the same one when there is nothing to do
 */
export function convertModel(model, from, to) {
  if (!model || from === to || !SYSTEMS[from] || !SYSTEMS[to]) return model;
  if (model.frame?.coordinates !== 'physical') return model;
  const { kL, kF, area } = conversionFactors(from, to);

  const pt = (p) => (p ? [p[0] * kL, p[1] * kL] : p);
  return {
    ...model,
    blocks: (model.blocks ?? []).map((p) => scalePolygon(p, kL)),
    centroids: (model.centroids ?? []).map(pt),
    areas: (model.areas ?? []).map((a) => a * area),
    // A weight is a FORCE. It does not follow the geometry between systems --
    // the same stone weighs 20 kN or 20000 N, and its area changes by 10^6.
    weights: (model.weights ?? []).map((w) => w * kF),
    thickness: (model.thickness ?? []).map((t) => t * kL),
    joints: (model.joints ?? []).map((j) => ({ ...j, a: pt(j.a), b: pt(j.b) })),
    pointA: pt(model.pointA),
    pointB: pt(model.pointB),
    centre: pt(model.centre),
    thrustLine: model.thrustLine ? model.thrustLine.map(pt) : null,
    thrustForce: Array.isArray(model.thrustForce)
      ? model.thrustForce.map((v) => v * kF) : model.thrustForce,
    horizontalThrust: typeof model.horizontalThrust === 'number'
      ? model.horizontalThrust * kF : model.horizontalThrust,
    // The force polygon is three columns of forces.
    forcePolygon: model.forcePolygon
      ? model.forcePolygon.map((row) => row.map((v) => v * kF)) : null,
    // The pole's coordinates are forces, both of them: the abscissa is the
    // horizontal thrust and the ordinate divides the total weight.
    poleTrial: Array.isArray(model.poleTrial)
      ? model.poleTrial.map((r) => (Array.isArray(r) ? r.map((v) => v * kF) : r * kF))
      : model.poleTrial,
    poleFinal: Array.isArray(model.poleFinal)
      ? model.poleFinal.map((v) => v * kF) : model.poleFinal,
    units: to,
    frame: {
      ...model.frame,
      units_per_pixel: (model.frame.units_per_pixel ?? 1) * kL,
    },
  };
}

/**
 * A number with its unit, at a sensible number of digits.
 *
 * @param {number} value
 * @param {'length'|'force'|'stress'|'density'} quantity
 * @param {string} system  a key of SYSTEMS
 */
export function format(value, quantity, system) {
  const s = SYSTEMS[system];
  if (!s) return String(value);
  const label = s[quantity]?.label ?? '';
  if (!isFinite(value)) return `— ${label}`;
  const a = Math.abs(value);
  const text = a === 0 ? '0'
    : a >= 1e5 || a < 1e-3 ? value.toExponential(3)
      : value.toPrecision(4);
  return `${text} ${label}`.trim();
}

/**
 * The span of an arch and the rise of its crown, once scaled.
 *
 * Reported because they are the two numbers a reader wants first, and because
 * they are the quickest check that the scale was picked correctly: if the span
 * of a bridge comes out as three metres, the reference distance was wrong.
 */
export function archDimensions(joints) {
  if (!joints || joints.length < 2) return null;
  const mid = (j) => [(j.a[0] + j.b[0]) / 2, (j.a[1] + j.b[1]) / 2];
  const first = mid(joints[0]);
  const last = mid(joints[joints.length - 1]);
  const span = Math.hypot(last[0] - first[0], last[1] - first[1]);
  const base = (first[1] + last[1]) / 2;
  let rise = 0;
  for (const j of joints) {
    rise = Math.max(rise, Math.abs(mid(j)[1] - base));
  }
  return { span, rise, ratio: span === 0 ? 0 : rise / span };
}
