/** Frictionless unilateral contact with fixed planar regions. Contact reactions
 * do no virtual work; only motions into fixed material are inadmissible. */
import { piecesOf, signedArea } from './geometry.js';
import { blockRole } from './region-roles.js';
import { blockLayerKey } from './layers.js';
import { vertices, geometricTolerance, onSegment, strictlyInside, polygonsOverlap } from './region-geometry.js';

export function boundaryConstraints(source, section) {
  const constraints = [], issues = [];
  if (!source || !section) return { constraints, issues };
  const fixed = source.blocks.map((_, i) => i).filter((i) => blockRole(source, i) === 'fixed');
  if (!fixed.length) return { constraints, issues };
  const tol = geometricTolerance(source.blocks.flatMap(piecesOf)), seen = new Set();
  const add = (c) => {
    const key = [c.block, c.fixed, ...c.point, ...(c.normal ?? [c.sign, c.polygon.x.join(',')])].join('|');
    if (!seen.has(key)) { seen.add(key); constraints.push(c); }
  };
  (section.sources ?? section.blocks.map((_, i) => [i])).forEach((ids, block) => {
    for (const i of ids) for (const j of fixed.filter((k) => blockLayerKey(source, k) === blockLayerKey(source, i))) {
      for (const moving of piecesOf(source.blocks[i])) for (const obstacle of piecesOf(source.blocks[j])) {
        if (polygonsOverlap(moving, obstacle, tol)) {
          issues.push({ layer: blockLayerKey(source, i), reason: `Structural block #${i + 1} initially overlaps fixed block #${j + 1}.` }); continue;
        }
        const common = { block, source: i, fixed: j };
        const collect = (pointsPoly, edgePoly, sign) => {
          const pts = vertices(pointsPoly), edge = vertices(edgePoly), orientation = Math.sign(signedArea(edgePoly));
          for (const p of pts) {
            const incident = edge.map((a, k) => ({ a, b: edge[(k + 1) % edge.length] })).filter(({ a, b }) => onSegment(p, a, b, tol));
            if (!incident.length) continue;
            const atCorner = incident.length > 1;
            if (atCorner) { add({ ...common, point: p, polygon: edgePoly, sign, tol }); continue; }
            const { a, b } = incident[0], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            add({ ...common, point: p, normal: [sign * orientation * (b[1] - a[1]) / len, -sign * orientation * (b[0] - a[0]) / len] });
          }
        };
        collect(moving, obstacle, 1);
        collect(obstacle, moving, -1);
      }
    }
  });
  return { constraints, issues };
}

export function boundaryMotionAllowed(constraints, bodyOf, motions, sense = 1, fixedTranslations = null) {
  let fastest = 0, lowest = 0;
  for (const c of constraints ?? []) {
    const index = typeof bodyOf === 'function' ? bodyOf(c.block) : bodyOf[c.block];
    const m = motions[index] ?? (fixedTranslations ? { vx: 0, vy: 0, omega: 0 } : null);
    if (!m) continue;
    const d = fixedTranslations?.[c.fixed] ?? [0, 0];
    const x = sense * (m.vx == null ? -m.omega * (c.point[1] - m.oy) : m.vx - m.omega * c.point[1]) - d[0];
    const y = sense * (m.vy == null ? m.omega * (c.point[0] - m.ox) : m.vy + m.omega * c.point[0]) - d[1];
    const speed = Math.hypot(x, y); fastest = Math.max(fastest, speed);
    if (c.normal) lowest = Math.min(lowest, x * c.normal[0] + y * c.normal[1]);
    else if (speed > 0) {
      // At a corner, entering material is a tangent-cone test, rather than
      // imposing both face normals (which would forbid legitimate detachment).
      const step = c.tol * 32 / speed;
      if (strictlyInside([c.point[0] + c.sign * x * step, c.point[1] + c.sign * y * step], c.polygon, c.tol)) lowest = Math.min(lowest, -speed);
    }
  }
  return lowest >= -Math.max(fastest * 1e-9, 1e-14);
}

export function boundaryCollision(source, section, moved) {
  const fixed = source.blocks.map((_, i) => i).filter((i) => blockRole(source, i) === 'fixed');
  if (!fixed.length) return false;
  const tol = geometricTolerance(source.blocks.flatMap(piecesOf));
  return moved.some((b, k) => fixed.some((j) => (section.sources?.[k] ?? [k]).some((i) =>
    blockLayerKey(source, i) === blockLayerKey(source, j)) && piecesOf(b).some((p) =>
    piecesOf(source.blocks[j]).some((q) => polygonsOverlap(p, q, tol)))));
}
