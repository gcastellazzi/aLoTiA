/**
 * Rectifying the background photograph: a real projective map, drawn once.
 *
 * WHAT WAS WRONG BEFORE, AND WHY IT STRIPED. The first implementation cut the
 * image into horizontal strips and drew each with its own affine transform
 * under a clip path. That produces visible banding for two independent
 * reasons, and both are structural rather than a matter of tuning:
 *
 *   THE SEAMS. A clip path is anti-aliased along its edges, so the last row of
 *   one strip and the first row of the next are each drawn at partial
 *   coverage. Composited at an alpha below 1 they do not sum back to 1: where
 *   the strips overlap the result is darker than the picture, where they fall
 *   a fraction of a pixel apart it is lighter. Either way the boundary is
 *   visible, once per strip, all the way down the image.
 *
 *   THE GEOMETRY. An affine map cannot represent a perspective. Strips
 *   approximate one by making the error piecewise constant, which means a
 *   straight line in the photograph -- a string course, the edge of a pier --
 *   comes out as a polyline with a kink at every strip boundary. More strips
 *   makes each kink smaller and the number of seams larger. There is no
 *   setting at which both are acceptable.
 *
 * WHAT THIS DOES INSTEAD. It computes the homography that carries the image
 * rectangle onto the quadrilateral, inverts it, and for every destination
 * pixel samples the source at the point that maps there, bilinearly. One
 * image, one `drawImage`, no clip paths and no seams; and because the map is
 * projective rather than piecewise affine, straight lines stay straight.
 *
 * IT IS NOT DONE EVERY FRAME. The result depends on the photograph, the
 * quadrilateral and the size on screen, and on nothing else -- not on the
 * arch, the thrust line or the zoom of any other pane. It is cached against
 * exactly those, so panning and redrawing cost nothing and only dragging a
 * perspective slider recomputes.
 */

/**
 * The homography taking the unit square to a quadrilateral.
 *
 * (0,0) -> p0, (1,0) -> p1, (1,1) -> p2, (0,1) -> p3, after Heckbert. The
 * degenerate case where the quadrilateral is a parallelogram is affine and is
 * taken separately, because the general expression divides by zero there.
 *
 * @returns {number[]} [a, b, c, d, e, f, g, h] with the ninth entry 1
 */
export function unitSquareTo(p0, p1, p2, p3) {
  const dx1 = p1[0] - p2[0];
  const dx2 = p3[0] - p2[0];
  const dx3 = p0[0] - p1[0] + p2[0] - p3[0];
  const dy1 = p1[1] - p2[1];
  const dy2 = p3[1] - p2[1];
  const dy3 = p0[1] - p1[1] + p2[1] - p3[1];

  if (Math.abs(dx3) < 1e-12 && Math.abs(dy3) < 1e-12) {
    return [p1[0] - p0[0], p3[0] - p0[0], p0[0],
      p1[1] - p0[1], p3[1] - p0[1], p0[1], 0, 0];
  }
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-12) return null;      // three corners collinear
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h = (dx1 * dy3 - dx3 * dy1) / den;
  return [
    p1[0] - p0[0] + g * p1[0], p3[0] - p0[0] + h * p3[0], p0[0],
    p1[1] - p0[1] + g * p1[1], p3[1] - p0[1] + h * p3[1], p0[1],
    g, h,
  ];
}

/** The inverse of [a,b,c,d,e,f,g,h,1], as the same eight-plus-one form. */
export function invert(m) {
  if (!m) return null;
  const [a, b, c, d, e, f, g, h] = m;
  const A = e - f * h;
  const B = c * h - b;
  const C = b * f - c * e;
  const D = f * g - d;
  const E = a - c * g;
  const F = c * d - a * f;
  const G = d * h - e * g;
  const H = b * g - a * h;
  const I = a * e - b * d;
  const det = a * A + b * D + c * G;
  if (Math.abs(det) < 1e-12) return null;
  return [A / det, B / det, C / det, D / det, E / det, F / det,
    G / det, H / det, I / det];
}

/** Apply a 3x3 (given as nine numbers) to a point, dividing through. */
function apply(m, x, y) {
  const w = m[6] * x + m[7] * y + m[8];
  if (w === 0) return null;
  return [(m[0] * x + m[1] * y + m[2]) / w,
    (m[3] * x + m[4] * y + m[5]) / w];
}

