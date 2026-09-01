/**
 * Drawing the arch, the thrust line, the force polygon and the cable.
 *
 * Everything here reproduces a MATLAB habit deliberately:
 *  - blocks in random light brick colours, as the app started doing in its
 *    last revision, so adjacent voussoirs are distinguishable;
 *  - the thrust line as a translucent red band whose WIDTH is proportional to
 *    the force it carries, over a black dashed centre line -- MATLAB's
 *    patchline trick, and the reason the picture reads as mechanics rather
 *    than as a graph;
 *  - arrows whose head stays the same size however long the shaft is.
 */

import { COLOR_ORDER } from './axes.js';
import { piecesOf } from '../core/geometry.js';

/** A deterministic light brick colour, so a block keeps its colour on redraw. */
export function brickColour(index) {
  // Golden-angle hopping through the warm end of the wheel.
  const h = (18 + ((index * 47) % 26)) / 360;
  const s = 0.28 + ((index * 13) % 17) / 100;
  const l = 0.68 + ((index * 7) % 12) / 100;
  return hslToCss(h * 360, s, l);
}

function hslToCss(h, s, l) {
  return `hsl(${h.toFixed(0)} ${(s * 100).toFixed(0)}% ${(l * 100).toFixed(0)}%)`;
}

/** Outline and fill the voussoirs. */
export function drawBlocks(ax, polys, opt = {}) {
  const {
    labels = false, highlight = -1, colours = null,
  } = opt;
  ax.clipped((c) => {
    polys.forEach((block, k) => {
      for (const p of piecesOf(block)) {
        c.beginPath();
        for (let i = 0; i < p.x.length; i++) {
          const [X, Y] = ax.toPx([p.x[i], p.y[i]]);
          if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
        }
        c.closePath();
        c.fillStyle = k === highlight ? '#ffd27f' : (colours?.[k] ?? brickColour(k));
        c.fill();
        c.strokeStyle = 'rgba(40,40,40,0.75)';
        c.lineWidth = k === highlight ? 1.6 : 0.8;
        c.stroke();
      }
    });
    if (labels) {
      c.fillStyle = '#333';
      c.font = '9px Helvetica, Arial, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      polys.forEach((p, k) => {
        const cx = p.x.reduce((a, b) => a + b, 0) / p.x.length;
        const cy = p.y.reduce((a, b) => a + b, 0) / p.y.length;
        const [X, Y] = ax.toPx([cx, cy]);
        c.fillText(String(k + 1), X, Y);
      });
    }
  });
}

/**
 * The line of thrust: a translucent band of varying width, plus a dashed
 * centre line. `forces` gives the magnitude carried by each segment.
 */
export function drawThrustLine(ax, points, forces, opt = {}) {
  const { widthFactor = 12, colour = 'rgb(200,30,30)' } = opt;
  if (!points || points.length < 2) return;
  const maxF = forces && forces.length ? Math.max(...forces.map(Math.abs)) : 1;

  ax.clipped((c) => {
    c.lineCap = 'butt';
    for (let i = 0; i + 1 < points.length; i++) {
      const f = forces && forces[i] !== undefined ? Math.abs(forces[i]) : maxF;
      const [x0, y0] = ax.toPx(points[i]);
      const [x1, y1] = ax.toPx(points[i + 1]);
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.strokeStyle = colour;
      c.globalAlpha = 0.45;
      c.lineWidth = Math.max(1.5, (f / maxF) * widthFactor);
      c.stroke();
    }
    c.globalAlpha = 1;
    c.beginPath();
    points.forEach((p, i) => {
      const [X, Y] = ax.toPx(p);
      if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
    });
    c.strokeStyle = '#111';
    c.lineWidth = 1.4;
    c.setLineDash([6, 4]);
    c.stroke();
    c.setLineDash([]);

    // The vertices: where the line crosses a joint.
    c.fillStyle = '#111';
    points.forEach((p) => {
      const [X, Y] = ax.toPx(p);
      c.beginPath();
      c.arc(X, Y, 2, 0, 2 * Math.PI);
      c.fill();
    });
  });
}

