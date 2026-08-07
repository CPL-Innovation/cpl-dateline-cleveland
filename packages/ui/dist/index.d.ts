import * as React from "react";
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
export declare function HonestyBadge({ density, provenance, review, edited, original, disclaimer, style, className, }: HonestyBadgeProps): React.ReactElement;
export default HonestyBadge;
//# sourceMappingURL=index.d.ts.map