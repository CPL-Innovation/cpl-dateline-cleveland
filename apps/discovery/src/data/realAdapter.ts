// Adapt the real content_objects (exported to real.generated.json) into the
// discovery Dataset shape. This is the "REAL DATA" toggle.
//
// SLICE-01 produced typed, ordered transcriptions; SLICE-02 added the enrichment
// overlay (topics, entities, events). When the export carries that overlay
// (`enriched: true`):
//   • TYPE + PICTURES & ADS facets are real (from object_class), as before.
//   • TOPIC + NAME facets bind to machine-extracted topics + recurring entities.
//   • The Calendar assembles from extracted EVENTS (civic/club/film for this issue).
// When the export is pre-enrichment, the old honest empty states are kept.
// Non-publication objects (filler, manuscript marks) are dropped per Principle 15.

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
  pageImage?: string | null; // SLICE-06: real ContentDM page image
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
  sourceClass: string;
  sourceSummary: string | null;
  pageImage?: string | null; // SLICE-06
  iiifId?: string | null;
}

interface RawPayload {
  generatedAt: string | null;
  enriched?: boolean;
  issue: { id: string; model: string; runId: string } | null;
  pages: number[];
  objects: RawObject[];
  topicFacet?: FacetValue[];
  nameFacet?: Array<FacetValue & { type: string }>;
  events?: RawEvent[];
}

const payload = raw as RawPayload;
const enriched = payload.enriched === true;
const topicFacetValues: FacetValue[] = payload.topicFacet ?? [];
const nameFacetValues: Array<FacetValue & { type: string }> = payload.nameFacet ?? [];
// Only names promoted to the NAME facet (recurring) are shown/filterable.
const facetedNameIds = new Set(nameFacetValues.map((n) => n.id));

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
  // The one-sentence machine summary is the browse pitch when enrichment ran.
  const snippet = o.summary && o.summary.trim() ? o.summary : snippetOf(o);
  const topics = (o.topics ?? []).map((t) => t.id);
  const names = (o.names ?? []).map((n) => n.id).filter((id) => facetedNameIds.has(id));
  return {
    id: o.id,
    typeLabel,
    type,
    vis,
    isVisual,
    wallHeight: WALL_HEIGHTS[type] || '200px',
    stamp,
    title: toTitle(o),
    snippet,
    topics,
    names,
    cropNote: isVisual ? `${typeLabel} — ${roleNote.toUpperCase()}` : '',
    caption: firstLine(o.text),
    credit: `SOURCE: BROOKLYN NEWS · FEB 1 1924 · ${o.issueId} · P.${printedPage(o.page)} · SEQ ${o.seq}`,
    clipNote: o.isAdvertorial ? `${roleNote} · flagged advertorial` : roleNote,
    transcript: o.text,
    pageImage: o.pageImage ?? null,
    iiifId: o.iiifId ?? null,
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
    values: topicFacetValues,
    emptyNote: enriched
      ? 'No topics extracted for this issue.'
      : 'No topics extracted yet — run the SLICE-02 enrichment pass.',
  },
  {
    key: 'name',
    name: 'NAME',
    note: 'RECURRING · PEOPLE · PLACES · ORGS',
    values: nameFacetValues.map(({ id, label, count }) => ({ id, label, count })),
    emptyNote: enriched
      ? 'No entity recurs across ≥2 objects in this single issue.'
      : 'No entities extracted yet — run the SLICE-02 enrichment pass.',
  },
  { key: 'type', name: 'TYPE', note: 'MULTI', values: typeValues },
  { key: 'visual', name: 'PICTURES & ADS', note: 'VISUAL MODE', values: visValues },
];

