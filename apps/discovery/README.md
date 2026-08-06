# Dateline Cleveland — patron-discovery SPA

The converged patron-discovery prototype, implemented as a real front-end.
Ported from the Claude Design project **Dateline Cleveland — Prototype.dc.html**
(the `.dc.html` DCLogic prototype) and pinned to the vault-side
`build/patron-discovery/discovery-ux-spec.md`.

Two live surfaces in one SPA, both routing into a shared page-reader detail:

- **This Week, Then** — the cultural calendar (browse-by-week timeline scrubber,
  event listings grouped Music / Film / Theater / Sport & More, event detail).
- **The Index** — faceted browse (Topic / Name / Type / Pictures & Ads),
  mixed text+image grid that flips to a visual wall, object detail.

## Routes

- **`/`** — patron discovery (the two surfaces above). Internal view switching is
  state-based, not URL-based.
- **`/staff`** — the **Editorial Workbench**: the staff-facing enrichment-pipeline
  interface (Stage-5 review workbench — Run & progress, Review, Shape review, plus
  stubbed stages). Vendored verbatim from the Claude Design sketch to
  `public/staff.html` and hosted in a full-viewport frame (it's a self-contained
  concept sketch with its own styles/scripts). The header/footer "STAFF ·
  WORKBENCH" links route here; the workbench's "← Patron prototype" link returns
  to `/`. A tiny path router lives in `src/lib/router.ts`.

  > Deep-linking to `/staff` in a production **static** build needs an SPA
  > fallback rewrite (serve `index.html` for unknown paths). The Vite dev server
  > does this automatically.

  The page-image surface follows the **Preview.app** model: one toolbar holding
  every page-image tool (thumbnail-rail toggle, zoom, region correction), a
  collapsible thumbnail rail, and no chrome on the image itself. Zoom is
  ⌘+wheel (anchored on the cursor) and ⌘+middle-drag to pan. Curators correct
  region boxes here — hover for the object's text, double-click to move/resize,
  draw one from scratch for objects the machine couldn't place; Enter saves, Esc
  cancels. Edits `POST /api/region` and are stamped `source:'human'`.

Design system: the CPL brand tokens (`src/theme.css`, ported from the design
system's `colors_and_type.css`) — white canvas, brand blue `#0057B7`, marigold
`#F1C400` accent, flat 0px-radius civic discipline, Spectral / Work Sans /
JetBrains Mono. Desktop-only (~1360px), matching the design's scope.

## MOCK ↔ REAL DATA toggle

The header toggle switches the whole SPA between two datasets:

- **MOCK** — the prototype's hand-authored mock (`src/data/mock.ts`): one
  populated calendar week (Jul 23–29 1970) and 12 index objects (1924–1970),
  with plausible-but-fabricated facet counts. This is the concept demo exactly
  as designed.
- **REAL DATA** — the actual SLICE-01 pipeline output (`src/data/realAdapter.ts`
  over `src/data/real.generated.json`): the 143 publication-content objects the
  VLM transcribed and typed from Brooklyn News, Feb 1 1924 (pages 1–4).
  - Type and Pictures & Ads facets are **real** (derived from `object_class`).
  - Topic and Name facets are shown but **empty**, with a note — that enrichment
    is beyond SLICE-01.
  - The calendar shows an honest "no events extracted — yet" state, because
    SLICE-01 never ran event extraction.

The real dataset is exported from `apps/pipeline/data/slice01.sqlite` by
`scripts/export-real-data.mjs` (runs automatically before `dev`/`build`).
`real.generated.json` is committed so the toggle works from a clean clone even
though the SQLite store is gitignored.

## Run

Install once at the **monorepo root** (`npm install` — this is an npm workspace).
Then, from the root:

```bash
npm run dev          # export real data + start Vite dev server (localhost:5180)
npm run build        # export real data + type-check + production build → dist/
npm run export-real  # just regenerate real.generated.json from apps/pipeline's SQLite
```

(Each of these delegates to `@dateline/discovery`; you can also `cd apps/discovery`
and run them directly.)

## Search

The header box searches the loaded index: title, AI summary, subject tags, type,
dateline and the **full transcribed text**. All terms must match; `"quoted
phrases"` are honoured. Results lead with keyword-in-context from the printed
page plus a "matched in" line, because for a newspaper index that context is the
answer — it's what tells a reader whether *this* Novak is their Novak.

It is a **literal** match, and the UI says so (`MATCHES THE TRANSCRIBED TEXT, NOT
ITS MEANING`). The `embedding vector(1536)` column exists in the store but nothing
populates it yet, so promising semantic search would be a claim the pipeline can't
back. Matching runs client-side over the already-loaded dataset — instant at pilot
size; when the index outgrows one payload this becomes a Postgres query and only
the internals change. See `src/lib/search.ts`.

## Patron → workbench deep link

An object's detail carries **OPEN IN WORKBENCH ↗**, opening
`staff.html?api=1&record=…&page=…&object=co-N` — the workbench selects and scrolls
to that exact object. Absent in MOCK mode, where items have no real page behind
them, so the affordance is missing rather than present-and-dead
(`workbenchHref()` in `src/lib/router.ts`).

## Deferred (CTA/stub exists, not built) — per discovery-ux-spec §10

- IIIF deep-zoom **page reader** (the "OPEN IN PAGE READER" button opens the
  full-res ContentDM IIIF image; an in-app deep-zoom reader is still deferred).
- **Semantic search** — the embedding column is schema-ready but unpopulated;
  search is literal until an embedding provider is wired.
- **Front Pages / Places / About** tabs are stubbed.
- Real scan crops (all clipping frames are keyline placeholders).
- Motion spec; mobile/responsive reflow.
