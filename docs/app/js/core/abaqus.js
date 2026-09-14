import { area, piecesOf, signedArea } from './geometry.js';

function key3(p) {
  return p.map((v) => Number(v).toPrecision(12)).join(',');
}

function det3(a, b, c) {
  return a[0] * (b[1] * c[2] - b[2] * c[1])
    - a[1] * (b[0] * c[2] - b[2] * c[0])
    + a[2] * (b[0] * c[1] - b[1] * c[0]);
}

function tetVolume(a, b, c, d) {
  return det3(
    [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
    [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
    [d[0] - a[0], d[1] - a[1], d[2] - a[2]],
  ) / 6;
}

function fmt(v) {
  if (!Number.isFinite(v)) return '0.';
  return Math.abs(v) >= 1e5 || (Math.abs(v) > 0 && Math.abs(v) < 1e-5)
    ? v.toExponential(8)
    : Number(v.toPrecision(10)).toString();
}

function linesOf(list, perLine = 12) {
  const out = [];
  for (let i = 0; i < list.length; i += perLine) {
    out.push(list.slice(i, i + perLine).join(', '));
  }
  return out;
}

function tetBlockMesh(faces) {
  const nodes = [];
  const seen = new Map();
  const nodeId = (p) => {
    const key = key3(p);
    if (seen.has(key)) return seen.get(key);
    const id = nodes.length + 1;
    seen.set(key, id);
    nodes.push(p.slice());
    return id;
  };

  for (const face of faces) {
    for (const p of face) nodeId(p);
  }
  const centre = [0, 0, 0];
  for (const p of nodes) {
    centre[0] += p[0]; centre[1] += p[1]; centre[2] += p[2];
  }
  centre[0] /= nodes.length || 1;
  centre[1] /= nodes.length || 1;
  centre[2] /= nodes.length || 1;
  const centreId = nodeId(centre);

  const elements = [];
  const exterior = [];
  const addTet = (tri) => {
    const ids = [centreId, ...tri.map(nodeId)];
    const pts = ids.map((id) => nodes[id - 1]);
    if (Math.abs(tetVolume(pts[0], pts[1], pts[2], pts[3])) < 1e-12) return;
    if (tetVolume(pts[0], pts[1], pts[2], pts[3]) < 0) {
      [ids[2], ids[3]] = [ids[3], ids[2]];
    }
    elements.push({ type: 'C3D4', ids });
    exterior.push({ element: elements.length, side: 'S3' });
  };

  for (const face of faces) {
    if (face.length === 3) addTet(face);
    else {
      for (let i = 1; i + 1 < face.length; i++) {
        addTet([face[0], face[i], face[i + 1]]);
      }
    }
  }

  const volume = elements.reduce((sum, e) => {
    const pts = e.ids.map((id) => nodes[id - 1]);
    return sum + Math.abs(tetVolume(pts[0], pts[1], pts[2], pts[3]));
  }, 0);

  return compactMesh({ nodes, elements, exterior, contact: exterior.slice(), volume });
}


/**
 * Triangulating a voussoir outline, including the concave ones.
 *
 * THE BUG THIS REPLACES. The outline used to be triangulated as a fan from its
 * first vertex: triangles (0, i, i+1) for every i. A fan is correct only for a
 * CONVEX polygon. A voussoir cut radially from a traced profile is frequently
 * not convex --- a re-entrant corner is enough --- and for those the fan
 * produces triangles that lie partly outside the outline and, worse, some that
 * are wound the other way. Extruded, an inverted triangle becomes a wedge of
 * NEGATIVE volume, which is what Abaqus refuses with
 * "The volume of N elements is zero, small, or negative".
 *
 * The old code took the absolute value of each triangle's area, so the total
 * volume it reported came out plausible while the elements it wrote were
 * unusable. Taking the modulus of a signed quantity is how the fault stayed
 * invisible: the sign was the evidence.
 *
 * Ear clipping is correct for any simple polygon and costs nothing at these
 * sizes --- a voussoir has tens of vertices, not thousands.
 *
 * @param {number[][]} pts  the outline, counter-clockwise, without a repeat
 * @returns {number[][]} triples of indices into `pts`
 */
export function earClip(pts) {
  const n = pts.length;
  if (n < 3) return [];
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1])
    - (a[1] - o[1]) * (b[0] - o[0]);

  const inTriangle = (p, a, b, c) => {
    const d1 = cross(a, b, p);
    const d2 = cross(b, c, p);
    const d3 = cross(c, a, p);
    const neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    return !(neg && pos);
  };

  const idx = [...Array(n).keys()];
  const out = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 4 * n) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length];
      const i1 = idx[k];
      const i2 = idx[(k + 1) % idx.length];
      const a = pts[i0];
      const b = pts[i1];
      const c = pts[i2];
      if (cross(a, b, c) <= 0) continue;            // reflex or degenerate
      let clear = true;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (inTriangle(pts[j], a, b, c)) { clear = false; break; }
      }
      if (!clear) continue;
      out.push([i0, i1, i2]);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    // A self-intersecting or otherwise unclippable outline: fall back to the
    // fan for what is left rather than looping, and let the volume check
    // downstream reject anything it produces that is not usable.
    if (!clipped) break;
  }
  if (idx.length >= 3) {
    for (let i = 1; i + 1 < idx.length; i++) {
      out.push([idx[0], idx[i], idx[i + 1]]);
    }
  }
  return out;
}

/**
 * The signed volume of a C3D6 wedge, as Abaqus will compute it.
 *
 * A prism 1-2-3 / 4-5-6 splits into three tetrahedra. If the sum is negative
 * the element is inside out and the two triangular faces must be exchanged;
 * if it is nearly zero the element is degenerate and must not be written at
 * all. Checking this here rather than trusting the construction is the point:
 * the previous code trusted it and was wrong.
 */
export function wedgeVolume(p) {
  const [a, b, c, d, e, f] = p;
  return tetVolume(a, b, c, d) + tetVolume(b, c, d, e) + tetVolume(c, d, e, f);
}

/**
 * Put a node where a support or a load acts, even when it acts off the block.
 *
 * A and B are picked on the drawing and need not land on a vertex --- and when
 * an end is imposed outside the ring they need not land on the block at all.
 * Attaching the boundary condition to whatever node happens to be nearest
 * moves it, silently, by however far that is. Instead the point is projected
 * onto the outline and the projection is inserted as a vertex, so a node
 * exists exactly where the condition is applied.
 *
 * The point is left alone when it is already within `tol` of a vertex, since
 * inserting a duplicate would make a zero-length edge and a degenerate
 * element --- the very fault this file is otherwise fixing.
 *
 * @returns {{pts: number[][], inserted: boolean, distance: number}}
 */
export function insertOutlinePoint(pts, p, tol = 1e-9) {
  if (!p || pts.length < 3) return { pts, inserted: false, distance: Infinity };

  let best = { d: Infinity, at: -1, q: null };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    let t = len2 ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const q = [a[0] + t * vx, a[1] + t * vy];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < best.d) best = { d, at: i, q, t };
  }
  if (best.at < 0) return { pts, inserted: false, distance: Infinity };

  // Already a vertex, to within tolerance: nothing to insert.
  for (const v of pts) {
    if (Math.hypot(v[0] - best.q[0], v[1] - best.q[1]) <= tol) {
      return { pts, inserted: false, distance: best.d };
    }
  }
  const out = pts.slice();
  out.splice(best.at + 1, 0, best.q);
  return { pts: out, inserted: true, distance: best.d };
}

function profilePoints(poly) {
  const pts = poly.x.map((x, i) => [x, poly.y[i]]);
  return signedArea(poly) >= 0 ? pts : pts.slice().reverse();
}


