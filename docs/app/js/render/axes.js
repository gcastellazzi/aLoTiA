/**
 * MATLAB-looking axes on a Canvas.
 *
 * The point of this module is fidelity to the original app: a student who has
 * used the MATLAB version should recognise the drawing immediately. That means
 * the box, the inward ticks, the pale grid, the Helvetica labels and the
 * default colour order, all reproduced rather than approximated by a charting
 * library.
 *
 * It also owns the data-to-pixel transform, including `axis equal`, which for
 * an arch is not cosmetic: the thrust line only means anything if x and y are
 * at the same scale.
 */

/** MATLAB's default axes colour order, in the order it hands them out. */
export const COLOR_ORDER = [
  '#0072BD', '#D95319', '#EDB120', '#7E2F8E',
  '#77AC30', '#4DBEEE', '#A2142F',
];

/** The greys MATLAB uses for the box, the ticks and the grid. */
export const AXES_COLOR = '#262626';
export const GRID_COLOR = '#262626';
export const GRID_ALPHA = 0.15;
export const FONT = '10px Helvetica, Arial, sans-serif';

/**
 * A drawing surface with a data coordinate system.
 *
 * Construct one per canvas, call `fit` when the data changes and `begin` at
 * the start of every frame.
 */
export class Axes {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opt
   * @param {number[]} opt.margin  [left, top, right, bottom] in CSS pixels
   * @param {boolean} opt.equal    keep x and y at the same scale
   * @param {boolean} opt.yUp      true for maths, false for image coordinates
   */
  constructor(canvas, opt = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.margin = opt.margin ?? [52, 18, 18, 40];
    this.equal = opt.equal ?? true;
    this.yUp = opt.yUp ?? true;
    this.view = { xmin: 0, xmax: 1, ymin: 0, ymax: 1 };
    this.title = '';
    this.xlabel = '';
    this.ylabel = '';
    this.fontScale = opt.fontScale ?? 1;
  }

  /** Device pixels per CSS pixel, so the drawing is sharp on a retina screen. */
  syncSize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
    const changed = this.width !== rect.width || this.height !== rect.height;
    this.width = rect.width;
    this.height = rect.height;

