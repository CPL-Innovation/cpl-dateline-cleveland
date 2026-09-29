# @dateline/pipeline — the ingestion service

The `apps/pipeline` workspace: turns a newspaper page in CPL's ContentDM into structured, enriched
content objects in Postgres, which the staff workbench (`apps/discovery/public/staff.html`) reviews
and corrects.

A page gets its objects one of two ways:

- **box-first** (SLICE-14) — a detector draws boxes, a model groups them into objects, a curator
  corrects both, and each group is transcribed from full-resolution crops of the archival scan;
- **import** — a person supplies the objects as JSON (`POST /api/import`); no model reads the page.

**Page-first** — one VLM read of the whole page, regions found afterwards by OCR anchoring — was the
first way in and is retired (see [History](#history-page-first-ingestion-retired-2026-09-28)). The
pages it made are kept as they are. `page_ingests.mode` records which of the three made each page.

Built from the vault-side specs (`build/BUILD-SPEC.md` and the per-slice briefs). Those specs are
read-only design intent; intent changes are proposed back via `build/_FROM-BUILD.md`.

## Run it

Requires Node ≥ 22.5 (TypeScript type-stripping — no build step), Postgres with pgvector, and an
`ANTHROPIC_API_KEY` in `.env` (gitignored; copy `.env.example`). Box-first also wants `tesseract`
on PATH (`brew install tesseract`) and, for the ONNX detectors, `uv`.

```bash
npm run server                 # the ingestion service on :5170; applies migrations/pg on boot
npm run detect:models          # fetch detector weights into models/ (gitignored) + uv sync
npm run detect -- 7618         # every detector on one page → out/detect/7618/<detector>.jpg|json
npm run detect -- 7618 --detector pp-doclayout
npm run reset-page -- 7600 --dry   # take a page back to un-ingested (transcription + all boxes)
```

**Clearing a page** (`src/lib/clearPage.ts`). The workbench's ⌫ *Clear page…* opens a modal that
lists what the page holds and clears any part of it: the transcription (objects, their enrichment
and every correction), and per detector, its boxes and/or the boxes a curator drew. What the page
becomes follows from what is left: objects left → still transcribed; boxes left → back in box-first
review; nothing → un-ingested. The proposal a transcription was read from keeps its boxes while the
transcription stays, and clearing a transcription with curator work on it (corrected text, reviews,
notes, titles, publications, accepted re-reads or summaries, regions corrected after
transcription) needs an explicit acknowledgement. `reset-page` is the command-line version of
"clear everything"; it refuses any page with curator work rather than asking.

Endpoints are listed in the header of `src/server.ts`. The server does not hot-reload: restart it
after changing anything under `src/`.

**Rights gate.** Every way in calls `assertIngestable()`, which refuses an in-copyright issue before
any page image reaches a model.

## Box-first ingestion (SLICE-14)

detect boxes → group → curator review → coverage check → transcribe each group → enrich → persist.

Three detectors are offered so curators can learn which one needs the fewest corrections on these
papers:

| id | what | licence |
|---|---|---|
| `tesseract` | Tesseract's own layout blocks, snapped to the column grid (~25s/page) | Apache-2.0 |
| `american-stories` | YOLOv8 trained on Chronicling America (Dell et al. 2023): article, headline, ad, masthead… (~1s) | **none published — evaluation only, never commit** |
| `pp-doclayout` | PP-DocLayoutV3: general layout, paragraph-level boxes + predicted reading order (~1s) | Apache-2.0 |

The two ONNX models run in `detect/detect.py` (Python via `uv`, onnxruntime on CPU); Node shells
out to it like it does to `tesseract`, so the server itself stays dependency-free.

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
ingested, and a page under review has `page_ingests.status = 'review'`.

**Review** happens in the staff workbench: an un-ingested page offers the detectors; the curator
corrects boxes and groups (autosaved; every correction counted per detector). The workbench's
"⚡ Ingest this page" button is an inert placeholder, kept for running the box-first steps
unattended over a whole issue.

**Coverage** (`src/lib/boxTranscribe.ts`). Text outside every grouped box would never be read, so
transcription is refused while the page has *gaps*: runs of ≥ `COVERAGE_MIN_WORDS` Tesseract-read
words whose centres lie in no grouped box. The curator boxes them (click a gap) or transcribes anyway.
On the first real pages it caught a whole column of classifieds, a photo caption, and ad price panels.

**Transcription** reads each GROUP in one call: every box's crop of the archival master (IIIF pixel
region, padded by `BOXFIRST_PAD`), labelled in the curator's reading order, transcribed as one
continuous text. A box taller than the model's image ceiling goes as overlapping vertical slices, so a
full column stays at native resolution (a whole-page read sees it at ~200px wide). Reading a group
together is not a nicety: read box-by-box as "part 2 of 2", a legal notice whose headline box sat
inside the top of its body box lost its whole first slice — ~460 words, with no error — and
line-break hyphens came back unjoined. A group over `BOXFIRST_MAX_IMAGES` images is read in chunks.
The page then runs through `enrichAndPersist` (`src/lib/ingestPage.ts`) — tiered enrichment, then
one transaction. `BOXFIRST_EFFORT` defaults to `low`: on a two-slice legal notice, `low` and `medium`
took the same ~22s and differed by 4 words in ~900.

**Classification.** The grouper decides an object's class from the page *layout*, at an overview
resolution where body text is illegible. So the group read also returns `object_class` and `role`,
judged from the words. Precedence: a class the curator set by hand stands; otherwise the
transcriber's; the grouper's is only a proposal. How each class was reached — and whether grouper and
transcriber agreed — is kept in `content_objects.classification` (migration 009) and shown in the
workbench credit line.

## Regions

`region_bbox` is `{ rects: [[x,y,w,h], …], source, continuedIn, order, … }`, normalized 0–1.

- **Every rect** of the object is kept — a story that jumps columns genuinely occupies several
  rectangles; one box over both would claim 7–31× the page area it holds. **Largest first**:
  `rects[0]` is the primary, the box the workbench highlights; its ⧉ toggle draws them all.
  `continuedIn` is the number of rects beyond the primary.
- **`order`** is the reading order, as indices into `rects` (`src/lib/region.ts`). Box-first writes
  the curator's order; a hand edit keeps it (each new box takes the place of the old box it overlaps
  most); import keeps the order the JSON listed. A region without one is read in geometric order —
  column bands left to right, each top to bottom, the rule detectors number their boxes by.
