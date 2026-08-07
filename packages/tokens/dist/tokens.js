/**
 * @cpl/tokens v0.3.0 — GENERATED FILE. DO NOT EDIT.
 * Source of truth: packages/tokens/src/ · regenerate with `npm run build --workspace @cpl/tokens`.
 * Design intent: CPL Design System vault → build/tokens/tokens-spec.md.
 */

/**
 * Every token, resolved to a concrete value and camelCased.
 *
 * Use this where styles are written in JS with no stylesheet guaranteed —
 * Dateline's inline `style={{}}` objects, CN's STAFF_TOKENS. Values are static:
 * they do not follow a runtime `data-theme` switch. For that, use `cssVar`.
 */
export const tokens = {
  /** `--cpl-navy` — Primary brand blue (PMS 2935, logo) */
  cplNavy: "#0057B7",
  /** `--cpl-navy-deep` — Hover / pressed navy */
  cplNavyDeep: "#004591",
  /** `--cpl-navy-ink` — Headline ink on light */
  cplNavyInk: "#002A5C",
  /** `--cpl-butter` — Primary pale yellow (PMS 608) */
  cplButter: "#E9E186",
  /** `--cpl-butter-deep` — Hover / pressed butter */
  cplButterDeep: "#C9C25F",
  /** `--cpl-warm-gray` — Neutral (PMS Warm Gray 2) */
  cplWarmGray: "#CBC4BC",
  /** `--cpl-black` — Neutral */
  cplBlack: "#000000",
  /** `--cpl-white` — Neutral */
  cplWhite: "#FFFFFF",
  /** `--cpl-coral` — Secondary accent (PMS 170) */
  cplCoral: "#FF8D7E",
  /** `--cpl-marigold` — Secondary accent (PMS 7406) */
  cplMarigold: "#F1C400",
  /** `--cpl-sky` — Secondary accent (PMS 5503) */
  cplSky: "#94B7BB",
  /** `--cpl-denim` — Secondary accent (PMS 7459) */
  cplDenim: "#4298B5",
  /** `--cpl-ivy` — Secondary accent / green (PMS 762) */
  cplIvy: "#56944F",
  /** `--cpl-slate-800` — Body ink (strong) */
  cplSlate800: "#2B3340",
  /** `--cpl-slate-600` — Secondary text */
  cplSlate600: "#505A69",
  /** `--cpl-slate-400` — Tertiary / meta text */
  cplSlate400: "#8A94A3",
  /** `--cpl-slate-200` — Border */
  cplSlate200: "#C9CFD8",
  /** `--cpl-slate-100` — Hairline / light border */
  cplSlate100: "#E6E9EE",
  /** `--cpl-fog` — Sunken / cool neutral surface */
  cplFog: "#F2F4F7",
  /** `--cpl-slate-050` — ⊕ (M2) lightest cool surface tint — the middle step between white and fog */
  cplSlate050: "#F7F8FA",
  /** `--cpl-paper` — Page background (⚠ warm cast — not for cool surfaces) */
  cplPaper: "#FBFAF6",
  /** `--cpl-parchment` — Warm paper (derived) */
  cplParchment: "#F7F4ED",
  /** `--cpl-success` — success */
  cplSuccess: "#56944F",
  /** `--cpl-warning` — warning */
  cplWarning: "#F1C400",
  /** `--cpl-danger` — danger (soft) — coral, not the validation red */
  cplDanger: "#FF8D7E",
  /** `--cpl-info` — info */
  cplInfo: "#4298B5",
  /** `--cpl-error` — ⊕ NEW — shared deep-red for text-on-light error/validation states */
  cplError: "#9B3030",
  /** `--cpl-warning-ink` — ⊕ NEW (M2) — deepened amber for warning text-on-light; marigold is a FILL (~1.65:1 as ink) */
  cplWarningInk: "#7A5C00",
  /** `--cpl-success-ink` — ⊕ NEW (v0.3) — deepened ivy for success text-on-light (ivy is a FILL, 3.66:1 as ink) */
  cplSuccessInk: "#3F6E39",
  /** `--cpl-info-ink` — ⊕ NEW (v0.3) — deepened denim for info text-on-light (denim is a FILL, 3.29:1 as ink) */
  cplInfoInk: "#2A6580",
  /** `--cpl-font-serif` — Serif — editorial + studio display */
  cplFontSerif: "'Spectral', 'Source Serif Pro', Georgia, serif",
  /** `--cpl-font-sans` — Sans — workhorse UI + body */
  cplFontSans: "'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  /** `--cpl-font-mono` — Mono — provenance + meta */
  cplFontMono: "'JetBrains Mono', 'SF Mono', Consolas, ui-monospace, monospace",
  /** `--fs-xs` — 12px — captions, fine print */
  fsXs: "0.75rem",
  /** `--fs-sm` — 14px — meta, labels */
  fsSm: "0.875rem",
  /** `--fs-base` — 16px — body */
  fsBase: "1rem",
  /** `--fs-md` — 18px — lead paragraphs */
  fsMd: "1.125rem",
  /** `--fs-lg` — 22px — subheads */
  fsLg: "1.375rem",
  /** `--fs-xl` — 28px — h3 */
  fsXl: "1.75rem",
  /** `--fs-2xl` — 36px — h2 */
  fs2xl: "2.25rem",
  /** `--fs-3xl` — 48px — h1 */
  fs3xl: "3rem",
  /** `--fs-4xl` — 64px — display */
  fs4xl: "4rem",
  /** `--fs-5xl` — 88px — hero (patron; staff rarely needs it) */
  fs5xl: "5.5rem",
  /** `--fw-light` */
  fwLight: "300",
  /** `--fw-regular` */
  fwRegular: "400",
  /** `--fw-medium` */
  fwMedium: "500",
  /** `--fw-semibold` */
  fwSemibold: "600",
  /** `--fw-bold` */
  fwBold: "700",
  /** `--lh-tight` */
  lhTight: "1.1",
  /** `--lh-snug` */
  lhSnug: "1.25",
  /** `--lh-normal` */
  lhNormal: "1.5",
  /** `--lh-loose` */
  lhLoose: "1.7",
  /** `--ls-tight` */
  lsTight: "-0.01em",
  /** `--ls-normal` */
  lsNormal: "0",
  /** `--ls-wide` */
  lsWide: "0.04em",
  /** `--ls-caps` — the uppercase-label tracking every CPL staff surface uses */
  lsCaps: "0.12em",
  /** `--space-1` — 0.25rem */
  space1: "4px",
  /** `--space-2` — 0.5rem */
  space2: "8px",
  /** `--space-3` — 0.75rem */
  space3: "12px",
  /** `--space-4` — 1rem */
  space4: "16px",
  /** `--space-5` — 1.5rem */
  space5: "24px",
  /** `--space-6` — 2rem */
  space6: "32px",
  /** `--space-7` — 2.5rem */
  space7: "40px",
  /** `--space-8` — 3rem */
  space8: "48px",
  /** `--space-10` — 4rem */
  space10: "64px",
  /** `--space-12` — 6rem */
  space12: "96px",
  /** `--space-16` — 8rem */
  space16: "128px",
  /** `--cpl-radius-none` — Dateline's flat-civic doctrine runs this everywhere */
  cplRadiusNone: "0",
  /** `--cpl-radius-xs` */
  cplRadiusXs: "2px",
  /** `--cpl-radius-sm` */
  cplRadiusSm: "4px",
  /** `--cpl-radius-md` */
  cplRadiusMd: "6px",
  /** `--cpl-radius-lg` */
  cplRadiusLg: "10px",
  /** `--cpl-radius-pill` */
  cplRadiusPill: "999px",
  /** `--shadow-0` */
  shadow0: "none",
  /** `--shadow-1` */
  shadow1: "0 1px 2px rgba(5,31,63,0.06), 0 1px 1px rgba(5,31,63,0.04)",
  /** `--shadow-2` */
  shadow2: "0 2px 6px rgba(5,31,63,0.08), 0 1px 2px rgba(5,31,63,0.04)",
  /** `--shadow-3` */
  shadow3: "0 6px 18px rgba(5,31,63,0.10), 0 2px 4px rgba(5,31,63,0.06)",
  /** `--ease-standard` */
  easeStandard: "cubic-bezier(0.2,0,0.2,1)",
  /** `--ease-emph` */
  easeEmph: "cubic-bezier(0.2,0,0,1)",
  /** `--dur-fast` */
  durFast: "120ms",
  /** `--dur-base` */
  durBase: "200ms",
  /** `--dur-slow` */
  durSlow: "360ms",
  /** `--container-sm` */
  containerSm: "640px",
  /** `--container-md` */
  containerMd: "960px",
  /** `--container-lg` */
  containerLg: "1200px",
  /** `--container-xl` */
  containerXl: "1440px",
  /** `--color-primary` — primary action / brand */
  colorPrimary: "#0057B7",
  /** `--color-primary-hover` — hover / pressed */
  colorPrimaryHover: "#004591",
  /** `--color-primary-ink` — deep navy text */
  colorPrimaryInk: "#002A5C",
  /** `--surface` — default surface */
  surface: "#FFFFFF",
  /** `--surface-subtle` — ⊕ M2 — inset / secondary surface between canvas and panel (Dateline leaves this unmapped) */
  surfaceSubtle: "#F7F8FA",
  /** `--surface-sunken` — sunken / secondary surface */
  surfaceSunken: "#F2F4F7",
  /** `--surface-raised` — raised (cards) */
  surfaceRaised: "#FFFFFF",
  /** `--text-1` — body ink */
  text1: "#2B3340",
  /** `--text-2` — secondary text */
  text2: "#505A69",
  /** `--text-3` — tertiary / meta */
  text3: "#8A94A3",
  /** `--text-on-fill` — ⊕ M2 — foreground on any FILLED control; NOT --surface (a surface used as a foreground breaks under a dark theme) */
  textOnFill: "#FFFFFF",
  /** `--border` — default border */
  border: "#C9CFD8",
  /** `--border-strong` — strong border */
  borderStrong: "#8A94A3",
  /** `--border-hair` — hairline */
  borderHair: "#E6E9EE",
  /** `--color-success` — success */
  colorSuccess: "#56944F",
  /** `--color-warning` — warning */
  colorWarning: "#F1C400",
  /** `--color-danger` — destructive / validation — binds the ⊕ NEW deep red, not soft coral */
  colorDanger: "#9B3030",
  /** `--color-info` — info */
  colorInfo: "#4298B5",
  /** `--color-warning-ink` — ⊕ M2 — warning TEXT-on-light (marigold fails AA as ink) */
  colorWarningInk: "#7A5C00",
  /** `--color-success-ink` — ⊕ v0.3 — success TEXT-on-light (ivy fails AA as ink) */
  colorSuccessInk: "#3F6E39",
  /** `--color-info-ink` — ⊕ v0.3 — info TEXT-on-light (denim fails AA as ink); the Honesty-badge text slot */
  colorInfoInk: "#2A6580",
  /** `--color-primary-soft` — primary chip / badge fill */
  colorPrimarySoft: "#E0EBF6",
  /** `--color-success-soft` — success chip fill */
  colorSuccessSoft: "#EBF2EA",
  /** `--color-warning-soft` — warning chip fill */
  colorWarningSoft: "#FDF8E0",
  /** `--color-danger-soft` — danger chip fill */
  colorDangerSoft: "#F3E6E6",
  /** `--color-info-soft` — info chip fill */
  colorInfoSoft: "#E8F3F6",
  /** `--radius` — default control radius (staff) */
  radius: "4px",
  /** `--radius-lg` — card radius (staff) */
  radiusLg: "8px",
  /** `--elevation` — default resting elevation */
  elevation: "0 1px 2px rgba(5,31,63,0.06), 0 1px 1px rgba(5,31,63,0.04)",
  /** `--focus-ring` — focus (lifted from SGT --st-focus-ring) */
  focusRing: "0 0 0 2px #FFFFFF, 0 0 0 4px #0057B7",
};

