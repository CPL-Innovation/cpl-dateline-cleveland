// SLICE-01 config — one place for the knobs. See BUILD-SPEC / SLICE-01 brief.
// The VLM is a CONFIG SWAP, not a hardcode (SLICE-01 §"paved road", CN vlmExtract rule).
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, "..");

// The four Brooklyn News pages already on disk (SLICE-01 step 1 — no IIIF fetch).
// Default: repo-relative inbox/ so the repo is self-contained and travels alone.
// Override with INBOX_DIR=/some/other/path to point elsewhere (e.g. the vault).
export const INBOX_DIR = process.env.INBOX_DIR ?? resolve(ROOT, "inbox");

export const ISSUE_ID = "brooklynnews_1924-02-01";

// --- ContentDM / IIIF harvest (SLICE-06) ------------------------------------
// CPL's ContentDM serves a IIIF Image API 2.0. The pilot Brooklyn News issue is
// collection p16014coll5, records 7618–7621. The canonical IIIF identifier of a
// page is `${CDM_IIIF_BASE}/${CDM_COLLECTION}/${record}`; its image is that + a
// `/full/<size>/0/default.jpg` request. This is the REAL front door — the harvest
// pulls pages live from here rather than reading hand-obtained local files.
export const CDM_IIIF_BASE =
  process.env.CDM_IIIF_BASE ?? "https://cdm16014.contentdm.oclc.org/digital/iiif";
export const CDM_COLLECTION = process.env.CDM_COLLECTION ?? "p16014coll5";

// --- ContentDM catalog / query API (SLICE-07) -------------------------------
// The *other* ContentDM door: the dmwebservices query API. Where the IIIF Image
// API serves one page's pixels, this LISTS the collection — every top-level issue
// (dmQuery) and each compound issue's page structure (dmGetCompoundObjectInfo).
// It returns only PD-safe METADATA (titles, dates, rights labels) — no page
// images, no in-copyright content — so `npm run catalog` is committable and the
// rights tripwire stays un-fired. This is the front door for the coverage
// dashboard (the workbench home), not for enrichment.
export const CDM_QUERY_BASE =
  process.env.CDM_QUERY_BASE ??
  "https://cdm16014.contentdm.oclc.org/digital/bl/dmwebservices/index.php";
// Committed catalog outputs: the pipeline's provenance copy + the copy the
// dashboard fetches at runtime (same pattern as harvest.ts's dual manifest write).
export const CATALOG_HARVEST_DIR = resolve(ROOT, "harvest");
export const CATALOG_OUT_DIR = resolve(ROOT, "..", "discovery", "public");
export function iiifId(record: number): string {
  return `${CDM_IIIF_BASE}/${CDM_COLLECTION}/${record}`;
}
export function iiifImageUrl(record: number, size = "full"): string {
  return `${iiifId(record)}/full/${size}/0/default.jpg`;
}
// Display size the patron reader / workbench render (IIIF serves it directly — no
// local resize, no tiling server). Full-res (5332×6845) is the pipeline input.
export const HARVEST_DISPLAY_SIZE = process.env.HARVEST_DISPLAY_SIZE ?? "1600,";
// Committed display images + provenance manifest for the front-end (PD, so fine to commit).
export const PAGES_OUT_DIR = resolve(ROOT, "..", "discovery", "public", "pages");

// CDM record → page number map (SLICE-01 step 1: 7618=p1 … 7621=p4).
export const PAGES = [
  { pageRecord: 7618, pageNumber: 1, file: "p16014coll5_7618_full.jpg" },
  { pageRecord: 7619, pageNumber: 2, file: "p16014coll5_7619_full.jpg" },
  { pageRecord: 7620, pageNumber: 3, file: "p16014coll5_7620_full.jpg" },
  { pageRecord: 7621, pageNumber: 4, file: "p16014coll5_7621_full.jpg" },
] as const;

// --- VLM provider selection (the config swap) -------------------------------
// "fixture"   → replay a structured transcription produced by the session VLM
//               (how Dry Run 01 was run: "Claude as the VLM"). No key needed.
// "gemini"    → real Gemini vision call (SLICE-01 §engine choice production default:
//               Gemini-Flash-class — strong OCR, cheap, fast). Needs GEMINI_API_KEY.
// "anthropic" → real Claude vision call. Needs ANTHROPIC_API_KEY.
// "openai"    → real GPT vision call. Needs OPENAI_API_KEY.
// Swapping is a one-line config change. Re-verify current models/pricing before spend.
export type VlmProvider = "fixture" | "gemini" | "anthropic" | "openai";
export const VLM_PROVIDER = (process.env.VLM_PROVIDER ?? "fixture") as VlmProvider;

