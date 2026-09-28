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

## Region location — OCR anchoring, not the VLM

Where an object *sits* on the page is not a VLM question. The SLICE-03 bake-off is the proof: same
page, same prompt, three engines, three different coordinate conventions and none of them the
normalized `[x,y,w,h]` the prompt asks for (`gemini-flash` → `[ymin,xmin,ymax,xmax]`/1000, `sonnet` →
pixels, `gpt-4o` → declined). So the job is split along the grain of what each tool is good at:

- the **VLM** gives accurate *text*, grouped into content objects;
- **Tesseract** gives accurate *coordinates* for every word;
- `src/lib/ocrAnchor.ts` matches one to the other and snaps the result to a column grid detected
  from the page itself.

Deterministic, no model spend, ~25s/page. Requires `tesseract` on PATH (`brew install tesseract`);
without it the stage warns and leaves regions alone rather than failing the ingest.

```bash
npm run relocate             # re-derive regions for every ingested page (no VLM calls)
npm run relocate -- 7618     # one page record
npm run relocate -- --dry    # report only
npm run relocate -- --force  # ALSO overwrite curator-corrected regions
```

`region_bbox` is `{ rects: [[x,y,w,h], …], source, coverage, ocrConf }` — normalized 0–1, largest
rect first. **Several rects** because a story that jumps columns genuinely occupies several
rectangles; one box over both would claim 7–31× the page area it holds. `coverage` is matched
transcript tokens ÷ total — below `OCR_MIN_COVERAGE` the region is stored as `null`, because "no
region located" beats a confidently drawn wrong box.

Curators correct regions in the workbench (`POST /api/region`). Those are stamped `source:'human'`
and `relocate` leaves them alone unless `--force`.

## Box-first ingestion (SLICE-14)

The alternative to page-first ingestion, chosen by a curator per page: detect boxes → group →
curator review → transcribe each box from its own full-res crop. Three detectors are offered so
curators can learn which one needs the fewest corrections on these papers:

| id | what | licence |
|---|---|---|
| `tesseract` | Tesseract's own layout blocks, snapped to the column grid (~25s/page) | Apache-2.0 |
| `american-stories` | YOLOv8 trained on Chronicling America (Dell et al. 2023): article, headline, ad, masthead… (~1s) | **none published — evaluation only, never commit** |
| `pp-doclayout` | PP-DocLayoutV3: general layout, paragraph-level boxes + predicted reading order (~1s) | Apache-2.0 |

The two ONNX models run in `detect/detect.py` (Python via `uv`, onnxruntime on CPU); Node shells
out to it like it does to `tesseract`, so the server itself stays dependency-free.

```bash
npm run detect:models          # fetch weights into models/ (gitignored) + uv sync
npm run detect -- 7618         # every detector on one page → out/detect/7618/<detector>.jpg|json
npm run detect -- 7618 --detector pp-doclayout
```

**Grouping** (`src/lib/group.ts`). A detector finds regions, not stories, so one VLM call per page
(`GROUPING_MODEL`, default Sonnet 5) reads the page with every box drawn and numbered, and answers in
numbers — `{ boxes: [3, 7, 8], object_class: "article" }` — never in coordinates. Every box ends up in
exactly one group or explicitly discarded; any box the model forgets gets a group of its own flagged
`unplaced`. If the call fails, the page keeps its boxes (one group each) and the reason is logged.
`GROUPING_EFFORT` defaults to `medium`: measured on a 56-box Brooklyn News page, `high` took 30–160s,
`medium` 60–90s with near-identical groups, and `low` 8–12s but joined half as many headlines to
their bodies.

**Proposals** (`src/lib/boxFirst.ts`, table `box_proposals`). One per (page, detector): the raw boxes,
the curator-corrected boxes, the grouping, and an edit count. Box-first is refused on pages already
ingested, and a page under review has `page_ingests.status = 'review'`. Endpoints: `/api/boxfirst/*`
(see the header of `src/server.ts`).

**Review** happens in the staff workbench: an un-ingested page offers box-first beside page-first;
the curator corrects boxes and groups (autosaved; every correction counted per detector).

**Coverage** (`src/lib/boxTranscribe.ts`). Text outside every grouped box would never be read, so
transcription is refused while the page has *gaps*: runs of ≥ `COVERAGE_MIN_WORDS` Tesseract-read
words whose centres lie in no grouped box. The curator boxes them (click a gap) or transcribes anyway.
On the first real pages it caught a whole column of classifieds, a photo caption, and ad price panels.

**Transcription** reads each GROUP in one call: every box's crop of the archival master (IIIF pixel
region, padded by `BOXFIRST_PAD`), labelled in the curator's reading order, transcribed as one
continuous text. A box taller than the model's image ceiling goes as overlapping vertical slices, so a
full column stays at native resolution (page-first sees it at ~200px wide). Reading a group together
is not a nicety: read box-by-box as "part 2 of 2", a legal notice whose headline box sat inside the
top of its body box lost its whole first slice — ~460 words, with no error — and line-break hyphens
came back unjoined, unlike page-first. A group over `BOXFIRST_MAX_IMAGES` images is read in chunks.
The page then runs through `enrichAndPersist` — the same enrichment and persistence page-first uses.
`BOXFIRST_EFFORT` defaults to `low`: on a two-slice legal notice, `low` and `medium` took the same
~22s and differed by 4 words in ~900.

## Implementation notes (not intent — see `_FROM-BUILD` for intent changes)

- The SLICE-01 brief recommended a Next.js scaffold to mirror CN. For this slice's throwaway view
  (a plain HTML table + console dump, explicitly "not a designed screen"), plain Node + `node:sqlite`
  keeps it dependency-free. Claude Design owns real interfaces once the loop is proven.
- `scratch/` holds image crops used to condition pages for the reading pass (reader conditioning, not
  a pipeline stage — Stage 1 tooling is skipped per the brief). Gitignored.

## Layout

```
src/config.ts          knobs: inbox path, page map, provider/model select, OCR_* anchoring
src/lib/vlm-prompt.ts  the transcription contract (vendored)
src/lib/vlmExtract.ts  the adapter (fixture | anthropic)
src/lib/db.ts          node:sqlite open + migrate
src/lib/explode.ts     ordered blocks -> rows (filler collapse, handwriting flag)
src/lib/ocrAnchor.ts   transcript x OCR words -> measured region rects (Stage 2b "locate")
src/ingest.ts          the run command
src/relocate.ts        re-derive regions for already-ingested pages (no VLM spend)
src/lib/detect.ts      box-first detector adapter (tesseract | american-stories | pp-doclayout)
src/lib/group.ts       box-first grouper: numbered-box overview → content objects
src/lib/boxFirst.ts    box-first proposals: detect → group → draft, curator saves, regroup
src/lib/boxTranscribe.ts  box-first coverage check + per-box transcription → enrichAndPersist
src/detect.ts          run detectors on a page, write numbered-box overlays
detect/                the Python half: detect.py (ONNX detectors + overlay), fetch-models.sh
src/view.ts            "look at it" — console + out/view.html
fixtures/              session-VLM structured transcriptions (one JSON per page)
inbox/                 source page images (live providers + probe only; see inbox/README.md)
migrations/001_init.sql
```

> **Image location:** `INBOX_DIR` defaults to the repo-relative `inbox/` folder so the repo is
> self-contained. Override it (`INBOX_DIR=/path npm run probe`) to read the images from elsewhere.
> The `fixture` default provider needs no images.
