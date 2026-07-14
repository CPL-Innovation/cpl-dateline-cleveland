// Facet matching, ported from the prototype's matches(): multi-select WITHIN a
// group (OR), intersected ACROSS groups (AND). Visual facets additionally gate
// on the item being visual.

import type { FacetGroup, IndexItem } from './types';

export type Selection = Record<string, boolean>;

export function matches(item: IndexItem, sel: Selection, facetDefs: FacetGroup[]): boolean {
  const groups: Record<string, string[]> = { topic: [], name: [], type: [], visual: [] };
  for (const g of facetDefs) {
    for (const v of g.values) if (sel[v.id]) groups[g.key].push(v.id);
  }
  if (groups.topic.length && !groups.topic.some((id) => item.topics.includes(id))) return false;
  if (groups.name.length && !groups.name.some((id) => item.names.includes(id))) return false;
  if (groups.type.length && !groups.type.includes(item.type)) return false;
  if (groups.visual.length) {
    if (!item.isVisual) return false;
    const ok = groups.visual.includes('v-all') || (item.vis != null && groups.visual.includes(item.vis));
    if (!ok) return false;
  }
  return true;
}

export function isVisualMode(sel: Selection, facetDefs: FacetGroup[]): boolean {
  const visual = facetDefs.find((g) => g.key === 'visual');
  return !!visual && visual.values.some((v) => sel[v.id]);
}

export function anySelected(sel: Selection): boolean {
  return Object.values(sel).some(Boolean);
}

export function activeLabels(sel: Selection, facetDefs: FacetGroup[]): string[] {
  const out: string[] = [];
  for (const g of facetDefs) for (const v of g.values) if (sel[v.id]) out.push(v.label.toUpperCase());
  return out;
}
