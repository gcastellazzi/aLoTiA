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

/**
 * A colour with an alpha, from a `#rrggbb`.
 *
 * Written out rather than reached for a library: the palette is six hex
 * strings and this is the one place any of them needs to be made translucent.
 */
export function rgba(hex, alpha) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(hex).trim());
  if (!m) return hex;
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Say, in the space of a plot, why there is no plot.
 *
 * AN EMPTY FRAME IS NOT AN ANSWER. A pair of axes with nothing between them
 * reads as a fault in the software, and the reason -- that the blocks are not
 * one chain, or that no joint has been picked, or that this study is only
 * defined for a ring built from its numbers -- is exactly the thing the student
 * needs and the one place they are looking. The status line under the plot
 * carries it too, but the eye is on the empty box.
 *
 * @param {object} ax        the Axes to write on
 * @param {string[]} lines   already broken into lines; the first is the heading
 */
export function drawNotice(ax, lines, opt = {}) {
  const { colour = '#666', headColour = '#262626' } = opt;
  const b = ax.box;
  if (!(b.w > 40) || !(b.h > 30) || !lines.length) return;
  const c = ax.ctx;
  c.save();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const step = 17;
  const top = b.y + b.h / 2 - ((lines.length - 1) * step) / 2;

  // A panel behind it. The axes and their letters are still drawn, and grey
  // text over a gridline and an arrowhead is text nobody reads.
  let wide = 0;
  lines.forEach((line, i) => {
    c.font = i === 0
      ? 'bold 13px Helvetica, Arial, sans-serif'
      : '12px Helvetica, Arial, sans-serif';
    wide = Math.max(wide, c.measureText(line).width);
  });
  const padX = 14;
  const padY = 10;
  c.globalAlpha = 0.9;
  c.fillStyle = '#ffffff';
  c.fillRect(b.x + b.w / 2 - wide / 2 - padX, top - step / 2 - padY,
    wide + 2 * padX, lines.length * step + 2 * padY);
  c.globalAlpha = 1;

  lines.forEach((line, i) => {
    c.font = i === 0
      ? 'bold 13px Helvetica, Arial, sans-serif'
      : '12px Helvetica, Arial, sans-serif';
    c.fillStyle = i === 0 ? headColour : colour;
    c.fillText(line, b.x + b.w / 2, top + i * step);
  });
  c.restore();
}

/**
 * The elementary cell: one joint, drawn as the two stones that meet at it.
 *
 * WHY A PICTURE OF THE JOINT BESIDE A DIAGRAM OF IT. The $N$--$M$ point says
 * whether the resultant falls inside the section, and a student who has just
 * met the no-tension wedge can read that point correctly and still not picture
 * what it means for the masonry. This says it in the other language: two blocks
 * meeting at a joint of depth `h`, the resultant crossing it at its
 * eccentricity `e`, and the joint either
 *
 *   - CLOSED, in contact over its whole depth, while the resultant lies within
 *     the section; or
 *   - OPEN, hinged at the face the resultant has passed and gaping on the far
 *     side, once it lies outside. A no-tension joint cannot pull the two stones
 *     together, so the side away from the thrust is the side that lets go.
 *
 * The eccentricity is dimensioned from the centre line, so the number in the
 * status line and the gap on the drawing are visibly the same quantity.
 *
 * Drawn in the corner of the plot in PIXELS, not in data coordinates: it is a
 * legend, not a plotted quantity, and it must keep its proportions whatever the
 * axes are scaled to.
 *
 * @param {object} ax
 * @param {object} cell  {ecc, thickness, inside} -- one `heymanPoint`
 * @param {object} opt   `corner`, and `size` in pixels
 */
/**
 * Where a joint opens, given the eccentricity of the force it carries.
 *
 * The whole rule, in one place so that it can be tested and so that the drawing
 * cannot quietly disagree with the diagram beside it. A no-tension joint carries
 * compression and nothing else, so:
 *
 *   - while the resultant falls INSIDE the section the joint is in contact over
 *     its whole depth and there is nothing to see;
 *   - once it falls outside, the joint hinges at the face the resultant has
 *     passed and gapes at the OTHER one. It cannot do the reverse: that would
 *     need the two stones to pull each other together.
 *
 * `r` is the eccentricity in half-depths, so |r| = 1 is a face. Positive is the
 * direction of increasing y, which is downward in the drawing and is the second
 * end of the joint as `jointCrossings` measures it.
 *
 * @returns {{r:number, open:boolean, holds:('plus'|'minus'|null)}} `holds` names
 *   the face that stays in contact -- the one the resultant went past -- so the
 *   joint gapes at the other. It is null while the joint is closed.
 */
