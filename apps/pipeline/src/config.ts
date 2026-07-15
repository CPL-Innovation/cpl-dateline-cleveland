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

export const DB_PATH = resolve(ROOT, "data", "slice01.sqlite");
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
