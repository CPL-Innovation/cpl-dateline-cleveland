// SQLite store via Node's built-in node:sqlite (no native compile).
// SLICE-01 blesses SQLite or flat JSON — this is the prototype, not production.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { DB_PATH, ROOT } from "../config.ts";

// Article-only enrichment overlay columns (SLICE-02). Added idempotently so
// re-running never fails on "duplicate column". Raw SLICE-01 columns are untouched
// — enrichment is an overlay, never a mutation (Principle 4).
const ENRICHMENT_COLUMNS: Array<[string, string]> = [
  ["article_type", "TEXT"],
  ["is_advertorial", "INTEGER"], // bool 0|1, nullable (only meaningful on articles)
  ["is_advertorial_confidence", "TEXT"], // high|medium|low
  ["summary", "TEXT"],
  ["context_hint", "TEXT"],
  ["event_type", "TEXT"],
  ["tags", "TEXT"], // JSON array
  ["enrichment_tier", "TEXT"], // heavy|light|structured|capture_only
  ["curation_status", "TEXT"], // default set at write time: 'unreviewed'
  ["payload", "TEXT"], // JSON — class-specific structured data (light/structured tiers)
];

function addColumnIfMissing(
  db: DatabaseSync,
  table: string,
  column: string,
  decl: string,
): void {
  const cols = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => (c as { name: string }).name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}

function runMigration(db: DatabaseSync, file: string): void {
  db.exec(readFileSync(resolve(ROOT, "migrations", file), "utf8"));
}

export function openDb(): DatabaseSync {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  runMigration(db, "001_init.sql"); // SLICE-01 base store
  runMigration(db, "002_enrichment.sql"); // SLICE-02 enrichment tables
  for (const [col, decl] of ENRICHMENT_COLUMNS) {
    addColumnIfMissing(db, "content_objects", col, decl);
  }
  return db;
}
