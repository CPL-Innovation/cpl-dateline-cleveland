// @cpl/tokens — THE STAFF SKIN (`[data-theme="staff"]`).
//
// tokens-spec §5. The one theme in M1 scope: navy-cool, moderate radius, soft
// elevation. All three staff workbenches read as one CPL system through this.
// It is what CN staff re-skins TO — its warm/teal STAFF_TOKENS point here and
// the screen renders navy-cool without a single component changing.
//
// In M1 the staff skin IS the default binding of the semantic tier, so this
// derives from semantic.ts rather than restating it — two hand-maintained copies
// of one palette is the exact failure the shared package exists to end. The
// `staffOverrides` slot below is where a value DIVERGES from the default once a
// second theme lands and forces the split.
//
// Patron themes (CN patron, SGT hifi) are explicitly out of M1 scope.

import type { Token, TokenSection } from "../types.ts";
import { flatten } from "../types.ts";
import { semantic } from "../semantic.ts";

/**
 * Staff-specific divergences from the semantic defaults.
 *
 * Empty in M1 — by design, not by omission. Staff is currently the only theme,
 * so the defaults ARE the staff skin. When a second theme arrives, the slots
 * that are genuinely staff-flavoured move here and semantic.ts keeps only what
 * is theme-neutral.
 */
export const staffOverrides: Record<string, Token> = {};

/** The full `[data-theme="staff"]` block: semantic defaults + any divergences. */
export const staffTheme: TokenSection[] = [
  {
    title: "Staff skin — navy-cool",
    note: "Primary: navy family · neutrals: cool slate ramp · surfaces: white / fog · status: ivy / marigold / deep-error-red / denim.",
    tokens: { ...flatten(semantic), ...staffOverrides },
  },
];
