/** Rendering ownership only: load geometry follows its receiver without
 * adding rigid bodies, hinges, masses or contact constraints to the solver. */
import { blockRole } from './region-roles.js';

export function regionBodyAssignments(source, section, bodyOf, transfers = []) {
  const bodies = (source?.blocks ?? []).map(() => -1);
  (section?.sources ?? (section?.blocks ?? []).map((_, i) => [i])).forEach((ids, k) => {
    for (const i of ids) if (blockRole(source, i) === 'structure') bodies[i] = bodyOf[k] ?? -1;
  });
  for (const t of transfers) if (blockRole(source, t.source) === 'load') bodies[t.source] = bodies[t.owner] ?? -1;
  return bodies;
}

export function regionMotionGeometry(source, section, bodyOf, transfers = []) {
  const bodies = regionBodyAssignments(source, section, bodyOf, transfers);
  const active = new Set((section.sources ?? section.blocks.map((_, i) => [i])).flat());
  const loads = transfers.filter((t) => active.has(t.owner)).map((t) => t.source);
  return { blocks: [...section.blocks, ...loads.map((i) => source.blocks[i])],
    bodyOf: [...bodyOf, ...loads.map((i) => bodies[i])], loads };
}
