import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';

import {
  abaqusInput, jointEdges, ringChains, hexVolume, hexCornerJacobian,
} from '../docs/app/js/core/abaqus.js';
import { fromExample } from '../docs/app/js/core/model.js';
import { extrude } from '../docs/app/js/core/dome.js';

const rect = (x0, x1, y0, y1) => ({
  x: [x0, x1, x1, x0],
  y: [y0, y0, y1, y1],
});

function det3(a, b, c) {
  return a[0] * (b[1] * c[2] - b[2] * c[1])
    - a[1] * (b[0] * c[2] - b[2] * c[0])
    + a[2] * (b[0] * c[1] - b[1] * c[0]);
}

function jacobianSign(nodes, ids, type) {
  const p = (i) => nodes.get(ids[i]);
  const a = p(0);
  const edge = (i) => [p(i)[0] - a[0], p(i)[1] - a[1], p(i)[2] - a[2]];
  if (type === 'C3D8') return det3(edge(1), edge(3), edge(4));
  return det3(edge(1), edge(2), edge(3));
}

function parseInp(inp) {
  const nodes = new Map();
  const elements = [];
  let currentType = null;
  for (const line of inp.split('\n')) {
    const elementHeader = line.match(/^\*Element,\s*type=(C3D\d+)/i);
    if (elementHeader) {
      currentType = elementHeader[1].toUpperCase();
      continue;
    }
    if (line.startsWith('*')) {
      currentType = null;
      continue;
    }
    const values = line.split(',').map((v) => Number(v.trim()));
    if (values.length === 4 && values.every(Number.isFinite)) {
      nodes.set(values[0], values.slice(1));
    } else if (currentType && values.length > 1 && values.every(Number.isFinite)) {
      elements.push({ id: values[0], type: currentType, ids: values.slice(1) });
    }
  }
  return { nodes, elements };
}

test('Abaqus export meshes a quadrilateral block as two wedges through thickness', () => {
  const block = rect(0, 2, 0, 1);
  const inp = abaqusInput({
    blocks: [block],
    weights: [40],
  }, {
    solids: [extrude(block, 0.5)],
    sections: [block],
    thickness: [0.5],
    supports: [[0, 0], [2, 0]],
  });

  assert.match(inp, /\*Element, type=C3D6\n1, /);
  assert.match(inp, /\*Element, type=C3D6\n(?:.*\n)?2, /);
  assert.doesNotMatch(inp, /\*Element, type=C3D8/);
  assert.doesNotMatch(inp, /\*Element, type=C3D4/);
  assert.match(inp, /\*Surface, type=ELEMENT, name=BLOCK_1_CONTACT/);
  const { nodes, elements } = parseInp(inp);
  elements.forEach((e) => assert.ok(jacobianSign(nodes, e.ids, e.type) > 0,
    `element ${e.id} has positive orientation`));
});

test('Abaqus export keeps a support point inserted on an edge as an exact line nset', () => {
  const split = {
    x: [0, 1, 2, 2, 0],
    y: [0, 0, 0, 1, 1],
  };
  const inp = abaqusInput({
    blocks: [split],
    weights: [40],
  }, {
    solids: [extrude(split, 0.5)],
    sections: [split],
    thickness: [0.5],
    supports: [[1, 0]],
  });

  assert.match(inp, /\*Element, type=C3D6/);
  const { nodes, elements } = parseInp(inp);
  elements.forEach((e) => assert.ok(jacobianSign(nodes, e.ids, e.type) > 0,
    `element ${e.id} has positive orientation`));
  const support = inp.match(/\*Nset, nset=SUPPORT_A_B1, instance=BLOCK_1_I\n([^\n]+)/);
  assert.ok(support, 'support nset must be written for the split point');
  const ids = support[1].split(',').map((s) => Number(s.trim()));
  assert.ok(ids.length >= 2, 'the hinge line should use front and back nodes');
  ids.forEach((id) => {
    const p = nodes.get(id);
    assert.ok(p, `node ${id} exists`);
    assert.ok(Math.abs(p[0] - 1) < 1e-12, `node ${id} x`);
    assert.ok(Math.abs(p[2] - 0) < 1e-12, `node ${id} z`);
  });
});

// ---------------------------------------------------------------------------
// Joint faces, the refined grid, and the contact that is built on both.
// ---------------------------------------------------------------------------