export function jointOpening(ecc, thickness) {
  if (!Number.isFinite(ecc) || !(thickness > 0)) return { r: 0, open: false, holds: null };
  const r = ecc / (thickness / 2);
  if (Math.abs(r) <= 1) return { r, open: false, holds: null };
  return { r, open: true, holds: r > 0 ? 'plus' : 'minus' };
}

export function drawJointCell(ax, cell, opt = {}) {
  const {
    corner = 'bottom-right', scale = 1.5, margin = 12,
  } = opt;
  if (!cell || !Number.isFinite(cell.ecc) || !(cell.thickness > 0)) return;

  // ONE SCALE FOR THE WHOLE PICTURE. Every length below is in the units the
  // drawing was laid out in and multiplied by `k`, so resizing it is one
  // number and nothing can come adrift from anything else.
  const k = scale;
  const width = 172 * k;
  const height = 170 * k;
  const b = ax.box;
  if (!(b.w > width + 2 * margin) || !(b.h > height + 2 * margin)) return;

  const c = ax.ctx;
  const x0 = corner.includes('right') ? b.x + b.w - width - margin : b.x + margin;
  const y0 = corner.includes('bottom') ? b.y + b.h - height - margin : b.y + margin;

  const t = cell.thickness;
  const { r, open, holds } = jointOpening(cell.ecc, t);
  const ink = (open || cell.inside === false) ? '#A2142F' : '#2e7d32';

  // FOUR LANES ACROSS THE PICTURE, so that nothing has to share a column with
  // anything else: the depth, the eccentricity, the thrust arriving from the
  // left, the stones, and the thrust arriving from the right.
  const hx = x0 + 18 * k;                 // the depth dimension
  const ex = x0 + 40 * k;                 // the eccentricity dimension
  const cx = x0 + 100 * k;                // the joint
  const bw = 20 * k;                      // the width of each stone
  const arm = 24 * k;                     // how far out the thrust is drawn
  const top = y0 + 26 * k;
  // The stones stop well short of the captions: when the joint has opened, the
  // resultant is BEYOND the section and is drawn there, so the room below the
  // stones has to hold it as well as the two lines of text.
  const bot = y0 + height - 62 * k;
  const h = bot - top;
  const mid = (top + bot) / 2;

  c.save();
  c.globalAlpha = 0.94;
  c.fillStyle = '#ffffff';
  c.fillRect(x0, y0, width, height);
  c.globalAlpha = 1;
  c.strokeStyle = 'rgba(0,0,0,0.18)';
  c.lineWidth = 1;
  c.strokeRect(x0 + 0.5, y0 + 0.5, width - 1, height - 1);

  // WHERE THE RESULTANT CROSSES. Held a little inside the panel so that a line
  // far outside the section still shows which way it went, and still fits.
  const reach = 1.25;
  const yF = mid + Math.max(-reach, Math.min(reach, r)) * (h / 2);

  // THE FAR STONE TURNS, IT DOES NOT STRETCH. It used to be drawn as a
  // parallelogram, which opens the joint by shearing the block -- a picture of
  // masonry doing something masonry cannot do, in a panel whose whole subject
  // is what masonry cannot do. It is now a rigid rotation about the hinge: the
  // stone keeps its shape and its size, and only its position changes.
  const gap = open ? Math.min(11 * k, (4 + 6 * (Math.min(Math.abs(r), 1.8) - 1)) * k) : 0;
  const hinge = holds === 'plus' ? [cx, bot] : [cx, top];
  const sense = holds === 'plus' ? 1 : -1;
  const theta = h > 0 ? sense * Math.asin(Math.min(1, gap / h)) : 0;
  const turn = ([px, py]) => {
    const dx = px - hinge[0];
    const dy = py - hinge[1];
    return [
      hinge[0] + dx * Math.cos(theta) - dy * Math.sin(theta),
      hinge[1] + dx * Math.sin(theta) + dy * Math.cos(theta),
    ];
  };

  c.fillStyle = 'rgba(196,156,110,0.9)';
  c.strokeStyle = '#333';
  c.lineWidth = 1.1;
  c.beginPath();
  c.rect(cx - bw, top, bw, h);
  c.fill();
  c.stroke();

  c.beginPath();
  [[cx, top], [cx + bw, top], [cx + bw, bot], [cx, bot]]
    .map(turn)
    .forEach(([px, py], i) => { if (i === 0) c.moveTo(px, py); else c.lineTo(px, py); });
  c.closePath();
  c.fill();
  c.stroke();

  const small = `italic ${14 * k}px Georgia, serif`;
  const dot = (x, y, colour) => {
    c.beginPath();
    c.arc(x, y, 2.4 * k, 0, 2 * Math.PI);
    c.fillStyle = colour;
    c.fill();
  };
  // Witness lines: thin, pale, and carrying the dimension out to where it is
  // read, as a drawing office would. They are deliberately fainter than
  // anything they measure.
  const witness = (xa, xb, y) => {
    c.save();
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(xa, y);
    c.lineTo(xb, y);
    c.stroke();
    c.restore();
  };

  // The depth of the section, carried out from the near stone.
  witness(hx, cx - bw, top);
  witness(hx, cx - bw, bot);
  c.strokeStyle = '#333';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(hx, top);
  c.lineTo(hx, bot);
  c.stroke();
  dot(hx, top, '#333');
  dot(hx, bot, '#333');
  c.font = small;
  c.fillStyle = '#333';
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  c.fillText('h', hx - 5 * k, mid);

  // The centre line the eccentricity is measured from.
  c.setLineDash([5 * k, 3 * k, 1 * k, 3 * k]);
  c.strokeStyle = 'rgba(0,0,0,0.5)';
  c.beginPath();
  c.moveTo(x0 + 28 * k, mid);
  c.lineTo(x0 + width - 8 * k, mid);
  c.stroke();
  c.setLineDash([]);

  // The eccentricity, dimensioned from the centre line to the resultant, with
  // its own witness line carrying the level of the thrust across.
  if (Math.abs(r) > 0.03) {
    witness(ex, cx - bw - arm, yF);
    c.strokeStyle = ink;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(ex, mid);
    c.lineTo(ex, yF);
    c.stroke();
    dot(ex, mid, ink);
    dot(ex, yF, ink);
    c.font = small;
    c.fillStyle = ink;
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    c.fillText('e', ex - 5 * k, (mid + yF) / 2);
  }

  // THE THRUST ARRIVES FROM OUTSIDE THE STONES, as it is drawn on a free body:
  // the arrow stops at the face it pushes on rather than running across the
  // joint. Drawn over the joint it looked like a force applied AT the hinge,
  // which is the one place it is not.
  c.strokeStyle = ink;
  c.lineWidth = 1.8;
  c.fillStyle = ink;
  for (const side of [-1, 1]) {
    const face = cx + side * bw;
    const from = face + side * arm;
    c.beginPath();
    c.moveTo(from, yF);
    c.lineTo(face, yF);
    c.stroke();
    c.beginPath();
    c.moveTo(face, yF);
    c.lineTo(face + side * 6 * k, yF - 3.2 * k);
    c.lineTo(face + side * 6 * k, yF + 3.2 * k);
    c.closePath();
    c.fill();
  }
  // `N` keeps the size it has on the axes; only the annotations grew.
  c.font = 'italic 11px Georgia, serif';
  c.textAlign = 'left';
  c.textBaseline = yF < mid ? 'top' : 'bottom';
  c.fillText('N', cx + bw + arm + 3 * k, yF + (yF < mid ? 4 : -4));

  // THE HINGE, once there is one. A circle is what a hinge is drawn as, and it
  // is the thing the picture is really about: the joint has stopped being a
  // face in contact and become a point to turn about.
  if (open) {
    c.beginPath();
    c.arc(hinge[0], hinge[1], 4 * k, 0, 2 * Math.PI);
    c.fillStyle = '#fff';
    c.fill();
    c.strokeStyle = ink;
    c.lineWidth = 1.8;
    c.stroke();
  }

  // THE GEOMETRICAL FACTOR OF SAFETY OF THIS JOINT, which is the same ratio the
  // drawing is: how many times the eccentricity would fit into the half depth,
  // and so how far the ring could be thinned about its centre before this line
  // touched a face. It is 1 exactly when the joint is on the point of opening.
  const gsf = Math.abs(cell.ecc) <= 1e-12 ? Infinity : (t / 2) / Math.abs(cell.ecc);
  c.font = `bold ${13 * k}px Helvetica, Arial, sans-serif`;
  c.fillStyle = ink;
  c.textAlign = 'center';
  c.textBaseline = 'bottom';
  c.fillText(open ? 'joint opens' : 'joint closed', x0 + width / 2, y0 + height - 24 * k);
  // NAMED, because the panel already reports a GSF in its other corner and that
  // one is the ARCH's -- the worst joint of all of them. This is this joint's,
  // and two bare numbers differing by a factor of two would read as a fault.
  c.font = `${11 * k}px Helvetica, Arial, sans-serif`;
  c.fillText(`GSF = ${Number.isFinite(gsf) ? gsf.toPrecision(3) : '\u221e'} (this joint)`,
    x0 + width / 2, y0 + height - 7 * k);
  c.restore();
}

