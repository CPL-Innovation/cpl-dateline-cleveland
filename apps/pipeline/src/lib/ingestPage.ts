// SLICE-08 — ingest ONE page live, end to end, into Postgres.
//   harvest (ContentDM IIIF) → VLM transcription → object assembly → tiered
//   enrichment → persist (raw immutable + enrichment overlay). Emits progress so
//   the review panel can stream it. Rights-gated and idempotent.
//
// The slow AI work (VLM + enrichment) runs BEFORE the DB transaction, so we never
// hold a Postgres transaction open across a multi-minute model call.
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fetchRetry } from "./http.ts";
import { vlmExtract } from "./vlmExtract.ts";
import { explodePage } from "./explode.ts";
import { enrichObject, enrichObjectOptional, type EnrichResult } from "./enrichAdapter.ts";
import { CONTROLLED_TOPICS, type LightPayload } from "./enrich-prompt.ts";
import { locateObjects } from "./ocrAnchor.ts";
import { query, tx } from "./pg.ts";
import { resolveTitle } from "./title.ts";
import { iiifId, iiifImageUrl, PROMPT_VERSION, ENRICH_PROMPT_VERSION, OCR_ENABLED } from "../config.ts";
import type { PoolClient } from "pg";

export interface IngestArgs {
  collection: string;
  issuePointer: number | null;
  issueId: string;
  pageRecord: number;
  pageNumber: number;
  force?: boolean;
}
export type Progress = (e: { phase: string; message: string; pct?: number }) => void;

export class RightsBlocked extends Error {}

