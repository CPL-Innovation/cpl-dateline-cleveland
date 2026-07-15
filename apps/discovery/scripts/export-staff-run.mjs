// Export the REAL pipeline run stats for the staff Editorial Workbench (/staff).
// SLICE-05 Part B: the workbench stops rendering the 312-object concept-mock and
// renders THIS run — real object counts, the real tier split, the real per-page
// results, the real review worklist, and honest empty states where the run
// produced no items (shape review, low-confidence).
//
//   node --experimental-sqlite scripts/export-staff-run.mjs
//
// Source of truth is apps/pipeline/data/slice01.sqlite (the pipeline owns it;
// the workbench consumes it — same seam as export-real-data.mjs). The output is
// self-contained JSON served from public/ so the vendored static staff.html can
// fetch it at runtime. Committed (like real.generated.json) so /staff works from
// a clean clone even though the SQLite store is gitignored.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url)); // apps/discovery/scripts
const repoRoot = resolve(here, '..', '..', '..'); // monorepo root
// Paths are overridable (STAFF_DB_PATH / STAFF_OUT) for testing against an
// alternate store; defaults are the live pipeline store → public/staff-run.json.
const dbPath = process.env.STAFF_DB_PATH || resolve(repoRoot, 'apps', 'pipeline', 'data', 'slice01.sqlite');
const outFile = process.env.STAFF_OUT || resolve(here, '..', 'public', 'staff-run.json');
const outDir = dirname(outFile);
const rel = (p) => p.replace(repoRoot + '/', '');

// SLICE-06: ContentDM harvest manifest → real page image + IIIF id per page_record.
const manifestPath = resolve(here, '..', 'public', 'pages', 'manifest.json');
const pageSource = new Map();
if (existsSync(manifestPath)) {
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const p of m.pages ?? []) {
    pageSource.set(p.pageRecord, { pageImage: `pages/${p.displayFile}`, iiifId: p.iiifId });
  }
}
const imageFor = (rec) => pageSource.get(rec) ?? { pageImage: null, iiifId: null };

// Honest empty payload if there is no store AND no committed run yet — the
// workbench then shows a "no run loaded" state rather than mock rows.
function writeEmpty(reason) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify({ loaded: false, reason }, null, 2));
  console.log(`[export-staff] ${reason} → wrote empty run to ${rel(outFile)}`);
}

if (!existsSync(dbPath)) {
  // staff-run.json is COMMITTED with the last real run; never clobber it with an
  // empty payload when the gitignored store is absent (clean clone / public repo).
  if (existsSync(outFile)) {
    console.log(`[export-staff] no store at ${rel(dbPath)}; keeping committed ${rel(outFile)} (last real run).`);
    process.exit(0);
  }
  writeEmpty('no pipeline store — run `npm run pipeline` (and `npm run enrich`) from the repo root first');
  process.exit(0);
}

const db = new DatabaseSync(dbPath);
const all = (sql, ...a) => db.prepare(sql).all(...a);
const one = (sql, ...a) => db.prepare(sql).get(...a);

const hasEnrichment =
  one(`SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name='object_topics'`).c > 0;

// --- the run being reported -------------------------------------------------
// One issue in the pilot store. The VLM run + engine live on content_objects;
// the enrichment run + engine live on provenance. Recording both makes the
// workbench (and any pitch claim) able to cite exactly what produced the data.
const issueRow = one(`SELECT issue_id, run_id, model, created_at FROM content_objects ORDER BY page_record, seq LIMIT 1`);
if (!issueRow) {
  writeEmpty('pipeline store is empty — nothing ingested');
  process.exit(0);
}

// provider is encoded in the run_id (`slice01-v1_<provider>_run1`); engine is the model column.
const providerOf = (runId) => {
  const m = /_(fixture|anthropic|gemini|openai)_/.exec(runId || '');
  return m ? m[1] : 'unknown';
};
const enrichRow = hasEnrichment
  ? one(`SELECT model, run_id, created_at FROM provenance ORDER BY id LIMIT 1`)
  : null;

const vlmProvider = providerOf(issueRow.run_id);
const enrichProvider = enrichRow ? providerOf(enrichRow.run_id) : null;
const isLive = vlmProvider !== 'fixture';

// --- pages + per-page breakdown ---------------------------------------------
const pageRecords = all(`SELECT DISTINCT page_record FROM content_objects ORDER BY page_record`).map((r) => r.page_record);
const firstRecord = pageRecords[0] ?? 0;
const printedPage = (rec) => rec - firstRecord + 1;

