// The reading-room assistant, as a surface: a floating call button in the corner
// of the reader, and the panel it opens.
//
// It is deliberately a READING companion, not a search box. It lives only inside
// an open issue, it is scoped to that issue's published text (the server assembles
// that corpus — see apps/pipeline/src/lib/chat.ts), and its citations are the
// point: every claim it makes is a chip that turns the reader to the item it came
// from. The patron can always go check.
//
// Two shapes, one conversation: a popover over the page, or — on a wide enough
// screen — a column docked beside it, so the patron can read and ask side by
// side. The reader owns the column (it has to make room for it); this component
// only renders into it, through a portal, so switching shapes never drops a turn.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Dataset, IndexItem } from '../lib/types';
import type { ShelfIssue } from '../lib/shelf';
import { parseAnswer, streamChat, ChatRefusal, type ChatTurn } from '../lib/chat';
import { C, MONO, SANS, SERIF } from '../lib/ui';

/** Mirrors CHAT_MAX_TURNS in the pipeline config — the server is the enforcer. */
const MAX_TURNS = 20;
/** The composer's frame padding, the same on every side — send button included. */
const COMPOSER_INSET = 5;
const COMPOSER_MAX_H = 116;   // ~5 lines, then it scrolls

interface Props {
  issue: ShelfIssue;
  dataset: Dataset;
  /** Turn the reader to an item the assistant cited. */
  onCite: (objectId: string) => void;
  /** Distance from the right edge. The scan room's transcription slip docks
   *  there; the call button steps aside rather than sitting on its buttons. */
  offsetRight?: number;
  /** Open/closed is the reader's to know — a docked panel takes page width. */
  open: boolean;
  onOpen: (open: boolean) => void;
  /** Docked beside the page rather than floating over it. */
  docked: boolean;
  /** The column the reader made for a docked panel; null until it has mounted. */
  dockSlot: HTMLElement | null;
  /** Switch shape. Absent when the window is too narrow for two columns. */
  onDock?: (docked: boolean) => void;
}

type Note = { kind: 'refusal' | 'error'; text: string };

