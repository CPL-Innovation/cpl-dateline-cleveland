// @cpl/tokens — PRIMITIVES (the `--cpl-*` base).
//
// LIFTED, NOT AUTHORED. Every value here is taken verbatim from Self-Guided
// Tour's `styles/colors_and_type.css`, per tokens-spec §1–§3. The only new value
// in the whole package is `--cpl-error` (⊕ NEW, §1 status table).
//
// Legacy SGT aliases (--cpl-gold, --cpl-stone, --cpl-lake, --cpl-sage,
// --cpl-brick, --cpl-plum, --cpl-terracotta, --cpl-gold-deep) are deliberately
// NOT carried forward — tokens-spec §1 note + acceptance criterion 6. If SGT
// still references one at migration time it aliases locally, not here.

import type { TokenSection } from "./types.ts";

export const primitives: TokenSection[] = [
  {
    title: "Brand",
    tokens: {
      "--cpl-navy": { value: "#0057B7", role: "Primary brand blue (PMS 2935, logo)" },
      "--cpl-navy-deep": { value: "#004591", role: "Hover / pressed navy" },
      "--cpl-navy-ink": { value: "#002A5C", role: "Headline ink on light" },
      "--cpl-butter": { value: "#E9E186", role: "Primary pale yellow (PMS 608)" },
      "--cpl-butter-deep": { value: "#C9C25F", role: "Hover / pressed butter" },
      "--cpl-warm-gray": { value: "#CBC4BC", role: "Neutral (PMS Warm Gray 2)" },
      "--cpl-black": { value: "#000000", role: "Neutral" },
      "--cpl-white": { value: "#FFFFFF", role: "Neutral" },
    },
  },
  {
    title: "Accents",
    tokens: {
      "--cpl-coral": { value: "#FF8D7E", role: "Secondary accent (PMS 170)" },
      "--cpl-marigold": { value: "#F1C400", role: "Secondary accent (PMS 7406)" },
      "--cpl-sky": { value: "#94B7BB", role: "Secondary accent (PMS 5503)" },
      "--cpl-denim": { value: "#4298B5", role: "Secondary accent (PMS 7459)" },
      "--cpl-ivy": { value: "#56944F", role: "Secondary accent / green (PMS 762)" },
    },
  },
  {
    title: "Cool neutral ramp — the shared slate",
    note: "Dateline ≡ SGT, identical hex. The ramp the whole staff skin rests on.",
    tokens: {
      "--cpl-slate-800": { value: "#2B3340", role: "Body ink (strong)" },
      "--cpl-slate-600": { value: "#505A69", role: "Secondary text" },
      "--cpl-slate-400": { value: "#8A94A3", role: "Tertiary / meta text" },
      "--cpl-slate-200": { value: "#C9CFD8", role: "Border" },
      "--cpl-slate-100": { value: "#E6E9EE", role: "Hairline / light border" },
      "--cpl-fog": { value: "#F2F4F7", role: "Sunken / cool neutral surface" },
      "--cpl-slate-050": {
        value: "#F7F8FA",
        role: "⊕ (M2) lightest cool surface tint — the middle step between white and fog",
      },
      "--cpl-paper": { value: "#FBFAF6", role: "Page background (⚠ warm cast — not for cool surfaces)" },
      "--cpl-parchment": { value: "#F7F4ED", role: "Warm paper (derived)" },
    },
  },
  {
    title: "Status",
    note: "Semantic aliases at primitive level, lifted. Intent slots live in the semantic tier.",
    tokens: {
      "--cpl-success": { value: "var(--cpl-ivy)", role: "success" },
      "--cpl-warning": { value: "var(--cpl-marigold)", role: "warning" },
      "--cpl-danger": { value: "var(--cpl-coral)", role: "danger (soft) — coral, not the validation red" },
      "--cpl-info": { value: "var(--cpl-denim)", role: "info" },
      "--cpl-error": {
        value: "#9B3030",
        role: "⊕ NEW — shared deep-red for text-on-light error/validation states",
      },
      "--cpl-warning-ink": {
        value: "#7A5C00",
        role: "⊕ NEW (M2) — deepened amber for warning text-on-light; marigold is a FILL (~1.65:1 as ink)",
      },
      "--cpl-success-ink": {
        value: "#3F6E39",
        role: "⊕ NEW (v0.3) — deepened ivy for success text-on-light (ivy is a FILL, 3.66:1 as ink)",
      },
      "--cpl-info-ink": {
        value: "#2A6580",
        role: "⊕ NEW (v0.3) — deepened denim for info text-on-light (denim is a FILL, 3.29:1 as ink)",
      },
    },
  },
  {
    title: "Type families",
    note: "The one universal primitive — 3/3 repos, values identical. Loaded via Google Fonts <link>.",
    tokens: {
      "--cpl-font-serif": {
        value: "'Spectral', 'Source Serif Pro', Georgia, serif",
        role: "Serif — editorial + studio display",
      },
      "--cpl-font-sans": {
        value: "'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        role: "Sans — workhorse UI + body",
      },
      "--cpl-font-mono": {
        value: "'JetBrains Mono', 'SF Mono', Consolas, ui-monospace, monospace",
        role: "Mono — provenance + meta",
      },
    },
  },
  {
    title: "Type scale",
    note: "The prototype's intent. Migration wires live headings to this scale — don't invent new numbers.",
    tokens: {
      "--fs-xs": { value: "0.75rem", role: "12px — captions, fine print" },
      "--fs-sm": { value: "0.875rem", role: "14px — meta, labels" },
      "--fs-base": { value: "1rem", role: "16px — body" },
      "--fs-md": { value: "1.125rem", role: "18px — lead paragraphs" },
      "--fs-lg": { value: "1.375rem", role: "22px — subheads" },
      "--fs-xl": { value: "1.75rem", role: "28px — h3" },
      "--fs-2xl": { value: "2.25rem", role: "36px — h2" },
      "--fs-3xl": { value: "3rem", role: "48px — h1" },
      "--fs-4xl": { value: "4rem", role: "64px — display" },
      "--fs-5xl": { value: "5.5rem", role: "88px — hero (patron; staff rarely needs it)" },
    },
  },
  {
    title: "Weights · line-heights · letter-spacing",
    tokens: {
      "--fw-light": { value: "300" },
      "--fw-regular": { value: "400" },
      "--fw-medium": { value: "500" },
      "--fw-semibold": { value: "600" },
      "--fw-bold": { value: "700" },
      "--lh-tight": { value: "1.1" },
      "--lh-snug": { value: "1.25" },
      "--lh-normal": { value: "1.5" },
      "--lh-loose": { value: "1.7" },
      "--ls-tight": { value: "-0.01em" },
      "--ls-normal": { value: "0" },
      "--ls-wide": { value: "0.04em" },
      "--ls-caps": { value: "0.12em", role: "the uppercase-label tracking every CPL staff surface uses" },
    },
  },
  {
    title: "Spacing",
    note: "4px grid, lifted from SGT.",
    tokens: {
      "--space-1": { value: "4px", role: "0.25rem" },
      "--space-2": { value: "8px", role: "0.5rem" },
      "--space-3": { value: "12px", role: "0.75rem" },
      "--space-4": { value: "16px", role: "1rem" },
      "--space-5": { value: "24px", role: "1.5rem" },
      "--space-6": { value: "32px", role: "2rem" },
      "--space-7": { value: "40px", role: "2.5rem" },
      "--space-8": { value: "48px", role: "3rem" },
      "--space-10": { value: "64px", role: "4rem" },
      "--space-12": { value: "96px", role: "6rem" },
      "--space-16": { value: "128px", role: "8rem" },
    },
  },
  {
    title: "Radius scale",
    note:
      "Namespaced `--cpl-radius-*` (spec §3 writes it bare). Bare `--radius-lg` would " +
      "collide with the semantic slot of the same name (10px scale step vs 8px staff card " +
      "radius) and the later declaration would silently win. Radius is a themeable dial: " +
      "primitives define the SCALE, the theme picks the values.",
    tokens: {
      "--cpl-radius-none": { value: "0", role: "Dateline's flat-civic doctrine runs this everywhere" },
      "--cpl-radius-xs": { value: "2px" },
      "--cpl-radius-sm": { value: "4px" },
      "--cpl-radius-md": { value: "6px" },
      "--cpl-radius-lg": { value: "10px" },
      "--cpl-radius-pill": { value: "999px" },
    },
  },
  {
    title: "Elevation",
    note:
      "Navy-tinted, lifted from SGT base. Three elevation systems existed across the repos; " +
      "the shared package ships ONE. Skins wanting another tint override the slot, not the scale.",
    tokens: {
      "--shadow-0": { value: "none" },
      "--shadow-1": { value: "0 1px 2px rgba(5,31,63,0.06), 0 1px 1px rgba(5,31,63,0.04)" },
      "--shadow-2": { value: "0 2px 6px rgba(5,31,63,0.08), 0 1px 2px rgba(5,31,63,0.04)" },
      "--shadow-3": { value: "0 6px 18px rgba(5,31,63,0.10), 0 2px 4px rgba(5,31,63,0.06)" },
    },
  },
  {
    title: "Motion",
    tokens: {
      "--ease-standard": { value: "cubic-bezier(0.2,0,0.2,1)" },
      "--ease-emph": { value: "cubic-bezier(0.2,0,0,1)" },
      "--dur-fast": { value: "120ms" },
      "--dur-base": { value: "200ms" },
      "--dur-slow": { value: "360ms" },
    },
  },
  {
    title: "Layout",
    tokens: {
      "--container-sm": { value: "640px" },
      "--container-md": { value: "960px" },
      "--container-lg": { value: "1200px" },
      "--container-xl": { value: "1440px" },
    },
  },
];
