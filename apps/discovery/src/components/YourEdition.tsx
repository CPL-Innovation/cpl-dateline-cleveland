// Your Edition (SLICE-15) — the third way to open an issue: an interview on the
// left, and on the right a blank sheet with only a nameplate, which fills in one
// section per pick until it is a four-section paper of the patron's own.
//
// Two things this surface deliberately does NOT do. It has no editing: the right
// pane is the paper's, set in type, and the patron watches it become theirs. And
// it has no blank canvas: every section starts from a card the issue can back,
// or — once, in the last round — from the patron's own question.

import { useState } from 'react';
import type { Dataset, IndexItem } from '../lib/types';
import type { ShelfIssue } from '../lib/shelf';
import { REGISTER_OPTIONS, ROLE_OPTIONS, type Built, type Crop, type EditionState } from '../lib/edition';
import { requestPodcast, voiceable } from '../lib/podcast';
import { C, MONO, SANS, SERIF } from '../lib/ui';

interface Props {
  issue: ShelfIssue;
  dataset: Dataset;
  ed: EditionState;
  /** Into SCAN, onto this item's box on its own leaf. */
  onSeeOnPage: (id: string) => void;
  /** To the podcast page for this episode (SLICE-16). */
  onPodcast: (id: string) => void;
}

export function YourEdition({ issue, dataset, ed, onSeeOnPage, onPodcast }: Props) {
  if (ed.phase === 'loading') {
    return <Frame><div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', color: C.tertiary, padding: '60px 0' }}>OPENING THE ISSUE…</div></Frame>;
  }
  if (ed.phase === 'unavailable') {
    return (
      <Frame>
        <div style={{ maxWidth: 620, margin: '56px auto', border: `1px solid ${C.hairMed}`, padding: 32 }}>
          <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.14em', color: C.tertiary }}>YOUR EDITION IS UNAVAILABLE HERE</div>
          <div style={{ fontFamily: SERIF, fontSize: 18, lineHeight: 1.6, color: C.body, marginTop: 10 }}>{ed.reason}</div>
        </div>
      </Frame>
    );
  }
  return (
    <Frame>
      <div className="dc-edition-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) minmax(0, 1fr)', gap: 40, alignItems: 'start', paddingTop: 32 }}>
        <div className="dc-noprint" style={{ position: 'sticky', top: 84 }}>
          <Intro />
          {ed.phase === 'interview' && <Interview ed={ed} />}
          {ed.phase === 'card' && <CardConfirm ed={ed} />}
          {(ed.phase === 'build' || ed.phase === 'done') && <Build ed={ed} issue={issue} onPodcast={onPodcast} />}
        </div>
        <Sheet issue={issue} dataset={dataset} ed={ed} onSeeOnPage={onSeeOnPage} />
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="dc-shell" style={{ padding: '0 32px 80px' }}>{children}</div>;
}

const Spark = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 1.5c.5 4.9 1.9 7.9 4 9.1 1.6.9 3.7 1.3 6.5 1.4-2.8.1-4.9.5-6.5 1.4-2.1 1.2-3.5 4.2-4 9.1-.5-4.9-1.9-7.9-4-9.1C6.4 12.5 4.3 12.1 1.5 12c2.8-.1 4.9-.5 6.5-1.4 2.1-1.2 3.5-4.2 4-9.1z" />
  </svg>
);

function Intro() {
  return (
    <div style={{ borderBottom: `1px solid ${C.hairLight}`, paddingBottom: 14, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.18em', color: C.navy }}>
        <Spark /> MAKE YOUR EDITION
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.55, color: C.secondary, marginTop: 6 }}>
        A four-section paper of your own, written by AI from this issue’s published pages — nothing else.
      </div>
    </div>
  );
}

/* ── Phase 1: the interview ────────────────────────────────────────────────── */

function Dots({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} aria-label={`Question ${step + 1} of 3`}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: i === step ? 22 : 8, height: 8, background: i <= step ? C.navy : C.hairMed, transition: 'width 0.2s ease' }} />
      ))}
      <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.08em', color: C.tertiary, marginLeft: 6 }}>{step + 1} OF 3</span>
    </div>
  );
}

