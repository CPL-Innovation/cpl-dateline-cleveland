// The hand-authored shelf behind MOCK mode's THE STACKS.
//
// The mock index is deliberately scattered across eight decades — twelve clippings
// from twelve different papers — so a shelf cannot be derived from it. These three
// books gather the clippings that DO share an issue, and give them the bound object
// they were printed in: a Scene entertainment weekly, a pennant-week Brooklyn News,
// and a Depression-era strike issue.
//
// Mock pages carry no scan (there is no real page behind them) — the reader falls
// back to the same striped clipping placeholder the rest of the demo uses. Pages
// with no authored clipping stand as leaves the pipeline "hasn't read yet", which
// is exactly the state the real shelf shows for a half-ingested issue.

import type { Shelf, ShelfIssue, ShelfPage } from '../lib/shelf';

function book(
  spec: Omit<ShelfIssue, 'pages' | 'pageCount' | 'ingestedPages' | 'objectCount' | 'publishedCount' | 'structureComplete'> & {
    pageCount: number;
    contents: Record<number, string[]>;
  },
): ShelfIssue {
  const pages: ShelfPage[] = Array.from({ length: spec.pageCount }, (_, i) => {
    const page = i + 1;
    const ids = spec.contents[page] ?? [];
    return {
      page,
      record: null,
      label: `Page ${page}`,
      ingested: ids.length > 0,
      objectCount: ids.length,
      publishedCount: ids.length,
      image: null,
      thumb: null,
      iiifId: null,
      objectIds: ids,
    };
  });
  const read = pages.filter((p) => p.ingested);
  return {
    key: spec.key,
    title: spec.title,
    serial: spec.serial,
    dateLabel: spec.dateLabel,
    sortDate: spec.sortDate,
    rightsStatus: spec.rightsStatus,
    rightsLabel: spec.rightsLabel,
    pageCount: spec.pageCount,
    ingestedPages: read.length,
    objectCount: read.reduce((n, p) => n + p.objectCount, 0),
    publishedCount: read.reduce((n, p) => n + p.publishedCount, 0),
    structureComplete: true,
    pages,
  };
}

const issues: ShelfIssue[] = [
  book({
    key: 'mock-scene-1970-07-23',
    title: 'Cleveland Scene, Vol. 1, No. 12 (1970-07-23)',
    serial: 'Cleveland Scene',
    dateLabel: 'Jul 23 1970',
    sortDate: '1970-07-23',
    rightsStatus: 'open',
    rightsLabel: null,
    pageCount: 16,
    contents: { 12: ['r3'], 14: ['r6'] },
  }),
  book({
    key: 'mock-brooklynnews-1954-09-27',
    title: 'The Brooklyn News, Vol. 40, Issue 39 (1954-09-27)',
    serial: 'The Brooklyn News',
    dateLabel: 'Sep 27 1954',
    sortDate: '1954-09-27',
    rightsStatus: 'open',
    rightsLabel: null,
    pageCount: 12,
    contents: { 1: ['r11'], 10: ['r12'] },
  }),
  book({
    key: 'mock-brooklynnews-1937-03-14',
    title: 'The Brooklyn News, Vol. 23, Issue 11 (1937-03-14)',
    serial: 'The Brooklyn News',
    dateLabel: 'Mar 14 1937',
    sortDate: '1937-03-14',
    rightsStatus: 'open',
    rightsLabel: null,
    pageCount: 8,
    contents: { 1: ['r1'], 3: ['r2'] },
  }),
];

export const mockShelf: Shelf = {
  issues,
  source: 'mock',
  note: 'CONCEPT DEMO · THREE HAND-AUTHORED ISSUES · PAGE SCANS STAND IN AS PLACEHOLDERS',
};
