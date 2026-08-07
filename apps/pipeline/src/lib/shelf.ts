// The patron SHELF payload — the corpus as BOOKS rather than as clippings.
//
// One entry per INGESTED issue (a page the pipeline has actually read is what puts
// an issue on the shelf), carrying the issue's whole page structure so a book has
// no missing leaves: pages the pipeline hasn't read yet are still turnable as
// scans, they just carry nothing extracted. Two counts travel with every page and
// the reader renders them honestly:
//
//   objectCount     — objects the pipeline extracted from this page
//   publishedCount  — of those, how many a curator has released (Principle 15)
//
// The formatted read view is built from PUBLISHED objects only; it reads the same
// /api/discovery payload the index does. This endpoint supplies the SPINES and the
// PAGE STRUCTURE, not the text — one contract for content, one for shape.
import { query } from "./pg.ts";
import { iiifId, iiifImageUrl } from "../config.ts";
import { resolveIssuePages } from "./issuePages.ts";
import { dateLabel } from "./discovery.ts";

interface Row {
  issue_pointer: number | null;
  issue_id: string;
  collection: string;
  page_record: number;
  page_number: number | null;
  object_count: number;
  published: string; // bigint from count(*)
  title: string | null;
  serial: string | null;
  sort_date: string | null;
  rights_status: string | null;
  rights_label: string | null;
  page_count: number | null;
}

export interface ShelfPage {
  page: number;
  record: number;
  label: string;
  ingested: boolean;
  objectCount: number;
  publishedCount: number;
  image: string | null;
  thumb: string | null;
  iiifId: string | null;
}

export interface ShelfIssue {
  key: string;
  pointer: number | null;
  collection: string;
  issueId: string;
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
  /** false when ContentDM's compound-object info could not be reached — the book
   *  then holds only the pages we have read, and the UI says so. */
  structureComplete: boolean;
  pages: ShelfPage[];
}

export async function getShelf(): Promise<{ issues: ShelfIssue[]; generatedAt: string; live: boolean }> {
  const rows = (await query<Row>(
    `SELECT pi.issue_pointer, pi.issue_id, pi.collection, pi.page_record, pi.page_number,
            pi.object_count,
            (SELECT count(*) FROM content_objects co
              WHERE co.page_record = pi.page_record AND co.is_published) AS published,
            i.title, i.serial, i.sort_date, i.rights_status, i.rights_label, i.page_count
       FROM page_ingests pi
       LEFT JOIN issues i ON i.pointer = pi.issue_pointer
      WHERE pi.status = 'done'
      ORDER BY i.sort_date NULLS LAST, pi.issue_id, pi.page_number`)).rows;

  // Group by POINTER where we have one. Two page_ingests rows can carry different
  // human issue_ids for the same compound issue (an id-slug change between runs);
  // grouping on the id alone would shelve the same paper twice, each missing the
  // other's pages.
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.issue_pointer != null ? `p${r.issue_pointer}` : `i${r.issue_id}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  const issues = await Promise.all([...groups.entries()].map(async ([key, rs]) => {
    const head = rs[0];
    const open = (head.rights_status ?? "unknown") === "open";

    // Read pages keyed by printed page number; the pipeline may have read them out
    // of order (p.1 of one run, p.2 of another).
    const readByNum = new Map<number, Row>();
    for (const r of rs) readByNum.set(r.page_number ?? 0, r);

    // The whole book, when ContentDM will tell us its shape. Never for a
    // non-open issue — an in-copyright scan must not be turnable here.
    let structure: Array<{ page: number; record: number; title: string }> = [];
    let structureComplete = false;
    if (head.issue_pointer != null && open) {
      try {
        structure = await resolveIssuePages(head.collection, head.issue_pointer);
        structureComplete = structure.length > 0;
      } catch {
        structure = [];
      }
    }
    if (!structureComplete) {
      structure = rs
        .map((r) => ({ page: r.page_number ?? 0, record: r.page_record, title: `Page ${r.page_number ?? "?"}` }))
        .sort((a, b) => a.page - b.page);
    }

    const pages: ShelfPage[] = structure.map((s) => {
      const read = readByNum.get(s.page);
      return {
        page: s.page,
        record: s.record,
        label: s.title,
        ingested: !!read,
        objectCount: read?.object_count ?? 0,
        publishedCount: read ? Number(read.published) : 0,
        // Rights gate: no pixels for anything not cleared open, ingested or not.
        image: open ? iiifImageUrl(s.record, "1600,") : null,
        thumb: open ? iiifImageUrl(s.record, "220,") : null,
        iiifId: open ? iiifId(s.record) : null,
      };
    });

    return {
      key,
      pointer: head.issue_pointer,
      collection: head.collection,
      issueId: head.issue_id,
      title: head.title ?? head.issue_id,
      serial: head.serial ?? "Unknown serial",
      dateLabel: dateLabel(head.sort_date),
      sortDate: head.sort_date ?? "",
      rightsStatus: head.rights_status ?? "unknown",
      rightsLabel: head.rights_label,
      pageCount: head.page_count ?? pages.length,
      ingestedPages: rs.length,
      objectCount: rs.reduce((n, r) => n + (r.object_count ?? 0), 0),
      publishedCount: rs.reduce((n, r) => n + Number(r.published), 0),
      structureComplete,
      pages,
    } satisfies ShelfIssue;
  }));

  issues.sort((a, b) => a.serial.localeCompare(b.serial) || a.sortDate.localeCompare(b.sortDate));
  return { issues, generatedAt: `LIVE Postgres · ${issues.length} issues`, live: true };
}
