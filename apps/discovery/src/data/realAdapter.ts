// Adapt the real SLICE-01 content_objects (exported to real.generated.json) into
// the discovery Dataset shape. This is the "REAL DATA" toggle.
//
// Honesty is the whole point of showing this: SLICE-01 produced typed, ordered
// transcriptions but NO entity/topic/event enrichment. So:
//   • The Index's TYPE and PICTURES & ADS facets are real (derived from object_class).
//   • TOPIC and NAME facets are shown but empty, with a note saying why.
//   • The Calendar is unavailable (no events were extracted) → honest empty state.
//   • Non-publication objects (filler slugs, manuscript annotations) are dropped
//     per Principle 15 — captured in the pipeline, kept out of the patron index.

import type {
  Dataset,
  FacetGroup,
  IndexItem,
  FacetValue,
} from '../lib/types';
import raw from './real.generated.json';

interface RawObject {
  id: string;
  issueId: string;
  page: number;
  seq: number;
  objectClass: string;
  role: string | null;
  text: string;
  bbox: number[] | null;
  isPublicationContent: boolean;
  occurrences: number;
  confidence: number | null;
  runId: string;
  model: string;
}

interface RawPayload {
  generatedAt: string | null;
  issue: { id: string; model: string; runId: string } | null;
  pages: number[];
  objects: RawObject[];
}

const payload = raw as RawPayload;

// First page_record in the issue → printed page 1. (7618→P.1 … 7621→P.4)
const firstRecord = payload.pages.length ? Math.min(...payload.pages) : 0;
const printedPage = (rec: number) => rec - firstRecord + 1;

const TYPE_LABELS: Record<string, string> = {
  'y-article': 'Article',
  'y-ad': 'Advertisement',
  'y-photo': 'Photograph',
  'y-cartoon': 'Cartoon',
  'y-map': 'Map',
  'y-legal': 'Legal notice',
  'y-classified': 'Classified',
  'y-coupon': 'Coupon',
  'y-masthead': 'Masthead',
  'y-listing': 'Listing',
};

const VIS_LABELS: Record<string, string> = {
  'v-all': 'All illustrations',
  'v-photo': 'Photos',
  'v-cartoon': 'Cartoons',
  'v-ad': 'Display ads',
  'v-map': 'Maps',
};

/** Map a real object_class (+ role) to a discovery type/visual classification. */
function classify(o: RawObject): { type: string; vis: string | null; isVisual: boolean } {
  const role = (o.role || '').toLowerCase();
  switch (o.objectClass) {
    case 'article':
      return { type: 'y-article', vis: null, isVisual: false };
    case 'advertisement':
      return { type: 'y-ad', vis: 'v-ad', isVisual: true };
    case 'illustration': {
      if (role.includes('cartoon')) return { type: 'y-cartoon', vis: 'v-cartoon', isVisual: true };
      if (role.includes('map')) return { type: 'y-map', vis: 'v-map', isVisual: true };
      return { type: 'y-photo', vis: 'v-photo', isVisual: true };
    }
    case 'legal_notice':
      return { type: 'y-legal', vis: null, isVisual: false };
    case 'classified_section':
    case 'classified container (banner + categories)':
      return { type: 'y-classified', vis: null, isVisual: false };
    case 'coupon':
      return { type: 'y-coupon', vis: null, isVisual: false };
    case 'masthead':
      return { type: 'y-masthead', vis: null, isVisual: false };
    default:
      return { type: 'y-article', vis: null, isVisual: false };
  }
}

function firstLine(text: string): string {
  for (const line of text.split('\n')) {
    const t = line.replace(/\[[^\]]*\]/g, '').trim();
    if (t) return t;
  }
  return text.trim().slice(0, 80);
}

