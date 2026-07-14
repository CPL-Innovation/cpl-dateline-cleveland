// SLICE-01 run command: the whole loop.
// image -> vlmExtract (adapter) -> explode -> content_objects store.
// Run: npm run ingest      (VLM_PROVIDER=fixture by default; =anthropic with a key)
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { openDb } from "./lib/db.ts";
import { vlmExtract } from "./lib/vlmExtract.ts";
import { explodePage } from "./lib/explode.ts";
import {
  INBOX_DIR,
  ISSUE_ID,
  PAGES,
  VLM_PROVIDER,
  PROMPT_VERSION,
} from "./config.ts";

// Deterministic run id (Date.now is unavailable in some sandboxes; keep it reproducible).
const RUN_ID = `${PROMPT_VERSION}_${VLM_PROVIDER}_run1`;
const CREATED_AT = "2026-07-13T00:00:00Z";

async function main() {
  const db = openDb();
  // Idempotent re-run: clear this run's rows first.
  db.prepare("DELETE FROM content_objects WHERE run_id = ?").run(RUN_ID);

  const insert = db.prepare(`
    INSERT INTO content_objects
      (issue_id, page_record, seq, object_class, role, text, region_bbox,
       is_publication_content, occurrences, transcription_confidence, run_id, model, created_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let total = 0;
  for (const page of PAGES) {
    const imagePath = resolve(INBOX_DIR, page.file);
    if (!existsSync(imagePath) && VLM_PROVIDER === "anthropic") {
      throw new Error(`Missing page image: ${imagePath}`);
    }
    const { blocks, model, provider } = await vlmExtract({
      imagePath,
      pageRecord: page.pageRecord,
      pageNumber: page.pageNumber,
    });
    const rows = explodePage({
      blocks,
      issueId: ISSUE_ID,
      pageRecord: page.pageRecord,
      runId: RUN_ID,
      model,
      createdAt: CREATED_AT,
    });
    for (const r of rows) {
      insert.run(
        r.issue_id,
        r.page_record,
        r.seq,
        r.object_class,
        r.role,
        r.text,
        r.region_bbox,
        r.is_publication_content,
        r.occurrences,
        r.transcription_confidence,
        r.run_id,
        r.model,
        r.created_at,
      );
    }
    total += rows.length;
    console.log(
      `  page ${page.pageNumber} (rec ${page.pageRecord}) via ${provider}/${model}: ` +
        `${blocks.length} blocks -> ${rows.length} rows`,
    );
  }

  console.log(`\nIngested ${total} content_objects rows into the store (run ${RUN_ID}).`);
  db.close();
}

main().catch((err) => {
  console.error("ingest failed:", err.message);
  process.exit(1);
});
