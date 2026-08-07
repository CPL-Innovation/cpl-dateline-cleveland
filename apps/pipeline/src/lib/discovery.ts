// Aggregate the whole Postgres store into the patron-discovery payload shape
// (the same contract export-real-data.mjs produced from SQLite — now LIVE, and
// multi-issue: every ingested page contributes, with per-object date/serial/page
// so stamps read correctly across issues).
import { query } from "./pg.ts";
import { iiifId, iiifImageUrl } from "../config.ts";
import { resolveTitle } from "./title.ts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dateLabel(sort: string | null): string {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(sort || "");
  if (!m) return (sort || "").toUpperCase() || "UNDATED";
  return `${MONTHS[+m[2] - 1]} ${+m[3]} ${m[1]}`;
}

/** One stored region, in either shape, as normalized rects a surface can draw.
 *
 *  The column holds EITHER the OCR-anchored shape written by ocrAnchor.ts
 *  (`{rects:[[x,y,w,h],…], source, continuedIn}`) or a legacy single VLM estimate
 *  (`[x,y,w,h]`), both normalized 0–1. Patron surfaces get one shape and the
 *  PROVENANCE of the box — a curator-drawn region and a machine guess look
 *  identical on screen unless the data says which it is.
 */
function regionOf(bb: unknown): { rects: number[][]; source: string; continuedIn: number } | null {
  const rect = (r: unknown): number[] | null => {
    if (!Array.isArray(r) || r.length < 4) return null;
    let [x, y, w, h] = r.map(Number);
    if (![x, y, w, h].every(Number.isFinite)) return null;
    if (Math.max(x, y, w, h) > 1.2 || w <= 0 || h <= 0) return null;   // not normalized → unusable
    x = Math.min(1, Math.max(0, x)); y = Math.min(1, Math.max(0, y));
    return [x, y, Math.min(w, 1 - x), Math.min(h, 1 - y)];
  };
  if (!bb) return null;
  if (Array.isArray(bb)) {
    const one = rect(bb);
    return one ? { rects: [one], source: "vlm", continuedIn: 0 } : null;
  }
  const o = bb as { rects?: unknown; source?: string; continuedIn?: number };
  if (!Array.isArray(o.rects)) return null;
  const rects = o.rects.map(rect).filter((r): r is number[] => !!r);
  if (!rects.length) return null;
  return {
    rects,
    source: o.source ?? "ocr-anchor",
    // A COUNT of column runs the anchor found and deliberately did not store —
    // it is what stops a partial box reading as the whole story.
    continuedIn: o.continuedIn ?? 0,
  };
}

