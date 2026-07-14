// SQLite store via Node's built-in node:sqlite (no native compile).
// SLICE-01 blesses SQLite or flat JSON — this is the prototype, not production.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { DB_PATH, ROOT } from "../config.ts";

export function openDb(): DatabaseSync {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  const migration = readFileSync(
    resolve(ROOT, "migrations", "001_init.sql"),
    "utf8",
  );
  db.exec(migration);
  return db;
}
