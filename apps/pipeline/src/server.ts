// SLICE-08 — the live per-page ingestion service (Postgres + pgvector).
//   npm run server        (VLM_PROVIDER/ENRICH_PROVIDER forced to anthropic)
//
// Endpoints (JSON unless noted):
//   GET  /api/health                         → { ok, db }
//   GET  /api/page?collection=&record=       → page state + objects (review panel load)
//   GET  /api/ingest?collection=&pointer=&issueId=&record=&page=[&force=1]
//                                            → text/event-stream of {phase,message,pct},
//                                              then a `result` (objects) or `error` event
//
// Rights gate + idempotency live in ingestPage(); this file is transport + seeding.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { INGEST_PORT, CATALOG_JSON, CDM_QUERY_BASE, iiifId } from "./config.ts";
import { reextractObject } from "./lib/reextract.ts";
import { resummarize, setObjectSummary } from "./lib/resummarize.ts";
import { fetchRetry } from "./lib/http.ts";
import { migrate, query, closePool, getPool } from "./lib/pg.ts";
import { ingestPage, importPage, getPageObjects, setObjectRegion, setObjectText, setObjectReview, setObjectTitle, replaceObjectRawText, deleteObject, RightsBlocked } from "./lib/ingestPage.ts";
import { getDiscovery } from "./lib/discovery.ts";
import { suggestTitle } from "./lib/suggestTitle.ts";

// Resolve an issue's page structure (page number → ContentDM record) so ANY page
// becomes addressable/ingestable, not just ones we already have records for.
// Cached in-process — the structure is static.
const pageCache = new Map<string, Array<{ page: number; record: number; title: string }>>();
async function resolveIssuePages(collection: string, pointer: number) {
  const key = `${collection}/${pointer}`;
  if (pageCache.has(key)) return pageCache.get(key)!;
  const res = await fetchRetry(
    `${CDM_QUERY_BASE}?q=dmGetCompoundObjectInfo/${collection}/${pointer}/json`, {},
    { label: `compoundInfo ${pointer}` });
  if (!res.ok) throw new Error(`compoundInfo ${pointer} → HTTP ${res.status}`);
  const d = (await res.json()) as any;
  const pages = (Array.isArray(d?.page) ? d.page : d?.page ? [d.page] : []).map((p: any, i: number) => ({
    page: i + 1, record: Number(p.pageptr), title: String(p.pagetitle ?? `Page ${i + 1}`),
  }));
  pageCache.set(key, pages);
  return pages;
}