export async function getDiscovery() {
  const objs = await query<any>(
    // Patrons read the corrected text where a curator has supplied one — the raw
    // machine read stays in co.text, it just isn't what the public surface shows.
    `SELECT co.id, co.issue_id, co.page_record, co.seq, co.object_class, co.role,
            COALESCE(co.text_human, co.text) AS text, co.display_title, co.display_title_model, co.region_bbox,
            co.is_publication_content, co.occurrences, co.transcription_confidence, co.run_id, co.model,
            co.enrichment_tier, co.article_type, co.is_advertorial, co.summary, co.context_hint, co.event_type, co.tags,
            pi.page_number, i.serial, i.sort_date
     FROM content_objects co
     LEFT JOIN page_ingests pi ON pi.page_record = co.page_record
     LEFT JOIN issues i ON i.pointer = pi.issue_pointer
     WHERE co.is_published
     ORDER BY co.page_record, co.seq`);

  const ids = objs.rows.map((o) => o.id);
  const topics = ids.length ? await query<any>(
    `SELECT ot.object_id oid, t.topic_id tid, t.name, ot.confidence, ot.rank
     FROM object_topics ot JOIN topics t ON t.topic_id=ot.topic_id
     WHERE ot.object_id = ANY($1) ORDER BY ot.object_id, ot.rank`, [ids]) : { rows: [] as any[] };
  const names = ids.length ? await query<any>(
    `SELECT oe.object_id oid, e.entity_id eid, e.name, e.entity_type
     FROM object_entities oe JOIN entities e ON e.entity_id=oe.entity_id
     WHERE oe.object_id = ANY($1)`, [ids]) : { rows: [] as any[] };
  const tByObj = new Map<number, any[]>(), nByObj = new Map<number, any[]>();
  for (const r of topics.rows) (tByObj.get(r.oid) ?? tByObj.set(r.oid, []).get(r.oid))!.push({ id: `t-${r.tid}`, label: r.name, confidence: r.confidence });
  for (const r of names.rows) (nByObj.get(r.oid) ?? nByObj.set(r.oid, []).get(r.oid))!.push({ id: `n-${r.eid}`, label: r.name, type: r.entity_type });

  const objects = objs.rows.map((r) => ({
    id: `co-${r.id}`, issueId: r.issue_id, page: r.page_record, printedPage: r.page_number ?? 1,
    serial: r.serial ?? "Brooklyn News", dateLabel: dateLabel(r.sort_date), seq: r.seq,
    objectClass: r.object_class, role: r.role, text: r.text, bbox: null,
    // Where this object sits on the page, normalized — the scan reader draws it.
    region: regionOf(r.region_bbox),
    // Resolved once, here — the patron app renders what it is given and never
    // promotes a body line to a headline on its own. null = this one has no title.
    ...resolveTitle(r.text, r.display_title, r.display_title_model),
    isPublicationContent: r.is_publication_content, occurrences: r.occurrences, confidence: r.transcription_confidence,
    runId: r.run_id, model: r.model, enrichmentTier: r.enrichment_tier, articleType: r.article_type,
    isAdvertorial: r.is_advertorial, summary: r.summary, contextHint: r.context_hint, eventType: r.event_type,
    tags: r.tags ?? [], topics: tByObj.get(r.id) ?? [], names: nByObj.get(r.id) ?? [],
    pageImage: iiifImageUrl(r.page_record, "1600,"), iiifId: iiifId(r.page_record),
  }));

  // Facet counts and events are counted over PUBLISHED objects only — a facet that
  // says "Churches & Religion (14)" and then shows four results is worse than no
  // facet at all, and an event sourced from an unpublished object would be a hole
  // in the site's own citation trail.
  const topicFacet = (await query<any>(
    `SELECT t.topic_id tid, t.name, COUNT(DISTINCT ot.object_id) c
     FROM object_topics ot JOIN topics t ON t.topic_id=ot.topic_id
     JOIN content_objects co ON co.id=ot.object_id AND co.is_published
     GROUP BY t.topic_id, t.name ORDER BY c DESC, t.name`)).rows.map((r) => ({ id: `t-${r.tid}`, label: r.name, count: Number(r.c) }));
  const nameFacet = (await query<any>(
    `SELECT e.entity_id eid, e.name, e.entity_type, COUNT(DISTINCT oe.object_id) c
     FROM object_entities oe JOIN entities e ON e.entity_id=oe.entity_id
     JOIN content_objects co ON co.id=oe.object_id AND co.is_published
     GROUP BY e.entity_id, e.name, e.entity_type HAVING COUNT(DISTINCT oe.object_id) >= 2
     ORDER BY c DESC, e.name LIMIT 15`)).rows.map((r) => ({ id: `n-${r.eid}`, label: r.name, count: Number(r.c), type: r.entity_type }));
  const events = (await query<any>(
    `SELECT ev.event_id, ev.title, ev.event_type, ev.venue, ev.start_text, ev.recurrence_text,
            ev.performers, ev.price_text, ev.confidence, co.page_record, pi.page_number, i.serial, i.sort_date,
            co.object_class, co.summary
     FROM events ev JOIN content_objects co ON co.id=ev.source_object_id
     LEFT JOIN page_ingests pi ON pi.page_record=co.page_record
     LEFT JOIN issues i ON i.pointer=pi.issue_pointer
     WHERE co.is_published
     ORDER BY co.page_record, co.seq`)).rows.map((r) => ({
    id: `ev-${r.event_id}`, title: r.title, eventType: r.event_type, venue: r.venue,
    startText: r.start_text, recurrenceText: r.recurrence_text, performers: r.performers ?? [],
    priceText: r.price_text, confidence: r.confidence, sourcePage: r.page_record, printedSourcePage: r.page_number ?? 1,
    serial: r.serial ?? "Brooklyn News", dateLabel: dateLabel(r.sort_date), sourceClass: r.object_class, sourceSummary: r.summary,
    pageImage: iiifImageUrl(r.page_record, "1600,"), iiifId: iiifId(r.page_record),
  }));

  const pageCount = new Set(objs.rows.map((o) => o.page_record)).size;
  const issueCount = new Set(objs.rows.map((o) => o.issue_id)).size;
  return {
    generatedAt: `LIVE Postgres · ${objects.length} objects`, live: true, provider: "anthropic",
    enriched: true, multiIssue: issueCount > 1,
    source: { kind: "contentdm-iiif", collection: "p16014coll5", server: "cdm16014.contentdm.oclc.org", pageCount },
    issue: null, issueCount, pageCount,
    pages: [...new Set(objs.rows.map((o) => o.page_record))].sort((a, b) => a - b),
    objects, topicFacet, nameFacet, events,
  };
}
