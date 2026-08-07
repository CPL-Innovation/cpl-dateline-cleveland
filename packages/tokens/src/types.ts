// @cpl/tokens — authoring types.
//
// The whole package is one authored source (these TS modules) compiled into two
// artifacts (dist/tokens.css + dist/tokens.js). Tokens are authored as CSS custom
// -property names because that is the name that must survive verbatim into SGT's
// existing consumption (tokens-spec §"Naming carries over verbatim"); every other
// shape — camelCase JS keys, var() refs, types — is DERIVED from that name at
// build time, never hand-maintained.

/** A single design token: the value plus a one-line role note. */
export interface Token {
  /**
   * The CSS custom-property value, verbatim. May reference another token as
   * `var(--other)` — the JS mirror resolves those chains to concrete values at
   * build time so JS consumers work without the stylesheet loaded.
   */
  value: string;
  /** One-line role note. Emitted as a trailing comment in the CSS artifact. */
  role?: string;
}

/** A titled group of tokens. Titles become section headers in the CSS artifact. */
export interface TokenSection {
  title: string;
  /** Optional prose emitted above the section in the CSS artifact. */
  note?: string;
  /** CSS custom-property name (`--cpl-navy`) → token. Insertion order is preserved. */
  tokens: Record<string, Token>;
}

/** Flatten sections into one `--name` → Token map, preserving declaration order. */
export function flatten(sections: TokenSection[]): Record<string, Token> {
  const out: Record<string, Token> = {};
  for (const section of sections) {
    for (const [name, token] of Object.entries(section.tokens)) {
      out[name] = token;
    }
  }
  return out;
}
