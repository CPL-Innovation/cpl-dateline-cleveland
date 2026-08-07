// @cpl/tokens — the M1 gate, as an executable check.
//
// tokens-spec §6 lists six acceptance criteria. This asserts all six against the
// BUILT artifacts, so "does the package meet the gate" is `npm test`, not a
// reading exercise. Run: npm run check --workspace @cpl/tokens
//
// The var() resolver here is deliberately a SECOND, independent implementation —
// if it agreed with build.ts by sharing code, the parity check would prove
// nothing about whether the two artifacts actually match.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = resolvePath(HERE, "..");
const DIST = resolvePath(PKG_DIR, "dist");

const failures: string[] = [];
const notes: string[] = [];

function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures.push(label);
  }
}

// ── parse the generated CSS independently ──────────────────────────────────────

const cssPath = resolvePath(DIST, "tokens.css");
const jsPath = resolvePath(DIST, "tokens.js");
const dtsPath = resolvePath(DIST, "tokens.d.ts");

console.log("\n@cpl/tokens — M1 acceptance gate\n");
console.log("Criterion 1 — one source, two outputs");
check("dist/tokens.css exists", existsSync(cssPath));
check("dist/tokens.js exists", existsSync(jsPath));
check("dist/tokens.d.ts exists", existsSync(dtsPath));
if (failures.length) {
  console.log("\nArtifacts missing — run `npm run build --workspace @cpl/tokens` first.\n");
  process.exit(1);
}

const cssRaw = readFileSync(cssPath, "utf8");
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, "");

/** Pull `selector { --name: value; }` declarations out of the stripped CSS. */
function blockFor(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  const pattern = new RegExp(
    `${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([\\s\\S]*?)\\n\\}`,
    "g",
  );
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    for (const line of match[1].split("\n")) {
      const decl = /^\s*(--[\w-]+)\s*:\s*(.+?);\s*$/.exec(line);
      if (decl) out[decl[1]] = decl[2].trim();
    }
  }
  return out;
}

const rootVars = blockFor(":root");
const staffVars = blockFor('[data-theme="staff"]');

/** Independent var() resolver — intentionally not shared with build.ts. */
function resolveFrom(table: Record<string, string>, value: string, depth = 0): string {
  if (depth > 20) throw new Error(`var() chain too deep resolving: ${value}`);
  return value.replace(/var\(\s*(--[\w-]+)\s*\)/g, (_m, name: string) => {
    const next = table[name];
    if (next === undefined) throw new Error(`unresolved ${name}`);
    return resolveFrom(table, next, depth + 1);
  });
}

// ── the JS mirror ──────────────────────────────────────────────────────────────

const mirror = await import(jsPath);
const { tokens, cssVar, cssVarName, primitives, semantic, staffTheme, themes } = mirror;

// ── Criterion 1 (cont.) — the two artifacts agree, token for token ─────────────

const camel = (name: string) =>
  name
    .replace(/^--/, "")
    .split("-")
    .filter(Boolean)
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("");

const cssNames = Object.keys(rootVars);
const missingInJs = cssNames.filter((n) => !(camel(n) in tokens));
check(
  `every CSS token appears in the JS mirror (${cssNames.length} tokens)`,
  missingInJs.length === 0,
  missingInJs.join(", "),
);

const extraInJs = Object.keys(tokens).filter(
  (k) => !cssNames.some((n) => camel(n) === k),
);
check("the JS mirror invents no tokens the CSS lacks", extraInJs.length === 0, extraInJs.join(", "));

const valueMismatch = cssNames.filter((n) => {
  try {
    return resolveFrom(rootVars, rootVars[n]) !== tokens[camel(n)];
  } catch {
    return true;
  }
});
check(
  "resolved values are identical across CSS and JS",
  valueMismatch.length === 0,
  valueMismatch.map((n) => `${n}: css=${rootVars[n]} js=${tokens[camel(n)]}`).join("; "),
);

// ── Criterion 2 — CSS artifact shape ───────────────────────────────────────────

