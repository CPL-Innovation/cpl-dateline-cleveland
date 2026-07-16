// SLICE-07 Part A+B — harvest the WHOLE-COLLECTION catalog live from ContentDM's
// query API (dmwebservices), the level *above* a single issue. This is the front
// door for the coverage dashboard (the workbench home).
//
//   npm run catalog
//
// Two phases:
//   Phase 1 (fast, ~4 calls): dmQuery walks every top-level record in the
//     collection → title, serial (derived), date, filetype, and the rights label
//     (standa = a rightsstatements.org URI). Writes catalog.json immediately so
//     the dashboard is usable at once.
//   Phase 2 (slow, ~3,586 calls, THROTTLED + RESUMABLE): dmGetCompoundObjectInfo
//     resolves each compound issue's real page count, so "ready to ingest" is
//     PROVEN not inferred (the richer variant). Cached in catalog-pages.json so a
//     re-run doesn't refetch resolved issues.
//
// METADATA ONLY — no page images, no in-copyright CONTENT (only rights *labels*).
// PD-safe to commit; the rights tripwire stays un-fired. The dashboard *shows*
// that in-copyright issues exist and locks them; it never harvests or enriches
// them.
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fetchRetry } from "./lib/http.ts";
import {
  CDM_QUERY_BASE,
  CDM_COLLECTION,
  CATALOG_HARVEST_DIR,
  CATALOG_OUT_DIR,
  DB_PATH,
} from "./config.ts";

