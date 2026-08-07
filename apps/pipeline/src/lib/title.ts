// ── display titles (SLICE-09e) ───────────────────────────────────────────────
// Both surfaces used to take an object's first line and render it as a headline.
// Most of the time that is right — this paper sets its headlines on line one. But
// a masthead, a stockholder roster, an unlabelled photo and a filler slug have no
// headline at all, and promoting their first sentence to one both looks wrong and
// asserts something the source does not say.
//
// So the title is RESOLVED here, once, and both apps render what they are given:
//
//   1. display_title  — set by a curator. Always wins.
//   2. the first line — but only when it is actually shaped like a headline.
//   3. null           — this object has no title. Say nothing; show the body.
//
// Measured against the 283-object live corpus: 26 (9%) resolve to null, and every
// one of them is a masthead, ad fragment, illustration, annotation, roster,
// coupon or filler. No genuine article headline is lost.

// Period-terminated abbreviations are everywhere in 1920s headlines — "SOUTH HILLS
// BLVD.", "HOLDEN MOTOR CO.", "I. O. O. F." — so a trailing period cannot on its
// own mean "this is a sentence".
const ABBREV = /^(co|inc|rd|ave|blvd|st|jr|sr|dr|mr|mrs|no|vol|ltd)$/i;

export function firstLine(text: string | null | undefined): string {
  for (const line of String(text ?? "").split("\n")) {
    const t = line.replace(/\[[^\]]*\]/g, "").trim();
    if (t) return t;
  }
  return "";
}

// Is this line shaped like a headline rather than the opening of a body?
export function headlineShaped(s: string): boolean {
  if (!s) return false;
  const words = s.split(/\s+/).filter(Boolean);
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (!letters) return false; // "$450", "43" — a fragment, not a title

  // Set in caps: the era's headline typography. Trust it, and allow more length,
  // because display ads shout in full sentences of capitals.
  const caps = letters.replace(/[^A-Z]/g, "").length / letters.length;
  if (caps >= 0.8) return words.length <= 16 && s.length <= 120;

  // Otherwise it must earn it: short, unpunctuated, and title-cased.
  if (words.length > 12 || s.length > 110) return false;
  if (/[,;:]$/.test(s)) return false;
  if (s.endsWith(".") && words.length > 4) {
    const last = words[words.length - 1].replace(/\./g, "");
    if (!(ABBREV.test(last) || last.length <= 2)) return false; // a real sentence
  }
  // Title Case Reads As A Title; sentence case reads as prose. Judge on the words
  // that carry it — "of", "the", "and" are lowercase in both.
  const big = words.filter((w) => w.replace(/[^A-Za-z]/g, "").length >= 4);
  if (!big.length) return false;
  return big.filter((w) => /^[^A-Za-z]*[A-Z]/.test(w)).length / big.length >= 0.6;
}

/**
 * `titleSource` names WHO WROTE THE WORDS, not who approved them (SLICE-13b):
 *
 *   human    a person typed or edited this title.
 *   machine  a machine produced these words — either the first-line rule below,
 *            or a model that drafted the title and had it kept verbatim. Which
 *            of the two, and which model, is `titleModel`.
 *   null     this object has no title.
 *
 * A curator keeping a drafted title has APPROVED it; approval lives in
 * `curation_status`. Reading it here as authorship credited Haiku's words to a
 * person, which is exactly the confusion this contract now refuses.
 */
export type ResolvedTitle = {
  title: string | null;
  titleSource: "human" | "machine" | null;
  /** the model that drafted the stored title; null for the first-line rule and
   *  for anything a person wrote */
  titleModel: string | null;
};

export function resolveTitle(
  text: string | null | undefined,
  displayTitle?: string | null,
  displayTitleModel?: string | null,
): ResolvedTitle {
  const stored = (displayTitle ?? "").trim();
  const model = (displayTitleModel ?? "").trim() || null;
  if (stored) {
    return { title: stored, titleSource: model ? "machine" : "human", titleModel: model };
  }
  const head = firstLine(text);
  return headlineShaped(head)
    ? { title: head, titleSource: "machine", titleModel: null }
    : { title: null, titleSource: null, titleModel: null };
}

/**
 * The body to show under the title. Line one is dropped only when line one IS
 * the title — decided by comparing the words, not by reading a provenance flag.
 * A model-drafted title is `machine` too, and it is rarely the first line; the
 * old titleSource check silently ate the opening sentence of every object that
 * had one.
 */
export function bodyAfterTitle(text: string | null | undefined, title: string | null): string {
  const lines = String(text ?? "").split("\n");
  if (!title) return lines.join("\n").trim();
  const i = lines.findIndex((l) => l.replace(/\[[^\]]*\]/g, "").trim());
  if (i < 0) return lines.join("\n").trim();
  const head = lines[i].replace(/\[[^\]]*\]/g, "").trim();
  const same = head.replace(/\s+/g, " ").toLowerCase() === title.replace(/\s+/g, " ").toLowerCase();
  return (same ? lines.slice(i + 1) : lines).join("\n").trim();
}