/** The node ids of one face of an element, by the Abaqus face label. */
const FACES = {
  C3D8: { S1: [0, 1, 2, 3], S2: [4, 5, 6, 7], S3: [0, 1, 5, 4], S4: [1, 2, 6, 5], S5: [2, 3, 7, 6], S6: [3, 0, 4, 7] },
  C3D6: { S1: [0, 1, 2], S2: [3, 4, 5], S3: [0, 1, 4, 3], S4: [1, 2, 5, 4], S5: [2, 0, 3, 5] },
};

/**
 * The deck split by part, because NODE AND ELEMENT NUMBERS ARE LOCAL TO A
 * PART. Flattening them into one table silently merges block 1's element 1
 * with block 2's, and a surface then reads as pointing at the wrong geometry.
 *
 * @returns {Map<string, {nodes: Map, elements: Map, surfaces: Map}>}
 */
function parseParts(inp) {
  const parts = new Map();
  let part = null;
  let type = null;
  let surface = null;
  for (const line of inp.split('\n')) {
    const open = line.match(/^\*Part,\s*name=(\S+)/i);
    if (open) {
      part = { nodes: new Map(), elements: new Map(), surfaces: new Map() };
      parts.set(open[1], part);
      type = null; surface = null;
      continue;
    }
    if (/^\*End Part/i.test(line)) { part = null; type = null; surface = null; continue; }
    if (!part) continue;

    const el = line.match(/^\*Element,\s*type=(C3D\d+)/i);
    if (el) { type = el[1].toUpperCase(); surface = null; continue; }
    const sf = line.match(/^\*Surface,\s*type=ELEMENT,\s*name=(\S+)/i);
    if (sf) { surface = sf[1]; part.surfaces.set(surface, []); type = null; continue; }
    if (line.startsWith('*')) { type = null; surface = null; continue; }

    if (surface) {
      const m = line.match(/^\s*(\d+)\s*,\s*(S\d)\s*$/);
      if (m) part.surfaces.get(surface).push({ element: Number(m[1]), side: m[2] });
      continue;
    }
    const v = line.split(',').map((t) => Number(t.trim()));
    if (!v.every(Number.isFinite) || v.length < 2) continue;
    if (type) part.elements.set(v[0], { id: v[0], type, ids: v.slice(1) });
    else if (v.length === 4) part.nodes.set(v[0], v.slice(1));
  }
  return parts;
}

/** A two-voussoir straight "arch", with the three joints that bound it. */
function twoBlockModel(extra = {}) {
  const a = rect(0, 1, 0, 1);
  const b = rect(1, 2, 0, 1);
  return abaqusInput({ blocks: [a, b], weights: [40, 40] }, {
    solids: [extrude(a, 0.5), extrude(b, 0.5)],
    sections: [a, b],
    thickness: [0.5, 0.5],
    supports: [[0, 0], [2, 0]],
    joints: [
      { a: [0, 0], b: [0, 1] },
      { a: [1, 0], b: [1, 1] },
      { a: [2, 0], b: [2, 1] },
    ],
    ...extra,
  });
}

test('optional end-face roller beds block only the face-normal displacement', () => {
  const legacy = twoBlockModel();
  assert.doesNotMatch(legacy, /SUPPORT_A_FACE/);
  assert.doesNotMatch(legacy, /^\*Equation$/m);

  const inp = twoBlockModel({ supportMode: 'face-rollers' });
  assert.match(inp, /\*Nset, nset=SUPPORT_A_FACE_B1, instance=BLOCK_1_I/);
  assert.match(inp, /\*Nset, nset=SUPPORT_B_FACE_B2, instance=BLOCK_2_I/);
  assert.match(inp, /End face A: roller bed blocks U\.normal/);
  assert.match(inp, /^\*Equation\n1\nBLOCK_1_I\.\d+, 1, -?1$/m,
    'the vertical end face has a horizontal normal');
  // A and B remain fully fixed hinge lines in addition to the roller beds.
  assert.match(inp, /SUPPORT_A_B1, 1, 3, 0\./);
  assert.match(inp, /SUPPORT_B_B2, 1, 3, 0\./);
});