const perPage = pageRecords.map((rec) => {
  const row = one(
    `SELECT COUNT(*) objects,
            SUM(object_class='article') articles,
            SUM(object_class='advertisement') ads,
            SUM(object_class='illustration') illustrations
     FROM content_objects WHERE page_record = ?`,
    rec
  );
  return {
    page: printedPage(rec),
    record: rec,
    objects: row.objects,
    articles: row.articles ?? 0,
    ads: row.ads ?? 0,
    illustrations: row.illustrations ?? 0,
  };
});

// --- headline counts --------------------------------------------------------
const objectCount = one(`SELECT COUNT(*) c FROM content_objects`).c;
const publicationCount = one(`SELECT COUNT(*) c FROM content_objects WHERE is_publication_content = 1`).c;
const classCounts = Object.fromEntries(
  all(`SELECT object_class, COUNT(*) c FROM content_objects GROUP BY object_class ORDER BY c DESC`).map((r) => [r.object_class, r.c])
);
const articles = classCounts['article'] ?? 0;
const ads = classCounts['advertisement'] ?? 0;
const illustrations = classCounts['illustration'] ?? 0;
const unknownShapes = classCounts['unknown'] ?? 0;

const tiers = { heavy: 0, light: 0, structured: 0, capture_only: 0 };
if (hasEnrichment) {
  for (const r of all(`SELECT enrichment_tier t, COUNT(*) c FROM content_objects WHERE enrichment_tier IS NOT NULL GROUP BY t`)) {
    if (r.t in tiers) tiers[r.t] = r.c;
  }
}

// review progress — curation_status is set to 'unreviewed' at enrichment time.
const reviewed = hasEnrichment ? one(`SELECT COUNT(*) c FROM content_objects WHERE curation_status='reviewed'`).c : 0;
const flagged = hasEnrichment ? one(`SELECT COUNT(*) c FROM content_objects WHERE curation_status='flagged'`).c : 0;
const reviewTotal = publicationCount;
const unreviewed = reviewTotal - reviewed - flagged;

// low-confidence: objects the pipeline itself distrusts. transcription_confidence
// is nullable and this pilot run emits none, so this queue is honestly empty.
const lowConfidence = one(`SELECT COUNT(*) c FROM content_objects WHERE transcription_confidence IS NOT NULL AND transcription_confidence < 0.6`).c;

const events = hasEnrichment ? one(`SELECT COUNT(*) c FROM events`).c : 0;
const entities = hasEnrichment ? one(`SELECT COUNT(DISTINCT entity_id) c FROM entities`).c : 0;
const controlledTopicsMatched = hasEnrichment
  ? one(`SELECT COUNT(DISTINCT topic_id) c FROM object_topics`).c
  : 0;

const proposedTopics = hasEnrichment
  ? all(
      `SELECT pt.name, pt.confidence, pt.object_id, co.object_class, co.page_record, co.text
       FROM proposed_topics pt JOIN content_objects co ON co.id = pt.object_id
       ORDER BY pt.id`
    ).map((r) => ({
      name: r.name,
      confidence: r.confidence,
      sourceClass: r.object_class,
      sourcePage: printedPage(r.page_record),
      sourceTitle: firstLine(r.text),
    }))
  : [];

// --- object class → discovery colour + label (mirror of realAdapter.classify) --
const CLASS_LABEL = {
  article: 'Article',
  advertisement: 'Advertisement',
  illustration: 'Illustration',
  legal_notice: 'Legal notice',
  classified_section: 'Classified',
  coupon: 'Coupon',
  masthead: 'Masthead',
  filler_slug: 'Filler',
  manuscript_annotation: 'Annotation',
  caption: 'Caption',
  unknown: 'Unknown',
};
// colour keys map to the workbench's --c-* CSS vars.
const CLASS_COLOR = {
  article: 'article',
  advertisement: 'ad',
  illustration: 'photo',
  legal_notice: 'listing',
  classified_section: 'listing',
  coupon: 'ad',
  masthead: 'listing',
  unknown: 'unknown',
};

