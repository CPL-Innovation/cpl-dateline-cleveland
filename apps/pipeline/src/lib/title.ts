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

export type ResolvedTitle = { title: string | null; titleSource: "human" | "machine" | null };

export function resolveTitle(text: string | null | undefined, displayTitle?: string | null): ResolvedTitle {
  const human = (displayTitle ?? "").trim();
  if (human) return { title: human, titleSource: "human" };
  const head = firstLine(text);
  return headlineShaped(head) ? { title: head, titleSource: "machine" } : { title: null, titleSource: null };
}

// The body to show under the title. When line one WAS the title it must not be
// repeated; when there is no title it is ordinary body text and has to stay.
export function bodyAfterTitle(text: string | null | undefined, titleSource: ResolvedTitle["titleSource"]): string {
  const lines = String(text ?? "").split("\n");
  if (titleSource !== "machine") return lines.join("\n").trim();
  const i = lines.findIndex((l) => l.replace(/\[[^\]]*\]/g, "").trim());
  return lines.slice(i + 1).join("\n").trim();
}
