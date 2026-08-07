// Shared shapes for both datasets (mock + real). The UI renders against these;
// the mock module and the real adapter both produce them.

export type Page = 'calendar' | 'index' | 'search';
export type DatasetMode = 'mock' | 'real';

/** A single machine-extracted fact row in a page-reader detail. */
export interface Fact {
  label: string;
  value: string;
}

/** Calendar event (This Week, Then). */
export interface CalendarEvent {
  id: string;
  eventType: string; // schema event_type (concert|film|civic|club_engagement|…) — drives grouping
  sourceKind?: 'article' | 'ad' | 'listing' | 'mixed'; // where it was extracted from (honesty copy)
  stamp: string; // mono venue/date stamp
  title: string;
  blurb: string;
  price: string;
  section: string; // detail kicker, e.g. "MUSIC · FROM A DISPLAY AD"
  credit: string;
  clipNote: string;
  transcript: string;
  facts: Fact[];
  pageImage?: string | null; // SLICE-06: real ContentDM page image (BASE-relative path)
  iiifId?: string | null; // SLICE-06: canonical IIIF identifier for provenance
}

export interface CalendarSection {
  name: string; // display group, DERIVED from event_type (SLICE-04) — not a fixed template
  color?: string; // group swatch (from the shared event_type→group map)
  events: CalendarEvent[];
}

export interface WeekCell {
  year: string;
  sub: string; // e.g. "JUL 23–29"
  hasData: boolean;
}

/** One indexed object (The Index). Mixed text/visual. */
export interface IndexItem {
  id: string;
  typeLabel: string; // ARTICLE / ADVERTISEMENT / PHOTOGRAPH / …
  type: string; // facet id: y-article, y-ad, …
  vis: string | null; // visual facet id: v-photo, v-ad, … (null if not visual)
  isVisual: boolean;
  wallHeight?: string; // visual-wall tile height
  stamp: string; // mono dateline
  // null when the object genuinely has no headline — a masthead, a roster, an
  // unlabelled photo. The card renders no title line at all rather than promoting
  // the first sentence of the body into one. Resolved server-side (lib/title.ts).
  title: string | null;
  snippet: string;
  topics: string[]; // facet ids
  names: string[]; // facet ids
  cropNote: string;
  caption: string;
  credit: string;
  clipNote: string;
  transcript: string;
  pageImage?: string | null; // SLICE-06: real ContentDM page image (BASE-relative path)
  iiifId?: string | null; // SLICE-06: canonical IIIF identifier for provenance
  /** ContentDM record of the page this object sits on — the staff workbench's key.
   *  Present only in REAL mode; mock items have no page behind them to open. */
  pageRecord?: number | null;
  printedPage?: number | null;
}

export interface FacetValue {
  id: string;
  label: string;
  count: number;
}

export interface FacetGroup {
  key: 'topic' | 'name' | 'type' | 'visual';
  name: string;
  note: string;
  values: FacetValue[];
  /** real mode: honest note when this axis has no extracted data yet */
  emptyNote?: string;
}

/** Everything a rendered surface needs, resolved for the active dataset. */
export interface Dataset {
  mode: DatasetMode;
  weeks: WeekCell[];
  sections: CalendarSection[];
  eventCount: number;
  /** false in real mode (no events extracted in SLICE-01) → honest calendar empty state */
  calendarAvailable: boolean;
  calendarNote: string;
  indexItems: IndexItem[];
  facetDefs: FacetGroup[];
  indexHero: { kicker: string; headline: string; deck: string };
  countsAreMock: boolean;
}

/** Functional category color per facet type id (discovery-ux-spec §5). */
export const TYPE_COLORS: Record<string, string> = {
  'y-article': '#0057b7',
  'y-ad': '#f1c400',
  'y-listing': '#94b7bb',
  'y-cartoon': '#ff8d7e',
  'y-photo': '#4298b5',
  'y-map': '#56944f',
  'y-legal': '#505a69',
  'y-masthead': '#0f1215',
  'y-classified': '#8a94a3',
  'y-coupon': '#ff8d7e',
};