    // THE MOMENT THE BOX CHANGES SHAPE, the view has to be re-equalized: not
    // at the next frame, but now, because a pointer position may be converted
    // to data coordinates before anything is redrawn. The case that caught
    // this was a scrollbar appearing after the first draw -- the box narrowed,
    // no redraw followed, and the first click of a trace landed through a
    // stale transform. A traced semicircle came back with a rise-to-span of
    // 0.548 instead of 0.500, and every scaled length was wrong with it.
    if (changed) this.reequalize();
  }

  /** The plotting rectangle, in CSS pixels. */
  get box() {
    const [l, t, r, b] = this.margin;
    return { x: l, y: t, w: this.width - l - r, h: this.height - t - b };
  }

  /** Set the view to these data bounds, with a margin, honouring `equal`. */
  /**
   * Frame the given bounds.
   *
   * `only` picks which extent decides the scale when the axes are equal:
   * omitted, both are honoured and the content is letterboxed; 'x' fills the
   * width and lets the height fall where it may; 'y' the reverse. It is the
   * difference between "fit" and "fit width" as a drawing program means them,
   * and it cannot be had by scaling the bounds because equal scales couple the
   * two directions.
   */
  fit(bounds, pad = 0.06, only = null) {
    let { xmin, xmax, ymin, ymax } = bounds;
    if (!(isFinite(xmin) && isFinite(xmax))) return;
    let dx = xmax - xmin || 1;
    let dy = ymax - ymin || 1;
    xmin -= dx * pad; xmax += dx * pad;
    ymin -= dy * pad; ymax += dy * pad;

    if (this.equal) {
      const b = this.box;
      dx = xmax - xmin;
      dy = ymax - ymin;
      const sx = b.w / dx;
      const sy = b.h / dy;
      const s = only === 'x' ? sx : only === 'y' ? sy : Math.min(sx, sy);
      const cx = (xmin + xmax) / 2;
      const cy = (ymin + ymax) / 2;
      const halfW = b.w / s / 2;
      const halfH = b.h / s / 2;
      xmin = cx - halfW; xmax = cx + halfW;
      ymin = cy - halfH; ymax = cy + halfH;
    }
    this.view = { xmin, xmax, ymin, ymax };
  }

  /**
   * Restore equal x and y scales after the box has changed shape.
   *
   * `fit` establishes the equal aspect, but a window resize changes the box
   * without touching the view, and from then on the two axes are at different
   * scales: a traced semicircle comes back with a rise-to-span of 0.554
   * instead of 0.5, and every length read off the drawing is wrong in one
   * direction. Called on resize, this keeps the centre and widens whichever
   * extent is now too small.
   */
  reequalize() {
    if (!this.equal) return;
    const b = this.box;
    if (!(b.w > 0 && b.h > 0)) return;
    const v = this.view;
    const dx = v.xmax - v.xmin;
    const dy = v.ymax - v.ymin;
    if (!(dx > 0 && dy > 0)) return;

    const want = b.w / b.h;          // the aspect the view must have
    const have = dx / dy;
    if (Math.abs(want - have) < 1e-9) return;

    const cx = (v.xmin + v.xmax) / 2;
    const cy = (v.ymin + v.ymax) / 2;
    if (have < want) {
      const half = (dy * want) / 2;
      this.view = { xmin: cx - half, xmax: cx + half, ymin: v.ymin, ymax: v.ymax };
    } else {
      const half = dx / want / 2;
      this.view = { xmin: v.xmin, xmax: v.xmax, ymin: cy - half, ymax: cy + half };
    }
  }

  /** Data -> CSS pixels. */
  toPx(p) {
    const b = this.box;
    const { xmin, xmax, ymin, ymax } = this.view;
    const x = b.x + ((p[0] - xmin) / (xmax - xmin)) * b.w;
    const f = (p[1] - ymin) / (ymax - ymin);
    const y = this.yUp ? b.y + b.h - f * b.h : b.y + f * b.h;
    return [x, y];
  }

  /** CSS pixels -> data. */
  toData(q) {
    const b = this.box;
    const { xmin, xmax, ymin, ymax } = this.view;
    const x = xmin + ((q[0] - b.x) / b.w) * (xmax - xmin);
    const f = this.yUp ? (b.y + b.h - q[1]) / b.h : (q[1] - b.y) / b.h;
    return [x, ymin + f * (ymax - ymin)];
  }

  /** Data units per pixel, for sizing things that must not scale with zoom. */
  get unitsPerPixel() {
    return (this.view.xmax - this.view.xmin) / this.box.w;
  }

  /** Pan by a pixel delta. */
  pan(dxPx, dyPx) {
    const u = this.unitsPerPixel;
    const v = this.view;
    const dy = (this.view.ymax - this.view.ymin) / this.box.h;
    this.view = {
      xmin: v.xmin - dxPx * u, xmax: v.xmax - dxPx * u,
      ymin: v.ymin + (this.yUp ? dyPx * dy : -dyPx * dy),
      ymax: v.ymax + (this.yUp ? dyPx * dy : -dyPx * dy),
    };
  }

  /** Zoom about a point given in CSS pixels. */
  zoomAt(q, factor) {
    const [cx, cy] = this.toData(q);
    const v = this.view;
    this.view = {
      xmin: cx + (v.xmin - cx) * factor,
      xmax: cx + (v.xmax - cx) * factor,
      ymin: cy + (v.ymin - cy) * factor,
      ymax: cy + (v.ymax - cy) * factor,
    };
  }

  /** Clear, scale for the device, and clip to the plotting box. */
  begin() {
    this.syncSize();
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.width, this.height);
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, this.width, this.height);
  }

  /** Run a drawing function with everything clipped to the axes box. */
  clipped(fn) {
    const c = this.ctx;
    const b = this.box;
    c.save();
    c.beginPath();
    c.rect(b.x, b.y, b.w, b.h);
    c.clip();
    fn(c);
    c.restore();
  }

  /**
   * The furniture: grid, box, ticks, labels.
   *
   * Drawn last, over the data, exactly as MATLAB layers it -- which is why a
   * curve never spills across the box edge.
   */
  decorate() {
    const c = this.ctx;
    const b = this.box;
    const xt = niceTicks(this.view.xmin, this.view.xmax, 7);
    const yt = niceTicks(this.view.ymin, this.view.ymax, 6);

    c.save();
    c.lineWidth = 0.5;
    const tickFont = `${10 * this.fontScale}px Helvetica, Arial, sans-serif`;
    const titleFont = `bold ${12 * this.fontScale}px Helvetica, Arial, sans-serif`;
    const labelFont = `${10 * this.fontScale}px Helvetica, Arial, sans-serif`;
    c.font = tickFont;

    // Grid.
    c.globalAlpha = GRID_ALPHA;
    c.strokeStyle = GRID_COLOR;
    c.beginPath();
    for (const t of xt) {
      const x = Math.round(this.toPx([t, 0])[0]) + 0.5;
      if (x < b.x || x > b.x + b.w) continue;
      c.moveTo(x, b.y); c.lineTo(x, b.y + b.h);
    }
    for (const t of yt) {
      const y = Math.round(this.toPx([0, t])[1]) + 0.5;
      if (y < b.y || y > b.y + b.h) continue;
      c.moveTo(b.x, y); c.lineTo(b.x + b.w, y);
    }
    c.stroke();
    c.globalAlpha = 1;

    // Box.
    c.strokeStyle = AXES_COLOR;
    c.strokeRect(Math.round(b.x) + 0.5, Math.round(b.y) + 0.5,
      Math.round(b.w), Math.round(b.h));

    // Ticks, inward, and their labels.
    c.fillStyle = AXES_COLOR;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.beginPath();
    for (const t of xt) {
      const x = Math.round(this.toPx([t, 0])[0]) + 0.5;
      if (x < b.x || x > b.x + b.w) continue;
      c.moveTo(x, b.y + b.h); c.lineTo(x, b.y + b.h - 5);
      c.moveTo(x, b.y); c.lineTo(x, b.y + 5);
      c.fillText(fmtTick(t, xt), x, b.y + b.h + 6);
    }
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    for (const t of yt) {
      const y = Math.round(this.toPx([0, t])[1]) + 0.5;
      if (y < b.y || y > b.y + b.h) continue;
      c.moveTo(b.x, y); c.lineTo(b.x + 5, y);
      c.moveTo(b.x + b.w, y); c.lineTo(b.x + b.w - 5, y);
      c.fillText(fmtTick(t, yt), b.x - 7, y);
    }
    c.stroke();

    // Title and axis labels.
    if (this.title) {
      c.font = titleFont;
      c.textAlign = 'center';
      c.textBaseline = 'bottom';
      c.fillText(this.title, b.x + b.w / 2, b.y - 4);
      c.font = labelFont;
    }
    if (this.xlabel) {
      c.font = labelFont;
      c.textAlign = 'center';
      c.textBaseline = 'bottom';
      c.fillText(this.xlabel, b.x + b.w / 2, this.height - 4);
    }
    if (this.ylabel) {
      c.save();
      c.translate(11, b.y + b.h / 2);
      c.rotate(-Math.PI / 2);
      c.font = labelFont;
      c.textAlign = 'center';
      c.textBaseline = 'top';
      c.fillText(this.ylabel, 0, 0);
      c.restore();
    }
    c.restore();
  }
}

/** Tick positions on the 1-2-5 ladder, as MATLAB chooses them. */
export function niceTicks(lo, hi, target = 7) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const first = Math.ceil(lo / step) * step;
  const out = [];
  for (let t = first; t <= hi + step * 1e-9; t += step) {
    out.push(Math.abs(t) < step * 1e-9 ? 0 : t);
  }
  return out;
}

/** Tick label with just enough decimals to tell neighbouring ticks apart. */
function fmtTick(t, ticks) {
  const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : Math.abs(t);
  if (step === 0) return String(t);
  const d = Math.max(0, -Math.floor(Math.log10(step)) + 0);
  if (Math.abs(t) >= 1e5 || (t !== 0 && Math.abs(t) < 1e-3)) {
    return t.toExponential(1);
  }
  return t.toFixed(Math.min(6, d));
}
