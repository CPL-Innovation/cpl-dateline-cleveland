// THE STACKS — browse the corpus as bound issues rather than as clippings.
// Same visual system as THE INDEX: hero, left rail, hairline division, flat 0px
// radii. The rail filters by SERIAL (the shelf's own organising principle); the
// main column shelves each serial's issues as covers you can pull down.

import type { Dataset } from '../lib/types';
import type { Shelf, ShelfIssue } from '../lib/shelf';
import { bySerial } from '../lib/shelf';
import { C, MONO, SANS, SERIF } from '../lib/ui';

interface Props {
  shelf: Shelf;
  dataset: Dataset;
  serial: string | null;
  onSerial: (s: string | null) => void;
  onOpen: (key: string) => void;
}

export function StacksBrowse({ shelf, serial, onSerial, onOpen }: Props) {
  const groups = bySerial(shelf.issues);
  const shown = serial ? groups.filter((g) => g.serial === serial) : groups;
  const issueCount = shown.reduce((n, g) => n + g.issues.length, 0);
  const pageCount = shown.reduce((n, g) => n + g.issues.reduce((m, i) => m + i.pageCount, 0), 0);

  return (
    <div className="dc-shell" style={{ padding: '0 32px' }}>
      {/* Hero */}
      <div style={{ padding: '44px 0 10px', display: 'grid', gridTemplateColumns: '8fr 4fr', gap: 48, alignItems: 'end', borderBottom: `1px solid ${C.hairMed}`, paddingBottom: 30 }}>
        <div>
          <div style={{ display: 'inline-block', fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.22em', color: C.navy, borderBottom: `3px solid ${C.marigold}`, paddingBottom: 4 }}>
            THE STACKS
          </div>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 54, lineHeight: 1.06, marginTop: 12, textWrap: 'balance', color: C.ink }}>
            Pull an issue off the shelf and read it end to end.
          </div>
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 16.5, lineHeight: 1.55, color: C.secondary, paddingBottom: 6 }}>
          The index breaks the paper into pieces. Here it is whole: every issue the pipeline has read,
          bound as it was printed — turn the pages as scans, or read the extracted text set like a
          newspaper's own website.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 0, marginBottom: 80 }}>
        {/* Rail */}
        <div style={{ borderRight: `1px solid ${C.hairMed}`, padding: '24px 28px 24px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: C.ink }}>COLLECTIONS</div>
            {serial && (
              <button className="dc-underline-hover" onClick={() => onSerial(null)} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', color: C.navy }}>
                SHOW ALL ✕
              </button>
            )}
          </div>

          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, borderBottom: `1px solid ${C.body}`, paddingBottom: 6 }}>
              <div style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.16em', color: C.navy }}>SERIAL</div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.tertiary }}>ONE AT A TIME</div>
            </div>
            {groups.length === 0 ? (
              <div style={{ fontFamily: MONO, fontSize: 10, lineHeight: 1.6, color: C.tertiary, padding: '10px 8px 2px' }}>
                Nothing on the shelf yet.
              </div>
            ) : (
              groups.map((g) => {
                const on = serial === g.serial;
                return (
                  <button
                    key={g.serial}
                    className="dc-facet-row"
                    onClick={() => onSerial(on ? null : g.serial)}
                    style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '7px 6px 7px 8px', background: on ? C.navy : 'transparent', color: on ? '#FFFFFF' : C.body }}
                  >
                    <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: on ? 700 : 500, letterSpacing: '0.02em' }}>
                      {on ? '✕ ' : ''}
                      {g.serial}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 10.5 }}>{g.issues.length}</span>
                  </button>
                );
              })
            )}
          </div>

          <div style={{ marginTop: 26, fontFamily: MONO, fontSize: 9.5, lineHeight: 1.7, color: C.tertiary, borderTop: `1px solid ${C.hairMed}`, paddingTop: 12 }}>
            {shelf.note}
          </div>
        </div>

        {/* Shelves */}
        <div style={{ padding: '24px 0 0 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `2px solid ${C.navy}`, paddingBottom: 10 }}>
            <div style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 24, color: C.ink }}>
              {serial ?? 'Every issue on the shelf'}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em', color: C.tertiary }}>
              {issueCount} ISSUE{issueCount === 1 ? '' : 'S'} · {pageCount} PAGES
            </div>
          </div>

          {issueCount === 0 ? (
            <EmptyShelf />
          ) : (
            shown.map((g) => (
              <div key={g.serial} style={{ marginTop: 34 }}>
                {!serial && (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, borderBottom: `1px solid ${C.body}`, paddingBottom: 6 }}>
                    <div style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.16em', color: C.navy }}>
                      {g.serial.toUpperCase()}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.tertiary }}>
                      {g.issues.length} ISSUE{g.issues.length === 1 ? '' : 'S'}
                    </div>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 28, marginTop: 22 }}>
                  {g.issues.map((iss) => (
                    <IssueCover key={iss.key} issue={iss} onOpen={() => onOpen(iss.key)} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function IssueCover({ issue, onOpen }: { issue: ShelfIssue; onOpen: () => void }) {
  const cover = issue.pages.find((p) => p.thumb) ?? issue.pages[0];
  // Two coverage bars, because they answer two different questions: how much of
  // the book the pipeline has READ, and how much a curator has RELEASED.
  const readPct = issue.pageCount ? Math.round((issue.ingestedPages / issue.pageCount) * 100) : 0;
  return (
    <button className="dc-wall-tile" onClick={onOpen} style={{ display: 'block', width: '100%' }}>
      <div
        className="dc-wall-frame"
        style={{
          height: 300,
          border: `1px solid ${C.hairMed}`,
          borderTop: `3px solid ${issue.publishedCount ? C.navy : C.hairMed}`,
          background: cover?.thumb
            ? C.sunken
            : `repeating-linear-gradient(45deg, ${C.sunken}, ${C.sunken} 8px, ${C.canvas} 8px, ${C.canvas} 16px)`,
          overflow: 'hidden',
          display: 'flex',
          alignItems: cover?.thumb ? 'flex-start' : 'center',
          justifyContent: 'center',
        }}
      >
        {cover?.thumb ? (
          <img
            src={cover.thumb}
            alt={`${issue.serial}, ${issue.dateLabel} — page 1 as printed`}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
          />
        ) : (
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.tertiary, textAlign: 'center', padding: '0 12px', lineHeight: 1.7 }}>
            [ {issue.serial.toUpperCase()} ]
            <br />
            {issue.dateLabel.toUpperCase()}
            <br />
            page scan placeholder
          </span>
        )}
      </div>

      <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', color: C.secondary, marginTop: 10 }}>
        {issue.serial.toUpperCase()}
      </div>
      <div className="dc-title-link" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 21, lineHeight: 1.15, marginTop: 3, color: C.ink }}>
        {issue.dateLabel}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.05em', color: C.tertiary, marginTop: 6 }}>
        {issue.pageCount} PAGES · {issue.ingestedPages} READ · {issue.publishedCount} PUBLISHED
      </div>
      <div style={{ height: 3, background: C.hairLight, marginTop: 8 }}>
        <div style={{ width: `${readPct}%`, height: '100%', background: issue.publishedCount ? C.navy : C.hairMed }} />
      </div>
    </button>
  );
}

function EmptyShelf() {
  return (
    <div style={{ marginTop: 48, border: `1px solid ${C.hairMed}`, padding: 44, textAlign: 'center' }}>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 26, color: C.ink }}>The shelf is empty.</div>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', color: C.tertiary, marginTop: 12, lineHeight: 1.8 }}>
        AN ISSUE REACHES THIS SHELF WHEN THE PIPELINE HAS READ AT LEAST ONE OF ITS PAGES.
        <br />
        INGEST A PAGE IN THE STAFF WORKBENCH AND THE BOOK APPEARS HERE.
      </div>
    </div>
  );
}