/**
 * The same names bound to `var(--…)` references — late-binding.
 *
 * Drop-in for inline styles when dist/tokens.css IS loaded: the value follows
 * `data-theme` at runtime. `style={{ color: cssVar.colorPrimary }}`.
 */
export const cssVar = {
  /** `--cpl-navy` — Primary brand blue (PMS 2935, logo) */
  cplNavy: "var(--cpl-navy)",
  /** `--cpl-navy-deep` — Hover / pressed navy */
  cplNavyDeep: "var(--cpl-navy-deep)",
  /** `--cpl-navy-ink` — Headline ink on light */
  cplNavyInk: "var(--cpl-navy-ink)",
  /** `--cpl-butter` — Primary pale yellow (PMS 608) */
  cplButter: "var(--cpl-butter)",
  /** `--cpl-butter-deep` — Hover / pressed butter */
  cplButterDeep: "var(--cpl-butter-deep)",
  /** `--cpl-warm-gray` — Neutral (PMS Warm Gray 2) */
  cplWarmGray: "var(--cpl-warm-gray)",
  /** `--cpl-black` — Neutral */
  cplBlack: "var(--cpl-black)",
  /** `--cpl-white` — Neutral */
  cplWhite: "var(--cpl-white)",
  /** `--cpl-coral` — Secondary accent (PMS 170) */
  cplCoral: "var(--cpl-coral)",
  /** `--cpl-marigold` — Secondary accent (PMS 7406) */
  cplMarigold: "var(--cpl-marigold)",
  /** `--cpl-sky` — Secondary accent (PMS 5503) */
  cplSky: "var(--cpl-sky)",
  /** `--cpl-denim` — Secondary accent (PMS 7459) */
  cplDenim: "var(--cpl-denim)",
  /** `--cpl-ivy` — Secondary accent / green (PMS 762) */
  cplIvy: "var(--cpl-ivy)",
  /** `--cpl-slate-800` — Body ink (strong) */
  cplSlate800: "var(--cpl-slate-800)",
  /** `--cpl-slate-600` — Secondary text */
  cplSlate600: "var(--cpl-slate-600)",
  /** `--cpl-slate-400` — Tertiary / meta text */
  cplSlate400: "var(--cpl-slate-400)",
  /** `--cpl-slate-200` — Border */
  cplSlate200: "var(--cpl-slate-200)",
  /** `--cpl-slate-100` — Hairline / light border */
  cplSlate100: "var(--cpl-slate-100)",
  /** `--cpl-fog` — Sunken / cool neutral surface */
  cplFog: "var(--cpl-fog)",
  /** `--cpl-slate-050` — ⊕ (M2) lightest cool surface tint — the middle step between white and fog */
  cplSlate050: "var(--cpl-slate-050)",
  /** `--cpl-paper` — Page background (⚠ warm cast — not for cool surfaces) */
  cplPaper: "var(--cpl-paper)",
  /** `--cpl-parchment` — Warm paper (derived) */
  cplParchment: "var(--cpl-parchment)",
  /** `--cpl-success` — success */
  cplSuccess: "var(--cpl-success)",
  /** `--cpl-warning` — warning */
  cplWarning: "var(--cpl-warning)",
  /** `--cpl-danger` — danger (soft) — coral, not the validation red */
  cplDanger: "var(--cpl-danger)",
  /** `--cpl-info` — info */
  cplInfo: "var(--cpl-info)",
  /** `--cpl-error` — ⊕ NEW — shared deep-red for text-on-light error/validation states */
  cplError: "var(--cpl-error)",
  /** `--cpl-warning-ink` — ⊕ NEW (M2) — deepened amber for warning text-on-light; marigold is a FILL (~1.65:1 as ink) */
  cplWarningInk: "var(--cpl-warning-ink)",
  /** `--cpl-success-ink` — ⊕ NEW (v0.3) — deepened ivy for success text-on-light (ivy is a FILL, 3.66:1 as ink) */
  cplSuccessInk: "var(--cpl-success-ink)",
  /** `--cpl-info-ink` — ⊕ NEW (v0.3) — deepened denim for info text-on-light (denim is a FILL, 3.29:1 as ink) */
  cplInfoInk: "var(--cpl-info-ink)",
  /** `--cpl-font-serif` — Serif — editorial + studio display */
  cplFontSerif: "var(--cpl-font-serif)",
  /** `--cpl-font-sans` — Sans — workhorse UI + body */
  cplFontSans: "var(--cpl-font-sans)",
  /** `--cpl-font-mono` — Mono — provenance + meta */
  cplFontMono: "var(--cpl-font-mono)",
  /** `--fs-xs` — 12px — captions, fine print */
  fsXs: "var(--fs-xs)",
  /** `--fs-sm` — 14px — meta, labels */
  fsSm: "var(--fs-sm)",
  /** `--fs-base` — 16px — body */
  fsBase: "var(--fs-base)",
  /** `--fs-md` — 18px — lead paragraphs */
  fsMd: "var(--fs-md)",
  /** `--fs-lg` — 22px — subheads */
  fsLg: "var(--fs-lg)",
  /** `--fs-xl` — 28px — h3 */
  fsXl: "var(--fs-xl)",
  /** `--fs-2xl` — 36px — h2 */
  fs2xl: "var(--fs-2xl)",
  /** `--fs-3xl` — 48px — h1 */
  fs3xl: "var(--fs-3xl)",
  /** `--fs-4xl` — 64px — display */
  fs4xl: "var(--fs-4xl)",
  /** `--fs-5xl` — 88px — hero (patron; staff rarely needs it) */
  fs5xl: "var(--fs-5xl)",
  /** `--fw-light` */
  fwLight: "var(--fw-light)",
  /** `--fw-regular` */
  fwRegular: "var(--fw-regular)",
  /** `--fw-medium` */
  fwMedium: "var(--fw-medium)",
  /** `--fw-semibold` */
  fwSemibold: "var(--fw-semibold)",
  /** `--fw-bold` */
  fwBold: "var(--fw-bold)",
  /** `--lh-tight` */
  lhTight: "var(--lh-tight)",
  /** `--lh-snug` */
  lhSnug: "var(--lh-snug)",
  /** `--lh-normal` */
  lhNormal: "var(--lh-normal)",
  /** `--lh-loose` */
  lhLoose: "var(--lh-loose)",
  /** `--ls-tight` */
  lsTight: "var(--ls-tight)",
  /** `--ls-normal` */
  lsNormal: "var(--ls-normal)",
  /** `--ls-wide` */
  lsWide: "var(--ls-wide)",
  /** `--ls-caps` — the uppercase-label tracking every CPL staff surface uses */
  lsCaps: "var(--ls-caps)",
  /** `--space-1` — 0.25rem */
  space1: "var(--space-1)",
  /** `--space-2` — 0.5rem */
  space2: "var(--space-2)",
  /** `--space-3` — 0.75rem */
  space3: "var(--space-3)",
  /** `--space-4` — 1rem */
  space4: "var(--space-4)",
  /** `--space-5` — 1.5rem */
  space5: "var(--space-5)",
  /** `--space-6` — 2rem */
  space6: "var(--space-6)",
  /** `--space-7` — 2.5rem */
  space7: "var(--space-7)",
  /** `--space-8` — 3rem */
  space8: "var(--space-8)",
  /** `--space-10` — 4rem */
  space10: "var(--space-10)",
  /** `--space-12` — 6rem */
  space12: "var(--space-12)",
  /** `--space-16` — 8rem */
  space16: "var(--space-16)",
  /** `--cpl-radius-none` — Dateline's flat-civic doctrine runs this everywhere */
  cplRadiusNone: "var(--cpl-radius-none)",
  /** `--cpl-radius-xs` */
  cplRadiusXs: "var(--cpl-radius-xs)",
  /** `--cpl-radius-sm` */
  cplRadiusSm: "var(--cpl-radius-sm)",
  /** `--cpl-radius-md` */
  cplRadiusMd: "var(--cpl-radius-md)",
  /** `--cpl-radius-lg` */
  cplRadiusLg: "var(--cpl-radius-lg)",
  /** `--cpl-radius-pill` */
  cplRadiusPill: "var(--cpl-radius-pill)",
  /** `--shadow-0` */
  shadow0: "var(--shadow-0)",
  /** `--shadow-1` */
  shadow1: "var(--shadow-1)",
  /** `--shadow-2` */
  shadow2: "var(--shadow-2)",
  /** `--shadow-3` */
  shadow3: "var(--shadow-3)",
  /** `--ease-standard` */
  easeStandard: "var(--ease-standard)",
  /** `--ease-emph` */
  easeEmph: "var(--ease-emph)",
  /** `--dur-fast` */
  durFast: "var(--dur-fast)",
  /** `--dur-base` */
  durBase: "var(--dur-base)",
  /** `--dur-slow` */
  durSlow: "var(--dur-slow)",
  /** `--container-sm` */
  containerSm: "var(--container-sm)",
  /** `--container-md` */
  containerMd: "var(--container-md)",
  /** `--container-lg` */
  containerLg: "var(--container-lg)",
  /** `--container-xl` */
  containerXl: "var(--container-xl)",
  /** `--color-primary` — primary action / brand */
  colorPrimary: "var(--color-primary)",
  /** `--color-primary-hover` — hover / pressed */
  colorPrimaryHover: "var(--color-primary-hover)",
  /** `--color-primary-ink` — deep navy text */
  colorPrimaryInk: "var(--color-primary-ink)",
  /** `--surface` — default surface */
  surface: "var(--surface)",
  /** `--surface-subtle` — ⊕ M2 — inset / secondary surface between canvas and panel (Dateline leaves this unmapped) */
  surfaceSubtle: "var(--surface-subtle)",
  /** `--surface-sunken` — sunken / secondary surface */
  surfaceSunken: "var(--surface-sunken)",
  /** `--surface-raised` — raised (cards) */
  surfaceRaised: "var(--surface-raised)",
  /** `--text-1` — body ink */
  text1: "var(--text-1)",
  /** `--text-2` — secondary text */
  text2: "var(--text-2)",
  /** `--text-3` — tertiary / meta */
  text3: "var(--text-3)",
  /** `--text-on-fill` — ⊕ M2 — foreground on any FILLED control; NOT --surface (a surface used as a foreground breaks under a dark theme) */
  textOnFill: "var(--text-on-fill)",
  /** `--border` — default border */
  border: "var(--border)",
  /** `--border-strong` — strong border */
  borderStrong: "var(--border-strong)",
  /** `--border-hair` — hairline */
  borderHair: "var(--border-hair)",
  /** `--color-success` — success */
  colorSuccess: "var(--color-success)",
  /** `--color-warning` — warning */
  colorWarning: "var(--color-warning)",
  /** `--color-danger` — destructive / validation — binds the ⊕ NEW deep red, not soft coral */
  colorDanger: "var(--color-danger)",
  /** `--color-info` — info */
  colorInfo: "var(--color-info)",
  /** `--color-warning-ink` — ⊕ M2 — warning TEXT-on-light (marigold fails AA as ink) */
  colorWarningInk: "var(--color-warning-ink)",
  /** `--color-success-ink` — ⊕ v0.3 — success TEXT-on-light (ivy fails AA as ink) */
  colorSuccessInk: "var(--color-success-ink)",
  /** `--color-info-ink` — ⊕ v0.3 — info TEXT-on-light (denim fails AA as ink); the Honesty-badge text slot */
  colorInfoInk: "var(--color-info-ink)",
  /** `--color-primary-soft` — primary chip / badge fill */
  colorPrimarySoft: "var(--color-primary-soft)",
  /** `--color-success-soft` — success chip fill */
  colorSuccessSoft: "var(--color-success-soft)",
  /** `--color-warning-soft` — warning chip fill */
  colorWarningSoft: "var(--color-warning-soft)",
  /** `--color-danger-soft` — danger chip fill */
  colorDangerSoft: "var(--color-danger-soft)",
  /** `--color-info-soft` — info chip fill */
  colorInfoSoft: "var(--color-info-soft)",
  /** `--radius` — default control radius (staff) */
  radius: "var(--radius)",
  /** `--radius-lg` — card radius (staff) */
  radiusLg: "var(--radius-lg)",
  /** `--elevation` — default resting elevation */
  elevation: "var(--elevation)",
  /** `--focus-ring` — focus (lifted from SGT --st-focus-ring) */
  focusRing: "var(--focus-ring)",
};