// --- Calendar: assemble CalendarEvents from extracted events -----------------
// Grouping is DERIVED from each event's event_type via the shared buildSections
// (SLICE-04) — the SAME logic MOCK uses. Brooklyn News 1924 yields civic/club/film,
// so the columns come out Civic Life / Clubs & Societies / Film, not a nightlife
// template. No section names hardcoded here.
function sourceKindOf(sourceClass: string): CalendarEvent['sourceKind'] {
  if (sourceClass === 'advertisement') return 'ad';
  if (sourceClass === 'article') return 'article';
  if (sourceClass === 'listing' || sourceClass === 'classified_section') return 'listing';
  return 'mixed';
}

function eventToCalendar(ev: RawEvent): CalendarEvent {
  const when = ev.startText || ev.recurrenceText || 'FEB 1924';
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
    { label: 'EXTRACTED FROM', value: `${ev.sourceClass.replace(/_/g, ' ')}, p.${printedPage(ev.sourcePage)}` },
  ];
  return {
    id: ev.id,
    eventType: ev.eventType,
    sourceKind: sourceKindOf(ev.sourceClass),
    stamp: `${(ev.venue || 'BROOKLYN').toUpperCase()} · ${when.toUpperCase()}`,
    title: ev.title,
    blurb: ev.sourceSummary || `${ev.eventType.replace(/_/g, ' ')} extracted from a ${ev.sourceClass.replace(/_/g, ' ')}.`,
    price: ev.priceText ? `${ev.priceText} — as printed` : 'No admission listed',
    section: `${groupName.toUpperCase()} · ${fromWhat}`,
    credit: `SOURCE: BROOKLYN NEWS · FEB 1 1924 · P.${printedPage(ev.sourcePage)} · ${ev.sourceClass.replace(/_/g, ' ').toUpperCase()}`,
    clipNote: `${ev.eventType.replace(/_/g, ' ')} — extracted from ${ev.sourceClass.replace(/_/g, ' ')}`,
    transcript: `[${ev.title}] ${ev.venue ? ev.venue + ' — ' : ''}${when}. ${ev.sourceSummary || ''}`.trim(),
    facts,
    pageImage: ev.pageImage ?? null,
    iiifId: ev.iiifId ?? null,
  };
}

const rawEvents = payload.events ?? [];
const sections: CalendarSection[] = buildSections(rawEvents.map(eventToCalendar));
const calendarAvailable = enriched && rawEvents.length > 0;

export const realDataset: Dataset = {
  mode: 'real',
  weeks: [{ year: '1924', sub: 'FEB 1', hasData: calendarAvailable }],
  sections,
  eventCount: rawEvents.length,
  calendarAvailable,
  calendarNote: enriched
    ? 'Event extraction ran on this issue. A 1924 community weekly is civic, not commercial — its calendar is club meetings, socials, church programs, and a couple of movie nights, not the concert/theater nightlife a modern alt-weekly carries.'
    : 'The calendar assembles from machine-extracted EVENTS. Run the SLICE-02 enrichment pass to place this issue on the timeline. Switch to MOCK DATA to see the intended calendar.',
  indexItems: items,
  facetDefs,
  indexHero: enriched
    ? {
        kicker: 'THE INDEX · REAL ENRICHED DATA',
        headline: 'Browse the paper the catalog never indexed — for real.',
        deck: `${items.length} typed content objects from one issue (Feb 1 1924), now enriched: ${topicFacetValues.length} machine-extracted subjects, ${nameFacetValues.length} recurring names, ${rawEvents.length} events. Every facet here is real.`,
      }
    : {
        kicker: 'THE INDEX · REAL SLICE-01 DATA',
        headline: 'The Brooklyn News, as the pipeline actually read it.',
        deck: `${items.length} typed content objects from one issue (Feb 1 1924, pages 1–${payload.pages.length}), transcribed by the VLM pass. Type and picture facets are real; topic and name facets await enrichment.`,
      },
  countsAreMock: false,
};

export const realMeta = {
  model: payload.issue?.model ?? 'unknown',
  runId: payload.issue?.runId ?? 'unknown',
  pageCount: payload.pages.length,
  objectCount: items.length,
  enriched,
  topicCount: topicFacetValues.length,
  nameCount: nameFacetValues.length,
  eventCount: rawEvents.length,
};