/** The pixels of an image, once, so a redraw does not decode it again. */
const pixelCache = new WeakMap();

function pixelsOf(img) {
  let got = pixelCache.get(img);
  if (got) return got;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = iw;
  c.height = ih;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  try {
    got = { data: x.getImageData(0, 0, iw, ih).data, w: iw, h: ih };
  } catch {
    // A cross-origin photograph taints the canvas and cannot be read back.
    // The caller falls back to drawing it unrectified rather than failing.
    got = null;
  }
  pixelCache.set(img, got);
  return got;
}

const warpCache = new WeakMap();

/**
 * The photograph mapped onto a quadrilateral, as a canvas ready to be drawn.
 *
 * @param {HTMLImageElement} img
 * @param {object} corners  {tl, tr, br, bl} in destination pixels
 * @param {object} [opt]    `flipY` reflects the source vertically, as the
 *                          model frame requires; `maxPixels` caps the work
 * @returns {{canvas, x, y}|null} null when the image cannot be read
 */
export function warpToQuad(img, corners, opt = {}) {
  const { flipY = false, maxPixels = 4e6 } = opt;
  const src = pixelsOf(img);
  if (!src) return null;

  const { tl, tr, br, bl } = corners;
  const xs = [tl[0], tr[0], br[0], bl[0]];
  const ys = [tl[1], tr[1], br[1], bl[1]];
  const x0 = Math.floor(Math.min(...xs));
  const y0 = Math.floor(Math.min(...ys));
  const W = Math.ceil(Math.max(...xs)) - x0;
  const H = Math.ceil(Math.max(...ys)) - y0;
  if (!(W > 0) || !(H > 0)) return null;

  const key = [x0, y0, W, H, flipY, ...xs, ...ys].join(',');
  const hit = warpCache.get(img);
  if (hit && hit.key === key) return hit.value;

  // A very large destination is not worth the wait at interactive rates; it
  // is rendered smaller and scaled up on the way out, which the eye forgives
  // far more readily than banding.
  const shrink = Math.min(1, Math.sqrt(maxPixels / (W * H)));
  const dw = Math.max(1, Math.round(W * shrink));
  const dh = Math.max(1, Math.round(H * shrink));

  const forward = unitSquareTo(
    [tl[0] - x0, tl[1] - y0], [tr[0] - x0, tr[1] - y0],
    [br[0] - x0, br[1] - y0], [bl[0] - x0, bl[1] - y0],
  );
  const inv = invert(forward);
  if (!inv) return null;

  const out = document.createElement('canvas');
  out.width = dw;
  out.height = dh;
  const octx = out.getContext('2d');
  const dst = octx.createImageData(dw, dh);
  const D = dst.data;
  const S = src.data;
  const sw = src.w;
  const sh = src.h;

  for (let py = 0; py < dh; py++) {
    // Sample at pixel centres, in the un-shrunk destination frame.
    const dy = (py + 0.5) / shrink;
    for (let px = 0; px < dw; px++) {
      const dx = (px + 0.5) / shrink;
      const uv = apply(inv, dx, dy);
      if (!uv) continue;
      let [u, v] = uv;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;   // outside the quad
      if (flipY) v = 1 - v;

      // Bilinear, which is what keeps a rectified photograph from looking
      // like a mosaic when it is stretched.
      const fx = u * (sw - 1);
      const fy = v * (sh - 1);
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const ix1 = Math.min(ix + 1, sw - 1);
      const iy1 = Math.min(iy + 1, sh - 1);
      const i00 = (iy * sw + ix) * 4;
      const i10 = (iy * sw + ix1) * 4;
      const i01 = (iy1 * sw + ix) * 4;
      const i11 = (iy1 * sw + ix1) * 4;
      const w00 = (1 - tx) * (1 - ty);
      const w10 = tx * (1 - ty);
      const w01 = (1 - tx) * ty;
      const w11 = tx * ty;
      const o = (py * dw + px) * 4;
      for (let k = 0; k < 4; k++) {
        D[o + k] = S[i00 + k] * w00 + S[i10 + k] * w10
          + S[i01 + k] * w01 + S[i11 + k] * w11;
      }
    }
  }
  octx.putImageData(dst, 0, 0);

  const value = { canvas: out, x: x0, y: y0, w: W, h: H };
  warpCache.set(img, { key, value });
  return value;
}