console.log("\nCriterion 2 — CSS emits :root primitives + semantic tier + [data-theme=\"staff\"]");
const cplPrimitives = cssNames.filter((n) => n.startsWith("--cpl-"));
check(`:root carries the --cpl-* base (${cplPrimitives.length} tokens)`, cplPrimitives.length > 20);
check(
  ":root carries the semantic tier",
  ["--color-primary", "--surface", "--text-1", "--border", "--radius", "--focus-ring"].every(
    (n) => n in rootVars,
  ),
);
check(
  '[data-theme="staff"] block is emitted',
  Object.keys(staffVars).length > 0,
  `${Object.keys(staffVars).length} declarations`,
);
check(
  "the staff skin binds every semantic slot",
  Object.keys(semantic).every((k) => Object.keys(staffVars).some((n) => camel(n) === k)),
);

// ── Criterion 3 — JS artifact shape ────────────────────────────────────────────

console.log("\nCriterion 3 — JS exposes typed values + a cssVar name map");
check("`tokens` is a camelCased value object", typeof tokens?.cplNavy === "string");
check("camelCasing handles numeric segments", tokens.cplSlate800 === "#2B3340");
check(
  "`cssVar` maps to late-binding var() refs",
  cssVar?.colorPrimary === "var(--color-primary)" && cssVar?.cplNavy === "var(--cpl-navy)",
);
check(
  "`cssVarName` maps to bare property names",
  cssVarName?.cplNavy === "--cpl-navy" && cssVarName?.radius === "--radius",
);
check("`primitives` and `semantic` are exposed separately", !!primitives && !!semantic);
check("`themes.staff` is exposed", !!themes?.staff && themes.staff === staffTheme);
check(
  "types declare literal values",
  readFileSync(dtsPath, "utf8").includes('readonly cplNavy: "#0057B7"'),
);

// Dateline's C.* and CN's STAFF_TOKENS must be able to point at this.
check(
  "Dateline's palette resolves from the mirror",
  tokens.cplNavy === "#0057B7" &&
    tokens.cplSlate800 === "#2B3340" &&
    tokens.cplSlate600 === "#505A69" &&
    tokens.cplSlate400 === "#8A94A3" &&
    tokens.cplSlate200 === "#C9CFD8" &&
    tokens.cplSlate100 === "#E6E9EE" &&
    tokens.cplFog === "#F2F4F7",
);

// ── Criterion 4 — installable ──────────────────────────────────────────────────

console.log("\nCriterion 4 — installable, versioned, dual entry points");
const pkg = JSON.parse(readFileSync(resolvePath(PKG_DIR, "package.json"), "utf8"));
check("name is @cpl/tokens", pkg.name === "@cpl/tokens");
check("is versioned", /^\d+\.\d+\.\d+/.test(pkg.version ?? ""), pkg.version);
check("exports the JS entry point", pkg.exports?.["."]?.import === "./dist/tokens.js");
check("exports ./css", pkg.exports?.["./css"] === "./dist/tokens.css");
check("ships types", pkg.exports?.["."]?.types === "./dist/tokens.d.ts");

const rootPkg = JSON.parse(
  readFileSync(resolvePath(PKG_DIR, "..", "..", "package.json"), "utf8"),
);
check(
  "sits in the declared packages/* workspace",
  (rootPkg.workspaces ?? []).includes("packages/*"),
);

// ── Criterion 5 — the shared error red ─────────────────────────────────────────

console.log("\nCriterion 5 — the ⊕ NEW error red");
check("--cpl-error is #9B3030", rootVars["--cpl-error"] === "#9B3030");
check("JS mirror carries it", tokens.cplError === "#9B3030");
check("--color-danger binds it", resolveFrom(rootVars, rootVars["--color-danger"]) === "#9B3030");
check(
  "--cpl-danger stays soft coral (not the validation red)",
  resolveFrom(rootVars, rootVars["--cpl-danger"]) === "#FF8D7E",
);

// ── Criterion 6 — no legacy aliases ────────────────────────────────────────────

console.log("\nCriterion 6 — legacy aliases not carried forward");
const LEGACY = [
  "--cpl-gold",
  "--cpl-gold-deep",
  "--cpl-stone",
  "--cpl-lake",
  "--cpl-sage",
  "--cpl-brick",
  "--cpl-plum",
  "--cpl-terracotta",
];
const leaked = LEGACY.filter((n) => n in rootVars);
check("no legacy --cpl-* aliases in the package", leaked.length === 0, leaked.join(", "));

