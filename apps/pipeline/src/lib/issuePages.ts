// Resolve an issue's page structure (printed page number → ContentDM record) from
// dmGetCompoundObjectInfo, so ANY page of a compound issue is addressable — not
// just the ones the pipeline has already read. Cached in-process; the structure
// is static. Shared by the staff page-picker (/api/issue-pages) and the patron
// shelf (/api/shelf), which needs whole books, gaps included.
import { CDM_QUERY_BASE } from "../config.ts";
import { fetchRetry } from "./http.ts";

export interface IssuePage {
  page: number;
  record: number;
  title: string;
}

const pageCache = new Map<string, IssuePage[]>();

export async function resolveIssuePages(collection: string, pointer: number): Promise<IssuePage[]> {
  const key = `${collection}/${pointer}`;
  if (pageCache.has(key)) return pageCache.get(key)!;
  const res = await fetchRetry(
    `${CDM_QUERY_BASE}?q=dmGetCompoundObjectInfo/${collection}/${pointer}/json`, {},
    { label: `compoundInfo ${pointer}` });
  if (!res.ok) throw new Error(`compoundInfo ${pointer} → HTTP ${res.status}`);
  const d = (await res.json()) as any;
  const pages: IssuePage[] = (Array.isArray(d?.page) ? d.page : d?.page ? [d.page] : []).map(
    (p: any, i: number) => ({
      page: i + 1,
      record: Number(p.pageptr),
      title: String(p.pagetitle ?? `Page ${i + 1}`),
    }),
  );
  pageCache.set(key, pages);
  return pages;
}
