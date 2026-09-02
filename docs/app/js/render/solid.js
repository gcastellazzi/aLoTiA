/**
 * The block arch in three dimensions, on a plain canvas.
 *
 * No WebGL and no library: an orthographic axonometric projection and the
 * painter's algorithm, which is all a few hundred convex quadrilaterals need.
 * The viewpoint matches the MATLAB app's `view([-45 - angle/2, 30])`, so the
 * two versions show the same picture from the same corner.
 *
 * The projection is an orthonormal frame about the viewing direction
 *     d = (cos e cos a, cos e sin a, sin e)
 * with the screen axes
 *     u = (-sin a,  cos a, 0)
 *     v = (-cos a sin e, -sin a sin e, cos e)
 * so that depth is p . d and the two screen coordinates are p . u and p . v.
 * Because u, v and d are orthonormal, the drawing is not distorted and lengths
 * in the plane of the screen are preserved -- the same guarantee `axis equal`
 * gives in two dimensions.
 *
 * Coordinates arrive as [x, depth, vertical], which is how `core/dome.js`
 * builds them.
 */

/** The frame for an azimuth and elevation, both in degrees. */
export function frame(azDeg = -60, elDeg = 30) {
  const a = (azDeg * Math.PI) / 180;
  const e = (elDeg * Math.PI) / 180;
  return {
    u: [-Math.sin(a), Math.cos(a), 0],
    v: [-Math.cos(a) * Math.sin(e), -Math.sin(a) * Math.sin(e), Math.cos(e)],
    d: [Math.cos(a) * Math.cos(e), Math.sin(a) * Math.cos(e), Math.sin(e)],
  };
}

const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];

/** A three-dimensional point, as it lands on the screen plane. */
export function project(p, f) {
  return [dot(p, f.u), dot(p, f.v)];
}

/** How near the camera a point is; larger is nearer. */
export const depth = (p, f) => dot(p, f.d);

/** The bounds of a set of solids once projected, for fitting the axes. */
export function projectedBounds(solidList, f) {
  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const faces of solidList) {
    for (const face of faces) {
      for (const p of face) {
        const [x, y] = project(p, f);
        if (x < xmin) xmin = x;
        if (x > xmax) xmax = x;
        if (y < ymin) ymin = y;
        if (y > ymax) ymax = y;
      }
    }
  }
  if (!Number.isFinite(xmin)) return null;
  return { xmin, xmax, ymin, ymax };
}

/** Centre of all 3-D vertices in a solid list. */
export function solidCentre(solidList) {
  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  let zmin = Infinity;
  let zmax = -Infinity;
  for (const faces of solidList) {
    for (const face of faces) {
      for (const p of face) {
        xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]);
        ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]);
        zmin = Math.min(zmin, p[2]); zmax = Math.max(zmax, p[2]);
      }
    }
  }
  if (!Number.isFinite(xmin)) return [0, 0, 0];
  return [(xmin + xmax) / 2, (ymin + ymax) / 2, (zmin + zmax) / 2];
}

/** Translate solids for display without changing the mechanical model. */
export function recenteredSolids(solidList, centre) {
  return solidList.map((faces) => faces.map((face) => face.map((p) => [
    p[0] - centre[0],
    p[1] - centre[1],
    p[2] - centre[2],
  ])));
}

/**
 * A stroke colour with its opacity scaled by `k`.
 *
 * Only the forms this module actually writes -- `rgba(r,g,b,a)` and
 * `rgb(r,g,b)` -- are understood; anything else is returned untouched, because
 * a caller passing a named colour or a hex string wants that colour, and
 * quietly dropping it would be worse than not fading it.
 */