export function IssueChat({
  issue, dataset, onCite, offsetRight = 24, open, onOpen: setOpen, docked, dockSlot, onDock,
}: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [pending, setPending] = useState('');   // the answer as it arrives
  const [note, setNote] = useState<Note | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);

  // Three states this surface can be in, and only one of them is a conversation:
  // MOCK has no real text behind it, and an issue with nothing published has
  // nothing to ground an answer in. Both say so rather than offering a dead box.
  const live = dataset.mode === 'real' && issue.pointer != null;
  const disabledReason = !live
    ? 'The assistant reads the pipeline’s published transcriptions — switch to REAL DATA to talk about a real issue.'
    : issue.publishedCount === 0
      ? 'Nothing from this issue has been published yet, so there is nothing for the assistant to read.'
      : null;

  const asked = turns.filter((t) => t.role === 'user').length;
  const atCap = asked >= MAX_TURNS;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, pending, note, open, docked, dockSlot]);

  useEffect(() => {
    if (open && !disabledReason) input.current?.focus();
  }, [open, docked, dockSlot, disabledReason]);

  // Esc closes the panel — but the reader also listens for Esc (it closes the
  // book), so this stops the event before it turns into a page you didn't ask for.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);    // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => abort.current?.abort(), []);

  // Closing is a gesture with a destination. The panel shrinks INTO the call
  // button — the one place it can be summoned from again — and the button lands
  // with a pop, a ring and a word, so nobody reads "✕" as "gone for good".
  // Opening is the same flight backwards: the panel grows OUT of the button.
  // Both are quick — a transition, not a show.
  const panelEl = useRef<HTMLDivElement | null>(null);
  const closing = useRef(false);
  const [landed, setLanded] = useState(false);
  const landTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(landTimer.current), []);
  const land = () => {
    setLanded(true);
    window.clearTimeout(landTimer.current);
    landTimer.current = window.setTimeout(() => setLanded(false), 4200);
  };
  const canAnimate = (el: HTMLElement | null): el is HTMLElement =>
    !!el && typeof el.animate === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The panel, folded into the call button: its icon sits 28px in from the
  // button's right and bottom edges.
  const folded = (el: HTMLElement): Keyframe => {
    const r = el.getBoundingClientRect();
    const dx = window.innerWidth - offsetRight - 28 - (r.left + r.width / 2);
    const dy = window.innerHeight - 24 - 28 - (r.top + r.height / 2);
    return { transform: `translate(${dx}px, ${dy}px) scale(0.06)`, opacity: 0.35, borderRadius: '50%' };
  };
  const unfolded: Keyframe = { transform: 'translate(0, 0) scale(1)', opacity: 1, borderRadius: '0px' };
  const FLIGHT_MS = 210;

  const close = () => {
    if (closing.current) return;
    const el = panelEl.current;
    const finish = () => { closing.current = false; setOpen(false); land(); };
    if (!canAnimate(el)) return finish();
    closing.current = true;
    const a = el.animate([unfolded, folded(el)], { duration: FLIGHT_MS, easing: 'cubic-bezier(.55,0,.75,.2)', fill: 'forwards' });
    a.onfinish = finish;
    a.oncancel = finish;
  };

  // Only an open the patron ASKED for grows out of the button; the panel that
  // is simply there when a book opens should just be there.
  const growIn = useRef(false);
  const openPanel = () => { setLanded(false); growIn.current = true; setOpen(true); };
  // Layout phase, so the first painted frame is already the folded one. Docked,
  // the panel only exists once the reader's column has mounted — hence dockSlot.
  useLayoutEffect(() => {
    if (!open || !growIn.current) return;
    const el = panelEl.current;
    if (!el) return;
    growIn.current = false;
    if (!canAnimate(el)) return;
    el.animate([folded(el), unfolded], { duration: FLIGHT_MS, easing: 'cubic-bezier(.25,.8,.45,1)' });
  }, [open, docked, dockSlot]);    // eslint-disable-line react-hooks/exhaustive-deps

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || streaming || atCap || disabledReason) return;
    const next: ChatTurn[] = [...turns, { role: 'user', content: q }];
    setTurns(next);
    setDraft('');
    setNote(null);
    setPending('');
    setStreaming(true);
    abort.current = new AbortController();
    let answer = '';
    try {
      await streamChat(issue.pointer!, next, (t) => { answer += t; setPending(answer); }, abort.current.signal);
      // An empty answer would otherwise vanish without trace.
      setTurns([...next, { role: 'assistant', content: answer || '(no answer)' }]);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        // Keep what already arrived — a stopped answer is still an answer.
        if (answer.trim()) setTurns([...next, { role: 'assistant', content: answer }]);
        else setTurns(turns);
      } else if (e instanceof ChatRefusal) {
        setNote({ kind: 'refusal', text: (e as Error).message });
      } else {
        setNote({ kind: 'error', text: (e as Error).message });
      }
    } finally {
      setPending('');
      setStreaming(false);
      abort.current = null;
    }
  };

  const reset = () => {
    abort.current?.abort();
    setTurns([]);
    setPending('');
    setNote(null);
  };

  const panel = (
    <div
      ref={panelEl}
      role={docked ? 'complementary' : 'dialog'}
      aria-label="Reading-room assistant"
      style={{
        ...(docked
          ? { flex: 1, minWidth: 0, borderLeft: `1px solid ${C.hairMed}` }
          : {
              position: 'fixed', right: offsetRight, bottom: 96, zIndex: 60,
              width: 390, maxWidth: 'calc(100vw - 48px)',
              height: 'min(640px, calc(100vh - 160px))',
              border: `1px solid ${C.hairMed}`,
            }),
        background: C.canvas,
        display: 'flex', flexDirection: 'column',
        ...(docked ? null : { boxShadow: '0 18px 48px rgba(15,18,21,0.18)' }),
      }}
    >
      <Header
        issue={issue}
        onClose={close}
        docked={docked}
        onDock={onDock}
      />

      <div ref={scroller} style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 8px' }}>
        {disabledReason ? (
          <Disabled text={disabledReason} />
        ) : turns.length === 0 && !pending ? (
          <Opening issue={issue} onPick={ask} />
        ) : (
          <>
            {turns.map((t, i) =>
              t.role === 'user' ? (
                <UserTurn key={i} text={t.content} />
              ) : (
                <AssistantTurn key={i} text={t.content} dataset={dataset} onCite={onCite} issue={issue} />
              ),
            )}
            {pending && <AssistantTurn text={pending} dataset={dataset} onCite={onCite} issue={issue} streaming />}
            {streaming && !pending && (
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', color: C.tertiary, marginTop: 14 }}>
                READING THE ISSUE…
              </div>
            )}
          </>
        )}

        {note && (
          <div
            style={{
              marginTop: 16, border: `1px solid ${note.kind === 'error' ? C.hairMed : C.marigold}`,
              borderLeft: `3px solid ${note.kind === 'error' ? C.tertiary : C.marigold}`,
              padding: '10px 12px', background: C.canvas,
            }}
          >
            <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.12em', color: C.tertiary }}>
              {note.kind === 'error' ? 'THE ASSISTANT IS UNAVAILABLE' : 'THE ASSISTANT STOPPED HERE'}
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.55, color: C.body, marginTop: 5 }}>
              {note.text}
            </div>
          </div>
        )}
      </div>

      {!disabledReason && (
        <Composer
          draft={draft}
          onDraft={setDraft}
          onSend={() => ask(draft)}
          onStop={() => abort.current?.abort()}
          onReset={reset}
          streaming={streaming}
          asked={asked}
          atCap={atCap}
          inputRef={input}
          serial={issue.serial}
        />
      )}
    </div>
  );

  return (
    <>
      {open && (docked ? dockSlot && createPortal(panel, dockSlot) : panel)}

      {/* Docked, the panel has its own close — a button floating over the page
          it sits beside would only cover the text. Closed, the button says what
          it is: an icon alone read as "support chat", which this is not. */}
      {!(open && docked) && (
        <button
          onClick={() => (open ? close() : openPanel())}
          title={open ? 'Close the reading-room assistant (Esc)' : `Ask ${issue.serial} — an AI that has read this issue`}
          aria-label={open ? 'Close the reading-room assistant' : `Ask ${issue.serial} — AI reading-room assistant`}
          className={landed ? 'dc-fab dc-fab-land' : 'dc-fab'}
          style={{
            position: 'fixed', right: offsetRight, bottom: 24, zIndex: 60,
            height: 56, minWidth: 56, borderRadius: 28,
            padding: open ? 0 : '0 6px 0 20px',
            background: open ? C.navyDeep : C.navy, color: C.canvas,
            border: `2px solid ${C.canvas}`, outline: `1px solid ${C.navy}`,
            boxShadow: '0 8px 24px rgba(0,40,90,0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          }}
        >
          {open ? (
            <span style={{ fontFamily: MONO, fontSize: 18, lineHeight: 1 }}>✕</span>
          ) : (
            <>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15, textAlign: 'left' }}>
                <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 15.5, whiteSpace: 'nowrap' }}>
                  {landed ? 'I’m right here' : 'Ask this paper'}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', opacity: 0.8, whiteSpace: 'nowrap' }}>
                  {landed ? 'CLICK TO REOPEN ANYTIME' : 'AI · ANSWERS FROM THESE PAGES'}
                </span>
              </span>
              <span style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Sparkle size={22} />
              </span>
            </>
          )}
        </button>
      )}
    </>
  );
}