function toTitle(o: RawObject): string {
  const head = firstLine(o.text);
  // Headlines often arrive ALL-CAPS; present them as printed but Cap-cased is
  // gentler for a title. Keep short caps runs (acronyms) intact-ish by only
  // softening long all-caps strings.
  if (head.length > 4 && head === head.toUpperCase()) {
    return head
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return head;
}

function snippetOf(o: RawObject): string {
  const lines = o.text.split('\n').map((l) => l.trim()).filter(Boolean);
  const rest = lines.slice(1).join(' ') || lines[0] || '';
  return rest.length > 180 ? rest.slice(0, 177).trimEnd() + '…' : rest;
}

const WALL_HEIGHTS: Record<string, string> = {
  'y-photo': '200px',
  'y-cartoon': '220px',
  'y-ad': '240px',
  'y-map': '180px',
};

function toItem(o: RawObject): IndexItem {
  const { type, vis, isVisual } = classify(o);
  const stamp = `CLEVELAND · FEB 1 1924 · P.${printedPage(o.page)}`;
  const typeLabel = (TYPE_LABELS[type] || 'Object').toUpperCase();
  const roleNote = o.role ? o.role : o.objectClass.replace(/_/g, ' ');
  return {
    id: o.id,
    typeLabel,
    type,
    vis,
    isVisual,
    wallHeight: WALL_HEIGHTS[type] || '200px',
    stamp,
    title: toTitle(o),
    snippet: snippetOf(o),
    topics: [],
    names: [],
    cropNote: isVisual ? `${typeLabel} — ${roleNote.toUpperCase()}` : '',
    caption: firstLine(o.text),
    credit: `SOURCE: BROOKLYN NEWS · FEB 1 1924 · ${o.issueId} · P.${printedPage(o.page)} · SEQ ${o.seq}`,
    clipNote: roleNote,
    transcript: o.text,
  };
}

const items: IndexItem[] = payload.objects
  .filter((o) => o.isPublicationContent)
  .map(toItem);

// Build TYPE + VISUAL facets from the real distribution.
function countBy(keyFn: (i: IndexItem) => string | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = keyFn(it);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

const typeCounts = countBy((i) => i.type);
const TYPE_ORDER = ['y-article', 'y-ad', 'y-photo', 'y-cartoon', 'y-map', 'y-legal', 'y-classified', 'y-coupon', 'y-masthead', 'y-listing'];
const typeValues: FacetValue[] = TYPE_ORDER.filter((t) => typeCounts.has(t)).map((t) => ({
  id: t,
  label: TYPE_LABELS[t] || t,
  count: typeCounts.get(t)!,
}));

const visCounts = countBy((i) => i.vis);
const visualCount = items.filter((i) => i.isVisual).length;
const VIS_ORDER = ['v-photo', 'v-cartoon', 'v-ad', 'v-map'];
const visValues: FacetValue[] = [
  { id: 'v-all', label: VIS_LABELS['v-all'], count: visualCount },
  ...VIS_ORDER.filter((v) => visCounts.has(v)).map((v) => ({
    id: v,
    label: VIS_LABELS[v] || v,
    count: visCounts.get(v)!,
  })),
];

const facetDefs: FacetGroup[] = [
  {
    key: 'topic',
    name: 'TOPIC',
    note: 'MULTI',
    values: [],
    emptyNote: 'No topics extracted yet — subject enrichment is beyond SLICE-01.',
  },
  {
    key: 'name',
    name: 'NAME',
    note: 'PEOPLE · PLACES · ORGS',
    values: [],
    emptyNote: 'No entities extracted yet — name/place enrichment is beyond SLICE-01.',
  },
  { key: 'type', name: 'TYPE', note: 'MULTI', values: typeValues },
  { key: 'visual', name: 'PICTURES & ADS', note: 'VISUAL MODE', values: visValues },
];

export const realDataset: Dataset = {
  mode: 'real',
  weeks: [{ year: '1924', sub: 'FEB 1', hasData: false }],
  sections: [],
  eventCount: 0,
  calendarAvailable: false,
  calendarNote:
    'The calendar assembles from machine-extracted EVENTS. SLICE-01 transcribed and typed this issue but did not run event extraction — so there is nothing to place on the timeline yet. Switch to MOCK DATA to see the intended calendar.',
  indexItems: items,
  facetDefs,
  indexHero: {
    kicker: 'THE INDEX · REAL SLICE-01 DATA',
    headline: 'The Brooklyn News, as the pipeline actually read it.',
    deck: `${items.length} typed content objects from one issue (Feb 1 1924, pages 1–${payload.pages.length}), transcribed by the SLICE-01 VLM pass. Type and picture facets are real; topic and name facets await enrichment.`,
  },
  countsAreMock: false,
};

export const realMeta = {
  model: payload.issue?.model ?? 'unknown',
  runId: payload.issue?.runId ?? 'unknown',
  pageCount: payload.pages.length,
  objectCount: items.length,
};