test('face rollers propagate over touching coplanar faces but not remote ones', () => {
  const blocks = [
    rect(0, 1, 0, 1),
    rect(0, 1, 1, 2),
    rect(0, 1, 5, 6),
  ];
  const inp = abaqusInput({ blocks, weights: [40, 40, 40] }, {
    solids: blocks.map((block) => extrude(block, 0.5)),
    sections: blocks,
    thickness: [0.5, 0.5, 0.5],
    supports: [[0, 0.5]],
    supportMode: 'face-rollers',
    generalContact: true,
  });
  const parts = parseParts(inp);
  const nset = (name) => {
    const match = inp.match(new RegExp(`\\*Nset, nset=${name}[^\\n]*\\n([^*]+)`));
    return new Set((match?.[1].match(/\d+/g) ?? []).map(Number));
  };
  const leftFaceNodes = (partName) => new Set([...parts.get(partName).nodes]
    .filter(([, p]) => Math.abs(p[0]) < 1e-12).map(([id]) => id));

  assert.deepEqual(nset('SUPPORT_A_FACE_B1'), leftFaceNodes('BLOCK_1'));
  assert.deepEqual(nset('SUPPORT_A_FACE_B2'), leftFaceNodes('BLOCK_2'),
    'the touching continuation of the support face must also be constrained');
  assert.doesNotMatch(inp, /SUPPORT_A_FACE_B3/,
    'a disconnected face on the same infinite plane must remain free');
  assert.match(inp, /^BLOCK_2_I\.\d+, 1, -?1$/m,
    'the propagated face nodes receive the face-normal equation');
});

test('running-bond assemblies use general contact instead of a false block chain', () => {
  const inp = twoBlockModel({ generalContact: true });
  assert.match(inp, /^\*Contact$/m);
  assert.match(inp, /^\*Contact Inclusions, ALL EXTERIOR$/m);
  assert.match(inp, /^\*Contact Property Assignment\n, , STONE_FRICTION$/m);
  assert.doesNotMatch(inp, /^\*Contact Pair/m);
});

test('a four-sided voussoir is meshed as a refined grid of hexahedra, not one wedge pair', () => {
  // The whole reason for the grid: a single element per block reports one
  // stress value per block, which shows nothing of how load percolates.
  const inp = twoBlockModel();
  const { nodes, elements } = parseInp(inp);
  assert.ok(elements.length > 0);
  assert.ok(elements.every((e) => e.type === 'C3D8'),
    'a quadrilateral bounded by two joints takes hexahedra');
  // Three across the thickness by default, and the same along, because these
  // blocks are square and the division along the arch follows their shape.
  assert.equal(elements.length, 3 * 3 * 1 * 2);
  elements.forEach((e) => assert.ok(jacobianSign(nodes, e.ids, e.type) > 0,
    `element ${e.id} has positive orientation`));
});

test('the refinement can be asked for, and never falls below two in the plane', () => {
  const fine = parseInp(twoBlockModel({ refine: { across: 4, along: 3, through: 2 } }));
  assert.equal(fine.elements.length, 4 * 4 * 2 * 2);
  // A caller asking for one element per block is asking for the picture the
  // grid exists to replace, so the floor holds.
  const coarse = parseInp(twoBlockModel({ refine: { across: 1, along: 1, through: 1 } }));
  assert.equal(coarse.elements.length, 2 * 2 * 1 * 2);
});

test('a long block is divided along the arch in proportion to its shape', () => {
  // Two by two on a voussoir three times longer than it is thick gives cells
  // of aspect three, and a skewed cell of aspect three is what Abaqus reports
  // as a distorted element.
  const long = (x0, x1) => ({ x: [x0, x1, x1, x0], y: [0, 0, 1, 1] });
  const a = long(0, 3);
  const b = long(3, 6);
  const inp = abaqusInput({ blocks: [a, b], weights: [40, 40] }, {
    solids: [a, b].map((q) => extrude(q, 0.5)),
    sections: [a, b],
    thickness: [0.5, 0.5],
    supports: [[0, 0], [6, 0]],
    joints: [{ a: [0, 0], b: [0, 1] }, { a: [3, 0], b: [3, 1] }, { a: [6, 0], b: [6, 1] }],
    refine: { across: 2 },
  });
  const { nodes, elements } = parseInp(inp);
  // Two across the unit thickness, six along the length of three: square.
  assert.equal(elements.length, 2 * 6 * 1 * 2);
  const side = (e) => {
    const p = e.ids.map((id) => nodes.get(id));
    return Math.hypot(p[1][0] - p[0][0], p[1][2] - p[0][2])
      / Math.hypot(p[3][0] - p[0][0], p[3][2] - p[0][2]);
  };
  elements.forEach((e) => {
    const r = side(e);
    assert.ok(r > 0.5 && r < 2, `element ${e.id} has aspect ${r.toFixed(2)}`);
  });
});

