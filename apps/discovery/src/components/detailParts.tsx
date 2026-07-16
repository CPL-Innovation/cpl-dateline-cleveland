// Shared page-reader detail building blocks (the pattern both the calendar event
// detail and the index detail route into). discovery-ux-spec §4 "Page-reader detail".

import type { Fact } from '../lib/types';
import { C, MONO, SANS, SERIF } from '../lib/ui';

export function BackBar({
  label,
  right,
  onBack,
}: {
  label: string;
  right: string;
  onBack: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 16,
        borderBottom: `1px solid ${C.hairMed}`,
        paddingBottom: 14,
      }}
    >
      <button
        className="dc-underline-hover"
        onClick={onBack}
        style={{
          fontFamily: SANS,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.1em',
          color: C.navy,
        }}
      >
        ← {label}
      </button>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', color: C.secondary }}>
        {right}
      </div>
    </div>
  );
}

/** The keylined "source" frame. Renders the REAL ContentDM page image when one is
 *  available (SLICE-06); otherwise falls back to the striped clipping placeholder
 *  (MOCK data, or REAL data before the pages are harvested). */
export function ClippingFrame({
  height,
  clipNote,
  credit,
  pageImage,
  iiifId,
}: {
  height: number;
  clipNote: string;
  credit: string;
  pageImage?: string | null;
  iiifId?: string | null;
}) {
  // Committed images live at `<base>/pages/…` (BASE-prefixed); live-ingested pages
  // (SLICE-08) carry an absolute ContentDM IIIF URL — pass those through as-is.
  const src = pageImage
    ? (/^https?:\/\//.test(pageImage) ? pageImage : import.meta.env.BASE_URL + pageImage)
    : null;
  // Full-res deep-zoom is ContentDM's own IIIF viewer — no tiling server of our own.
  const readerHref = iiifId ? `${iiifId}/full/full/0/default.jpg` : undefined;
  return (
    <div>
      <div
        style={{
          fontFamily: SANS,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.18em',
          color: C.secondary,
          marginBottom: 10,
        }}
      >
        THE SOURCE, AS PRINTED
      </div>
      <div style={{ border: `1px solid ${C.hairMed}`, background: C.canvas, padding: 14 }}>
        {src ? (
          <a
            href={readerHref}
            target="_blank"
            rel="noreferrer"
            title="Open the full-resolution page on CPL's ContentDM IIIF"
            style={{
              display: 'block',
              maxHeight: height,
              overflow: 'hidden',
              border: `1px solid ${C.hairLight}`,
              background: C.sunken,
              cursor: readerHref ? 'zoom-in' : 'default',
            }}
          >
            <img
              src={src}
              alt="The source page, as printed — scanned from CPL's ContentDM"
              loading="lazy"
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          </a>
        ) : (
          <div
            style={{
              height,
              background: `repeating-linear-gradient(45deg, ${C.sunken}, ${C.sunken} 10px, ${C.canvas} 10px, ${C.canvas} 20px)`,
              border: `1px solid ${C.hairLight}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.secondary, textAlign: 'center', lineHeight: 1.7 }}>
              [ SOURCE CLIPPING — HALFTONE SCAN ]
              <br />
              {clipNote}
              <br />
              IIIF region crop · drop real scan here
            </div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.06em', color: C.secondary }}>
            {credit}
          </div>
          <a
            className="dc-btn-primary"
            href={readerHref}
            target="_blank"
            rel="noreferrer"
            title={
              readerHref
                ? "Open the full-resolution page on CPL's ContentDM IIIF"
                : 'Deep-zoom IIIF page reader — surface not built in this prototype'
            }
            style={{
              fontFamily: SANS,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.12em',
              border: `1px solid ${C.navy}`,
              padding: '5px 12px',
              background: C.navy,
              color: C.canvas,
              textDecoration: 'none',
              pointerEvents: readerHref ? 'auto' : 'none',
              opacity: readerHref ? 1 : 0.85,
            }}
          >
            OPEN IN PAGE READER ⤢
          </a>
        </div>
      </div>
    </div>
  );
}

export function Transcription({ text }: { text: string }) {
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: C.ink }}>
          TRANSCRIPTION
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: '0.06em',
            color: C.tertiary,
            border: `1px solid ${C.hairMed}`,
            padding: '2px 7px',
          }}
        >
          TRANSCRIBED BY AI — MAY CONTAIN ERRORS
        </div>
      </div>
      <div
        style={{
          fontFamily: SERIF,
          fontSize: 16.5,
          lineHeight: 1.65,
          marginTop: 12,
          maxWidth: '62ch',
          color: C.body,
          whiteSpace: 'pre-wrap',
        }}
      >
        {text}
      </div>
    </div>
  );
}

export function FactsTable({ facts }: { facts: Fact[] }) {
  return (
    <div style={{ marginTop: 28, borderTop: `1px solid ${C.body}` }}>
      {facts.map((f, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '130px 1fr',
            gap: 16,
            padding: '11px 0',
            borderBottom: `1px solid ${C.hairMed}`,
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.1em', color: C.tertiary, paddingTop: 2 }}>
            {f.label}
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 15, color: C.body }}>{f.value}</div>
        </div>
      ))}
    </div>
  );
}

export function HonestyBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 22,
        fontFamily: MONO,
        fontSize: 10.5,
        lineHeight: 1.7,
        color: C.tertiary,
        border: `1px solid ${C.hairMed}`,
        padding: '10px 12px',
        background: C.canvas,
      }}
    >
      {children}
    </div>
  );
}
