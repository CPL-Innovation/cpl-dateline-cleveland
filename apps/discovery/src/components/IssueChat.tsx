// The reading-room assistant, as a surface: a floating call button in the corner
// of the reader, and the panel it opens.
//
// It is deliberately a READING companion, not a search box. It lives only inside
// an open issue, it is scoped to that issue's published text (the server assembles
// that corpus — see apps/pipeline/src/lib/chat.ts), and its citations are the
// point: every claim it makes is a chip that turns the reader to the item it came
// from. The patron can always go check.

import { useEffect, useRef, useState } from 'react';
import type { Dataset, IndexItem } from '../lib/types';
import type { ShelfIssue } from '../lib/shelf';
import { parseAnswer, streamChat, ChatRefusal, type ChatTurn } from '../lib/chat';
import { C, MONO, SANS, SERIF } from '../lib/ui';

/** Mirrors CHAT_MAX_TURNS in the pipeline config — the server is the enforcer. */
const MAX_TURNS = 20;

interface Props {
  issue: ShelfIssue;
  dataset: Dataset;
  /** Turn the reader to an item the assistant cited. */
  onCite: (objectId: string) => void;
  /** Distance from the right edge. The scan room's transcription slip docks
   *  there; the call button steps aside rather than sitting on its buttons. */
  offsetRight?: number;
}

type Note = { kind: 'refusal' | 'error'; text: string };