/** Hooke's cable, drawn as the mirror of the thrust line. */
/**
 * Hooke's cable, with the weights it carries.
 *
 * `weights` draws a disc at each vertex whose AREA is proportional to the
 * weight there -- area, not radius, because that is what the eye compares.
 * On a dome lune the springing discs dwarf the crown ones, which is the taper
 * of the lune made visible on the arch itself.
 */
export function drawCable(ax, points, opt = {}) {
  const { colour = COLOR_ORDER[0], weights = null, weightScale = 0 } = opt;
  if (!points || points.length < 2) return;
  ax.clipped((c) => {
    c.beginPath();
    points.forEach((p, i) => {
      const [X, Y] = ax.toPx(p);
      if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
    });
    c.strokeStyle = colour;
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = colour;
    points.forEach((p) => {
      const [X, Y] = ax.toPx(p);
      c.beginPath();
      c.arc(X, Y, 2.5, 0, 2 * Math.PI);
      c.fill();
    });

    if (weights && weightScale > 0) {
      const peak = Math.max(...weights.map(Math.abs), 0);
      if (peak > 0) {
        c.lineWidth = 1;
        c.strokeStyle = colour;
        c.fillStyle = 'rgba(0,114,189,0.16)';
        weights.forEach((w, i) => {
          // The cable has one more vertex than there are weights: the load at
          // a station sits on the vertex that follows it.
          const p = points[i + 1] ?? points[points.length - 1];
          const [X, Y] = ax.toPx(p);
          const r = weightScale * Math.sqrt(Math.abs(w) / peak);
          if (!(r > 0.5)) return;
          c.beginPath();
          c.arc(X, Y, r, 0, 2 * Math.PI);
          c.fill();
          c.stroke();
        });
      }
    }
  });
}

/**
 * An arrow whose head is a fixed size in pixels, as drawArrow was fixed to do:
 * the shaft scales, the head does not, so a short arrow still reads as one.
 */
export function drawArrow(ax, p0, p1, colour = '#c00', headPx = 9, lineWidth = 1.4) {
  const [x0, y0] = ax.toPx(p0);
  const [x1, y1] = ax.toPx(p1);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const ux = dx / len;
  const uy = dy / len;
  const head = Math.min(headPx, len * 0.6);
  const bx = x1 - ux * head;
  const by = y1 - uy * head;

  const c = ax.ctx;
  c.save();
  c.strokeStyle = colour;
  c.fillStyle = colour;
  c.lineWidth = lineWidth;
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
  c.restore();
}

export function drawReactionLabel(ctx, x, y, name, value, opt = {}) {
  const {
    colour = '#0072BD',
    align = 'left',
    baseline = 'middle',
    size = 11,
  } = opt;
  const sub = name === 'R_A' ? 'A' : name === 'R_B' ? 'B' : '';
  const main = sub ? 'R' : name;
  const valueText = value ? ` = ${value}` : '';
  const mainFont = `bold ${size}px Helvetica, Arial, sans-serif`;
  const subFont = `bold ${Math.round(size * 0.72)}px Helvetica, Arial, sans-serif`;
  const oldFont = ctx.font;
  ctx.save();
  ctx.fillStyle = colour;
  ctx.textBaseline = 'alphabetic';
  ctx.font = mainFont;
  const mainW = ctx.measureText(main).width;
  ctx.font = subFont;
  const subW = sub ? ctx.measureText(sub).width : 0;
  ctx.font = mainFont;
  const valW = ctx.measureText(valueText).width;
  const totalW = mainW + subW + valW;
  const baseY = baseline === 'bottom' ? y : y + size * 0.35;
  let startX = x;
  if (align === 'right') startX = x - totalW;
  if (align === 'center') startX = x - totalW / 2;
  ctx.textAlign = 'left';
  ctx.font = mainFont;
  ctx.fillText(main, startX, baseY);
  if (sub) {
    ctx.font = subFont;
    ctx.fillText(sub, startX + mainW + 1, baseY + size * 0.24);
  }
  ctx.font = mainFont;
  ctx.fillText(valueText, startX + mainW + subW + (sub ? 2 : 0), baseY);
  ctx.font = oldFont;
  ctx.restore();
}