test('a contact surface holds the joint faces and nothing else', () => {
  // THE FAULT THIS FIXES. The surface used to be the whole outline, so it
  // carried intrados and extrados faces that face nothing on the neighbour:
  // "facets facing in the wrong direction", then unclosed joints, then one
  // negative eigenvalue per free body.
  const parts = parseParts(twoBlockModel());

  const atX = (partName, surface, x) => {
    const part = parts.get(partName);
    const rows = part.surfaces.get(surface);
    assert.ok(rows && rows.length, `${surface} is written and not empty`);
    for (const { element, side } of rows) {
      const e = part.elements.get(element);
      for (const k of FACES[e.type][side]) {
        const p = part.nodes.get(e.ids[k]);
        assert.ok(Math.abs(p[0] - x) < 1e-9,
          `${surface} face ${element}/${side}: node at x=${p[0]}, expected ${x}`);
      }
    }
    return rows;
  };

  atX('BLOCK_1', 'BLOCK_1_CONTACT_LO', 0);
  const hi = atX('BLOCK_1', 'BLOCK_1_CONTACT_HI', 1);
  const lo = atX('BLOCK_2', 'BLOCK_2_CONTACT_LO', 1);
  atX('BLOCK_2', 'BLOCK_2_CONTACT_HI', 2);
  // The two surfaces meeting at the joint must carry the same number of
  // faces, or one of them is missing part of the joint.
  assert.equal(hi.length, lo.length);
  // And the undivided whole-outline surface is gone.
  assert.ok(!parts.get('BLOCK_1').surfaces.has('BLOCK_1_CONTACT'));
});

test('each contact pair is the two faces that abut, with a closing tolerance', () => {
  const inp = twoBlockModel();
  const pair = inp.match(/^\*Contact Pair,([^\n]*)\n([^\n]+)$/m);
  assert.ok(pair, 'a contact pair is written');
  assert.match(pair[1], /type=SURFACE TO SURFACE/);
  assert.match(pair[1], /small sliding/);
  // A traced joint does not close to floating point, and an unclosed joint is
  // a free body: one rigid-body mode, one negative eigenvalue.
  const adjust = pair[1].match(/adjust=([-\d.eE+]+)/);
  assert.ok(adjust, 'a slave-node adjust tolerance is given');
  assert.ok(Number(adjust[1]) > 0 && Number(adjust[1]) < 0.1,
    `adjust ${adjust[1]} should be small but positive`);
  assert.equal(pair[2].trim(), 'BLOCK_2_I.BLOCK_2_CONTACT_LO, BLOCK_1_I.BLOCK_1_CONTACT_HI');
  assert.equal(inp.match(/^\*Contact Pair/gm).length, 1, 'one pair per joint');
});

test('a joint that cannot be identified degrades on its own, not the whole deck', () => {
  // A model whose blocks do not quite touch loses a face here and there. That
  // used to send the WHOLE export back to whole-outline contact; now only the
  // joints that lost a face do, and the deck names them.
  const a = rect(0, 1, 0, 1);
  const b = rect(1, 2, 0, 1);
  const c = rect(2, 3, 0, 1);
  const inp = abaqusInput({ blocks: [a, b, c], weights: [40, 40, 40] }, {
    solids: [a, b, c].map((q) => extrude(q, 0.5)),
    sections: [a, b, c],
    thickness: [0.5, 0.5, 0.5],
    supports: [[0, 0], [3, 0]],
    joints: [
      { a: [0, 0], b: [0, 1] },
      { a: [1, 0], b: [1, 1] },
      { a: [9, 9], b: [9, 8] },     // nowhere near the blocks: unrecoverable
      { a: [3, 0], b: [3, 1] },
    ],
  });
  assert.match(inp, /1 joint\(s\) could not be identified --- 2 ---/);
  // The joint that was found is still paired face to face.
  const parts = parseParts(inp);
  // (The two sides need not carry the same number of faces here: block 2 lost
  // one joint, so it is not a ring piece and falls back to wedges. Surface to
  // surface contact does not require matching discretisations.)
  const hi = parts.get('BLOCK_1').surfaces.get('BLOCK_1_CONTACT_HI');
  for (const { element, side } of hi) {
    const e = parts.get('BLOCK_1').elements.get(element);
    for (const k of FACES[e.type][side]) {
      assert.ok(Math.abs(parts.get('BLOCK_1').nodes.get(e.ids[k])[0] - 1) < 1e-9);
    }
  }
  // Every joint still gets exactly one pair.
  assert.equal(inp.match(/^\*Contact Pair/gm).length, 2);
});

