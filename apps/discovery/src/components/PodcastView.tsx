// Your Edition, read aloud (SLICE-16) — the podcast's own page.
//
// Reached from a finished edition ("Make the podcast"), or straight from a link
// (`?issue=…&view=podcast&pod=<id>`): the episode lives on the server, so the page
// only needs its id. Three states:
//
//   MAKING   the stages as they actually happen (script → voices → mix), with the
//            segment count from the server; once the script exists it can be read
//            while the voices are recorded.
//   READY    the show: a player whose scrubber is marked with the edition's
//            sections, the chapters, and the transcript — the line being spoken is
//            lit and followed, any line can be clicked to hear it, and each section
//            carries the newsprint it came from.
//   FAILED   what went wrong, in the patron's terms, and a way to try again.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset, IndexItem } from '../lib/types';
import type { ShelfIssue } from '../lib/shelf';
import { audioUrl, clock, fetchPodcast, podcastLink, retryPodcast, type PodCrop, type PodSegment, type Podcast } from '../lib/podcast';
import { C, MONO, SANS, SERIF } from '../lib/ui';

interface Props {
  issue: ShelfIssue;
  dataset: Dataset;
  podId: string;
  /** Back to the edition this was made from (or to make one, from a link). */
  onBack: () => void;
  /** True when this session's edition is the one being read — the back link says so. */
  fromEdition: boolean;
  onSeeOnPage: (id: string) => void;
  /** A retry that resolved to a different episode. */
  onEpisode: (id: string) => void;
}

const HOST_COLOR = [C.navy, '#8A5A00'] as const;
const STICKY_TOP = 59;   // under the reader bar

export function PodcastView({ issue, dataset, podId, onBack, fromEdition, onSeeOnPage, onEpisode }: Props) {
  const [pod, setPod] = useState<Podcast | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  const [poll, setPoll] = useState(0);

  // Follow the episode until it's done (or isn't going to be).
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const p = await fetchPodcast(podId);
        if (cancelled) return;
        setPod(p); setMissing(null);
        if (p.status !== 'done' && p.status !== 'failed') timer = window.setTimeout(tick, 1500);
      } catch (e) {
        if (cancelled) return;
        setMissing((e as Error).message);
      }
    };
    tick();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [podId, poll]);

  const making = !!pod && pod.status !== 'done' && pod.status !== 'failed';
  useEffect(() => {
    if (!making) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [making]);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [podId]);

  const back = (
    <button className="dc-underline-hover" onClick={onBack} style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em', color: C.navy }}>
      ← {fromEdition ? 'BACK TO YOUR EDITION' : 'MAKE YOUR OWN EDITION'}
    </button>
  );

  return (
    <div className="dc-shell" style={{ padding: '24px 32px 96px' }}>
      <div className="dc-podcast" style={{ maxWidth: 860, margin: '0 auto' }}>
        <div style={{ marginBottom: 18 }}>{back}</div>
        {missing && !pod && <Notice title="This episode isn’t here" body={missing} />}
        {!pod && !missing && <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', color: C.tertiary, padding: '40px 0' }}>TUNING IN…</div>}
        {pod && pod.status === 'failed' && (
          <Failed pod={pod} onBack={onBack} onRetry={async () => {
            const r = await retryPodcast(pod.id);
            if (r.id !== pod.id) onEpisode(r.id); else setPoll((n) => n + 1);
          }} />
        )}
        {pod && making && <Making pod={pod} elapsed={(now - started) / 1000} />}
        {pod && pod.status === 'done' && pod.script && (
          <Show pod={pod} issue={issue} dataset={dataset} onSeeOnPage={onSeeOnPage} />
        )}
      </div>
    </div>
  );
}

/* ── shared bits ───────────────────────────────────────────────────────────── */

