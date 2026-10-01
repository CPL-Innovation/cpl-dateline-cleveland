# Dateline Cleveland

Print-native archive **enrichment + discovery** for the Cleveland Public Library's
historic newspaper collection — applied first to the *Brooklyn News* (clean public-domain
pilot corpus). An npm-workspaces monorepo with two surfaces over one shared contract:

| Workspace | What it is |
|---|---|
| [`apps/pipeline`](apps/pipeline) — `@dateline/pipeline` | The ingestion service. Box-first ingestion (**SLICE-14**): `detect boxes → group → curator review → transcribe each group from full-res crops`, then `tiered Stage-4 enrichment → topics · names · events · advertorial flag` (**SLICE-02**), into Postgres. Node with TypeScript type-stripping, no build step. |
| [`apps/discovery`](apps/discovery) — `@dateline/discovery` | The patron **discovery SPA** (*This Week, Then* cultural calendar · *The Index* faceted browse · *The Stacks* issue reader) **and** the staff **Editorial Workbench** at `/staff`. React + Vite. Implemented from the Claude Design prototypes. |

The seam between them: `apps/discovery`'s **REAL DATA** toggle reads the pipeline's SQLite
output (`apps/pipeline/data/slice01.sqlite`, exported to JSON at build time). Pipeline
produces → discovery consumes.

