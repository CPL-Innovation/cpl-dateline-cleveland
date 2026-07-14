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
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url)); // apps/discovery/scripts
const repoRoot = resolve(here, '..', '..', '..'); // monorepo root
// The pipeline owns its SQLite store; discovery consumes it (the pipeline→discovery seam).
const dbPath = resolve(repoRoot, 'apps', 'pipeline', 'data', 'slice01.sqlite');
const outDir = resolve(here, '..', 'src', 'data');
const outFile = resolve(outDir, 'real.generated.json');

if (!existsSync(dbPath)) {
  console.error(`[export-real] no store at ${dbPath} — run \`npm run pipeline\` from the repo root first.`);
  // Write an empty dataset so the build still succeeds.
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify({ generatedAt: null, issue: null, objects: [] }, null, 2));
  process.exit(0);
}

const db = new DatabaseSync(dbPath);

const rows = db
  .prepare(
    `SELECT id, issue_id, page_record, seq, object_class, role, text,
            region_bbox, is_publication_content, occurrences,
            transcription_confidence, run_id, model
     FROM content_objects
     ORDER BY page_record, seq`
  )
  .all();

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
}));

const issueRow = rows[0] || null;
const payload = {
  // A fixed stamp so repeated exports are deterministic (Date.now() would churn git).
  generatedAt: 'SLICE-01 fixture run',
  issue: issueRow
    ? { id: issueRow.issue_id, model: issueRow.model, runId: issueRow.run_id }
    : null,
  pages: [...new Set(rows.map((r) => r.page_record))].sort((a, b) => a - b),
  objects,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(payload, null, 2));

const pub = objects.filter((o) => o.isPublicationContent).length;
console.log(
  `[export-real] wrote ${objects.length} objects (${pub} publication-content) ` +
    `from ${payload.pages.length} pages → ${outFile.replace(repoRoot + '/', '')}`
);