/**
 * The volume of a C3D8 hexahedron, by the six-tetrahedron decomposition.
 *
 * As with the wedge, this is computed rather than assumed: a structured grid
 * on a curved voussoir can still invert where the outline doubles back, and an
 * element that Abaqus rejects should be caught here.
 */
export function hexVolume(p) {
  const t = (a, b, c, d) => tetVolume(p[a], p[b], p[c], p[d]);
  return t(0, 1, 2, 6) + t(0, 2, 3, 6) + t(0, 3, 7, 6)
    + t(0, 7, 4, 6) + t(0, 4, 5, 6) + t(0, 5, 1, 6);
}

/**
 * Which edges of an outline lie on a joint, and on which of the two.
 *
 * THIS IS WHAT THE CONTACT WAS MISSING. The contact surface used to be the
 * whole outline of the voussoir --- intrados, extrados and both joint faces
 * together. Two consequences, and Abaqus reported both:
 *
 *   "facets found to be facing in the wrong direction with respect to the main
 *   surface": the intrados and extrados faces of one block are in the surface
 *   but face nothing on the neighbour, and their normals oppose the pairing.
 *
 *   "unconnected regions": with the true joint faces buried in a surface an
 *   order of magnitude larger, the solver's pairing search fails to close some
 *   joints at all and those blocks become free bodies --- which is also where
 *   the negative eigenvalues come from, one rigid-body mode per unclosed joint.
 *
 * A voussoir touches its neighbours on exactly two faces, and only those two
 * belong in a contact surface. They are identified geometrically, by testing
 * each outline edge against the two joint segments that bound the block, so
 * this works for a traced or radially cut outline and does not assume the
 * vertex order of a generated one.
 *
 * @returns {Map<string, 'lo'|'hi'>} keyed "i,j" for the edge from vertex i to j
 */
export function jointEdges(pts, joints, tol) {
  const marks = new Map();
  if (!joints || !joints.length) return marks;

  // Perpendicular distance to the joint's LINE, and where the foot falls along
  // it. NOT the distance to the segment: a joint recovered from two blocks is
  // their overlap, so where the neighbour is the thinner of the two the joint
  // is SHORTER than the face it lies on, and the far end of that face would
  // measure its own overshoot and be rejected.
  const onLine = (q, a, b) => {
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    if (!(len2 > 0)) return { d: Infinity, t: 0 };
    return {
      d: Math.abs((q[0] - a[0]) * vy - (q[1] - a[1]) * vx) / Math.sqrt(len2),
      t: ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / len2,
    };
  };

  // How well one edge lies on one joint: the worst perpendicular offset of its
  // two ends and its midpoint, and Infinity if it does not overlap the joint
  // at all.
  const score = (i, seg) => {
    const j = (i + 1) % pts.length;
    const mid = [(pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2];
    const rows = [pts[i], pts[j], mid].map((q) => onLine(q, seg.a, seg.b));
    const lo = Math.min(...rows.map((r) => r.t));
    const hi = Math.max(...rows.map((r) => r.t));
    if (hi < -0.25 || lo > 1.25) return Infinity;
    return Math.max(...rows.map((r) => r.d));
  };

  // A FIXED TOLERANCE WILL NOT DO. A joint is recovered from the vertices of
  // two blocks that were traced by hand and do not agree to the pixel, so the
  // face of one of them stands off the joint by a fraction of the joint's own
  // length --- 5% is ordinary, and at the apex of Example_6_Pointed_Arch it is
  // 20%. Judging that against a fraction of the block instead rejected the
  // face and left the block with one joint out of two, which is a block the
  // contact cannot pair. So each joint is matched to the edge that fits it
  // BEST, and the run is grown from there. The limit below is deliberately
  // loose because it only has to separate a face from the intrados and
  // extrados, which stand off by a whole block, not a fraction of a joint.
  const chosen = pts.map(() => ({ which: null, d: Infinity }));

  joints.forEach((seg, k) => {
    if (!seg?.a || !seg?.b) return;
    const which = k === 0 ? 'lo' : 'hi';
    const len = Math.hypot(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]);
    // The seed may stand well off the joint, so it is admitted generously.
    let seed = -1;
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = score(i, seg);
      if (d < best) { best = d; seed = i; }
    }
    if (seed < 0 || !(best <= Math.max(tol, len * 0.25))) return;

    const take = (i, d) => {
      if (d < chosen[i].d) chosen[i] = { which, d };
    };
    take(seed, best);
    // GROWTH IS JUDGED AGAINST THE SEED, not against that generous cap. The
    // seed is the true face, so anything the same joint continues into lies
    // about as flat; a cap wide enough to admit a badly traced seed is also
    // wide enough to swallow the first course of the extrados.
    const limit = Math.max(tol, best * 2, len * 0.02);
    for (const step of [1, -1]) {
      for (let c = 1; c < pts.length; c++) {
        const i = (seed + step * c + pts.length * pts.length) % pts.length;
        const d = score(i, seg);
        if (!(d <= limit)) break;
        take(i, d);
      }
    }
  });

  chosen.forEach((c, i) => {
    if (c.which) marks.set(`${i},${(i + 1) % pts.length}`, c.which);
  });
  return marks;
}

/**
 * The smallest of the eight corner Jacobians of a hexahedron.
 *
 * A POSITIVE TOTAL VOLUME IS NOT ENOUGH. A cell drawn on a concave part of an
 * outline --- a pier of Notre Dame, the apex of a pointed arch --- can have a
 * perfectly good volume and still be turned inside out at one corner, and it
 * is every corner that Abaqus checks. Reported as "the volume of N elements is
 * zero, small, or negative", which is the message this whole exercise began
 * with.
 */
export function hexCornerJacobian(p) {
  const corners = [
    [0, 1, 3, 4], [1, 2, 0, 5], [2, 3, 1, 6], [3, 0, 2, 7],
    [4, 7, 5, 0], [5, 4, 6, 1], [6, 5, 7, 2], [7, 6, 4, 3],
  ];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  let worst = Infinity;
  for (const [o, x, y, z] of corners) {
    worst = Math.min(worst, det3(sub(p[x], p[o]), sub(p[y], p[o]), sub(p[z], p[o])));
  }
  return worst;
}

/** The signed area of a triangle in the plane of the arch. */
function tri2(a, b, c) {
  return ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
}

/**
 * One cell of the structured grid, as a hexahedron where it is well shaped and
 * as two wedges where it is not.
 *
 * Splitting rather than dropping matters: a dropped cell is a VOID inside a
 * voussoir, which the solver will happily run with and which is a worse lie
 * than a coarser element. The diagonal is chosen so that both halves come out
 * the same way round, which is what a concave cell has to be cut along.
 *
 * @param corners {number[][]} node ids [a, b, c, d] on the lower layer and the
 *   same four on the upper, as [[La,Lb,Lc,Ld],[Ua,Ub,Uc,Ud]]
 * @param mark    which sides of the cell are on a boundary
 */
