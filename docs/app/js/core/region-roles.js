/** A region's role belongs to its group; old projects are structural by default. */
export const REGION_ROLES = ['structure', 'load', 'fixed'];
export const REGION_ROLE_LABELS = { structure: 'Structure', load: 'Load only', fixed: 'Fixed boundary' };

export function blockRole(model, index) {
  const role = model?.groups?.find((g) => g.id === model.blockGroups?.[index])?.role;
  return REGION_ROLES.includes(role) ? role : 'structure';
}

/** Subset geometry without changing original indices or editable source data.
 * Analysis sections can reorder/merge it later; sourceIds keeps ownership stable.
 */
export function structuralRegions(model) {
  if (!model) return null;
  const ids = (model.blocks ?? []).map((_, i) => i).filter((i) => blockRole(model, i) === 'structure');
  if (ids.length === (model.blocks ?? []).length) return model;
  const out = { ...model, sourceIds: ids, joints: null, pointA: null, pointB: null,
    forcePolygon: null, thrustLine: null };
  for (const field of ['blocks', 'centroids', 'areas', 'weights', 'thickness', 'blockGroups']) {
    out[field] = ids.map((i) => model[field]?.[i]);
  }
  return out;
}

export function remapRegionSources(section, original) {
  if (!section || !original?.sourceIds) return section;
  return { ...section, sources: (section.sources ?? section.blocks.map((_, i) => [i]))
    .map((ids) => ids.map((i) => original.sourceIds[i])) };
}