function rgbaFaded(colour, k) {
  const m = /^rgba?\(([^)]+)\)$/i.exec(String(colour).trim());
  if (!m) return colour;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((v) => !Number.isFinite(v))) {
    return colour;
  }
  const a = parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1;
  const faded = Math.max(0, Math.min(1, a * k));
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${faded.toFixed(3)})`;
}

/** The unit normal of a face, from its first three vertices. */
function normalOf(face) {
  const [a, b, c] = face;
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0],
  ];
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / len, n[1] / len, n[2] / len];
}

/**
 * Every face, ordered so that painting them in turn gives the picture.
 *
 * The painter's algorithm, on the mean depth of each face, over one list of
 * every face of every block. It is not exact and cannot be: two solids that
 * interleave in depth have no correct order, and Canvas has no depth buffer to
 * settle it with. On the models this draws it is right almost everywhere and
 * wrong in the same small way MATLAB's `patch` is.
 *
 * TWO BETTER-SOUNDING IDEAS WERE TRIED AND ARE NOT HERE, which is worth writing
 * down so that nobody spends the afternoon again:
 *
 * - *Culling the faces turned away.* Sound in principle -- half the painting is
 *   hidden surface -- but only if the outward direction is known, and it is
 *   not: the winding is inconsistent between the two generators (`tests/
 *   dome.test.js` states this), and deducing it from each solid's own centre
 *   goes wrong on thin curved pieces. It put holes in the ribs and shells of
 *   St Peter's.
 * - *Ordering the blocks first, then the faces inside each.* Correct for
 *   compact separated solids, and worse here: a rib is one long thin solid
 *   interleaved with two dozen short ones, so a single depth for the whole of
 *   it is a bad summary and the rib was painted over the shell that covers it.
 *
 * Sorting on the farthest vertex rather than the mean was also tried, and came
 * out between the two: better than ordering by block, worse than this.
 *
 * WHAT DID WORK IS FINER GEOMETRY, and only where it is needed. One depth per
 * face is a good summary of a small face and a bad one of a large face held
 * edge-on, and it is the second kind that goes wrong: a quadrilateral whose own
 * vertices differ in depth by a tenth of the whole scene is being asked to hold
 * a position it does not have. Such a face is cut into a 2 x 2 grid, which
 * gives each quarter a depth of its own; every other face is left alone.
 *
 * Measured against a software depth buffer on St Peter's dome at 600 x 600,
 * over four viewpoints, mis-painted pixels fell
 *
 *     az -45 el 30 : 1010 -> 74      az -110 el 10 : 700 -> 65
 *     az -60 el 30 :  670 -> 52      az  -20 el 50 : 154 -> 14
 *
 * for 1718 -> 5090 faces at the first of them. That is where the violet rib
 * came through the orange shell along a meridian: 637 of those 1010 pixels
 * were rib, and 73 remain. The threshold is a fraction of the DEPTH SPAN OF THE
 * SCENE, so it means the same thing on a lune five units deep and a dome forty.
 *
 * A depth buffer would settle all of it, and it means WebGL and a different
 * program.
 *
 * @returns {Array<{face, block, z, rim}>} back to front. `rim[i]` says whether
 *   the edge leaving vertex `i` lies on the boundary of an original face, so
 *   that cutting a face up does not draw a grid of new outlines across it.
 */

/** The four corners of one cell of a k x k grid on a quadrilateral. */
function gridCell(face, k, i, j) {
  const [a, b, c, d] = face;
  const at = (u, v) => {
    const ab = [0, 1, 2].map((t) => a[t] + (b[t] - a[t]) * u);
    const dc = [0, 1, 2].map((t) => d[t] + (c[t] - d[t]) * u);
    return [0, 1, 2].map((t) => ab[t] + (dc[t] - ab[t]) * v);
  };
  return [at(i / k, j / k), at((i + 1) / k, j / k),
    at((i + 1) / k, (j + 1) / k), at(i / k, (j + 1) / k)];
}

export function visibleFaces(solidList, f, opt = {}) {
  const {
    cull = false, split = 0.03, grid = 2, budget = 12000,
  } = opt;
  const raw = [];
  let near = Infinity;
  let far = -Infinity;
  solidList.forEach((solid, block) => {
    for (const face of solid) {
      if (!face || face.length < 3) continue;
      let sum = 0;
      let lo = Infinity;
      let hi = -Infinity;
      for (const p of face) {
        const z = depth(p, f);
        sum += z;
        if (z < lo) lo = z;
        if (z > hi) hi = z;
      }
      if (lo < near) near = lo;
      if (hi > far) far = hi;
      raw.push({ face, block, z: sum / face.length, spread: hi - lo });
    }
  });

  const span = far - near;
  const limit = split > 0 && span > 0 ? split * span : Infinity;

  // A BUDGET, SPENT WORST FIRST. Cutting faces up costs a fill apiece, and the
  // dome of St Peter's -- the largest thing in the catalogue at 83 blocks --
  // goes from 1718 faces at 3 ms to 5090 at 12 ms, which is still a comfortable
  // drag. A model several times larger must not quietly become a slideshow, so
  // when there is more to cut than the budget allows, the deepest faces are cut
  // and the rest are left whole: those are the ones a single depth describes
  // worst, and so the ones the money buys the most on.
  const wanted = raw.filter((item) => item.spread > limit && item.face.length === 4);
  let deep = null;
  if (raw.length + wanted.length * (grid * grid - 1) > budget) {
    const room = Math.max(0, Math.floor((budget - raw.length) / (grid * grid - 1)));
    deep = new Set([...wanted].sort((a, b) => b.spread - a.spread).slice(0, room));
  }

  const faces = [];
  for (const item of raw) {
    // Only quadrilaterals, which is every face `revolve` and `extrude` make
    // except the two end caps -- and a cap lies in one plane and is short in
    // depth, which is the case that was never in trouble.
    if (deep ? !deep.has(item) : !(item.spread > limit) || item.face.length !== 4) {
      faces.push({ face: item.face, block: item.block, z: item.z, rim: null });
      continue;
    }
    for (let i = 0; i < grid; i++) {
      for (let j = 0; j < grid; j++) {
        const cell = gridCell(item.face, grid, i, j);
        let sum = 0;
        for (const p of cell) sum += depth(p, f);
        faces.push({
          face: cell,
          block: item.block,
          z: sum / cell.length,
          // The cell's edges run 0:a-b, 1:b-c, 2:c-d, 3:d-a, and each is on the
          // original boundary only when the cell sits against that side.
          rim: [j === 0, i === grid - 1, j === grid - 1, i === 0],
        });
      }
    }
  }

  faces.sort((p, q) => p.z - q.z);
  if (!cull) return faces;
  // Kept only so that the experiment above is repeatable, and refused by
  // default; see the note.
  return faces.filter((item) => dot(normalOf(item.face), f.d) > 0);
}

/**
 * Draw the solids, far ones first.
 *
 * Faces are sorted on the depth of their centroid, cut up first where one depth
 * is a poor summary of a face; `visibleFaces` above carries that argument and
 * the measurements behind it.
 *
 * TWO CUES, AND WHY BOTH ARE NEEDED. The first is a head-on light: the more a
 * face turns away from the viewer the darker it goes, which is enough to read
 * the form without a lighting model. The second is aerial perspective -- the
 * farther a face lies, the more it is washed toward the ground colour.
 *
 * The light alone is not enough, and St Peter's dome is the case that shows it.
 * Each block is revolved through an angle of its own, scaled by the thickness
 * its GROUP carries, so the ribs at 3.8 span a wedge a quarter as wide as the
 * shells at 16.3 on either side of them. Cut the lune and the ribs' flat ends
 * stand some five units behind the flat ends of the shells, seen through the
 * void the narrow wedge leaves beside them. That much is right -- a rib is a
 * blade, and this is what a section through one looks like.
 *
 * But all three of those ends are meridian planes, so they face the light
 * almost identically and came out at almost the same brightness. With nothing
 * to say the middle one is further off, the eye read the recessed rib as lying
 * ON the shell in front of it. Depth has to be paid for in colour, because the
 * geometry has already been paid for in depth and there was nothing left to
 * see.
 *
 * A WARNING FOR ANYONE MEASURING THIS. The solid view is built from
 * `assignedThicknesses()` -- one thickness per GROUP -- and not from the per
 * block `model.thickness` the file also carries. On this dome the two differ,
 * and a depth buffer built from the wrong one exonerates a picture that is in
 * fact wrong. That mistake was made here once, and cost an afternoon.
 *
 * @param {object} ax          an Axes whose data coordinates are the screen plane
 * @param {Array} solidList    one entry per block, each an array of faces
 * @param {object} opt
 * @param {number} opt.haze    how far the farthest face is washed out, 0 to 1
 * @param {number[]} opt.ground  the colour it is washed toward
 */
export function drawSolids(ax, solidList, opt = {}) {
  const {
    f = frame(),
    colour = [196, 156, 110],
    edge = 'rgba(35,35,35,0.85)',
    highlight = null,
    edgeWidth = 0.6,
    cull = false,
    haze = 0.34,
    ground = [255, 255, 255],
    split = 0.03,
    grid = 2,
  } = opt;

  const faces = visibleFaces(solidList, f, { cull, split, grid });
  // The depth range of what is actually being drawn, so that the cue is spent
  // on the model in front of us rather than on some fixed scale: a lune 5 units
  // deep and a whole dome 40 deep both get the full range of the wash.
  let near = Infinity;
  let far = -Infinity;
  for (const item of faces) {
    if (item.z < near) near = item.z;
    if (item.z > far) far = item.z;
  }
  const span = far - near;

  ax.clipped((c) => {
    c.lineJoin = 'round';
    for (const item of faces) {
      // Head-on light, and both sides lit: a face turned away is still a face,
      // and here it is still painted -- covered, in a moment, by the face in
      // front of it.
      const lit = 0.45 + 0.55 * Math.abs(dot(normalOf(item.face), f.d));
      const tint = highlight && highlight[item.block] ? highlight[item.block] : colour;
      // 0 at the farthest face, 1 at the nearest.
      const away = span > 0 ? (far - item.z) / span : 0;
      const wash = haze * away;
      const shade = (k) => Math.round(
        tint[k] * lit * (1 - wash) + ground[k] * wash,
      );
      const pts = item.face.map((p) => ax.toPx(project(p, f)));
      c.beginPath();
      pts.forEach(([X, Y], i) => {
        if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
      });
      c.closePath();
      c.fillStyle = `rgb(${shade(0)} ${shade(1)} ${shade(2)})`;
      c.fill();
      // SEAL THE SEAM. Canvas anti-aliases the boundary of a fill, so where two
      // faces share an edge each covers about half the pixels along it and the
      // two together do not quite cover them; what shows through is whatever
      // was painted before, which in painter's order is what lies BEHIND.
      // Stroking the outline in the fill's own colour closes it. It matters
      // more now that faces are cut up: the quarters of one face must not show
      // a lattice of hairlines between them.
      c.strokeStyle = c.fillStyle;
      c.lineWidth = 1;
      c.stroke();
      if (edgeWidth > 0) {
        // The outlines recede with the faces they bound. Left at full strength
        // they undo the cue: a washed-out face behind a black wireframe reads
        // as near again.
        c.strokeStyle = wash > 0 ? rgbaFaded(edge, 1 - wash) : edge;
        c.lineWidth = edgeWidth;
        if (!item.rim) {
          c.stroke();
        } else {
          // A face that was cut up draws only the edges it inherited, so the
          // voussoir keeps the outline it always had.
          c.beginPath();
          for (let i = 0; i < pts.length; i++) {
            if (!item.rim[i]) continue;
            const [X0, Y0] = pts[i];
            const [X1, Y1] = pts[(i + 1) % pts.length];
            c.moveTo(X0, Y0);
            c.lineTo(X1, Y1);
          }
          c.stroke();
        }
      }
    }
  });
}

/**
 * The axis of revolution, drawn as a dashed line through the solid.
 *
 * Worth showing: the whole difference between a dome and a barrel is where
 * this line stands, and on an asymmetric trace it is not where the eye
 * assumes.
 */
export function drawAxis(ax, axisX, zRange, f, opt = {}) {
  const { colour = '#A2142F', depth: y = 0 } = opt;
  const [lo, hi] = zRange;
  ax.clipped((c) => {
    const a = ax.toPx(project([axisX, y, lo], f));
    const b = ax.toPx(project([axisX, y, hi], f));
    c.setLineDash([5, 4]);
    c.strokeStyle = colour;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(a[0], a[1]);
    c.lineTo(b[0], b[1]);
    c.stroke();
    c.setLineDash([]);
  });
}

/**
 * The parallels: circles about the axis of revolution, as rings of points.
 *
 * A lune is drawn as a slice, and a slice does not say what it is a slice OF.
 * These circles do. Two radii -- the farthest point of the model from the axis
 * and the nearest -- drawn at the height of the springing and again at the
 * crown, and the eye closes the dome around the wedge on the screen.
 *
 * They are the parallels the panel already reports in words: the major one,
 * where a lune is widest, and the minor one. Poleni's whole argument is that
 * the weight of a voussoir follows this radius, so it is worth being able to
 * see it rather than read it.
 *
 * SEPARATE FROM THE DRAWING because the rings reach well outside the slice,
 * and a view fitted to the slice alone would cut them off. The caller hands the
 * same rings to `projectedBounds` and to `drawParallels`, so what is framed and
 * what is drawn cannot drift apart.
 *
 * @param {number} axisX     where the axis stands, in the drawn frame
 * @param {number[]} radii   the circles to draw, as distances from the axis
 * @param {number[]} heights the levels to draw them at
 * @returns {Array<Array<number[]>>} one closed ring of points per circle
 */
export function parallels(axisX, radii, heights, opt = {}) {
  const { depth: y = 0, steps = 128 } = opt;
  const rs = (radii ?? []).filter((r) => Number.isFinite(r) && r > 0);
  const zs = (heights ?? []).filter((z) => Number.isFinite(z));
  const rings = [];
  for (const z of zs) {
    for (const r of rs) {
      const ring = [];
      for (let i = 0; i < steps; i++) {
        const t = (2 * Math.PI * i) / steps;
        ring.push([axisX + r * Math.cos(t), y + r * Math.sin(t), z]);
      }
      rings.push(ring);
    }
  }
  return rings;
}

/**
 * Draw the parallels, dashed.
 *
 * After the solid and not hidden by it. That is deliberate: a reference that
 * disappears behind the thing it refers to is no use, and the dashes already
 * say it is not masonry.
 */
export function drawParallels(ax, rings, f, opt = {}) {
  const { colour = '#A2142F', width = 1 } = opt;
  if (!rings || !rings.length) return;
  ax.clipped((c) => {
    c.setLineDash([5, 4]);
    c.strokeStyle = colour;
    c.lineWidth = width;
    for (const ring of rings) {
      if (ring.length < 2) continue;
      c.beginPath();
      ring.forEach((p, i) => {
        const [X, Y] = ax.toPx(project(p, f));
        if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
      });
      c.closePath();
      c.stroke();
    }
    c.setLineDash([]);
  });
}

/** A small 3-D reference frame, projected in the same view as the solid. */
export function drawReferenceFrame(ax, bounds, f, opt = {}) {
  if (!bounds) return;
  const { origin = null, scale = 0.18 } = opt;
  const span = Math.max(bounds.xmax - bounds.xmin, bounds.ymax - bounds.ymin, 1);
  const L = span * scale;
  const o2 = origin ?? [
    bounds.xmin + (bounds.xmax - bounds.xmin) * 0.08,
    bounds.ymin + (bounds.ymax - bounds.ymin) * 0.12,
  ];

  const draw = (dir, label, colour) => {
    const p1 = [o2[0] + project(dir, f)[0] * L, o2[1] + project(dir, f)[1] * L];
    ax.clipped((c) => {
      const [x0, y0] = ax.toPx(o2);
      const [x1, y1] = ax.toPx(p1);
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      if (len < 1) return;
      const ux = dx / len;
      const uy = dy / len;
      const head = Math.min(9, len * 0.35);
      const bx = x1 - ux * head;
      const by = y1 - uy * head;
      c.strokeStyle = colour;
      c.fillStyle = colour;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(bx, by);
      c.stroke();
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(bx - uy * head * 0.38, by + ux * head * 0.38);
      c.lineTo(bx + uy * head * 0.38, by - ux * head * 0.38);
      c.closePath();
      c.fill();
      c.font = 'bold 12px Helvetica, Arial, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(label, x1 + ux * 10, y1 + uy * 10);
    });
  };

  draw([1, 0, 0], 'X', '#A2142F');
  draw([0, 1, 0], 'Y', '#0072BD');
  draw([0, 0, 1], 'Z', '#2e7d32');
}