function addQuadCell(mesh, corners, mark, floor) {
  const [[La, Lb, Lc, Ld], [Ua, Ub, Uc, Ud]] = corners;
  const pt = (id) => mesh.nodes[id - 1];
  const flat = (id) => [pt(id)[0], pt(id)[2]];

  const ids = [La, Lb, Lc, Ld, Ua, Ub, Uc, Ud];
  let vol = hexVolume(ids.map(pt));
  if (vol < 0) {
    ids.splice(0, 8, Ua, Ub, Uc, Ud, La, Lb, Lc, Ld);
    vol = hexVolume(ids.map(pt));
  }
  // The corner test is against the same floor as the volume, not against
  // zero: a corner Jacobian of 1e-11 on a model of order one is a sliver that
  // changes sign on the tenth significant digit --- which is exactly what the
  // deck is written to.
  if (vol > floor && hexCornerJacobian(ids.map(pt)) > floor) {
    const exterior = [];
    const contact = [];
    if (mark.bottom) exterior.push('S1');
    if (mark.top) exterior.push('S2');
    if (mark.lo) contact.push(['S3', 'lo']);
    if (mark.hi) contact.push(['S5', 'hi']);
    if (mark.s0) exterior.push('S6');
    if (mark.s1) exterior.push('S4');
    addHex(mesh, ids, vol, { exterior, contact });
    return true;
  }

  // Concave, or inverted at a corner: cut it. The diagonal that works is the
  // one leaving both triangles turning the same way as the cell does.
  const [a, b, c, d] = [flat(La), flat(Lb), flat(Lc), flat(Ld)];
  const total = tri2(a, b, c) + tri2(a, c, d);
  const sign = total >= 0 ? 1 : -1;
  const ok = (t1, t2) => sign * t1 > 0 && sign * t2 > 0;
  let halves = null;
  if (ok(tri2(a, b, c), tri2(a, c, d))) {
    // Diagonal a-c. S3/S4/S5 of a C3D6 are the 1-2, 2-3 and 3-1 edges.
    halves = [
      { ids: [La, Lb, Lc, Ua, Ub, Uc], S3: 'lo', S4: 's1', S5: null },
      { ids: [La, Lc, Ld, Ua, Uc, Ud], S3: null, S4: 'hi', S5: 's0' },
    ];
  } else if (ok(tri2(a, b, d), tri2(b, c, d))) {
    halves = [
      { ids: [La, Lb, Ld, Ua, Ub, Ud], S3: 'lo', S4: null, S5: 's0' },
      { ids: [Lb, Lc, Ld, Ub, Uc, Ud], S3: 's1', S4: 'hi', S5: null },
    ];
  }
  if (!halves) {
    mesh.rejected.push({ ids: ids.slice(), volume: vol });
    return false;
  }

  let added = false;
  for (const half of halves) {
    const w = half.ids.slice();
    let v = wedgeVolume(w.map(pt));
    if (v < 0) {
      w.splice(0, 6, w[3], w[4], w[5], w[0], w[1], w[2]);
      v = wedgeVolume(w.map(pt));
    }
    if (!(v > floor)) {
      mesh.rejected.push({ ids: w, volume: v });
      continue;
    }
    mesh.elements.push({ type: 'C3D6', ids: w });
    const e = mesh.elements.length;
    if (mark.bottom) mesh.exterior.push({ element: e, side: 'S1' });
    if (mark.top) mesh.exterior.push({ element: e, side: 'S2' });
    for (const side of ['S3', 'S4', 'S5']) {
      const role = half[side];
      if (!role) continue;
      if (role === 'lo' || role === 'hi') {
        if (!mark[role]) continue;
        mesh.exterior.push({ element: e, side });
        mesh.contact.push({ element: e, side, which: role });
      } else if (mark[role]) {
        mesh.exterior.push({ element: e, side });
      }
    }
    mesh.volume += v;
    added = true;
  }
  return added;
}

/**
 * The four boundary chains of a voussoir: the two joint faces and the two free
 * faces between them.
 *
 * A voussoir is topologically a quadrilateral even when it is not one
 * geometrically. Its intrados may be traced with a dozen points, and a joint
 * face is split in two the moment a support is imposed part-way along it ---
 * which is exactly what happens at a springing, where A and B are put. Testing
 * for four vertices therefore threw away most real blocks. What matters is not
 * the vertex count but that the outline separates into ONE run of lo-joint
 * edges, ONE run of hi-joint edges, and a free run between them on each side.
 *
 * The hi chain is returned reversed, so that walking lo and hi together crosses
 * the block rather than doubling back: lo[0] and hi[0] are joined by e0, and
 * lo[last] and hi[last] by e1.
 *
 * @returns {{lo, hi, e0, e1}|null} chains of points, or null if not a ring piece
 */
export function ringChains(pts, marks) {
  const n = pts.length;
  if (n < 3 || !marks || marks.size < 2) return null;
  const label = new Array(n).fill(null);
  for (const [k, w] of marks) label[Number(k.split(',')[0])] = w;

  // One contiguous cyclic run of each kind, or the piece is not a voussoir:
  // two separate runs of lo edges mean the outline touches the same joint in
  // two places, and no grid drawn on it would mean anything.
  const runOf = (w) => {
    const all = [];
    for (let i = 0; i < n; i++) if (label[i] === w) all.push(i);
    if (!all.length) return null;
    const starts = all.filter((i) => label[(i - 1 + n) % n] !== w);
    if (starts.length !== 1) return null;
    const run = [];
    for (let c = 0; c < n; c++) {
      const i = (starts[0] + c) % n;
      if (label[i] !== w) break;
      run.push(i);
    }
    return run.length === all.length ? run : null;
  };
  const lo = runOf('lo');
  const hi = runOf('hi');
  if (!lo || !hi) return null;

  const vidx = (run) => [...run, (run[run.length - 1] + 1) % n];
  const loV = vidx(lo);
  const hiV = vidx(hi);

  // The free run between two joint ends, walking forward around the outline.
  // It must not cross a joint edge, or the two runs interleave.
  const walk = (from, to) => {
    const out = [from];
    let i = from;
    for (let c = 0; c <= n; c++) {
      if (i === to) return out.length >= 2 ? out : null;
      if (label[i]) return null;
      i = (i + 1) % n;
      out.push(i);
    }
    return null;
  };
  const f1 = walk(loV[loV.length - 1], hiV[0]);
  const f2 = walk(hiV[hiV.length - 1], loV[0]);
  if (!f1 || !f2) return null;

  const at = (idx) => idx.map((i) => pts[i]);
  return {
    lo: at(loV),
    hi: at(hiV.slice().reverse()),
    e0: at(f2.slice().reverse()),
    e1: at(f1),
  };
}

/** The length of a polyline. */
function chainLength(chain) {
  let d = 0;
  for (let i = 1; i < chain.length; i++) {
    d += Math.hypot(chain[i][0] - chain[i - 1][0], chain[i][1] - chain[i - 1][1]);
  }
  return d;
}

/** Normalised cumulative arc length of a polyline's vertices, 0 to 1. */
function chainParams(chain) {
  const d = [0];
  for (let i = 1; i < chain.length; i++) {
    d.push(d[i - 1] + Math.hypot(chain[i][0] - chain[i - 1][0], chain[i][1] - chain[i - 1][1]));
  }
  const total = d[d.length - 1];
  return total > 0 ? d.map((v) => v / total) : d.map((_, i) => i / (chain.length - 1));
}

/** The point at normalised arc length u along a polyline. */
function chainAt(chain, u) {
  const p = chainParams(chain);
  const t = Math.max(0, Math.min(1, u));
  let i = 0;
  while (i + 2 < chain.length && p[i + 1] < t) i++;
  const w = p[i + 1] > p[i] ? (t - p[i]) / (p[i + 1] - p[i]) : 0;
  return [
    chain[i][0] + w * (chain[i + 1][0] - chain[i][0]),
    chain[i][1] + w * (chain[i + 1][1] - chain[i][1]),
  ];
}

