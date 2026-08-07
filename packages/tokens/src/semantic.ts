// @cpl/tokens — SEMANTIC TIER (intent slots).
//
// tokens-spec §4. None of the three apps names tokens by intent consistently
// (SGT has an --fg/--bg/--border draft its live surfaces bypass). This is the
// tier the plan wanted: periphery code and future @cpl/ui components consume
// SLOTS, never raw --cpl-* — so re-skinning is one edit.
//
// The bindings below are the STAFF defaults (the only theme in M1 scope). They
// are emitted twice by the build: once as the :root default, once inside
// [data-theme="staff"] — from this one authored map. See themes/staff.ts.

import type { TokenSection } from "./types.ts";

export const semantic: TokenSection[] = [
  {
    title: "Brand / action",
    tokens: {
      "--color-primary": { value: "var(--cpl-navy)", role: "primary action / brand" },
      "--color-primary-hover": { value: "var(--cpl-navy-deep)", role: "hover / pressed" },
      "--color-primary-ink": { value: "var(--cpl-navy-ink)", role: "deep navy text" },
    },
  },
  {
    title: "Surfaces",
    tokens: {
      "--surface": { value: "var(--cpl-white)", role: "default surface" },
      "--surface-subtle": {
        value: "var(--cpl-slate-050)",
        role: "⊕ M2 — inset / secondary surface between canvas and panel (Dateline leaves this unmapped)",
      },
      "--surface-sunken": { value: "var(--cpl-fog)", role: "sunken / secondary surface" },
      "--surface-raised": { value: "var(--cpl-white)", role: "raised (cards)" },
    },
  },
  {
    title: "Text",
    tokens: {
      "--text-1": { value: "var(--cpl-slate-800)", role: "body ink" },
      "--text-2": { value: "var(--cpl-slate-600)", role: "secondary text" },
      "--text-3": { value: "var(--cpl-slate-400)", role: "tertiary / meta" },
      "--text-on-fill": {
        value: "var(--cpl-white)",
        role: "⊕ M2 — foreground on any FILLED control; NOT --surface (a surface used as a foreground breaks under a dark theme)",
      },
    },
  },
  {
    title: "Borders",
    tokens: {
      "--border": { value: "var(--cpl-slate-200)", role: "default border" },
      "--border-strong": { value: "var(--cpl-slate-400)", role: "strong border" },
      "--border-hair": { value: "var(--cpl-slate-100)", role: "hairline" },
    },
  },
  {
    title: "Status",
    tokens: {
      "--color-success": { value: "var(--cpl-success)", role: "success" },
      "--color-warning": { value: "var(--cpl-warning)", role: "warning" },
      "--color-danger": {
        value: "var(--cpl-error)",
        role: "destructive / validation — binds the ⊕ NEW deep red, not soft coral",
      },
      "--color-info": { value: "var(--cpl-info)", role: "info" },
      "--color-warning-ink": {
        value: "var(--cpl-warning-ink)",
        role: "⊕ M2 — warning TEXT-on-light (marigold fails AA as ink)",
      },
      "--color-success-ink": {
        value: "var(--cpl-success-ink)",
        role: "⊕ v0.3 — success TEXT-on-light (ivy fails AA as ink)",
      },
      "--color-info-ink": {
        value: "var(--cpl-info-ink)",
        role: "⊕ v0.3 — info TEXT-on-light (denim fails AA as ink); the Honesty-badge text slot",
      },
    },
  },
  {
    title: "Status — soft fills",
    note:
      "⊕ M2. Every status color shipped ink-only; a chip needs a FILL to sit the ink on. " +
      "GENERATED, never hand-typed: `tint(base, 0.12)` is the base composited at 12% opacity " +
      "over white — a pale wash, not a 12%-toward-white nudge (which barely shifts a saturated " +
      "hue). The codegen evaluates tint() so the CSS ships a concrete hex; change a base and " +
      "its wash follows on the next build.",
    tokens: {
      "--color-primary-soft": { value: "tint(var(--cpl-navy), 0.12)", role: "primary chip / badge fill" },
      "--color-success-soft": { value: "tint(var(--cpl-success), 0.12)", role: "success chip fill" },
      "--color-warning-soft": { value: "tint(var(--cpl-warning), 0.12)", role: "warning chip fill" },
      "--color-danger-soft": { value: "tint(var(--cpl-error), 0.12)", role: "danger chip fill" },
      "--color-info-soft": { value: "tint(var(--cpl-info), 0.12)", role: "info chip fill" },
    },
  },
  {
    title: "Shape · elevation · focus",
    note: "The themeable dials. A skin that wants flat-civic sets --radius: 0 here and nothing else moves.",
    tokens: {
      "--radius": { value: "4px", role: "default control radius (staff)" },
      "--radius-lg": { value: "8px", role: "card radius (staff)" },
      "--elevation": { value: "var(--shadow-1)", role: "default resting elevation" },
      "--focus-ring": {
        value: "0 0 0 2px var(--surface), 0 0 0 4px var(--color-primary)",
        role: "focus (lifted from SGT --st-focus-ring)",
      },
    },
  },
];
