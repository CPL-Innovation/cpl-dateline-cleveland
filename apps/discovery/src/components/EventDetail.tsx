import type { CalendarEvent } from '../lib/types';
import { C, MONO, SERIF } from '../lib/ui';
import { sourcePhrase } from '../lib/calendar';
import { BackBar, ClippingFrame, FactsTable, HonestyBox, Transcription } from './detailParts';

export function EventDetail({ event, onBack }: { event: CalendarEvent; onBack: () => void }) {
  return (
    <div className="dc-shell" style={{ padding: '28px 32px 80px' }}>
      <BackBar label="BACK TO THE WEEK" right={`CLEVELAND · ${event.stamp}`} onBack={onBack} />

      <div style={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: 48, marginTop: 36 }}>
        <div>
          <ClippingFrame height={520} clipNote={event.clipNote} credit={event.credit} />
          <Transcription text={event.transcript} />
        </div>

        <div style={{ borderLeft: `1px solid ${C.hairMed}`, paddingLeft: 48 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em', color: C.secondary }}>{event.section}</div>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 40, lineHeight: 1.08, marginTop: 8, color: C.ink }}>
            {event.title}
          </div>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 17, color: C.secondary, marginTop: 12, lineHeight: 1.5 }}>
            {event.blurb}
          </div>

          <FactsTable facts={event.facts} />

          <HonestyBox>EVENT MACHINE-EXTRACTED FROM {sourcePhrase(event.sourceKind)} · CURATOR-REVIEWABLE · NOT EDITORIAL FACT</HonestyBox>
        </div>
      </div>
    </div>
  );
}