/**
 * Where to cut a boundary, in normalised arc length.
 *
 * `required` values always survive --- they are the points a support or a load
 * acts at, and moving a boundary condition to the nearest node moves it by
 * however far that is. `optional` values are the traced vertices, kept while
 * the count stays under `cap` so that the mesh follows the drawn outline
 * rather than cutting corners off it. Each surviving interval is then divided
 * uniformly in proportion to its length until there are at least `n` of them.
 */
function gridParams(required, optional, n, cap = 12) {
  const inside = (v) => Number.isFinite(v) && v > 1e-9 && v < 1 - 1e-9;
  const add = (list, v) => {
    if (!list.some((q) => Math.abs(q - v) < 1e-9)) list.push(v);
  };
  const cuts = [0, 1];
  required.filter(inside).forEach((v) => add(cuts, v));
  // A traced vertex a few thousandths from one already taken would make a
  // column of the grid a sliver, and a sliver hexahedron is the element Abaqus
  // calls zero or negative however carefully it is built. Keep the outline,
  // but not at the price of a cell with no thickness.
  const apart = 0.02;
  optional.filter(inside).sort((a, b) => a - b).forEach((v) => {
    if (cuts.length - 1 >= cap) return;
    if (cuts.some((q) => Math.abs(q - v) < apart)) return;
    add(cuts, v);
  });
  cuts.sort((a, b) => a - b);

  const out = [cuts[0]];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const w = cuts[i + 1] - cuts[i];
    const k = Math.max(1, Math.round(n * w));
    for (let j = 1; j <= k; j++) out.push(cuts[i] + (w * j) / k);
  }
  return out;
}

/** A Coons patch on the four boundary chains: s across a joint, t along the arch. */
function coons(chains, s, t) {
  const L = chainAt(chains.lo, s);
  const H = chainAt(chains.hi, s);
  const E0 = chainAt(chains.e0, t);
  const E1 = chainAt(chains.e1, t);
  const c00 = chains.lo[0];
  const c10 = chains.lo[chains.lo.length - 1];
  const c01 = chains.hi[0];
  const c11 = chains.hi[chains.hi.length - 1];
  const at = (k) => (1 - t) * L[k] + t * H[k] + (1 - s) * E0[k] + s * E1[k]
    - ((1 - s) * (1 - t) * c00[k] + s * (1 - t) * c10[k]
      + (1 - s) * t * c01[k] + s * t * c11[k]);
  return [at(0), at(1)];
}

/**
 * Drop the nodes no element uses, and renumber what is left.
 *
 * A grid is laid out before its cells are judged, so a cell thrown out for
 * being degenerate can leave its corners behind with nothing attached. ABAQUS
 * DELETES THOSE NODES, and any set built on them then has no members --- which
 * is fatal when the set is carrying a boundary condition:
 *
 *   NODE SET ASSEMBLY_SUPPORT_A_B8 HAS NO MEMBERS AND WILL BE IGNORED
 *   A BOUNDARY CONDITION HAS BEEN SPECIFIED ON NODE SET ... NOT ACTIVE
 *
 * Removing them here means the support is attached to a node that exists, and
 * the search for it never sees a node the solver is about to discard.
 */
function compactMesh(mesh) {
  const used = new Set();
  for (const e of mesh.elements) for (const id of e.ids) used.add(id);
  if (used.size === mesh.nodes.length) return mesh;

  const renumber = new Map();
  const nodes = [];
  for (let id = 1; id <= mesh.nodes.length; id++) {
    if (!used.has(id)) continue;
    nodes.push(mesh.nodes[id - 1]);
    renumber.set(id, nodes.length);
  }
  mesh.nodes = nodes;
  for (const e of mesh.elements) e.ids = e.ids.map((id) => renumber.get(id));
  return mesh;
}

function addNode(mesh, p) {
  const key = key3(p);
  if (mesh.seen.has(key)) return mesh.seen.get(key);
  const id = mesh.nodes.length + 1;
  mesh.seen.set(key, id);
  mesh.nodes.push(p.slice());
  return id;
}

/**
 * A structured hexahedron. Faces: S1 = 1-2-3-4, S2 = 5-6-7-8, S3 = 1-2-6-5,
 * S4 = 2-3-7-6, S5 = 3-4-8-7, S6 = 4-1-5-8.
 */
function addHex(mesh, ids, volume, faces = {}) {
  mesh.elements.push({ type: 'C3D8', ids });
  const e = mesh.elements.length;
  for (const side of faces.exterior ?? []) mesh.exterior.push({ element: e, side });
  for (const [side, which] of faces.contact ?? []) {
    mesh.exterior.push({ element: e, side });
    mesh.contact.push({ element: e, side, which });
  }
  mesh.volume += volume;
}

/** Bilinear point on a quadrilateral, s across, t along. */
function bilinear(q, s, t) {
  const a = 1 - s;
  const b = 1 - t;
  return [
    a * b * q[0][0] + s * b * q[1][0] + s * t * q[2][0] + a * t * q[3][0],
    a * b * q[0][1] + s * b * q[1][1] + s * t * q[2][1] + a * t * q[3][1],
  ];
}

