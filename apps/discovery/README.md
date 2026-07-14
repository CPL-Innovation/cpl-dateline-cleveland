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

## Deferred (CTA/stub exists, not built) — per discovery-ux-spec §10

- IIIF deep-zoom **page reader** (the "OPEN IN PAGE READER" button is a stub).
- **Search** input is non-functional; **Front Pages / Places / About** tabs and
  the **Staff Workbench** link are stubbed.
- Real scan crops (all clipping frames are keyline placeholders).
- Motion spec; mobile/responsive reflow.
