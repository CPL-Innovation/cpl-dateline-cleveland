import type { Dataset, Fact, IndexItem } from '../lib/types';
import { TYPE_COLORS } from '../lib/types';
import { C, MONO, SANS, SERIF } from '../lib/ui';
import { BackBar, ClippingFrame, FactsTable, HonestyBox, Transcription } from './detailParts';

export function IndexDetail({ item, dataset, onBack }: { item: IndexItem; dataset: Dataset; onBack: () => void }) {
  const labelOf = (id: string): string | null => {
    for (const g of dataset.facetDefs) {
      const v = g.values.find((x) => x.id === id);
      if (v) return v.label;
    }
    return null;
  };

  const color = TYPE_COLORS[item.type] || C.navy;
  const facts: Fact[] = [
    { label: 'TYPE', value: labelOf(item.type) || item.typeLabel },
    { label: 'DATELINE', value: item.stamp },
    { label: 'EXTRACTED FROM', value: item.clipNote },
    { label: 'SOURCE', value: item.credit.replace('SOURCE: ', '') },
  ];

  const tagIds = [...item.topics, ...item.names, item.type, ...(item.vis ? [item.vis] : [])];
  const tags = tagIds.map(labelOf).filter((x): x is string => Boolean(x));

  return (
    <div className="dc-shell" style={{ padding: '28px 32px 80px' }}>
      <BackBar label="BACK TO THE INDEX" right={item.stamp} onBack={onBack} />

      <div style={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: 48, marginTop: 36 }}>
        <div>
          <ClippingFrame height={480} clipNote={item.clipNote} credit={item.credit} />
          <Transcription text={item.transcript} />
        </div>

        <div style={{ borderLeft: `1px solid ${C.hairMed}`, paddingLeft: 48 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, background: color }} />
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em', color: C.secondary }}>
              {item.typeLabel} · MACHINE-EXTRACTED
            </div>
          </div>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 38, lineHeight: 1.1, marginTop: 8, color: C.ink }}>
            {item.title}
          </div>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 17, color: C.secondary, marginTop: 12, lineHeight: 1.5 }}>
            {item.snippet}
          </div>

          <FactsTable facts={facts} />

          <div style={{ marginTop: 24 }}>
            <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: C.ink }}>INDEXED UNDER</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {tags.length ? (
                tags.map((t, i) => (
                  <div key={i} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', border: `1px solid ${C.hairMed}`, padding: '4px 10px', color: C.body, background: C.canvas }}>
                    {t}
                  </div>
                ))
              ) : (
                <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.tertiary }}>NO ATTRIBUTES EXTRACTED YET</div>
              )}
            </div>
          </div>

          <HonestyBox>ATTRIBUTES MACHINE-EXTRACTED · CURATOR-REVIEWABLE · NOT EDITORIAL FACT</HonestyBox>
        </div>
      </div>
    </div>
  );
}
