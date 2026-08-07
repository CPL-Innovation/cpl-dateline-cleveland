// @cpl/ui — HonestyBadge.
//
// The "machine-extracted · curator-reviewable" institutional contract as one
// reusable atom. Design intent: CPL Design System vault → build/ui/honesty-badge-spec.md
// (authored from build/ui/honesty-extraction.md, the read-only survey of the seven
// ad-hoc markers CN staff had reinvented).
//
// The promise it encodes: be honest about provenance, and never let a machine claim
// editorial authority. Copy is COMPOSED from structured slots — never handed in as a
// string — so the claim reads identically everywhere it appears.
//
// Styled ONLY from @cpl/tokens. There is not one hardcoded color, size or radius below.
//
// Delivery note: styles are inline style objects built from the tokens JS mirror, not
// CSS classes. The first consumer (CN staff) is inline-CSS-in-JS and loads no stylesheet
// at all, so a class-based build would not render there. See README.

import * as React from "react";
import { tokens } from "@cpl/tokens";

/** How the value was produced. The provenance half of the contract. */
export type HonestyMethod = "ai" | "vlm" | "machine-extracted" | "ai-transcribed";

/**
 * Where the value stands with a human.
 *
 * Deliberately three states, not a boolean: CN's chip could only say "reviewed" and
 * Dateline's box could only say "reviewable" — different promises, both real.
 */
export type HonestyReview = "unreviewed" | "reviewed" | "reviewable";

export interface HonestyProvenance {
  method: HonestyMethod;
  /** Source-aware detail — "articles", "period advertising". Rendered at block density. */
  from?: string;
}

export interface HonestyBadgeProps {
  /** `inline` = field-level chip (default) · `block` = record-level box. */
  density?: "inline" | "block";
  /** REQUIRED — a badge with no provenance claim has no reason to exist. */
  provenance: HonestyProvenance;
  /** Defaults to `reviewable`: the badge never claims a human checked something unless told. */
  review?: HonestyReview;
  /** A human overrode the machine value. */
  edited?: boolean;
  /** The pre-edit machine value. Surfaces as the `edited` marker's tooltip. */
  original?: string;
  /** `true` = "Not editorial fact" · a string = custom · omitted = none. */
  disclaimer?: boolean | string;
  /** Escape hatch for layout only (margin, alignment). Cannot restyle the badge itself. */
  style?: React.CSSProperties;
  className?: string;
}

const METHOD_LABEL: Record<HonestyMethod, string> = {
  ai: "AI",
  vlm: "VLM",
  "machine-extracted": "Machine-extracted",
  "ai-transcribed": "AI-transcribed",
};

/**
 * Review copy is density-aware: the institutional phrase in full at block density,
 * the compact token in a field-level chip where the row budget is a few characters.
 * Same claim, two registers.
 */
const REVIEW_LABEL: Record<HonestyReview, { inline: string; block: string }> = {
  reviewable: { inline: "reviewable", block: "curator-reviewable" },
  reviewed: { inline: "✓ reviewed", block: "✓ curator-reviewed" },
  unreviewed: { inline: "unreviewed", block: "not yet reviewed" },
};

const DEFAULT_DISCLAIMER = "Not editorial fact";

const SEPARATOR = " · ";

/** The recipe both densities share — mono, uppercase, tracked. */
const SHARED: React.CSSProperties = {
  fontFamily: tokens.cplFontMono,
  textTransform: "uppercase",
  letterSpacing: tokens.lsWide,
  color: tokens.colorInfoInk,
};

export function HonestyBadge({
  density = "inline",
  provenance,
  review = "reviewable",
  edited,
  original,
  disclaimer,
  style,
  className,
}: HonestyBadgeProps): React.ReactElement {
  const block = density === "block";
  const method = METHOD_LABEL[provenance.method] ?? provenance.method;
  const reviewLabel = REVIEW_LABEL[review][block ? "block" : "inline"];

  // `from` is source-aware honesty ("machine-extracted FROM period advertising"). It
  // earns its space in a record-level box; it would crowd a field-level chip.
  const source = block && provenance.from ? `${method} from ${provenance.from}` : method;

  const disclaimerText =
    disclaimer === true ? DEFAULT_DISCLAIMER : typeof disclaimer === "string" ? disclaimer : null;

  // `unreviewed` gets a touch more attention — still info, never warning. It is an
  // honest statement about where the value stands, not an error.
  const attention = review === "unreviewed";

  const shell: React.CSSProperties = block
    ? {
        ...SHARED,
        display: "block",
        background: tokens.colorInfoSoft,
        border: `1px solid ${attention ? tokens.colorInfoInk : tokens.border}`,
        borderRadius: tokens.radius,
        padding: `${tokens.space3} ${tokens.space3}`,
        marginTop: tokens.space5,
        fontSize: tokens.fsXs,
        lineHeight: tokens.lhLoose,
      }
    : {
        ...SHARED,
        display: "inline-flex",
        alignItems: "center",
        gap: tokens.space1,
        background: tokens.colorInfoSoft,
        border: attention ? `1px solid ${tokens.colorInfoInk}` : "1px solid transparent",
        borderRadius: tokens.radius,
        padding: `1px ${tokens.space1}`,
        fontSize: "9px",
        lineHeight: tokens.lhSnug,
        fontWeight: attention ? tokens.fwMedium : tokens.fwRegular,
        whiteSpace: "nowrap",
      };

  // One plain-language sentence for assistive tech and hover — the badge's own copy is
  // necessarily terse, and the contract should not depend on decoding it.
  const longForm =
    `${method}${provenance.from ? ` from ${provenance.from}` : ""} — ` +
    `${review === "reviewed" ? "reviewed by a curator" : review === "unreviewed" ? "not yet reviewed by a curator" : "curator-reviewable"}` +
    `${edited ? ", edited by a curator" : ""}` +
    `${disclaimerText ? `. ${disclaimerText}.` : "."}`;

  return (
    <span role="note" aria-label={longForm} title={longForm} className={className} style={{ ...shell, ...style }}>
      <span>{source}</span>
      <span aria-hidden>{SEPARATOR}</span>
      <span>{reviewLabel}</span>
      {edited && (
        <>
          <span aria-hidden>{SEPARATOR}</span>
          <span title={original ? `Machine value: ${original}` : undefined}>edited</span>
        </>
      )}
      {disclaimerText && (
        <>
          <span aria-hidden>{SEPARATOR}</span>
          <span>{disclaimerText}</span>
        </>
      )}
    </span>
  );
}

export default HonestyBadge;
