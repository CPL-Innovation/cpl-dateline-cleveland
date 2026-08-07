// @cpl/ui — component gallery generator.
//
// Sibling to packages/tokens/preview/, with one deliberate difference in shape.
//
// The tokens preview is PACKAGE-FED AT RUNTIME: the browser links the real dist/tokens.css
// and imports the real dist/tokens.js, so it re-reads the package on every page load. That
// works because @cpl/tokens is dependency-free plain ESM.
//
// @cpl/ui cannot do that: the real component imports `react/jsx-runtime`, and React 18 ships
// no browser ESM build — a runtime import would need a bundler (a build dependency this repo
// doesn't take) or a CDN React (which breaks the gallery offline). So this gallery is
// PACKAGE-FED AT GENERATE TIME: it runs the REAL HonestyBadge from ../dist through the real
// react-dom/server and writes the resulting markup. Same guarantee — no mock, no hand-copied
// values, and if the component is wrong the gallery shows it wrong — reached a different way.
//
// The one cost is staleness, so this is wired into `npm run build`: dist and the gallery are
// regenerated together and cannot disagree.
//
// Run: npm run build --workspace @cpl/ui   (or: node preview/build.mjs)

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { HonestyBadge } from "../dist/index.js";
import { tokens } from "@cpl/tokens";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(readFileSync(resolve(HERE, "..", "package.json"), "utf8"));

// ── contrast, computed here rather than asserted ──────────────────────────────
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
};
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const r2 = (n) => n.toFixed(2) + ":1";
const AA = 4.5;

const render = (props) => renderToStaticMarkup(h(HonestyBadge, props));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── the state matrix ──────────────────────────────────────────────────────────

const REVIEWS = ["unreviewed", "reviewable", "reviewed"];

/** densities × review states — the core grid. */
const grid = ["inline", "block"].map((density) => ({
  density,
  cells: REVIEWS.map((review) => ({
    review,
    props: { density, provenance: { method: "vlm" }, review },
  })),
}));

/** modifiers, shown at both densities so the difference is visible. */
const MODIFIERS = [
  { label: "edited", note: "a curator overrode the machine value",
    props: { provenance: { method: "vlm" }, review: "reviewed", edited: true } },
  { label: "edited + original", note: "hover the `edited` token — the machine value is the tooltip",
    props: { provenance: { method: "vlm" }, review: "reviewed", edited: true, original: "single family" } },
  { label: "disclaimer (default)", note: "`disclaimer` → “Not editorial fact”",
    props: { provenance: { method: "machine-extracted" }, disclaimer: true } },
  { label: "disclaimer (custom)", note: "a string overrides the default copy",
    props: { provenance: { method: "ai-transcribed" }, review: "unreviewed", disclaimer: "Not editorial fact · pilot material" } },
  { label: "everything at once", note: "the full contract in one badge",
    props: { provenance: { method: "machine-extracted", from: "articles" }, review: "reviewed", edited: true, original: "1924-02-01", disclaimer: true } },
];

/** provenance.method — the vocabulary. */
const METHODS = ["ai", "vlm", "machine-extracted", "ai-transcribed"];

/** provenance.from — source-aware copy. Block-only by design. */
const SOURCES = ["articles", "period advertising", "listings", "articles & advertising"];

/** the badge has to hold up on every surface a staff app puts it on. */
const SURFACES = [
  ["--surface", tokens.surface],
  ["--surface-subtle", tokens.surfaceSubtle],
  ["--surface-sunken", tokens.surfaceSunken],
  ["--surface-raised", tokens.surfaceRaised],
];

// ── QA: the gallery fails the build if the component emits a non-token color ──
const KNOWN = new Set(Object.values(tokens).map((v) => String(v).toLowerCase()));
const everyProps = [
  ...grid.flatMap((g) => g.cells.map((c) => c.props)),
  ...MODIFIERS.flatMap((m) => [{ ...m.props, density: "inline" }, { ...m.props, density: "block" }]),
  ...METHODS.map((method) => ({ provenance: { method } })),
  ...SOURCES.map((from) => ({ density: "block", provenance: { method: "machine-extracted", from } })),
];
const strays = [];
for (const props of everyProps) {
  const html = render(props);
  for (const m of html.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)) {
    if (!KNOWN.has(m[0].toLowerCase())) strays.push({ props: JSON.stringify(props), color: m[0] });
  }
}