// ── enrichment routing (ported from enrich.ts; kept identical) ────────────────
const CAPTURE_ONLY = new Set(["filler_slug", "manuscript_annotation", "masthead", "illustration", "caption"]);
const STRUCTURED = new Set(["classified_section", "legal_notice"]);
function slug(s: string): string {
  return s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function deterministicLight(text: string): LightPayload {
  const firstLine = (text.split("\n").find((l) => l.trim()) ?? "").trim();
  const advertiser = firstLine.split(/ — |[.:]| - /)[0].trim().slice(0, 80) || null;
  const phone = text.match(/\b(?:Lincoln|LINC\.?)\s*[\d][\d-]*[A-Z]?\b/i);
  const addr = text.match(/\b\d{3,5}\s+[A-Z][A-Za-z.]+(?:\s+[A-Z][A-Za-z.]+){0,3}\s+(?:Rd|Road|Ave|Avenue|St|Street|Blvd)\b/);
  const prices = [...text.matchAll(/\$[\d,]+(?:\.\d\d)?|\b\d{1,3}c\b/g)].map((m) => m[0]);
  return { advertiser, ad_category: null, contact_phone: phone ? phone[0] : null, address: addr ? addr[0] : null, prices: [...new Set(prices)].slice(0, 8), is_event_bearing: false };
}
function structuredPayload(cls: string, text: string): Record<string, unknown> {
  if (cls === "classified_section") {
    const m = text.match(/\n([\s\S]*?)\n\s*\n/);
    const categories = (m ? m[1] : "").split(";").map((s) => s.trim()).filter(Boolean);
    return { listing_type: "classified_directory", banner: (text.split("\n")[0] || "").trim(), categories, category_count: categories.length, exclude_from_fulltext: false };
  }
  const t = text.toLowerCase();
  const legalType = t.includes("bond") ? "bond_schedule" : t.includes("financial statement") || t.includes("assets") ? "financial_statement" : "resolution";
  return { structured_type: legalType, is_low_value_fulltext: legalType !== "resolution", exclude_from_fulltext: false };
}

// Bounded-concurrency map so a page's per-object enrichment calls run in parallel.
async function pMap<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

interface AssembledRow {
  issue_id: string; page_record: number; seq: number; object_class: string;
  role: string | null; text: string; region_bbox: string | null;
  is_publication_content: number; occurrences: number; transcription_confidence: number | null;
  run_id: string; model: string; created_at: string;
}
type Tier = "heavy" | "light" | "structured" | "capture_only";
interface Enriched { tier: Tier; heavy?: EnrichResult; light?: LightPayload; }

// ── rights gate (server-side source of truth) ─────────────────────────────────
async function assertIngestable(pointer: number | null): Promise<{ status: string; label: string | null }> {
  if (pointer == null) return { status: "unknown", label: null };
  const r = await query<{ rights_status: string; rights_label: string | null }>(
    "SELECT rights_status, rights_label FROM issues WHERE pointer = $1", [pointer],
  );
  const row = r.rows[0];
  if (!row) return { status: "unknown", label: null };
  if (row.rights_status === "in_copyright") {
    throw new RightsBlocked(`In-copyright — enrichment blocked (${row.rights_label ?? "In Copyright"}).`);
  }
  return { status: row.rights_status, label: row.rights_label };
}

async function existingPage(collection: string, pageRecord: number) {
  const r = await query<{ status: string; object_count: number }>(
    "SELECT status, object_count FROM page_ingests WHERE collection=$1 AND page_record=$2",
    [collection, pageRecord],
  );
  return r.rows[0] ?? null;
}

export async function ingestPage(args: IngestArgs, onProgress: Progress = () => {}) {
  const { collection, issuePointer, issueId, pageRecord, pageNumber } = args;

  onProgress({ phase: "rights", message: "Checking rights…", pct: 2 });
  await assertIngestable(issuePointer);

  const prior = await existingPage(collection, pageRecord);
  if (prior && prior.status === "done" && !args.force) {
    onProgress({ phase: "done", message: `Already ingested (${prior.object_count} objects).`, pct: 100 });
    return { alreadyDone: true, ...(await getPageObjects(collection, pageRecord)) };
  }

  const runId = `slice08_anthropic_p${pageRecord}`;
  const createdAt = new Date().toISOString();
  await query(
    `INSERT INTO page_ingests (collection, issue_pointer, issue_id, page_record, page_number, status, run_id, started_at)
     VALUES ($1,$2,$3,$4,$5,'running',$6, now())
     ON CONFLICT (collection, page_record)
     DO UPDATE SET status='running', run_id=$6, started_at=now(), error=NULL`,
    [collection, issuePointer, issueId, pageRecord, pageNumber, runId],
  );

  const tmp = resolve(tmpdir(), `ingest_${collection}_${pageRecord}.jpg`);
  try {
    // 1) harvest full-res page image from ContentDM IIIF
    onProgress({ phase: "harvest", message: "Harvesting page image from ContentDM…", pct: 8 });
    const imgRes = await fetchRetry(iiifImageUrl(pageRecord, "full"), {}, { label: `IIIF full ${pageRecord}` });
    if (!imgRes.ok) throw new Error(`IIIF image ${pageRecord} → HTTP ${imgRes.status}`);
    await writeFile(tmp, Buffer.from(await imgRes.arrayBuffer()));

    // 2) VLM transcription (the long pole; streams internally)
    onProgress({ phase: "transcribe", message: "Transcribing the page with the VLM…", pct: 20 });
    const vlm = await vlmExtract({ imagePath: tmp, pageRecord, pageNumber, provider: "anthropic" });

    // 3) assemble into content-object rows
    onProgress({ phase: "assemble", message: `Assembling ${vlm.blocks.length} blocks into objects…`, pct: 55 });
    const rows = explodePage({ blocks: vlm.blocks, issueId, pageRecord, runId, model: vlm.model, createdAt }) as AssembledRow[];

    // 3b) LOCATE — replace the VLM's estimated region_bbox with one anchored to
    //     OCR word coordinates. Non-fatal by design: if Tesseract is missing we
    //     keep the VLM's guess rather than losing the page.
    onProgress({ phase: "locate", message: "Locating regions against OCR…", pct: 58 });
    applyOcrRegions(tmp, rows, onProgress);

    // 4) tiered enrichment (parallel, bounded)
    onProgress({ phase: "enrich", message: `Enriching ${rows.length} objects…`, pct: 62 });
    const enriched = await pMap(rows, 5, async (o): Promise<Enriched> => {
      if (CAPTURE_ONLY.has(o.object_class)) return { tier: "capture_only" };
      if (o.object_class === "article") {
        return { tier: "heavy", heavy: await enrichObject(eargs(o)) };
      }
      if (o.object_class === "advertisement") {
        const r = await enrichObjectOptional(eargs(o));
        if (r && (r.enrichment as any).is_event_bearing) return { tier: "heavy", heavy: r };
        return { tier: "light", light: deterministicLight(o.text) };
      }
      if (o.object_class === "coupon") return { tier: "light", light: deterministicLight(o.text) };
      if (STRUCTURED.has(o.object_class)) return { tier: "structured" };
      return { tier: "capture_only" };
    });

    // 5) persist — raw + overlay, atomically
    onProgress({ phase: "persist", message: "Saving to Postgres…", pct: 92 });
    const count = await tx(async (c) => {
      // fresh page: clear any prior rows for this page (idempotent re-ingest)
      await c.query("DELETE FROM content_objects WHERE page_record=$1 AND issue_id=$2", [pageRecord, issueId]);
      for (let i = 0; i < rows.length; i++) await persistObject(c, rows[i], enriched[i], issueId);
      await c.query(
        `UPDATE page_ingests SET status='done', object_count=$1, vlm_model=$2, enrich_model=$3, finished_at=now()
         WHERE collection=$4 AND page_record=$5`,
        [rows.length, vlm.model, "claude-sonnet-5", collection, pageRecord],
      );
      return rows.length;
    });

    onProgress({ phase: "done", message: `Ingested ${count} objects.`, pct: 100 });
    return { alreadyDone: false, ...(await getPageObjects(collection, pageRecord)) };
  } catch (e) {
    await query("UPDATE page_ingests SET status='error', error=$1, finished_at=now() WHERE collection=$2 AND page_record=$3",
      [(e as Error).message.slice(0, 500), collection, pageRecord]);
    throw e;
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

// Overwrite each row's region_bbox with an OCR-anchored Region. Mutates `rows`.
// Silent no-op when OCR_ENABLED=0; a warning (not a throw) when OCR is missing or
// the page is unreadable — a page with weak regions still ingests fine.
export function applyOcrRegions(imagePath: string, rows: AssembledRow[], onProgress: Progress = () => {}) {
  if (!OCR_ENABLED || rows.length === 0) return { located: 0, total: rows.length };
  try {
    const { regions, meanConf, columns } = locateObjects(imagePath, rows.map((r) => r.text));
    let located = 0;
    for (let i = 0; i < rows.length; i++) {
      // A located region wins; otherwise store null rather than falling back to
      // the VLM's guess — "no region" is the honest answer, not a worse box.
      rows[i].region_bbox = regions[i] ? JSON.stringify(regions[i]) : null;
      if (regions[i]) located++;
    }
    onProgress({
      phase: "locate",
      message: `Located ${located}/${rows.length} regions (OCR conf ${meanConf}, ${columns} columns).`,
      pct: 60,
    });
    return { located, total: rows.length };
  } catch (e) {
    console.warn(`  ⚠ region anchoring skipped: ${(e as Error).message}`);
    onProgress({ phase: "locate", message: `Region anchoring skipped — keeping VLM estimates.`, pct: 60 });
    return { located: 0, total: rows.length };
  }
}

function eargs(o: AssembledRow) {
  return { issueId: o.issue_id, pageRecord: o.page_record, seq: o.seq, objectClass: o.object_class, role: o.role, text: o.text };
}

// Insert one raw object + its enrichment overlay within an open transaction.
async function persistObject(c: PoolClient, o: AssembledRow, en: Enriched, issueId: string) {
  const ins = await c.query<{ id: number }>(
    `INSERT INTO content_objects
      (issue_id,page_record,seq,object_class,role,text,region_bbox,is_publication_content,occurrences,transcription_confidence,run_id,model,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [o.issue_id, o.page_record, o.seq, o.object_class, o.role, o.text, o.region_bbox,
     o.is_publication_content === 1, o.occurrences, o.transcription_confidence, o.run_id, o.model, o.created_at],
  );
  const id = ins.rows[0].id;
  const prov = (field: string, model: string) =>
    c.query("INSERT INTO provenance (object_id,field,model,prompt_version,run_id,created_at) VALUES ($1,$2,$3,$4,$5,now())",
      [id, field, model, ENRICH_PROMPT_VERSION, o.run_id]);

  if (en.tier === "capture_only") {
    await c.query("UPDATE content_objects SET enrichment_tier='capture_only', curation_status='unreviewed' WHERE id=$1", [id]);
    return;
  }
  if (en.tier === "light" && en.light) {
    await c.query("UPDATE content_objects SET enrichment_tier='light', curation_status='unreviewed', payload=$1 WHERE id=$2",
      [JSON.stringify(en.light), id]);
    await prov("light_payload", "heuristic-light");
    return;
  }
  if (en.tier === "structured") {
    await c.query("UPDATE content_objects SET enrichment_tier='structured', curation_status='unreviewed', payload=$1 WHERE id=$2",
      [JSON.stringify(structuredPayload(o.object_class, o.text)), id]);
    await prov("structured_payload", "structured");
    return;
  }
  // heavy
  const e = en.heavy!.enrichment as any;
  await c.query(
    `UPDATE content_objects SET article_type=$1,is_advertorial=$2,is_advertorial_confidence=$3,summary=$4,
       context_hint=$5,event_type=$6,tags=$7,enrichment_tier='heavy',curation_status='unreviewed' WHERE id=$8`,
    [e.article_type ?? null, e.is_advertorial ?? null, e.is_advertorial_confidence ?? null, e.summary ?? null,
     e.context_hint ?? null, e.event_type ?? null, JSON.stringify(e.tags ?? []), id],
  );
  for (let i = 0; i < (e.topics ?? []).slice(0, 3).length; i++) {
    const t = e.topics[i];
    await c.query("INSERT INTO topics (topic_id,name,is_promoted) VALUES ($1,$2,TRUE) ON CONFLICT DO NOTHING", [slug(t.name), t.name]);
    await c.query("INSERT INTO object_topics (object_id,topic_id,confidence,rank) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [id, slug(t.name), t.confidence ?? null, i + 1]);
  }
  if (e.proposed_topic) await c.query("INSERT INTO proposed_topics (object_id,name,confidence) VALUES ($1,$2,'medium')", [id, e.proposed_topic]);
  for (const ent of e.entities ?? []) {
    const eid = slug(`${ent.type}:${ent.name}`);
    await c.query("INSERT INTO entities (entity_id,entity_type,name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [eid, ent.type, ent.name]);
    await c.query("INSERT INTO object_entities (object_id,entity_id,role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [id, eid, ent.role ?? "mentioned"]);
  }
  for (const ev of e.events ?? []) {
    await c.query(
      `INSERT INTO events (source_object_id,issue_id,title,event_type,venue,start_text,recurrence_text,performers,price_text,confidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, issueId, ev.title, ev.event_type ?? null, ev.venue ?? null, ev.start_text ?? null,
       ev.recurrence_text ?? null, JSON.stringify(ev.performers ?? []), ev.price_text ?? null, ev.confidence ?? null],
    );
  }
  await prov("enrichment", en.heavy!.model);
}

// ── Import: persist an already-enriched, schema-compliant JSON for a page,
//    skipping harvest/VLM/enrich. Same store, same rights gate, marked done —
//    the page becomes indistinguishable from an ingested one. ──────────────────
// Normalize an imported region into the canonical single-box shape. Accepts a
// bare [x,y,w,h] or an array of them (older exports carried column runs); keeps
// the largest and drops the rest, so import cannot reintroduce multi-box objects.
// Anything malformed becomes null rather than being stored as unreadable geometry.
function importRegion(bb: unknown): string | null {
  if (!Array.isArray(bb) || !bb.length) return null;
  const rects: number[][] = Array.isArray(bb[0]) ? (bb as number[][]) : [bb as number[]];
  const clean = rects
    .filter((r) => Array.isArray(r) && r.length >= 4 && r.slice(0, 4).every((n) => Number.isFinite(Number(n))))
    .map((r) => r.slice(0, 4).map(Number));
  if (!clean.length) return null;
  clean.sort((a, b) => b[2] * b[3] - a[2] * a[3]);
  return JSON.stringify({
    rects: [clean[0]],
    source: "imported",
    ...(clean.length > 1 ? { continuedIn: clean.length - 1 } : {}),
  });
}

export interface ImportObject {
  seq?: number; object_class: string; role?: string | null; text: string;
  region_bbox?: number[] | null; is_publication_content?: boolean;
  enrichment_tier?: Tier; article_type?: string | null; is_advertorial?: boolean | null;
  is_advertorial_confidence?: string | null; summary?: string | null; context_hint?: string | null;
  event_type?: string | null; tags?: string[]; payload?: any;
  topics?: Array<{ name: string; confidence?: string }>;
  entities?: Array<{ type: string; name: string; role?: string }>;
  events?: any[];
}

function importedToEnriched(o: ImportObject): Enriched {
  const tier: Tier = o.enrichment_tier ?? "capture_only";
  if (tier === "heavy") {
    return { tier: "heavy", heavy: { model: "imported", provider: "import", enrichment: {
      article_type: o.article_type ?? null, is_advertorial: o.is_advertorial ?? null,
      is_advertorial_confidence: o.is_advertorial_confidence ?? null, summary: o.summary ?? null,
      context_hint: o.context_hint ?? null, event_type: o.event_type ?? null, tags: o.tags ?? [],
      topics: o.topics ?? [], proposed_topic: null, entities: o.entities ?? [], events: o.events ?? [],
    } } as any };
  }
  if (tier === "light") return { tier: "light", light: (o.payload ?? {}) as any };
  if (tier === "structured") return { tier: "structured" };
  return { tier: "capture_only" };
}

export async function importPage(args: IngestArgs, objects: ImportObject[], onProgress: Progress = () => {}) {
  const { collection, issuePointer, issueId, pageRecord, pageNumber } = args;
  onProgress({ phase: "rights", message: "Checking rights…", pct: 5 });
  await assertIngestable(issuePointer);
  if (!Array.isArray(objects) || objects.length === 0) throw new Error("import payload must be a non-empty array of content objects");
  objects.forEach((o, i) => {
    if (!o || typeof o.object_class !== "string" || typeof o.text !== "string")
      throw new Error(`object ${i}: "object_class" and "text" are required`);
  });

  const runId = `import_p${pageRecord}`;
  const createdAt = new Date().toISOString();
  onProgress({ phase: "persist", message: `Importing ${objects.length} objects…`, pct: 60 });
  const count = await tx(async (c) => {
    await c.query("DELETE FROM content_objects WHERE page_record=$1 AND issue_id=$2", [pageRecord, issueId]);
    for (let i = 0; i < objects.length; i++) {
      const o = objects[i];
      const row: AssembledRow = {
        issue_id: issueId, page_record: pageRecord, seq: o.seq ?? i,
        object_class: o.object_class, role: o.role ?? null, text: o.text,
        region_bbox: importRegion(o.region_bbox),
        is_publication_content: o.is_publication_content === false ? 0 : 1,
        occurrences: 1, transcription_confidence: null, run_id: runId, model: "imported", created_at: createdAt,
      };
      await persistObject(c, row, importedToEnriched(o), issueId);
    }
    await c.query(
      `INSERT INTO page_ingests (collection,issue_pointer,issue_id,page_record,page_number,status,run_id,vlm_model,enrich_model,object_count,finished_at)
       VALUES ($1,$2,$3,$4,$5,'done',$6,'imported','imported',$7, now())
       ON CONFLICT (collection,page_record) DO UPDATE SET
         status='done', run_id=$6, vlm_model='imported', enrich_model='imported', object_count=$7, finished_at=now(), error=NULL`,
      [collection, issuePointer, issueId, pageRecord, pageNumber, runId, objects.length]);
    return objects.length;
  });
  onProgress({ phase: "done", message: `Imported ${count} objects.`, pct: 100 });
  return { imported: true, ...(await getPageObjects(collection, pageRecord)) };
}

// ── human region correction (SLICE-09b) ──────────────────────────────────────
// A curator drags/resizes/draws a box in the workbench and it lands HERE. Per
// Jungu's call this writes region_bbox in place — one column, no parallel schema.
// The safeguard against that choice's one real cost (a later `relocate` silently
// overwriting human work) is the source stamp: 'human' instead of 'ocr-anchor'.
// relocate skips those unless --force.
export async function setObjectRegion(objectId: number, rects: unknown) {
  if (!Number.isFinite(objectId)) throw new Error("objectId must be a number");
  // null/undefined/[] clear the region; anything else must be a well-formed array.
  // Do NOT let a malformed body fall through to "clear" — silently wiping a
  // curator's region because a field was the wrong type is the worst failure here.
  if (rects != null && !Array.isArray(rects)) throw new Error("rects must be an array of [x,y,w,h]");
  let region: Record<string, unknown> | null = null;
  if (Array.isArray(rects) && rects.length) {
    const clean = rects.map((r, i) => {
      if (!Array.isArray(r) || r.length < 4) throw new Error(`rect ${i} must be [x,y,w,h]`);
      const [x, y, w, h] = r.map(Number);
      if (![x, y, w, h].every(Number.isFinite)) throw new Error(`rect ${i} has non-numeric values`);
      if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1.001 || y + h > 1.001) {
        throw new Error(`rect ${i} must be normalized 0-1 and inside the page`);
      }
      return [x, y, w, h].map((n) => Math.round(n * 1e4) / 1e4);
    });
    // Largest first, then keep ONE (Jungu's call — an object has at most a single
    // bounding box). Callers may still send several; the largest wins rather than
    // the request being rejected, so an older client or an import can't fail on a
    // rule it predates. The array shape is kept for compatibility with what is
    // already stored — it just never holds more than one entry now.
    clean.sort((a, b) => b[2] * b[3] - a[2] * a[3]);
    region = { rects: [clean[0]], source: "human", editedAt: new Date().toISOString() };
  }
  const r = await query(
    "UPDATE content_objects SET region_bbox=$1 WHERE id=$2 RETURNING id",
    [region ? JSON.stringify(region) : null, objectId],
  );
  if (!r.rowCount) throw new Error(`no content object with id ${objectId}`);
  return region;
}

// ── human transcription correction (SLICE-09c) ───────────────────────────────
// The curator fixes what the VLM misread. Unlike the region above, this does NOT
// write in place: `text` is the machine's read and stays immutable (Principle 4,
// and the promise the workbench header makes on every screen). The correction
// lands in text_human, and every reader resolves the pair with COALESCE.
//
// Passing null/'' clears the overlay — which is precisely "revert to the machine's
// text", free, because the machine's text was never touched.
const TEXT_MAX = 40_000; // a page object, not a book. Guards against a runaway paste.

export async function setObjectText(objectId: number, text: unknown) {
  if (!Number.isFinite(objectId)) throw new Error("objectId must be a number");
  if (text != null && typeof text !== "string") throw new Error("text must be a string or null");
  // Trailing whitespace is noise from the textarea; interior newlines are the
  // object's own line structure and must survive verbatim.
  const clean = typeof text === "string" ? text.replace(/[ \t]+$/gm, "").trim() : "";
  if (clean.length > TEXT_MAX) throw new Error(`text exceeds ${TEXT_MAX} characters`);

  const r = await query<{
    text: string; text_human: string | null; text_edited_at: Date | null; display_title: string | null;
  }>(
    `UPDATE content_objects
        SET text_human     = $1,
            text_edited_at = CASE WHEN $1::text IS NULL THEN NULL ELSE now() END
      WHERE id = $2
      RETURNING text, text_human, text_edited_at, display_title`,
    // An edit that merely restates the machine's read is not an edit — store NULL
    // so the object doesn't wear a "corrected by hand" badge it hasn't earned.
    [clean && clean !== (await machineText(objectId)) ? clean : null, objectId],
  );
  if (!r.rowCount) throw new Error(`no content object with id ${objectId}`);
  const row = r.rows[0];
  return {
    text: row.text_human ?? row.text,
    textRaw: row.text,
    textEdited: row.text_human != null,
    textEditedAt: row.text_edited_at,
    // Correcting the text can change the headline it resolves to, so hand the
    // caller the re-resolved title rather than let the UI re-derive it.
    ...resolveTitle(row.text_human ?? row.text, row.display_title),
  };
}

// ── destroy an object (SLICE-09g) ────────────────────────────────────────────
// A real DELETE, not a flag: the row goes, and every child row goes with it
// through the ON DELETE CASCADE declared in 001_schema — object_topics,
// proposed_topics, object_entities, events, provenance. Nothing is kept.
//
// KNOWN LIMIT, stated plainly because the UI states it too: this does not survive
// re-ingestion. `ingestPage` re-extracts a page from the image and re-inserts what
// it finds, so running it again on this page brings the object back with a new id.
// Deletion is permanent against the DATABASE, not against the pipeline. Making it
// stick would need a tombstone the ingest path consults; that was considered and
// deliberately not built (Jungu's call).
export async function deleteObject(objectId: number) {
  if (!Number.isFinite(objectId)) throw new Error("objectId must be a number");
  return tx(async (c) => {
    // Read the row and its dependents BEFORE destroying them, so the caller can
    // report what actually went rather than guess.
    const r = await c.query<any>(
      `SELECT id, page_record, issue_id, seq, object_class,
              COALESCE(text_human, text) AS text, is_published
         FROM content_objects WHERE id = $1`, [objectId]);
    if (!r.rowCount) throw new Error(`no content object with id ${objectId}`);
    const row = r.rows[0];

    const counts = await c.query<any>(
      `SELECT (SELECT count(*) FROM object_topics    WHERE object_id = $1)        AS topics,
              (SELECT count(*) FROM object_entities  WHERE object_id = $1)        AS entities,
              (SELECT count(*) FROM proposed_topics  WHERE object_id = $1)        AS proposed_topics,
              (SELECT count(*) FROM events           WHERE source_object_id = $1) AS events,
              (SELECT count(*) FROM provenance       WHERE object_id = $1)        AS provenance`,
      [objectId]);

    await c.query("DELETE FROM content_objects WHERE id = $1", [objectId]);

    // page_ingests.object_count is what the catalog dashboard reports for this
    // page. Left alone it would keep claiming an object the page no longer has.
    await c.query(
      "UPDATE page_ingests SET object_count = GREATEST(0, object_count - 1) WHERE page_record = $1",
      [row.page_record]);

    const n = counts.rows[0];
    return {
      deleted: {
        id: row.id, pageRecord: row.page_record, issueId: row.issue_id, seq: row.seq,
        objectClass: row.object_class, wasPublished: row.is_published === true,
        textPreview: String(row.text ?? "").slice(0, 120),
      },
      cascaded: {
        topics: Number(n.topics), entities: Number(n.entities),
        proposedTopics: Number(n.proposed_topics), events: Number(n.events),
        provenance: Number(n.provenance),
      },
    };
  });
}

// ── commit a re-extraction over the machine's read (SLICE-09i) ───────────────
// Writes `text` itself. A re-extraction is a machine read of the same source, so
// it replaces the machine read — the text_human overlay is for humans and is left
// exactly as it is. If an object carries an overlay, replacing the raw underneath
// does not change what anyone sees; the caller is told so it can say that.
//
// The superseded read is NOT kept (Jungu's call). Once this runs, the previous
// transcription is gone and only a re-ingest of the page could produce it again —
// which is why the workbench makes the curator confirm rather than saving on the
// same keystroke as an ordinary edit. A provenance row records who wrote what is
// there now.
export async function replaceObjectRawText(objectId: number, text: unknown, model: string) {
  if (!Number.isFinite(objectId)) throw new Error("objectId must be a number");
  if (typeof text !== "string") throw new Error("text must be a string");
  const clean = text.replace(/[ \t]+$/gm, "").trim();
  if (!clean) throw new Error("refusing to replace the machine's read with empty text");
  if (clean.length > TEXT_MAX) throw new Error(`text exceeds ${TEXT_MAX} characters`);

  return tx(async (c) => {
    const r = await c.query<any>(
      `UPDATE content_objects
          SET text              = $1,
              text_reread_model = $2,
              text_reread_at    = now()
        WHERE id = $3
        RETURNING text, text_human, text_reread_model, text_reread_at, display_title`,
      [clean, model, objectId]);
    if (!r.rowCount) throw new Error(`no content object with id ${objectId}`);
    const row = r.rows[0];

    await c.query(
      `INSERT INTO provenance (object_id, field, model, prompt_version, run_id)
       VALUES ($1, 'text', $2, $3, $4)`,
      [objectId, model, "reextract-v1", `reextract_${objectId}`]);

    return {
      text: row.text_human ?? row.text,
      textRaw: row.text,
      textEdited: row.text_human != null,
      rereadModel: row.text_reread_model,
      rereadAt: row.text_reread_at,
      // A human overlay sits on top of the raw, so replacing the raw changed the
      // stored read but NOT what a patron or curator currently sees.
      maskedByOverlay: row.text_human != null,
      ...resolveTitle(row.text_human ?? row.text, row.display_title),
    };
  });
}

// ── curator-set display title (SLICE-09e) ────────────────────────────────────
// Overrides the automatic rule in lib/title.ts. Empty/null clears it, handing the
// object back to that rule — including back to "this one has no title".
const TITLE_MAX = 300;

export async function setObjectTitle(objectId: number, title: unknown) {
  if (!Number.isFinite(objectId)) throw new Error("objectId must be a number");
  if (title != null && typeof title !== "string") throw new Error("title must be a string or null");
  // A title is one line by definition — fold any pasted newlines into spaces
  // rather than storing something the headline slot cannot render.
  const clean = typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
  if (clean.length > TITLE_MAX) throw new Error(`title exceeds ${TITLE_MAX} characters`);

  const r = await query<{ text: string; display_title: string | null; display_title_at: Date | null }>(
    `UPDATE content_objects
        SET display_title    = $1,
            display_title_at = CASE WHEN $1::text IS NULL THEN NULL ELSE now() END
      WHERE id = $2
      RETURNING COALESCE(text_human, text) AS text, display_title, display_title_at`,
    [clean || null, objectId],
  );
  if (!r.rowCount) throw new Error(`no content object with id ${objectId}`);
  const row = r.rows[0];
  return {
    ...resolveTitle(row.text, row.display_title),
    displayTitle: row.display_title,
    displayTitleAt: row.display_title_at,
  };
}

// ── curator review state (SLICE-09d) ─────────────────────────────────────────
// The status dropdown and the review note. Both fields are optional and applied
// independently, so "set the status" and "write a note" are separate requests that
// never clobber each other — a note auto-saving on blur must not reset a status
// the curator set a moment earlier.
const REVIEW_STATUS = new Set(["unreviewed", "flagged", "reviewed"]);
const NOTE_MAX = 4_000;

export async function setObjectReview(
  objectId: number,
  patch: { status?: unknown; note?: unknown; published?: unknown },
) {
  if (!Number.isFinite(objectId)) throw new Error("objectId must be a number");

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.status !== undefined) {
    if (typeof patch.status !== "string" || !REVIEW_STATUS.has(patch.status)) {
      throw new Error(`status must be one of ${[...REVIEW_STATUS].join(", ")}`);
    }
    vals.push(patch.status);
    sets.push(`curation_status = $${vals.length}`);
    // 'unreviewed' is the absence of a verdict, so it clears the timestamp too.
    sets.push(`reviewed_at = ${patch.status === "unreviewed" ? "NULL" : "now()"}`);
  }
  if (patch.note !== undefined) {
    if (patch.note !== null && typeof patch.note !== "string") throw new Error("note must be a string or null");
    const clean = typeof patch.note === "string" ? patch.note.replace(/[ \t]+$/gm, "").trim() : "";
    if (clean.length > NOTE_MAX) throw new Error(`note exceeds ${NOTE_MAX} characters`);
    vals.push(clean || null);
    sets.push(`review_note = $${vals.length}`);
    sets.push(`review_note_at = CASE WHEN $${vals.length}::text IS NULL THEN NULL ELSE now() END`);
  }
  if (patch.published !== undefined) {
    if (typeof patch.published !== "boolean") throw new Error("published must be true or false");
    vals.push(patch.published);
    sets.push(`is_published = $${vals.length}`);
    sets.push(`published_at = ${patch.published ? "now()" : "NULL"}`);
  }
  if (!sets.length) throw new Error("nothing to update — send status, note and/or published");

  vals.push(objectId);
  const r = await query<{
    curation_status: string; reviewed_at: Date | null;
    review_note: string | null; review_note_at: Date | null;
    is_published: boolean; published_at: Date | null;
  }>(
    `UPDATE content_objects SET ${sets.join(", ")} WHERE id = $${vals.length}
     RETURNING curation_status, reviewed_at, review_note, review_note_at, is_published, published_at`,
    vals,
  );
  if (!r.rowCount) throw new Error(`no content object with id ${objectId}`);
  const row = r.rows[0];
  return {
    status: row.curation_status, reviewedAt: row.reviewed_at,
    note: row.review_note, noteAt: row.review_note_at,
    published: row.is_published, publishedAt: row.published_at,
  };
}