/** The weight of each block, as a downward arrow from its centroid. */
export function drawWeights(ax, centroids, weights, opt = {}) {
  const { scale = 1, colour = '#7a7a7a' } = opt;
  if (!centroids || !weights) return;
  const maxW = Math.max(...weights.map(Math.abs)) || 1;
  const span = (ax.view.ymax - ax.view.ymin) * 0.12 * scale;
  ax.clipped(() => {
    centroids.forEach((g, k) => {
      const l = (Math.abs(weights[k]) / maxW) * span;
      drawArrow(ax, g, [g[0], g[1] - l], colour, 7);
    });
  });
}

/** The two springings. */
export function drawSupports(ax, a, b) {
  const c = ax.ctx;
  ax.clipped(() => {
    for (const [p, name] of [[a, 'A'], [b, 'B']]) {
      if (!p) continue;
      const [X, Y] = ax.toPx(p);
      c.beginPath();
      c.arc(X, Y, 4, 0, 2 * Math.PI);
      c.fillStyle = '#111';
      c.fill();
      c.font = 'bold 11px Helvetica, Arial, sans-serif';
      c.fillStyle = '#111';
      c.textAlign = 'left';
      c.textBaseline = 'bottom';
      c.fillText(name, X + 6, Y - 4);
    }
  });
}

/**
 * The force polygon: the load line, the pole, and the rays.
 *
 * Drawn in its own axes, in the force plane, which is why the module takes a
 * separate Axes instance.
 */
/**
 * The letter for a ray, after Bow.
 *
 * Ray j joins the pole to division j of the load line, and the j-th segment of
 * the funicular polygon is parallel to it. The same letter goes on both, which
 * is the whole point of the notation: it lets a reader carry a force from one
 * drawing to the other by eye.
 *
 * The sequence runs a, b, ... z, aa, ba, ... za, ab, bb, ... zb -- bijective
 * base 26 with the FIRST character cycling fastest, which keeps the letters
 * that appear next to each other on the drawing short and distinct.
 */