/**
 * The bare custom-property names, for `element.style.setProperty(name, value)`
 * and other places a `var()` wrapper would be wrong.
 */
export const cssVarName = {
  /** `--cpl-navy` — Primary brand blue (PMS 2935, logo) */
  cplNavy: "--cpl-navy",
  /** `--cpl-navy-deep` — Hover / pressed navy */
  cplNavyDeep: "--cpl-navy-deep",
  /** `--cpl-navy-ink` — Headline ink on light */
  cplNavyInk: "--cpl-navy-ink",
  /** `--cpl-butter` — Primary pale yellow (PMS 608) */
  cplButter: "--cpl-butter",
  /** `--cpl-butter-deep` — Hover / pressed butter */
  cplButterDeep: "--cpl-butter-deep",
  /** `--cpl-warm-gray` — Neutral (PMS Warm Gray 2) */
  cplWarmGray: "--cpl-warm-gray",
  /** `--cpl-black` — Neutral */
  cplBlack: "--cpl-black",
  /** `--cpl-white` — Neutral */
  cplWhite: "--cpl-white",
  /** `--cpl-coral` — Secondary accent (PMS 170) */
  cplCoral: "--cpl-coral",
  /** `--cpl-marigold` — Secondary accent (PMS 7406) */
  cplMarigold: "--cpl-marigold",
  /** `--cpl-sky` — Secondary accent (PMS 5503) */
  cplSky: "--cpl-sky",
  /** `--cpl-denim` — Secondary accent (PMS 7459) */
  cplDenim: "--cpl-denim",
  /** `--cpl-ivy` — Secondary accent / green (PMS 762) */
  cplIvy: "--cpl-ivy",
  /** `--cpl-slate-800` — Body ink (strong) */
  cplSlate800: "--cpl-slate-800",
  /** `--cpl-slate-600` — Secondary text */
  cplSlate600: "--cpl-slate-600",
  /** `--cpl-slate-400` — Tertiary / meta text */
  cplSlate400: "--cpl-slate-400",
  /** `--cpl-slate-200` — Border */
  cplSlate200: "--cpl-slate-200",
  /** `--cpl-slate-100` — Hairline / light border */
  cplSlate100: "--cpl-slate-100",
  /** `--cpl-fog` — Sunken / cool neutral surface */
  cplFog: "--cpl-fog",
  /** `--cpl-slate-050` — ⊕ (M2) lightest cool surface tint — the middle step between white and fog */
  cplSlate050: "--cpl-slate-050",
  /** `--cpl-paper` — Page background (⚠ warm cast — not for cool surfaces) */
  cplPaper: "--cpl-paper",
  /** `--cpl-parchment` — Warm paper (derived) */
  cplParchment: "--cpl-parchment",
  /** `--cpl-success` — success */
  cplSuccess: "--cpl-success",
  /** `--cpl-warning` — warning */
  cplWarning: "--cpl-warning",
  /** `--cpl-danger` — danger (soft) — coral, not the validation red */
  cplDanger: "--cpl-danger",
  /** `--cpl-info` — info */
  cplInfo: "--cpl-info",
  /** `--cpl-error` — ⊕ NEW — shared deep-red for text-on-light error/validation states */
  cplError: "--cpl-error",
  /** `--cpl-warning-ink` — ⊕ NEW (M2) — deepened amber for warning text-on-light; marigold is a FILL (~1.65:1 as ink) */
  cplWarningInk: "--cpl-warning-ink",
  /** `--cpl-success-ink` — ⊕ NEW (v0.3) — deepened ivy for success text-on-light (ivy is a FILL, 3.66:1 as ink) */
  cplSuccessInk: "--cpl-success-ink",
  /** `--cpl-info-ink` — ⊕ NEW (v0.3) — deepened denim for info text-on-light (denim is a FILL, 3.29:1 as ink) */
  cplInfoInk: "--cpl-info-ink",
  /** `--cpl-font-serif` — Serif — editorial + studio display */
  cplFontSerif: "--cpl-font-serif",
  /** `--cpl-font-sans` — Sans — workhorse UI + body */
  cplFontSans: "--cpl-font-sans",
  /** `--cpl-font-mono` — Mono — provenance + meta */
  cplFontMono: "--cpl-font-mono",
  /** `--fs-xs` — 12px — captions, fine print */
  fsXs: "--fs-xs",
  /** `--fs-sm` — 14px — meta, labels */
  fsSm: "--fs-sm",
  /** `--fs-base` — 16px — body */
  fsBase: "--fs-base",
  /** `--fs-md` — 18px — lead paragraphs */
  fsMd: "--fs-md",
  /** `--fs-lg` — 22px — subheads */
  fsLg: "--fs-lg",
  /** `--fs-xl` — 28px — h3 */
  fsXl: "--fs-xl",
  /** `--fs-2xl` — 36px — h2 */
  fs2xl: "--fs-2xl",
  /** `--fs-3xl` — 48px — h1 */
  fs3xl: "--fs-3xl",
  /** `--fs-4xl` — 64px — display */
  fs4xl: "--fs-4xl",
  /** `--fs-5xl` — 88px — hero (patron; staff rarely needs it) */
  fs5xl: "--fs-5xl",
  /** `--fw-light` */
  fwLight: "--fw-light",
  /** `--fw-regular` */
  fwRegular: "--fw-regular",
  /** `--fw-medium` */
  fwMedium: "--fw-medium",
  /** `--fw-semibold` */
  fwSemibold: "--fw-semibold",
  /** `--fw-bold` */
  fwBold: "--fw-bold",
  /** `--lh-tight` */
  lhTight: "--lh-tight",
  /** `--lh-snug` */
  lhSnug: "--lh-snug",
  /** `--lh-normal` */
  lhNormal: "--lh-normal",
  /** `--lh-loose` */
  lhLoose: "--lh-loose",
  /** `--ls-tight` */
  lsTight: "--ls-tight",
  /** `--ls-normal` */
  lsNormal: "--ls-normal",
  /** `--ls-wide` */
  lsWide: "--ls-wide",
  /** `--ls-caps` — the uppercase-label tracking every CPL staff surface uses */
  lsCaps: "--ls-caps",
  /** `--space-1` — 0.25rem */
  space1: "--space-1",
  /** `--space-2` — 0.5rem */
  space2: "--space-2",
  /** `--space-3` — 0.75rem */
  space3: "--space-3",
  /** `--space-4` — 1rem */
  space4: "--space-4",
  /** `--space-5` — 1.5rem */
  space5: "--space-5",
  /** `--space-6` — 2rem */
  space6: "--space-6",
  /** `--space-7` — 2.5rem */
  space7: "--space-7",
  /** `--space-8` — 3rem */
  space8: "--space-8",
  /** `--space-10` — 4rem */
  space10: "--space-10",
  /** `--space-12` — 6rem */
  space12: "--space-12",
  /** `--space-16` — 8rem */
  space16: "--space-16",
  /** `--cpl-radius-none` — Dateline's flat-civic doctrine runs this everywhere */
  cplRadiusNone: "--cpl-radius-none",
  /** `--cpl-radius-xs` */
  cplRadiusXs: "--cpl-radius-xs",
  /** `--cpl-radius-sm` */
  cplRadiusSm: "--cpl-radius-sm",
  /** `--cpl-radius-md` */
  cplRadiusMd: "--cpl-radius-md",
  /** `--cpl-radius-lg` */
  cplRadiusLg: "--cpl-radius-lg",
  /** `--cpl-radius-pill` */
  cplRadiusPill: "--cpl-radius-pill",
  /** `--shadow-0` */
  shadow0: "--shadow-0",
  /** `--shadow-1` */
  shadow1: "--shadow-1",
  /** `--shadow-2` */
  shadow2: "--shadow-2",
  /** `--shadow-3` */
  shadow3: "--shadow-3",
  /** `--ease-standard` */
  easeStandard: "--ease-standard",
  /** `--ease-emph` */
  easeEmph: "--ease-emph",
  /** `--dur-fast` */
  durFast: "--dur-fast",
  /** `--dur-base` */
  durBase: "--dur-base",
  /** `--dur-slow` */
  durSlow: "--dur-slow",
  /** `--container-sm` */
  containerSm: "--container-sm",
  /** `--container-md` */
  containerMd: "--container-md",
  /** `--container-lg` */
  containerLg: "--container-lg",
  /** `--container-xl` */
  containerXl: "--container-xl",
  /** `--color-primary` — primary action / brand */
  colorPrimary: "--color-primary",
  /** `--color-primary-hover` — hover / pressed */
  colorPrimaryHover: "--color-primary-hover",
  /** `--color-primary-ink` — deep navy text */
  colorPrimaryInk: "--color-primary-ink",
  /** `--surface` — default surface */
  surface: "--surface",
  /** `--surface-subtle` — ⊕ M2 — inset / secondary surface between canvas and panel (Dateline leaves this unmapped) */
  surfaceSubtle: "--surface-subtle",
  /** `--surface-sunken` — sunken / secondary surface */
  surfaceSunken: "--surface-sunken",
  /** `--surface-raised` — raised (cards) */
  surfaceRaised: "--surface-raised",
  /** `--text-1` — body ink */
  text1: "--text-1",
  /** `--text-2` — secondary text */
  text2: "--text-2",
  /** `--text-3` — tertiary / meta */
  text3: "--text-3",
  /** `--text-on-fill` — ⊕ M2 — foreground on any FILLED control; NOT --surface (a surface used as a foreground breaks under a dark theme) */
  textOnFill: "--text-on-fill",
  /** `--border` — default border */
  border: "--border",
  /** `--border-strong` — strong border */
  borderStrong: "--border-strong",
  /** `--border-hair` — hairline */
  borderHair: "--border-hair",
  /** `--color-success` — success */
  colorSuccess: "--color-success",
  /** `--color-warning` — warning */
  colorWarning: "--color-warning",
  /** `--color-danger` — destructive / validation — binds the ⊕ NEW deep red, not soft coral */
  colorDanger: "--color-danger",
  /** `--color-info` — info */
  colorInfo: "--color-info",
  /** `--color-warning-ink` — ⊕ M2 — warning TEXT-on-light (marigold fails AA as ink) */
  colorWarningInk: "--color-warning-ink",
  /** `--color-success-ink` — ⊕ v0.3 — success TEXT-on-light (ivy fails AA as ink) */
  colorSuccessInk: "--color-success-ink",
  /** `--color-info-ink` — ⊕ v0.3 — info TEXT-on-light (denim fails AA as ink); the Honesty-badge text slot */
  colorInfoInk: "--color-info-ink",
  /** `--color-primary-soft` — primary chip / badge fill */
  colorPrimarySoft: "--color-primary-soft",
  /** `--color-success-soft` — success chip fill */
  colorSuccessSoft: "--color-success-soft",
  /** `--color-warning-soft` — warning chip fill */
  colorWarningSoft: "--color-warning-soft",
  /** `--color-danger-soft` — danger chip fill */
  colorDangerSoft: "--color-danger-soft",
  /** `--color-info-soft` — info chip fill */
  colorInfoSoft: "--color-info-soft",
  /** `--radius` — default control radius (staff) */
  radius: "--radius",
  /** `--radius-lg` — card radius (staff) */
  radiusLg: "--radius-lg",
  /** `--elevation` — default resting elevation */
  elevation: "--elevation",
  /** `--focus-ring` — focus (lifted from SGT --st-focus-ring) */
  focusRing: "--focus-ring",
};

