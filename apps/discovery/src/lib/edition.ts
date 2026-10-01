// Your Edition (SLICE-15) — the client half: the Reader Card, the three endpoints,
// share links, and the state of one edition in progress.
//
// The reader owns the state (useEdition is called in IssueReader, not in the
// edition view), so tapping a reference crop — which turns the book to SCAN and
// flies to the box — never costs the patron their half-made edition.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dataset } from './types';
import type { ShelfIssue } from './shelf';

const API = () => 'http://' + location.hostname + ':5170';

/* ── the Reader Card ───────────────────────────────────────────────────────── */

export type Role = 'local' | 'family' | 'researcher' | 'curious' | 'kid';
export type Register = 'quick' | 'full' | 'ten' | 'facts';
export interface ReaderCard { role: Role; interests: string[]; register: Register }

export const ROLE_OPTIONS: Array<{ id: Role; label: string; noun: string }> = [
  { id: 'local', label: 'I live around here', noun: 'A neighbor' },
  { id: 'family', label: 'I’m tracing family', noun: 'A family historian' },
  { id: 'researcher', label: 'I’m a researcher', noun: 'A researcher' },
  { id: 'curious', label: 'I’m just curious', noun: 'A curious reader' },
  { id: 'kid', label: 'I’m a kid', noun: 'A young reader' },
];
export const REGISTER_OPTIONS: Array<{ id: Register; label: string; phrase: string; note: string }> = [
  { id: 'quick', label: 'Quick bites', phrase: 'quick bites', note: 'A short paragraph each' },
  { id: 'full', label: 'The full story', phrase: 'the full story', note: 'Every name, place and figure' },
  { id: 'ten', label: 'Explain it like I’m ten', phrase: 'things explained simply', note: 'Short sentences, plain words' },
  { id: 'facts', label: 'Just the facts, with sources', phrase: 'just the facts, with sources', note: 'No adjectives, all citations' },
];

export interface Interest { id: string; label: string; phrase: string; count: number }

const FALLBACK_PHRASE: Record<string, string> = {
  ads: 'an eye for the ads', people: 'an interest in the people', week: 'a taste for the week’s news',
  money: 'a head for money', strange: 'a nose for the strange',
};

/** "A neighbor with a nose for the strange, who wants quick bites." A template,
 *  never model output — the lens is shown back in the reader's own terms. */