test('with no joints at all the export still runs, offering whole outlines', () => {
  const a = rect(0, 1, 0, 1);
  const b = rect(1, 2, 0, 1);
  const inp = abaqusInput({ blocks: [a, b], weights: [40, 40] }, {
    solids: [extrude(a, 0.5), extrude(b, 0.5)],
    sections: [a, b],
    thickness: [0.5, 0.5],
    supports: [[0, 0], [2, 0]],
  });
  assert.match(inp, /1 joint\(s\) could not be identified/);
  assert.match(inp, /\*Surface, type=ELEMENT, name=BLOCK_1_CONTACT_HI/);
  assert.equal(inp.match(/^\*Contact Pair/gm).length, 1);
});

test('a joint face split by a support point is still recognised as one face', () => {
  // THE CASE THAT DEFEATED THE FIRST ATTEMPT. A springing support lands on a
  // joint, a node is inserted there, and the face becomes two edges. Testing
  // for a four-sided outline then threw the block back to wedges and left it
  // with one joint out of two, so the whole deck fell back to whole-outline
  // contact. What identifies a voussoir is its four boundary RUNS, not four
  // vertices.
  const pts = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0.4]];   // left face split
  const marks = jointEdges(pts, [
    { a: [0, 0], b: [0, 1] },
    { a: [1, 0], b: [1, 1] },
  ], 0.02);
  assert.equal([...marks.values()].filter((w) => w === 'lo').length, 2,
    'both halves of the split face belong to the same joint');

  const chains = ringChains(pts, marks);
  assert.ok(chains, 'a voussoir with a split face is still a ring piece');
  assert.equal(chains.lo.length, 3, 'the lo chain runs through the inserted point');
  assert.equal(chains.hi.length, 2);
  // lo[0] and hi[0] are joined by e0, lo[last] and hi[last] by e1.
  assert.deepEqual(chains.e0[0], chains.lo[0]);
  assert.deepEqual(chains.e0[chains.e0.length - 1], chains.hi[0]);
  assert.deepEqual(chains.e1[0], chains.lo[chains.lo.length - 1]);
  assert.deepEqual(chains.e1[chains.e1.length - 1], chains.hi[chains.hi.length - 1]);
});

test('an outline that touches one joint twice is not a ring piece', () => {
  const pts = [[0, 0], [1, 0], [1, 1], [0, 1]];
  // Both left and right marked "lo": no hi run at all.
  const marks = new Map([['3,0', 'lo'], ['1,2', 'lo']]);
  assert.equal(ringChains(pts, marks), null);
  // Two separate runs of the same joint.
  assert.equal(ringChains([[0, 0], [1, 0], [1, 1], [0, 1]],
    new Map([['0,1', 'lo'], ['2,3', 'lo'], ['1,2', 'hi']])), null);
});

test('a hexahedron can have a good volume and still be inside out at a corner', () => {
  // This is what Abaqus reports as "the volume of N elements is zero, small,
  // or negative", and a volume check alone will not catch it.
  const cube = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ];
  assert.ok(hexCornerJacobian(cube) > 0);
  // Push one corner across the diagonal: the cell folds over there while the
  // total volume stays positive.
  const folded = cube.map((p, i) => (i === 2 ? [0.2, 0.2, 0] : p));
  assert.ok(hexVolume(folded) > 0, 'the volume alone still looks fine');
  assert.ok(hexCornerJacobian(folded) < 0, 'but a corner is inverted');
});

test('a real traced ring exports with every element the right way round', () => {
  // The examples are hand-traced: blocks are not quite four-sided, joints are
  // recovered rather than stored, and faces stand off them by a few per cent.
  const raw = JSON.parse(readFileSync(
    new URL('./fixtures/matlab/Example_1_Circular_arch_comparison.json', import.meta.url), 'utf8'));
  const m = fromExample(raw);
  const inp = abaqusInput(m, {
    solids: m.blocks.map((b) => extrude(b, 1)),
    sections: m.blocks,
    thickness: m.blocks.map(() => 1),
    supports: [m.pointA, m.pointB].filter(Boolean),
    joints: m.joints,
  });
  assert.doesNotMatch(inp, /could not be identified/,
    'every joint of a closed ring should be found');
  assert.doesNotMatch(inp, /degenerate element/);

  const parts = parseParts(inp);
  assert.equal(parts.size, m.blocks.length);
  for (const [name, part] of parts) {
    assert.ok(part.elements.size > 1, `${name} is divided, not one element`);
    for (const e of part.elements.values()) {
      const p = e.ids.map((id) => part.nodes.get(id));
      const worst = e.type === 'C3D8'
        ? hexCornerJacobian(p)
        : jacobianSign(part.nodes, e.ids, e.type);
      assert.ok(worst > 0, `${name} element ${e.id} (${e.type}) is inside out`);
    }
    for (const which of ['LO', 'HI']) {
      assert.ok(part.surfaces.get(`${name}_CONTACT_${which}`).length,
        `${name} found its ${which} joint face`);
    }
  }
});

