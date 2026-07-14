import type { Dataset, FacetGroup, IndexItem } from '../lib/types';
import { TYPE_COLORS } from '../lib/types';
import { activeLabels, anySelected, isVisualMode, matches, type Selection } from '../lib/match';
import { C, MONO, SANS, SERIF } from '../lib/ui';

const VIS_COLORS: Record<string, string> = {
  'v-all': '#0057B7',
  'v-photo': TYPE_COLORS['y-photo'],
  'v-cartoon': TYPE_COLORS['y-cartoon'],
  'v-ad': TYPE_COLORS['y-ad'],
  'v-map': TYPE_COLORS['y-map'],
};

interface Props {
  dataset: Dataset;
  selected: Selection;
  onToggle: (id: string) => void;
  onClearAll: () => void;
  onOpen: (id: string) => void;
}

export function IndexBrowse({ dataset, selected, onToggle, onClearAll, onOpen }: Props) {
  const results = dataset.indexItems.filter((i) => matches(i, selected, dataset.facetDefs));
  const visualMode = isVisualMode(selected, dataset.facetDefs);
  const labels = activeLabels(selected, dataset.facetDefs);
  const { kicker, headline, deck } = dataset.indexHero;

  return (
    <div className="dc-shell" style={{ padding: '0 32px' }}>
      {/* Hero */}
      <div style={{ padding: '44px 0 10px', display: 'grid', gridTemplateColumns: '8fr 4fr', gap: 48, alignItems: 'end', borderBottom: `1px solid ${C.hairMed}`, paddingBottom: 30 }}>
        <div>
          <div style={{ display: 'inline-block', fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.22em', color: C.navy, borderBottom: `3px solid ${C.marigold}`, paddingBottom: 4 }}>
            {kicker}
          </div>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 54, lineHeight: 1.06, marginTop: 12, textWrap: 'balance', color: C.ink }}>
            {headline}
          </div>
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 16.5, lineHeight: 1.55, color: C.secondary, paddingBottom: 6 }}>{deck}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 0, marginBottom: 80 }}>
        <FacetRail dataset={dataset} selected={selected} onToggle={onToggle} onClearAll={onClearAll} />

        {/* Results */}
        <div style={{ padding: '24px 0 0 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `2px solid ${C.navy}`, paddingBottom: 10 }}>
            <div style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 24, color: C.ink }}>
              {visualMode ? 'Pictures & Ads' : 'Everything indexed'}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em', color: C.tertiary }}>
              {results.length} RESULTS · {labels.length ? labels.join(' + ') : 'NO FILTERS'}
            </div>
          </div>

          {results.length === 0 ? (
            <NoResults onClearAll={onClearAll} real={dataset.mode === 'real'} />
          ) : visualMode ? (
            <VisualWall results={results} onOpen={onOpen} />
          ) : (
            <MixedGrid results={results} onOpen={onOpen} />
          )}
        </div>
      </div>
    </div>
  );
}

function FacetRail({ dataset, selected, onToggle, onClearAll }: Omit<Props, 'onOpen'>) {
  return (
    <div style={{ borderRight: `1px solid ${C.hairMed}`, padding: '24px 28px 24px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: C.ink }}>REFINE</div>
        {anySelected(selected) && (
          <button className="dc-underline-hover" onClick={onClearAll} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', color: C.navy }}>
            CLEAR ALL ✕
          </button>
        )}
      </div>

      {dataset.facetDefs.map((grp) => (
        <FacetGroupBlock key={grp.key} grp={grp} selected={selected} onToggle={onToggle} />
      ))}

      <div style={{ marginTop: 26, fontFamily: MONO, fontSize: 9.5, lineHeight: 1.7, color: C.tertiary, borderTop: `1px solid ${C.hairMed}`, paddingTop: 12 }}>
        {dataset.countsAreMock
          ? 'ALL FACETS MACHINE-EXTRACTED · CURATOR-REVIEWABLE · COUNTS ARE MOCK'
          : 'TYPE & PICTURE FACETS ARE REAL SLICE-01 COUNTS · CURATOR-REVIEWABLE'}
      </div>
    </div>
  );
}

function FacetGroupBlock({ grp, selected, onToggle }: { grp: FacetGroup; selected: Selection; onToggle: (id: string) => void }) {
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, borderBottom: `1px solid ${C.body}`, paddingBottom: 6 }}>
        <div style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.16em', color: C.navy }}>{grp.name}</div>
        <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.tertiary }}>{grp.note}</div>
      </div>

      {grp.values.length === 0 ? (
        <div style={{ fontFamily: MONO, fontSize: 10, lineHeight: 1.6, color: C.tertiary, padding: '10px 8px 2px' }}>
          {grp.emptyNote || 'None.'}
        </div>
      ) : (
        grp.values.map((fv) => {
          const on = !!selected[fv.id];
          const baseDot = grp.key === 'type' ? TYPE_COLORS[fv.id] : grp.key === 'visual' ? VIS_COLORS[fv.id] : 'transparent';
          return (
            <button
              key={fv.id}
              className="dc-facet-row"
              onClick={() => onToggle(fv.id)}
              style={{
                display: 'flex',
                width: '100%',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 10,
                padding: '7px 6px 7px 8px',
                background: on ? C.navy : 'transparent',
                color: on ? '#FFFFFF' : C.body,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, background: on ? '#FFFFFF' : baseDot || 'transparent', display: 'inline-block' }} />
                <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: on ? 700 : 500, letterSpacing: '0.02em' }}>
                  {on ? '✕ ' : ''}
                  {fv.label}
                </span>
              </span>
              <span style={{ fontFamily: MONO, fontSize: 10.5 }}>{fv.count}</span>
            </button>
          );
        })
      )}
    </div>
  );
}