export function rayLabel(j) {
  let n = j;
  let out = '';
  do {
    out += String.fromCharCode(97 + (n % 26));
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * How often to letter, so a 56-block arch does not become unreadable.
 *
 * Returns 1 when everything can be lettered, otherwise the stride that keeps
 * the count near `most`. Both drawings must be given the SAME stride or the
 * letters stop corresponding, which is why this is a function and not a
 * constant in two places.
 */
export function labelStride(count, most = 18) {
  return count <= most ? 1 : Math.ceil(count / most);
}

export function drawForcePolygon(ax, fp, opt = {}) {
  const {
    labels = true, rayLabels = false, stride = 1, construction = null,
    reactions = false, reactionLabels = null,
  } = opt;
  const { stations, pole } = fp;
  const c = ax.ctx;

  ax.clipped(() => {
    // The rays, pole to every division. Dashed, so that they read as
    // construction lines rather than as forces: the only full lines in this
    // drawing are the load line and the polygon itself.
    c.strokeStyle = '#555';
    c.lineWidth = 0.9;
    c.setLineDash([4, 3]);
    for (const s of stations) {
      const [x0, y0] = ax.toPx(pole);
      const [x1, y1] = ax.toPx([0, s]);
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
    }
    c.setLineDash([]);

    if (rayLabels) {
      // At the load-line end of each ray, pushed clear of the load line on the
      // side away from the pole.
      const side = pole[0] >= 0 ? -1 : 1;
      c.font = '10px Helvetica, Arial, sans-serif';
      c.fillStyle = '#333';
      c.textAlign = side < 0 ? 'right' : 'left';
      c.textBaseline = 'middle';
      stations.forEach((s, j) => {
        if (j % stride) return;
        const [X, Y] = ax.toPx([0, s]);
        c.fillText(rayLabel(j), X + side * 6, Y);
      });
    }
    if (reactions && stations.length >= 2) {
      const top = [0, stations[0]];
      const bottom = [0, stations[stations.length - 1]];
      const drawRay = (p, name, side) => {
        drawArrow(ax, pole, p, '#0072BD', 12, 2.6);
      const [X, Y] = ax.toPx(p);
      const value = reactionLabels?.[name.replace('_', '')] ?? '';
      drawReactionLabel(c, X + (side === 'left' ? -7 : 7), Y, name, value, {
        align: side,
        baseline: 'middle',
      });
    };
      drawRay(top, 'R_B', pole[0] >= 0 ? 'left' : 'right');
      drawRay(bottom, 'R_A', pole[0] >= 0 ? 'left' : 'right');

      const h0 = pole;
      const h1 = [0, pole[1]];
      drawArrow(ax, h0, h1, '#111', 11, 2.3);
      const [hx0, hy0] = ax.toPx(h0);
      const [hx1, hy1] = ax.toPx(h1);
      c.font = 'bold 11px Helvetica, Arial, sans-serif';
      c.fillStyle = '#111';
      c.textAlign = 'center';
      c.textBaseline = 'bottom';
      c.fillText(reactionLabels?.H ?? 'H', (hx0 + hx1) / 2, hy0 - 5);
    }
    // The load line, one red segment per weight.
    c.strokeStyle = '#c00';
    c.lineWidth = 3;
    for (let j = 0; j + 1 < stations.length; j++) {
      const [x0, y0] = ax.toPx([0, stations[j]]);
      const [x1, y1] = ax.toPx([0, stations[j + 1]]);
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
    }
    // The pole.
    const [px, py] = ax.toPx(pole);
    c.beginPath();
    c.arc(px, py, 3.5, 0, 2 * Math.PI);
    c.fillStyle = '#111';
    c.fill();
    if (labels) {
      c.font = 'bold 12px Helvetica, Arial, sans-serif';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText('O', px + 7, py);
    }

    // THE CORRECTION, SHOWN. A trial pole at the same thrust, and the step
    // down the vertical that carries the line onto B. The student should see
    // that the thrust is not what changed.
    if (construction && construction.trial) {
      const [tx, ty] = ax.toPx(construction.trial);
      c.setLineDash([4, 3]);
      c.strokeStyle = '#A2142F';
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(tx, ty);
      c.lineTo(px, py);
      c.stroke();
      c.setLineDash([]);

      c.beginPath();
      c.arc(tx, ty, 3, 0, 2 * Math.PI);
      c.fillStyle = '#fff';
      c.fill();
      c.lineWidth = 1.6;
      c.strokeStyle = '#A2142F';
      c.stroke();
      if (labels) {
        c.fillStyle = '#A2142F';
        c.font = 'bold 12px Helvetica, Arial, sans-serif';
        c.fillText("O'", tx + 7, ty);
      }
    }
  });
}

/** The two imposed ends, marked and lettered on the arch. */
export function drawEnds(ax, A, B, opt = {}) {
  const { colour = '#7d3c98' } = opt;
  ax.clipped((c) => {
    c.font = 'bold 12px Helvetica, Arial, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const [p, name] of [[A, 'A'], [B, 'B']]) {
      if (!p) continue;
      const [X, Y] = ax.toPx(p);
      c.beginPath();
      c.arc(X, Y, 5, 0, 2 * Math.PI);
      c.fillStyle = colour;
      c.fill();
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(255,255,255,0.9)';
      c.strokeText(name, X, Y - 13);
      c.fillStyle = colour;
      c.fillText(name, X, Y - 13);
    }
  });
}

/** The preliminary funicular: where the trial pole would have taken the line. */
export function drawPreliminary(ax, points, opt = {}) {
  const { colour = 'rgba(120,120,120,0.9)' } = opt;
  if (!points || points.length < 2) return;
  ax.clipped((c) => {
    c.setLineDash([6, 4]);
    c.strokeStyle = colour;
    c.lineWidth = 1.2;
    c.beginPath();
    points.forEach((p, i) => {
      const [X, Y] = ax.toPx(p);
      if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
    });
    c.stroke();
    c.setLineDash([]);
  });
}

/**
 * The same letters again, on the thrust line.
 *
 * Segment j of the polygon is parallel to ray j, so it carries ray j's letter.
 * Placed at the segment's mid-point and offset perpendicular to it, so the
 * letter sits beside the line rather than on top of it.
 */
export function drawThrustLabels(ax, points, opt = {}) {
  const { stride = 1, colour = '#111' } = opt;
  if (!points || points.length < 2) return;
  ax.clipped((c) => {
    c.font = '10px Helvetica, Arial, sans-serif';
    c.fillStyle = colour;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let j = 0; j + 1 < points.length; j++) {
      if (j % stride) continue;
      const [x0, y0] = ax.toPx(points[j]);
      const [x1, y1] = ax.toPx(points[j + 1]);
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      // Perpendicular, 9 px clear. In canvas pixels y grows downwards, so this
      // normal puts the letter on the upper side of a rising segment.
      const nx = -dy / len;
      const ny = dx / len;
      const text = rayLabel(j);
      const X = mx + nx * 9;
      const Y = my + ny * 9;
      // A halo, or the letter disappears into the brickwork.
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(255,255,255,0.85)';
      c.strokeText(text, X, Y);
      c.fillText(text, X, Y);
    }
  });
}

