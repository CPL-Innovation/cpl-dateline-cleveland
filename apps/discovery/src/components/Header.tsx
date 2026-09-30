import type { DatasetMode, Page } from '../lib/types';
import { navigate, staffHref } from '../lib/router';
import { C, MONO, SANS, SERIF } from '../lib/ui';

interface Props {
  page: Page;
  mode: DatasetMode;
  onNav: (p: Page) => void;
  onMode: (m: DatasetMode) => void;
  query: string;
  onQuery: (q: string) => void;
  onSearch: () => void;
}

const disclaimer: Record<DatasetMode, string> = {
  mock: 'CONCEPT DEMO · MOCK DATA — HAND-AUTHORED FROM THE DRY-RUN MATERIAL & CLEVELAND SCENE, JUL 1970',
  // It used to name one issue (Brooklyn News, Feb 1 1924) — true on the day it was
  // written, and wrong from the second issue ingested on.
  real: 'REAL DATA · PIPELINE OUTPUT — AI-TRANSCRIBED & ENRICHED FROM CPL SCANS · PUBLISHED BY A CURATOR, ITEM BY ITEM',
};

export function Header({ page, mode, onNav, onMode, query, onQuery, onSearch }: Props) {
  const tab = (p: Page, label: string) => {
    const active = page === p;
    return (
      <span
        className="dc-nav-tab dc-clickable"
        onClick={() => onNav(p)}
        style={{
          color: active ? C.navy : C.secondary,
          borderBottom: `3px solid ${active ? C.marigold : 'transparent'}`,
          paddingBottom: 4,
          // "THIS WEEK, THEN" stacked itself three lines deep when the bar got tight.
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    );
  };

  const stub = (label: string) => (
    <span style={{ color: C.secondary, paddingBottom: 4, borderBottom: '3px solid transparent', whiteSpace: 'nowrap' }}>{label}</span>
  );

  return (
    <>
      {/* Provenance strip — what data this is, and the two tools that aren't for
          patrons: which dataset to show, and the way into the staff workbench.
          They lived in the main bar, where they pushed the nav into wrapping. */}
      <div style={{ background: C.sunken, borderBottom: `1px solid ${C.hairLight}` }}>
        <div
          className="dc-shell"
          style={{
            padding: '4px 32px',
            display: 'flex', alignItems: 'center', gap: 16,
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: '0.08em',
            color: C.tertiary,
          }}
        >
          <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={disclaimer[mode]}>
            {disclaimer[mode]}
          </span>
          <DatasetToggle mode={mode} onMode={onMode} />
          <a
            href={staffHref}
            className="dc-underline-hover"
            onClick={(e) => {
              e.preventDefault();
              navigate('staff');
            }}
            style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', color: C.navy, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
            title="Staff editorial workbench — the enrichment pipeline interface (/staff)"
          >
            STAFF WORKBENCH ↗
          </a>
        </div>
      </div>

      {/* Wordmark · nav · search · dataset toggle */}
      <div style={{ borderBottom: `1px solid ${C.hairLight}`, background: C.canvas }}>
        <div
          className="dc-shell"
          style={{ padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 32 }}
        >
          <div
            className="dc-clickable"
            onClick={() => onNav('calendar')}
            style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexShrink: 0 }}
          >
            <div style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 24, lineHeight: 1, color: C.navy }}>
              Dateline Cleveland
            </div>
            <div className="dc-hide-narrow" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', color: C.tertiary }}>
              1892–1975
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 24,
              alignItems: 'center',
              fontFamily: SANS,
              fontSize: 12.5,
              fontWeight: 600,
              letterSpacing: '0.08em',
              marginTop: 2,
            }}
          >
            {tab('calendar', 'THIS WEEK, THEN')}
            {tab('index', 'THE INDEX')}
            {tab('stacks', 'THE STACKS')}
            {stub('FRONT PAGES')}
            {stub('PLACES')}
            {stub('ABOUT')}
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSearch();
              }}
              style={{ display: 'flex', alignItems: 'center', position: 'relative' }}
            >
              <input
                value={query}
                // Enter submits. Handled here as well as via the form so the
                // gesture works regardless of implicit-submission quirks.
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onSearch();
                  }
                }}
                onChange={(e) => onQuery(e.target.value)}
                placeholder="Search the collection…"
                aria-label="Search the transcribed text of the collection"
                style={{
                  fontFamily: SANS,
                  fontSize: 12,
                  padding: '6px 44px 6px 12px',
                  border: `1px solid ${page === 'search' ? C.navy : C.hairMed}`,
                  background: C.canvas,
                  color: C.body,
                  // gives way first when the bar is tight, so the nav never has to
                  width: 'clamp(150px, 17vw, 240px)',
                  borderRadius: 0,
                  outline: 'none',
                }}
              />
              {query && (
                <span
                  className="dc-clickable"
                  onClick={() => {
                    onQuery('');
                    if (page === 'search') onNav('index');
                  }}
                  title="Clear search"
                  style={{
                    position: 'absolute',
                    right: 30,
                    fontFamily: MONO,
                    fontSize: 12,
                    lineHeight: 1,
                    color: C.tertiary,
                  }}
                >
                  ✕
                </span>
              )}
              {/* a visible way to run the search — Enter alone is an invisible affordance */}
              <button
                type="submit"
                aria-label="Search"
                title="Search the collection"
                className="dc-clickable"
                style={{
                  position: 'absolute',
                  right: 6,
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  fontSize: 13,
                  lineHeight: 1,
                  color: query.trim().length >= 2 ? C.navy : C.tertiary,
                  cursor: 'pointer',
                }}
              >
                ⌕
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

function DatasetToggle({ mode, onMode }: { mode: DatasetMode; onMode: (m: DatasetMode) => void }) {
  const seg = (m: DatasetMode, label: string) => {
    const active = mode === m;
    return (
      <button
        onClick={() => onMode(m)}
        style={{
          fontFamily: MONO,
          fontSize: 9,
          fontWeight: active ? 700 : 500,
          letterSpacing: '0.1em',
          padding: '3px 8px',
          background: active ? C.navy : C.canvas,
          color: active ? C.canvas : C.secondary,
          border: 'none',
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div
      title="Toggle between the hand-authored mock demo and the real SLICE-01 pipeline output"
      style={{ display: 'flex', border: `1px solid ${C.hairMed}`, flexShrink: 0 }}
    >
      {seg('mock', 'MOCK')}
      <div style={{ width: 1, background: C.hairMed }} />
      {seg('real', 'REAL DATA')}
    </div>
  );
}