function MixedGrid({ results, onOpen }: { results: IndexItem[]; onOpen: (id: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 4 }}>
      {results.map((r) => {
        const typeColor = TYPE_COLORS[r.type] || C.navy;
        return (
          <button
            key={r.id}
            className="dc-row-hover"
            onClick={() => onOpen(r.id)}
            style={{ display: 'block', width: '100%', borderBottom: `1px solid ${C.hairLight}`, padding: '20px 24px 22px 0', marginRight: 24 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 9, height: 9, background: typeColor, display: 'inline-block' }} />
                <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: C.secondary }}>{r.typeLabel}</span>
              </span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.04em', color: C.tertiary }}>{r.stamp}</span>
            </div>
            {r.isVisual && (
              <div
                style={{
                  height: 120,
                  marginTop: 12,
                  background: `repeating-linear-gradient(45deg, ${C.sunken}, ${C.sunken} 8px, ${C.canvas} 8px, ${C.canvas} 16px)`,
                  border: `1px solid ${C.hairMed}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.tertiary, textAlign: 'center' }}>[ {r.cropNote} ]</span>
              </div>
            )}
            <div className="dc-title-link" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 19, lineHeight: 1.2, marginTop: 10, color: C.ink }}>
              {r.title}
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 13.5, lineHeight: 1.5, color: C.secondary, marginTop: 6 }}>{r.snippet}</div>
          </button>
        );
      })}
    </div>
  );
}

function VisualWall({ results, onOpen }: { results: IndexItem[]; onOpen: (id: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginTop: 20 }}>
      {results.map((r) => {
        const typeColor = TYPE_COLORS[r.type] || C.navy;
        return (
          <button key={r.id} className="dc-wall-tile" onClick={() => onOpen(r.id)} style={{ display: 'block', width: '100%' }}>
            <div
              className="dc-wall-frame"
              style={{
                height: r.wallHeight || '200px',
                background: `repeating-linear-gradient(45deg, ${C.sunken}, ${C.sunken} 8px, ${C.canvas} 8px, ${C.canvas} 16px)`,
                border: `1px solid ${C.hairMed}`,
                borderTop: `3px solid ${typeColor}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.tertiary, textAlign: 'center', padding: '0 10px', lineHeight: 1.6 }}>
                [ {r.cropNote} ]<br />drop real crop here
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 9, height: 9, background: typeColor, display: 'inline-block' }} />
                <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', color: C.secondary }}>{r.typeLabel}</span>
              </span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.tertiary }}>{r.stamp}</span>
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 1.45, color: C.body, marginTop: 5 }}>{r.caption}</div>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.05em', color: C.tertiary, marginTop: 5 }}>CAPTION TRANSCRIBED BY AI</div>
          </button>
        );
      })}
    </div>
  );
}

function NoResults({ onClearAll, real }: { onClearAll: () => void; real: boolean }) {
  return (
    <div style={{ marginTop: 48, border: `1px solid ${C.hairMed}`, padding: 44, textAlign: 'center' }}>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 26, color: C.ink }}>Nothing filed under that combination — yet.</div>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', color: C.tertiary, marginTop: 12, lineHeight: 1.8 }}>
        {real ? (
          <>
            REAL DATA — TOPIC &amp; NAME FACETS ARE EMPTY UNTIL ENRICHMENT RUNS.
            <br />
            TRY A TYPE OR PICTURES &amp; ADS FILTER.
          </>
        ) : (
          <>
            DEMO NOTE — THE MOCK INDEX HOLDS 12 HAND-AUTHORED OBJECTS.
            <br />
            THE LIVE INDEX WOULD HOLD EVERY EXTRACTED ATTRIBUTE, 1892–1975.
          </>
        )}
      </div>
      <button
        className="dc-btn-ghost"
        onClick={onClearAll}
        style={{ display: 'inline-block', marginTop: 20, fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', border: `1px solid ${C.navy}`, padding: '9px 18px', color: C.navy }}
      >
        CLEAR FILTERS →
      </button>
    </div>
  );
}
