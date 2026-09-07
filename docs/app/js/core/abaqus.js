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

  return { nodes, elements, exterior, contact: exterior.slice(), volume };
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

function addNode(mesh, p) {
  const key = key3(p);
  if (mesh.seen.has(key)) return mesh.seen.get(key);
  const id = mesh.nodes.length + 1;
  mesh.seen.set(key, id);
  mesh.nodes.push(p.slice());
  return id;
}

function addWedge(mesh, ids, volume, sideLabels = []) {
  mesh.elements.push({ type: 'C3D6', ids });
  const e = mesh.elements.length;
  mesh.exterior.push(
    { element: e, side: 'S1' },
    { element: e, side: 'S2' },
    ...sideLabels.map((side) => ({ element: e, side })),
  );
  mesh.contact.push(...sideLabels.map((side) => ({ element: e, side })));
  mesh.volume += volume;
}

function sectionBlockMesh(block, thickness = 1, opt = {}) {
  const { anchors = [] } = opt;
  const width = Math.max(Math.abs(Number(thickness) || 0), 1e-9);
  const y0 = -width / 2;
  const y1 = width / 2;
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
  for (const piece of piecesOf(block)) {
    let pts = profilePoints(piece);
    if (pts.length < 3) continue;

    // A support or a load may act at a point that is not a vertex, and when an
    // end is imposed outside the ring, not even on the block. Put a node there
    // before the outline is triangulated, so that the condition is applied
    // where it was asked for rather than at whatever node is nearest.
    for (const p2 of anchors) {
      const got = insertOutlinePoint(pts, p2, span * 1e-6);
      pts = got.pts;
    }

    const front = pts.map(([x, z]) => addNode(mesh, [x, y0, z]));
    const back = pts.map(([x, z]) => addNode(mesh, [x, y1, z]));
    const pieceArea = area(piece);

    // Ear clipping, not a fan: a fan is only correct for a convex outline and
    // a voussoir need not be convex. See earClip.
    const tris = earClip(pts);
    const onEdge = new Set();
    for (let i = 0; i < pts.length; i++) onEdge.add(`${i},${(i + 1) % pts.length}`);

    for (const [i0, i1, i2] of tris) {
      // The faces that lie on the outline of the piece, so that contact is
      // declared on the real boundary and not on an internal cut.
      const sides = [];
      if (onEdge.has(`${i0},${i1}`)) sides.push('S3');
      if (onEdge.has(`${i1},${i2}`)) sides.push('S4');
      if (onEdge.has(`${i2},${i0}`)) sides.push('S5');

      const ids = [back[i0], back[i1], back[i2],
        front[i0], front[i1], front[i2]];
      let pts3 = ids.map((id) => mesh.nodes[id - 1]);
      let vol = wedgeVolume(pts3);

      // Inside out: exchange the two triangular faces rather than write an
      // element Abaqus will reject.
      if (vol < 0) {
        ids.splice(0, 6, ids[3], ids[4], ids[5], ids[0], ids[1], ids[2]);
        pts3 = ids.map((id) => mesh.nodes[id - 1]);
        vol = wedgeVolume(pts3);
      }
      // Degenerate: three nodes in a line, or a piece of outline of no area.
      if (!(vol > volumeFloor)) {
        mesh.rejected.push({ ids: ids.slice(), volume: vol });
        continue;
      }
      addWedge(mesh, ids, vol, sides);
    }
    if (!(mesh.volume > 0) && pieceArea > 0) mesh.volume += pieceArea * width;
  }

  delete mesh.seen;
  return mesh;
}

function blockMesh(faces, opt = {}) {
  if (opt.section) {
    return sectionBlockMesh(opt.section, opt.thickness, { anchors: opt.anchors });
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

function forceName(i) {
  return `LOAD_F${i + 1}`;
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

  const meshes = solids.map((faces, i) => blockMesh(faces, {
    section: sections?.[i] ?? null,
    thickness: thickness?.[i] ?? 1,
    anchors,
  }));

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
  out.push('** Barrel blocks are meshed by triangulating and extruding the 2D voussoir section as C3D6 wedges.');
  out.push('** There is one solid element through the thickness.');
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
    out.push(`*Surface, type=ELEMENT, name=${part}_CONTACT`);
    (mesh.contact.length ? mesh.contact : mesh.exterior)
      .forEach(({ element, side }) => out.push(`${element}, ${side}`));
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

  supportSets.forEach((sets, si) => {
    sets.forEach(({ block: bi, ids }) => {
      out.push(`*Nset, nset=SUPPORT_${si === 0 ? 'A' : 'B'}_B${bi + 1}, instance=BLOCK_${bi + 1}_I`);
      out.push(...linesOf(ids));
    });
  });

  forceSets.forEach((sets, fi) => {
    sets.forEach(({ block: bi, ids }) => {
      out.push(`*Nset, nset=${forceName(fi)}_B${bi + 1}, instance=BLOCK_${bi + 1}_I`);
      out.push(...linesOf(ids));
    });
  });

  out.push('*End Assembly');

  out.push('*Step, name=Gravity_and_applied_loads, nlgeom=YES, inc=1000');
  out.push('*Dynamic, application=QUASI-STATIC');
  out.push('0.01, 1., 1e-08, 0.05');
  out.push('** Explicit contact pairs between adjacent voussoirs.');
  for (let i = 0; i + 1 < meshes.length; i++) {
    out.push('*Contact Pair, interaction=STONE_FRICTION, type=SURFACE TO SURFACE');
    out.push(`BLOCK_${i + 1}_I.BLOCK_${i + 1}_CONTACT, BLOCK_${i + 2}_I.BLOCK_${i + 2}_CONTACT`);
  }
  out.push('** Cylindrical hinge lines: solid elements have translational DOFs only,');
  out.push('** so constraining the line nodes in U1-U3 leaves block rotation to contact kinematics.');
  supportSets.forEach((sets, si) => {
    sets.forEach(({ block: bi }) => {
      out.push('*Boundary');
      out.push(`SUPPORT_${si === 0 ? 'A' : 'B'}_B${bi + 1}, 1, 3, 0.`);
    });
  });
  meshes.forEach((_, i) => {
    out.push('*Dload');
    out.push(`BLOCK_${i + 1}_I.BLOCK_${i + 1}_ALL, GRAV, ${fmt(gravity)}, 0., 0., -1.`);
  });
  forceSets.forEach((sets, fi) => {
    const mag = Number(forces.magnitudes?.[fi]) || 0;
    const count = sets.reduce((sum, row) => sum + row.ids.length, 0);
    sets.forEach(({ block: bi, ids }) => {
      if (!ids.length || !(mag > 0) || !(count > 0)) return;
      const nodal = -mag / count;
      out.push('*Cload');
      ids.forEach((id) => out.push(`BLOCK_${bi + 1}_I.${id}, 3, ${fmt(nodal)}`));
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
