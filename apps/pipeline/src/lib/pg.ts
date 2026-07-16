// Postgres + pgvector data layer for the SLICE-08 live ingestion service.
// One shared pool; thin query/tx helpers; a migrate() that applies the schema.
import pg from "pg";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PG_CONFIG, ROOT } from "../config.ts";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = PG_CONFIG.connectionString
      ? new Pool({ connectionString: PG_CONFIG.connectionString, max: 8 })
      : new Pool({
          host: PG_CONFIG.host,
          port: PG_CONFIG.port,
          user: PG_CONFIG.user,
          database: PG_CONFIG.database,
          max: 8,
        });
    pool.on("error", (e) => console.error("[pg] idle client error:", e.message));
  }
  return pool;
}

export function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params as any[]);
}

// Run fn inside a transaction on a dedicated client (BEGIN/COMMIT/ROLLBACK).
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function migrate(): Promise<void> {
  const sql = await readFile(resolve(ROOT, "migrations", "pg", "001_schema.sql"), "utf8");
  await getPool().query(sql);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