/** The `--cpl-*` base only. */
export const primitives = {
  /** `--cpl-navy` — Primary brand blue (PMS 2935, logo) */
  cplNavy: "#0057B7",
  /** `--cpl-navy-deep` — Hover / pressed navy */
  cplNavyDeep: "#004591",
  /** `--cpl-navy-ink` — Headline ink on light */
  cplNavyInk: "#002A5C",
  /** `--cpl-butter` — Primary pale yellow (PMS 608) */
  cplButter: "#E9E186",
  /** `--cpl-butter-deep` — Hover / pressed butter */
  cplButterDeep: "#C9C25F",
  /** `--cpl-warm-gray` — Neutral (PMS Warm Gray 2) */
  cplWarmGray: "#CBC4BC",
  /** `--cpl-black` — Neutral */
  cplBlack: "#000000",
  /** `--cpl-white` — Neutral */
  cplWhite: "#FFFFFF",
  /** `--cpl-coral` — Secondary accent (PMS 170) */
  cplCoral: "#FF8D7E",
  /** `--cpl-marigold` — Secondary accent (PMS 7406) */
  cplMarigold: "#F1C400",
  /** `--cpl-sky` — Secondary accent (PMS 5503) */
  cplSky: "#94B7BB",
  /** `--cpl-denim` — Secondary accent (PMS 7459) */
  cplDenim: "#4298B5",
  /** `--cpl-ivy` — Secondary accent / green (PMS 762) */
  cplIvy: "#56944F",
  /** `--cpl-slate-800` — Body ink (strong) */
  cplSlate800: "#2B3340",
  /** `--cpl-slate-600` — Secondary text */
  cplSlate600: "#505A69",
  /** `--cpl-slate-400` — Tertiary / meta text */
  cplSlate400: "#8A94A3",
  /** `--cpl-slate-200` — Border */
  cplSlate200: "#C9CFD8",
  /** `--cpl-slate-100` — Hairline / light border */
  cplSlate100: "#E6E9EE",
  /** `--cpl-fog` — Sunken / cool neutral surface */
  cplFog: "#F2F4F7",
  /** `--cpl-slate-050` — ⊕ (M2) lightest cool surface tint — the middle step between white and fog */
  cplSlate050: "#F7F8FA",
  /** `--cpl-paper` — Page background (⚠ warm cast — not for cool surfaces) */
  cplPaper: "#FBFAF6",
  /** `--cpl-parchment` — Warm paper (derived) */
  cplParchment: "#F7F4ED",
  /** `--cpl-success` — success */
  cplSuccess: "#56944F",
  /** `--cpl-warning` — warning */
  cplWarning: "#F1C400",
  /** `--cpl-danger` — danger (soft) — coral, not the validation red */
  cplDanger: "#FF8D7E",
  /** `--cpl-info` — info */
  cplInfo: "#4298B5",
  /** `--cpl-error` — ⊕ NEW — shared deep-red for text-on-light error/validation states */
  cplError: "#9B3030",
  /** `--cpl-warning-ink` — ⊕ NEW (M2) — deepened amber for warning text-on-light; marigold is a FILL (~1.65:1 as ink) */
  cplWarningInk: "#7A5C00",
  /** `--cpl-success-ink` — ⊕ NEW (v0.3) — deepened ivy for success text-on-light (ivy is a FILL, 3.66:1 as ink) */
  cplSuccessInk: "#3F6E39",
  /** `--cpl-info-ink` — ⊕ NEW (v0.3) — deepened denim for info text-on-light (denim is a FILL, 3.29:1 as ink) */
  cplInfoInk: "#2A6580",
  /** `--cpl-font-serif` — Serif — editorial + studio display */
  cplFontSerif: "'Spectral', 'Source Serif Pro', Georgia, serif",
  /** `--cpl-font-sans` — Sans — workhorse UI + body */
  cplFontSans: "'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  /** `--cpl-font-mono` — Mono — provenance + meta */
  cplFontMono: "'JetBrains Mono', 'SF Mono', Consolas, ui-monospace, monospace",
  /** `--fs-xs` — 12px — captions, fine print */
  fsXs: "0.75rem",
  /** `--fs-sm` — 14px — meta, labels */
  fsSm: "0.875rem",
  /** `--fs-base` — 16px — body */
  fsBase: "1rem",
  /** `--fs-md` — 18px — lead paragraphs */
  fsMd: "1.125rem",
  /** `--fs-lg` — 22px — subheads */
  fsLg: "1.375rem",
  /** `--fs-xl` — 28px — h3 */
  fsXl: "1.75rem",
  /** `--fs-2xl` — 36px — h2 */
  fs2xl: "2.25rem",
  /** `--fs-3xl` — 48px — h1 */
  fs3xl: "3rem",
  /** `--fs-4xl` — 64px — display */
  fs4xl: "4rem",
  /** `--fs-5xl` — 88px — hero (patron; staff rarely needs it) */
  fs5xl: "5.5rem",
  /** `--fw-light` */
  fwLight: "300",
  /** `--fw-regular` */
  fwRegular: "400",
  /** `--fw-medium` */
  fwMedium: "500",
  /** `--fw-semibold` */
  fwSemibold: "600",
  /** `--fw-bold` */
  fwBold: "700",
  /** `--lh-tight` */
  lhTight: "1.1",
  /** `--lh-snug` */
  lhSnug: "1.25",
  /** `--lh-normal` */
  lhNormal: "1.5",
  /** `--lh-loose` */
  lhLoose: "1.7",
  /** `--ls-tight` */
  lsTight: "-0.01em",
  /** `--ls-normal` */
  lsNormal: "0",
  /** `--ls-wide` */
  lsWide: "0.04em",
  /** `--ls-caps` — the uppercase-label tracking every CPL staff surface uses */
  lsCaps: "0.12em",
  /** `--space-1` — 0.25rem */
  space1: "4px",
  /** `--space-2` — 0.5rem */
  space2: "8px",
  /** `--space-3` — 0.75rem */
  space3: "12px",
  /** `--space-4` — 1rem */
  space4: "16px",
  /** `--space-5` — 1.5rem */
  space5: "24px",
  /** `--space-6` — 2rem */
  space6: "32px",
  /** `--space-7` — 2.5rem */
  space7: "40px",
  /** `--space-8` — 3rem */
  space8: "48px",
  /** `--space-10` — 4rem */
  space10: "64px",
  /** `--space-12` — 6rem */
  space12: "96px",
  /** `--space-16` — 8rem */
  space16: "128px",
  /** `--cpl-radius-none` — Dateline's flat-civic doctrine runs this everywhere */
  cplRadiusNone: "0",
  /** `--cpl-radius-xs` */
  cplRadiusXs: "2px",
  /** `--cpl-radius-sm` */
  cplRadiusSm: "4px",
  /** `--cpl-radius-md` */
  cplRadiusMd: "6px",
  /** `--cpl-radius-lg` */
  cplRadiusLg: "10px",
  /** `--cpl-radius-pill` */
  cplRadiusPill: "999px",
  /** `--shadow-0` */
  shadow0: "none",
  /** `--shadow-1` */
  shadow1: "0 1px 2px rgba(5,31,63,0.06), 0 1px 1px rgba(5,31,63,0.04)",
  /** `--shadow-2` */
  shadow2: "0 2px 6px rgba(5,31,63,0.08), 0 1px 2px rgba(5,31,63,0.04)",
  /** `--shadow-3` */
  shadow3: "0 6px 18px rgba(5,31,63,0.10), 0 2px 4px rgba(5,31,63,0.06)",
  /** `--ease-standard` */
  easeStandard: "cubic-bezier(0.2,0,0.2,1)",
  /** `--ease-emph` */
  easeEmph: "cubic-bezier(0.2,0,0,1)",
  /** `--dur-fast` */
  durFast: "120ms",
  /** `--dur-base` */
  durBase: "200ms",
  /** `--dur-slow` */
  durSlow: "360ms",
  /** `--container-sm` */
  containerSm: "640px",
  /** `--container-md` */
  containerMd: "960px",
  /** `--container-lg` */
  containerLg: "1200px",
  /** `--container-xl` */
  containerXl: "1440px",
};

