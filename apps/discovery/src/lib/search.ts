// Full-text search over the loaded index.
//
// Deliberately CLIENT-SIDE. The whole dataset is already in memory (the patron app
// fetches it once), so search is instant, works identically in MOCK and REAL mode,
// and needs no extra endpoint. That holds for a pilot-sized corpus; when the index
// outgrows one payload this becomes a query against Postgres — the SearchHit shape
// is what the UI depends on, not where the matching happened.
//
// This is a LITERAL substring match over transcribed text, not semantic search.
// The embedding column exists in the schema but nothing populates it yet, so
// promising "meaning" here would be a lie the pipeline can't back.
import type { Dataset, IndexItem } from './types';

export interface Excerpt {
  before: string;
  hit: string;
  after: string;
}

export interface SearchHit {
  item: IndexItem;
  score: number;
  /** human-readable list of the fields that matched, for the result row */
  fields: string[];
  /** keyword-in-context from the transcript, when the match is in the body */
  excerpt: Excerpt | null;
}

/** Split a query into terms, honouring "quoted phrases". */
export function queryTerms(q: string): string[] {
  const out: string[] = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q)) !== null) {
    const t = (m[1] ?? m[2] ?? '').trim().toLowerCase();
    if (t) out.push(t);
  }
  return out;
}

function labelIndex(dataset: Dataset): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of dataset.facetDefs) for (const v of g.values) m.set(v.id, v.label);
  return m;
}

// Keyword-in-context around the first hit, clipped to word boundaries so an
// excerpt never starts or ends mid-word.
function excerptFor(text: string, term: string, pad = 90): Excerpt | null {
  const i = text.toLowerCase().indexOf(term);
  if (i < 0) return null;
  let s = Math.max(0, i - pad);
  let e = Math.min(text.length, i + term.length + pad);
  if (s > 0) { const sp = text.indexOf(' ', s); if (sp > -1 && sp < i) s = sp + 1; }
  if (e < text.length) { const sp = text.lastIndexOf(' ', e); if (sp > i + term.length) e = sp; }
  return {
    before: (s > 0 ? '… ' : '') + text.slice(s, i).replace(/\s+/g, ' '),
    hit: text.slice(i, i + term.length),
    after: text.slice(i + term.length, e).replace(/\s+/g, ' ') + (e < text.length ? ' …' : ''),
  };
}

/**
 * Rank items against a query. Every term must appear somewhere in the item
 * (AND, not OR) — with a handful of results on screen, a query that returns
 * everything loosely related is worse than one that returns the right few.
 */
export function searchItems(dataset: Dataset, query: string): SearchHit[] {
  const terms = queryTerms(query);
  if (!terms.length || query.trim().length < 2) return [];
  const labels = labelIndex(dataset);

  const hits: SearchHit[] = [];
  for (const item of dataset.indexItems) {
    const tagText = [...item.topics, ...item.names]
      .map((id) => labels.get(id) ?? '')
      .filter(Boolean)
      .join(' ');
    // weighted fields — a title match should outrank a passing mention in the body
    const fields: Array<{ name: string; text: string; weight: number }> = [
      // An untitled object simply has no title field to match — it is not searched
      // against an invented one, and its body still carries it into results.
      { name: 'title', text: item.title ?? '', weight: 10 },
      { name: 'summary', text: item.snippet, weight: 6 },
      { name: 'subject', text: tagText, weight: 5 },
      { name: 'type', text: item.typeLabel, weight: 2 },
      { name: 'date', text: item.stamp, weight: 2 },
      { name: 'text', text: item.transcript, weight: 3 },
    ];

    let score = 0;
    const matched = new Set<string>();
    let allTermsPresent = true;

    for (const term of terms) {
      let termScore = 0;
      for (const f of fields) {
        if (!f.text) continue;
        const hay = f.text.toLowerCase();
        const at = hay.indexOf(term);
        if (at < 0) continue;
        matched.add(f.name);
        // a hit at the very start of a field is a stronger signal than one buried in it
        termScore = Math.max(termScore, f.weight + (at === 0 ? 3 : 0));
      }
      if (!termScore) { allTermsPresent = false; break; }
      score += termScore;
    }
    if (!allTermsPresent) continue;

    // excerpt from the body for the first term that actually appears there
    let excerpt: Excerpt | null = null;
    for (const term of terms) {
      excerpt = excerptFor(item.transcript || '', term);
      if (excerpt) break;
    }
    hits.push({ item, score, fields: [...matched], excerpt });
  }

  // Ties break on title; untitled objects sort after titled ones rather than crash.
  return hits.sort((a, b) => b.score - a.score || (a.item.title ?? '￿').localeCompare(b.item.title ?? '￿'));
}