const chipContrast = ratio(tokens.colorInfoInk, tokens.colorInfoSoft);
const whiteContrast = ratio(tokens.colorInfoInk, tokens.surface);
const aaFails = [
  ["info-ink on info-soft (the chip)", chipContrast],
  ["info-ink on --surface", whiteContrast],
  ...SURFACES.map(([n, hex]) => [`info-ink on ${n}`, ratio(tokens.colorInfoInk, hex)]),
].filter(([, r]) => r < AA);

// ── page ──────────────────────────────────────────────────────────────────────

const cell = (label, html, note) =>
  `<div class="cell"><div class="cell-label">${esc(label)}</div><div class="cell-stage">${html}</div>` +
  (note ? `<div class="cell-note">${note}</div>` : "") + `</div>`;

const page = `<!DOCTYPE html>
<!--
  GENERATED FILE — do not edit. Written by preview/build.mjs, which renders the REAL
  HonestyBadge from ../dist through react-dom/server. Regenerate:
      npm run build --workspace @cpl/ui
-->
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>@cpl/ui — component gallery</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600&family=Work+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

<!-- the page chrome styles itself from the real token CSS, same as tokens/preview -->
<link rel="stylesheet" href="../../tokens/dist/tokens.css" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--surface-sunken); color: var(--text-1);
         font-family: var(--cpl-font-sans); font-size: 15px; line-height: var(--lh-normal);
         -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: var(--space-7) var(--space-5) var(--space-16); }
  header.page h1 { font-family: var(--cpl-font-serif); font-weight: var(--fw-medium); font-size: var(--fs-2xl);
                   letter-spacing: var(--ls-tight); margin: 0 0 6px; }
  header.page p { color: var(--text-2); max-width: 68ch; margin: 0 0 6px; }
  header.page .meta { font-family: var(--cpl-font-mono); font-size: var(--fs-xs); color: var(--text-3); }

  section { background: var(--surface); border: 1px solid var(--border-hair); border-radius: var(--radius-lg);
            padding: var(--space-5); margin: var(--space-4) 0; box-shadow: var(--shadow-1); }
  section > h2 { font-family: var(--cpl-font-serif); font-weight: var(--fw-medium); font-size: var(--fs-lg); margin: 0 0 4px; }
  section > .sub { color: var(--text-2); font-size: 13.5px; margin: 0 0 var(--space-4); }
  h3.grouplabel { font-family: var(--cpl-font-mono); font-size: 11px; letter-spacing: var(--ls-wide);
                  text-transform: uppercase; color: var(--text-3); margin: var(--space-5) 0 var(--space-2); }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-3); }
  .cell { border: 1px solid var(--border-hair); border-radius: var(--radius); overflow: hidden; }
  .cell-label { font-family: var(--cpl-font-mono); font-size: 10.5px; letter-spacing: var(--ls-wide);
                text-transform: uppercase; color: var(--text-3); padding: var(--space-2) var(--space-3);
                border-bottom: 1px solid var(--border-hair); background: var(--surface-subtle); }
  /* Scroll, never clip: an inline chip that outgrows its container is a real finding
     (see the disclaimer-at-inline-density case) and the gallery must not hide it. */
  .cell-stage { padding: var(--space-3); overflow-x: auto; }
  .cell-note { padding: 0 var(--space-3) var(--space-3); font-size: 12px; color: var(--text-2); }
  .cell-note code { font-family: var(--cpl-font-mono); font-size: 0.92em; }

  .surfacerow { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3);
                border-bottom: 1px solid var(--border-hair); }
  .surfacerow .n { font-family: var(--cpl-font-mono); font-size: 11px; color: var(--text-2); width: 160px; flex: none; }

  table.m { border-collapse: collapse; width: 100%; font-size: 13px; }
  table.m th, table.m td { text-align: left; padding: var(--space-2) var(--space-3);
                           border-bottom: 1px solid var(--border-hair); vertical-align: middle; }
  table.m th { font-family: var(--cpl-font-mono); font-size: 10.5px; letter-spacing: var(--ls-wide);
               text-transform: uppercase; color: var(--text-3); }
  .pill { display: inline-block; font-size: 11px; font-weight: var(--fw-semibold); padding: 2px 8px;
          border-radius: var(--cpl-radius-pill); font-family: var(--cpl-font-mono); }
  .pass { background: var(--color-success-soft); color: var(--color-success-ink); }
  .fail { background: var(--color-danger-soft); color: var(--color-danger); }

  #qa { border-radius: var(--radius-lg); padding: var(--space-4) var(--space-5); margin: var(--space-4) 0;
        border: 1.5px solid var(--border); background: var(--surface); }
  #qa.ok { border-color: var(--color-success-ink); background: var(--color-success-soft); }
  #qa.bad { border-color: var(--color-danger); background: var(--color-danger-soft); }
  #qa h2 { margin: 0 0 4px; font-size: var(--fs-base); font-family: var(--cpl-font-sans); font-weight: var(--fw-semibold); }
  #qa p { margin: 0; font-size: 13px; color: var(--text-2); }
  code { font-family: var(--cpl-font-mono); font-size: 0.92em; }
  small.note { color: var(--text-3); font-size: 12px; }
</style>
</head>
<body>
<div class="wrap">

  <header class="page">
    <h1>@cpl/ui — component gallery</h1>
    <p><b>Package-fed.</b> Every badge below is the <em>real</em> <code>HonestyBadge</code>, imported from the
       built <code>../dist</code> and rendered through <code>react-dom/server</code> — never a mock, never a
       hand-copied swatch. If the component is wrong, this page is wrong.</p>
    <p class="meta">${esc(PKG.name)} v${esc(PKG.version)} · generated by <code>preview/build.mjs</code> ·
       regenerate with <code>npm run build --workspace @cpl/ui</code></p>
  </header>

  <div id="qa" class="${strays.length === 0 && aaFails.length === 0 ? "ok" : "bad"}">
    <h2>Component QA</h2>
    <p>
      ${strays.length === 0
        ? `<b>No hardcoded color</b> — every color the component emitted across ${everyProps.length} prop combinations is a value from <code>@cpl/tokens</code>.`
        : `<b>${strays.length} non-token color(s) emitted:</b> ` + strays.map((s) => `${esc(s.color)} <small>(${esc(s.props)})</small>`).join(", ")}
      <br />
      ${aaFails.length === 0
        ? `<b>AA holds</b> — info-ink measures ${esc(r2(chipContrast))} on its own soft fill and ${esc(r2(whiteContrast))} on <code>--surface</code>, and clears 4.5:1 on every surface token below.`
        : `<b>AA fails:</b> ` + aaFails.map(([n, r]) => `${esc(n)} ${esc(r2(r))}`).join(", ")}
    </p>
  </div>

  <section>
    <h2>The state matrix — densities × review states</h2>
    <p class="sub">The two shells and the three claims. <code>review</code> defaults to <code>reviewable</code>:
       the badge never says a human checked something unless told so. <code>unreviewed</code> carries a touch more
       attention — still info, never warning, because it is an honest statement, not an error.</p>
    ${grid.map((g) => `
    <h3 class="grouplabel">density: ${g.density}</h3>
    <div class="grid">
      ${g.cells.map((c) => cell(`review: ${c.review}`, render(c.props))).join("\n      ")}
    </div>`).join("\n")}
  </section>

  <section>
    <h2>Modifiers</h2>
    <p class="sub"><code>edited</code>, <code>original</code>, <code>disclaimer</code> — each shown at both densities,
       because the copy register differs: <code>block</code> carries the institutional phrase in full,
       <code>inline</code> the compact token.</p>
    ${MODIFIERS.map((m) => `
    <h3 class="grouplabel">${esc(m.label)}</h3>
    <div class="grid">
      ${cell("inline", render({ ...m.props, density: "inline" }), m.note)}
      ${cell("block", render({ ...m.props, density: "block" }), m.note)}
    </div>`).join("\n")}
  </section>

  <section>
    <h2><code>provenance.method</code> — the vocabulary</h2>
    <p class="sub">What produced the value. Four methods today; the prop also accepts a bare label.</p>
    <div class="grid">
      ${METHODS.map((method) => cell(method, render({ provenance: { method } }))).join("\n      ")}
    </div>
  </section>

  <section>
    <h2><code>provenance.from</code> — source-aware honesty</h2>
    <p class="sub">Don't claim “period advertising” for an article-sourced fact. Rendered at
       <code>block</code> density, where the row has the width for it — an <code>inline</code> chip drops it
       (shown last for comparison).</p>
    <div class="grid">
      ${SOURCES.map((from) => cell(`from: ${from}`, render({ density: "block", provenance: { method: "machine-extracted", from } }))).join("\n      ")}
      ${cell("inline · from is dropped", render({ density: "inline", provenance: { method: "machine-extracted", from: "articles" } }), "the claim survives; only the source detail is held back for the row budget")}
    </div>
  </section>

  <section>
    <h2>On every surface</h2>
    <p class="sub">The soft fill has to stay legible wherever a staff app puts the badge. Ratios are measured, not asserted.</p>
    ${SURFACES.map(([name, hex]) => `
    <div class="surfacerow" style="background:${hex}">
      <span class="n">${esc(name)}<br>${esc(hex)}</span>
      ${render({ provenance: { method: "vlm" }, review: "reviewed" })}
      <span class="pill ${ratio(tokens.colorInfoInk, hex) >= AA ? "pass" : "fail"}">ink vs surface ${esc(r2(ratio(tokens.colorInfoInk, hex)))}</span>
    </div>`).join("\n")}
    <p style="margin-top:var(--space-3)"><small class="note">The badge carries its own fill, so the surface behind it
       only matters for the ring of contrast around the chip — but a badge that disappears into its background is a
       badge nobody reads.</small></p>
  </section>

  <section>
    <h2>Token binding</h2>
    <p class="sub">Read from <code>@cpl/tokens</code> at generate time — not transcribed.</p>
    <table class="m">
      <thead><tr><th>Slot</th><th>Value</th><th>Role in the badge</th></tr></thead>
      <tbody>
        <tr><td><code>--color-info-soft</code></td><td><code>${esc(tokens.colorInfoSoft)}</code></td><td>fill, both densities</td></tr>
        <tr><td><code>--color-info-ink</code></td><td><code>${esc(tokens.colorInfoInk)}</code></td><td>text — the <code>-ink</code>, never the base</td></tr>
        <tr><td><code>--border</code></td><td><code>${esc(tokens.border)}</code></td><td>block border (unreviewed swaps to the ink)</td></tr>
        <tr><td><code>--radius</code></td><td><code>${esc(tokens.radius)}</code></td><td>corner, both densities</td></tr>
        <tr><td><code>--cpl-font-mono</code></td><td><code>${esc(tokens.cplFontMono.split(",")[0])}</code></td><td>type</td></tr>
        <tr><td><code>--ls-wide</code></td><td><code>${esc(tokens.lsWide)}</code></td><td>tracking</td></tr>
      </tbody>
    </table>
  </section>

</div>
</body>
</html>
`;

mkdirSync(HERE, { recursive: true });
writeFileSync(resolve(HERE, "index.html"), page);

console.log(
  `@cpl/ui preview: ${everyProps.length} prop combinations rendered from the real component\n` +
  `  chip contrast ${r2(chipContrast)} · on --surface ${r2(whiteContrast)}\n` +
  `  non-token colors: ${strays.length === 0 ? "none" : strays.length}\n` +
  `  → preview/index.html`
);

if (strays.length || aaFails.length) {
  console.error("\nGallery QA FAILED — the component emitted a non-token color or fell below AA.");
  process.exit(1);
}