// Out-of-scope guards: patron display fonts must not have crept in.
const fontBlob = [tokens.cplFontSerif, tokens.cplFontSans, tokens.cplFontMono].join(" ");
check(
  "no license-encumbered patron display fonts (Navigo / Replica LL)",
  !/navigo|replica/i.test(fontBlob),
);
check(
  "the three staff families are Spectral / Work Sans / JetBrains Mono",
  tokens.cplFontSerif.startsWith("'Spectral'") &&
    tokens.cplFontSans.startsWith("'Work Sans'") &&
    tokens.cplFontMono.startsWith("'JetBrains Mono'"),
);

// ── integrity extras ───────────────────────────────────────────────────────────

console.log("\nIntegrity");
const unresolved = Object.keys(tokens).filter((k) => String(tokens[k]).includes("var("));
check("no unresolved var() left in the JS mirror", unresolved.length === 0, unresolved.join(", "));
check(
  "--focus-ring resolved through two hops",
  tokens.focusRing === "0 0 0 2px #FFFFFF, 0 0 0 4px #0057B7",
  tokens.focusRing,
);
check(
  "the radius collision is resolved (scale namespaced, slot free)",
  rootVars["--cpl-radius-lg"] === "10px" && rootVars["--radius-lg"] === "8px",
);
notes.push(
  `${Object.keys(tokens).length} tokens · ${cplPrimitives.length} primitives · ` +
    `${Object.keys(semantic).length} semantic slots · themes: ${Object.keys(themes).join(", ")}`,
);

// ── v0.2 — the M2-surfaced working slots ───────────────────────────────────────
//
// tokens-spec §4 "⊕ The M2 working-slot additions". Four gaps the first real
// consumer proved the tier was missing. The tint math is restated here rather
// than imported, for the same reason the var() resolver is: a check that shares
// code with the builder proves nothing.

console.log(
  "\nv0.2 / v0.3 — the working slots (soft fills · on-fill · subtle surface · the four status inks)",
);

