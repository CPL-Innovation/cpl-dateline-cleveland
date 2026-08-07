// THE STACKS — the corpus as BOOKS. An issue is a bound object with pages you
// turn, not a bag of clippings, and this module is the shape of that shelf.
//
// Three sources, one shape:
//   live      — GET /api/shelf (ingested issues + their whole page structure)
//   committed — derived from the committed real payload when the service is off
//   mock      — hand-authored in data/mockShelf.ts, so the demo shelf is populated
//
// The shelf carries SHAPE only. Page CONTENT is the same published index objects
// the rest of the patron app reads — resolved by `objectsOnPage` below, so the
// reader can never show something the index wouldn't.

import type { Dataset, IndexItem } from './types';

export interface ShelfPage {
  /** printed page number (1-based) */
  page: number;
  /** ContentDM page record — the join key to index objects. null in mock. */
  record: number | null;
  label: string;
  /** the pipeline has read this page */
  ingested: boolean;
  /** objects the pipeline extracted from it */
  objectCount: number;
  /** of those, how many a curator has published */
  publishedCount: number;
  image: string | null;
  thumb: string | null;
  iiifId: string | null;
  /** mock only: explicit object ids on this page (mock items carry no page record) */
  objectIds?: string[];
}

export interface ShelfIssue {
  key: string;
  /** ContentDM compound-issue pointer. The reading-room assistant's scope key —
   *  absent for mock books and for the derived offline shelf, and the chat is
   *  unavailable in exactly those cases. */
  pointer?: number | null;
  title: string;
  serial: string;
  dateLabel: string;
  sortDate: string;
  rightsStatus: string;
  rightsLabel: string | null;
  pageCount: number;
  ingestedPages: number;
  objectCount: number;
  publishedCount: number;
  /** false when we could only see the pages we have read, not the whole issue */
  structureComplete: boolean;
  pages: ShelfPage[];
}

export interface Shelf {
  issues: ShelfIssue[];
  source: 'live' | 'committed' | 'mock';
  note: string;
}

const API = () => 'http://' + location.hostname + ':5170';

/** Live shelf from the ingestion service. Rejects if it is offline. */
export async function fetchShelf(): Promise<Shelf> {
  const r = await fetch(API() + '/api/shelf');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const payload = (await r.json()) as { issues: ShelfIssue[] };
  return {
    issues: payload.issues ?? [],
    source: 'live',
    note: 'INGESTED ISSUES · LIVE FROM POSTGRES · SCANS SERVED BY CPL CONTENTDM IIIF',
  };
}

/**
 * Fallback shelf, derived from whatever the dataset already holds. Only pages
 * with published objects can be seen this way — without the service there is no
 * page_ingests table to ask about the rest of the book, and inventing leaves
 * would be worse than admitting the gap.
 */
export function deriveShelf(dataset: Dataset): Shelf {
  const byIssue = new Map<string, IndexItem[]>();
  for (const it of dataset.indexItems) {
    const key = it.issueId ?? 'unknown-issue';
    (byIssue.get(key) ?? byIssue.set(key, []).get(key)!).push(it);
  }

  const issues: ShelfIssue[] = [...byIssue.entries()].map(([key, items]) => {
    const byPage = new Map<number, IndexItem[]>();
    for (const it of items) {
      const p = it.printedPage ?? 1;
      (byPage.get(p) ?? byPage.set(p, []).get(p)!).push(it);
    }
    const pages: ShelfPage[] = [...byPage.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([page, its]) => ({
        page,
        record: its[0].pageRecord ?? null,
        label: `Page ${page}`,
        ingested: true,
        objectCount: its.length,
        publishedCount: its.length,
        image: its[0].pageImage ?? null,
        thumb: its[0].pageImage ?? null,
        iiifId: its[0].iiifId ?? null,
      }));
    const serial = items[0].serial ?? 'Brooklyn News';
    const dateLabel = items[0].dateLabel ?? '';
    return {
      key,
      title: `${serial}${dateLabel ? ` (${dateLabel})` : ''}`,
      serial,
      dateLabel,
      sortDate: dateLabel,
      rightsStatus: 'open',
      rightsLabel: null,
      pageCount: pages.length,
      ingestedPages: pages.length,
      objectCount: items.length,
      publishedCount: items.length,
      structureComplete: false,
      pages,
    };
  });

  issues.sort((a, b) => a.serial.localeCompare(b.serial) || a.sortDate.localeCompare(b.sortDate));
  return {
    issues,
    source: 'committed',
    note: 'INGESTION SERVICE OFFLINE — SHELF REBUILT FROM THE COMMITTED EXPORT · PAGES WITH PUBLISHED OBJECTS ONLY',
  };
}

/** The published objects printed on one page, in printed order. */
export function objectsOnPage(page: ShelfPage, dataset: Dataset): IndexItem[] {
  if (page.objectIds) {
    // mock: explicit membership, ordered as authored
    const byId = new Map(dataset.indexItems.map((i) => [i.id, i]));
    return page.objectIds.map((id) => byId.get(id)).filter((i): i is IndexItem => !!i);
  }
  if (page.record == null) return [];
  // real: the index array already arrives ordered by (page_record, seq)
  return dataset.indexItems.filter((i) => i.pageRecord === page.record);
}

/** Group a shelf into serials — the shelf's own organising principle. */
export function bySerial(issues: ShelfIssue[]): Array<{ serial: string; issues: ShelfIssue[] }> {
  const m = new Map<string, ShelfIssue[]>();
  for (const i of issues) (m.get(i.serial) ?? m.set(i.serial, []).get(i.serial)!).push(i);
  return [...m.entries()]
    .map(([serial, list]) => ({ serial, issues: list.sort((a, b) => a.sortDate.localeCompare(b.sortDate)) }))
    .sort((a, b) => b.issues.length - a.issues.length || a.serial.localeCompare(b.serial));
}