async function machineText(objectId: number): Promise<string> {
  const r = await query<{ text: string }>("SELECT text FROM content_objects WHERE id=$1", [objectId]);
  if (!r.rowCount) throw new Error(`no content object with id ${objectId}`);
  return r.rows[0].text;
}

// Read back a page's objects (+ overlay) for the review panel — the API's page view.
export async function getPageObjects(collection: string, pageRecord: number) {
  const pi = await query<any>("SELECT * FROM page_ingests WHERE collection=$1 AND page_record=$2", [collection, pageRecord]);
  const objs = await query<any>(
    `SELECT id, page_record, seq, object_class, role, text, text_human, text_edited_at,
            is_publication_content, enrichment_tier,
            article_type, is_advertorial, summary, context_hint, event_type, curation_status, payload, region_bbox,
            review_note, review_note_at, reviewed_at, display_title, display_title_at,
            is_published, published_at, text_reread_model, text_reread_at
     FROM content_objects WHERE page_record=$1 ORDER BY seq`, [pageRecord]);
  const topics = await query<any>(
    `SELECT ot.object_id, t.name, ot.confidence, ot.rank FROM object_topics ot
     JOIN topics t ON t.topic_id=ot.topic_id WHERE ot.object_id = ANY($1) ORDER BY ot.rank`,
    [objs.rows.map((o) => o.id)]);
  const ents = await query<any>(
    "SELECT object_id, e.name FROM object_entities oe JOIN entities e ON e.entity_id=oe.entity_id WHERE object_id = ANY($1)",
    [objs.rows.map((o) => o.id)]);
  const tByObj = new Map<number, any[]>(), eByObj = new Map<number, string[]>();
  for (const r of topics.rows) (tByObj.get(r.object_id) ?? tByObj.set(r.object_id, []).get(r.object_id))!.push({ name: r.name, confidence: r.confidence });
  for (const r of ents.rows) (eByObj.get(r.object_id) ?? eByObj.set(r.object_id, []).get(r.object_id))!.push(r.name);
  return {
    state: pi.rows[0] ?? { status: "pending" },
    iiifId: iiifId(pageRecord),
    imageUrl: iiifImageUrl(pageRecord, "1600,"),
    objects: objs.rows.map((o) => ({
      // text = what to SHOW (the overlay when there is one); textRaw = what the
      // machine read, kept alongside so the workbench can offer "show original".
      id: `co-${o.id}`, class: o.object_class, role: o.role,
      text: o.text_human ?? o.text, textRaw: o.text,
      textEdited: o.text_human != null, textEditedAt: o.text_edited_at ?? null,
      isPublication: o.is_publication_content, tier: o.enrichment_tier,
      articleType: o.article_type, isAdvertorial: o.is_advertorial, summary: o.summary,
      eventType: o.event_type, status: o.curation_status, seq: o.seq,
      // curator review state — internal to the workbench, never served to patrons
      reviewNote: o.review_note ?? null, reviewNoteAt: o.review_note_at ?? null, reviewedAt: o.reviewed_at ?? null,
      // the resolved title (null when this object genuinely has none) + the override
      ...resolveTitle(o.text_human ?? o.text, o.display_title),
      displayTitle: o.display_title ?? null, displayTitleAt: o.display_title_at ?? null,
      published: o.is_published === true, publishedAt: o.published_at ?? null,
      // provenance of the CURRENT machine read: null model = still the ingestion
      // transcription. The superseded read is not kept.
      rereadModel: o.text_reread_model ?? null, rereadAt: o.text_reread_at ?? null,
      bbox: o.region_bbox ?? null, // normalized [x,y,w,h] 0-1, or null (SLICE-09)
      topics: tByObj.get(o.id) ?? [], entities: eByObj.get(o.id) ?? [],
    })),
  };
}
