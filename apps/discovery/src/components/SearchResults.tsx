import type { Dataset } from '../lib/types';
import { TYPE_COLORS } from '../lib/types';
import { searchItems } from '../lib/search';
import { C, MONO, SANS, SERIF } from '../lib/ui';

/**
 * Search results. Each row leads with WHERE the match landed and shows the phrase
 * in its printed context — for a newspaper index that context is the answer, not
 * decoration: it is what tells a reader whether "Novak" is their Novak.
 */
export function SearchResults({
  dataset,
  query,
  onOpen,
  onClear,
}: {
  dataset: Dataset;
  query: string;
  onOpen: (id: string) => void;
  onClear: () => void;
}) {
  const hits = searchItems(dataset, query);
  const real = dataset.mode === 'real';

  return (
    <div className="dc-shell" style={{ padding: '28px 32px 80px' }}>
      <div style={{ borderBottom: `1px solid ${C.hairMed}`, paddingBottom: 18 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em', color: C.secondary }}>
          SEARCH RESULTS
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 24, marginTop: 8 }}>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 34, lineHeight: 1.15, color: C.ink }}>
            “{query}”
          </div>
          <button
            className="dc-btn-ghost"
            onClick={onClear}
            style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', border: `1px solid ${C.hairMed}`, padding: '7px 14px', color: C.secondary, flexShrink: 0 }}
          >
            CLEAR SEARCH ✕
          </button>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.06em', color: C.tertiary, marginTop: 10 }}>
          {hits.length} {hits.length === 1 ? 'OBJECT' : 'OBJECTS'} OF {dataset.indexItems.length} INDEXED
          {' · '}MATCHES THE TRANSCRIBED TEXT, NOT ITS MEANING
        </div>
      </div>

      {hits.length === 0 ? (
        <div style={{ marginTop: 48, border: `1px solid ${C.hairMed}`, padding: 44, textAlign: 'center' }}>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 26, color: C.ink }}>
            Nothing in the transcribed text matches that.
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', color: C.tertiary, marginTop: 12, lineHeight: 1.8 }}>
            {real ? (
              <>
                REAL DATA — SEARCH COVERS ONLY THE PAGES INGESTED SO FAR.
                <br />
                THE FULL RUN IS 3,591 ISSUES; THIS PILOT HOLDS A FEW.
              </>
            ) : (
              <>
                DEMO NOTE — THE MOCK INDEX HOLDS 12 HAND-AUTHORED OBJECTS.
                <br />
                SWITCH TO REAL DATA TO SEARCH PIPELINE OUTPUT.
              </>
            )}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          {hits.map(({ item, fields, excerpt }) => {
            const typeColor = TYPE_COLORS[item.type] || C.navy;
            return (
              <button
                key={item.id}
                className="dc-row-hover"
                onClick={() => onOpen(item.id)}
                style={{ display: 'block', width: '100%', textAlign: 'left', borderBottom: `1px solid ${C.hairLight}`, padding: '22px 0 24px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 9, height: 9, background: typeColor, display: 'inline-block' }} />
                    <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: C.secondary }}>
                      {item.typeLabel}
                    </span>
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.04em', color: C.tertiary }}>{item.stamp}</span>
                </div>

                {/* Titleless objects show no headline; the excerpt below carries them. */}
                {item.title ? (
                  <div className="dc-title-link" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 21, lineHeight: 1.2, marginTop: 10, color: C.ink }}>
                    {item.title}
                  </div>
                ) : null}

                {excerpt ? (
                  <div style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.6, color: C.secondary, marginTop: 8 }}>
                    {excerpt.before}
                    <mark style={{ background: 'rgba(241,196,0,.42)', color: C.ink, padding: '0 2px' }}>{excerpt.hit}</mark>
                    {excerpt.after}
                  </div>
                ) : (
                  <div style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.6, color: C.secondary, marginTop: 8 }}>{item.snippet}</div>
                )}

                <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.08em', color: C.tertiary, marginTop: 10 }}>
                  MATCHED IN {fields.join(' · ').toUpperCase()}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
