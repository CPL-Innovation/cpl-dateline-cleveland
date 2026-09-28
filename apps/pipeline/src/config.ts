// Pipeline config — one place for the knobs. Models are a CONFIG SWAP, not a
// hardcode (SLICE-01 §"paved road").
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

// --- VLM provider (SLICE-01 SQLite run) ------------------------------------
// The whole-page VLM adapter this chose between (vlmExtract.ts) is retired with
// page-first ingestion; the value survives only as part of the SLICE-01 run id
// that `npm run view` reads its SQLite rows by.
export type VlmProvider = "fixture" | "gemini" | "anthropic" | "openai";
export const VLM_PROVIDER = (process.env.VLM_PROVIDER ?? "fixture") as VlmProvider;

// --- OCR (Tesseract) --------------------------------------------------------
// Box-first's `tesseract` detector and its coverage check both read the page's
// words through ocr.ts. (Page-first's OCR anchoring — matching a whole-page
// transcript to those words, with its OCR_MIN_* knobs — is retired.)
export const TESSERACT_BIN = process.env.TESSERACT_BIN ?? "tesseract";
export const OCR_LANG = process.env.OCR_LANG ?? "eng";
// Long-edge px to OCR at, resampled from the full-res master. This knob decides
// whether OCR is worth reading: on the 1600px display JPEG mean word confidence
// is ~43; resampled to ~4100 from the 5332px master it is ~88. Costs ~25s/page
// on an M-series Mac.
export const OCR_MAX_EDGE = Number(process.env.OCR_MAX_EDGE ?? 4100);
// Drop OCR words below this confidence (0-100).
export const OCR_WORD_CONF = Number(process.env.OCR_WORD_CONF ?? 40);

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

// ── display-title suggestion (SLICE-09h) ─────────────────────────────────────
// Haiku, deliberately: writing a headline for a paragraph already in front of you
// is a small, well-bounded job, and this runs one object at a time at a curator's
// click. Overridable if a page turns out to need more.
export const TITLE_MODEL = process.env.TITLE_MODEL ?? "claude-haiku-4-5";

// ── single-object re-extraction (SLICE-09i) ──────────────────────────────────
// Sonnet, matching the page-ingestion tier: this is the same transcription job the
// pipeline does, just scoped to one crop, so it should be read by a model of the
// same capability rather than a cheaper one.
export const REEXTRACT_MODEL = process.env.REEXTRACT_MODEL ?? "claude-sonnet-5";
// Long edge requested from IIIF. Claude caps images at 2576px on the long edge and
// downsamples anything larger, so asking for more would ship bytes the model
// discards; IIIF never upscales, so a small crop still arrives at native scale.
export const REEXTRACT_MAX_EDGE = Number(process.env.REEXTRACT_MAX_EDGE ?? 2500);

// ── summary regeneration (SLICE-09j) ─────────────────────────────────────────
// Sonnet, matching the enrichment tier that wrote the summaries in the first place.
export const RESUMMARIZE_MODEL = process.env.RESUMMARIZE_MODEL ?? "claude-sonnet-5";

// ── patron reading-room chat (THE STACKS) ────────────────────────────────────
// Sonnet: this is a conversation with a member of the public about primary source
// material, where a confident wrong answer is the expensive failure mode.
export const CHAT_MODEL = process.env.CHAT_MODEL ?? "claude-sonnet-5";
// Guards, not budgets. The corpus cap keeps one issue's published text inside a
// sane prompt; the turn cap bounds a single conversation's spend (the client shows
// the same number, but the server is the one that enforces it).
export const CHAT_MAX_CORPUS_CHARS = Number(process.env.CHAT_MAX_CORPUS_CHARS ?? 160_000);
export const CHAT_MAX_TURNS = Number(process.env.CHAT_MAX_TURNS ?? 20);

// ── box-first ingestion: layout detectors (SLICE-14) ─────────────────────────
// The alternative to page-first ingestion: detect boxes, a curator reviews and
// groups them, then each box is transcribed from its own full-res crop. Which
// detector draws the boxes is the curator's choice per page — the point is to
// learn which one needs the fewest corrections on these papers.
//
//   tesseract         Tesseract's own layout blocks, snapped to the column grid.
//                     Local, free, already installed — the baseline.
//   american-stories  YOLOv8 from the American Stories project (Dell et al. 2023),
//                     trained on Chronicling America. Newspaper classes (article,
//                     headline, ad, masthead…). Upstream weights carry NO licence:
//                     evaluation use only, never commit them.
//   pp-doclayout      PP-DocLayoutV3 (PaddlePaddle, Apache-2.0). General document
//                     layout, paragraph-level boxes, and a predicted reading order.
//
// The two ONNX models run in detect/detect.py via `uv run`; weights live in
// models/ (gitignored). Fetch them with `npm run detect:models`.
export type DetectorId = "tesseract" | "american-stories" | "pp-doclayout";
export const DETECTOR_IDS: DetectorId[] = ["tesseract", "american-stories", "pp-doclayout"];
export const DETECT_DIR = resolve(ROOT, "detect");
export const MODELS_DIR = resolve(ROOT, "models");
export const UV_BIN = process.env.UV_BIN ?? "uv";
// Tesseract blocks smaller than this share of the page are specks, rules and
// stray marks, not layout.
export const TESS_MIN_BLOCK_AREA = Number(process.env.TESS_MIN_BLOCK_AREA ?? 0.0004);
// The grouper: one call per page that reads the numbered-box overview and says
// which boxes make one content object, in what order. Sonnet, matching the
// page-ingestion tier — deciding what is one story IS the judgement page-first
// ingestion makes implicitly, so it gets the same capability.
export const GROUPING_MODEL = process.env.GROUPING_MODEL ?? "claude-sonnet-5";
// Sonnet 5 thinks adaptively by default at effort "high"; left there, grouping a
// 56-box page took 30–160s and once spent its whole output budget thinking. This
// is structure, not transcription — "medium" is the starting point to measure
// from. low | medium | high | xhigh | max.
export const GROUPING_EFFORT = process.env.GROUPING_EFFORT ?? "medium";
// Long edge of the overview the grouper sees. Box numbers must stay legible on a
// 200-box page; Claude downsamples anything above ~2576px, so this sits under it.
export const GROUPING_MAX_EDGE = Number(process.env.GROUPING_MAX_EDGE ?? 2400);
// Box-first transcription: each group read in one call, every box from its own crop.
// Same model tier as page ingestion and single-object re-extraction.
export const BOXFIRST_MODEL = process.env.BOXFIRST_MODEL ?? REEXTRACT_MODEL;
export const BOXFIRST_EFFORT = process.env.BOXFIRST_EFFORT ?? "low";
export const BOXFIRST_CONCURRENCY = Number(process.env.BOXFIRST_CONCURRENCY ?? 4);
// Margin added around each box before cropping, as a fraction of the page. Enough
// that a box drawn a hair tight doesn't shave the edge off a line of type.
export const BOXFIRST_PAD = Number(process.env.BOXFIRST_PAD ?? 0.003);
// Coverage check: a run of uncovered OCR text this many words or more is a gap.
export const COVERAGE_MIN_WORDS = Number(process.env.COVERAGE_MIN_WORDS ?? 5);
// Box-first reads one group per call; a group needing more images than this
// (a tall box counts once per slice) is read in consecutive chunks.
export const BOXFIRST_MAX_IMAGES = Number(process.env.BOXFIRST_MAX_IMAGES ?? 20);
