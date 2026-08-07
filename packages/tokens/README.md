# `@cpl/tokens`

Cleveland Public Library shared design tokens — the CPL brand primitives, the semantic intent tier, and the navy-cool staff skin.

**One authored source, two shipped artifacts.** Consumption splits down the middle across the three staff repos, so a CSS-only package can't serve Dateline or Cleveland Neighborhoods, and a JS-only package can't serve Self-Guided Tour. Both, generated from the same objects, is a hard requirement — not a nicety.

| Repo | Consumes styles via | Needs |
|---|---|---|
| Dateline Cleveland | JS constants (`C.*`) in inline styles; `var(--…)` used 0× | the **JS mirror** |
| Cleveland Neighborhoods | JS object (`STAFF_TOKENS`, ~907 refs) | the **JS mirror** |
| Self-Guided Tour | CSS custom properties + utility classes | the **CSS file** |

Design intent lives in the CPL Design System vault (`build/tokens/tokens-spec.md`); this package is the implementation. **Values are lifted, not authored** — the only new value in the package is `--cpl-error #9B3030`.

---

## Install

Already wired as a workspace package in this monorepo. From another repo, install by path/tarball/registry as usual, then:

### CSS consumers (SGT)

```js
import '@cpl/tokens/css';
```

```css
.button {
  background: var(--color-primary);
  color: var(--cpl-white);
  border-radius: var(--radius);
  box-shadow: var(--elevation);
}
```

Opt a subtree into the staff skin explicitly:

```html
<html data-theme="staff">
```

### JS consumers (Dateline, CN)

```js
import { tokens, cssVar, semantic } from '@cpl/tokens';

tokens.cplNavy;        // "#0057B7"  — resolved, works with no stylesheet loaded
tokens.colorPrimary;   // "#0057B7"
cssVar.colorPrimary;   // "var(--color-primary)" — late-binding, follows data-theme
```

Dateline's palette object becomes a re-export instead of a second copy of the hex:

```ts
// apps/discovery/src/lib/ui.ts
import { tokens } from '@cpl/tokens';

export const C = {
  navy: tokens.cplNavy,
  navyDeep: tokens.cplNavyDeep,
  body: tokens.cplSlate800,
  // …
} as const;
```

---

## The three exports of the JS mirror

| Export | Value shape | Use when |
|---|---|---|
| `tokens` | `"#0057B7"` — fully resolved | styles written in JS, stylesheet not guaranteed. **Static:** does not follow a runtime theme switch. |
| `cssVar` | `"var(--cpl-navy)"` | the stylesheet *is* loaded and you want live `data-theme` switching |
| `cssVarName` | `"--cpl-navy"` | `element.style.setProperty(name, value)` and other bare-name contexts |

Also exported: `primitives`, `semantic`, `staffTheme`, `themes`, and a default export equal to `tokens`. Types ship as literal types, so `tokens.cplNavy` is typed `"#0057B7"`, not `string`.

---

## Two tiers — consume the semantic one

```
--cpl-navy  #0057B7          ← primitive: a fact about the brand
   ↑
--color-primary              ← semantic slot: an intent
   ↑
your component
```

Periphery code and future `@cpl/ui` components read **semantic slots**, never raw `--cpl-*`. That is what makes a re-skin one edit instead of a find-and-replace. The primitives are there so a migrating app can point at a known hex during the transition.

---

## Layout

```
packages/tokens/
├── src/
│   ├── types.ts        authoring types + flatten()
│   ├── primitives.ts   the --cpl-* base + scales (lifted verbatim)
│   ├── semantic.ts     intent slots
│   ├── themes/staff.ts the navy-cool staff skin
│   ├── index.ts        the assembled layer
│   └── build.ts        codegen — the only thing that writes dist/
├── scripts/check.ts    the M1 acceptance gate, executable
└── dist/               GENERATED. Do not edit.
    ├── tokens.css      :root primitives + semantic tier + [data-theme="staff"]
    ├── tokens.js       the JS mirror
    └── tokens.d.ts     literal types
```

`dist/` is committed — consumers install this from the workspace, and there is no publish step to generate it for them.

## Scripts

```bash
npm run build --workspace @cpl/tokens   # regenerate dist/ from src/
npm run check --workspace @cpl/tokens   # assert the acceptance criteria (M1 + the v0.2/v0.3 slots)
npm test      --workspace @cpl/tokens   # build, then check
npm run preview --workspace @cpl/tokens # serve preview/ → http://localhost:4321/preview/
```

Zero build dependencies — Node's own type-stripping runs the TypeScript source directly, matching `apps/pipeline`'s idiom. Requires Node ≥ 22.5.

**Never edit `dist/`.** Edit `src/` and rebuild; `check` fails the moment the two artifacts disagree.

## `preview/` — the QA surface

`preview/index.html` renders every token as a live swatch, with WCAG contrast measured in the
browser. It is **package-fed**: it `<link>`s the real `dist/tokens.css` and imports the real
`dist/tokens.js`, then reads the values back out. It declares no token values of its own, so it
**cannot drift** — if the package is wrong, the preview renders it wrong, and its CSS↔JS parity
banner turns red. Serve it (`npm run preview`); ES modules need an `http://` origin, though the
CSS gallery still works over `file://`.

Its sibling for components is [`packages/ui/preview/`](../ui/preview) — same idea, applied to the
real `HonestyBadge`.

It supersedes the vault's `build/token-preview/kitchen-sink.html`, which was spec-transcribed
(hand-copied values) and is kept only as the record of the v0.2 decisions. Ink picks happen here
now — the candidate tables mark whichever value `dist/` actually ships.

## Two deliberate deviations from the spec text

1. **The radius scale is namespaced `--cpl-radius-*`.** The spec writes the primitive scale bare (`--radius-lg: 10px`, §3) while the semantic slot of the same name is `8px` (§4). In one `:root` the later declaration silently wins and the scale step is destroyed. Namespacing the primitives keeps both. Flagged to the vault's `_FROM-BUILD.md`.
2. **Spacing emits px**, with the rem equivalent as a comment — the spec's primary listing is px (`--space-1 4px`) and rem is given parenthetically.

## Scope

In: staff surfaces. Out: patron themes (CN patron, SGT hifi), the `--hf-*` scale, Navigo / Replica LL display fonts (license-encumbered), and SGT's legacy `--cpl-*` aliases (`--cpl-gold`, `--cpl-stone`, `--cpl-lake`, `--cpl-sage`, `--cpl-brick`, `--cpl-plum`, `--cpl-terracotta`, `--cpl-gold-deep`) — an app still referencing one aliases it locally, not here.