export function sectionBlockMesh(block, thickness = 1, opt = {}) {
  const { anchors = [], joints = [], refine = {} } = opt;
  // AT LEAST TWO DIVISIONS IN THE PLANE OF THE ARCH. One element per voussoir
  // reports a single stress value per block, which is no picture of anything:
  // to see load percolate through a ring the section has to be divided both
  // across its thickness --- where the eccentricity of the thrust line puts
  // the gradient --- and along its length. Three across is the default because
  // that is the direction the interesting gradient runs in; two would show a
  // sign change but not a shape. Out of plane a barrel is uniform, so one
  // element through the depth is enough unless the caller asks for more.
  const across = Math.max(2, Math.round(refine.across ?? 3));
  const along = Math.max(2, Math.round(refine.along ?? 2));
  const through = Math.max(1, Math.round(refine.through ?? 1));
  const width = Math.max(Math.abs(Number(thickness) || 0), 1e-9);
  const y0 = -width / 2;
  // The scale of the block, used to size every tolerance below relative to it
  // rather than absolutely: a model in metres and the same model in
  // millimetres must reject the same elements.
  const xs = piecesOf(block).flatMap((q) => q.x);
  const zs = piecesOf(block).flatMap((q) => q.y);
  const span = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...zs) - Math.min(...zs),
    1e-9,
  );
  const volumeFloor = span * span * width * 1e-10;
  const mesh = {
    nodes: [], seen: new Map(), elements: [], exterior: [], contact: [], volume: 0,
  };

  mesh.rejected = [];
  const jtol = span * 0.02;

  for (const piece of piecesOf(block)) {
    let pts = profilePoints(piece);
    if (pts.length < 3) continue;

    // A support or a load may act at a point that is not a vertex, and when an
    // end is imposed outside the ring, not even on the block. Put a node there
    // before the outline is meshed, so the condition is applied where it was
    // asked for rather than at whatever node happens to be nearest.
    // A AND B ARE USUALLY OFF THE BLOCK --- an end may be imposed outside the
    // ring altogether --- so what the mesh has to hold on to is the PROJECTION
    // of the anchor onto this outline, not the anchor itself. Comparing grid
    // vertices against the anchor would match nothing, and the node carrying
    // the boundary condition would be lost to the nearest cut.
    const held = [];
    for (const p2 of anchors) {
      pts = insertOutlinePoint(pts, p2, span * 1e-6).pts;
    }
    for (const p2 of anchors) {
      let best = null;
      let d = Infinity;
      for (const v of pts) {
        const e = Math.hypot(v[0] - p2[0], v[1] - p2[1]);
        if (e < d) { d = e; best = v; }
      }
      // Only where the anchor could plausibly attach to THIS block. The other
      // springing is half an arch away; forcing a cut there would divide every
      // block twice over for nothing, and a forced cut beside an existing one
      // makes the sliver the volume check then has to throw out.
      if (best && d <= span) held.push(best);
    }

    const marks = jointEdges(pts, joints, jtol);
    const pieceArea = area(piece);

    // A VOUSSOIR TAKES A STRUCTURED GRID. Wedges from a triangulation would
    // mesh it too, but a stress field read off two triangles per block says
    // nothing: to see load percolate through a ring the section has to be
    // divided across its thickness, where the eccentricity of the thrust line
    // puts the gradient, and along its length.
    const chains = ringChains(pts, marks);
    if (chains) {
      // s runs along a joint --- across the thickness of the ring --- and t
      // from the lo joint to the hi one, along the arch. Cuts fall on the
      // traced vertices where there are not too many of them, and always on a
      // point where a support or a load acts.
      const near = span * 1e-9;
      const onChain = (chain) => {
        const ps = chainParams(chain);
        return chain
          .map((v, i) => (held.some((q) => q
            && Math.hypot(q[0] - v[0], q[1] - v[1]) <= near) ? ps[i] : null))
          .filter((v) => v !== null);
      };
      const sReq = [...onChain(chains.lo), ...onChain(chains.hi)];
      const tReq = [...onChain(chains.e0), ...onChain(chains.e1)];
      // Divide along the arch in proportion to the shape of the block, so the
      // cells come out roughly square. A voussoir twice as long as it is thick
      // meshed two by two gives cells of aspect two, and a skewed cell of
      // aspect two is what Abaqus calls a distorted element. The count never
      // falls below what was asked for, and is capped so that a long block
      // does not run away with the mesh.
      const jointLen = (chainLength(chains.lo) + chainLength(chains.hi)) / 2;
      const freeLen = (chainLength(chains.e0) + chainLength(chains.e1)) / 2;
      const square = jointLen > 0 ? Math.round((across * freeLen) / jointLen) : along;
      const alongN = Math.max(along, Math.min(across * 3, square));

      const sCuts = gridParams(sReq,
        [...chainParams(chains.lo), ...chainParams(chains.hi)], across);
      const tCuts = gridParams(tReq,
        [...chainParams(chains.e0), ...chainParams(chains.e1)], alongN);
      const nS = sCuts.length - 1;
      const nT = tCuts.length - 1;

      const grid = [];
      for (let iy = 0; iy <= through; iy++) {
        const y = y0 + (width * iy) / through;
        const layer = tCuts.map((t) => sCuts.map((sc) => {
          const [x, z] = coons(chains, sc, t);
          return addNode(mesh, [x, y, z]);
        }));
        grid.push(layer);
      }

      for (let iy = 0; iy < through; iy++) {
        for (let it = 0; it < nT; it++) {
          for (let isx = 0; isx < nS; isx++) {
            const L = grid[iy];
            const U = grid[iy + 1];
            addQuadCell(mesh, [
              [L[it][isx], L[it][isx + 1], L[it + 1][isx + 1], L[it + 1][isx]],
              [U[it][isx], U[it][isx + 1], U[it + 1][isx + 1], U[it + 1][isx]],
            ], {
              // S1 and S2 are the out-of-plane faces, free on the outer layers.
              bottom: iy === 0,
              top: iy === through - 1,
              // t = 0 is the lo joint face, t = 1 the hi one.
              lo: it === 0,
              hi: it === nT - 1,
              // s = 0 and s = 1 are the two free faces of the ring.
              s0: isx === 0,
              s1: isx === nS - 1,
            }, volumeFloor);
          }
        }
      }
      if (!(mesh.volume > 0) && pieceArea > 0) mesh.volume += pieceArea * width;
      continue;
    }

    // Anything else --- a profile cut into a many-sided piece, a shell of a
    // dome --- is triangulated and extruded. Ear clipping, not a fan: a fan is
    // only correct for a convex outline. See earClip.
    const front = [];
    const back = [];
    for (let iy = 0; iy <= through; iy++) {
      const y = y0 + (width * iy) / through;
      const layer = pts.map(([x, z]) => addNode(mesh, [x, y, z]));
      if (iy === 0) front.push(...layer); else back.push(layer);
    }
    const layers = [front, ...back];

    for (const [i0, i1, i2] of earClip(pts)) {
      for (let iy = 0; iy < through; iy++) {
        const lo = layers[iy];
        const hi = layers[iy + 1];
        const contact = [];
        const exterior = [];
        if (iy === 0) exterior.push('S1');
        if (iy === through - 1) exterior.push('S2');
        const edge = (a, b, side) => {
          const w = marks.get(`${a},${b}`);
          if (w) contact.push([side, w]);
          else if (Math.abs(a - b) === 1 || Math.abs(a - b) === pts.length - 1) {
            exterior.push(side);
          }
        };
        edge(i0, i1, 'S3');
        edge(i1, i2, 'S4');
        edge(i2, i0, 'S5');

        const ids = [hi[i0], hi[i1], hi[i2], lo[i0], lo[i1], lo[i2]];
        let pts3 = ids.map((id) => mesh.nodes[id - 1]);
        let vol = wedgeVolume(pts3);
        if (vol < 0) {
          ids.splice(0, 6, ids[3], ids[4], ids[5], ids[0], ids[1], ids[2]);
          pts3 = ids.map((id) => mesh.nodes[id - 1]);
          vol = wedgeVolume(pts3);
        }
        if (!(vol > volumeFloor)) {
          mesh.rejected.push({ ids: ids.slice(), volume: vol });
          continue;
        }
        mesh.elements.push({ type: 'C3D6', ids });
        const e = mesh.elements.length;
        for (const side of exterior) mesh.exterior.push({ element: e, side });
        for (const [side, which] of contact) {
          mesh.exterior.push({ element: e, side });
          mesh.contact.push({ element: e, side, which });
        }
        mesh.volume += vol;
      }
    }
    if (!(mesh.volume > 0) && pieceArea > 0) mesh.volume += pieceArea * width;
  }

  delete mesh.seen;
  return compactMesh(mesh);
}

function blockMesh(faces, opt = {}) {
  if (opt.section) {
    return sectionBlockMesh(opt.section, opt.thickness, {
      anchors: opt.anchors, joints: opt.joints, refine: opt.refine,
    });
  }
  return tetBlockMesh(faces);
}

function lineNodeCandidates(mesh, point2d) {
  if (!point2d || !mesh?.nodes?.length) return { best: Infinity, rows: [] };
  const rows = mesh.nodes.map((p, i) => ({
    id: i + 1,
    d: Math.hypot(p[0] - point2d[0], p[2] - point2d[1]),
  })).sort((a, b) => a.d - b.d);
  return { best: rows[0]?.d ?? Infinity, rows };
}

function nearestLineNodes(mesh, point2d, opt = {}) {
  const { limit = 8, tolerance = null } = opt;
  const { rows } = lineNodeCandidates(mesh, point2d);
  if (!rows.length) return [];
  const best = rows[0]?.d ?? Infinity;
  const span = mesh.nodes.reduce((max, p) => Math.max(max,
    Math.hypot(p[0] - point2d[0], p[2] - point2d[1])), 0);
  const tol = tolerance ?? Math.max(best * 1.35, span * 0.025, 1e-9);
  return rows.filter((r) => r.d <= tol).slice(0, limit).map((r) => r.id);
}