> `packages/*` is reserved in the workspace glob for genuinely shared code. There's none yet:
> a shared TypeScript package would force a build step on the pipeline (Node's type-stripping
> won't strip `.ts` under `node_modules`, where workspaces symlink), which is against its
> no-build design. The SQL migration + the exported JSON are the contract for now.

## Quick start

Requires **Node ≥ 22.5**. One install at the root covers both workspaces.

```bash
npm install          # installs all workspaces (deps hoist to the root)

npm run server       # apps/pipeline: the ingestion service on :5170 (Postgres; see apps/pipeline/README.md)
npm run dev          # apps/discovery: dev server at http://localhost:5180  (+ /staff)
npm run build        # apps/discovery: production static build → apps/discovery/dist
npm test             # apps/pipeline: node --test (e.g. edition citation validation)
```

Pages are ingested **box-first** from the staff workbench (`/staff`): a detector draws boxes, a
curator corrects and groups them, and each group is transcribed from full-resolution crops. The
SPA's **REAL DATA** toggle reads the committed SLICE-01 export.

Other root scripts: `npm run view`, `npm run enrich` (the SLICE-01 SQLite prototype),
`npm run export-real`, `npm run preview` (discovery). Each delegates to the right workspace;
you can also `cd` into a workspace and run its own scripts.

## Layout

```
cpl-dateline-cleveland/
├─ apps/
│  ├─ pipeline/          # @dateline/pipeline — SLICE-01 enrichment pipeline
│  │  ├─ src/            #   ingest · enrich · view · probe · server · lib (vlmExtract, enrichAdapter,
│  │  │                 #     ocrAnchor, title, reextract, resummarize, suggestTitle, explode, db, pg, …)
│  │  ├─ migrations/     #   001_init.sql + 002_enrichment.sql (SQLite prototype)
│  │  │                 #   pg/001..011  (Postgres: schema · text overlay · review · display title ·
│  │  │                 #                 publish gate · re-extraction · authorship · box-first ·
│  │  │                 #                 classification · ingest mode · edition cache) — applied in filename order
│  │  ├─ fixtures/       #   session-model transcriptions (VLM) + enrichment/ (Stage-4) replayed by `fixture`
│  │  ├─ inbox/          #   the 4 Brooklyn News page images (gitignored; PD)
│  │  ├─ data/           #   slice01.sqlite (gitignored, prototype store)
│  │  └─ .env.example    #   VLM provider keys (copy → .env for a live run)
│  └─ discovery/         # @dateline/discovery — patron SPA + staff /staff workbench
│     ├─ src/            #   App/router, components, data (mock + real adapter)
│     ├─ public/         #   staff.html (vendored Editorial Workbench, served at /staff)
│     └─ scripts/        #   export-real-data.mjs (pipeline SQLite → real.generated.json)
├─ tsconfig.base.json    # shared TS strictness (discovery extends it)
└─ package.json          # workspace root + orchestration scripts
```

## The workbench writes

`/staff` began as a read-only review surface. It is now the curation tool, and every write
goes through `apps/pipeline`'s ingestion service (`npm run server`, port 5170):

| What a curator does | Route | Where it lands |
|---|---|---|
| Correct a region | `POST /api/region` | `region_bbox`, stamped `source:'human'` — **in place** |
| Correct a transcription | `POST /api/object-text` | `text_human` **overlay**; `text` untouched |
| Re-extract from the scan | `POST /api/object-text/reextract` → `/api/object-raw-text` | **replaces `text`** (see below) |
| Set a display title | `POST /api/object-title` (+ `/suggest`) | `display_title` overlay |
| Regenerate a summary | `POST /api/object-summary` (+ `/suggest`) | `summary`, in place (enrichment is already an overlay) |
| Status + review note | `POST /api/object-review` | `curation_status`, `review_note` |
| Publish / withdraw | `POST /api/object-review` `{published}` | `is_published` |
| Publish a page (batch) | `POST /api/objects-publish` `{objectIds, published}` | `is_published` for many, in one statement |
| Delete | `DELETE /api/object` | the row, plus its cascades |

Three of these carry consequences worth knowing before you use them:

- **Nothing reaches patrons unpublished.** `is_published` defaults to **false with no backfill**,
  and `/api/discovery` filters objects, facets *and* events on it. A freshly ingested corpus shows
  an empty patron index until a curator publishes — by design.
- **Re-extraction overwrites the machine's read.** It crops the object's box out of the archival
  scan and re-transcribes it with Sonnet; committing replaces `content_objects.text` and the
  superseded read is **not kept**. The UI asks twice. `raw immutable` now means *raw is not edited
  by humans* — re-extraction is a machine read replacing a machine read.
- **Delete does not survive re-ingestion.** The row and its cascades go, but nothing stops the
  pipeline re-creating the object from the page image on a later run.

Text edits do **not** re-embed. `content_objects.embedding` still reflects the text as ingested,
so semantic search (schema-ready, unpopulated) would match a superseded read.

## The stacks: an issue as a book

`THE INDEX` breaks the paper into clippings. `THE STACKS` puts it back together — one shelf of
bound issues, grouped by serial, opening into a page-turning reader.

- **What is shelved.** Any issue the pipeline has **read at least one page of**, served by
  `GET /api/shelf` (`apps/pipeline/src/lib/shelf.ts`). Issues are grouped by ContentDM
  *pointer*, not by `issue_id` — two ingest runs can slug the same compound issue differently,
  and grouping by the id would shelve one paper twice, each missing the other's pages.
- **Whole books, gaps included.** The shelf resolves each issue's full page structure from
  `dmGetCompoundObjectInfo`, so a half-ingested issue still has all four leaves. Pages the
  pipeline hasn't read are turnable as scans and say so. Rights gate: page images are attached
  only for issues whose `rights_status` is `open`.
- **Three ways to open a page, one place in the book.** The reader bar's switch names them for
  what they are. **Transcribed text** (`READ`) sets the page's **published** objects in printed
  order (the printed headline is lifted out of the body so the page doesn't print it twice), in
  1–4 columns that flow down and across like the paper, grouped by type or not, in full or as
  summaries, filtered by type. **Original scan** (`SCAN`) is a full-window stage: the site chrome
  steps aside, a page rail stands in the dead margin beside a portrait leaf, and the scan fills
  the rest. **Your edition** is below. Arrow keys turn pages; `V` flips text ↔ scan; the bar's
  `PAGE n OF N ▾` opens every leaf as thumbnails.
- **Text and scan invite comparison.** READ says it is an AI transcription and offers the scan;
  every located item carries **See it on the page**, which turns to the scan and flies the view
  onto the item's box, lit.
- **Linkable.** `?issue=<key>` opens a shelved issue (the address bar tracks the open book;
  `&view=edition&rc=…&picks=…` rebuilds a shared edition).
- **The scan viewer.** Zoom is transform-based on a *virtual* 1600px page, anchored on the
  cursor (⌘/ctrl-scroll, double-click, `+`/`-`/`0`), with panning clamped to the page's own
  edges. Scale and offset are one piece of state advanced functionally — held apart, two zooms
  in one React batch desynchronise and the page slides without growing. As you zoom in it climbs
  a ladder of IIIF derivatives (1600 → 2600 → 4000 → 5332px), preloading each before it swaps,
  so sharpening never blanks the page and the geometry never moves.
- **Regions, on the leaf.** `REGIONS` (or `B`) draws every **published** object the pipeline
  located on the page, coloured by the index's functional type colours; clicking one docks the
  extracted transcription beside the leaf, with the provenance of the *box itself* — drawn by a
  curator, anchored to the OCR word grid, or estimated by the model — and a warning when the box
  is one column of a story that runs on. `READ IT SET →` leaves the room for that item in the
  reading column. An object with no stored region is not drawn: a box in the wrong place is
  worse than no box. `/api/discovery` carries `region` (normalized rects + source) for this.
- **Shape and content come from different contracts.** `/api/shelf` supplies spines and page
  structure; page text is the same `/api/discovery` payload `THE INDEX` reads — so the reader
  can never show something the index wouldn't, and the publication gate holds in one place.
- **Fallbacks.** With the service offline the shelf is rebuilt from the committed export (pages
  with published objects only, and it says so). In MOCK mode the shelf is three hand-authored
  issues (`src/data/mockShelf.ts`) with placeholder scans.

### The reading-room assistant

A chat about **the issue you are reading**, presented as the paper itself ("Ask The Brooklyn
News") — `POST /api/chat` (SSE over POST), Sonnet, `apps/pipeline/src/lib/chat.ts`. On a wide
window it opens **docked beside the page** by default (READ and SCAN); a patron's close is
remembered, and it folds into a labelled call button. One conversation spans both registers.

- **The corpus is the constraint, not the prompt.** The server assembles the context from
  `is_published` rows for that one issue's pages and sends nothing else — no other issue, no
  unpublished read, no retrieval, no web. The model is also told which pages are read-but-withheld,
  so "what's on page 3?" is answerable as a fact about the review queue rather than a shrug.
- **Citations are structural.** The model marks a claim `[[co-269]]`; the client resolves that id
  against the index and renders a chip that turns the reader to the page and marks the item — in
  SCAN it flies the scan to the item's box and lights it instead. An id
  the model invents resolves to nothing and is dropped — a bad citation degrades to no citation,
  never to a false one.
- **Outside knowledge is labelled, not banned.** At most one sentence of general background,
  prefixed `Beyond this issue:` so a patron can see it did not come from the paper.
- **Guards.** 20 questions per conversation (server-enforced, `CHAT_MAX_TURNS`), a corpus cap
  (`CHAT_MAX_CORPUS_CHARS`), and the issue corpus travels as a cached system block — placed
  **first**, before the instructions, so the chat and Your Edition share one cache entry
  (`streamMessages`). The assistant is unavailable in MOCK mode and on issues with nothing
  published, and says which it is rather than offering a dead box.
- **`max_tokens` is generous on purpose.** Sonnet thinks before it answers, and thinking counts
  against the same ceiling; at ~1K a hard request can spend it all thinking and return no text.
  Both features allow 16K and hold length in the prompt.

### Your Edition (SLICE-15)

The reader's third register: a three-question interview builds a **Reader Card** (role, 1–3
interests, how you like it served — no model call; kept in `localStorage`), then four rounds of
prompt cards each stream one section — headline, one paragraph in the reader's register, and
**real newsprint crops** of the cited items — into a zine that can't be edited, only made.
`apps/pipeline/src/lib/edition.ts`, `apps/discovery/src/components/YourEdition.tsx`.

- **Dealing is free and deterministic.** `POST /api/edition/prompts` picks three cards per round
  from a code-side prompt library plus per-issue topic cards, filtered by the Reader Card and by
  what the issue's published index actually holds (`GET /api/edition/index`). A card is never
  dealt without material behind it, or once that material is fully cited.
- **Writing uses the chat's corpus and rails.** `POST /api/edition/section` (SSE) asks for JSON;
  citation ids are checked against the ids actually in the corpus (ids written into the prose are
  lifted out, invented ones dropped). A section left with no citation says so and doesn't count.
  Crops are pixel-form IIIF regions of each item's largest box; unlocated items get a chip.
- **Costs are capped server-side.** Four sections; at most **6 model calls per edition**; the
  last round allows the patron's own question, with 2 retries. Card sections are cached in
  `edition_sections` (pointer · card · register · role) and re-checked against what is published
  before being served; free text is never cached. Counters are client-reported, like the chat's.
- **Share and print.** Copy link carries picks, not prose (own questions are dropped, and the
  link says so); Print is a single-column stylesheet with crops and footnoted citations.

## Status & scope

- **Pilot corpus = Brooklyn News**, treated as **public domain**. This is a deliberate pilot
  fiction: the wider collection is ~82% in-copyright, and a **hard rights gate** must be
  resolved before any real production release (public full-text + AI-derived output). See
  `build/BUILD-SPEC.md`. A public commit of this repo *is* a public release — fine today
  because everything committed is PD.
- **Two data layers.** SLICE-01's SQLite/static-JSON prototype backs the committed exports (its
  whole-page ingest is retired); the live per-page service (SLICE-08 onward) runs on **Postgres + pgvector** and is what `/staff`
  reads and writes. `migrations/pg/` is applied in filename order on every boot — each file is
  idempotent, there is no applied-migrations ledger.
- **Design intent** lives vault-side under `build/` (read-only; changes proposed back via
  `build/_FROM-BUILD.md`). Implementation detail lives in this code.

Deferred surfaces (CTA/stub only): **tiled** deep-zoom (the reader in `THE STACKS` zooms and
pans whole IIIF-served derivatives rather than tiles — there is no tiling server of our own, and
`FULL RES ↗` hands off to ContentDM), **semantic** search (the embedding column is
schema-ready but unpopulated — patron search is a literal text match and says so),
Front Pages / Places / About tabs, cross-issue entity dedup.

> **Working with ContentDM's IIIF:** it implements the Image API only partially, and fails
> *silently*. `pct:` regions and `!w,h` sizes are ignored — you get HTTP 200 and a valid JPEG
> of the **whole page**. Pixel regions (`x,y,w,h`) and `w,` / `,h` sizes are exact. Read
> `info.json` for the page dimensions and verify the returned image's size; see
> `apps/pipeline/src/lib/reextract.ts`.

## License

See [LICENSE](LICENSE).
