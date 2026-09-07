import { test } from 'node:test';
import assert from 'node:assert/strict';

import { abaqusInput } from '../docs/app/js/core/abaqus.js';
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