/**
 * The hinges, drawn as the convention has them: an open circle.
 *
 * A hinge to the ground is filled, an internal one is hollow, which is how
 * they are told apart in every structural drawing.
 */
export function drawHinges(ax, hinges, opt = {}) {
  const { colour = '#A2142F', labels = true } = opt;
  if (!hinges || !hinges.length) return;
  ax.clipped((c) => {
    c.font = 'bold 10px Helvetica, Arial, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    hinges.forEach((h, i) => {
      const [X, Y] = ax.toPx(h.point);
      c.beginPath();
      c.arc(X, Y, 5, 0, 2 * Math.PI);
      c.fillStyle = h.support ? colour : '#fff';
      c.fill();
      c.lineWidth = 1.8;
      c.strokeStyle = colour;
      c.stroke();
      if (labels) {
        c.fillStyle = colour;
        c.lineWidth = 3;
        c.strokeStyle = 'rgba(255,255,255,0.9)';
        const text = String.fromCharCode(65 + (i % 26));
        c.strokeText(text, X, Y - 12);
        c.fillText(text, X, Y - 12);
      }
    });
  });
}

/** One colour per macro-block, so the division of the arch is visible. */
export const BODY_COLOURS = [
  '#7fb3d5', '#f0b27a', '#a9dfbf', '#d7bde2', '#f9e79f', '#aeb6bf',
];

/**
 * The voussoirs, tinted by the macro-block they belong to.
 *
 * Deliberately not brickColour: while a mechanism is on show, what matters is
 * which pieces move together, not that adjacent stones are distinguishable.
 */
export function drawMacroBlocks(ax, polys, bodyOf) {
  ax.clipped((c) => {
    polys.forEach((block, k) => {
      const b = bodyOf[k];
      for (const p of piecesOf(block)) {
        c.beginPath();
        for (let i = 0; i < p.x.length; i++) {
          const [X, Y] = ax.toPx([p.x[i], p.y[i]]);
          if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
        }
        c.closePath();
        c.fillStyle = b < 0 ? '#e8e8e8' : BODY_COLOURS[b % BODY_COLOURS.length];
        c.fill();
        c.strokeStyle = 'rgba(40,40,40,0.6)';
        c.lineWidth = 0.8;
        c.stroke();
      }
    });
  });
}

/** The displaced configuration, outlined over the arch it came from. */
export function drawMechanism(ax, polys, opt = {}) {
  const { colour = '#A2142F' } = opt;
  ax.clipped((c) => {
    c.strokeStyle = colour;
    c.lineWidth = 1.2;
    c.fillStyle = 'rgba(162,20,47,0.10)';
    polys.forEach((p) => {
      c.beginPath();
      for (let i = 0; i < p.x.length; i++) {
        const [X, Y] = ax.toPx([p.x[i], p.y[i]]);
        if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
      }
      c.closePath();
      c.fill();
      c.stroke();
    });
  });
}

/** The instantaneous centres, with a thin line to the hinges they govern. */
export function drawCentres(ax, motion, opt = {}) {
  const { colour = '#1f6f3f' } = opt;
  if (!motion) return;
  ax.clipped((c) => {
    c.font = '10px Helvetica, Arial, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    motion.motions.forEach((m, i) => {
      if (!m.centre) return;
      const [X, Y] = ax.toPx(m.centre);
      c.beginPath();
      c.moveTo(X - 5, Y); c.lineTo(X + 5, Y);
      c.moveTo(X, Y - 5); c.lineTo(X, Y + 5);
      c.strokeStyle = colour;
      c.lineWidth = 1.3;
      c.stroke();
      c.fillStyle = colour;
      c.fillText(`C${i + 1}`, X + 7, Y);
    });
  });
}
