import { navigate, staffHref } from '../lib/router';
import { C, MONO } from '../lib/ui';

export function Footer() {
  return (
    <div style={{ borderTop: `3px solid ${C.navy}`, background: C.navy, color: C.hairMed }}>
      <div
        className="dc-shell"
        style={{
          padding: '20px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 24,
          fontFamily: MONO,
          fontSize: 10.5,
          letterSpacing: '0.08em',
          lineHeight: 1.7,
        }}
      >
        <div>
          DATELINE CLEVELAND · A PATRON-DISCOVERY CONCEPT DEMO ·{' '}
          <a
            href={staffHref}
            onClick={(e) => {
              e.preventDefault();
              navigate('staff');
            }}
            style={{ color: '#FFFFFF' }}
          >
            STAFF WORKBENCH →
          </a>
          <br />
          TRANSCRIPTIONS BY AI · ATTRIBUTES MACHINE-EXTRACTED, CURATOR-REVIEWABLE
        </div>
        <div style={{ textAlign: 'right', color: C.hairMed }}>
          PILOT MATERIAL TREATED AS PUBLIC DOMAIN
          <br />
          NOT THE LIVE COLLECTION
        </div>
      </div>
    </div>
  );
}
