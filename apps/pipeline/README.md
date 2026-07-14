# @dateline/pipeline — SLICE-01 (Brooklyn News executable slice)

The `apps/pipeline` workspace. The goblin's first step: prove
**`image → VLM → structured content-objects → viewable`** works on real Brooklyn News pages.
One issue. No UI polish, no discovery features, no entity/event enrichment.

Built from the vault-side specs (`build/BUILD-SPEC.md` → `build/SLICE-01-brooklyn-news.md`).
Those specs are read-only design intent; intent changes are proposed back via `build/_FROM-BUILD.md`.

> Part of the `cpl-dateline-cleveland` monorepo. `apps/discovery`'s **REAL DATA** toggle reads this
> pipeline's SQLite output (`apps/pipeline/data/slice01.sqlite`) — the pipeline → discovery seam.

## What it does

Runs the four real Brooklyn News pages (Feb 1, 1924; CDM records 7618–7621, already on disk) through
one **structured-per-page VLM pass** each, explodes the ordered blocks into a `content_objects` store,
and renders the result so you can eyeball it against Dry Run 01's hand-simulated inventory.

## Run it

From the **monorepo root** (delegates to this workspace):

```bash
npm run pipeline    # ingest + view
npm run ingest      # image -> VLM (adapter) -> explode -> SQLite
npm run view        # console dump + apps/pipeline/out/view.html
```

Or from inside `apps/pipeline/`:

```bash
npm run slice01     # ingest + view
```

Requires Node ≥ 22.5 (uses built-in `node:sqlite` and TypeScript type-stripping — no build step,
no native modules). Then open `apps/pipeline/out/view.html`, or read the console output. Copy
`.env.example` → `.env` (gitignored) only if you want to run a live VLM provider.

## The VLM adapter (a config swap, not a hardcode)

The model lives behind one adapter (`src/lib/vlmExtract.ts`). Four providers, chosen by `VLM_PROVIDER`:

| Provider | Model default | Needs | Notes |
|---|---|---|---|
| `fixture` (default) | `session-vlm:claude/dry-run` | — | replays the session-VLM transcription under `fixtures/` |
| `gemini` | `gemini-2.5-flash` | `GEMINI_API_KEY` | SLICE-01 production-default engine (cheap, strong OCR) |
| `anthropic` | `claude-sonnet-5` | `ANTHROPIC_API_KEY` | **live-validated** — see below |
| `openai` | `gpt-4o` | `OPENAI_API_KEY` | wired; set `VLM_MODEL` to your current vision model |

Keys live in `.env` (gitignored) and are loaded via Node's `--env-file-if-exists`. Swap the model
per provider with `VLM_MODEL`, and the pre-send downscale with `VLM_MAX_EDGE` (default 2200px long edge).

**`fixture`** replays a structured transcription produced by the **session VLM** (Claude reading the
real page pixels), exactly as Dry Run 01 was run ("Claude as the VLM"). It is the genuine structured
output of a VLM pass on the real images, replayed through the real explode → store → view pipeline —
fast, free, and curated, so it stays the default.

Run a live model instead:
```bash
VLM_PROVIDER=gemini npm run ingest        # or anthropic / openai
npm run probe                             # one-page live smoke test (no DB writes)
VLM_PROVIDER=anthropic npm run probe 7621 # probe a specific page record
```

**Re-verify current models/pricing before real spend** — this market moves fast.

The prompt contract lives in `src/lib/vlm-prompt.ts` (vendored, hand-synced to the brief). Spec is
intent; that file is truth.

### Live-wiring status (validated 2026-07-13)

- **anthropic / claude-sonnet-5 — ✅ clean.** Probe on page 1 returned **123 correctly-ordered,
  correctly-classified blocks** (masthead → lead story → columns in reading order; pencil marginalia
  caught as `manuscript_annotation`), ~216s/page.
