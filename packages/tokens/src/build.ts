// @cpl/tokens — CODEGEN. One source (src/) → three artifacts (dist/).
//
//   dist/tokens.css   :root primitives + semantic tier + [data-theme="staff"]
//   dist/tokens.js    the JS mirror — resolved values, camelCased, + var() maps
//   dist/tokens.d.ts  literal types for the mirror
//
// Run: npm run build --workspace @cpl/tokens
//
// Zero build dependencies, matching the repo's idiom: Node's own type-stripping
// runs the TS source directly and the emitters are plain string builders. The
// JS mirror is NOT compiled from the TS — it is SERIALIZED from the same token
// objects the CSS comes from, so the two artifacts cannot drift.

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import type { Token, TokenSection } from "./types.ts";
import { flatten } from "./types.ts";
import { layer } from "./index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = resolvePath(HERE, "..");
const DIST = resolvePath(PKG_DIR, "dist");

const pkg = JSON.parse(readFileSync(resolvePath(PKG_DIR, "package.json"), "utf8"));
const BANNER_LINES = [
  `${pkg.name} v${pkg.version} — GENERATED FILE. DO NOT EDIT.`,
  `Source of truth: packages/tokens/src/ · regenerate with \`npm run build --workspace ${pkg.name}\`.`,
  `Design intent: CPL Design System vault → build/tokens/tokens-spec.md.`,
];

// ── name derivation ────────────────────────────────────────────────────────────

/** `--cpl-slate-800` → `cplSlate800`. The one and only naming rule. */
function camel(cssName: string): string {
  const parts = cssName.replace(/^--/, "").split("-").filter(Boolean);
  return parts
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("");
}

// ── var() resolution ───────────────────────────────────────────────────────────

const VAR_REF = /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*?))?\s*\)/g;

/**
 * Resolve `var(--x)` chains down to a concrete value.
 *
 * The JS mirror ships resolved values so Dateline's inline styles and CN's
 * STAFF_TOKENS work with no stylesheet loaded. Consumers that DO load the CSS
 * and want live theme switching use the `cssVar` map instead.
 */
function resolveValue(
  value: string,
  table: Record<string, Token>,
  trail: string[] = [],
): string {
  return value.replace(VAR_REF, (_match, name: string, fallback?: string) => {
    if (trail.includes(name)) {
      throw new Error(`Token cycle: ${[...trail, name].join(" → ")}`);
    }
    const target = table[name];
    if (!target) {
      if (fallback !== undefined) return resolveValue(fallback, table, trail);
      throw new Error(
        `Token ${name} is referenced but never defined` +
          (trail.length ? ` (via ${trail.join(" → ")})` : ""),
      );
    }
    return resolveValue(target.value, table, [...trail, name]);
  });
}

// ── tint() — the generated soft status fills ───────────────────────────────────

const TINT_CALL = /tint\(\s*(.+?)\s*,\s*([0-9.]+)\s*\)/g;
const HEX6 = /^#[0-9a-f]{6}$/i;

/**
 * `base` composited at `alpha` opacity over white — the pale wash a status chip
 * sits its ink on (tokens-spec §4, the ⊕ M2 soft tints).
 *
 * Deliberately NOT a "move 12% toward white" nudge: that barely shifts a
 * saturated hue, and the spec is explicit about which one it wants.
 */
