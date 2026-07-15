// SLICE-04 — corpus-aware calendar grouping. The calendar's columns are a FUNCTION
// OF THE DATA (the event_type mix actually present), not a hardcoded nightlife
// template. Same logic drives MOCK (1970 nightlife → Music/Film/Theater/Sport) and
// REAL (Brooklyn 1924 → Civic Life/Clubs & Societies/Film). Reuses the existing
// functional palette (discovery-ux §5) — no new colors.

import type { CalendarEvent, CalendarSection } from './types';

interface GroupDef {
  group: string; // display column name
  color: string; // swatch — reused from the existing functional palette
  kind: 'nightlife' | 'civic'; // drives the data-derived hero deck
  order: number; // column order
}

// event_type (data-schema §events vocab) → display group. Unknown/missing → Other.
export const EVENT_GROUPS: Record<string, GroupDef> = {
  concert: { group: 'Music', color: '#4298B5', kind: 'nightlife', order: 1 },
  music: { group: 'Music', color: '#4298B5', kind: 'nightlife', order: 1 },
  film: { group: 'Film', color: '#FF8D7E', kind: 'nightlife', order: 2 },
  theater: { group: 'Theater', color: '#56944F', kind: 'nightlife', order: 3 },
  race: { group: 'Sport & Racing', color: '#F1C400', kind: 'nightlife', order: 4 },
  exhibition: { group: 'Exhibitions', color: '#94B7BB', kind: 'civic', order: 5 },
  civic: { group: 'Civic Life', color: '#0057B7', kind: 'civic', order: 6 },
  club_engagement: { group: 'Clubs & Societies', color: '#505A69', kind: 'civic', order: 7 },
  other: { group: 'Other', color: '#8A94A3', kind: 'civic', order: 8 },
};

const OTHER = EVENT_GROUPS.other;

export function groupFor(eventType: string | undefined): GroupDef {
  return (eventType && EVENT_GROUPS[eventType]) || OTHER;
}

// Group a flat event list into ordered, non-empty display sections. The grouping is
// the whole point of the slice: columns appear because the data has those event kinds,
// not because a template listed them.
export function buildSections(events: CalendarEvent[]): CalendarSection[] {
  const byGroup = new Map<string, { def: GroupDef; events: CalendarEvent[] }>();
  for (const ev of events) {
    const def = groupFor(ev.eventType);
    if (!byGroup.has(def.group)) byGroup.set(def.group, { def, events: [] });
    byGroup.get(def.group)!.events.push(ev);
  }
  // Dominant groups lead (the week's biggest categories first); the fixed mapping
  // order is the tiebreak. So a civic-dominant week reads Civic Life · Clubs · Film,
  // and a nightlife week reads Music · Film · Theater · Sport.
  return [...byGroup.values()]
    .sort((a, b) => b.events.length - a.events.length || a.def.order - b.def.order)
    .map(({ def, events }) => ({ name: def.group, color: def.color, events }));
}

// The hero deck is data-driven too: whichever kind of week this is (civic-dominant
// vs nightlife-dominant) picks the framing. No per-mode literal in the component.
export function deckKind(sections: CalendarSection[]): 'nightlife' | 'civic' {
  let nightlife = 0;
  let civic = 0;
  for (const sec of sections) {
    const kind = EVENT_GROUPS[reverseKind(sec.name)]?.kind;
    // Fall back by re-deriving from the first event if the name lookup misses.
    const k = kind ?? groupFor(sec.events[0]?.eventType).kind;
    if (k === 'nightlife') nightlife += sec.events.length;
    else civic += sec.events.length;
  }
  return nightlife > civic ? 'nightlife' : 'civic';
}

// Group name → a representative event_type key (for kind lookup by section name).
function reverseKind(groupName: string): string {
  for (const [type, def] of Object.entries(EVENT_GROUPS)) {
    if (def.group === groupName) return type;
  }
  return 'other';
}

// Source-aware honesty copy (discovery-ux §7): don't claim "period advertising" for
// an article-sourced civic event. Reads the event's actual source.
export function sourcePhrase(kind: CalendarEvent['sourceKind']): string {
  switch (kind) {
    case 'article':
      return 'ARTICLES';
    case 'ad':
      return 'PERIOD ADVERTISING';
    case 'listing':
      return 'LISTINGS';
    default:
      return 'ARTICLES & ADVERTISING';
  }
}