const DEFAULT_MODEL: Record<VlmProvider, string> = {
  fixture: "session-vlm:claude/dry-run",
  gemini: "gemini-2.5-flash",
  anthropic: "claude-sonnet-5",
  openai: "gpt-4o",
};
export const VLM_MODEL = process.env.VLM_MODEL ?? DEFAULT_MODEL[VLM_PROVIDER];

// Long-edge px to downscale page images to before sending to a live VLM.
export const VLM_MAX_EDGE = Number(process.env.VLM_MAX_EDGE ?? 2200);

// --- Region location: OCR anchoring (SLICE-09 fix) --------------------------
// Where a content object SITS on the page is not a VLM question. The VLM gives us
// the text; Tesseract gives us word coordinates; ocrAnchor.ts matches one to the
// other. Off → keep whatever region_bbox the VLM estimated (and its inaccuracy).
export const OCR_ENABLED = (process.env.OCR_ENABLED ?? "1") !== "0";
export const TESSERACT_BIN = process.env.TESSERACT_BIN ?? "tesseract";
export const OCR_LANG = process.env.OCR_LANG ?? "eng";
// Long-edge px to OCR at, resampled from the full-res master. This knob decides
// whether the whole thing works: on the 1600px display JPEG mean word confidence
// is ~43 and matching fails; resampled to ~4100 from the 5332px master it is ~88
// and matching succeeds. Costs ~25s/page on an M-series Mac.
export const OCR_MAX_EDGE = Number(process.env.OCR_MAX_EDGE ?? 4100);
// Drop OCR words below this confidence before anchoring (0-100).
export const OCR_WORD_CONF = Number(process.env.OCR_WORD_CONF ?? 40);
// A match must be this many CONSECUTIVE tokens to count as an anchor — stops
// common words from anchoring to the wrong column. 2 is safe because the monotone
// alignment (ocrAnchor §C2) already rejects off-chain matches; measured on
// Brooklyn News p1, 2 locates 54/55 objects at 0.84 mean coverage vs 49/55 at 0.71.
export const OCR_MIN_RUN = Number(process.env.OCR_MIN_RUN ?? 2);
// Matched-token coverage below this → store null. An honest "no region located"
// beats a confidently drawn wrong box.
export const OCR_MIN_COVERAGE = Number(process.env.OCR_MIN_COVERAGE ?? 0.35);
// An object can occupy several rects (a story jumping columns). Discard any rect
// smaller than this share of the object's LARGEST rect — measured over 254 located
// objects, nearly every extra rect was a crumb from a wandering chain, not a real
// column jump. 0.20 cut multi-rect objects from 5.1% to 2.0% and removed 9 of the
// 15 extra rects; the survivors are the ones worth defending.
export const OCR_MIN_RECT_SHARE = Number(process.env.OCR_MIN_RECT_SHARE ?? 0.20);

export const DB_PATH = resolve(ROOT, "data", "slice01.sqlite");

// --- Postgres + pgvector (SLICE-08 live per-page ingestion service) ----------
// The production store. DATABASE_URL wins if set; otherwise fall back to a local
// Postgres.app instance over the unix socket (no password). pg also reads PG*
// env vars natively, so any standard Postgres env works.
export const PG_CONFIG = {
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.PGHOST ?? "/tmp",
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? process.env.USER ?? "postgres",
  database: process.env.PGDATABASE ?? "dateline_cleveland",
};
export const INGEST_PORT = Number(process.env.INGEST_PORT ?? 5170);
// Committed catalog the server seeds `issues` (rights source of truth) from.
export const CATALOG_JSON = resolve(ROOT, "..", "discovery", "public", "catalog.json");
export const FIXTURES_DIR = resolve(ROOT, "fixtures");
export const OUT_DIR = resolve(ROOT, "out");
export const PROMPT_VERSION = "slice01-v1";

// --- Enrichment provider selection (SLICE-02) -------------------------------
// Same swap-a-model spine as the VLM adapter. "fixture" (default) replays the
// session-model enrichment committed under fixtures/enrichment/ — the SLICE-01
// method, applied to Stage 4 (read the real object TEXT, produce the judgement).
// The real providers are wired for when a key is provisioned to the local env.
// Model tiering (Principle 10) is a config swap, not a rewrite: cheap model for
// bulk classify, stronger for summaries/events — one issue runs fine on one model.
export type EnrichProvider = "fixture" | "anthropic" | "gemini" | "openai";
export const ENRICH_PROVIDER = (process.env.ENRICH_PROVIDER ??
  "fixture") as EnrichProvider;

const DEFAULT_ENRICH_MODEL: Record<EnrichProvider, string> = {
  fixture: "session-model:claude/slice02",
  anthropic: "claude-sonnet-5",
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o",
};
export const ENRICH_MODEL =
  process.env.ENRICH_MODEL ?? DEFAULT_ENRICH_MODEL[ENRICH_PROVIDER];

export const ENRICH_PROMPT_VERSION = "slice02-v1";