function tintOverWhite(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const over = (c: number) => Math.round(255 - (255 - c) * alpha);
  return (
    "#" +
    [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map((c) => over(c).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

/**
 * Evaluate any `tint(<color>, <alpha>)` call down to a concrete hex.
 *
 * CSS cannot compute this at parse time, so the artifact ships the resolved
 * value — but the *source* still names the base token once, so the tints are
 * generated from the palette rather than hand-maintained beside it.
 */
function evalTints(value: string, table: Record<string, Token>): string {
  return value.replace(TINT_CALL, (_match, inner: string, alpha: string) => {
    const base = resolveValue(inner, table).trim();
    if (!HEX6.test(base)) {
      throw new Error(`tint() needs a 6-digit hex base, got "${base}" (from "${inner}")`);
    }
    return tintOverWhite(base, Number(alpha));
  });
}

// ── validation ─────────────────────────────────────────────────────────────────

/** Every derived JS key must be unique, or the mirror silently drops a token. */
function assertNoCollisions(names: string[]): void {
  const byKey = new Map<string, string[]>();
  for (const name of names) {
    const key = camel(name);
    byKey.set(key, [...(byKey.get(key) ?? []), name]);
  }
  const clashes = [...byKey].filter(([, sources]) => sources.length > 1);
  if (clashes.length) {
    throw new Error(
      "camelCase key collision in the JS mirror:\n" +
        clashes.map(([key, sources]) => `  ${key} ← ${sources.join(", ")}`).join("\n"),
    );
  }
}

/** A slot declared in a theme but absent from the defaults is almost always a typo. */
function assertThemeSlotsKnown(
  themeName: string,
  themeTokens: Record<string, Token>,
  defaults: Record<string, Token>,
): void {
  const unknown = Object.keys(themeTokens).filter((name) => !(name in defaults));
  if (unknown.length) {
    throw new Error(
      `Theme "${themeName}" declares slots with no default binding: ${unknown.join(", ")}`,
    );
  }
}

// ── CSS emitter ────────────────────────────────────────────────────────────────

function cssBlock(
  selector: string,
  sections: TokenSection[],
  table: Record<string, Token>,
  indent = "  ",
): string {
  const body = sections
    .map((section) => {
      const head = [
        `${indent}/* ── ${section.title} ${"─".repeat(Math.max(0, 58 - section.title.length))} */`,
        ...(section.note ? wrap(section.note, 88).map((l) => `${indent}/* ${l} */`) : []),
      ].join("\n");
      const decls = Object.entries(section.tokens)
        .map(([name, token]) => {
          // var() refs stay late-binding in CSS; only tint() must be pre-computed.
          const decl = `${indent}${name}: ${evalTints(token.value, table)};`;
          return token.role ? `${decl} /* ${token.role} */` : decl;
        })
        .join("\n");
      return `${head}\n${decls}`;
    })
    .join("\n\n");
  return `${selector} {\n${body}\n}`;
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && (line + " " + word).length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function emitCss(table: Record<string, Token>): string {
  const parts: string[] = [
    `/**\n${BANNER_LINES.map((l) => ` * ${l}`).join("\n")}\n */`,
    "",
    "/* ═══ PRIMITIVES — the --cpl-* base. Lifted verbatim; author nothing here. ═══ */",
    cssBlock(":root", layer.primitives, table),
    "",
    "/* ═══ SEMANTIC TIER — intent slots. Consume THESE, not the primitives. ═══ */",
    cssBlock(":root", layer.semantic, table),
  ];

  for (const [name, sections] of Object.entries(layer.themes)) {
    parts.push(
      "",
      `/* ═══ THEME: ${name} — opt in with <html data-theme="${name}">. ═══ */`,
      cssBlock(`[data-theme="${name}"]`, sections, { ...table, ...flatten(sections) }),
    );
  }

  return parts.join("\n") + "\n";
}

// ── JS + types emitter ─────────────────────────────────────────────────────────

interface Entry {
  cssName: string;
  key: string;
  raw: string;
  resolved: string;
  role?: string;
}

function entriesFor(
  sections: TokenSection[],
  table: Record<string, Token>,
): Entry[] {
  return Object.entries(flatten(sections)).map(([cssName, token]) => ({
    cssName,
    key: camel(cssName),
    raw: token.value,
    resolved: evalTints(resolveValue(token.value, table), table),
    role: token.role,
  }));
}

function objectLiteral(
  entries: Entry[],
  pick: (e: Entry) => string,
  indent = "  ",
): string {
  return entries
    .map((e) => {
      const doc = `${indent}/** \`${e.cssName}\`${e.role ? ` — ${e.role}` : ""} */`;
      return `${doc}\n${indent}${e.key}: ${JSON.stringify(pick(e))},`;
    })
    .join("\n");
}

function typeLiteral(entries: Entry[], pick: (e: Entry) => string, indent = "  "): string {
  return entries
    .map((e) => {
      const doc = `${indent}/** \`${e.cssName}\`${e.role ? ` — ${e.role}` : ""} */`;
      return `${doc}\n${indent}readonly ${e.key}: ${JSON.stringify(pick(e))};`;
    })
    .join("\n");
}

function emitJs(all: Entry[], primitiveEntries: Entry[], semanticEntries: Entry[], themes: Record<string, Entry[]>): string {
  const themeExports = Object.entries(themes)
    .map(
      ([name, entries]) =>
        `export const ${name}Theme = {\n${objectLiteral(entries, (e) => e.resolved)}\n};`,
    )
    .join("\n\n");

  return [
    `/**\n${BANNER_LINES.map((l) => ` * ${l}`).join("\n")}\n */`,
    "",
    "/**",
    " * Every token, resolved to a concrete value and camelCased.",
    " *",
    " * Use this where styles are written in JS with no stylesheet guaranteed —",
    " * Dateline's inline `style={{}}` objects, CN's STAFF_TOKENS. Values are static:",
    " * they do not follow a runtime `data-theme` switch. For that, use `cssVar`.",
    " */",
    `export const tokens = {\n${objectLiteral(all, (e) => e.resolved)}\n};`,
    "",
    "/**",
    " * The same names bound to `var(--…)` references — late-binding.",
    " *",
    " * Drop-in for inline styles when dist/tokens.css IS loaded: the value follows",
    ' * `data-theme` at runtime. `style={{ color: cssVar.colorPrimary }}`.',
    " */",
    `export const cssVar = {\n${objectLiteral(all, (e) => `var(${e.cssName})`)}\n};`,
    "",
    "/**",
    " * The bare custom-property names, for `element.style.setProperty(name, value)`",
    " * and other places a `var()` wrapper would be wrong.",
    " */",
    `export const cssVarName = {\n${objectLiteral(all, (e) => e.cssName)}\n};`,
    "",
    "/** The `--cpl-*` base only. */",
    `export const primitives = {\n${objectLiteral(primitiveEntries, (e) => e.resolved)}\n};`,
    "",
    "/** The intent slots only — what periphery code and @cpl/ui should consume. */",
    `export const semantic = {\n${objectLiteral(semanticEntries, (e) => e.resolved)}\n};`,
    "",
    themeExports,
    "",
    `export const themes = { ${Object.keys(themes).map((n) => `${n}: ${n}Theme`).join(", ")} };`,
    "",
    "export default tokens;",
    "",
  ].join("\n");
}

function emitTypes(all: Entry[], primitiveEntries: Entry[], semanticEntries: Entry[], themes: Record<string, Entry[]>): string {
  const themeDecls = Object.entries(themes)
    .map(
      ([name, entries]) =>
        `export declare const ${name}Theme: {\n${typeLiteral(entries, (e) => e.resolved)}\n};`,
    )
    .join("\n\n");

  return [
    `/**\n${BANNER_LINES.map((l) => ` * ${l}`).join("\n")}\n */`,
    "",
    `export declare const tokens: {\n${typeLiteral(all, (e) => e.resolved)}\n};`,
    "",
    `export declare const cssVar: {\n${typeLiteral(all, (e) => `var(${e.cssName})`)}\n};`,
    "",
    `export declare const cssVarName: {\n${typeLiteral(all, (e) => e.cssName)}\n};`,
    "",
    `export declare const primitives: {\n${typeLiteral(primitiveEntries, (e) => e.resolved)}\n};`,
    "",
    `export declare const semantic: {\n${typeLiteral(semanticEntries, (e) => e.resolved)}\n};`,
    "",
    themeDecls,
    "",
    `export declare const themes: { ${Object.keys(themes).map((n) => `${n}: typeof ${n}Theme`).join("; ")} };`,
    "",
    "/** Every token name available on the JS mirror. */",
    "export type CplTokenName = keyof typeof tokens;",
    "",
    "/** The resolved value of a given token. */",
    "export type CplTokenValue<K extends CplTokenName> = (typeof tokens)[K];",
    "",
    "export default tokens;",
    "",
  ].join("\n");
}

// ── run ────────────────────────────────────────────────────────────────────────

function build(): void {
  const defaults = { ...flatten(layer.primitives), ...flatten(layer.semantic) };

  assertNoCollisions(Object.keys(defaults));
  for (const [name, sections] of Object.entries(layer.themes)) {
    assertThemeSlotsKnown(name, flatten(sections), defaults);
  }

  const primitiveEntries = entriesFor(layer.primitives, defaults);
  const semanticEntries = entriesFor(layer.semantic, defaults);
  const all = [...primitiveEntries, ...semanticEntries];
  const themeEntries: Record<string, Entry[]> = {};
  for (const [name, sections] of Object.entries(layer.themes)) {
    // A theme resolves against its own values first, then the defaults.
    themeEntries[name] = entriesFor(sections, { ...defaults, ...flatten(sections) });
  }

  mkdirSync(DIST, { recursive: true });
  writeFileSync(resolvePath(DIST, "tokens.css"), emitCss(defaults));
  writeFileSync(resolvePath(DIST, "tokens.js"), emitJs(all, primitiveEntries, semanticEntries, themeEntries));
  writeFileSync(resolvePath(DIST, "tokens.d.ts"), emitTypes(all, primitiveEntries, semanticEntries, themeEntries));

  console.log(
    `@cpl/tokens: ${all.length} tokens ` +
      `(${primitiveEntries.length} primitive, ${semanticEntries.length} semantic) ` +
      `· themes: ${Object.keys(layer.themes).join(", ")}\n` +
      `  → dist/tokens.css\n  → dist/tokens.js\n  → dist/tokens.d.ts`,
  );
}

build();