function activeLineSets(meshes, point2d, opt = {}) {
  const candidates = meshes.map((mesh) => lineNodeCandidates(mesh, point2d));
  const best = Math.min(...candidates.map((row) => row.best));
  if (!Number.isFinite(best)) return [];
  const allSpan = Math.max(...meshes.flatMap((mesh) => mesh.nodes.map((p) => Math.hypot(
    p[0] - point2d[0], p[2] - point2d[1],
  ))), 1);
  const activeTol = Math.max(best * 1.2, allSpan * 0.015, 1e-9);
  return candidates
    .map((row, block) => ({ row, block }))
    .filter(({ row }) => row.best <= activeTol)
    .map(({ block }) => ({
      block,
      ids: nearestLineNodes(meshes[block], point2d, opt),
    }))
    .filter((row) => row.ids.length);
}

const FACE_NODE_INDEX = {
  C3D8: { S1: [0, 1, 2, 3], S2: [4, 5, 6, 7], S3: [0, 1, 5, 4], S4: [1, 2, 6, 5], S5: [2, 3, 7, 6], S6: [3, 0, 4, 7] },
  C3D6: { S1: [0, 1, 2], S2: [3, 4, 5], S3: [0, 1, 4, 3], S4: [1, 2, 5, 4], S5: [2, 0, 3, 5] },
  C3D4: { S1: [0, 1, 2], S2: [0, 3, 1], S3: [1, 3, 2], S4: [2, 3, 0] },
};

function pointSegmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const den = dx * dx + dz * dz;
  const t = den > 0
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / den))
    : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

/**
 * Exterior element faces that are vertical extrusions of a line in the X-Z
 * section. Front/back faces project to an area and are intentionally omitted.
 */
function exteriorSectionFaces(meshes, tolerance) {
  const rows = [];
  meshes.forEach((mesh, block) => {
    const seen = new Set();
    mesh.exterior.forEach(({ element, side }) => {
      const key = `${element}:${side}`;
      if (seen.has(key)) return;
      seen.add(key);
      const e = mesh.elements[element - 1];
      const ids = (FACE_NODE_INDEX[e?.type]?.[side] ?? []).map((k) => e.ids[k]);
      const points = ids.map((id) => mesh.nodes[id - 1]).filter(Boolean);
      if (points.length < 3) return;

      // Use the farthest projected pair, then require every projected vertex
      // to lie on it. This also handles triangular lateral faces of tetrahedra.
      let a = null;
      let b = null;
      let length = 0;
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const d = Math.hypot(points[j][0] - points[i][0], points[j][2] - points[i][2]);
          if (d > length) {
            length = d;
            a = [points[i][0], points[i][2]];
            b = [points[j][0], points[j][2]];
          }
        }
      }
      if (!(length > tolerance)) return;
      const ux = (b[0] - a[0]) / length;
      const uz = (b[1] - a[1]) / length;
      if (points.some((q) => Math.abs((q[0] - a[0]) * uz - (q[2] - a[1]) * ux) > tolerance)) return;
      rows.push({
        block, element, side, ids, a, b,
        yLo: Math.min(...points.map((q) => q[1])),
        yHi: Math.max(...points.map((q) => q[1])),
      });
    });
  });
  return rows;
}

function intervalsTouch(a, b, tolerance) {
  return a.lo <= b.hi + tolerance && b.lo <= a.hi + tolerance
    && a.yLo <= b.yHi + tolerance && b.yLo <= a.yHi + tolerance;
}

/**
 * Nodes on the locally connected, coplanar exterior faces containing A/B.
 * Coplanarity alone is insufficient: a flood fill over touching face intervals
 * prevents a remote block on the same infinite plane from being constrained.
 */
function rollerFaces(meshes, supports, joints) {
  const allNodes = meshes.flatMap((mesh) => mesh.nodes);
  if (!allNodes.length) return [];
  const xs = allNodes.map((p) => p[0]);
  const ys = allNodes.map((p) => p[1]);
  const zs = allNodes.map((p) => p[2]);
  const scale = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    Math.max(...zs) - Math.min(...zs),
    1,
  );
  const planeTol = scale * 1e-7;
  const touchTol = scale * 1e-6;
  const faces = exteriorSectionFaces(meshes, planeTol);
  const endJoints = joints?.length === meshes.length + 1
    ? [joints[0], joints[joints.length - 1]] : [];

  return supports.flatMap((p, support) => {
    if (!p || !faces.length) return [];

    // At a corner two exterior faces contain the support. Preserve the
    // intended arch-end face when an ordered joint chain is available.
    let pool = faces;
    if (endJoints.length) {
      const preferred = endJoints.reduce((best, joint) => {
        const m = [(joint.a[0] + joint.b[0]) / 2, (joint.a[1] + joint.b[1]) / 2];
        const d = Math.hypot(p[0] - m[0], p[1] - m[1]);
        return !best || d < best.d ? { joint, d } : best;
      }, null)?.joint;
      if (preferred) {
        const dx = preferred.b[0] - preferred.a[0];
        const dz = preferred.b[1] - preferred.a[1];
        const len = Math.hypot(dx, dz) || 1;
        const ux = dx / len;
        const uz = dz / len;
        const aligned = faces.filter((face) => [face.a, face.b].every((q) =>
          Math.abs((q[0] - preferred.a[0]) * uz - (q[1] - preferred.a[1]) * ux) <= planeTol));
        if (aligned.length) pool = aligned;
      }
    }
    const seed = pool.reduce((best, face) => {
      const d = pointSegmentDistance(p, face.a, face.b);
      return !best || d < best.d ? { face, d } : best;
    }, null)?.face;
    if (!seed) return [];

    const dx = seed.b[0] - seed.a[0];
    const dz = seed.b[1] - seed.a[1];
    const length = Math.hypot(dx, dz) || 1;
    const ux = dx / length;
    const uz = dz / length;
    const coplanar = faces.filter((face) => [face.a, face.b].every((q) =>
      Math.abs((q[0] - seed.a[0]) * uz - (q[1] - seed.a[1]) * ux) <= planeTol))
      .map((face) => {
        const projected = [face.a, face.b].map((q) =>
          (q[0] - seed.a[0]) * ux + (q[1] - seed.a[1]) * uz);
        return { ...face, lo: Math.min(...projected), hi: Math.max(...projected) };
      });
    const seedIndex = coplanar.findIndex((face) => face.block === seed.block
      && face.element === seed.element && face.side === seed.side);
    if (seedIndex < 0) return [];

    const connected = new Set([seedIndex]);
    let changed = true;
    while (changed) {
      changed = false;
      coplanar.forEach((candidate, i) => {
        if (connected.has(i)) return;
        if ([...connected].some((j) => intervalsTouch(candidate, coplanar[j], touchTol))) {
          connected.add(i);
          changed = true;
        }
      });
    }

    const byBlock = new Map();
    [...connected].forEach((i) => {
      const face = coplanar[i];
      if (!byBlock.has(face.block)) byBlock.set(face.block, new Set());
      face.ids.forEach((id) => byBlock.get(face.block).add(id));
    });
    return [...byBlock].map(([block, ids]) => ({
      support, block,
      ids: [...ids].sort((a, b) => a - b),
      normal: [-uz, ux],
    }));
  });
}

function forceName(i) {
  return `LOAD_F${i + 1}`;
}

function forceComponent(forces, i) {
  const raw = forces.magnitudes?.[i] ?? 0;
  if (Array.isArray(raw)) return [Number(raw[0]) || 0, Number(raw[1]) || 0];
  return [Number(forces.x?.[i] ?? 0) || 0, Number(raw) || 0];
}

function materialProps(system = 'SI') {
  if (system === 'Nmm') return { elastic: [30000, 0.2], gravity: 9810 };
  if (system === 'kgcm') return { elastic: [3.0e5, 0.2], gravity: 981 };
  return { elastic: [3.0e7, 0.2], gravity: 9.81 };
}

