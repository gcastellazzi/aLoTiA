/**
 * The chequered bar that says how big the thing on screen is.
 *
 * WHY BOTH PANES CARRY ONE. A drawing of an arch with no scale is a shape, not
 * a structure: the axis labels give the numbers, but nothing tells the eye how
 * far apart they are. On a map the answer has been the same for four centuries
 * -- a bar of alternating black and white cells, labelled with a round number
 * -- and it reads at a glance in a way an axis tick never does.
 *
 * The force polygon needs it just as much, and for a reason worth stating: on
 * that drawing every LENGTH IS A FORCE. The load line is the weights laid end
 * to end and the pole's abscissa is the horizontal thrust, so the bar there is
 * measured in kN, not in metres. Two bars, one length and one force, on axes
 * that are both kept equal, and the same construction serves both.
 *
 * THE ROUND NUMBER. A scale bar whose label reads "3.47 m" is worse than none:
 * the point is a number the eye can carry. The bar is therefore the largest
 * value on the 1-2-5 ladder that fits inside about a fifth of the box, which
 * is the same ladder the axis ticks are chosen on, so the two never disagree.
 *
 * WHAT IT SAYS WHEN THERE IS NOTHING TO SAY. An arch that has not been scaled
 * is in pixels, and a bar reading "200 px" is honest and useful -- it is the
 * only warning on the drawing that the numbers are not yet metres. The force
 * bar on an unscaled arch is labelled the same way the panels label it,
 * "(unscaled)", rather than being given a unit it has not earned.
 */

/** The 1-2-5 ladder, as the ticks use it. */
export function niceLength(raw) {
  if (!(raw > 0) || !isFinite(raw)) return null;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm >= 5 ? 5 : norm >= 2 ? 2 : 1;
  return step * mag;
}

/**
 * What the bar should measure, and how wide that comes out on screen.
 *
 * Split out from the drawing so it can be tested without a canvas: this is
 * where the bar is either right or wrong, and the rest is paint.
 *
 * @returns {{span:number, widthPx:number}|null} null when no round value fits
 */
export function barSpan(unitsPerPixel, boxWidthPx, fraction = 0.22) {
  const u = Math.abs(unitsPerPixel);
  if (!(u > 0) || !isFinite(u) || !(boxWidthPx > 0)) return null;
  const span = niceLength(u * boxWidthPx * fraction);
  if (!span) return null;
  const widthPx = span / u;
  if (!(widthPx > 24) || widthPx > boxWidthPx * 0.8) return null;
  return { span, widthPx };
}

/** As many decimals as the value needs and no more. */
export function barLabel(value, unit) {
  const a = Math.abs(value);
  const text = a >= 1e5 || (a > 0 && a < 1e-3)
    ? value.toExponential(1)
    : String(Number(value.toPrecision(3)));
  return unit ? `${text} ${unit}` : text;
}

/**
 * Draw the bar in the bottom-right corner of an Axes.
 *
 * NOT CLIPPED TO THE PLOTTING BOX, and not drawn in data coordinates: the bar
 * is furniture, like the ticks. It has to stay in its corner while the view is
 * panned and keep its length while the view is zoomed, which means measuring
 * the box in pixels each time and converting once.
 *
 * @param {object} ax        the Axes to draw on
 * @param {object} [opt]
 * @param {string} [opt.unit]      what one data unit is called, e.g. 'm', 'kN'
 * @param {number} [opt.fraction]  how much of the box the bar may take
 * @param {number} [opt.cells]     how many alternating cells
 */
export function drawScaleBar(ax, opt = {}) {
  const {
    unit = '', fraction = 0.22, cells = 4,
    margin = 10, height = 7, dark = '#262626', light = '#ffffff',
  } = opt;

  const b = ax.box;
  if (!(b.w > 60) || !(b.h > 40)) return null;      // no room to be legible

  const got = barSpan(ax.unitsPerPixel, b.w, fraction);
  if (!got) return null;
  const { span, widthPx } = got;

  const c = ax.ctx;
  const text = barLabel(span, unit);

  c.save();
  c.font = '10px Helvetica, Arial, sans-serif';
  c.textBaseline = 'alphabetic';

  const textW = c.measureText(text).width;
  const boxW = Math.max(widthPx, textW) + 12;
  const boxH = height + 18;
  const right = b.x + b.w - margin;
  const bottom = b.y + b.h - margin;
  const left = right - boxW;
  const top = bottom - boxH;

  // A panel behind it, or the bar disappears over the arch it is measuring.
  c.globalAlpha = 0.82;
  c.fillStyle = '#ffffff';
  c.fillRect(left, top, boxW, boxH);
  c.globalAlpha = 1;
  c.strokeStyle = 'rgba(38, 38, 38, 0.35)';
  c.lineWidth = 1;
  c.strokeRect(left + 0.5, top + 0.5, boxW - 1, boxH - 1);

  // The chequer, drawn from the right so the bar ends where the box does.
  const x0 = right - 6 - widthPx;
  const y0 = top + 6;
  const cell = widthPx / cells;
  for (let i = 0; i < cells; i++) {
    c.fillStyle = i % 2 ? light : dark;
    c.fillRect(x0 + i * cell, y0, cell, height);
  }
  c.strokeStyle = dark;
  c.strokeRect(x0 + 0.5, y0 + 0.5, widthPx - 1, height - 1);

  c.fillStyle = dark;
  c.textAlign = 'right';
  c.fillText(text, right - 6, y0 + height + 11);
  c.restore();

  return { span, widthPx, unit };
}