/** The intent slots only — what periphery code and @cpl/ui should consume. */
export const semantic = {
  /** `--color-primary` — primary action / brand */
  colorPrimary: "#0057B7",
  /** `--color-primary-hover` — hover / pressed */
  colorPrimaryHover: "#004591",
  /** `--color-primary-ink` — deep navy text */
  colorPrimaryInk: "#002A5C",
  /** `--surface` — default surface */
  surface: "#FFFFFF",
  /** `--surface-subtle` — ⊕ M2 — inset / secondary surface between canvas and panel (Dateline leaves this unmapped) */
  surfaceSubtle: "#F7F8FA",
  /** `--surface-sunken` — sunken / secondary surface */
  surfaceSunken: "#F2F4F7",
  /** `--surface-raised` — raised (cards) */
  surfaceRaised: "#FFFFFF",
  /** `--text-1` — body ink */
  text1: "#2B3340",
  /** `--text-2` — secondary text */
  text2: "#505A69",
  /** `--text-3` — tertiary / meta */
  text3: "#8A94A3",
  /** `--text-on-fill` — ⊕ M2 — foreground on any FILLED control; NOT --surface (a surface used as a foreground breaks under a dark theme) */
  textOnFill: "#FFFFFF",
  /** `--border` — default border */
  border: "#C9CFD8",
  /** `--border-strong` — strong border */
  borderStrong: "#8A94A3",
  /** `--border-hair` — hairline */
  borderHair: "#E6E9EE",
  /** `--color-success` — success */
  colorSuccess: "#56944F",
  /** `--color-warning` — warning */
  colorWarning: "#F1C400",
  /** `--color-danger` — destructive / validation — binds the ⊕ NEW deep red, not soft coral */
  colorDanger: "#9B3030",
  /** `--color-info` — info */
  colorInfo: "#4298B5",
  /** `--color-warning-ink` — ⊕ M2 — warning TEXT-on-light (marigold fails AA as ink) */
  colorWarningInk: "#7A5C00",
  /** `--color-success-ink` — ⊕ v0.3 — success TEXT-on-light (ivy fails AA as ink) */
  colorSuccessInk: "#3F6E39",
  /** `--color-info-ink` — ⊕ v0.3 — info TEXT-on-light (denim fails AA as ink); the Honesty-badge text slot */
  colorInfoInk: "#2A6580",
  /** `--color-primary-soft` — primary chip / badge fill */
  colorPrimarySoft: "#E0EBF6",
  /** `--color-success-soft` — success chip fill */
  colorSuccessSoft: "#EBF2EA",
  /** `--color-warning-soft` — warning chip fill */
  colorWarningSoft: "#FDF8E0",
  /** `--color-danger-soft` — danger chip fill */
  colorDangerSoft: "#F3E6E6",
  /** `--color-info-soft` — info chip fill */
  colorInfoSoft: "#E8F3F6",
  /** `--radius` — default control radius (staff) */
  radius: "4px",
  /** `--radius-lg` — card radius (staff) */
  radiusLg: "8px",
  /** `--elevation` — default resting elevation */
  elevation: "0 1px 2px rgba(5,31,63,0.06), 0 1px 1px rgba(5,31,63,0.04)",
  /** `--focus-ring` — focus (lifted from SGT --st-focus-ring) */
  focusRing: "0 0 0 2px #FFFFFF, 0 0 0 4px #0057B7",
};

