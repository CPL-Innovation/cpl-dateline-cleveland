// Export the real SLICE-01 content_objects from the SQLite store into a static
// JSON the Vite front-end can import. Keeps the SPA fully static (no dev API):
// the "REAL DATA" toggle browses whatever this last exported.
//
//   node --experimental-sqlite scripts/export-real-data.mjs
//
// Source of truth is data/slice01.sqlite (repo root). We ship only the fields
// the discovery UI needs, and we DROP non-publication content (filler slugs,
// manuscript annotations) per Principle 15 — captured in the pipeline, but kept
// out of the patron-facing index.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url)); // apps/discovery/scripts
const repoRoot = resolve(here, '..', '..', '..'); // monorepo root
// The pipeline owns its SQLite store; discovery consumes it (the pipeline→discovery seam).
const dbPath = resolve(repoRoot, 'apps', 'pipeline', 'data', 'slice01.sqlite');
const outDir = resolve(here, '..', 'src', 'data');
const outFile = resolve(outDir, 'real.generated.json');

// SLICE-06: the ContentDM harvest manifest (page_record → real page image + IIIF id).
// Present once `npm run harvest` has pulled the pages; absent → no image, honest fallback.
const manifestPath = resolve(here, '..', 'public', 'pages', 'manifest.json');
const pageSource = new Map(); // page_record → { pageImage, iiifId, fullImageUrl }
if (existsSync(manifestPath)) {
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const p of m.pages ?? []) {
    pageSource.set(p.pageRecord, {
      pageImage: `pages/${p.displayFile}`, // served from public/, BASE_URL-prefixed in the SPA
      iiifId: p.iiifId,
      fullImageUrl: p.fullImageUrl,
    });
  }
}
const imageFor = (rec) => pageSource.get(rec) ?? { pageImage: null, iiifId: null, fullImageUrl: null };

if (!existsSync(dbPath)) {
  // No SQLite store (it's gitignored) — but real.generated.json is COMMITTED with
  // the last real run, so a clean clone / public repo still drives the demo.
  // NEVER clobber that committed data with an empty dataset; keep it and move on.
  if (existsSync(outFile)) {
    console.log(`[export-real] no store at ${dbPath}; keeping committed ${outFile.replace(repoRoot + '/', '')} (last real run).`);
    process.exit(0);
  }
  console.error(`[export-real] no store at ${dbPath} and no committed export — run \`npm run pipeline\` from the repo root first.`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify({ generatedAt: null, issue: null, objects: [] }, null, 2));
  process.exit(0);
}

const db = new DatabaseSync(dbPath);

// Has SLICE-02 enrichment been applied? (The overlay columns/tables exist only
// after `npm run enrich`.) If not, we still export SLICE-01 shape so the SPA's
// REAL mode degrades honestly to the pre-enrichment empty facets.
const hasEnrichment = db
  .prepare(`SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name='object_topics'`)
  .get().c > 0;

const enrichCols = hasEnrichment
  ? `, article_type, is_advertorial, is_advertorial_confidence, summary,
       context_hint, event_type, tags, enrichment_tier, curation_status`
  : '';

const rows = db
  .prepare(
    `SELECT id, issue_id, page_record, seq, object_class, role, text,
            region_bbox, is_publication_content, occurrences,
            transcription_confidence, run_id, model${enrichCols}
     FROM content_objects
     ORDER BY page_record, seq`
  )
  .all();

const slug = (s) =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Per-object topic + entity ids (empty maps when unenriched).
const topicsByObj = new Map(); // objId -> [{id,label,confidence,rank}]
const namesByObj = new Map(); // objId -> [{id,label,type}]
if (hasEnrichment) {
  for (const r of db
    .prepare(
      `SELECT ot.object_id oid, t.topic_id tid, t.name, ot.confidence, ot.rank
       FROM object_topics ot JOIN topics t ON t.topic_id = ot.topic_id
       ORDER BY ot.object_id, ot.rank`
    )
    .all()) {
    if (!topicsByObj.has(r.oid)) topicsByObj.set(r.oid, []);
    topicsByObj.get(r.oid).push({ id: `t-${r.tid}`, label: r.name, confidence: r.confidence });
  }
  for (const r of db
    .prepare(
      `SELECT oe.object_id oid, e.entity_id eid, e.name, e.entity_type
       FROM object_entities oe JOIN entities e ON e.entity_id = oe.entity_id`
    )
    .all()) {
    if (!namesByObj.has(r.oid)) namesByObj.set(r.oid, []);
    namesByObj.get(r.oid).push({ id: `n-${r.eid}`, label: r.name, type: r.entity_type });
  }
}