function Question({ text, hint }: { text: string; hint?: string }) {
  return (
    <div style={{ margin: '14px 0 14px' }}>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 25, lineHeight: 1.2, color: C.ink }}>{text}</div>
      {hint && <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.08em', color: C.tertiary, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

function Choice({ label, note, on, onClick, disabled }: { label: string; note?: string; on?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className="dc-edition-choice"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', textAlign: 'left',
        padding: '14px 16px', border: `1px solid ${on ? C.navy : C.hairMed}`, background: on ? 'rgba(0,87,183,0.06)' : C.canvas,
        boxShadow: on ? `inset 3px 0 0 ${C.navy}` : 'none', opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span>
        <span style={{ display: 'block', fontFamily: SERIF, fontSize: 17, fontWeight: 600, lineHeight: 1.3, color: C.ink }}>{label}</span>
        {note && <span style={{ display: 'block', fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.05em', color: C.tertiary, marginTop: 3 }}>{note}</span>}
      </span>
      {on !== undefined && (
        <span style={{ width: 16, height: 16, flexShrink: 0, border: `1.5px solid ${on ? C.navy : C.hairMed}`, background: on ? C.navy : 'transparent', color: C.canvas, fontSize: 11, lineHeight: '13px', textAlign: 'center' }}>
          {on ? '✓' : ''}
        </span>
      )}
    </button>
  );
}

function Interview({ ed }: { ed: EditionState }) {
  const back = (n: number) => (
    <button className="dc-underline-hover" onClick={() => ed.toStep(n)} style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: C.navy }}>← BACK</button>
  );
  return (
    <div>
      <Dots step={ed.step} />
      {ed.step === 0 && (
        <>
          <Question text="What brings you here?" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ROLE_OPTIONS.map((r) => <Choice key={r.id} label={r.label} onClick={() => ed.chooseRole(r.id)} />)}
          </div>
        </>
      )}
      {ed.step === 1 && (
        <>
          <Question text="What catches your eye?" hint="PICK ONE TO THREE — ONLY WHAT THIS ISSUE HAS" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(ed.index?.interests ?? []).map((i) => {
              const on = ed.draft.interests.includes(i.id);
              return (
                <Choice
                  key={i.id} label={i.label.charAt(0).toUpperCase() + i.label.slice(1)} note={`${i.count} ITEMS IN THIS ISSUE`}
                  on={on} disabled={!on && ed.draft.interests.length >= 3} onClick={() => ed.toggleInterest(i.id)}
                />
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            {back(0)}
            <button
              className="dc-btn-primary" onClick={() => ed.toStep(2)} disabled={!ed.draft.interests.length}
              style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em', padding: '10px 18px', border: `1px solid ${C.navy}`, background: ed.draft.interests.length ? C.navy : C.sunken, color: ed.draft.interests.length ? C.canvas : C.tertiary }}
            >
              NEXT →
            </button>
          </div>
        </>
      )}
      {ed.step === 2 && (
        <>
          <Question text="How do you like it served?" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {REGISTER_OPTIONS.map((r) => <Choice key={r.id} label={r.label} note={r.note.toUpperCase()} onClick={() => ed.chooseRegister(r.id)} />)}
          </div>
          <div style={{ marginTop: 16 }}>{back(1)}</div>
        </>
      )}
    </div>
  );
}

/** The transparency moment: the lens, shown back before it colours anything. */
function CardConfirm({ ed }: { ed: EditionState }) {
  return (
    <div>
      <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: C.tertiary }}>YOUR READER CARD</div>
      <div style={{ marginTop: 10, border: `1px solid ${C.hairMed}`, borderTop: `3px solid ${C.marigold}`, padding: '18px 18px 16px', background: C.canvas }}>
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 21, lineHeight: 1.35, color: C.ink }}>{ed.label}</div>
        <div style={{ fontFamily: SERIF, fontSize: 13.5, lineHeight: 1.55, color: C.secondary, marginTop: 10 }}>
          This is the lens. It decides which cards you’re offered and how each section is written — it never adds anything that isn’t in the paper.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button className="dc-btn-primary" onClick={ed.begin} style={{ flex: 1, fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', padding: '12px 16px', border: `1px solid ${C.navy}`, background: C.navy, color: C.canvas }}>
          START MY EDITION →
        </button>
        <button className="dc-btn-ghost" onClick={ed.redo} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', padding: '12px 16px', border: `1px solid ${C.hairMed}`, color: C.secondary }}>
          REDO
        </button>
      </div>
    </div>
  );
}

/* ── Phase 2: the build game ───────────────────────────────────────────────── */

function Build({ ed, issue, onPodcast }: { ed: EditionState; issue: ShelfIssue; onPodcast: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const n = ed.sections.length;
  const round = Math.min(n + 1, ed.maxSections);
  const done = ed.phase === 'done';
  const lastIsOwn = done && ed.sections[n - 1]?.cardId === null;
  const regensLeft = ed.maxRegenerates - ed.regeneratesUsed;
  const outOfTurns = ed.callsUsed >= ed.maxCalls;

  const copy = async () => {
    const url = ed.shareLink();
    try { await navigator.clipboard.writeText(url); } catch { /* shown below regardless */ }
    setCopied(ed.sections.some((b) => b.cardId === null)
      ? 'Link copied. It carries your picks, not the text — and not your own question, which stays yours.'
      : 'Link copied. It carries your picks, not the text; opening it rebuilds this edition.');
  };

  return (
    <div>
      {/* four segments: the fixed length, visible from the start */}
      <div style={{ display: 'flex', gap: 4 }} aria-label={`${n} of ${ed.maxSections} sections set`}>
        {Array.from({ length: ed.maxSections }, (_, i) => (
          <span key={i} style={{ flex: 1, height: 5, background: i < n ? C.navy : i === n && ed.writing ? C.marigold : C.hairLight }} />
        ))}
      </div>

      {!done ? (
        <>
          <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.1em', color: C.tertiary, marginTop: 12 }}>ROUND {round} OF {ed.maxSections}</div>
          <Question text={ed.writing ? `Setting section ${n + 1} in type…` : round === ed.maxSections ? 'Last one — pick a card, or ask your own' : `Pick what goes in section ${n + 1}`} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ed.deal ? ed.deal.cards.map((c) => (
              <Choice key={c.id} label={c.text} note={`FROM ${c.count} ITEM${c.count === 1 ? '' : 'S'} IN THIS ISSUE`} onClick={() => ed.pick(c)} disabled={!!ed.writing || outOfTurns} />
            )) : !ed.writing && (
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', color: C.tertiary, padding: '10px 0' }}>DEALING…</div>
            )}
            {ed.deal?.freeTextAllowed && (
              <FreeText value={q} onChange={setQ} disabled={!!ed.writing || outOfTurns} placeholder="Ask this paper anything…"
                onSubmit={() => { ed.ask(q); setQ(''); }} />
            )}
          </div>
        </>
      ) : (
        <>
          <Question text="Your edition is complete." />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="dc-btn-primary" onClick={() => window.print()} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', padding: '11px 16px', border: `1px solid ${C.navy}`, background: C.navy, color: C.canvas }}>PRINT</button>
            <button className="dc-btn-ghost" onClick={copy} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', padding: '11px 16px', border: `1px solid ${C.hairMed}`, color: C.secondary }}>COPY LINK</button>
            <button className="dc-btn-ghost" onClick={ed.startOver} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', padding: '11px 16px', border: `1px solid ${C.hairMed}`, color: C.secondary }}>START OVER</button>
          </div>
          {copied && <div style={{ fontFamily: SERIF, fontSize: 13.5, lineHeight: 1.5, color: C.secondary, marginTop: 10 }}>{copied}</div>}
          <ListenCard ed={ed} issue={issue} onPodcast={onPodcast} />
          {lastIsOwn && regensLeft > 0 && (
            <div style={{ marginTop: 18, borderTop: `1px solid ${C.hairLight}`, paddingTop: 14 }}>
              <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', color: C.tertiary }}>
                NOT WHAT YOU MEANT? ASK IT ANOTHER WAY · {Math.max(0, regensLeft)} LEFT
              </div>
              <div style={{ marginTop: 8 }}>
                <FreeText value={q} onChange={setQ} disabled={!!ed.writing} placeholder="Ask it another way…"
                  onSubmit={() => { ed.ask(q, true); setQ(''); }} />
              </div>
            </div>
          )}
        </>
      )}

      {ed.notice && (
        <div role="status" style={{ marginTop: 14, borderLeft: `3px solid ${C.marigold}`, background: C.sunken, padding: '10px 12px', fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.5, color: C.body }}>
          {ed.notice}
        </div>
      )}
      {ed.sharedNote && (
        <div style={{ marginTop: 14, fontFamily: SERIF, fontStyle: 'italic', fontSize: 13.5, lineHeight: 1.5, color: C.secondary }}>{ed.sharedNote}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 18, borderTop: `1px solid ${C.hairLight}`, paddingTop: 10, fontFamily: MONO, fontSize: 9, lineHeight: 1.6, letterSpacing: '0.06em', color: C.tertiary }}>
        <span>✦ AI (CLAUDE SONNET) · WRITTEN ONLY FROM THIS ISSUE · WRITING TURNS {ed.callsUsed}/{ed.maxCalls}</span>
        {!done && <button className="dc-underline-hover" onClick={ed.redo} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.06em', color: C.navy, flexShrink: 0 }}>CHANGE CARD</button>}
      </div>
    </div>
  );
}

/** Your Edition, read aloud (SLICE-16): the way from a finished paper to its episode. */
const LISTEN_MINUTES: Record<string, string> = { quick: 'about 3–4 minutes', full: 'about 6–8 minutes', ten: 'about 4 minutes', facts: 'about 4 minutes' };

function ListenCard({ ed, issue, onPodcast }: { ed: EditionState; issue: ShelfIssue; onPodcast: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pod = ed.index?.podcast;
  const signed = voiceable(ed.sections);
  const reason = !pod ? 'Audio editions aren’t available from this reading room yet.'
    : !pod.available ? pod.reason
    : !signed ? 'This edition was made before audio editions existed — start over to make one that can be read aloud.'
    : null;
  const go = async () => {
    if (busy || reason || !ed.card || issue.pointer == null) return;
    setBusy(true); setErr(null);
    try {
      const r = await requestPodcast(issue.pointer, ed.card, ed.label ?? '', ed.sections);
      onPodcast(r.id);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="dc-noprint" style={{ marginTop: 18, border: `1px solid ${C.hairMed}`, borderTop: `3px solid ${C.marigold}`, background: C.canvas, padding: '14px 16px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', color: C.tertiary }}>
        <Spark size={10} /> NEW · HEAR IT
      </div>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 19, lineHeight: 1.25, color: C.ink, marginTop: 6 }}>Turn it into a podcast</div>
      <div style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 1.5, color: C.secondary, marginTop: 4 }}>
        Two AI hosts talk you through your four sections — {LISTEN_MINUTES[ed.card?.register ?? 'quick']}, with the transcript to read along.
      </div>
      <button
        onClick={go} disabled={!!reason || busy}
        className={reason ? undefined : 'dc-btn-primary'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%', marginTop: 12,
          fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', padding: '12px 16px',
          border: `1px solid ${reason ? C.hairMed : C.ink}`, background: reason ? C.sunken : C.ink, color: reason ? C.tertiary : C.canvas,
          cursor: reason ? 'not-allowed' : busy ? 'progress' : 'pointer',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {busy ? 'BOOKING THE STUDIO…' : 'MAKE THE PODCAST →'}
      </button>
      {(reason || err) && (
        <div role="status" style={{ fontFamily: SERIF, fontSize: 13.5, lineHeight: 1.5, color: C.secondary, marginTop: 8 }}>{err ?? reason}</div>
      )}
    </div>
  );
}

function FreeText({ value, onChange, onSubmit, disabled, placeholder }: {
  value: string; onChange: (s: string) => void; onSubmit: () => void; disabled?: boolean; placeholder: string;
}) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit(); }}
      className="dc-composer"
      style={{ display: 'flex', gap: 6, border: `1px solid ${C.hairMed}`, background: C.canvas, padding: 5 }}
    >
      <input
        value={value} onChange={(e) => onChange(e.target.value.slice(0, 300))} disabled={disabled} placeholder={placeholder}
        aria-label={placeholder}
        style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: SERIF, fontSize: 16, padding: '6px 8px', color: C.body }}
      />
      <button type="submit" disabled={disabled || !value.trim()} aria-label="Ask"
        style={{ width: 36, height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${value.trim() ? C.navy : C.hairLight}`, background: value.trim() ? C.navy : C.sunken, color: value.trim() ? C.canvas : C.tertiary }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M21.5 2.5 10.2 13.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21.5 2.5 14.6 21.5l-4.4-7.7-7.7-4.4 19-6.9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      </button>
    </form>
  );
}

/* ── the sheet: the zine itself ────────────────────────────────────────────── */

function Sheet({ issue, dataset, ed, onSeeOnPage }: { issue: ShelfIssue; dataset: Dataset; ed: EditionState; onSeeOnPage: (id: string) => void }) {
  const done = ed.phase === 'done';
  const byId = new Map(dataset.indexItems.map((i) => [i.id, i]));
  const slots = Array.from({ length: ed.maxSections }, (_, i) => i);
  let foot = 0;
  return (
    <article className="dc-edition-sheet" style={{ background: C.canvas, border: `1px solid ${C.hairMed}`, boxShadow: '0 16px 40px rgba(15,18,21,0.08)', padding: '34px 42px 40px' }}>
      {/* The nameplate completes when the edition does. */}
      <header style={{ textAlign: 'center', borderBottom: `3px double ${C.ink}`, paddingBottom: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.2em', color: done ? C.navy : C.tertiary }}>
          {done ? 'YOUR EDITION' : `YOUR EDITION — ${ed.sections.length} OF ${ed.maxSections} SECTIONS SET`}
        </div>
        <div style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 44, lineHeight: 1.05, color: C.ink, marginTop: 8 }}>{issue.serial}</div>
        <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.16em', color: C.secondary, marginTop: 8 }}>
          {issue.serial.toUpperCase()} · YOUR EDITION · {issue.dateLabel.toUpperCase()}
        </div>
        {ed.label && (ed.phase === 'build' || done) && (
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 15, color: done ? C.body : C.tertiary, marginTop: 8 }}>{ed.label}</div>
        )}
      </header>

      {slots.map((i) => {
        const b = ed.sections[i];
        if (b) {
          const start = foot + 1;
          foot += b.section.references.length;
          return <SectionBlock key={i} n={i + 1} b={b} byId={byId} footStart={start} onSeeOnPage={onSeeOnPage} />;
        }
        if (i === ed.sections.length && ed.writing) return <Writing key={i} n={i + 1} w={ed.writing} />;
        return (
          <div key={i} className="dc-noprint" style={{ marginTop: 26, border: `1px dashed ${C.hairMed}`, padding: '22px 20px', textAlign: 'center', fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.12em', color: C.hairMed }}>
            SECTION {i + 1} — {ed.phase === 'build' || done ? 'YOURS TO PICK' : 'WAITING FOR YOUR READER CARD'}
          </div>
        );
      })}

      {done && (
        <footer style={{ marginTop: 30, borderTop: `1px solid ${C.hairMed}`, paddingTop: 10, fontFamily: MONO, fontSize: 9, lineHeight: 1.7, letterSpacing: '0.06em', color: C.tertiary, textAlign: 'center' }}>
          WRITTEN BY AI (CLAUDE SONNET) FROM THE PUBLISHED PAGES OF {issue.serial.toUpperCase()}, {issue.dateLabel.toUpperCase()} · CLEVELAND PUBLIC LIBRARY
        </footer>
      )}
    </article>
  );
}

function Kicker({ text }: { text: string }) {
  return <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.16em', color: C.navy, textTransform: 'uppercase' }}>{text}</div>;
}

function SectionBlock({ n, b, byId, footStart, onSeeOnPage }: {
  n: number; b: Built; byId: Map<string, IndexItem>;
  footStart: number; onSeeOnPage: (id: string) => void;
}) {
  const s = b.section;
  return (
    <section className="dc-edition-section" style={{ marginTop: 28, paddingTop: 22, borderTop: n === 1 ? 'none' : `1px solid ${C.hairLight}` }}>
      <div className="dc-keep-next" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <Kicker text={b.kicker} />
        <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.tertiary, flexShrink: 0 }}>NO. {n}</span>
      </div>
      <h2 className="dc-keep-next" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 28, lineHeight: 1.15, color: C.ink, margin: '8px 0 0', textWrap: 'balance' }}>{s.headline}</h2>
      <p style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 17, lineHeight: 1.68, color: C.body, margin: '10px 0 0' }}>
        {s.body}
        {/* comma-separated: "¹²³" would read as one hundred and twenty-three */}
        <sup className="dc-print-only">{s.references.map((_, i) => footStart + i).join(',')}</sup>
      </p>
      {s.beyondThisIssue && (
        <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 14.5, lineHeight: 1.55, color: C.secondary, margin: '8px 0 0' }}>
          Beyond this issue: {s.beyondThisIssue}
        </p>
      )}

      {/* References as the newsprint itself — each opens its leaf, box lit. */}
      <div className="dc-keep-whole" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14, alignItems: 'flex-start' }}>
        {s.crops.map((c) => <Reference key={c.id} c={c} item={byId.get(c.id)} onOpen={() => onSeeOnPage(c.id)} />)}
      </div>

      <ol className="dc-print-only dc-keep-whole" start={footStart} style={{ margin: '10px 0 0', paddingLeft: 18, fontFamily: SERIF, fontSize: 11, lineHeight: 1.5 }}>
        {s.crops.map((c) => {
          const it = byId.get(c.id);
          return <li key={c.id}>{it?.title ?? c.title ?? it?.typeLabel ?? 'Untitled item'} — page {it?.printedPage ?? c.page} ({c.id})</li>;
        })}
      </ol>

      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', color: C.tertiary, marginTop: 10 }}>
        WRITTEN BY AI FROM THIS ISSUE
      </div>
    </section>
  );
}

function Reference({ c, item, onOpen }: { c: Crop; item?: IndexItem; onOpen: () => void }) {
  const label = item?.title ?? c.title ?? item?.typeLabel ?? 'item';
  const page = item?.printedPage ?? c.page;
  if (!c.url) {
    // Unlocated on the leaf: a titled chip, never an invented crop.
    return (
      <button onClick={onOpen} className="dc-btn-ghost" title={`See it on page ${page}`}
        style={{ border: `1px solid ${C.hairMed}`, borderBottom: `2px solid ${C.navy}`, background: C.sunken, padding: '6px 9px', textAlign: 'left', maxWidth: 200 }}>
        <span style={{ display: 'block', fontFamily: MONO, fontSize: 9, color: C.navy }}>P.{page}</span>
        <span style={{ display: 'block', fontFamily: SANS, fontSize: 11.5, color: C.body }}>{label.slice(0, 48)}</span>
      </button>
    );
  }
  return (
    <button onClick={onOpen} title={`${label} — see it on page ${page}`} className="dc-edition-crop"
      style={{ padding: 0, border: `1px solid ${C.hairMed}`, background: C.canvas, textAlign: 'left', width: 150 }}>
      <img src={c.url} alt={`The printed ${label}, page ${page}`} loading="lazy"
        style={{ display: 'block', width: '100%', height: 110, objectFit: 'cover', objectPosition: 'top center', filter: 'grayscale(1) contrast(1.05)' }} />
      <span style={{ display: 'flex', gap: 5, alignItems: 'baseline', padding: '5px 7px', borderTop: `1px solid ${C.hairLight}` }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.navy, flexShrink: 0 }}>P.{page}</span>
        <span style={{ fontFamily: SANS, fontSize: 10.5, color: C.body, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      </span>
    </button>
  );
}

function Writing({ n, w }: { n: number; w: { kicker: string; headline?: string; body?: string } }) {
  return (
    <section style={{ marginTop: 28, paddingTop: 22, borderTop: n === 1 ? 'none' : `1px solid ${C.hairLight}` }} aria-live="polite">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <Kicker text={w.kicker} />
        <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.tertiary }}>NO. {n}</span>
      </div>
      {w.headline
        ? <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 28, lineHeight: 1.15, color: C.ink, margin: '8px 0 0' }}>{w.headline}</h2>
        : <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', color: C.tertiary, marginTop: 12 }}>READING THE ISSUE…</div>}
      {w.body && (
        <p style={{ fontFamily: SERIF, fontSize: 17, lineHeight: 1.68, color: C.body, margin: '10px 0 0' }}>
          {w.body}<span style={{ display: 'inline-block', width: 7, height: 16, background: C.navy, marginLeft: 3, verticalAlign: '-2px' }} />
        </p>
      )}
    </section>
  );
}