- **`source`** says whose geometry it is: `detector:<id>` (box-first), `human` (a curator drew or
  moved a box), `imported`, or `ocr-anchor` (page-first).

Curators correct regions in the workbench (`POST /api/region`): any box can be moved, resized or
deleted, and the save keeps the object's whole set of rects, stamped `source:'human'`.

**Re-extraction** (`src/lib/reextract.ts`, `POST /api/object-text/reextract`) reads an object again
through box-first's own call: every box, in reading order, in one request. It works on any object
with a region, whichever way its page was ingested, and only suggests — the curator saves it or not.

## History: page-first ingestion (retired 2026-09-28)

**SLICE-01** proved `image → VLM → structured content-objects → viewable` on the four Brooklyn News
pages of Feb 1, 1924 (records 7618–7621): one **structured-per-page VLM pass** per page, exploded into
a SQLite `content_objects` store. Against Dry Run 01's gold set it held reading order down an
8-column front page, collapsed the repeated "Burn Yellow Jacket Coal" slug to one row, and caught
pencil marginalia as `manuscript_annotation`; the p4 advertorial landed as `article`. Live-wired
2026-07-13: `claude-sonnet-5` was clean (123 correctly ordered blocks on p1, ~216s/page);
`gemini-2.5-flash` degenerated on the dense front page. `fixtures/` keeps the SLICE-01
transcriptions; the committed discovery exports were built from them.

**SLICE-08** moved it into Postgres as a live per-page service (`GET /api/ingest`), and **SLICE-09**
located objects by **OCR anchoring**: a VLM reads text well and regresses geometry badly (the SLICE-03
bake-off got three coordinate conventions from three engines, none the one asked for), so Tesseract
supplied word coordinates and each transcript was matched to them and snapped to the page's column
grid.

Box-first replaced it: it reads text at native resolution rather than ~200px per column, its
coverage check catches text a whole-page read drops (classified columns, captions, ad panels), and its
regions are where the words were read from rather than matched afterwards. The code (`vlmExtract.ts`,
`ocrAnchor.ts`'s anchoring, `ingestPage()`, `relocate.ts`, `ingest.ts`, `probe.ts`) is in git history
up to commit `ece22b9`. Pages ingested page-first that curators had corrected (7599, 7618, 7619, 7621)
keep `page_ingests.mode = 'page-first'`, their `ocr-anchor` regions, and every correction made on
them; the two nobody had touched (7600, 7620) were reset for box-first.

The SQLite prototype's remaining scripts still run against an existing `data/slice01.sqlite`:
`npm run enrich` (SLICE-02 enrichment overlay) and `npm run view` (console + `out/view.html`).

## Layout

```
src/server.ts             the ingestion service: HTTP + SSE endpoints, schema, seeding
src/config.ts             knobs: models, efforts, detector + OCR settings
src/lib/boxFirst.ts       box-first proposals: detect → group → draft, curator saves, regroup
src/lib/detect.ts         detector adapter (tesseract | american-stories | pp-doclayout)
src/lib/group.ts          grouper: numbered-box overview → content objects
src/lib/boxTranscribe.ts  coverage check + per-group transcription → enrichAndPersist
src/lib/ingestPage.ts     enrich + persist, import, and every curator correction
src/lib/reextract.ts      re-read one object from all its boxes (suggest only)
src/lib/region.ts         reading order of an object's boxes
src/lib/ocr.ts            Tesseract: words, column grid, layout blocks
src/lib/iiif.ts           ContentDM IIIF: page size, crop checks
src/lib/vlm-prompt.ts     the transcription contract (system prompt, object classes)
src/lib/explode.ts        ordered blocks -> rows (filler collapse, handwriting flag)
src/detect.ts             run detectors on a page, write numbered-box overlays
detect/                   the Python half: detect.py (ONNX detectors + overlay), fetch-models.sh
migrations/pg/            Postgres schema, applied in filename order on every boot (idempotent)
src/enrich.ts, view.ts    SLICE-01/02 SQLite prototype (see History)
fixtures/                 SLICE-01 session-VLM transcriptions + enrichment fixtures
```
