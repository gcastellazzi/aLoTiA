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
 * Draw the solids, far ones first.
 *
 * Faces are sorted on the depth of their centroid. That is the painter's
 * algorithm and it can be fooled by long interpenetrating faces, but the
 * voussoirs of an arch are small convex pieces that do not overlap, so it is
 * exact here and costs one sort.
 *
 * Shading is a head-on light: the more a face turns away from the viewer the
 * darker it goes, which is enough to read the form without a lighting model.
 *
 * @param {object} ax          an Axes whose data coordinates are the screen plane
 * @param {Array} solidList    one entry per block, each an array of faces
 * @param {object} opt
 */
export function drawSolids(ax, solidList, opt = {}) {
  const {
    f = frame(),
    colour = [196, 156, 110],
    edge = 'rgba(35,35,35,0.85)',
    highlight = null,
    edgeWidth = 0.6,
  } = opt;

  // One flat list of faces, each with the depth to sort on.
  const faces = [];
  solidList.forEach((solid, block) => {
    for (const face of solid) {
      let z = 0;
      for (const p of face) z += depth(p, f);
      faces.push({ face, block, z: z / face.length });
    }
  });
  faces.sort((p, q) => p.z - q.z);

  ax.clipped((c) => {
    c.lineJoin = 'round';
    for (const item of faces) {
      const n = normalOf(item.face);
      // Head-on light, and both sides lit: a face turned away is still a face.
      const lit = 0.45 + 0.55 * Math.abs(dot(n, f.d));
      const tint = highlight && highlight[item.block] ? highlight[item.block] : colour;
      c.beginPath();
      item.face.forEach((p, i) => {
        const [X, Y] = ax.toPx(project(p, f));
        if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
      });
      c.closePath();
      c.fillStyle = `rgb(${Math.round(tint[0] * lit)} ${Math.round(tint[1] * lit)} `
        + `${Math.round(tint[2] * lit)})`;
      c.fill();
      if (edgeWidth > 0) {
        c.strokeStyle = edge;
        c.lineWidth = edgeWidth;
        c.stroke();
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
