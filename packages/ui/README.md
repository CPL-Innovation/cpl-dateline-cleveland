# `@cpl/ui`

Cleveland Public Library shared components, styled **only** from [`@cpl/tokens`](../tokens).
M3 ships exactly one: `HonestyBadge`.

Design intent: CPL Design System vault → `build/ui/honesty-badge-spec.md`
(authored from `build/ui/honesty-extraction.md`).

## `HonestyBadge`

The "machine-extracted · curator-reviewable" institutional contract as one reusable atom.
The promise it encodes: *be honest about provenance, and never let a machine claim editorial
authority.* Before this, CN staff had seven ad-hoc markers reinventing one visual recipe and
Dateline had a bespoke box making a different epistemic promise.

```tsx
import { HonestyBadge } from "@cpl/ui";

// field-level chip — the default
<HonestyBadge provenance={{ method: "vlm" }} review="reviewed" />
// → VLM · ✓ REVIEWED

// record-level box, full contract
<HonestyBadge
  density="block"
  provenance={{ method: "machine-extracted", from: "period advertising" }}
  disclaimer
/>
// → MACHINE-EXTRACTED FROM PERIOD ADVERTISING · CURATOR-REVIEWABLE · NOT EDITORIAL FACT
```

**Copy is composed, never passed in.** The component builds its text from `provenance` +
`review` + `disclaimer`, so the claim reads identically everywhere. That is what replaces the
hand-written strings each surface used to carry.

`review` defaults to `reviewable` — the badge never claims a human checked something unless
told so.

| prop | type | notes |
|---|---|---|
| `density` | `'inline' \| 'block'` | `inline` (default) = field chip · `block` = record box |
| `provenance` | `{ method, from? }` | **required** — a badge with no claim has no reason to exist |
| `review` | `'unreviewed' \| 'reviewed' \| 'reviewable'` | default `reviewable` |
| `edited` | `boolean` | a human overrode the machine value |
| `original` | `string` | the pre-edit machine value → tooltip on the `edited` marker |
| `disclaimer` | `boolean \| string` | `true` = "Not editorial fact" · string = custom |

Copy is **density-aware**: `block` carries the institutional phrase in full
("curator-reviewable"), `inline` the compact token ("reviewable"), because a field-level chip
shares a flex row with a label. Same claim, two registers.

## Token binding

Fill `--color-info-soft` · text `--color-info-ink` — **5.68:1 on the chip, 6.42:1 on white**.
Border `--border`, radius `--radius`, type `--cpl-font-mono`, spacing `--space-*`.
Per the v0.3 rule: a labeled element always takes the **ink**, never the base.

There is not one hardcoded color, size or radius in the source.

## Two deliberate deviations

1. **No Radix, no shadcn, no Tailwind** — zero runtime dependencies. STACK-DECISION names
   Radix + shadcn/ui as the substrate, but this component is a static labeled `<span>` with a
   native `title`: Radix has no badge primitive to wrap, and shadcn's delivery is Tailwind
   classes. Flagged to `_FROM-BUILD.md` — the substrate decision likely wants scoping to
   *components that need behavior*.
2. **Inline style objects, not CSS classes.** The first consumer (CN staff) is inline
   CSS-in-JS and loads **no stylesheet at all**, so a class-based build would render unstyled
   there. Styles are built from the tokens JS mirror, matching how `STAFF_TOKENS` already works.

## `preview/` — the component gallery

`preview/index.html` renders the full state matrix: both densities × all three `review` states ×
the `edited` / `original` / `disclaimer` modifiers, plus every `provenance.method`, the
source-aware `provenance.from` examples, and the badge on all four surface tokens.

It is **package-fed**, but not the way [`@cpl/tokens`'s preview](../tokens/preview) is. That one
re-reads the package in the browser on every load; `@cpl/ui` can't, because the real component
imports `react/jsx-runtime` and React 18 ships no browser ESM build — a runtime import would need
a bundler (a dependency this repo doesn't take) or a CDN React (which breaks it offline). So this
gallery is generated: `preview/build.mjs` imports the **real** `HonestyBadge` from `../dist` and
renders it through the real `react-dom/server`. No mock, no hand-copied swatch — if the component
is wrong, the gallery is wrong. Generation is wired into `npm run build`, so `dist/` and the
gallery regenerate together and can't disagree.

Because it generates in Node, it **asserts** rather than illustrates. Every build it renders all
24 prop combinations, checks every emitted color against `@cpl/tokens`, measures info-ink against
its own fill and all four surface tokens, and **exits non-zero** if a non-token color appears or
anything drops below AA. It is a build gate, not just a page.

```bash
npm run preview --workspace @cpl/ui   # → http://localhost:4322/ui/preview/
```

It serves `packages/` (not `packages/ui/`) so the gallery can link the real
`../../tokens/dist/tokens.css` for its own page chrome.

## Scripts

```bash
npm run build --workspace @cpl/ui       # tsc → dist/
npm test      --workspace @cpl/ui       # build + typecheck
```

The one package here with a real `tsc` emit — JSX has to be compiled, and the consumers are
apps, not Node scripts. `src/` is a single file, so the emitted JS has no relative imports and
needs no extension rewriting.

**Bridged by `npm link`, not a registry.** With two packages now, linking one **unlinks the
other** — always link them together:

```bash
npm link @cpl/tokens @cpl/ui
```