export const staffTheme = {
  /** `--color-primary` — primary action / brand */
  colorPrimary: "#0057B7",
  /** `--color-primary-hover` — hover / pressed */
  colorPrimaryHover: "#004591",
  /** `--color-primary-ink` — deep navy text */
  colorPrimaryInk: "#002A5C",
  /** `--surface` — default surface */
  surface: "#FFFFFF",
  /** `--surface-subtle` — ⊕ M2 — inset / secondary surface between canvas and panel (Dateline leaves this unmapped) */
  surfaceSubtle: "#F7F8FA",
  /** `--surface-sunken` — sunken / secondary surface */
  surfaceSunken: "#F2F4F7",
  /** `--surface-raised` — raised (cards) */
  surfaceRaised: "#FFFFFF",
  /** `--text-1` — body ink */
  text1: "#2B3340",
  /** `--text-2` — secondary text */
  text2: "#505A69",
  /** `--text-3` — tertiary / meta */
  text3: "#8A94A3",
  /** `--text-on-fill` — ⊕ M2 — foreground on any FILLED control; NOT --surface (a surface used as a foreground breaks under a dark theme) */
  textOnFill: "#FFFFFF",
  /** `--border` — default border */
  border: "#C9CFD8",
  /** `--border-strong` — strong border */
  borderStrong: "#8A94A3",
  /** `--border-hair` — hairline */
  borderHair: "#E6E9EE",
  /** `--color-success` — success */
  colorSuccess: "#56944F",
  /** `--color-warning` — warning */
  colorWarning: "#F1C400",
  /** `--color-danger` — destructive / validation — binds the ⊕ NEW deep red, not soft coral */
  colorDanger: "#9B3030",
  /** `--color-info` — info */
  colorInfo: "#4298B5",
  /** `--color-warning-ink` — ⊕ M2 — warning TEXT-on-light (marigold fails AA as ink) */
  colorWarningInk: "#7A5C00",
  /** `--color-success-ink` — ⊕ v0.3 — success TEXT-on-light (ivy fails AA as ink) */
  colorSuccessInk: "#3F6E39",
  /** `--color-info-ink` — ⊕ v0.3 — info TEXT-on-light (denim fails AA as ink); the Honesty-badge text slot */
  colorInfoInk: "#2A6580",
  /** `--color-primary-soft` — primary chip / badge fill */
  colorPrimarySoft: "#E0EBF6",
  /** `--color-success-soft` — success chip fill */
  colorSuccessSoft: "#EBF2EA",
  /** `--color-warning-soft` — warning chip fill */
  colorWarningSoft: "#FDF8E0",
  /** `--color-danger-soft` — danger chip fill */
  colorDangerSoft: "#F3E6E6",
  /** `--color-info-soft` — info chip fill */
  colorInfoSoft: "#E8F3F6",
  /** `--radius` — default control radius (staff) */
  radius: "4px",
  /** `--radius-lg` — card radius (staff) */
  radiusLg: "8px",
  /** `--elevation` — default resting elevation */
  elevation: "0 1px 2px rgba(5,31,63,0.06), 0 1px 1px rgba(5,31,63,0.04)",
  /** `--focus-ring` — focus (lifted from SGT --st-focus-ring) */
  focusRing: "0 0 0 2px #FFFFFF, 0 0 0 4px #0057B7",
};

export const themes = { staff: staffTheme };

export default tokens;