export function cardLabel(rc: ReaderCard, interests: Interest[]): string {
  const noun = ROLE_OPTIONS.find((r) => r.id === rc.role)?.noun ?? 'A reader';
  const phrases = rc.interests.map((id) =>
    interests.find((i) => i.id === id)?.phrase
    ?? FALLBACK_PHRASE[id]
    ?? `a soft spot for ${id.replace(/^topic:/, '').replace(/-and-/g, ' & ').replace(/-/g, ' ')}`);
  const list = phrases.length <= 1 ? phrases.join('')
    : `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;
  const reg = REGISTER_OPTIONS.find((r) => r.id === rc.register)?.phrase ?? 'it their way';
  return `${noun}${list ? ` with ${list}` : ''}, who wants ${reg}.`;
}

const CARD_KEY = 'dc-reader-card';
function isCard(v: unknown): v is ReaderCard {
  const o = v as ReaderCard;
  return !!o && ROLE_OPTIONS.some((r) => r.id === o.role) && REGISTER_OPTIONS.some((r) => r.id === o.register)
    && Array.isArray(o.interests) && o.interests.every((x) => typeof x === 'string');
}
export function loadCard(): ReaderCard | null {
  try { const v = JSON.parse(localStorage.getItem(CARD_KEY) || 'null'); return isCard(v) ? v : null; } catch { return null; }
}
function saveCard(rc: ReaderCard) {
  try { localStorage.setItem(CARD_KEY, JSON.stringify(rc)); } catch { /* the card still works for this visit */ }
}

/* ── share links: picks, never prose ───────────────────────────────────────── */

export interface EditionLink { issue: string; rc: ReaderCard | null; picks: string[]; droppedFreeText: boolean }

/** `?issue=p7622&view=edition&rc=kid.quick.strange,money&picks=ads-trick,…`
 *  A free-text section is represented by `_` so the link can say one was dropped. */
export function parseLink(search: string): EditionLink | null {
  const q = new URLSearchParams(search);
  const issue = q.get('issue');
  if (!issue || q.get('view') !== 'edition') return null;
  const [role, register, interests] = (q.get('rc') ?? '').split('.');
  const rc = { role, register, interests: interests ? interests.split(',').filter(Boolean) : [] } as ReaderCard;
  const raw = (q.get('picks') ?? '').split(',').filter(Boolean).slice(0, 4);
  return { issue, rc: isCard(rc) ? rc : null, picks: raw.filter((p) => p !== '_'), droppedFreeText: raw.includes('_') };
}
export function shareUrl(issueKey: string, rc: ReaderCard, picks: Array<string | null>): string {
  const q = new URLSearchParams({
    issue: issueKey, view: 'edition',
    rc: `${rc.role}.${rc.register}.${rc.interests.join(',')}`,
    picks: picks.map((p) => p ?? '_').join(','),
  });
  return `${location.origin}${location.pathname}?${q.toString()}`;
}

/* ── the endpoints ─────────────────────────────────────────────────────────── */

export interface EditionIndex {
  available: boolean; reason: string | null; serial: string; dateLabel: string; publishedCount: number;
  interests: Interest[]; limits: { sections: number; calls: number; regenerates: number };
}
export interface DealtCard { id: string; text: string; count: number }
export interface Deal { round: number; cards: DealtCard[]; freeTextAllowed: boolean; complete: boolean; labels: Record<string, string | null> }
export interface Crop { id: string; url: string | null; w?: number; h?: number; page: number; title: string | null }
export interface Section { headline: string; body: string; references: string[]; beyondThisIssue: string | null; crops: Crop[] }
export interface HistoryItem { cardId: string | null; references: string[] }

export class EditionRefusal extends Error {}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(API() + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw j.refused ? new EditionRefusal(j.error) : new Error(j.error ?? 'HTTP ' + r.status);
  return j as T;
}

export async function fetchIndex(pointer: number): Promise<EditionIndex> {
  const r = await fetch(API() + '/api/edition/index?pointer=' + pointer);
  if (!r.ok) throw new Error('The reading room is unreachable (HTTP ' + r.status + ').');
  return r.json();
}

type SectionResult =
  | { kind: 'section'; section: Section; cached: boolean; modelCall: boolean }
  | { kind: 'empty'; message: string; modelCall: true };

async function streamSection(
  body: Record<string, unknown>,
  onPartial: (p: { headline?: string; body?: string }) => void,
): Promise<SectionResult> {
  const res = await fetch(API() + '/api/edition/section', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error('The reading room is unreachable (HTTP ' + res.status + ').');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let out: SectionResult | null = null;
  let failure: Error | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split('\n\n');
    buf = frames.pop() ?? '';
    for (const frame of frames) {
      let event = 'message', data = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      const p = JSON.parse(data);
      if (event === 'partial') onPartial(p);
      else if (event === 'section') out = { kind: 'section', section: p.section, cached: !!p.cached, modelCall: !!p.modelCall };
      else if (event === 'empty') out = { kind: 'empty', message: p.message, modelCall: true };
      else if (event === 'error') failure = p.refused ? new EditionRefusal(p.message) : new Error(p.message);
    }
  }
  if (failure) throw failure;
  if (!out) throw new Error('The edition stopped before the section arrived.');
  return out;
}

/* ── one edition in progress ───────────────────────────────────────────────── */

export type Phase = 'loading' | 'unavailable' | 'interview' | 'card' | 'build' | 'done';

export interface Built {
  cardId: string | null;      // null = the patron's own question
  kicker: string;             // the words on the card that made it (or the question)
  section: Section;
  cached: boolean;
}

export interface Draft { role: Role | null; interests: string[]; register: Register | null }

const newId = () => Math.random().toString(36).slice(2, 10);

export function useEdition(issue: ShelfIssue, dataset: Dataset, link: EditionLink | null) {
  const live = dataset.mode === 'real' && issue.pointer != null;
  const [phase, setPhase] = useState<Phase>('loading');
  const [reason, setReason] = useState<string | null>(null);
  const [index, setIndex] = useState<EditionIndex | null>(null);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({ role: null, interests: [], register: null });
  const [card, setCard] = useState<ReaderCard | null>(null);
  const [sections, setSections] = useState<Built[]>([]);
  const [tried, setTried] = useState<string[]>([]);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [writing, setWriting] = useState<{ kicker: string; headline?: string; body?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [callsUsed, setCallsUsed] = useState(0);
  const [regeneratesUsed, setRegeneratesUsed] = useState(0);
  const [sharedNote, setSharedNote] = useState<string | null>(null);
  const editionId = useRef(newId());
  const linkUsed = useRef(false);

  // Belt and braces: the server already dropped any id it didn't hand the model;
  // the client drops anything it can't resolve to a published item it holds.
  const known = useRef(new Set<string>());
  known.current = new Set(dataset.indexItems.map((i) => i.id));
  const clean = useCallback((s: Section): Section => {
    const refs = s.references.filter((r) => known.current.has(r));
    return { ...s, references: refs, crops: s.crops.filter((c) => refs.includes(c.id)) };
  }, []);

  const history = (list: Built[]): HistoryItem[] => list.map((b) => ({ cardId: b.cardId, references: b.section.references }));

  const dealFor = useCallback(async (rc: ReaderCard, list: Built[], triedIds: string[]) => {
    if (list.length >= (index?.limits.sections ?? 4)) { setDeal(null); setPhase('done'); return; }
    setDeal(null);
    try {
      setDeal(await postJson<Deal>('/api/edition/prompts', { pointer: issue.pointer, readerCard: rc, history: history(list), tried: triedIds }));
    } catch (e) { setNotice((e as Error).message); }
  }, [issue.pointer, index]);

  // Open (or re-open) on this issue: availability first, then a Reader Card the
  // patron already has — if this issue can still honour its interests.
  useEffect(() => {
    let cancelled = false;
    setPhase('loading'); setSections([]); setTried([]); setDeal(null); setNotice(null); setWriting(null);
    setCallsUsed(0); setRegeneratesUsed(0); setSharedNote(null); editionId.current = newId();
    if (!live) {
      setReason('Your Edition is written from the pipeline’s published transcriptions — switch to REAL DATA to make one from a real issue.');
      setPhase('unavailable');
      return;
    }
    fetchIndex(issue.pointer!).then((ix) => {
      if (cancelled) return;
      setIndex(ix);
      if (!ix.available) { setReason(ix.reason); setPhase('unavailable'); return; }
      const fromLink = link && link.issue === issue.key && !linkUsed.current ? link : null;
      const base = fromLink?.rc ?? loadCard();
      const ok = base ? { ...base, interests: base.interests.filter((i) => ix.interests.some((x) => x.id === i)) } : null;
      if (ok && ok.interests.length) {
        setCard(ok);
        setDraft({ role: ok.role, interests: ok.interests, register: ok.register });
        setPhase(fromLink ? 'build' : 'card');
      } else {
        setDraft({ role: base?.role ?? null, interests: [], register: base?.register ?? null });
        setStep(0);
        setPhase('interview');
      }
    }).catch((e) => { if (!cancelled) { setReason((e as Error).message); setPhase('unavailable'); } });
    return () => { cancelled = true; };
  }, [issue.key, live]);    // eslint-disable-line react-hooks/exhaustive-deps

  /** One section: a card pick or the patron's own question. */
  const write = useCallback(async (rc: ReaderCard, list: Built[], pick: { cardId?: string; freeText?: string; kicker: string }, opts: { regenerate?: boolean; triedIds: string[]; calls: number; regens: number }) => {
    setNotice(null);
    setWriting({ kicker: pick.kicker });
    try {
      const r = await streamSection({
        pointer: issue.pointer, readerCard: rc, cardId: pick.cardId ?? null, freeText: pick.freeText ?? null,
        history: history(list), callsUsed: opts.calls, regeneratesUsed: opts.regens, regenerate: !!opts.regenerate,
        editionId: editionId.current,
      }, (p) => setWriting({ kicker: pick.kicker, ...p }));
      const calls = opts.calls + (r.modelCall ? 1 : 0);
      setCallsUsed(calls);
      if (r.kind === 'section') {
        const s = clean(r.section);
        if (!s.references.length) throw new EditionRefusal('Nothing in this issue matched that — try another card.');
        const built: Built = { cardId: pick.cardId ?? null, kicker: pick.kicker, section: s, cached: r.cached };
        const next = opts.regenerate ? [...list.slice(0, -1), built] : [...list, built];
        if (opts.regenerate) setRegeneratesUsed(opts.regens + 1);
        setSections(next);
        setWriting(null);
        return { next, calls, ok: true as const };
      }
      // Zero surviving citations: said honestly, not counted as a section.
      setWriting(null);
      setNotice(r.message);
      const t = pick.cardId ? [...opts.triedIds, pick.cardId] : opts.triedIds;
      setTried(t);
      return { next: list, calls, ok: false as const, tried: t };
    } catch (e) {
      setWriting(null);
      setNotice((e as Error).message);
      return { next: list, calls: opts.calls, ok: false as const };
    }
  }, [issue.pointer, clean]);

  // A shared link replays its picks — cache hits for every card pick.
  useEffect(() => {
    if (phase !== 'build' || !card || !link || linkUsed.current || link.issue !== issue.key) return;
    linkUsed.current = true;
    (async () => {
      let list: Built[] = [];
      let calls = 0;
      const labels = (await postJson<Deal>('/api/edition/prompts', { pointer: issue.pointer, readerCard: card, history: [], tried: [], labels: link.picks }).catch(() => null))?.labels ?? {};
      for (const id of link.picks) {
        const r = await write(card, list, { cardId: id, kicker: labels[id] ?? id }, { triedIds: [], calls, regens: 0 });
        if (!r.ok) break;
        list = r.next; calls = r.calls;
      }
      setSharedNote(link.droppedFreeText
        ? 'This edition came from a shared link. One section was the sharer’s own question — questions aren’t shared, so that section is yours to fill.'
        : 'This edition came from a shared link, rebuilt from the same picks.');
      await dealFor(card, list, []);
    })();
  }, [phase, card]);    // eslint-disable-line react-hooks/exhaustive-deps

  // The deck for the next round, whenever the build is waiting for a pick.
  useEffect(() => {
    if (phase === 'build' && card && !writing && !deal && !(link && !linkUsed.current && link.issue === issue.key)) {
      dealFor(card, sections, tried);
    }
  }, [phase, card]);    // eslint-disable-line react-hooks/exhaustive-deps

  const maxCalls = index?.limits.calls ?? 6;
  const maxSections = index?.limits.sections ?? 4;

  return {
    phase, reason, index, step, draft, card, sections, deal, writing, notice, callsUsed, maxCalls, maxSections,
    regeneratesUsed, maxRegenerates: index?.limits.regenerates ?? 2, sharedNote,
    label: card ? cardLabel(card, index?.interests ?? []) : null,
    draftLabel: draft.role && draft.register ? cardLabel(draft as ReaderCard, index?.interests ?? []) : null,

    // Phase 1 — three questions, no model.
    chooseRole: (role: Role) => { setDraft((d) => ({ ...d, role })); setStep(1); },
    toggleInterest: (id: string) => setDraft((d) => ({
      ...d,
      interests: d.interests.includes(id) ? d.interests.filter((x) => x !== id) : d.interests.length >= 3 ? d.interests : [...d.interests, id],
    })),
    toStep: (n: number) => setStep(n),
    chooseRegister: (register: Register) => {
      if (!draft.role || !draft.interests.length) return;
      setDraft({ ...draft, register });
      setCard({ role: draft.role, interests: draft.interests, register });
      setPhase('card');
    },
    redo: () => { setStep(0); setPhase('interview'); },
    begin: () => {
      if (!card) return;
      saveCard(card);                         // carries to the next issue
      setSections([]); setTried([]); setCallsUsed(0); setRegeneratesUsed(0); setNotice(null); setSharedNote(null);
      setDeal(null);
      setPhase('build');                      // the deck is dealt by the build effect
    },

    // Phase 2 — the build game.
    pick: async (c: DealtCard) => {
      if (!card || writing) return;
      setDeal(null);
      const r = await write(card, sections, { cardId: c.id, kicker: c.text }, { triedIds: tried, calls: callsUsed, regens: regeneratesUsed });
      await dealFor(card, r.next, r.tried ?? tried);
    },
    ask: async (q: string, regenerate = false) => {
      if (!card || writing || !q.trim()) return;
      if (regenerate && regeneratesUsed >= (index?.limits.regenerates ?? 2)) {
        setNotice('That question has been asked three ways already — this edition keeps the last answer.');
        return;   // refused here, and again on the server — never an API call
      }
      if (callsUsed >= maxCalls) {
        setNotice(`This edition has used all ${maxCalls} of its writing turns — print it as it stands, or start over.`);
        return;
      }
      setDeal(null);
      const r = await write(card, sections, { freeText: q.trim(), kicker: `You asked: ${q.trim()}` }, { regenerate, triedIds: tried, calls: callsUsed, regens: regeneratesUsed });
      await dealFor(card, r.next, tried);
    },
    startOver: () => {
      setSections([]); setTried([]); setCallsUsed(0); setRegeneratesUsed(0); setNotice(null); setSharedNote(null);
      setDeal(null); setWriting(null); editionId.current = newId();
      setPhase('card');   // keeps the Reader Card
    },
    shareLink: () => (card ? shareUrl(issue.key, card, sections.map((b) => b.cardId)) : ''),
  };
}

export type EditionState = ReturnType<typeof useEdition>;
