// @cpl/tokens — the authored token layer, assembled.
//
// This is the SOURCE aggregate. Consumers do not import this file; they import
// the generated artifacts (`@cpl/tokens` → dist/tokens.js, `@cpl/tokens/css` →
// dist/tokens.css). Both are generated from exactly this object by src/build.ts,
// which is the whole point of the package: one source, two outputs, zero
// hand-maintained duplication (tokens-spec §6 criterion 1).

import type { TokenSection } from "./types.ts";
import { primitives } from "./primitives.ts";
import { semantic } from "./semantic.ts";
import { staffTheme } from "./themes/staff.ts";

export interface TokenLayer {
  /** The `--cpl-*` base + scales. Emitted into `:root`. */
  primitives: TokenSection[];
  /** Intent slots. Emitted into `:root` after the primitives they bind to. */
  semantic: TokenSection[];
  /** Named skins. Emitted as `[data-theme="<name>"]` blocks. */
  themes: Record<string, TokenSection[]>;
}

export const layer: TokenLayer = {
  primitives,
  semantic,
  themes: { staff: staffTheme },
};

export { primitives, semantic, staffTheme };
export type { Token, TokenSection } from "./types.ts";