function firstLine(text) {
  for (const line of (text || '').split('\n')) {
    const t = line.replace(/\[[^\]]*\]/g, '').trim();
    if (t) return t;
  }
  return (text || '').trim().slice(0, 80);
}
function titleCase(s) {
  if (s.length > 4 && s === s.toUpperCase()) {
    return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return s;
}

// --- per-object overlay (topics/entities) for the Review detail -------------
const topicsByObj = new Map();
const entitiesByObj = new Map();
if (hasEnrichment) {
  for (const r of all(
    `SELECT ot.object_id oid, t.name, ot.confidence, ot.rank
     FROM object_topics ot JOIN topics t ON t.topic_id = ot.topic_id ORDER BY ot.object_id, ot.rank`
  )) {
    if (!topicsByObj.has(r.oid)) topicsByObj.set(r.oid, []);
    topicsByObj.get(r.oid).push({ name: r.name, confidence: r.confidence, proposed: false });
  }
  for (const r of all(`SELECT object_id oid, name FROM proposed_topics`)) {
    if (!topicsByObj.has(r.oid)) topicsByObj.set(r.oid, []);
    topicsByObj.get(r.oid).push({ name: r.name, confidence: 'medium', proposed: true });
  }
  for (const r of all(
    `SELECT oe.object_id oid, e.name FROM object_entities oe JOIN entities e ON e.entity_id = oe.entity_id`
  )) {
    if (!entitiesByObj.has(r.oid)) entitiesByObj.set(r.oid, []);
    entitiesByObj.get(r.oid).push(r.name);
  }
}

// --- the review worklist + per-object detail --------------------------------
// Publication content only (Principle 15) — the reviewer works the journalism,
// not the filler. Each row carries enough for the list AND the detail pane so
// the Review view is genuinely data-driven (no hand-authored "Steel Strike" mock).
const enrichCols = hasEnrichment
  ? `, article_type, is_advertorial, summary, context_hint, event_type, enrichment_tier, curation_status`
  : '';
const worklistRows = all(
  `SELECT id, page_record, seq, object_class, role, text, is_publication_content${enrichCols}
   FROM content_objects
   WHERE is_publication_content = 1
   ORDER BY page_record, seq`
);

const worklist = worklistRows.map((r) => {
  const cls = r.object_class;
  const isAdvertorial = hasEnrichment && r.is_advertorial === 1;
  return {
    id: `co-${r.id}`,
    class: cls,
    classLabel: CLASS_LABEL[cls] || cls.replace(/_/g, ' '),
    color: CLASS_COLOR[cls] || 'article',
    title: titleCase(firstLine(r.text)),
    page: printedPage(r.page_record),
    seq: r.seq,
    role: r.role || null,
    tier: r.enrichment_tier ?? null,
    status: r.curation_status || 'unreviewed',
    isAdvertorial,
    articleType: r.article_type ?? null,
    summary: r.summary ?? null,
    contextHint: r.context_hint ?? null,
    eventType: r.event_type ?? null,
    transcript: r.text,
    topics: topicsByObj.get(r.id) || [],
    entities: entitiesByObj.get(r.id) || [],
    // SLICE-06: the real page image + IIIF provenance for the review detail pane.
    pageImage: imageFor(r.page_record).pageImage,
    iiifId: imageFor(r.page_record).iiifId,
  };
});

// worklist filter facets (object_class among publication content).
const worklistClassCounts = {};
for (const w of worklist) worklistClassCounts[w.class] = (worklistClassCounts[w.class] || 0) + 1;

const payload = {
  loaded: true,
  live: isLive,
  issue: {
    id: issueRow.issue_id,
    label: 'Brooklyn News · Feb 1 1924',
    date: '1924-02-01',
  },
  run: {
    runId: issueRow.run_id,
    createdAt: issueRow.created_at,
    vlm: { provider: vlmProvider, engine: issueRow.model },
    enrich: enrichRow ? { provider: enrichProvider, engine: enrichRow.model } : null,
    enriched: hasEnrichment,
  },
  // SLICE-06: real ContentDM IIIF harvest provenance (null until pages harvested).
  source: pageSource.size
    ? { kind: 'contentdm-iiif', collection: 'p16014coll5', server: 'cdm16014.contentdm.oclc.org', pageCount: pageSource.size }
    : null,
  pages: pageRecords.length,
  perPage,
  objectCount,
  publicationCount,
  classCounts,
  articles,
  ads,
  illustrations,
  unknownShapes,
  tiers,
  events,
  entities,
  controlledTopicsMatched,
  proposedTopics,
  review: { total: reviewTotal, reviewed, flagged, unreviewed },
  lowConfidence,
  worklist,
  worklistClassCounts,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(payload, null, 2));

console.log(
  `[export-staff] ${isLive ? 'LIVE' : 'fixture'} run ${payload.run.runId}\n` +
    `  ${objectCount} objects (${publicationCount} publication) · ${pageRecords.length} pages · ` +
    `tiers heavy ${tiers.heavy}/light ${tiers.light}/structured ${tiers.structured}/capture_only ${tiers.capture_only}\n` +
    `  ${articles} articles · ${ads} ads · ${illustrations} illustrations · ${events} events · ${entities} entities\n` +
    `  proposed topics ${proposedTopics.length} · unknown shapes ${unknownShapes} · low-confidence ${lowConfidence}\n` +
    `  → ${rel(outFile)}`
);
db.close();