const Spark = ({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
    <path d="M12 1.5c.5 4.9 1.9 7.9 4 9.1 1.6.9 3.7 1.3 6.5 1.4-2.8.1-4.9.5-6.5 1.4-2.1 1.2-3.5 4.2-4 9.1-.5-4.9-1.9-7.9-4-9.1C6.4 12.5 4.3 12.1 1.5 12c2.8-.1 4.9-.5 6.5-1.4 2.1-1.2 3.5-4.2 4-9.1z" />
  </svg>
);

function Kicker({ children, color = C.navy }: { children: React.ReactNode; color?: string }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.18em', color }}>{children}</div>;
}

function Notice({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${C.hairMed}`, borderTop: `3px solid ${C.marigold}`, padding: '24px 26px', background: C.canvas }}>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, color: C.ink }}>{title}</div>
      <div style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.6, color: C.body, marginTop: 8 }}>{body}</div>
      {children}
    </div>
  );
}

/** Bars that move while something is on air (CSS — see .dc-onair in theme.css). */
function OnAir({ live, color = C.marigold, n = 5, h = 18 }: { live: boolean; color?: string; n?: number; h?: number }) {
  return (
    <span className={live ? 'dc-onair live' : 'dc-onair'} aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 3, height: h }}>
      {Array.from({ length: n }, (_, i) => <i key={i} style={{ width: 3, height: '100%', background: color, animationDelay: `${(i * 0.13) % 0.6}s` }} />)}
    </span>
  );
}

function Cover({ pod, live }: { pod: Podcast; live: boolean }) {
  return (
    <div className="dc-podcast-cover" style={{ width: 176, height: 176, flexShrink: 0, background: C.ink, color: C.canvas, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 14px 34px rgba(15,18,21,0.18)' }}>
      <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.2em', color: C.marigold }}>YOUR EDITION · AUDIO</div>
      <div>
        <div style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 21, lineHeight: 1.05 }}>{pod.serial ?? 'Your edition'}</div>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', color: C.hairMed, marginTop: 6 }}>{(pod.dateLabel ?? '').toUpperCase()}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <OnAir live={live} />
        <Spark size={16} color={C.marigold} />
      </div>
    </div>
  );
}

const hostLine = (pod: Podcast) => pod.hosts.length > 1 ? `${pod.hosts[0].name} & ${pod.hosts[1].name}` : pod.hosts[0]?.name ?? '';
const modelName = (id: string | null) => (id ?? '').replace(/^gemini-/, 'Gemini ').replace(/-preview|-tts/g, '').replace(/-/g, ' ').replace(/\b(flash|pro|lite)\b/g, (m) => m[0].toUpperCase() + m.slice(1)).trim();

/* ── making it ─────────────────────────────────────────────────────────────── */

function Making({ pod, elapsed }: { pod: Podcast; elapsed: number }) {
  const order = ['queued', 'scripting', 'voicing', 'mixing', 'done'];
  const at = order.indexOf(pod.status);
  const done = pod.progress.done ?? 0, total = pod.progress.total ?? 6;
  // Honest where it can be: the voices stage moves by segments the server has
  // finished; the script stage is one call, so it eases toward its share.
  const pct = pod.status === 'queued' ? 2
    : pod.status === 'scripting' ? 4 + 20 * (1 - Math.exp(-elapsed / 12))
    : pod.status === 'voicing' ? 25 + 67 * (done / Math.max(1, total))
    : 95;
  const stages: Array<{ key: string; title: string; detail: string }> = [
    { key: 'scripting', title: 'Writing the script', detail: `AI turns your ${pod.sections.length} sections into a conversation — nothing added that the sections don’t say.` },
    { key: 'voicing', title: 'Recording the voices', detail: `${pod.hosts.map((h) => `${h.name} (${h.voice})`).join(' and ')} on ${modelName(pod.ttsModel)}${pod.status === 'voicing' ? ` · ${done} of ${total} segments` : ''}` },
    { key: 'mixing', title: 'Putting it together', detail: 'One episode, with chapters for each section.' },
  ];
  return (
    <div aria-live="polite">
      <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
        <Cover pod={pod} live />
        <div style={{ flex: 1, minWidth: 260 }}>
          <Kicker><Spark /> YOUR EDITION · RECORDING</Kicker>
          <h1 style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 34, lineHeight: 1.1, color: C.ink, margin: '8px 0 0' }}>
            {pod.script?.title ?? 'Making your podcast…'}
          </h1>
          {pod.label && <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 15.5, color: C.secondary, marginTop: 8 }}>For {pod.label.charAt(0).toLowerCase() + pod.label.slice(1)}</div>}
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', color: C.tertiary, marginTop: 10 }}>
            {clock(elapsed)} ELAPSED · USUALLY ABOUT A MINUTE{pod.queuePosition > 1 ? ` · ${pod.queuePosition - 1} AHEAD OF YOU` : ''}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 28, height: 6, background: C.hairLight, position: 'relative', overflow: 'hidden' }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Recording progress">
        <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: C.navy, transition: 'width 0.6s ease' }} />
      </div>

      <ol style={{ listStyle: 'none', margin: '18px 0 0', padding: 0, display: 'grid', gap: 2 }}>
        {pod.status === 'queued' && (
          <StageRow state="active" n={0} title="Waiting for the studio" detail={pod.queuePosition > 1 ? `${pod.queuePosition - 1} episode${pod.queuePosition > 2 ? 's' : ''} ahead of yours.` : 'Starting in a moment.'} />
        )}
        {stages.map((s, i) => {
          const k = order.indexOf(s.key);
          const state = at > k ? 'done' : at === k ? 'active' : 'todo';
          return <StageRow key={s.key} state={state} n={i + 1} title={s.title} detail={s.detail} />;
        })}
      </ol>

      {pod.script && (
        <div style={{ marginTop: 36 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, borderBottom: `1px solid ${C.hairMed}`, paddingBottom: 8 }}>
            <span style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.16em', color: C.ink }}>THE SCRIPT</span>
            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.08em', color: C.tertiary }}>READ IT WHILE IT RECORDS</span>
          </div>
          <Transcript pod={pod} segments={pod.script.segments} activeLine={null} onLine={null} dim />
        </div>
      )}
    </div>
  );
}

function StageRow({ state, n, title, detail }: { state: 'done' | 'active' | 'todo'; n: number; title: string; detail: string }) {
  return (
    <li style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '12px 14px', background: state === 'active' ? C.sunken : 'transparent', borderLeft: `3px solid ${state === 'active' ? C.marigold : 'transparent'}` }}>
      <span style={{
        width: 22, height: 22, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
        border: `1.5px solid ${state === 'todo' ? C.hairMed : C.navy}`, background: state === 'done' ? C.navy : 'transparent',
        color: state === 'done' ? C.canvas : C.navy, fontFamily: MONO, fontSize: 10.5,
      }}>
        {state === 'done' ? '✓' : state === 'active' ? <span className="dc-spin" style={{ width: 10, height: 10, border: `2px solid ${C.navy}`, borderRightColor: 'transparent', borderRadius: '50%' }} /> : n}
      </span>
      <span>
        <span style={{ display: 'block', fontFamily: SERIF, fontWeight: 600, fontSize: 17, color: state === 'todo' ? C.tertiary : C.ink }}>{title}</span>
        <span style={{ display: 'block', fontFamily: SERIF, fontSize: 14, lineHeight: 1.5, color: state === 'todo' ? C.tertiary : C.secondary, marginTop: 2 }}>{detail}</span>
      </span>
    </li>
  );
}

function Failed({ pod, onRetry, onBack }: { pod: Podcast; onRetry: () => Promise<void>; onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Notice title="The recording didn’t finish" body={pod.error ?? 'Something went wrong while recording.'}>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <button className="dc-btn-primary" disabled={busy}
          onClick={async () => { setBusy(true); setErr(null); try { await onRetry(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }}
          style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', padding: '11px 16px', border: `1px solid ${C.navy}`, background: C.navy, color: C.canvas }}>
          {busy ? 'STARTING…' : 'TRY AGAIN'}
        </button>
        <button className="dc-btn-ghost" onClick={onBack} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', padding: '11px 16px', border: `1px solid ${C.hairMed}`, color: C.secondary }}>
          BACK
        </button>
      </div>
      {err && <div role="status" style={{ fontFamily: SERIF, fontSize: 14, color: C.secondary, marginTop: 10 }}>{err}</div>}
    </Notice>
  );
}

/* ── the show ──────────────────────────────────────────────────────────────── */

const RATES = [1, 1.25, 1.5, 0.75];

function Show({ pod, issue, dataset, onSeeOnPage }: { pod: Podcast; issue: ShelfIssue; dataset: Dataset; onSeeOnPage: (id: string) => void }) {
  const segs = pod.script!.segments;
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(pod.durationS ?? 0);
  const [rate, setRate] = useState(1);
  const [follow, setFollow] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState(false);

  // Where we are: the segment, and the line (timed proportionally within it).
  const lines = useMemo(() => segs.flatMap((s, si) => s.lines.map((l, li) => ({ ...l, key: `${si}.${li}` }))), [segs]);
  const current = lines.find((l) => t >= (l.t0 ?? 0) && t < (l.t1 ?? 0))?.key ?? null;
  const segAt = Math.max(0, segs.findIndex((s) => t < (s.t1 ?? 0) + 0.3));

  // Smooth time while playing (timeupdate fires only ~4×/s).
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => { if (audio.current) setT(audio.current.currentTime); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const seek = (s: number, play = false) => {
    const a = audio.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(s, (dur || a.duration || 0) - 0.05));
    setT(a.currentTime);
    if (play && a.paused) a.play().catch(() => {});
  };
  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => setLoadErr(true)); else a.pause();
  };

  // Space plays, arrows nudge — never while typing, and the reader's own page
  // keys are off on this view (IssueReader).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ' && !(el && el.tagName === 'BUTTON')) { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); seek((audio.current?.currentTime ?? 0) - 5); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); seek((audio.current?.currentTime ?? 0) + 5); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });   // eslint-disable-line react-hooks/exhaustive-deps

  // A patron who scrolls away while it plays is reading on their own; stop chasing.
  useEffect(() => {
    if (!playing) return;
    const off = () => setFollow(false);
    window.addEventListener('wheel', off, { passive: true });
    window.addEventListener('touchmove', off, { passive: true });
    return () => { window.removeEventListener('wheel', off); window.removeEventListener('touchmove', off); };
  }, [playing]);
  useEffect(() => {
    if (!follow || !playing || !current) return;
    document.querySelector(`[data-line="${current}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [current, follow, playing]);

  // Lock-screen and headphone controls.
  useEffect(() => {
    const ms = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession;
    if (!ms || typeof MediaMetadata === 'undefined') return;
    ms.metadata = new MediaMetadata({ title: pod.script!.title, artist: `Your Edition · ${hostLine(pod)}`, album: `${pod.serial ?? ''} · ${pod.dateLabel ?? ''}` });
    ms.setActionHandler('seekbackward', () => seek((audio.current?.currentTime ?? 0) - 15));
    ms.setActionHandler('seekforward', () => seek((audio.current?.currentTime ?? 0) + 15));
    return () => { ms.metadata = null; };
  }, [pod.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const ownQuestion = pod.sections.some((s) => s.kicker.startsWith('You asked:'));
  const copy = async () => {
    try { await navigator.clipboard.writeText(podcastLink(issue.key, pod.id)); } catch { /* the note still shows */ }
    setCopied(ownQuestion
      ? 'Link copied. Anyone with it can listen — including the section from your own question.'
      : 'Link copied. Anyone with it can listen to this episode.');
  };

  return (
    <div>
      <audio
        ref={audio} src={audioUrl(pod.id)} preload="metadata"
        onPlay={() => { setPlaying(true); setFollow(true); }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => { if (isFinite(e.currentTarget.duration)) setDur(e.currentTarget.duration); }}
        onTimeUpdate={(e) => { if (!playing) setT(e.currentTarget.currentTime); }}
        onError={() => setLoadErr(true)}
      />

      {/* the cover and the masthead of the show */}
      <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
        <Cover pod={pod} live={playing} />
        <div style={{ flex: 1, minWidth: 260 }}>
          <Kicker><Spark /> YOUR EDITION · THE PODCAST</Kicker>
          <h1 style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 36, lineHeight: 1.08, color: C.ink, margin: '8px 0 0', textWrap: 'balance' }}>{pod.script!.title}</h1>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.1em', color: C.secondary, marginTop: 10 }}>
            {(pod.serial ?? '').toUpperCase()} · {(pod.dateLabel ?? '').toUpperCase()} · {clock(dur)} · WITH {hostLine(pod).toUpperCase()}
          </div>
          {pod.label && <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 15.5, color: C.secondary, marginTop: 8 }}>Made for {pod.label.charAt(0).toLowerCase() + pod.label.slice(1)}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <a className="dc-btn-ghost" href={audioUrl(pod.id, true)} download style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em', padding: '9px 13px', border: `1px solid ${C.hairMed}`, color: C.secondary, textDecoration: 'none' }}>DOWNLOAD AUDIO</a>
            <button className="dc-btn-ghost" onClick={copy} style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em', padding: '9px 13px', border: `1px solid ${C.hairMed}`, color: C.secondary }}>COPY LINK</button>
          </div>
          {copied && <div style={{ fontFamily: SERIF, fontSize: 13.5, lineHeight: 1.5, color: C.secondary, marginTop: 8 }}>{copied}</div>}
        </div>
      </div>

      {/* the controls — they stay in reach while the transcript scrolls */}
      <div style={{ position: 'sticky', top: STICKY_TOP, zIndex: 10, background: C.canvas, margin: '26px -12px 0', padding: '12px 12px', borderBottom: `1px solid ${C.hairLight}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => seek(t - 15)} title="Back 15 seconds" aria-label="Back 15 seconds" className="dc-btn-ghost"
            style={{ width: 38, height: 38, flexShrink: 0, border: `1px solid ${C.hairMed}`, fontFamily: MONO, fontSize: 10, color: C.secondary }}>−15</button>
          <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (space)' : 'Play (space)'}
            className={playing ? 'dc-btn-primary' : 'dc-btn-primary dc-play-ready'}
            style={{ width: 54, height: 54, flexShrink: 0, borderRadius: '50%', border: 'none', background: C.navy, color: C.canvas, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {playing
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="4" width="5" height="16" /><rect x="14" y="4" width="5" height="16" /></svg>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ marginLeft: 3 }}><path d="M6 4l15 8-15 8z" /></svg>}
          </button>
          <button onClick={() => seek(t + 15)} title="Forward 15 seconds" aria-label="Forward 15 seconds" className="dc-btn-ghost"
            style={{ width: 38, height: 38, flexShrink: 0, border: `1px solid ${C.hairMed}`, fontFamily: MONO, fontSize: 10, color: C.secondary }}>+15</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', color: C.tertiary, marginBottom: 6 }}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: C.navy }}>{chapterLabel(segs[segAt], segAt).toUpperCase()}</span>
              <span style={{ flexShrink: 0 }}>{clock(t)} / {clock(dur)}</span>
            </div>
            <Scrubber t={t} dur={dur} segs={segs} onSeek={(s) => seek(s)} />
          </div>
          <button onClick={() => { const r = RATES[(RATES.indexOf(rate) + 1) % RATES.length]; setRate(r); if (audio.current) audio.current.playbackRate = r; }}
            title="Playback speed" aria-label={`Playback speed ${rate}×`} className="dc-btn-ghost"
            style={{ width: 52, height: 38, flexShrink: 0, border: `1px solid ${C.hairMed}`, fontFamily: MONO, fontSize: 11, color: C.secondary }}>{rate}×</button>
        </div>
        {loadErr && <div role="status" style={{ fontFamily: SERIF, fontSize: 13.5, color: C.secondary, marginTop: 8 }}>The audio didn’t load — the reading room may be offline. Try the page again in a moment.</div>}
      </div>

      {/* chapters */}
      <ol style={{ listStyle: 'none', padding: 0, margin: '20px 0 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 6 }}>
        {segs.map((s, i) => {
          const on = i === segAt && (t > 0 || playing);
          return (
            <li key={i}>
              <button onClick={() => seek(s.t0 ?? 0, true)} className="dc-edition-choice"
                style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 10, alignItems: 'baseline', padding: '9px 11px', border: `1px solid ${on ? C.navy : C.hairLight}`, background: on ? 'rgba(0,87,183,0.05)' : C.canvas, boxShadow: on ? `inset 3px 0 0 ${C.navy}` : 'none' }}>
                <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.tertiary, flexShrink: 0, width: 32 }}>{clock(s.t0 ?? 0)}</span>
                <span style={{ fontFamily: SERIF, fontSize: 14.5, fontWeight: 600, lineHeight: 1.3, color: C.ink }}>{chapterLabel(s, i)}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* the transcript */}
      <div style={{ marginTop: 40 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, borderBottom: `3px double ${C.ink}`, paddingBottom: 8 }}>
          <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: C.ink }}>TRANSCRIPT</span>
          <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.08em', color: C.tertiary }}>CLICK ANY LINE TO HEAR IT</span>
        </div>
        <Transcript pod={pod} segments={segs} activeLine={current} onLine={(s) => { setFollow(true); seek(s, true); }} dataset={dataset} onSeeOnPage={onSeeOnPage} />
      </div>

      <footer style={{ marginTop: 40, borderTop: `1px solid ${C.hairMed}`, paddingTop: 12, fontFamily: MONO, fontSize: 9, lineHeight: 1.8, letterSpacing: '0.06em', color: C.tertiary }}>
        ✦ SCRIPT WRITTEN BY AI ({(pod.scriptModel ?? '').toUpperCase()}) ONLY FROM YOUR EDITION’S SECTIONS, WHICH WERE WRITTEN ONLY FROM THIS ISSUE’S PUBLISHED PAGES ·
        VOICES GENERATED BY AI ({(pod.ttsModel ?? '').toUpperCase()}) · CLEVELAND PUBLIC LIBRARY
      </footer>

      {playing && !follow && current && (
        <button onClick={() => setFollow(true)} className="dc-btn-primary"
          style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 30, display: 'flex', alignItems: 'center', gap: 8, fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em', padding: '11px 16px', border: 'none', background: C.ink, color: C.canvas, boxShadow: '0 8px 24px rgba(15,18,21,0.25)' }}>
          <OnAir live n={3} h={12} /> FOLLOW ALONG
        </button>
      )}
    </div>
  );
}

function chapterLabel(s: PodSegment | undefined, i: number): string {
  if (!s) return '';
  if (s.kind === 'intro') return 'Opening';
  if (s.kind === 'outro') return 'Closing';
  return `${s.section ?? i}. ${s.title.replace(/^You asked:\s*/, 'Your question: ')}`;
}

/** The scrubber, marked where each section begins. Click or drag to seek. */
function Scrubber({ t, dur, segs, onSeek }: { t: number; dur: number; segs: PodSegment[]; onSeek: (s: number) => void }) {
  const bar = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const at = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * dur;
  };
  const pct = dur ? (t / dur) * 100 : 0;
  const hoverSeg = hover == null ? null : segs.findIndex((s) => hover < (s.t1 ?? 0) + 0.3);
  return (
    <div
      ref={bar} role="slider" tabIndex={0} aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)} aria-valuetext={`${clock(t)} of ${clock(dur)}`}
      onPointerDown={(e) => { if (!dur) return; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); onSeek(at(e.clientX)); }}
      onPointerMove={(e) => { if (!dur) return; setHover(at(e.clientX)); if (e.buttons & 1) onSeek(at(e.clientX)); }}
      onPointerLeave={() => setHover(null)}
      style={{ position: 'relative', height: 18, cursor: 'pointer', touchAction: 'none' }}
    >
      <div style={{ position: 'absolute', left: 0, right: 0, top: 7, height: 4, background: C.hairLight }} />
      <div style={{ position: 'absolute', left: 0, top: 7, height: 4, width: `${pct}%`, background: C.navy }} />
      {dur > 0 && segs.slice(1).map((s, i) => (
        <span key={i} style={{ position: 'absolute', left: `${((s.t0 ?? 0) / dur) * 100}%`, top: 4, width: 2, height: 10, marginLeft: -1, background: C.canvas, boxShadow: `0 0 0 1px ${C.hairMed}` }} />
      ))}
      <span style={{ position: 'absolute', left: `${pct}%`, top: 3, width: 12, height: 12, marginLeft: -6, borderRadius: '50%', background: C.navy, boxShadow: `0 0 0 3px ${C.canvas}` }} />
      {hover != null && dur > 0 && (
        <span style={{ position: 'absolute', left: `${(hover / dur) * 100}%`, bottom: 22, transform: 'translateX(-50%)', whiteSpace: 'nowrap', background: C.ink, color: C.canvas, fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.04em', padding: '4px 7px', pointerEvents: 'none' }}>
          {clock(hover)}{hoverSeg != null && hoverSeg >= 0 ? ` · ${chapterLabel(segs[hoverSeg], hoverSeg)}` : ''}
        </span>
      )}
    </div>
  );
}

function Transcript({ pod, segments, activeLine, onLine, dim, dataset, onSeeOnPage }: {
  pod: Podcast; segments: PodSegment[]; activeLine: string | null; onLine: ((t: number) => void) | null; dim?: boolean;
  dataset?: Dataset; onSeeOnPage?: (id: string) => void;
}) {
  const byId = useMemo(() => new Map((dataset?.indexItems ?? []).map((i) => [i.id, i])), [dataset]);
  return (
    <div>
      {segments.map((s, si) => {
        const src = s.kind === 'section' && s.section ? pod.sections[s.section - 1] : null;
        return (
          <section key={si} style={{ padding: '22px 0 6px', borderBottom: si < segments.length - 1 ? `1px solid ${C.hairLight}` : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginBottom: 10 }}>
              <span style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.16em', color: C.navy, textTransform: 'uppercase' }}>{chapterLabel(s, si)}</span>
              {s.t0 != null && <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.tertiary, flexShrink: 0 }}>{clock(s.t0)}</span>}
            </div>
            {s.lines.map((l, li) => {
              const key = `${si}.${li}`;
              const on = activeLine === key;
              const host = pod.hosts[l.speaker] ?? pod.hosts[0];
              const Tag = onLine ? 'button' : 'div';
              return (
                <Tag
                  key={li} data-line={key} {...(onLine ? { onClick: () => onLine(l.t0 ?? s.t0 ?? 0), type: 'button' as const } : {})}
                  className={onLine ? 'dc-pod-line' : undefined} aria-current={on ? 'true' : undefined}
                  style={{
                    display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', gap: 14, width: '100%', textAlign: 'left',
                    padding: '7px 10px', margin: '0 -10px', border: 'none', borderLeft: `3px solid ${on ? C.marigold : 'transparent'}`,
                    background: on ? 'rgba(241,196,0,0.16)' : 'transparent', transition: 'background 0.2s ease',
                    opacity: dim ? 0.7 : 1, cursor: onLine ? 'pointer' : 'default',
                  }}
                >
                  <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', fontWeight: 700, color: HOST_COLOR[l.speaker] ?? C.navy, paddingTop: 5, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {host?.name}
                  </span>
                  <span style={{ fontFamily: SERIF, fontSize: 17, lineHeight: 1.6, color: on ? C.ink : C.body }}>{l.text}</span>
                </Tag>
              );
            })}
            {src && src.crops.length > 0 && onSeeOnPage && (
              <div className="dc-pod-src" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0 8px 106px' }}>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', color: C.tertiary, marginRight: 4 }}>FROM THE PAPER</span>
                {src.crops.map((c) => <Clip key={c.id} c={c} item={byId.get(c.id)} onOpen={() => onSeeOnPage(c.id)} />)}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Clip({ c, item, onOpen }: { c: PodCrop; item?: IndexItem; onOpen: () => void }) {
  const label = item?.title ?? c.title ?? item?.typeLabel ?? 'item';
  const page = item?.printedPage ?? c.page;
  return (
    <button onClick={onOpen} title={`${label} — see it on page ${page}`} className="dc-edition-crop"
      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: c.url ? '3px 8px 3px 3px' : '5px 8px', border: `1px solid ${C.hairMed}`, background: C.canvas, maxWidth: 220 }}>
      {c.url && <img src={c.url} alt="" loading="lazy" style={{ width: 34, height: 34, objectFit: 'cover', objectPosition: 'top center', filter: 'grayscale(1) contrast(1.05)', display: 'block' }} />}
      <span style={{ fontFamily: MONO, fontSize: 9, color: C.navy, flexShrink: 0 }}>P.{page}</span>
      <span style={{ fontFamily: SANS, fontSize: 11, color: C.body, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </button>
  );
}
