// Adapt the real content_objects into the discovery Dataset shape (the "REAL
// DATA" toggle). SLICE-08: the data is now fetched LIVE from the Postgres store
// via the ingestion service (/api/discovery) and can span MULTIPLE issues — each
// object carries its own printed page / date / serial so stamps read correctly.
// Falls back to the committed real.generated.json when the service is offline.
//
// TYPE + PICTURES & ADS facets come from object_class; TOPIC + NAME facets from
// machine-extracted topics + recurring entities; the Calendar from extracted
// EVENTS. Non-publication objects are dropped per Principle 15.

import type {
  Dataset,
  FacetGroup,
  IndexItem,
  FacetValue,
  CalendarEvent,
  CalendarSection,
  Fact,
} from '../lib/types';
import { buildSections, groupFor } from '../lib/calendar';
import raw from './real.generated.json';

interface RawTopicRef { id: string; label: string; confidence: string }
interface RawNameRef { id: string; label: string; type: string }

interface RawObject {
  id: string;
  issueId: string;
  page: number;
  printedPage?: number; // live payload: server-computed printed page (multi-issue safe)
  dateLabel?: string;   // live payload: per-object date, e.g. "Jan 4 1924"
  serial?: string;      // live payload: per-object serial, e.g. "The Brooklyn News"
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
  enrichmentTier?: string | null;
  articleType?: string | null;
  isAdvertorial?: boolean | null;
  summary?: string | null;
  contextHint?: string | null;
  eventType?: string | null;
  tags?: string[];
  topics?: RawTopicRef[];
  names?: RawNameRef[];
  pageImage?: string | null;
  iiifId?: string | null;
}

interface RawEvent {
  id: string;
  title: string;
  eventType: string;
  venue: string | null;
  startText: string | null;
  recurrenceText: string | null;
  performers: string[];
  priceText: string | null;
  confidence: string;
  sourcePage: number;
  printedSourcePage?: number;
  dateLabel?: string;
  serial?: string;
  sourceClass: string;
  sourceSummary: string | null;
  pageImage?: string | null;
  iiifId?: string | null;
}

interface RawPayload {
  generatedAt: string | null;
  enriched?: boolean;
  multiIssue?: boolean;
  issueCount?: number;
  pageCount?: number;
  issue: { id: string; model: string; runId: string } | null;
  pages: number[];
  objects: RawObject[];
  topicFacet?: FacetValue[];
  nameFacet?: Array<FacetValue & { type: string }>;
  events?: RawEvent[];
}

export interface RealMeta {
  model: string;
  runId: string;
  pageCount: number;
  objectCount: number;
  enriched: boolean;
  topicCount: number;
  nameCount: number;
  eventCount: number;
  multiIssue: boolean;
  issueCount: number;
}

// ── pure, payload-independent helpers ────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  'y-article': 'Article', 'y-ad': 'Advertisement', 'y-photo': 'Photograph', 'y-cartoon': 'Cartoon',
  'y-map': 'Map', 'y-legal': 'Legal notice', 'y-classified': 'Classified', 'y-coupon': 'Coupon',
  'y-masthead': 'Masthead', 'y-listing': 'Listing',
};
const VIS_LABELS: Record<string, string> = {
  'v-all': 'All illustrations', 'v-photo': 'Photos', 'v-cartoon': 'Cartoons', 'v-ad': 'Display ads', 'v-map': 'Maps',
};
const WALL_HEIGHTS: Record<string, string> = {
  'y-photo': '200px', 'y-cartoon': '220px', 'y-ad': '240px', 'y-map': '180px',
};
const TYPE_ORDER = ['y-article', 'y-ad', 'y-photo', 'y-cartoon', 'y-map', 'y-legal', 'y-classified', 'y-coupon', 'y-masthead', 'y-listing'];
const VIS_ORDER = ['v-photo', 'v-cartoon', 'v-ad', 'v-map'];

