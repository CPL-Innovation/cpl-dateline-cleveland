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
│  │  ├─ src/            #   ingest · enrich · view · probe · lib (vlmExtract, enrichAdapter, explode, db, …)
│  │  ├─ migrations/     #   001_init.sql (content_objects) + 002_enrichment.sql (topics/entities/events)
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

## Status & scope

- **Pilot corpus = Brooklyn News**, treated as **public domain**. This is a deliberate pilot
  fiction: the wider collection is ~82% in-copyright, and a **hard rights gate** must be
  resolved before any real production release (public full-text + AI-derived output). See
  `build/BUILD-SPEC.md`. A public commit of this repo *is* a public release — fine today
  because everything committed is PD.
- **Prototype data layer.** SQLite / static JSON by design (SLICE-01: "don't stand up Postgres
  yet"). Production per the specs is Postgres + pgvector — not built here.
- **Design intent** lives vault-side under `build/` (read-only; changes proposed back via
  `build/_FROM-BUILD.md`). Implementation detail lives in this code.

Deferred surfaces (CTA/stub only): IIIF deep-zoom page reader, working search,
Front Pages / Places / About tabs, real scan crops, semantic-search embeddings,
cross-issue entity dedup, the staff workbench wired to live run stats.

## License

See [LICENSE](LICENSE).