/** WCAG relative luminance + contrast ratio, for the AA assertion. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** The spec's tint: base composited at `alpha` over white — NOT a nudge toward white. */
function washOverWhite(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return (
    "#" +
    [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map((c) => Math.round(255 - (255 - c) * alpha).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

const WHITE = "#FFFFFF";

// 1. Soft status fills — generated from their base, not hand-typed.
const SOFT_PAIRS: Array<[string, string]> = [
  ["--color-primary-soft", "--cpl-navy"],
  ["--color-success-soft", "--cpl-success"],
  ["--color-warning-soft", "--cpl-warning"],
  ["--color-danger-soft", "--cpl-error"],
  ["--color-info-soft", "--cpl-info"],
];
const softWrong = SOFT_PAIRS.filter(([soft, base]) => {
  const expected = washOverWhite(resolveFrom(rootVars, `var(${base})`), 0.12);
  return rootVars[soft] !== expected;
});
check(
  `all five --color-*-soft are tint(base, 0.12) of their base`,
  softWrong.length === 0,
  softWrong.map(([s]) => `${s}=${rootVars[s]}`).join("; "),
);
check(
  "the soft fills are five DISTINCT colors (not one collapsed grey)",
  new Set(SOFT_PAIRS.map(([s]) => rootVars[s])).size === 5,
);
// Chip legibility, pair by pair. Every status color now has a base (fill), a soft
// (chip) and an ink (text) — v0.3 completed the set — so every pair is ENFORCED.
// The v0.2 ⚠-report escape hatch is gone: it existed only while ivy and denim were
// waiting on a value pick.
const CHIP_PAIRS: Array<[string, string, string]> = [
  ["primary", "--color-primary-soft", "--color-primary"],
  ["success", "--color-success-soft", "--color-success-ink"],
  ["warning", "--color-warning-soft", "--color-warning-ink"],
  ["danger", "--color-danger-soft", "--color-danger"],
  ["info", "--color-info-soft", "--color-info-ink"],
];
const chipRatio = (fill: string, ink: string) =>
  contrast(rootVars[fill], resolveFrom(rootVars, rootVars[ink]));

const chipFails = CHIP_PAIRS.filter(([, fill, ink]) => chipRatio(fill, ink) < 4.5);
check(
  "every status chip carries its ink at AA (all five — enforced since v0.3)",
  chipFails.length === 0,
  chipFails.map(([n, f, i]) => `${n}=${chipRatio(f, i).toFixed(2)}:1`).join("; "),
);

// The ink slots must also clear AA as plain text on the default surface.
const INK_SLOTS = ["--color-warning-ink", "--color-success-ink", "--color-info-ink"];
const inkFails = INK_SLOTS.filter(
  (slot) => contrast(WHITE, resolveFrom(rootVars, rootVars[slot])) < 4.5,
);
check(
  "every deepened status ink clears AA on white (enforced)",
  inkFails.length === 0,
  inkFails.join(", "),
);

// The bases they deepen are still FILL colors — that failure is the reason the
// ink slots exist, so assert it stays true rather than letting it drift silently.
const FILL_ONLY: Array<[string, string]> = [
  ["--color-warning", "--color-warning-ink"],
  ["--color-success", "--color-success-ink"],
  ["--color-info", "--color-info-ink"],
];
check(
  "each ink is genuinely deeper than the fill it rescues (warning · success · info)",
  FILL_ONLY.every(([base, ink]) => {
    const b = contrast(WHITE, resolveFrom(rootVars, rootVars[base]));
    const i = contrast(WHITE, resolveFrom(rootVars, rootVars[ink]));
    return b < 4.5 && i >= 4.5 && i > b;
  }),
);
for (const [base, ink] of FILL_ONLY) {
  notes.push(
    `  ${base} ${contrast(WHITE, resolveFrom(rootVars, rootVars[base])).toFixed(2)}:1 (fill) ` +
      `→ ${ink} ${contrast(WHITE, resolveFrom(rootVars, rootVars[ink])).toFixed(2)}:1 (ink)`,
  );
}

// 2. Warning ink — the AA fix that started v0.2.
const warnInk = resolveFrom(rootVars, rootVars["--color-warning-ink"]);
const warnFill = resolveFrom(rootVars, rootVars["--color-warning"]);
check(
  "--color-warning-ink clears AA on white",
  contrast(warnInk, WHITE) >= 4.5,
  `${warnInk} = ${contrast(warnInk, WHITE).toFixed(2)}:1`,
);
check(
  "--color-warning (marigold) is still the FILL, and still fails as ink — the reason the slot exists",
  contrast(warnFill, WHITE) < 4.5,
  `${warnFill} = ${contrast(warnFill, WHITE).toFixed(2)}:1`,
);

// 3. On-fill foreground — its own slot, not --surface wearing a disguise.
check("--text-on-fill exists as its own slot", "--text-on-fill" in rootVars);
check(
  "--text-on-fill binds the white PRIMITIVE, not --surface",
  rootVars["--text-on-fill"] === "var(--cpl-white)",
  rootVars["--text-on-fill"],
);
check("--text-on-fill resolves to white", tokens.textOnFill === WHITE);

// 4. Third surface step — a real cool step between white and fog.
const subtle = resolveFrom(rootVars, rootVars["--surface-subtle"]);
const sunken = resolveFrom(rootVars, rootVars["--surface-sunken"]);
check(
  "--surface-subtle sits strictly between --surface and --surface-sunken",
  luminance(subtle) < luminance(WHITE) && luminance(subtle) > luminance(sunken),
  `${WHITE} > ${subtle} > ${sunken}`,
);
check(
  "--surface-subtle is COOL (blue-leaning), not warm --cpl-paper",
  (() => {
    const n = parseInt(subtle.slice(1), 16);
    return (n & 255) >= ((n >> 16) & 255); // blue ≥ red
  })() && subtle !== tokens.cplPaper,
  subtle,
);

// ── verdict ────────────────────────────────────────────────────────────────────

console.log("");
for (const note of notes) console.log(note);
if (failures.length) {
  console.log(`\nGATE: FAILED — ${failures.length} check(s):`);
  for (const f of failures) console.log(`  · ${f}`);
  process.exit(1);
}
console.log("\nGATE: PASSED — M1's six acceptance criteria + the v0.2 / v0.3 working slots.\n");