function classify(o: RawObject): { type: string; vis: string | null; isVisual: boolean } {
  const role = (o.role || '').toLowerCase();
  switch (o.objectClass) {
    case 'article': return { type: 'y-article', vis: null, isVisual: false };
    case 'advertisement': return { type: 'y-ad', vis: 'v-ad', isVisual: true };
    case 'illustration': {
      if (role.includes('cartoon')) return { type: 'y-cartoon', vis: 'v-cartoon', isVisual: true };
      if (role.includes('map')) return { type: 'y-map', vis: 'v-map', isVisual: true };
      return { type: 'y-photo', vis: 'v-photo', isVisual: true };
    }
    case 'legal_notice': return { type: 'y-legal', vis: null, isVisual: false };
    case 'classified_section':
    case 'classified container (banner + categories)': return { type: 'y-classified', vis: null, isVisual: false };
    case 'coupon': return { type: 'y-coupon', vis: null, isVisual: false };
    case 'masthead': return { type: 'y-masthead', vis: null, isVisual: false };
    default: return { type: 'y-article', vis: null, isVisual: false };
  }
}
function firstLine(text: string): string {
  for (const line of text.split('\n')) { const t = line.replace(/\[[^\]]*\]/g, '').trim(); if (t) return t; }
  return text.trim().slice(0, 80);
}
function toTitle(o: RawObject): string {
  const head = firstLine(o.text);
  if (head.length > 4 && head === head.toUpperCase()) return head.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return head;
}
function snippetOf(o: RawObject): string {
  const lines = o.text.split('\n').map((l) => l.trim()).filter(Boolean);
  const rest = lines.slice(1).join(' ') || lines[0] || '';
  return rest.length > 180 ? rest.slice(0, 177).trimEnd() + '…' : rest;
}
function sourceKindOf(sourceClass: string): CalendarEvent['sourceKind'] {
  if (sourceClass === 'advertisement') return 'ad';
  if (sourceClass === 'article') return 'article';
  if (sourceClass === 'listing' || sourceClass === 'classified_section') return 'listing';
  return 'mixed';
}