const ORIGIN = process.env.CORS_ORIGIN ?? "*";
function cors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  // DELETE belongs here too — /api/object uses it. A method missing from this
  // list fails the browser's preflight and surfaces as a bare "Failed to fetch"
  // in the client, with no request ever reaching a route (curl never sees this,
  // because curl sends no preflight).
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
}
function json(res: ServerResponse, status: number, body: unknown) {
  cors(res);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "", size = 0;
    req.on("data", (c) => { size += c.length; if (size > 25_000_000) { req.destroy(); reject(new Error("payload too large (>25MB)")); return; } body += c; });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

// Seed the `issues` rights source-of-truth from the committed catalog.json.
async function seedIssues() {
  let cat: any;
  try {
    cat = JSON.parse(await readFile(CATALOG_JSON, "utf8"));
  } catch {
    console.warn("[server] catalog.json not found — issues table not seeded (run `npm run catalog`).");
    return;
  }
  const issues = cat.issues ?? [];
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    for (const it of issues) {
      await client.query(
        `INSERT INTO issues (pointer, collection, title, serial, sort_date, filetype, rights_status, rights_label, page_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (pointer) DO UPDATE SET
           title=EXCLUDED.title, serial=EXCLUDED.serial, sort_date=EXCLUDED.sort_date,
           rights_status=EXCLUDED.rights_status, rights_label=EXCLUDED.rights_label, page_count=EXCLUDED.page_count`,
        [it.pointer, cat.meta?.collection ?? "p16014coll5", it.title, it.serial, it.sortda,
         it.filetype, it.rights?.status ?? "unknown", it.rights?.label ?? null, it.pageCount],
      );
    }
    await client.query("COMMIT");
    console.log(`[server] seeded ${issues.length} issues (rights source of truth).`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[server] issue seed failed:", (e as Error).message);
  } finally {
    client.release();
  }
}

function sseOpen(res: ServerResponse) {
  cors(res);
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
}
function sse(res: ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", `http://localhost:${INGEST_PORT}`);
  const q = url.searchParams;
  if (req.method === "OPTIONS") { cors(res); res.writeHead(204); return res.end(); }

  if (url.pathname === "/api/health") {
    try { await query("SELECT 1"); return json(res, 200, { ok: true, db: "up" }); }
    catch (e) { return json(res, 500, { ok: false, db: (e as Error).message }); }
  }

  if (url.pathname === "/api/ingest-status") {
    // Per-issue done-page counts so the dashboard can color issues by ingestion
    // progress (full / partial / uningested).
    try {
      const r = await query<{ issue_pointer: number; done: number }>(
        "SELECT issue_pointer, count(*) FILTER (WHERE status='done') done FROM page_ingests WHERE issue_pointer IS NOT NULL GROUP BY issue_pointer");
      const issues: Record<string, number> = {};
      for (const row of r.rows) issues[row.issue_pointer] = Number(row.done);
      return json(res, 200, { issues });
    } catch (e) { return json(res, 500, { error: (e as Error).message }); }
  }

  if (url.pathname === "/api/discovery") {
    try { return json(res, 200, await getDiscovery()); }
    catch (e) { return json(res, 500, { error: (e as Error).message }); }
  }

  if (url.pathname === "/api/issue-pages") {
    const collection = q.get("collection") ?? "p16014coll5";
    const pointer = Number(q.get("pointer"));
    if (!pointer) return json(res, 400, { error: "pointer required" });
    try {
      const pages = await resolveIssuePages(collection, pointer);
      // annotate each page with its ingestion status (so the UI can badge done pages)
      const recs = pages.map((p) => p.record);
      const st = recs.length
        ? await query<{ page_record: number; status: string; object_count: number }>(
            "SELECT page_record, status, object_count FROM page_ingests WHERE collection=$1 AND page_record = ANY($2)",
            [collection, recs])
        : { rows: [] as any[] };
      const byRec = new Map(st.rows.map((r) => [r.page_record, r]));
      return json(res, 200, { pages: pages.map((p) => ({ ...p, ...(byRec.get(p.record) ?? { status: "pending", object_count: 0 }) })) });
    } catch (e) { return json(res, 502, { error: (e as Error).message }); }
  }

  if (url.pathname === "/api/page") {
    const collection = q.get("collection") ?? "p16014coll5";
    const record = Number(q.get("record"));
    if (!record) return json(res, 400, { error: "record required" });
    try { return json(res, 200, await getPageObjects(collection, record)); }
    catch (e) { return json(res, 500, { error: (e as Error).message }); }
  }

  // The first WRITE route. A curator's corrected region for one content object.
  // Body: { objectId: number | "co-123", rects: [[x,y,w,h], …] } — an empty/absent
  // rects array clears the region back to null.
  if (url.pathname === "/api/region" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      const id = Number(String(body.objectId ?? "").replace(/^co-/, ""));
      const region = await setObjectRegion(id, body.rects ?? []);
      return json(res, 200, { ok: true, objectId: id, region });
    } catch (e) { return json(res, 400, { error: (e as Error).message }); }
  }

  // The curator's corrected transcription. Body: { objectId, text } — a null or
  // empty text clears the overlay and hands the object back to the machine's read.
  // Never touches content_objects.text; see setObjectText.
  if (url.pathname === "/api/object-text" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      const id = Number(String(body.objectId ?? "").replace(/^co-/, ""));
      const out = await setObjectText(id, body.text ?? null);
      return json(res, 200, { ok: true, objectId: id, ...out });
    } catch (e) { return json(res, 400, { error: (e as Error).message }); }
  }

  // The curator's verdict and their note. Body: { objectId, status?, note? } —
  // each field is applied only when present, so the note auto-saving on blur can
  // never reset a status set a moment earlier (and vice versa).
  if (url.pathname === "/api/object-review" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      const id = Number(String(body.objectId ?? "").replace(/^co-/, ""));
      const patch: { status?: unknown; note?: unknown; published?: unknown } = {};
      if ("status" in body) patch.status = body.status;
      if ("note" in body) patch.note = body.note;
      if ("published" in body) patch.published = body.published;
      const out = await setObjectReview(id, patch);
      return json(res, 200, { ok: true, objectId: id, ...out });
    } catch (e) { return json(res, 400, { error: (e as Error).message }); }
  }

  // The curator's display title. Body: { objectId, title } — null/empty clears the
  // override and hands the object back to the automatic rule in lib/title.ts.
  if (url.pathname === "/api/object-title" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      const id = Number(String(body.objectId ?? "").replace(/^co-/, ""));
      const out = await setObjectTitle(id, body.title ?? null);
      return json(res, 200, { ok: true, objectId: id, ...out });
    } catch (e) { return json(res, 400, { error: (e as Error).message }); }
  }

  // Destroy an object and everything hanging off it. A DELETE verb, deliberately:
  // this is the one route here that cannot be undone, and it should not be
  // reachable by the same POST shape as every reversible edit.
  if (url.pathname === "/api/object" && req.method === "DELETE") {
    try {
      const id = Number(String(q.get("objectId") ?? "").replace(/^co-/, ""));
      const out = await deleteObject(id);
      return json(res, 200, { ok: true, objectId: id, ...out });
    } catch (e) { return json(res, 400, { error: (e as Error).message }); }
  }

  // Ask Haiku for a display title. SUGGESTS ONLY — it writes nothing; the
  // workbench drops the suggestion into the field and the curator saves it.
  if (url.pathname === "/api/object-title/suggest" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      const id = Number(String(body.objectId ?? "").replace(/^co-/, ""));
      if (!Number.isFinite(id)) throw new Error("objectId must be a number");
      const r = await query<{ text: string; object_class: string; role: string | null }>(
        `SELECT COALESCE(text_human, text) AS text, object_class, role
           FROM content_objects WHERE id = $1`, [id]);
      if (!r.rowCount) throw new Error(`no content object with id ${id}`);
      const row = r.rows[0];
      const out = await suggestTitle(row.text, row.object_class, row.role);
      return json(res, 200, { ok: true, objectId: id, ...out });
    } catch (e) { return json(res, 400, { error: (e as Error).message }); }
  }

  // Re-transcribe one object from its own crop. SUGGESTS ONLY — the re-read goes
  // back to the workbench and the curator saves it, or doesn't.
  if (url.pathname === "/api/object-text/reextract" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      const id = Number(String(body.objectId ?? "").replace(/^co-/, ""));
      if (!Number.isFinite(id)) throw new Error("objectId must be a number");
      const r = await query<any>(
        `SELECT page_record, object_class, role, region_bbox FROM content_objects WHERE id = $1`, [id]);
      if (!r.rowCount) throw new Error(`no content object with id ${id}`);
      const row = r.rows[0];
      const bb = row.region_bbox;
      const rect = Array.isArray(bb) ? bb : (Array.isArray(bb?.rects) ? bb.rects[0] : null);
      if (!rect) throw new Error("this object has no region to crop — draw one first");
      const out = await reextractObject({
        iiifId: iiifId(row.page_record),
        rect,
        objectClass: row.object_class,
        role: row.role,
        continuedIn: Number(bb?.continuedIn ?? 0),
      });
      return json(res, 200, { ok: true, objectId: id, ...out });
    } catch (e) { return json(res, 400, { error: (e as Error).message }); }
  }

  // Commit a re-extraction OVER the machine's read. Body: { objectId, text, model }.
  // Writes content_objects.text, preserving the first-ever read in text_original.
  if (url.pathname === "/api/object-raw-text" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      const id = Number(String(body.objectId ?? "").replace(/^co-/, ""));
      const model = typeof body.model === "string" && body.model ? body.model : "unknown";
      const out = await replaceObjectRawText(id, body.text, model);
      return json(res, 200, { ok: true, objectId: id, ...out });
    } catch (e) { return json(res, 400, { error: (e as Error).message }); }
  }

  // Regenerate the summary from the object's CURRENT transcription. Suggests only.
  if (url.pathname === "/api/object-summary/suggest" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      const id = Number(String(body.objectId ?? "").replace(/^co-/, ""));
      if (!Number.isFinite(id)) throw new Error("objectId must be a number");
      const r = await query<any>(
        `SELECT COALESCE(text_human, text) AS text, object_class, role, summary
           FROM content_objects WHERE id = $1`, [id]);
      if (!r.rowCount) throw new Error(`no content object with id ${id}`);
      const out = await resummarize(r.rows[0].text, r.rows[0].object_class, r.rows[0].role);
      return json(res, 200, { ok: true, objectId: id, previous: r.rows[0].summary, ...out });
    } catch (e) { return json(res, 400, { error: (e as Error).message }); }
  }

  // Commit a summary. Enrichment has always been an overlay over immutable raw
  // text, so this writes in place — it is not touching a transcription.
  if (url.pathname === "/api/object-summary" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      const id = Number(String(body.objectId ?? "").replace(/^co-/, ""));
      const out = await setObjectSummary(id, body.summary ?? null);
      return json(res, 200, { ok: true, objectId: id, ...out });
    } catch (e) { return json(res, 400, { error: (e as Error).message }); }
  }

  if (url.pathname === "/api/import" && req.method === "POST") {
    const record = Number(q.get("record"));
    if (!record) return json(res, 400, { error: "record required" });
    try {
      const parsed = JSON.parse(await readBody(req));
      const objects = Array.isArray(parsed) ? parsed : (parsed.objects ?? []);
      const args = {
        collection: q.get("collection") ?? "p16014coll5",
        issuePointer: q.get("pointer") ? Number(q.get("pointer")) : null,
        issueId: q.get("issueId") ?? `issue_${record}`,
        pageRecord: record, pageNumber: Number(q.get("page") ?? 1),
      };
      return json(res, 200, await importPage(args, objects));
    } catch (e) {
      if (e instanceof RightsBlocked) return json(res, 403, { rights: true, error: (e as Error).message });
      return json(res, 400, { error: (e as Error).message });
    }
  }

  if (url.pathname === "/api/ingest") {
    const record = Number(q.get("record"));
    if (!record) return json(res, 400, { error: "record required" });
    sseOpen(res);
    const args = {
      collection: q.get("collection") ?? "p16014coll5",
      issuePointer: q.get("pointer") ? Number(q.get("pointer")) : null,
      issueId: q.get("issueId") ?? `issue_${record}`,
      pageRecord: record,
      pageNumber: Number(q.get("page") ?? 1),
      force: q.get("force") === "1",
    };
    // keepalive comments so proxies don't close the idle socket during the long VLM call
    const ka = setInterval(() => res.write(": keepalive\n\n"), 15000);
    try {
      const result = await ingestPage(args, (e) => sse(res, "progress", e));
      sse(res, "result", result);
    } catch (e) {
      if (e instanceof RightsBlocked) sse(res, "error", { rights: true, message: e.message });
      else sse(res, "error", { message: (e as Error).message });
      console.error(`[ingest] page ${record} failed:`, (e as Error).message);
    } finally {
      clearInterval(ka);
      res.end();
    }
    return;
  }

  json(res, 404, { error: "not found" });
}

async function main() {
  console.log("[server] applying schema…");
  await migrate();
  await seedIssues();
  const server = createServer((req, res) =>
    handle(req, res).catch((e) => { try { json(res, 500, { error: (e as Error).message }); } catch {} }),
  );
  server.listen(INGEST_PORT, () => {
    console.log(`[server] ingestion service on http://localhost:${INGEST_PORT}  (VLM=${process.env.VLM_PROVIDER}, enrich=${process.env.ENRICH_PROVIDER})`);
  });
  const shutdown = async () => { console.log("\n[server] shutting down…"); server.close(); await closePool(); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => { console.error("[server] fatal:", e.message); process.exit(1); });
