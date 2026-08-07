import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { tokens } from "@cpl/tokens";
const METHOD_LABEL = {
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
const REVIEW_LABEL = {
    reviewable: { inline: "reviewable", block: "curator-reviewable" },
    reviewed: { inline: "✓ reviewed", block: "✓ curator-reviewed" },
    unreviewed: { inline: "unreviewed", block: "not yet reviewed" },
};
const DEFAULT_DISCLAIMER = "Not editorial fact";
const SEPARATOR = " · ";
/** The recipe both densities share — mono, uppercase, tracked. */
const SHARED = {
    fontFamily: tokens.cplFontMono,
    textTransform: "uppercase",
    letterSpacing: tokens.lsWide,
    color: tokens.colorInfoInk,
};
export function HonestyBadge({ density = "inline", provenance, review = "reviewable", edited, original, disclaimer, style, className, }) {
    const block = density === "block";
    const method = METHOD_LABEL[provenance.method] ?? provenance.method;
    const reviewLabel = REVIEW_LABEL[review][block ? "block" : "inline"];
    // `from` is source-aware honesty ("machine-extracted FROM period advertising"). It
    // earns its space in a record-level box; it would crowd a field-level chip.
    const source = block && provenance.from ? `${method} from ${provenance.from}` : method;
    const disclaimerText = disclaimer === true ? DEFAULT_DISCLAIMER : typeof disclaimer === "string" ? disclaimer : null;
    // `unreviewed` gets a touch more attention — still info, never warning. It is an
    // honest statement about where the value stands, not an error.
    const attention = review === "unreviewed";
    const shell = block
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
    const longForm = `${method}${provenance.from ? ` from ${provenance.from}` : ""} — ` +
        `${review === "reviewed" ? "reviewed by a curator" : review === "unreviewed" ? "not yet reviewed by a curator" : "curator-reviewable"}` +
        `${edited ? ", edited by a curator" : ""}` +
        `${disclaimerText ? `. ${disclaimerText}.` : "."}`;
    return (_jsxs("span", { role: "note", "aria-label": longForm, title: longForm, className: className, style: { ...shell, ...style }, children: [_jsx("span", { children: source }), _jsx("span", { "aria-hidden": true, children: SEPARATOR }), _jsx("span", { children: reviewLabel }), edited && (_jsxs(_Fragment, { children: [_jsx("span", { "aria-hidden": true, children: SEPARATOR }), _jsx("span", { title: original ? `Machine value: ${original}` : undefined, children: "edited" })] })), disclaimerText && (_jsxs(_Fragment, { children: [_jsx("span", { "aria-hidden": true, children: SEPARATOR }), _jsx("span", { children: disclaimerText })] }))] }));
}
export default HonestyBadge;
//# sourceMappingURL=index.js.map