// ── the builder — turns a payload (live API or committed JSON) into a Dataset ──
export function buildRealDataset(payload: RawPayload): { dataset: Dataset; meta: RealMeta } {
  const enriched = payload.enriched === true;
  const topicFacetValues: FacetValue[] = payload.topicFacet ?? [];
  const nameFacetValues: Array<FacetValue & { type: string }> = payload.nameFacet ?? [];
  const facetedNameIds = new Set(nameFacetValues.map((n) => n.id));
  const multiIssue = payload.multiIssue === true || (payload.issueCount ?? 1) > 1;

  // per-object date/serial/printed-page, with committed-JSON fallbacks.
  const firstRecord = payload.pages.length ? Math.min(...payload.pages) : 0;
  const printedOf = (o: RawObject) => o.printedPage ?? (o.page - firstRecord + 1);
  const dateOf = (o: RawObject) => (o.dateLabel ?? 'Feb 1 1924');
  const serialOf = (o: RawObject) => (o.serial ?? 'Brooklyn News');

  function toItem(o: RawObject): IndexItem {
    const { type, vis, isVisual } = classify(o);
    const pp = printedOf(o), date = dateOf(o).toUpperCase(), serial = serialOf(o).toUpperCase();
    const typeLabel = (TYPE_LABELS[type] || 'Object').toUpperCase();
    const roleNote = o.role ? o.role : o.objectClass.replace(/_/g, ' ');
    const snippet = o.summary && o.summary.trim() ? o.summary : snippetOf(o);
    const topics = (o.topics ?? []).map((t) => t.id);
    const names = (o.names ?? []).map((n) => n.id).filter((id) => facetedNameIds.has(id));
    return {
      id: o.id, typeLabel, type, vis, isVisual, wallHeight: WALL_HEIGHTS[type] || '200px',
      stamp: `CLEVELAND · ${date} · P.${pp}`, title: toTitle(o), snippet, topics, names,
      cropNote: isVisual ? `${typeLabel} — ${roleNote.toUpperCase()}` : '',
      caption: firstLine(o.text),
      credit: `SOURCE: ${serial} · ${date} · ${o.issueId} · P.${pp} · SEQ ${o.seq}`,
      clipNote: o.isAdvertorial ? `${roleNote} · flagged advertorial` : roleNote,
      transcript: o.text, pageImage: o.pageImage ?? null, iiifId: o.iiifId ?? null,
      // carried through so a patron detail can open the exact page in the workbench
      pageRecord: o.page ?? null, printedPage: printedOf(o),
    };
  }

  const items: IndexItem[] = payload.objects.filter((o) => o.isPublicationContent).map(toItem);

  function countBy(keyFn: (i: IndexItem) => string | null): Map<string, number> {
    const m = new Map<string, number>();
    for (const it of items) { const k = keyFn(it); if (k) m.set(k, (m.get(k) || 0) + 1); }
    return m;
  }
  const typeCounts = countBy((i) => i.type);
  const typeValues: FacetValue[] = TYPE_ORDER.filter((t) => typeCounts.has(t)).map((t) => ({ id: t, label: TYPE_LABELS[t] || t, count: typeCounts.get(t)! }));
  const visCounts = countBy((i) => i.vis);
  const visualCount = items.filter((i) => i.isVisual).length;
  const visValues: FacetValue[] = [
    { id: 'v-all', label: VIS_LABELS['v-all'], count: visualCount },
    ...VIS_ORDER.filter((v) => visCounts.has(v)).map((v) => ({ id: v, label: VIS_LABELS[v] || v, count: visCounts.get(v)! })),
  ];

  const facetDefs: FacetGroup[] = [
    { key: 'topic', name: 'TOPIC', note: 'MULTI', values: topicFacetValues,
      emptyNote: enriched ? 'No topics extracted for the ingested pages.' : 'No topics extracted yet — run enrichment.' },
    { key: 'name', name: 'NAME', note: 'RECURRING · PEOPLE · PLACES · ORGS',
      values: nameFacetValues.map(({ id, label, count }) => ({ id, label, count })),
      emptyNote: enriched ? 'No entity recurs across ≥2 ingested objects yet.' : 'No entities extracted yet — run enrichment.' },
    { key: 'type', name: 'TYPE', note: 'MULTI', values: typeValues },
    { key: 'visual', name: 'PICTURES & ADS', note: 'VISUAL MODE', values: visValues },
  ];

  function eventToCalendar(ev: RawEvent): CalendarEvent {
    const when = ev.startText || ev.recurrenceText || 'AS PRINTED';
    const pp = ev.printedSourcePage ?? (ev.sourcePage - firstRecord + 1);
    const date = (ev.dateLabel ?? 'Feb 1 1924').toUpperCase();
    const serial = (ev.serial ?? 'Brooklyn News').toUpperCase();
    const groupName = groupFor(ev.eventType).group;
    const fromWhat = ev.sourceClass === 'advertisement' ? 'FROM A DISPLAY AD' : 'FROM AN ARTICLE';
    const facts: Fact[] = [
      ...(ev.venue ? [{ label: 'VENUE', value: ev.venue }] : []),
      { label: 'DATE / TIME', value: ev.startText || ev.recurrenceText || 'as printed' },
      ...(ev.recurrenceText && ev.startText ? [{ label: 'RECURS', value: ev.recurrenceText }] : []),
      ...(ev.performers.length ? [{ label: 'PERFORMER', value: ev.performers.join(', ') }] : []),
      { label: 'PRICE AS PRINTED', value: ev.priceText || 'none listed' },
      { label: 'EVENT TYPE', value: ev.eventType.replace(/_/g, ' ') },
      { label: 'CONFIDENCE', value: ev.confidence.toUpperCase() },
      { label: 'EXTRACTED FROM', value: `${ev.sourceClass.replace(/_/g, ' ')}, p.${pp}` },
    ];
    return {
      id: ev.id, eventType: ev.eventType, sourceKind: sourceKindOf(ev.sourceClass),
      stamp: `${(ev.venue || serial).toUpperCase()} · ${when.toUpperCase()}`, title: ev.title,
      blurb: ev.sourceSummary || `${ev.eventType.replace(/_/g, ' ')} extracted from a ${ev.sourceClass.replace(/_/g, ' ')}.`,
      price: ev.priceText ? `${ev.priceText} — as printed` : 'No admission listed',
      section: `${groupName.toUpperCase()} · ${fromWhat}`,
      credit: `SOURCE: ${serial} · ${date} · P.${pp} · ${ev.sourceClass.replace(/_/g, ' ').toUpperCase()}`,
      clipNote: `${ev.eventType.replace(/_/g, ' ')} — extracted from ${ev.sourceClass.replace(/_/g, ' ')}`,
      transcript: `[${ev.title}] ${ev.venue ? ev.venue + ' — ' : ''}${when}. ${ev.sourceSummary || ''}`.trim(),
      facts, pageImage: ev.pageImage ?? null, iiifId: ev.iiifId ?? null,
    };
  }

  const rawEvents = payload.events ?? [];
  const sections: CalendarSection[] = buildSections(rawEvents.map(eventToCalendar));
  const calendarAvailable = enriched && rawEvents.length > 0;
  const issueCount = payload.issueCount ?? 1;
  const scope = multiIssue ? `${issueCount} issues · ${payload.pages.length} pages` : `one issue (${items[0] ? dateOf(payload.objects[0]) : 'Feb 1 1924'})`;

  const dataset: Dataset = {
    mode: 'real',
    weeks: [{ year: '1924', sub: multiIssue ? 'BROOKLYN NEWS' : 'FEB 1', hasData: calendarAvailable }],
    sections, eventCount: rawEvents.length, calendarAvailable,
    calendarNote: enriched
      ? 'Event extraction ran on the ingested pages. A 1920s community weekly is civic, not commercial — its calendar is club meetings, socials, church programs, and a couple of movie nights, not concert/theater nightlife.'
      : 'The calendar assembles from machine-extracted EVENTS. Ingest pages to place them on the timeline.',
    indexItems: items, facetDefs,
    indexHero: enriched
      ? { kicker: 'THE INDEX · LIVE FROM POSTGRES',
          headline: 'Browse the paper the catalog never indexed — live.',
          deck: `${items.length} typed content objects across ${scope}, ingested into Postgres: ${topicFacetValues.length} machine-extracted subjects, ${nameFacetValues.length} recurring names, ${rawEvents.length} events. Every facet is real — and grows as you ingest more pages.` }
      : { kicker: 'THE INDEX · REAL DATA',
          headline: 'The Brooklyn News, as the pipeline actually read it.',
          deck: `${items.length} typed content objects across ${scope}. Type and picture facets are real; topic and name facets await enrichment.` },
    countsAreMock: false,
  };
  const firstObj = payload.objects[0];
  const meta: RealMeta = {
    model: firstObj?.model ?? payload.issue?.model ?? 'claude-sonnet-5',
    runId: firstObj?.runId ?? payload.issue?.runId ?? 'live',
    pageCount: payload.pageCount ?? payload.pages.length, objectCount: items.length, enriched,
    topicCount: topicFacetValues.length, nameCount: nameFacetValues.length, eventCount: rawEvents.length,
    multiIssue, issueCount,
  };
  return { dataset, meta };
}

// Committed fallback (used when the live service is offline).
const _committed = buildRealDataset(raw as unknown as RawPayload);
export const realDataset = _committed.dataset;
export const realMeta = _committed.meta;