/* ── panel parts ───────────────────────────────────────────────────────────── */

/** A four-point spark — the conventional mark for "AI made this", used sparingly. */
function Sparkle({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 1.5c.5 4.9 1.9 7.9 4 9.1 1.6.9 3.7 1.3 6.5 1.4-2.8.1-4.9.5-6.5 1.4-2.1 1.2-3.5 4.2-4 9.1-.5-4.9-1.9-7.9-4-9.1C6.4 12.5 4.3 12.1 1.5 12c2.8-.1 4.9-.5 6.5-1.4 2.1-1.2 3.5-4.2 4-9.1z" />
    </svg>
  );
}

/** The paper's face in the conversation: its initials, set like a masthead. */
function Monogram({ serial, size = 36, onNavy }: { serial: string; size?: number; onNavy?: boolean }) {
  const initials = serial.replace(/^the\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'relative', width: size, height: size, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: onNavy ? C.canvas : C.navy, color: onNavy ? C.navy : C.canvas,
        fontFamily: SERIF, fontWeight: 800, fontSize: size * 0.42, letterSpacing: '-0.02em',
      }}
    >
      {initials}
      <span style={{ position: 'absolute', right: -4, bottom: -4, width: size * 0.44, height: size * 0.44, borderRadius: '50%', background: C.marigold, color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${onNavy ? C.navy : C.canvas}` }}>
        <Sparkle size={size * 0.26} />
      </span>
    </span>
  );
}

function Header({
  issue, onClose, docked, onDock,
}: { issue: ShelfIssue; onClose: () => void; docked: boolean; onDock?: (docked: boolean) => void }) {
  return (
    <div style={{ background: C.navy, color: C.canvas, padding: '13px 14px 13px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <Monogram serial={issue.serial} onNavy />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 700, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Ask {issue.serial}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.08em', opacity: 0.88, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.16)', padding: '1px 6px', letterSpacing: '0.12em', flexShrink: 0 }}>
            <Sparkle size={9} /> AI
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>READING-ROOM ASSISTANT · {issue.dateLabel.toUpperCase()}</span>
        </div>
      </div>
      {onDock && (
        <button
          onClick={() => onDock(!docked)}
          title={docked ? 'Float the assistant over the page' : 'Dock the assistant beside the page'}
          aria-label={docked ? 'Float the assistant over the page' : 'Dock the assistant beside the page'}
          style={{ color: C.canvas, padding: 4, display: 'flex' }}
        >
          {/* A page with a column beside it; docked, a page with a card over its corner. */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="1.5" y="2.5" width="13" height="11" stroke="currentColor" strokeWidth="1.3" />
            {docked
              ? <rect x="8.5" y="8" width="4.5" height="4" fill="currentColor" />
              : <rect x="9.5" y="2.5" width="5" height="11" fill="currentColor" />}
          </svg>
        </button>
      )}
      <button onClick={onClose} aria-label="Close — it folds into the button in the corner" title="Close (Esc) — reopen from the button in the corner" style={{ color: C.canvas, fontFamily: MONO, fontSize: 14, lineHeight: 1, padding: 4 }}>
        ✕
      </button>
    </div>
  );
}

/**
 * The community a serial speaks for, for the one prompt that names a place.
 *
 * A curated table, not a rule. Stripping the masthead word off the title is the
 * obvious approach and it is wrong often enough to notice: *Plain Press* becomes
 * "Plain", *High Gear* becomes "High Gear", and the prompt reads as a bug the
 * first time a patron sees it. A paper's name is not its neighbourhood, and
 * there are only a couple of dozen serials in the whole collection — so this is
 * knowledge, kept where it can be corrected, with a generic question for
 * everything not listed. Matched on prefix, since the catalog gives the same
 * paper several parenthetical variants.
 */
const COMMUNITIES: Array<[string, string]> = [
  ['the brooklyn news', 'Brooklyn'],
  ['east side daily news', 'the East Side'],
  ['cleveland scene', 'Cleveland'],
  ['the tremonster', 'Tremont'],
  ['plain press', 'the near West Side'],
  ['view from the overlook', 'Cleveland Heights'],
];

function communityOf(serial: string): string | null {
  const s = serial.trim().toLowerCase();
  return COMMUNITIES.find(([k]) => s.startsWith(k))?.[1] ?? null;
}

function Opening({ issue, onPick }: { issue: ShelfIssue; onPick: (q: string) => void }) {
  // Openings, not a menu of features. Each one is answerable from the published
  // text and citable — the temptation with an archive assistant is prompts that
  // sound evocative and can only be answered by inventing ("what was life like?").
  // Concrete first, then the two that shift perspective, then texture.
  const town = communityOf(issue.serial);
  const prompts = [
    'What could a dollar buy back then?',
    'What in here would surprise a Clevelander today?',
    'Show me something that hasn’t changed at all.',
    town ? `What was on ${town}’s mind this week?` : 'What was this paper’s town talking about?',
    'Read me the best sentence in this issue.',
    'What would sound strangest to a reader now?',
    'Whose names does this paper keep printing?',
  ];
  return (
    <div>
      {/* The paper speaks first, in the first person: "ask this newspaper" is the
          whole idea, and a greeting says it faster than a feature description.
          What it must keep is the boundary — what it has read, and that every
          answer points back at the page. */}
      <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
        <Monogram serial={issue.serial} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', color: C.tertiary, marginBottom: 5 }}>
            {issue.serial.toUpperCase()} · AI
          </div>
          <div style={{ background: C.sunken, borderLeft: `3px solid ${C.navy}`, padding: '11px 13px 12px' }}>
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 19, lineHeight: 1.25, color: C.ink }}>
              Hello — I’m {issue.serial}, {issue.dateLabel}.
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.58, color: C.body, marginTop: 6 }}>
              I’ve read all {issue.publishedCount} published items in this issue, and nothing else. Ask me about
              the people, prices, places and goings-on in my pages — I’ll point you to the page every answer came from.
            </div>
          </div>
        </div>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: C.tertiary, margin: '20px 0 0 43px' }}>
        TRY ASKING
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 9, marginLeft: 43 }}>
        {prompts.map((p) => (
          <button
            key={p}
            className="dc-chat-chip"
            onClick={() => onPick(p)}
            style={{ border: `1px solid ${C.hairMed}`, padding: '6px 11px', fontFamily: SERIF, fontSize: 13.5, lineHeight: 1.3, color: C.body, background: C.canvas, textAlign: 'left' }}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function Disabled({ text }: { text: string }) {
  return (
    <div style={{ border: `1px solid ${C.hairMed}`, padding: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.14em', color: C.tertiary }}>
        ASSISTANT UNAVAILABLE HERE
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.6, color: C.body, marginTop: 8 }}>{text}</div>
    </div>
  );
}

function UserTurn({ text }: { text: string }) {
  // The patron's side of the conversation, on the right, as in every chat.
  return (
    <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ maxWidth: '86%', background: 'rgba(0,87,183,0.07)', borderRight: `3px solid ${C.navy}`, padding: '8px 12px 8px 13px' }}>
        <div style={{ fontFamily: SANS, fontSize: 14, lineHeight: 1.5, color: C.ink, fontWeight: 500 }}>{text}</div>
      </div>
    </div>
  );
}

function AssistantTurn({
  text, dataset, onCite, streaming, issue,
}: { text: string; dataset: Dataset; onCite: (id: string) => void; streaming?: boolean; issue: ShelfIssue }) {
  const blocks = parseAnswer(text);
  const byId = new Map(dataset.indexItems.map((i) => [i.id, i]));
  // Signed by the paper: the answer is the newspaper talking, not a help desk.
  return (
    <div style={{ marginTop: 16, display: 'flex', gap: 11, alignItems: 'flex-start' }}>
      <Monogram serial={issue.serial} size={26} />
      <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', color: C.tertiary, marginBottom: 5, marginTop: 2 }}>
        {issue.serial.toUpperCase()} · AI
      </div>
      {blocks.map((b, i) => (
        <div
          key={i}
          style={{
            fontFamily: SERIF, fontSize: 15, lineHeight: 1.62, color: C.body,
            marginTop: i === 0 ? 0 : 8,
            paddingLeft: b.bullet ? 14 : 0, position: 'relative',
          }}
        >
          {b.bullet && <span style={{ position: 'absolute', left: 0, color: C.navy }}>·</span>}
          {b.segments.map((s, j) =>
            s.kind === 'text' ? (
              <span key={j}>{s.text}</span>
            ) : s.kind === 'bold' ? (
              <strong key={j} style={{ fontWeight: 700, color: C.ink }}>{s.text}</strong>
            ) : (
              <Citation key={j} item={byId.get(s.id)} onCite={onCite} />
            ),
          )}
          {streaming && i === blocks.length - 1 && (
            <span style={{ display: 'inline-block', width: 7, height: 15, background: C.navy, marginLeft: 3, verticalAlign: '-2px' }} />
          )}
        </div>
      ))}
      </div>
    </div>
  );
}

/** A cited item, as a chip that turns the reader to it. An id the model invented
 *  resolves to nothing and is dropped — a bad citation becomes no citation. */
function Citation({ item, onCite }: { item: IndexItem | undefined; onCite: (id: string) => void }) {
  if (!item) return null;
  const label = item.title ?? item.typeLabel.toLowerCase();
  return (
    <button
      onClick={() => onCite(item.id)}
      title={`Turn to page ${item.printedPage ?? '?'} — ${item.title ?? item.typeLabel}`}
      style={{
        display: 'inline-flex', alignItems: 'baseline', gap: 5, verticalAlign: 'baseline',
        border: `1px solid ${C.hairMed}`, borderBottom: `2px solid ${C.navy}`, background: C.sunken,
        padding: '1px 6px', margin: '0 2px', maxWidth: 240, overflow: 'hidden',
      }}
    >
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.06em', color: C.navy, flexShrink: 0 }}>
        P.{item.printedPage ?? '?'}
      </span>
      <span style={{ fontFamily: SANS, fontSize: 11.5, color: C.body, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label.length > 34 ? label.slice(0, 33) + '…' : label}
      </span>
    </button>
  );
}

function Composer({
  draft, onDraft, onSend, onStop, onReset, streaming, asked, atCap, inputRef, serial,
}: {
  draft: string; onDraft: (s: string) => void; onSend: () => void; onStop: () => void; onReset: () => void;
  streaming: boolean; asked: number; atCap: boolean; inputRef: React.MutableRefObject<HTMLTextAreaElement | null>; serial: string;
}) {
  // One line to start, growing with the question (up to about five lines), and
  // back to one once it's sent. The send button is exactly one line tall, so on
  // a single line the text and the button share a centre; on more, the button
  // stays by the last line, where the patron's eye is.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_H)}px`;
    el.style.overflowY = el.scrollHeight > COMPOSER_MAX_H ? 'auto' : 'hidden';
  }, [draft, inputRef]);
  return (
    <div style={{ borderTop: `1px solid ${C.hairMed}`, padding: '10px 12px 11px', background: C.canvas }}>
      {atCap ? (
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, lineHeight: 1.7, letterSpacing: '0.06em', color: C.tertiary }}>
            THIS CONVERSATION HAS REACHED ITS {MAX_TURNS}-QUESTION LIMIT.
          </div>
          <button
            className="dc-btn-primary"
            onClick={onReset}
            style={{ marginTop: 8, fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', background: C.navy, color: C.canvas, border: `1px solid ${C.navy}`, padding: '8px 14px' }}
          >
            START A FRESH CONVERSATION
          </button>
        </div>
      ) : (
        // One field, not a box and a button side by side: square like every other
        // control on the site, the send button set inside its bottom-right corner,
        // and the whole frame taking the navy rule on focus.
        <div className="dc-composer" style={{ display: 'flex', alignItems: 'flex-end', gap: 6, border: `1px solid ${C.hairMed}`, background: C.canvas, padding: COMPOSER_INSET }}>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
            }}
            rows={1}
            placeholder={`Ask ${serial} anything…`}
            aria-label={`Ask ${serial} about this issue`}
            style={{
              // line box (20) + padding (8 + 8) = the send button's 36
              flex: 1, resize: 'none', fontFamily: SANS, fontSize: 13.5, lineHeight: '20px',
              padding: `8px 6px 8px ${12 - COMPOSER_INSET}px`, border: 'none', background: 'transparent', color: C.body,
              borderRadius: 0, outline: 'none', display: 'block', boxSizing: 'border-box', minHeight: 36,
            }}
          />
          {streaming ? (
            <button
              onClick={onStop}
              title="Stop the answer"
              aria-label="Stop the answer"
              className="dc-btn-ghost"
              style={{ width: 36, height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.hairMed}`, background: C.canvas, color: C.secondary }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="1" width="10" height="10" fill="currentColor" /></svg>
            </button>
          ) : (
            <button
              className={draft.trim() ? 'dc-btn-primary' : undefined}
              onClick={onSend}
              disabled={!draft.trim()}
              title="Send (Enter) · new line (Shift+Enter)"
              aria-label="Send"
              style={{
                width: 36, height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: draft.trim() ? C.navy : C.sunken, color: draft.trim() ? C.canvas : C.tertiary,
                border: `1px solid ${draft.trim() ? C.navy : C.hairLight}`,
                cursor: draft.trim() ? 'pointer' : 'default',
              }}
            >
              {/* a paper plane: the send gesture every messaging app has taught */}
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M21.5 2.5 10.2 13.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M21.5 2.5 14.6 21.5l-4.4-7.7-7.7-4.4 19-6.9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      )}
      {/* The disclosure, where the patron is about to act on it — quietly, but
          always on screen. It used to be a grey bar across the top of the panel. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginTop: 8, fontFamily: MONO, fontSize: 9, lineHeight: 1.6, letterSpacing: '0.06em', color: C.tertiary }}>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ color: C.navy, transform: 'translateY(1px)', display: 'inline-flex' }}><Sparkle size={9} /></span>
          <span>AI (CLAUDE SONNET) · READS ONLY THIS ISSUE · {asked}/{MAX_TURNS}</span>
        </span>
        {asked > 0 && !atCap && (
          <button className="dc-underline-hover" onClick={onReset} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.06em', color: C.navy }}>
            CLEAR
          </button>
        )}
      </div>
    </div>
  );
}