const COLL = CDM_COLLECTION;
const PAGE_CACHE = resolve(CATALOG_HARVEST_DIR, "catalog-pages.json");
const MAXRECS = 1000; // dmQuery cap is 1024
const THROTTLE_MS = Number(process.env.CATALOG_THROTTLE_MS ?? 120); // ~8 req/s, polite to CPL

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- rights: map a rightsstatements.org URI (standa) → a dashboard status ------
// InC* = In Copyright (locked). NoC*/PDM/NKC = free of US copyright (open/ready).
// CNE (Copyright Not Evaluated) or empty = genuinely unknown — shown as caution,
// never silently assumed PD. Honesty gradient (Principle 7).
type RightsStatus = "open" | "in_copyright" | "unknown";
function classifyRights(standa: string, rightsText: string): {
  uri: string;
  label: string;
  status: RightsStatus;
} {
  const u = (standa || "").trim();
  const short = u.replace(/^https?:\/\/rightsstatements\.org\/vocab\//, "").replace(/\/1\.0\/?$/, "");
  let status: RightsStatus = "unknown";
  let label = "Rights not evaluated";
  if (/\/InC/i.test(u)) {
    status = "in_copyright";
    label = short.startsWith("InC") ? `In Copyright (${short})` : "In Copyright";
    if (short === "InC") label = "In Copyright";
  } else if (/\/(NoC|NKC)/i.test(u) || /PDM|publicdomain/i.test(u)) {
    status = "open";
    label = short.startsWith("NoC") ? `No Copyright (${short})` : "Public Domain";
  } else if (/\/CNE/i.test(u)) {
    status = "unknown";
    label = "Copyright Not Evaluated";
  } else if (!u) {
    status = "unknown";
    label = rightsText ? "Rights: see note" : "Rights unspecified";
  }
  return { uri: u, label, status };
}

// serial = the publication, derived from the title prefix before the first comma
// ("The Brooklyn News, Volume 10, Issue 5 (1924-02-01)" → "The Brooklyn News").
// Good enough to group the ~14 serials; a genuine serial field would be better but
// `collec` is populated inconsistently (empty for East Side Daily News).
function deriveSerial(title: string): string {
  const t = (title || "").trim();
  const comma = t.indexOf(",");
  const base = comma > 0 ? t.slice(0, comma) : t;
  return base.replace(/\s+/g, " ").trim() || "(untitled)";
}

function yearOf(sortda: string, date: string): number | null {
  const m = /(\d{4})/.exec(sortda || "") || /(\d{4})/.exec(date || "");
  return m ? Number(m[1]) : null;
}

interface Issue {
  pointer: number;
  title: string;
  serial: string;
  date: string;
  sortda: string;
  year: number | null;
  filetype: string; // cpd | url | jpg | ...
  rights: { uri: string; label: string; status: RightsStatus };
  pageCount: number | null; // resolved in phase 2 for cpd; 0 for url; null = unresolved
}

const QUERY_FIELDS = "title!date!sortda!standa!rights!type";

async function dmQueryPage(start: number): Promise<{ total: number; records: any[] }> {
  const url =
    `${CDM_QUERY_BASE}?q=dmQuery/${COLL}/0/${QUERY_FIELDS}/title/${MAXRECS}/${start}/0/0/0/0/0/0/json`;
  const res = await fetchRetry(url, {}, { label: `dmQuery start=${start}` });
  if (!res.ok) throw new Error(`dmQuery start=${start} → HTTP ${res.status}`);
  const d = (await res.json()) as any;
  return { total: Number(d.pager?.total ?? 0), records: d.records ?? [] };
}

// Returns the compound child page pointers (so we can map child→parent for the
// enriched overlay) and the page count. Non-compound → 0 pages.
async function compoundInfo(pointer: number): Promise<{ pageCount: number; childPtrs: number[] }> {
  const url = `${CDM_QUERY_BASE}?q=dmGetCompoundObjectInfo/${COLL}/${pointer}/json`;
  const res = await fetchRetry(url, {}, { label: `compoundInfo ${pointer}`, retries: 2 });
  if (!res.ok) throw new Error(`compoundInfo ${pointer} → HTTP ${res.status}`);
  const d = (await res.json()) as any;
  const pages = Array.isArray(d?.page) ? d.page : d?.page ? [d.page] : [];
  const childPtrs = pages
    .map((p: any) => Number(p.pageptr))
    .filter((n: number) => Number.isFinite(n));
  return { pageCount: pages.length, childPtrs };
}

async function loadPageCache(): Promise<Record<string, number>> {
  if (!existsSync(PAGE_CACHE)) return {};
  try {
    return JSON.parse(await readFile(PAGE_CACHE, "utf8"));
  } catch {
    return {};
  }
}

// enriched issues = whichever catalog cpds contain a page_record that the local
// pipeline actually ingested. Data-driven via the child→parent map (no hardcoded
// pointer). Falls back to the prior catalog.json's enrichedPointers if the store
// is absent (clean clone / public repo — the SQLite store is gitignored).
async function priorEnriched(): Promise<number[]> {
  const prior = resolve(CATALOG_OUT_DIR, "catalog.json");
  if (existsSync(prior)) {
    try {
      const j = JSON.parse(await readFile(prior, "utf8"));
      if (Array.isArray(j.enrichedPointers)) return j.enrichedPointers;
    } catch { /* ignore */ }
  }
  return [];
}

async function enrichedPointers(childToParent: Map<number, number>): Promise<number[]> {
  if (!existsSync(DB_PATH)) {
    const prior = await priorEnriched();
    if (prior.length) console.log(`  no pipeline store; preserving ${prior.length} enriched pointer(s) from committed catalog.json`);
    return prior;
  }
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(DB_PATH);
  const rows = db.prepare(`SELECT DISTINCT page_record FROM content_objects`).all() as any[];
  db.close();
  const parents = new Set<number>();
  for (const r of rows) {
    const parent = childToParent.get(Number(r.page_record));
    if (parent != null) parents.add(parent);
  }
  // Fully-cached resume: child→parent map is empty, so we can't recompute — keep
  // the prior committed list rather than dropping the enriched overlay to zero.
  if (parents.size === 0) return priorEnriched();
  return [...parents].sort((a, b) => a - b);
}

async function writeCatalog(payload: unknown) {
  const json = JSON.stringify(payload, null, 2);
  await mkdir(CATALOG_HARVEST_DIR, { recursive: true });
  await mkdir(CATALOG_OUT_DIR, { recursive: true });
  await writeFile(resolve(CATALOG_HARVEST_DIR, "catalog.json"), json); // provenance copy
  await writeFile(resolve(CATALOG_OUT_DIR, "catalog.json"), json); // dashboard fetches this
}

function summarize(issues: Issue[], enriched: number[]) {
  const byType: Record<string, number> = {};
  const serials = new Map<string, number>();
  const rightsCount = { open: 0, in_copyright: 0, unknown: 0 };
  for (const it of issues) {
    byType[it.filetype] = (byType[it.filetype] || 0) + 1;
    serials.set(it.serial, (serials.get(it.serial) || 0) + 1);
    rightsCount[it.rights.status]++;
  }
  return {
    records: issues.length,
    byFiletype: byType,
    serialCount: serials.size,
    rights: rightsCount,
    enriched: enriched.length,
  };
}

async function main() {
  console.log(`Harvesting catalog for collection ${COLL} from ContentDM query API…\n`);

  // ---- Phase 1: list every top-level record ---------------------------------
  const first = await dmQueryPage(1);
  const total = first.total;
  const raw: any[] = [...first.records];
  for (let start = 1 + MAXRECS; start <= total; start += MAXRECS) {
    const pg = await dmQueryPage(start);
    raw.push(...pg.records);
    process.stdout.write(`\r  phase 1: ${raw.length}/${total} records`);
  }
  console.log(`\r  phase 1: ${raw.length}/${total} records ✓          `);

  const pageCache = await loadPageCache();
  const issues: Issue[] = raw.map((r) => {
    const title = String(r.title ?? "");
    const sortda = String(r.sortda ?? "");
    const date = String(r.date ?? "");
    const ptr = Number(r.pointer);
    return {
      pointer: ptr,
      title,
      serial: deriveSerial(title),
      date,
      sortda,
      year: yearOf(sortda, date),
      filetype: String(r.filetype ?? ""),
      rights: classifyRights(String(r.standa ?? ""), String(r.rights ?? "")),
      pageCount: r.filetype === "url" ? 0 : pageCache[ptr] ?? null,
    };
  });

  const meta = {
    source: "ContentDM dmwebservices query API",
    server: "cdm16014.contentdm.oclc.org",
    collection: COLL,
    note: "PD-safe metadata only (titles/dates/rights labels) — no page images, no in-copyright content.",
  };

  // write an early, usable catalog.json (page counts fill in during phase 2)
  await writeCatalog({ meta, totals: { records: total }, enrichedPointers: [], issues });
  console.log(`  wrote provisional catalog.json (${issues.length} issues) — resolving page structure…\n`);

  // ---- Phase 2: resolve compound page structure (resumable) -----------------
  const cpds = issues.filter((i) => i.filetype === "cpd");
  const childToParent = new Map<number, number>();
  let resolved = 0;
  let done = 0;
  for (const it of cpds) {
    done++;
    if (pageCache[it.pointer] != null && it.pageCount != null) {
      // cached — but we still need child ptrs for the enriched map; refetch only
      // if this pointer might be the enriched issue is overkill. Re-resolve the
      // children lazily: cached count is enough for the dashboard; child map is
      // rebuilt below only for uncached fetches. To keep the enriched overlay
      // correct across resumes, fetch children when cache lacks them.
    }
    try {
      if (pageCache[it.pointer] == null) {
        const info = await compoundInfo(it.pointer);
        pageCache[it.pointer] = info.pageCount;
        it.pageCount = info.pageCount;
        for (const c of info.childPtrs) childToParent.set(c, it.pointer);
        resolved++;
        await sleep(THROTTLE_MS);
      } else {
        it.pageCount = pageCache[it.pointer];
      }
    } catch (e) {
      console.warn(`\n  ⚠ compoundInfo ${it.pointer} failed: ${(e as Error).message} — leaving unresolved`);
    }
    if (done % 50 === 0 || done === cpds.length) {
      process.stdout.write(`\r  phase 2: ${done}/${cpds.length} cpd resolved (${resolved} live this run)`);
      // periodic checkpoint so a long run is crash-safe / inspectable
      await writeFile(PAGE_CACHE, JSON.stringify(pageCache));
    }
  }
  console.log(`\r  phase 2: ${done}/${cpds.length} cpd resolved (${resolved} live this run) ✓     `);
  await writeFile(PAGE_CACHE, JSON.stringify(pageCache));

  // ---- enriched overlay + final write ---------------------------------------
  // Map the local pipeline's ingested page_records → their parent cpd via the
  // child→parent map built while resolving structure. On a FRESH run every cpd is
  // fetched so the map is complete; on a fully-cached resume the map is empty, so
  // enrichedPointers() preserves the prior committed catalog.json's list instead.
  const enriched = await enrichedPointers(childToParent);

  await writeCatalog({ meta, totals: { records: total }, enrichedPointers: enriched, issues });

  const s = summarize(issues, enriched);
  console.log(
    `\nCatalog harvested: ${s.records} issues · ${s.serialCount} serials\n` +
      `  filetypes: ${JSON.stringify(s.byFiletype)}\n` +
      `  rights: ${s.rights.open} open · ${s.rights.in_copyright} in-copyright · ${s.rights.unknown} unknown\n` +
      `  enriched (from local pipeline): ${s.enriched} → pointer(s) ${enriched.join(", ") || "none"}\n` +
      `  → harvest/catalog.json + discovery/public/catalog.json (committed, PD metadata)`,
  );
}

main().catch((err) => {
  console.error("catalog harvest failed:", err.message);
  process.exit(1);
});