- **gemini / gemini-2.5-flash — ⚠ degenerated** on the full dense 55-block front page (repetition
  loop in one text field). Auth + image + response path all work; the model just strains on a full
  dense page. This is exactly the failure mode the pipeline spec's *explicit segment→crop→VLM
  fallback for dense pages* anticipates — logged to `build/_FROM-BUILD.md`. Try `gemini-2.0-flash`,
  or use the per-region path for dense pages.
- **openai — wired, not spent against.** Path is identical to the others; set your current vision
  model via `VLM_MODEL`.

The adapter tolerates real-model quirks: it strips code fences, ignores preambles, and **recovers the
largest valid array prefix if the model truncates** a long page (logs a warning, keeps the complete
blocks). A live run costs real money and takes minutes per page — the `fixture` default exists so the
loop is reproducible for free.

## Store shape

`content_objects` (SQLite, `data/slice01.sqlite`) — the minimal SLICE-01 shape only:
`id, issue_id, page_record, seq, object_class, role, text, region_bbox, is_publication_content,
occurrences, transcription_confidence, run_id, model, created_at`. Migration in `migrations/001_init.sql`.

Assembly (`src/lib/explode.ts`) does the minimal Stage 3: confirm `object_class`, collapse repeated
`filler_slug` dupes to one row + an `occurrences` count, and flag handwriting as
`manuscript_annotation` with `is_publication_content = false`. No cross-page stitching, no enrichment
tiers, no events.

## Result vs. the gold set (Dry Run 01)

| Check (gold set) | Result |
|---|---|
| Page 1 = the only news page, articles in reading order (down columns) | ✅ 48 article rows in column order; banner→lead-story handled |
| Pages 2–4 dominated by advertisement / classified / filler | ✅ p2 34 ads, p3 23 ads + classified_section + 2 legal, p4 20 ads + coupon + legal |
| "Burn Yellow Jacket Coal" collapses to one row + high occurrences | ✅ 3 canonical rows, **15 total units** across the issue |
| Pencil marginalia captured as `manuscript_annotation`, not article text | ✅ 2 annotations ("Times classified — 48…" p1; "56" p3), `is_publication_content=0` |
| "Knaupe Breaks Leg" (p4) is a `news_brief` embedded in ads | ✅ |
| The p4 advertorial ("To The Living About The Dead") | ⚠️ lands as `article` — the classifier trap fired (see `_FROM-BUILD` note) |

**Reading-order finding (the risk CN never tested):** structured-per-page held reading order on the
8-column front page without scrambling. Early, cheap signal that the Scene explicit-segmentation
fallback is not needed for community-weekly layouts. Logged to `build/_FROM-BUILD.md`.

## Implementation notes (not intent — see `_FROM-BUILD` for intent changes)

- The SLICE-01 brief recommended a Next.js scaffold to mirror CN. For this slice's throwaway view
  (a plain HTML table + console dump, explicitly "not a designed screen"), plain Node + `node:sqlite`
  keeps it dependency-free. Claude Design owns real interfaces once the loop is proven.
- `scratch/` holds image crops used to condition pages for the reading pass (reader conditioning, not
  a pipeline stage — Stage 1 tooling is skipped per the brief). Gitignored.

## Layout

```
src/config.ts          knobs: inbox path, page map, provider/model select
src/lib/vlm-prompt.ts  the transcription contract (vendored)
src/lib/vlmExtract.ts  the adapter (fixture | anthropic)
src/lib/db.ts          node:sqlite open + migrate
src/lib/explode.ts     ordered blocks -> rows (filler collapse, handwriting flag)
src/ingest.ts          the run command
src/view.ts            "look at it" — console + out/view.html
fixtures/              session-VLM structured transcriptions (one JSON per page)
inbox/                 source page images (live providers + probe only; see inbox/README.md)
migrations/001_init.sql
```

> **Image location:** `INBOX_DIR` defaults to the repo-relative `inbox/` folder so the repo is
> self-contained. Override it (`INBOX_DIR=/path npm run probe`) to read the images from elsewhere.
> The `fixture` default provider needs no images.