test('the grid cuts where a support acts, not near it', () => {
  // A and B are picked on the drawing and land at no round fraction of
  // anything. If the grid cuts only at even divisions, the boundary condition
  // moves to the nearest node --- by however far that is.
  const q = rect(0, 1, 0, 1);
  const inp = abaqusInput({ blocks: [q], weights: [40] }, {
    solids: [extrude(q, 0.5)],
    sections: [q],
    thickness: [0.5],
    supports: [[0.37, 0]],
    joints: [{ a: [0, 0], b: [0, 1] }, { a: [1, 0], b: [1, 1] }],
  });
  const part = parseParts(inp).get('BLOCK_1');
  assert.ok([...part.elements.values()].every((e) => e.type === 'C3D8'));
  const at = [...part.nodes.values()]
    .filter((p) => Math.abs(p[0] - 0.37) < 1e-9 && Math.abs(p[2]) < 1e-9);
  assert.ok(at.length >= 2, 'a node at the support, front and back');

  const nset = inp.match(/\*Nset, nset=SUPPORT_A_B1, instance=BLOCK_1_I\n([^\n]+)/);
  assert.ok(nset, 'the support nset is written');
  for (const id of nset[1].split(',').map((v) => Number(v.trim()))) {
    const p = part.nodes.get(id);
    assert.ok(Math.abs(p[0] - 0.37) < 1e-9 && Math.abs(p[2]) < 1e-9,
      `node ${id} at ${p} is not where the support was asked for`);
  }
});

test('the deck defines no node that no element uses', () => {
  // A grid is laid out before its cells are judged, so a cell thrown out for
  // being degenerate leaves its corners behind. Abaqus DELETES an unconnected
  // node, and a support set built on one then has no members:
  //
  //   NODE SET ASSEMBLY_SUPPORT_A_B8 HAS NO MEMBERS AND WILL BE IGNORED
  //   A BOUNDARY CONDITION HAS BEEN SPECIFIED ON NODE SET ... NOT ACTIVE
  //
  // which is fatal. Example_7 is the case: hand traced, with two cells of
  // 1e-10 volume that have to go.
  const m = fromExample(JSON.parse(readFileSync(
    new URL('./fixtures/matlab/Example_7_San_Francesco.json', import.meta.url), 'utf8')));
  const inp = abaqusInput(m, {
    solids: m.blocks.map((b) => extrude(b, 1)),
    sections: m.blocks,
    thickness: m.blocks.map(() => 1),
    supports: [m.pointA, m.pointB].filter(Boolean),
    joints: m.joints ?? null,
  });
  assert.match(inp, /degenerate element/, 'this example does drop cells');

  const parts = parseParts(inp);
  for (const [name, part] of parts) {
    const used = new Set([...part.elements.values()].flatMap((e) => e.ids));
    for (const id of part.nodes.keys()) {
      assert.ok(used.has(id), `${name} node ${id} belongs to no element`);
    }
  }

  // And every set carrying a boundary condition names nodes that survive.
  const lines = inp.split('\n');
  let seen = 0;
  lines.forEach((line, i) => {
    const h = line.match(/^\*Nset, nset=(\S+), instance=(\w+?)_I$/);
    if (!h) return;
    seen++;
    const ids = [];
    for (let j = i + 1; j < lines.length && !lines[j].startsWith('*'); j++) {
      ids.push(...lines[j].split(',').map((v) => Number(v.trim())).filter(Number.isFinite));
    }
    assert.ok(ids.length, `${h[1]} is written with no members`);
    const part = parts.get(h[2]);
    const used = new Set([...part.elements.values()].flatMap((e) => e.ids));
    ids.forEach((id) => assert.ok(used.has(id),
      `${h[1]} names node ${id}, which no element uses`));
  });
  assert.ok(seen > 0, 'the supports do produce sets');
});