const objects = rows.map((r) => ({
  id: `co-${r.id}`,
  issueId: r.issue_id,
  page: r.page_record,
  seq: r.seq,
  objectClass: r.object_class,
  role: r.role || null,
  text: r.text,
  bbox: r.region_bbox ? JSON.parse(r.region_bbox) : null,
  isPublicationContent: !!r.is_publication_content,
  occurrences: r.occurrences,
  confidence: r.transcription_confidence,
  runId: r.run_id,
  model: r.model,
  // SLICE-02 overlay (undefined when unenriched)
  enrichmentTier: r.enrichment_tier ?? null,
  articleType: r.article_type ?? null,
  isAdvertorial: hasEnrichment ? r.is_advertorial === 1 : null,
  summary: r.summary ?? null,
  contextHint: r.context_hint ?? null,
  eventType: r.event_type ?? null,
  tags: r.tags ? JSON.parse(r.tags) : [],
  topics: topicsByObj.get(r.id) || [],
  names: namesByObj.get(r.id) || [],
  // SLICE-06: the real ContentDM page image + IIIF provenance for this object's page.
  pageImage: imageFor(r.page_record).pageImage,
  iiifId: imageFor(r.page_record).iiifId,
}));

// TOPIC facet: every controlled topic that landed on ≥1 publication object, with counts.
// NAME facet: entities that RECUR (≥2 objects) — the cross-cutting names a reader browses by.
let topicFacet = [];
let nameFacet = [];
let events = [];
if (hasEnrichment) {
  topicFacet = db
    .prepare(
      `SELECT t.topic_id tid, t.name, COUNT(DISTINCT ot.object_id) c
       FROM object_topics ot JOIN topics t ON t.topic_id = ot.topic_id
       GROUP BY t.topic_id ORDER BY c DESC, t.name`
    )
    .all()
    .map((r) => ({ id: `t-${r.tid}`, label: r.name, count: r.c }));

  nameFacet = db
    .prepare(
      `SELECT e.entity_id eid, e.name, e.entity_type, COUNT(DISTINCT oe.object_id) c
       FROM object_entities oe JOIN entities e ON e.entity_id = oe.entity_id
       GROUP BY e.entity_id HAVING c >= 2 ORDER BY c DESC, e.name LIMIT 15`
    )
    .all()
    .map((r) => ({ id: `n-${r.eid}`, label: r.name, count: r.c, type: r.entity_type }));

  events = db
    .prepare(
      `SELECT ev.event_id, ev.title, ev.event_type, ev.venue, ev.start_text,
              ev.recurrence_text, ev.performers, ev.price_text, ev.confidence,
              co.page_record, co.object_class, co.summary
       FROM events ev JOIN content_objects co ON co.id = ev.source_object_id
       ORDER BY co.page_record, co.seq`
    )
    .all()
    .map((r) => ({
      id: `ev-${r.event_id}`,
      title: r.title,
      eventType: r.event_type,
      venue: r.venue,
      startText: r.start_text,
      recurrenceText: r.recurrence_text,
      performers: r.performers ? JSON.parse(r.performers) : [],
      priceText: r.price_text,
      confidence: r.confidence,
      sourcePage: r.page_record,
      sourceClass: r.object_class,
      sourceSummary: r.summary,
      pageImage: imageFor(r.page_record).pageImage,
      iiifId: imageFor(r.page_record).iiifId,
    }));
}

const issueRow = rows[0] || null;
// Provider is encoded in the run_id (`slice01-v1_<provider>_run1`); a non-fixture
// provider means this data came from a real live VLM call (SLICE-05).
const providerMatch = /_(fixture|anthropic|gemini|openai)_/.exec(issueRow?.run_id || '');
const provider = providerMatch ? providerMatch[1] : 'unknown';
const isLive = provider !== 'fixture';
const payload = {
  // Stamp is derived from the run itself (not Date.now()), so repeated exports of
  // the SAME run stay byte-stable — but a LIVE run reads as live, not "fixture".
  generatedAt: isLive
    ? `LIVE ${provider} run · ${issueRow?.model || ''} · ${issueRow?.created_at || ''}`.trim()
    : hasEnrichment ? 'SLICE-02 enrichment run (fixture)' : 'SLICE-01 fixture run',
  live: isLive,
  provider,
  enriched: hasEnrichment,
  // SLICE-06: where the pixels came from — a real ContentDM IIIF harvest (or null
  // if the pages haven't been harvested; the SPA then keeps the honest placeholder).
  source: pageSource.size
    ? { kind: 'contentdm-iiif', collection: 'p16014coll5', server: 'cdm16014.contentdm.oclc.org', pageCount: pageSource.size }
    : null,
  issue: issueRow
    ? { id: issueRow.issue_id, model: issueRow.model, runId: issueRow.run_id }
    : null,
  pages: [...new Set(rows.map((r) => r.page_record))].sort((a, b) => a - b),
  objects,
  topicFacet,
  nameFacet,
  events,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(payload, null, 2));

const pub = objects.filter((o) => o.isPublicationContent).length;
console.log(
  `[export-real] wrote ${objects.length} objects (${pub} publication-content) ` +
    `from ${payload.pages.length} pages → ${outFile.replace(repoRoot + '/', '')}`
);
if (hasEnrichment) {
  console.log(
    `[export-real] SLICE-02 overlay: ${topicFacet.length} topic facets · ` +
      `${nameFacet.length} recurring-name facets · ${events.length} events`
  );
} else {
  console.log('[export-real] no SLICE-02 enrichment found — run `npm run enrich` for topics/names/events.');
}
