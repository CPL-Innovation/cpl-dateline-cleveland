# Dateline Cleveland

Print-native archive **enrichment + discovery** for the Cleveland Public Library's
historic newspaper collection — applied first to the *Brooklyn News* (clean public-domain
pilot corpus). An npm-workspaces monorepo with two surfaces over one shared contract:

| Workspace | What it is |
|---|---|
| [`apps/pipeline`](apps/pipeline) — `@dateline/pipeline` | The enrichment pipeline. `image → VLM → structured content-objects → SQLite → viewable` (**SLICE-01**), then `content-objects → tiered Stage-4 enrichment → topics · names · events · advertorial flag` (**SLICE-02**). Zero-dependency Node (built-in `node:sqlite` + TypeScript type-stripping, no build step). |
| [`apps/discovery`](apps/discovery) — `@dateline/discovery` | The patron **discovery SPA** (*This Week, Then* cultural calendar + *The Index* faceted browse) **and** the staff **Editorial Workbench** at `/staff`. React + Vite. Implemented from the Claude Design prototypes. |

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

npm run pipeline     # apps/pipeline: ingest + view (image → VLM → SQLite → out/view.html)
npm run enrich       # apps/pipeline: SLICE-02 Stage-4 enrichment overlay (topics · names · events)
npm run dev          # apps/discovery: dev server at http://localhost:5180  (+ /staff)
npm run build        # apps/discovery: production static build → apps/discovery/dist
```

A full pilot run is `npm run pipeline && npm run enrich && npm run dev`, then flip the
SPA's **REAL DATA** toggle. `npm run enrich` defaults to the `fixture` provider (the session
model's Stage-4 pass, no API key needed); set `ENRICH_PROVIDER=anthropic|gemini|openai`
(+ the matching key in `apps/pipeline/.env`) for a live enrichment pass.

Other root scripts: `npm run ingest`, `npm run view`, `npm run probe` (pipeline),
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
│  │  │                 #   pg/001..006  (Postgres: schema · text overlay · review · display title ·
│  │  │                 #                 publish gate · re-extraction) — applied in filename order
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

## Status & scope

- **Pilot corpus = Brooklyn News**, treated as **public domain**. This is a deliberate pilot
  fiction: the wider collection is ~82% in-copyright, and a **hard rights gate** must be
  resolved before any real production release (public full-text + AI-derived output). See
  `build/BUILD-SPEC.md`. A public commit of this repo *is* a public release — fine today
  because everything committed is PD.
- **Two data layers.** SLICE-01's SQLite/static-JSON prototype still backs `npm run pipeline`;
  the live per-page service (SLICE-08 onward) runs on **Postgres + pgvector** and is what `/staff`
  reads and writes. `migrations/pg/` is applied in filename order on every boot — each file is
  idempotent, there is no applied-migrations ledger.
- **Design intent** lives vault-side under `build/` (read-only; changes proposed back via
  `build/_FROM-BUILD.md`). Implementation detail lives in this code.

Deferred surfaces (CTA/stub only): IIIF deep-zoom page reader (the CTA opens the object's
**ContentDM catalogue page**), **semantic** search (the embedding column is
schema-ready but unpopulated — patron search is a literal text match and says so),
Front Pages / Places / About tabs, cross-issue entity dedup.

> **Working with ContentDM's IIIF:** it implements the Image API only partially, and fails
> *silently*. `pct:` regions and `!w,h` sizes are ignored — you get HTTP 200 and a valid JPEG
> of the **whole page**. Pixel regions (`x,y,w,h`) and `w,` / `,h` sizes are exact. Read
> `info.json` for the page dimensions and verify the returned image's size; see
> `apps/pipeline/src/lib/reextract.ts`.

## License

See [LICENSE](LICENSE).