/**
 * Break a sentence into lines that fit a width, without cutting a word.
 *
 * Canvas has no text wrapping, and a notice that runs off the side of the plot
 * is worse than no notice.
 */
export function wrapText(ctx, text, maxWidth, font = '12px Helvetica, Arial, sans-serif') {
  ctx.save();
  ctx.font = font;
  const out = [];
  let line = '';
  for (const word of String(text ?? '').split(/\s+/).filter(Boolean)) {
    const trial = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(trial).width > maxWidth) {
      out.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) out.push(line);
  ctx.restore();
  return out;
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
 * Hooke's cable, with the force in it and the weights it carries.
 *
 * THE CABLE CARRIES THE SAME FORCES AS THE ARCH, which is the whole of Hooke's
 * sentence -- *ut pendet continuum flexile, sic stabit contiguum rigidum
 * inversum* -- and until now the drawing did not say so: the arch's line of
 * thrust was a band whose width was the force in each segment, and the cable
 * beside it was a wire of one thickness. `forces` is the same list the thrust
 * line is given, so the two are drawn in the same grammar and the eye can put
 * them side by side. Only the colour differs, because one is a compression and
 * the other a tension, and they are not the same thing however equal their
 * magnitudes.
 *
 * `weights` draws a disc at each vertex whose AREA is proportional to the
 * weight there -- area, not radius, because that is what the eye compares. On a
 * dome lune the springing discs dwarf the crown ones, which is the taper of the
 * lune made visible on the arch itself.
 *
 * THE DISCS SAY WHAT THEY ARE. `kinds` is the tag `blocksLike` already carries
 * -- 0 for a voussoir, 1 for a load the student applied -- and the two are
 * drawn in different colours. The construction is deliberately indifferent to
 * the difference, a load and a weight both being one station on the load line,
 * and that indifference is worth showing; but a drawing in which a stone and a
 * cart cannot be told apart is a drawing that has stopped answering the
 * question it was asked.
 */
export function drawCable(ax, points, opt = {}) {
  const {
    colour = COLOR_ORDER[0], weights = null, weightScale = 0,
    forces = null, widthFactor = 12, kinds = null,
    blockColour = COLOR_ORDER[0], loadColour = COLOR_ORDER[1],
  } = opt;
  if (!points || points.length < 2) return;
  ax.clipped((c) => {
    // The tension, segment by segment, exactly as drawThrustLine draws the
    // compression: width against the largest, at the same factor.
    if (forces && forces.length) {
      const peak = Math.max(...forces.map(Math.abs)) || 1;
      c.lineCap = 'butt';
      c.globalAlpha = 0.45;
      c.strokeStyle = colour;
      for (let i = 0; i + 1 < points.length; i++) {
        const f = forces[i] !== undefined ? Math.abs(forces[i]) : peak;
        const [x0, y0] = ax.toPx(points[i]);
        const [x1, y1] = ax.toPx(points[i + 1]);
        c.beginPath();
        c.moveTo(x0, y0);
        c.lineTo(x1, y1);
        c.lineWidth = Math.max(1.5, (f / peak) * widthFactor);
        c.stroke();
      }
      c.globalAlpha = 1;
    }

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
        c.lineWidth = 1.2;
        weights.forEach((w, i) => {
          // The cable has one more vertex than there are weights: the load at
          // a station sits on the vertex that follows it.
          const p = points[i + 1] ?? points[points.length - 1];
          const [X, Y] = ax.toPx(p);
          const r = weightScale * Math.sqrt(Math.abs(w) / peak);
          if (!(r > 0.5)) return;
          const tint = kinds && kinds[i] === 1 ? loadColour : blockColour;
          c.strokeStyle = tint;
          c.fillStyle = rgba(tint, 0.18);
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
    constructionLines = true,
    reactions = false, reactionLabels = null,
  } = opt;
  const { stations, pole } = fp;
  const c = ax.ctx;

  ax.clipped(() => {
    // The definitive rays, pole to every division. These are the actual force
    // polygon and stay visible; the toggle below only hides the trial rays.
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
      if (constructionLines) {
        c.setLineDash([3, 4]);
        c.strokeStyle = 'rgba(162,20,47,0.45)';
        c.lineWidth = 0.9;
        for (const s of stations) {
          const [x1, y1] = ax.toPx([0, s]);
          c.beginPath();
          c.moveTo(tx, ty);
          c.lineTo(x1, y1);
          c.stroke();
        }
        c.setLineDash([]);
      }
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
        c.fillStyle = '#666';
        c.font = '12px Helvetica, Arial, sans-serif';
        c.fillText("O' trial pole", tx + 7, ty);
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