export function IssueChat({ issue, dataset, onCite, offsetRight = 24 }: Props) {
  const [open, setOpen] = useState(false);
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
  }, [turns, pending, note, open]);

  useEffect(() => {
    if (open && !disabledReason) input.current?.focus();
  }, [open, disabledReason]);

  // Esc closes the panel — but the reader also listens for Esc (it closes the
  // book), so this stops the event before it turns into a page you didn't ask for.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  useEffect(() => () => abort.current?.abort(), []);

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

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Reading-room assistant"
          style={{
            position: 'fixed', right: offsetRight, bottom: 96, zIndex: 60,
            width: 390, maxWidth: 'calc(100vw - 48px)',
            height: 'min(640px, calc(100vh - 160px))',
            background: C.canvas, border: `1px solid ${C.hairMed}`, borderTop: `3px solid ${C.navy}`,
            display: 'flex', flexDirection: 'column',
          }}
        >
          <Header issue={issue} onClose={() => setOpen(false)} />

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
                    <AssistantTurn key={i} text={t.content} dataset={dataset} onCite={onCite} />
                  ),
                )}
                {pending && <AssistantTurn text={pending} dataset={dataset} onCite={onCite} streaming />}
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
            />
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        title={open ? 'Close the reading-room assistant' : 'Ask about this issue'}
        aria-label={open ? 'Close the reading-room assistant' : 'Ask about this issue'}
        style={{
          position: 'fixed', right: offsetRight, bottom: 24, zIndex: 60,
          width: 56, height: 56, borderRadius: '50%',
          background: open ? C.navyDeep : C.navy, color: C.canvas,
          border: `2px solid ${C.canvas}`, outline: `1px solid ${C.navy}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {open ? (
          <span style={{ fontFamily: MONO, fontSize: 18, lineHeight: 1 }}>✕</span>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 4h18v13H8l-5 4V4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M7.5 9h9M7.5 12.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </>
  );
}

/* ── panel parts ───────────────────────────────────────────────────────────── */

function Header({ issue, onClose }: { issue: ShelfIssue; onClose: () => void }) {
  return (
    <>
      <div style={{ background: C.navy, color: C.canvas, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.16em' }}>
            READING-ROOM ASSISTANT
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.06em', opacity: 0.85, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {issue.serial.toUpperCase()} · {issue.dateLabel.toUpperCase()}
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" style={{ color: C.canvas, fontFamily: MONO, fontSize: 14, lineHeight: 1, padding: 4 }}>
          ✕
        </button>
      </div>
      <div style={{ background: C.sunken, borderBottom: `1px solid ${C.hairLight}`, padding: '7px 14px', fontFamily: MONO, fontSize: 9, lineHeight: 1.6, letterSpacing: '0.06em', color: C.tertiary }}>
        READS ONLY THE PUBLISHED TEXT OF THIS ISSUE · CLAUDE SONNET · AI CAN BE WRONG — CHECK THE PAGE
      </div>
    </>
  );
}

function Opening({ issue, onPick }: { issue: ShelfIssue; onPick: (q: string) => void }) {
  const prompts = [
    'What is this issue mostly about?',
    'Who turns up more than once in these pages?',
    'What did things cost this week?',
    'Read me something surprising.',
  ];
  return (
    <div>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 21, lineHeight: 1.25, color: C.ink }}>
        Ask about this issue.
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.6, color: C.secondary, marginTop: 8 }}>
        I’ve read the {issue.publishedCount} published items in {issue.serial}, {issue.dateLabel} — and nothing else.
        Ask what happened, who was named, what a thing cost. Every answer points back at the page it came from.
      </div>
      <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: C.tertiary, marginTop: 22 }}>
        TRY
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        {prompts.map((p) => (
          <button
            key={p}
            className="dc-facet-row"
            onClick={() => onPick(p)}
            style={{ border: `1px solid ${C.hairMed}`, padding: '9px 11px', fontFamily: SERIF, fontSize: 14, color: C.body }}
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
  return (
    <div style={{ marginTop: 18, borderLeft: `3px solid ${C.marigold}`, paddingLeft: 11 }}>
      <div style={{ fontFamily: SANS, fontSize: 14, lineHeight: 1.5, color: C.ink, fontWeight: 500 }}>{text}</div>
    </div>
  );
}

function AssistantTurn({
  text, dataset, onCite, streaming,
}: { text: string; dataset: Dataset; onCite: (id: string) => void; streaming?: boolean }) {
  const blocks = parseAnswer(text);
  const byId = new Map(dataset.indexItems.map((i) => [i.id, i]));
  return (
    <div style={{ marginTop: 14 }}>
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
  draft, onDraft, onSend, onStop, onReset, streaming, asked, atCap, inputRef,
}: {
  draft: string; onDraft: (s: string) => void; onSend: () => void; onStop: () => void; onReset: () => void;
  streaming: boolean; asked: number; atCap: boolean; inputRef: React.Ref<HTMLTextAreaElement>;
}) {
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
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
            }}
            rows={2}
            placeholder="Ask about this issue…"
            aria-label="Ask the reading-room assistant about this issue"
            style={{
              flex: 1, resize: 'none', fontFamily: SANS, fontSize: 13, lineHeight: 1.5,
              padding: '8px 10px', border: `1px solid ${C.hairMed}`, background: C.canvas, color: C.body,
              borderRadius: 0, outline: 'none',
            }}
          />
          {streaming ? (
            <button
              onClick={onStop}
              title="Stop the answer"
              style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', border: `1px solid ${C.hairMed}`, color: C.secondary, padding: '9px 12px' }}
            >
              STOP
            </button>
          ) : (
            <button
              className="dc-btn-primary"
              onClick={onSend}
              disabled={!draft.trim()}
              title="Ask (Enter)"
              style={{
                fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                background: draft.trim() ? C.navy : C.sunken, color: draft.trim() ? C.canvas : C.tertiary,
                border: `1px solid ${draft.trim() ? C.navy : C.hairMed}`, padding: '9px 12px',
                cursor: draft.trim() ? 'pointer' : 'default',
              }}
            >
              ASK
            </button>
          )}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 7, fontFamily: MONO, fontSize: 9, letterSpacing: '0.06em', color: C.tertiary }}>
        <span>{asked} / {MAX_TURNS} QUESTIONS</span>
        {asked > 0 && !atCap && (
          <button className="dc-underline-hover" onClick={onReset} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.06em', color: C.navy }}>
            CLEAR
          </button>
        )}
      </div>
    </div>
  );
}
