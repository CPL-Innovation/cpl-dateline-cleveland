import type { Dataset } from '../lib/types';
import { C, MONO, SANS, SERIF } from '../lib/ui';
import { deckKind } from '../lib/calendar';

interface Props {
  dataset: Dataset;
  weekIdx: number;
  onPickWeek: (i: number) => void;
  onOpenEvent: (id: string) => void;
  onBackToPopulated: () => void;
}

export function CalendarBrowse({ dataset, weekIdx, onPickWeek, onOpenEvent, onBackToPopulated }: Props) {
  const week = dataset.weeks[weekIdx] ?? dataset.weeks[0];
  // Label derives from the week data — no hardcoded date literal (SLICE-04).
  const weekLabel = week.sub.charAt(0) + week.sub.slice(1).toLowerCase() + ', ' + week.year;
  const weekStamp = week.sub + ' ' + week.year;
  // Deck framing derives from the actual event mix (civic-dominant vs nightlife),
  // not from the dataset's mode — same component, corpus-aware.
  const civic = deckKind(dataset.sections) === 'civic';

  return (
    <div className="dc-shell" style={{ padding: '0 32px' }}>
      {/* Hero deck */}
      <div style={{ padding: '48px 0 8px', display: 'grid', gridTemplateColumns: '8fr 4fr', gap: 48, alignItems: 'end' }}>
        <div>
          <div
            style={{
              display: 'inline-block',
              fontFamily: SANS,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.22em',
              color: C.navy,
              borderBottom: `3px solid ${C.marigold}`,
              paddingBottom: 4,
            }}
          >
            THE CULTURAL CALENDAR
          </div>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 58, lineHeight: 1.04, marginTop: 12, textWrap: 'balance', color: C.ink }}>
            What was happening in Cleveland the week of <em style={{ fontStyle: 'italic' }}>{weekLabel}</em>?
          </div>
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 16.5, lineHeight: 1.55, color: C.secondary, paddingBottom: 6 }}>
          {civic ? (
            <>
              Lodge halls, church basements, school socials, and the odd picture show — assembled from the articles{' '}
              <em>and the ads</em>. A community weekly's week is civic life, and no catalog ever indexed it.
            </>
          ) : (
            <>
              Concerts, films, theater, races — assembled from the articles <em>and the ads</em>. A question no catalog
              search can answer; pick a week and the city's night life sets itself in type.
            </>
          )}
        </div>
      </div>

      {/* Timeline scrubber */}
      <div style={{ marginTop: 30, borderTop: `1px solid ${C.hairMed}`, borderBottom: `1px solid ${C.hairMed}`, padding: '18px 0 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em' }}>SCRUB THE TIMELINE</div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', color: C.navy }}>WEEK OF {weekStamp}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 0, marginTop: 14, borderBottom: `2px solid ${C.navy}` }}>
          {dataset.weeks.map((w, i) => {
            const active = i === weekIdx;
            return (
              <button
                key={i}
                className="dc-row-hover"
                onClick={() => onPickWeek(i)}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '8px 0 10px',
                  borderLeft: `1px solid ${C.hairMed}`,
                  background: active ? C.navy : 'transparent',
                }}
              >
                <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: active ? '#FFFFFF' : C.body }}>
                  {w.year}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.06em', color: C.tertiary, marginTop: 2 }}>
                  {w.sub}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Listings, empty state, or real-mode note */}
      {!dataset.calendarAvailable ? (
        <RealCalendarNote note={dataset.calendarNote} />
      ) : week.hasData ? (
        <Listings dataset={dataset} onOpenEvent={onOpenEvent} />
      ) : (
        <EmptyWeek onBackToPopulated={onBackToPopulated} />
      )}
    </div>
  );
}

function Listings({ dataset, onOpenEvent }: { dataset: Dataset; onOpenEvent: (id: string) => void }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 34 }}>
        <div style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 26, color: C.ink }}>Amusements &amp; This Week</div>
        <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em', color: C.tertiary }}>
          {dataset.eventCount} EVENTS · MACHINE-EXTRACTED FROM ARTICLES &amp; ADS · CURATOR-REVIEWABLE
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, marginTop: 16, borderTop: `2px solid ${C.navy}`, marginBottom: 80 }}>
        {dataset.sections.map((sec) => {
          const color = sec.color || C.navy;
          return (
            <div key={sec.name} style={{ padding: '18px 20px 24px 0', marginRight: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 9, height: 9, background: color }} />
                <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.2em', color: C.ink }}>{sec.name.toUpperCase()}</div>
                <div style={{ flex: 1, height: 1, background: C.hairLight }} />
              </div>
              {sec.events.map((ev) => (
                <button
                  key={ev.id}
                  className="dc-row-hover"
                  onClick={() => onOpenEvent(ev.id)}
                  style={{ display: 'block', width: '100%', padding: '16px 0 14px', borderBottom: `1px solid ${C.hairLight}` }}
                >
                  <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', color: C.tertiary }}>{ev.stamp}</div>
                  <div className="dc-title-link" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 20, lineHeight: 1.15, marginTop: 6, color: C.ink }}>
                    {ev.title}
                  </div>
                  <div style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 1.45, color: C.secondary, marginTop: 5 }}>{ev.blurb}</div>
                  <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.body, marginTop: 7 }}>{ev.price}</div>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

function EmptyWeek({ onBackToPopulated }: { onBackToPopulated: () => void }) {
  return (
    <div style={{ margin: '60px 0 120px', border: `1px solid ${C.hairMed}`, padding: 48, textAlign: 'center' }}>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 30, color: C.ink }}>This week isn't set in type yet.</div>
      <div style={{ fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.08em', color: C.tertiary, marginTop: 14, lineHeight: 1.8 }}>
        DEMO NOTE — MOCK DATA IS HAND-AUTHORED FOR THE WEEK OF JUL 23–29 1970 ONLY.
        <br />
        IN THE LIVE PRODUCT, EVERY WEEK 1924–1975 ASSEMBLES FROM THE ENRICHED COLLECTION.
      </div>
      <button
        className="dc-btn-ghost"
        onClick={onBackToPopulated}
        style={{
          display: 'inline-block',
          marginTop: 22,
          fontFamily: SANS,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.14em',
          border: `1px solid ${C.navy}`,
          padding: '9px 18px',
          color: C.navy,
        }}
      >
        RETURN TO JUL 1970 →
      </button>
    </div>
  );
}

function RealCalendarNote({ note }: { note: string }) {
  return (
    <div style={{ margin: '60px 0 120px', border: `1px solid ${C.hairMed}`, padding: 48, textAlign: 'center' }}>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 30, color: C.ink }}>No events extracted from this issue — yet.</div>
      <div style={{ fontFamily: SERIF, fontSize: 16.5, lineHeight: 1.6, color: C.secondary, marginTop: 16, maxWidth: '62ch', marginInline: 'auto' }}>
        {note}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em', color: C.tertiary, marginTop: 18 }}>
        REAL DATA · SLICE-01 · EVENT ENRICHMENT NOT RUN
      </div>
    </div>
  );
}