export function abaqusInput(model, opt = {}) {
  const {
    solids = [], sections = null, thickness = [], supports = [],
    forces = { points: [], magnitudes: [] },
    friction = 0.6, system = 'SI', title = 'aLoTiA export',
    joints = null, refine = {}, supportMode = 'hinges', generalContact = false,
  } = opt;
  if (!model?.blocks?.length || !solids.length) {
    throw new Error('no 3D blocks available to export');
  }

  // Every point at which a boundary condition or a load will be applied. Each
  // block gets a node there if the point touches it, so a support imposed off
  // the ring is still attached where it was asked for.
  const out0 = [];
  const anchors = [
    ...supports.filter(Boolean),
    ...(forces.points ?? []).filter(Boolean),
  ];

  // The two joints that bound block i, in that order: joints[i] is its "lo"
  // face and joints[i + 1] its "hi" one. THE ORDER IS THE WHOLE POINT --- it
  // is what lets the hi surface of one block be paired with the lo surface of
  // the next, rather than each block offering its entire outline and leaving
  // the solver to guess.
  const across = Math.max(2, Math.round(refine.across ?? 3));
  const along = Math.max(2, Math.round(refine.along ?? 2));
  const through = Math.max(1, Math.round(refine.through ?? 1));

  const chain = Array.isArray(joints) && joints.length === solids.length + 1
    ? joints
    : null;

  const meshes = solids.map((faces, i) => blockMesh(faces, {
    section: sections?.[i] ?? null,
    thickness: thickness?.[i] ?? 1,
    anchors,
    joints: chain ? [chain[i], chain[i + 1]] : [],
    refine,
  }));

  // Which blocks found which of their two faces. A model whose blocks do not
  // quite touch loses a face here and there, and THAT IS PER JOINT, not per
  // model: one unrecoverable joint used to send the whole export back to
  // whole-outline contact. Where a face is missing the block offers its entire
  // outline for that side alone, and the deck says which joints those are.
  const faces = meshes.map((m) => {
    const w = new Set(m.contact.map((c) => c.which));
    return { lo: w.has('lo'), hi: w.has('hi') };
  });
  const degraded = [];
  if (!generalContact) {
    for (let i = 0; i + 1 < meshes.length; i++) {
      if (!faces[i].hi || !faces[i + 1].lo) degraded.push(i + 1);
    }
  }

  // How far a node may be moved onto the opposite surface to close an initial
  // gap. Joints traced by hand do not close to floating point, and an
  // unclosed joint is a free body: one rigid-body mode, one negative
  // eigenvalue. A thousandth of the model is far below any real opening.
  // The BOUNDING BOX of the model, not the distance from the origin: an arch
  // traced on a photograph sits a thousand pixels from (0, 0) and its size has
  // nothing to do with how far away that is.
  const all = meshes.flatMap((m) => m.nodes);
  const bbox = Math.hypot(
    Math.max(...all.map((q) => q[0])) - Math.min(...all.map((q) => q[0])),
    Math.max(...all.map((q) => q[2])) - Math.min(...all.map((q) => q[2])),
  );
  const adjust = Math.max(bbox, 1e-9) * 1e-3;

  // NOTHING IS WRITTEN THAT THE SOLVER WILL REJECT. A degenerate wedge is
  // dropped at construction, but silence would only move the surprise from
  // here to the .dat file, so the count is reported to the caller.
  const rejected = meshes.reduce((n, m) => n + (m.rejected?.length ?? 0), 0);
  if (rejected) {
    out0.push(`** ${rejected} degenerate element(s) were dropped: the outline `
      + 'had zero-area regions or repeated vertices.');
  }
  if (!meshes.some((m) => m.elements.length)) {
    throw new Error('every element came out degenerate; check the block outlines');
  }
  const { elastic, gravity } = materialProps(system);
  const out = [];
  out.push(...out0);
  out.push('*Heading');
  out.push(`** ${title}`);
  out.push('** Generated by aLoTiA. Units follow the active model unit system.');
  out.push('** X = arch horizontal coordinate, Y = out-of-plane depth, Z = vertical coordinate.');
  out.push('** A voussoir bounded by two joints is meshed as a structured grid of C3D8');
  out.push(`** hexahedra, at least ${across} across the ring thickness by ${along} along the arch by`);
  out.push(`** ${through} through the depth, with a further division at every traced vertex and at`);
  out.push('** every point where a support or a load acts. A cell that comes out concave is');
  out.push('** split into two C3D6 wedges; any other outline is ear-clipped and extruded.');
  out.push('*Preprint, echo=NO, model=NO, history=NO, contact=NO');

  meshes.forEach((mesh, i) => {
    const part = `BLOCK_${i + 1}`;
    out.push(`*Part, name=${part}`);
    out.push('*Node');
    mesh.nodes.forEach((p, id) => out.push(`${id + 1}, ${fmt(p[0])}, ${fmt(p[1])}, ${fmt(p[2])}`));
    for (const type of ['C3D8', 'C3D6', 'C3D4']) {
      const rows = mesh.elements
        .map((e, id) => ({ ...e, id: id + 1 }))
        .filter((e) => e.type === type);
      if (!rows.length) continue;
      out.push(`*Element, type=${type}`);
      rows.forEach((e) => out.push(`${e.id}, ${e.ids.join(', ')}`));
    }
    out.push(`*Elset, elset=${part}_ALL, generate`);
    out.push(`1, ${Math.max(1, mesh.elements.length)}, 1`);
    out.push(`*Surface, type=ELEMENT, name=${part}_EXTERIOR`);
    mesh.exterior.forEach(({ element, side }) => out.push(`${element}, ${side}`));
    for (const which of ['LO', 'HI']) {
      const rows = mesh.contact.filter((c) => c.which === which.toLowerCase());
      out.push(`*Surface, type=ELEMENT, name=${part}_CONTACT_${which}`);
      (rows.length ? rows : mesh.exterior)
        .forEach(({ element, side }) => out.push(`${element}, ${side}`));
    }
    out.push(`*Solid Section, elset=${part}_ALL, material=STONE_${i + 1}`);
    out.push(',');
    out.push('*End Part');
  });

  meshes.forEach((mesh, i) => {
    const gamma = Math.abs(model.weights?.[i] ?? 0) / Math.max(mesh.volume, 1e-12);
    const density = gamma / gravity;
    out.push(`*Material, name=STONE_${i + 1}`);
    out.push('*Density');
    out.push(`${fmt(density)}`);
    out.push('*Elastic');
    out.push(`${fmt(elastic[0])}, ${fmt(elastic[1])}`);
  });

  out.push('*Surface Interaction, name=STONE_FRICTION');
  out.push('*Friction');
  out.push(`${fmt(friction)}`);
  out.push('*Surface Behavior, pressure-overclosure=HARD');

  out.push('*Assembly, name=ASSEMBLY');
  meshes.forEach((_, i) => {
    const part = `BLOCK_${i + 1}`;
    out.push(`*Instance, name=${part}_I, part=${part}`);
    out.push('*End Instance');
  });

  const supportSets = supports.map((p) => activeLineSets(meshes, p, { limit: 10 }));
  const forceSets = (forces.points ?? []).map((p) => activeLineSets(meshes, p, { limit: 12 }));
  const faceRollers = supportMode === 'face-rollers'
    ? rollerFaces(meshes, supports, chain) : [];

  supportSets.forEach((sets, si) => {
    sets.forEach(({ block: bi, ids }) => {
      out.push(`*Nset, nset=SUPPORT_${si === 0 ? 'A' : 'B'}_B${bi + 1}, instance=BLOCK_${bi + 1}_I`);
      out.push(...linesOf(ids));
    });
  });

  // A ROLLER BED IS A BOUNDARY CONDITION ON THE WHOLE FACE SET, not one
  // single-term *Equation per node. Equations written against node labels are
  // not boundary conditions: Abaqus/CAE does not list them with the supports,
  // and on import they are not reliably kept, which left only the A/B hinge
  // nodes restrained. A face normal to X or Z takes the global DOF directly;
  // an inclined face gets a nodal *Transform whose local axis 1 is the face
  // normal, exactly what CAE writes for a boundary condition in a datum CSYS.
  // The hinge nodes are fixed in all three translations, which is the same in
  // any system, so they stay in the face set.
  const transformed = new Map();
  const rollerRows = faceRollers.map((row) => {
    const { support, block, normal } = row;
    const name = `SUPPORT_${support === 0 ? 'A' : 'B'}_FACE_B${block + 1}`;
    const dof = Math.abs(normal[1]) < 1e-9 ? 1 : Math.abs(normal[0]) < 1e-9 ? 3 : null;
    const system = dof ? `global-${dof}` : `${fmt(normal[0])},${fmt(normal[1])}`;
    // A node carries one nodal transformation only. Where two roller faces of
    // one block meet and either is inclined, the node stays with the first;
    // two global DOFs on one corner node are simply both blocked.
    const clash = [];
    const ids = row.ids.filter((id) => {
      const key = `${block}:${id}`;
      const seen = transformed.get(key);
      if (seen && seen.system !== system && (seen.normal || !dof)) {
        clash.push(id);
        return false;
      }
      if (!seen) transformed.set(key, { system, normal: dof ? null : normal });
      return true;
    });
    return { ...row, name, dof, ids, clash };
  }).filter((row) => row.ids.length);

  rollerRows.forEach(({ name, block, ids }) => {
    out.push(`*Nset, nset=${name}, instance=BLOCK_${block + 1}_I`);
    out.push(...linesOf(ids));
  });
  if (supportMode === 'face-rollers' && !rollerRows.length) {
    out.push('** Face rollers requested, but no exterior face connected to A/B could be identified.');
  }
  rollerRows.forEach(({ name, support, dof, normal, clash }) => {
    out.push(`** End face ${support === 0 ? 'A' : 'B'}: roller bed blocks U.normal; tangential motion remains free.`);
    if (clash.length) {
      out.push(`** ${clash.length} corner node(s) already belong to another roller face and keep its system.`);
    }
    if (dof) return;
    out.push('** Inclined face: nodal system with local 1 = face normal, local 2 = Y.');
    out.push('** U, RF and concentrated loads on these nodes are expressed in that system.');
    out.push(`*Transform, nset=${name}, type=R`);
    out.push(`${fmt(normal[0])}, 0., ${fmt(normal[1])}, 0., 1., 0.`);
  });

  forceSets.forEach((sets, fi) => {
    sets.forEach(({ block: bi, ids }) => {
      out.push(`*Nset, nset=${forceName(fi)}_B${bi + 1}, instance=BLOCK_${bi + 1}_I`);
      out.push(...linesOf(ids));
    });
  });

  out.push('*End Assembly');

  // GENERAL CONTACT IS MODEL DATA IN ABAQUS/STANDARD. Only Abaqus/Explicit
  // accepts *Contact inside a step; written there for this implicit step it
  // is dropped (on import into CAE) or rejected, and the courses fall through
  // one another as if no interaction had been defined at all.
  if (generalContact) {
    out.push('** Running-bond assembly: contact is discovered over every exterior face.');
    out.push('*Contact, op=NEW');
    out.push('*Contact Inclusions, ALL EXTERIOR');
    out.push('*Contact Property Assignment');
    out.push(', , STONE_FRICTION');
  }

  out.push('*Step, name=Gravity_and_applied_loads, nlgeom=YES, inc=1000');
  out.push('*Dynamic, application=QUASI-STATIC');
  out.push('0.01, 1., 1e-08, 0.05');
  if (!generalContact) {
    out.push('** One pair per joint, and each pair is exactly the two faces that abut:');
    out.push('** the hi face of a voussoir against the lo face of the next.');
    out.push('** The first surface named is the slave.');
    if (degraded.length) {
      out.push(`** ${degraded.length} joint(s) could not be identified --- `
        + `${degraded.join(', ')} --- and there the block offers its whole outline.`);
      out.push('** Expect wrong-facing facets on those, and a free body wherever one fails to close.');
    }
    for (let i = 0; i + 1 < meshes.length; i++) {
      out.push('*Contact Pair, interaction=STONE_FRICTION, type=SURFACE TO SURFACE, '
        + `small sliding, adjust=${fmt(adjust)}`);
      out.push(`BLOCK_${i + 2}_I.BLOCK_${i + 2}_CONTACT_LO, `
        + `BLOCK_${i + 1}_I.BLOCK_${i + 1}_CONTACT_HI`);
    }
  }
  out.push('** Cylindrical hinge lines: solid elements have translational DOFs only,');
  out.push('** so constraining the line nodes in U1-U3 leaves block rotation to contact kinematics.');
  supportSets.forEach((sets, si) => {
    sets.forEach(({ block: bi }) => {
      out.push('*Boundary');
      out.push(`SUPPORT_${si === 0 ? 'A' : 'B'}_B${bi + 1}, 1, 3, 0.`);
    });
  });
  if (rollerRows.length) {
    out.push('** Roller beds: every node coplanar with and connected to the A/B face,');
    out.push('** restrained normal to that face (local 1 where the face is inclined).');
  }
  rollerRows.forEach(({ name, dof }) => {
    out.push('*Boundary');
    out.push(`${name}, ${dof ?? 1}, ${dof ?? 1}, 0.`);
  });
  meshes.forEach((_, i) => {
    out.push('*Dload');
    out.push(`BLOCK_${i + 1}_I.BLOCK_${i + 1}_ALL, GRAV, ${fmt(gravity)}, 0., 0., -1.`);
  });
  forceSets.forEach((sets, fi) => {
    const [fx, fy] = forceComponent(forces, fi);
    const count = sets.reduce((sum, row) => sum + row.ids.length, 0);
    sets.forEach(({ block: bi, ids }) => {
      if (!ids.length || !(Math.hypot(fx, fy) > 0) || !(count > 0)) return;
      const nodalX = fx / count;
      const nodalZ = -fy / count;
      out.push('*Cload');
      ids.forEach((id) => {
        // A node under a nodal *Transform reads its load in the local system.
        const n = transformed.get(`${bi}:${id}`)?.normal;
        const c1 = n ? nodalX * n[0] + nodalZ * n[1] : nodalX;
        const c3 = n ? -nodalX * n[1] + nodalZ * n[0] : nodalZ;
        if (c1) out.push(`BLOCK_${bi + 1}_I.${id}, 1, ${fmt(c1)}`);
        if (c3) out.push(`BLOCK_${bi + 1}_I.${id}, 3, ${fmt(c3)}`);
      });
    });
  });
  out.push('*Output, field, frequency=1');
  out.push('*Node Output');
  out.push('U, RF');
  out.push('*Element Output, directions=YES');
  out.push('S, E');
  out.push('*Contact Output');
  out.push('CSTRESS, CDISP');
  out.push('*Output, history, frequency=1');
  out.push('*Energy Output');
  out.push('ALLIE, ALLKE, ALLWK, ALLFD');
  out.push('*End Step');
  out.push('');
  return out.join('\n');
}
