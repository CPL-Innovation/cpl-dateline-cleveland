// The issue reader — one bound issue, one page at a time, in two registers:
//
//   READ  the page's published objects set as a reading column, in printed order,
//         the way the paper's own website would have set them.
//   SCAN  the archival page image, zoomable and pannable, the way a microfilm
//         reader (or the Internet Archive) shows a leaf.
//
// Both registers turn the same pages, so the toggle never loses your place. The
// reader shows only what a curator has PUBLISHED (Principle 15) — a page the
// pipeline has read but nobody has released says so, and offers the scan instead.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Dataset, IndexItem } from '../lib/types';
import { TYPE_COLORS } from '../lib/types';
import type { ShelfIssue, ShelfPage } from '../lib/shelf';
import { objectsOnPage } from '../lib/shelf';
import { IssueChat } from './IssueChat';
import { C, MONO, SANS, SERIF } from '../lib/ui';

export type ReaderView = 'read' | 'scan';

interface Props {
  issue: ShelfIssue;
  dataset: Dataset;
  pageNumber: number;
  view: ReaderView;
  onPage: (n: number) => void;
  onView: (v: ReaderView) => void;
  onBack: () => void;
  onOpenObject: (id: string) => void;
}

export function IssueReader({ issue, dataset, pageNumber, view, onPage, onView, onBack, onOpenObject }: Props) {
  const idx = Math.max(0, issue.pages.findIndex((p) => p.page === pageNumber));
  const page = issue.pages[idx] ?? issue.pages[0];
  const prev = issue.pages[idx - 1];
  const next = issue.pages[idx + 1];
  const items = page ? objectsOnPage(page, dataset) : [];
  const top = useRef<HTMLDivElement | null>(null);
  // The item the assistant last cited — the reader turns to its page and marks it.
  const [cited, setCited] = useState<string | null>(null);
  const [slipOpen, setSlipOpen] = useState(false);

  // Where a page turn lands you differs by register. READ starts at the top of the
  // column; SCAN takes the whole window (see below), so there is nothing to
  // scroll and nothing to restore.
  useEffect(() => {
    if (view !== 'read') return;
    // …unless you arrived by following a citation or a region box to an item on
    // THIS page: the column scrolls to that item instead, and a top-scroll here
    // would win the race and undo it (child effects run before the parent's).
    if (cited && items.some((i) => i.id === cited)) return;
    window.scrollTo({ top: 0 });
  }, [view, pageNumber]);    // eslint-disable-line react-hooks/exhaustive-deps

  // SCAN is a room, not a section of a page: it covers the viewport, and the
  // document behind it must not scroll under the reader's fingers.
  //
  // A LAYOUT effect, not a passive one, so leaving the room unlocks the document
  // in the layout phase — before the reading column's own effect tries to scroll
  // to a cited item. Unlocked one phase later, that scroll lands on a document
  // that still has nowhere to go, and silently does nothing.
  useLayoutEffect(() => {
    if (view !== 'scan') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, [view]);

  // Arrow keys turn pages — the gesture a reader already has in their hands.
  // Ignored while typing, so the header's search box keeps its own arrows.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'ArrowLeft' && prev) { e.preventDefault(); onPage(prev.page); }
      else if (e.key === 'ArrowRight' && next) { e.preventDefault(); onPage(next.page); }
      else if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, onPage, onBack]);

  // Following a citation is one gesture with three consequences: the register
  // becomes READ (a scan can't show you a paragraph), the book turns to the page,
  // and the item is marked so the eye lands on it rather than hunting a column.
  const goToCitation = (objectId: string) => {
    const item = dataset.indexItems.find((i) => i.id === objectId);
    if (!item) return;
    if (view !== 'read') onView('read');
    if (item.printedPage && item.printedPage !== pageNumber) onPage(item.printedPage);
    setCited(objectId);
  };

  if (!page) return null;

  const bar = (
    <ReaderBar
      issue={issue}
      page={page}
      view={view}
      onView={onView}
      onBack={onBack}
      onPage={onPage}
      prev={prev}
      next={next}
    />
  );

  // SCAN takes the window. A scanned leaf is portrait and the site around it is
  // landscape chrome — keeping the masthead, the nav and the search box on screen
  // costs ~150px of the one dimension the page actually needs, and the reader bar
  // already carries the way out. The filmstrip stands up as a rail inside the
  // stage, where the dead margin beside a portrait page pays for it.
  if (view === 'scan') {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 40, background: C.canvas, display: 'flex', flexDirection: 'column' }}>
        {bar}
        <ScanView
          page={page} issue={issue} items={items} onPage={onPage} prev={prev} next={next}
          onOpenObject={onOpenObject}
          // "Read it set" is the same gesture the assistant's citations use: leave
          // the scan, turn to the item in the reading column, mark it.
          onReadItem={(id) => { onView('read'); setCited(id); }}
          onSlip={setSlipOpen}
        />
        <IssueChat
          key={issue.key} issue={issue} dataset={dataset} onCite={goToCitation}
          offsetRight={slipOpen ? SLIP_W + 24 : 24}
        />
      </div>
    );
  }

  return (
    <div ref={top}>
      {bar}
      <Filmstrip issue={issue} current={page.page} onPage={onPage} />

      {(
        <ReadView
          issue={issue}
          page={page}
          items={items}
          onOpenObject={onOpenObject}
          onView={onView}
          onPage={onPage}
          prev={prev}
          next={next}
          cited={cited}
        />
      )}

      {/* One conversation per book: remounting on issue.key means closing a book
          closes its conversation rather than carrying it into the next one. */}
      <IssueChat key={issue.key} issue={issue} dataset={dataset} onCite={goToCitation} />
    </div>
  );
}

/* ── chrome ────────────────────────────────────────────────────────────────── */

function ReaderBar({
  issue, page, view, onView, onBack, onPage, prev, next,
}: {
  issue: ShelfIssue; page: ShelfPage; view: ReaderView;
  onView: (v: ReaderView) => void; onBack: () => void; onPage: (n: number) => void;
  prev?: ShelfPage; next?: ShelfPage;
}) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 20, background: C.canvas, borderBottom: `1px solid ${C.hairMed}` }}>
      <div className="dc-shell" style={{ padding: '14px 32px 12px', display: 'flex', alignItems: 'center', gap: 24 }}>
        <button className="dc-underline-hover" onClick={onBack} style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', color: C.navy, flexShrink: 0 }}>
          ← BACK TO THE STACKS
        </button>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 19, lineHeight: 1.2, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {issue.serial} <span style={{ color: C.tertiary }}>·</span> {issue.dateLabel}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.06em', color: C.tertiary, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {issue.title.toUpperCase()}
          </div>
        </div>

        <ViewToggle view={view} onView={onView} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <PagerButton label="‹" title="Previous page (←)" onClick={() => prev && onPage(prev.page)} disabled={!prev} />
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', color: C.secondary, minWidth: 96, textAlign: 'center' }}>
            PAGE {page.page} / {issue.pages.length}
            {issue.pages.length !== issue.pageCount ? '*' : ''}
          </div>
          <PagerButton label="›" title="Next page (→)" onClick={() => next && onPage(next.page)} disabled={!next} />
        </div>
      </div>
      {!issue.structureComplete && issue.pages.length !== issue.pageCount && (
        <div className="dc-shell" style={{ padding: '0 32px 8px', fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.06em', color: C.tertiary }}>
          * SHOWING THE {issue.pages.length} PAGE{issue.pages.length === 1 ? '' : 'S'} WE COULD RESOLVE OF {issue.pageCount} PRINTED — THE ISSUE'S FULL STRUCTURE WAS UNAVAILABLE.
        </div>
      )}
    </div>
  );
}

function PagerButton({ label, title, onClick, disabled }: { label: string; title: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={disabled ? undefined : 'dc-btn-ghost'}
      style={{
        fontFamily: MONO, fontSize: 15, lineHeight: 1, padding: '6px 12px',
        border: `1px solid ${disabled ? C.hairLight : C.hairMed}`,
        color: disabled ? C.hairMed : C.navy,
        cursor: disabled ? 'default' : 'pointer',
        background: C.canvas,
      }}
    >
      {label}
    </button>
  );
}

function ViewToggle({ view, onView }: { view: ReaderView; onView: (v: ReaderView) => void }) {
  const seg = (v: ReaderView, label: string, title: string) => {
    const active = view === v;
    return (
      <button
        onClick={() => onView(v)}
        title={title}
        style={{
          fontFamily: MONO, fontSize: 10, fontWeight: active ? 700 : 500, letterSpacing: '0.1em',
          padding: '6px 12px', background: active ? C.navy : C.canvas, color: active ? C.canvas : C.secondary, border: 'none',
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div style={{ display: 'flex', border: `1px solid ${C.hairMed}`, flexShrink: 0 }}>
      {seg('read', 'READ', 'The extracted text, set as a reading column')}
      <div style={{ width: 1, background: C.hairMed }} />
      {seg('scan', 'SCAN', 'The archival page image, as printed')}
    </div>
  );
}

function Filmstrip({ issue, current, onPage }: { issue: ShelfIssue; current: number; onPage: (n: number) => void }) {
  return (
    <div style={{ borderBottom: `1px solid ${C.hairLight}`, background: C.sunken }}>
      <div className="dc-shell" style={{ padding: '10px 32px', display: 'flex', gap: 10, overflowX: 'auto' }}>
        {issue.pages.map((p) => {
          const active = p.page === current;
          return (
            <button
              key={p.page}
              onClick={() => onPage(p.page)}
              title={`Page ${p.page}${p.publishedCount ? ` — ${p.publishedCount} published objects` : p.ingested ? ' — read, nothing published yet' : ' — not read by the pipeline yet'}`}
              style={{ flexShrink: 0, width: 50, textAlign: 'center', opacity: p.ingested || p.thumb ? 1 : 0.55 }}
            >
              <div
                style={{
                  height: 62, border: `1px solid ${active ? C.navy : C.hairMed}`, outline: active ? `2px solid ${C.navy}` : 'none',
                  background: p.thumb ? C.canvas : `repeating-linear-gradient(45deg, ${C.sunken}, ${C.sunken} 6px, ${C.canvas} 6px, ${C.canvas} 12px)`,
                  overflow: 'hidden',
                }}
              >
                {p.thumb && (
                  <img src={p.thumb} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
                )}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.04em', color: active ? C.navy : C.tertiary, marginTop: 4, fontWeight: active ? 700 : 400 }}>
                {p.page}
                {p.publishedCount ? '•' : ''}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── SCAN ──────────────────────────────────────────────────────────────────── */

// The scan register is a STAGE, not a document: a fixed slab of viewport with a
// page rail down one side and the leaf filling everything else. The old layout
// let the page compete with the site for vertical space and then threw the
// horizontal space away — a portrait page in a landscape window leaves two dead
// margins, and the rail belongs in one of them.
const CONTROLS = 44;    // the strip under the stage: provenance + zoom
const RAIL = 92;
const SLIP_W = 380;   // the transcription slip docked beside the leaf

// Zoom works on a VIRTUAL page 1600 CSS px wide, not on the loaded image's
// natural size. That decoupling is what lets the viewer swap in a sharper IIIF
// derivative mid-zoom without the geometry moving under the reader's hands.
const PAGE_W = 1600;
// ContentDM serves exact pixel widths (`w,`); this is the ladder we climb.
const RES_LADDER = [1600, 2600, 4000, 5332];

function ScanView({
  page, issue, items, onPage, prev, next, onOpenObject, onReadItem, onSlip,
}: {
  page: ShelfPage; issue: ShelfIssue; items: IndexItem[]; onPage: (n: number) => void;
  prev?: ShelfPage; next?: ShelfPage;
  onOpenObject: (id: string) => void;
  onReadItem: (id: string) => void;
  onSlip: (open: boolean) => void;
}) {
  // Only objects the pipeline actually LOCATED can be drawn. An object with no
  // region is not hidden information — nobody has said where on the leaf it sits,
  // and a box in the wrong place is worse than no box.
  const located = items.filter((i) => i.region?.rects?.length);
  const [regionsOn, setRegionsOn] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const chosen = selected ? located.find((i) => i.id === selected) ?? null : null;

  // Turning a leaf drops the selection: box ids belong to the page they were on.
  useEffect(() => { setSelected(null); }, [page.page]);
  // Hiding the boxes closes the slip with them — a slip with nothing highlighted
  // behind it is an orphan.
  useEffect(() => { if (!regionsOn) setSelected(null); }, [regionsOn]);
  // The slip docks against the right edge, where the assistant's call button sits.
  useEffect(() => { onSlip(!!chosen); return () => onSlip(false); }, [chosen, onSlip]);

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, background: C.sunken, borderTop: `1px solid ${C.hairLight}` }}>
      <PageRail issue={issue} current={page.page} onPage={onPage} />
      {/* Keyed on the page: a new leaf gets a new viewer, fitted from scratch.
          Carrying a 3× zoom across a page turn drops the reader into the middle
          of a column with no idea where they are. */}
      <ScanStage
        key={page.record ?? page.page}
        page={page} issue={issue} prev={prev} next={next} onPage={onPage}
        located={located}
        regionsOn={regionsOn}
        onRegions={setRegionsOn}
        selected={selected}
        onPick={setSelected}
      />
      {chosen && (
        <TranscriptionSlip
          item={chosen}
          n={items.indexOf(chosen) + 1}
          onClose={() => setSelected(null)}
          onRead={() => onReadItem(chosen.id)}
          onIndex={() => onOpenObject(chosen.id)}
        />
      )}
    </div>
  );
}

function PageRail({ issue, current, onPage }: { issue: ShelfIssue; current: number; onPage: (n: number) => void }) {
  return (
    <div style={{ width: RAIL, flexShrink: 0, borderRight: `1px solid ${C.hairMed}`, background: C.canvas, overflowY: 'auto', padding: '12px 0 16px' }}>
      <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.14em', color: C.tertiary, textAlign: 'center', marginBottom: 10 }}>
        PAGES
      </div>
      {issue.pages.map((p) => {
        const active = p.page === current;
        return (
          <button
            key={p.page}
            onClick={() => onPage(p.page)}
            title={`Page ${p.page}${p.publishedCount ? ` — ${p.publishedCount} published items` : p.ingested ? ' — read, nothing published yet' : ' — not read by the pipeline yet'}`}
            style={{ display: 'block', width: '100%', padding: '5px 0', textAlign: 'center', opacity: p.ingested || p.thumb ? 1 : 0.55 }}
          >
            <div
              style={{
                width: 58, height: 74, margin: '0 auto',
                border: `1px solid ${active ? C.navy : C.hairMed}`,
                outline: active ? `2px solid ${C.navy}` : 'none',
                background: p.thumb ? C.canvas : `repeating-linear-gradient(45deg, ${C.sunken}, ${C.sunken} 6px, ${C.canvas} 6px, ${C.canvas} 12px)`,
                overflow: 'hidden',
              }}
            >
              {p.thumb && (
                <img src={p.thumb} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
              )}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 9.5, color: active ? C.navy : C.tertiary, marginTop: 3, fontWeight: active ? 700 : 400 }}>
              {p.page}
              {p.publishedCount ? '•' : ''}
            </div>
          </button>
        );
      })}
    </div>
  );
}

interface Point { x: number; y: number }

function ScanStage({
  page, issue, prev, next, onPage, located, regionsOn, onRegions, selected, onPick,
}: {
  page: ShelfPage; issue: ShelfIssue; prev?: ShelfPage; next?: ShelfPage; onPage: (n: number) => void;
  located: IndexItem[]; regionsOn: boolean; onRegions: (on: boolean) => void;
  selected: string | null; onPick: (id: string | null) => void;
}) {
  const stage = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [aspect, setAspect] = useState(0);          // page height / width; 0 until the first load
  // Scale and offset are ONE state, always advanced functionally. Held apart they
  // desynchronise the moment two zooms land in a single React batch: the second
  // reads a stale scale, so the page slides without growing.
  const [vp, setVp] = useState({ s: 0, x: 0, y: 0 }); // s = 0 until we can fit
  const [src, setSrc] = useState<string | null>(page.image ?? null);
  const rung = useRef(0);                            // how far up the resolution ladder we are
  const drag = useRef<{ from: Point; off: Point } | null>(null);
  const moved = useRef(false);                       // this gesture was a pan, not a click
  const scale = vp.s;

  // Fits, derived — never stored, so a window resize can't leave them stale.
  const fitPage = box.w && aspect ? Math.min(box.w / PAGE_W, box.h / (PAGE_W * aspect)) : 0;
  const fitWidth = box.w ? box.w / PAGE_W : 0;
  const maxScale = Math.max(fitPage, RES_LADDER[RES_LADDER.length - 1] / PAGE_W);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clamp = (o: Point, s: number): Point => {
    const iw = PAGE_W * s;
    const ih = PAGE_W * aspect * s;
    return {
      // Smaller than the stage in an axis → centred in it. Larger → pannable, but
      // never past its own edges: the page cannot be flung into the void.
      x: iw <= box.w ? (box.w - iw) / 2 : Math.min(0, Math.max(box.w - iw, o.x)),
      y: ih <= box.h ? (box.h - ih) / 2 : Math.min(0, Math.max(box.h - ih, o.y)),
    };
  };

  /**
   * Zoom about a point in stage coordinates — the pixel under the cursor stays
   * under the cursor. `next` receives the CURRENT scale, so repeated zooms
   * compose correctly however fast they arrive.
   */
  const zoom = (next: (s: number) => number, anchor?: Point) =>
    setVp((v) => {
      const s1 = v.s || fitPage;
      if (!s1) return v;
      const s2 = Math.min(maxScale, Math.max(fitPage, next(s1)));
      if (s2 === v.s) return v;
      const a = anchor ?? { x: box.w / 2, y: box.h / 2 };
      const k = s2 / s1;
      const p = clamp({ x: a.x - (a.x - v.x) * k, y: a.y - (a.y - v.y) * k }, s2);
      return { s: s2, ...p };
    });

  const pan = (dx: number, dy: number) =>
    setVp((v) => (v.s ? { s: v.s, ...clamp({ x: v.x + dx, y: v.y + dy }, v.s) } : v));

  const setFit = (kind: 'page' | 'width') => {
    const s = kind === 'page' ? fitPage : fitWidth;
    if (!s) return;
    // Fit-width lands you at the TOP of the page, where a newspaper starts.
    setVp({ s, ...clamp({ x: (box.w - PAGE_W * s) / 2, y: 0 }, s) });
  };

  // First fit, once the stage is measured and the page's proportions are known.
  useEffect(() => {
    if (!scale && fitPage) setVp({ s: fitPage, ...clamp({ x: 0, y: 0 }, fitPage) });
  }, [fitPage, scale]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the view legal across a window resize.
  useEffect(() => {
    setVp((v) => (v.s ? { s: v.s, ...clamp({ x: v.x, y: v.y }, v.s) } : v));
  }, [box.w, box.h]);     // eslint-disable-line react-hooks/exhaustive-deps

  // Climb the resolution ladder as the reader zooms in. Only ever UP, and only
  // after the sharper image has loaded — so zooming never blanks the page.
  useEffect(() => {
    if (!page.iiifId || !scale) return;
    const need = PAGE_W * scale * Math.min(2, window.devicePixelRatio || 1);
    const want = RES_LADDER.findIndex((w) => w >= need);
    const target = want === -1 ? RES_LADDER.length - 1 : want;
    if (target <= rung.current) return;
    rung.current = target;
    const url = `${page.iiifId}/full/${RES_LADDER[target]},/0/default.jpg`;
    const pre = new Image();
    pre.onload = () => setSrc(url);
    pre.src = url;
  }, [scale, page.iiifId]);

  // Zoom and fit from the keyboard. Page turns stay with the reader above.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom((s) => s * 1.35); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoom((s) => s / 1.35); }
      else if (e.key === '0') { e.preventDefault(); setFit('page'); }
      else if ((e.key === 'b' || e.key === 'B') && located.length) { e.preventDefault(); onRegions(!regionsOn); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Wheel: ⌘/ctrl zooms about the pointer, a plain wheel pans the page. Bound by
  // hand because React's wheel listener is passive and cannot preventDefault.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!scale) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoom((s) => s * Math.exp(-e.deltaY / 260), { x: e.clientX - r.left, y: e.clientY - r.top });
      } else {
        pan(-e.deltaX, -e.deltaY);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const zoomed = !!scale && !!fitPage && scale > fitPage * 1.001;
  const pct = fitPage ? Math.round((scale / fitPage) * 100) : 100;
  const full = page.iiifId ? `${page.iiifId}/full/full/0/default.jpg` : null;

  // A pan that happens to start on a region box must not end in a selection —
  // dragging the page is the commoner gesture, and it would fire on every release.
  const pick = (id: string | null) => { if (!moved.current) onPick(id); };

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        ref={stage}
        onPointerDown={(e) => {
          moved.current = false;
          if (!zoomed) return;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          drag.current = { from: { x: e.clientX, y: e.clientY }, off: { x: vp.x, y: vp.y } };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (Math.abs(e.clientX - d.from.x) + Math.abs(e.clientY - d.from.y) > 4) moved.current = true;
          setVp((v) => (v.s ? { s: v.s, ...clamp({ x: d.off.x + (e.clientX - d.from.x), y: d.off.y + (e.clientY - d.from.y) }, v.s) } : v));
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        onDoubleClick={(e) => {
          const r = stage.current!.getBoundingClientRect();
          const at = { x: e.clientX - r.left, y: e.clientY - r.top };
          if (zoomed) setFit('page');
          else zoom(() => fitPage * 2.5, at);
        }}
        style={{
          flex: 1, position: 'relative', overflow: 'hidden', background: C.sunken,
          cursor: zoomed ? 'grab' : 'zoom-in',
          touchAction: 'none',
        }}
      >
        {src ? (
          // The page and its region boxes share ONE positioned, transformed frame,
          // so a box is expressed in percentages of the leaf and needs no maths of
          // its own — zoom and pan carry it automatically, exactly in register.
          <div
            style={{
              position: 'absolute', left: 0, top: 0,
              width: PAGE_W * (scale || 0.001),
              height: aspect ? PAGE_W * aspect * (scale || 0.001) : 1,
              transform: `translate(${vp.x}px, ${vp.y}px)`,
              transformOrigin: '0 0',
              visibility: scale ? 'visible' : 'hidden',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.12)',
              background: C.canvas,
            }}
          >
            <img
              src={src}
              alt={`${issue.serial}, ${issue.dateLabel}, page ${page.page} — archival scan`}
              draggable={false}
              onLoad={(e) => {
                const im = e.currentTarget;
                if (!aspect && im.naturalWidth) setAspect(im.naturalHeight / im.naturalWidth);
              }}
              style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }}
            />
            {regionsOn && located.map((it) => (
              <RegionBox
                key={it.id}
                item={it}
                selected={selected === it.id}
                dimmed={!!selected && selected !== it.id}
                onPick={() => pick(selected === it.id ? null : it.id)}
              />
            ))}
          </div>
        ) : (
          <Placeholder issue={issue} page={page} />
        )}

        <EdgeArrow side="left" show={!!prev} onClick={() => prev && onPage(prev.page)} />
        <EdgeArrow side="right" show={!!next} onClick={() => next && onPage(next.page)} />
      </div>

      <div style={{ height: CONTROLS, flexShrink: 0, background: C.canvas, borderTop: `1px solid ${C.hairMed}`, display: 'flex', alignItems: 'center', gap: 14, padding: '0 14px' }}>
        <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.05em', color: C.tertiary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {issue.serial.toUpperCase()} · {issue.dateLabel.toUpperCase()} · PAGE {page.page} ·{' '}
          {page.image ? 'SCANNED BY CPL · CONTENTDM IIIF' : 'PLACEHOLDER — CONCEPT DEMO'}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.05em', color: C.tertiary, whiteSpace: 'nowrap' }}>
          {regionsOn ? 'CLICK A BOX TO READ IT' : zoomed ? 'DRAG TO PAN' : 'DOUBLE-CLICK TO ZOOM'} · ⌘/CTRL+SCROLL
        </div>

        {/* The bridge between the two registers: what the machine pulled OFF this
            leaf, drawn back ON it. Absent rather than dead when nothing on the page
            has been located — the tooltip says which of the two reasons applies. */}
        <button
          onClick={() => located.length && onRegions(!regionsOn)}
          disabled={!located.length}
          title={
            located.length
              ? `Show the ${located.length} published items the pipeline located on this page (B)`
              : page.publishedCount
                ? 'Nothing on this page has been located on the leaf yet'
                : 'Nothing from this page has been published yet'
          }
          style={{
            display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
            fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em',
            border: `1px solid ${regionsOn ? C.navy : C.hairMed}`, padding: '6px 10px',
            background: regionsOn ? C.navy : C.canvas,
            color: !located.length ? C.hairMed : regionsOn ? C.canvas : C.secondary,
            cursor: located.length ? 'pointer' : 'default',
          }}
        >
          <span style={{ width: 9, height: 9, border: `1.5px solid ${!located.length ? C.hairMed : regionsOn ? C.canvas : C.navy}`, display: 'inline-block' }} />
          REGIONS
          {!!located.length && <span style={{ opacity: 0.75 }}>{located.length}</span>}
        </button>

        <div style={{ display: 'flex', border: `1px solid ${C.hairMed}`, flexShrink: 0 }}>
          <ZoomButton label="FIT PAGE" active={!!scale && Math.abs(scale - fitPage) < 0.005} onClick={() => setFit('page')} />
          <Div />
          <ZoomButton label="FIT WIDTH" active={!!scale && Math.abs(scale - fitWidth) < 0.005} onClick={() => setFit('width')} />
          <Div />
          <ZoomButton label="−" title="Zoom out (−)" onClick={() => zoom((s) => s / 1.35)} />
          <Div />
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.secondary, padding: '0 10px', minWidth: 54, textAlign: 'center', alignSelf: 'center' }}>
            {pct}%
          </div>
          <Div />
          <ZoomButton label="+" title="Zoom in (+)" onClick={() => zoom((s) => s * 1.35)} />
        </div>
        {full && (
          <a
            className="dc-btn-ghost"
            href={full}
            target="_blank"
            rel="noreferrer"
            title="Open the full-resolution scan on CPL's ContentDM IIIF"
            style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', border: `1px solid ${C.hairMed}`, padding: '6px 10px', color: C.secondary, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            FULL RES ↗
          </a>
        )}
      </div>
    </div>
  );
}

const Div = () => <div style={{ width: 1, background: C.hairMed }} />;

/** One located object, drawn on the leaf. Percentages of the page frame, so zoom
 *  and pan carry it for free. Colour is the index's functional type colour, so a
 *  reader who has used the facets already knows what a yellow box means. */
function RegionBox({
  item, selected, dimmed, onPick,
}: { item: IndexItem; selected: boolean; dimmed: boolean; onPick: () => void }) {
  const color = TYPE_COLORS[item.type] || C.navy;
  const rects = item.region?.rects ?? [];
  return (
    <>
      {rects.map((r, i) => (
        <button
          key={i}
          onClick={(e) => { e.stopPropagation(); onPick(); }}
          className="dc-region-box"
          title={`${item.typeLabel}${item.title ? ` — ${item.title}` : ''}`}
          style={{
            position: 'absolute',
            left: `${r[0] * 100}%`, top: `${r[1] * 100}%`,
            width: `${r[2] * 100}%`, height: `${r[3] * 100}%`,
            border: `1.5px solid ${color}`,
            background: selected ? 'rgba(241,196,0,0.18)' : 'transparent',
            boxShadow: selected ? `0 0 0 2px rgba(241,196,0,0.65)` : 'none',
            opacity: dimmed ? 0.32 : 1,
            padding: 0,
          }}
        >
          {/* The label rides the FIRST rect only — a story that jumps columns
              should be named once, not once per leg. */}
          {i === 0 && (
            <span
              className="dc-region-tag"
              style={{
                position: 'absolute', top: -14, left: -1.5, padding: '1px 5px',
                background: color, color: color === '#f1c400' ? C.ink : '#fff',
                fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.06em', whiteSpace: 'nowrap',
                maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis',
                opacity: selected ? 1 : 0,
              }}
            >
              {(item.title ?? item.typeLabel).slice(0, 42)}
            </span>
          )}
        </button>
      ))}
    </>
  );
}

/** The extracted text of one region, docked beside the leaf it came off. */
function TranscriptionSlip({
  item, n, onClose, onRead, onIndex,
}: { item: IndexItem; n: number; onClose: () => void; onRead: () => void; onIndex: () => void }) {
  const color = TYPE_COLORS[item.type] || C.navy;
  const title = headlineOf(item);
  const source = item.region?.source ?? 'vlm';
  const provenance =
    source === 'human' ? 'REGION DRAWN BY A CURATOR'
      : source === 'ocr-anchor' ? 'REGION LOCATED AGAINST THE OCR WORD GRID'
        : 'REGION ESTIMATED BY THE MODEL — APPROXIMATE';
  return (
    <div style={{ width: SLIP_W, flexShrink: 0, borderLeft: `1px solid ${C.hairMed}`, background: C.canvas, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${C.hairLight}` }}>
        <span style={{ width: 9, height: 9, background: color, display: 'inline-block', flexShrink: 0 }} />
        <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', color: C.secondary }}>
          {item.typeLabel}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.tertiary }}>NO. {n}</span>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} aria-label="Close" style={{ fontFamily: MONO, fontSize: 13, color: C.secondary, padding: 4 }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 20px' }}>
        {title && (
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, lineHeight: 1.18, color: C.ink }}>{title}</div>
        )}
        {item.snippet && (
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 14.5, lineHeight: 1.5, color: C.secondary, marginTop: title ? 8 : 0 }}>
            {item.snippet}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 16, borderTop: `1px solid ${C.hairMed}`, paddingTop: 10 }}>
          <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: C.ink }}>TRANSCRIPTION</div>
          <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.06em', color: C.tertiary, border: `1px solid ${C.hairMed}`, padding: '1px 5px' }}>
            BY AI — MAY CONTAIN ERRORS
          </div>
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.65, color: C.body, marginTop: 10, whiteSpace: 'pre-wrap' }}>
          {item.transcript}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 9, lineHeight: 1.7, letterSpacing: '0.05em', color: C.tertiary, marginTop: 16, borderTop: `1px solid ${C.hairLight}`, paddingTop: 10 }}>
          {provenance}
          {!!item.region?.continuedIn && (
            <>
              <br />
              THE STORY CONTINUES IN {item.region.continuedIn} MORE COLUMN{item.region.continuedIn === 1 ? '' : 'S'} — THE BOX SHOWS ONLY THIS ONE.
            </>
          )}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.hairMed}`, padding: '10px 14px', display: 'flex', gap: 8 }}>
        <button
          className="dc-btn-primary"
          onClick={onRead}
          style={{ flex: 1, fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', background: C.navy, color: C.canvas, border: `1px solid ${C.navy}`, padding: '9px 10px', textAlign: 'center' }}
        >
          READ IT SET →
        </button>
        <button
          className="dc-btn-ghost"
          onClick={onIndex}
          style={{ flex: 1, fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', border: `1px solid ${C.hairMed}`, color: C.secondary, padding: '9px 10px', textAlign: 'center' }}
        >
          IN THE INDEX →
        </button>
      </div>
    </div>
  );
}

function Placeholder({ issue, page }: { issue: ShelfIssue; page: ShelfPage }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: 'min(46%, 460px)', height: '86%',
          background: `repeating-linear-gradient(45deg, ${C.sunken}, ${C.sunken} 10px, ${C.canvas} 10px, ${C.canvas} 20px)`,
          border: `1px solid ${C.hairMed}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.secondary, textAlign: 'center', lineHeight: 1.8 }}>
          [ PAGE SCAN — {issue.serial.toUpperCase()} ]
          <br />
          {issue.dateLabel.toUpperCase()} · PAGE {page.page}
          <br />
          no scan behind this demo page
        </div>
      </div>
    </div>
  );
}

function ZoomButton({ label, active, title, onClick }: { label: string; active?: boolean; title?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        fontFamily: MONO, fontSize: 10, fontWeight: active ? 700 : 500, letterSpacing: '0.1em',
        padding: '7px 10px', background: active ? C.navy : C.canvas, color: active ? C.canvas : C.secondary,
      }}
    >
      {label}
    </button>
  );
}

function EdgeArrow({ side, show, onClick }: { side: 'left' | 'right'; show: boolean; onClick: () => void }) {
  if (!show) return null;
  return (
    <button
      onClick={onClick}
      title={side === 'left' ? 'Previous page (←)' : 'Next page (→)'}
      style={{
        position: 'absolute', top: '50%', transform: 'translateY(-50%)', [side]: 14,
        background: 'rgba(255,255,255,0.92)', color: C.navy, border: `1px solid ${C.hairMed}`,
        fontFamily: MONO, fontSize: 17, lineHeight: 1, padding: '16px 11px',
      } as React.CSSProperties}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  );
}

/* ── READ ──────────────────────────────────────────────────────────────────── */

function ReadView({
  issue, page, items, onOpenObject, onView, onPage, prev, next, cited,
}: {
  issue: ShelfIssue; page: ShelfPage; items: IndexItem[];
  onOpenObject: (id: string) => void; onView: (v: ReaderView) => void;
  onPage: (n: number) => void; prev?: ShelfPage; next?: ShelfPage;
  cited?: string | null;
}) {
  // Bring a cited item into view once its page is rendered — but scroll for it
  // ONCE. The mark stays (it answers "where did that come from?"); yanking the
  // page back every time the reader wanders off it would not.
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (!cited || scrolledTo.current === cited) return;
    const el = document.querySelector<HTMLElement>(`[data-object-id="${cited}"]`);
    if (!el) return;
    scrolledTo.current = cited;
    // Synchronously, and never inside requestAnimationFrame: a hidden or
    // backgrounded tab never runs the frame, so the scroll would simply not
    // happen. The offset that clears the sticky chrome is scroll-margin on the
    // item itself.
    //
    // Deps are PRIMITIVES on purpose — `items` is a fresh array every render, so
    // depending on it re-runs this effect on every keystroke elsewhere.
    // Smooth only when someone is watching: a smooth scroll is animated frame by
    // frame, and a hidden or backgrounded tab produces no frames — the animation
    // never advances and the reader comes back to an unscrolled page.
    el.scrollIntoView({ block: 'start', behavior: document.hidden ? 'auto' : 'smooth' });
  }, [cited, page.page]);

  return (
    <div className="dc-shell" style={{ padding: '0 32px 80px' }}>
      {/* The page's own masthead — this is a leaf of a paper, not a search result */}
      <div style={{ maxWidth: 760, margin: '0 auto', paddingTop: 44 }}>
        <div style={{ textAlign: 'center', borderBottom: `2px solid ${C.navy}`, paddingBottom: 14 }}>
          <div style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 40, lineHeight: 1.05, color: C.ink }}>
            {issue.serial}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.16em', color: C.secondary, marginTop: 10 }}>
            {issue.dateLabel.toUpperCase()} · PAGE {page.page} OF {issue.pageCount}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, padding: '10px 0 0' }}>
          <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.08em', color: C.tertiary }}>
            {items.length} OF {page.objectCount || items.length} EXTRACTED OBJECTS PUBLISHED · SET IN PRINTED ORDER
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.08em', color: C.tertiary, border: `1px solid ${C.hairMed}`, padding: '2px 7px' }}>
            TRANSCRIBED BY AI — MAY CONTAIN ERRORS
          </div>
        </div>

        {items.length === 0 ? (
          <NothingToRead page={page} onView={onView} />
        ) : (
          items.map((it, i) => (
            <ReadItem key={it.id} item={it} n={i + 1} cited={cited === it.id} onOpen={() => onOpenObject(it.id)} />
          ))
        )}

        {/* Turn the leaf */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 48, borderTop: `1px solid ${C.hairMed}`, paddingTop: 20 }}>
          <TurnButton show={!!prev} label={`‹ PAGE ${prev?.page}`} onClick={() => prev && onPage(prev.page)} />
          <TurnButton show={!!next} label={`PAGE ${next?.page} ›`} onClick={() => next && onPage(next.page)} align="right" />
        </div>
      </div>
    </div>
  );
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * The body, with the printed headline lifted out of it. `transcript` is the raw
 * read — headline included — which is right for THE INDEX's transcription block
 * but wrong here: a page set as a page must not print its own headline twice.
 * Only an EXACT leading match is dropped, so nothing is lost when the title came
 * from a curator rather than from line one.
 */
function bodyOf(item: IndexItem, title: string | null): string {
  if (!title) return item.transcript;
  const lines = item.transcript.split('\n');
  const first = lines.findIndex((l) => l.trim());
  if (first < 0 || norm(lines[first]) !== norm(title)) return item.transcript;
  return lines.slice(first + 1).join('\n').replace(/^\n+/, '');
}

/** A headline is short. Anything this long is a first line that got promoted for
 *  want of one — a masthead, a roster — and setting it 32px would be a lie about
 *  what the page looked like. It stays, but as body copy. */
const headlineOf = (item: IndexItem) => (item.title && item.title.length <= 120 ? item.title : null);

function ReadItem({ item, n, cited, onOpen }: { item: IndexItem; n: number; cited?: boolean; onOpen: () => void }) {
  const color = TYPE_COLORS[item.type] || C.navy;
  const isAd = item.type === 'y-ad' || item.type === 'y-coupon';
  const title = headlineOf(item);
  const body = bodyOf(item, title);
  // The summary earns its place only when it isn't just the opening of the body.
  const deck = item.snippet && !norm(body).startsWith(norm(item.snippet).slice(0, 40)) ? item.snippet : null;

  return (
    <article
      data-object-id={item.id}
      style={{
        marginTop: 34,
        paddingTop: 26,
        borderTop: `1px solid ${C.hairLight}`,
        // so scrollIntoView lands the item BELOW the sticky reader bar + filmstrip
        scrollMarginTop: 150,
        ...(isAd ? { background: C.sunken, borderTop: `3px solid ${C.marigold}`, padding: '20px 22px 22px' } : null),
        // The assistant's answer, made findable on the page it came from.
        ...(cited
          ? { borderLeft: `3px solid ${C.navy}`, paddingLeft: 18, marginLeft: -21, background: 'rgba(0,87,183,0.035)' }
          : null),
      }}
    >
      {cited && (
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', color: C.navy, marginBottom: 8 }}>
          ↳ CITED BY THE READING-ROOM ASSISTANT
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 9, height: 9, background: color, display: 'inline-block' }} />
          <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: C.secondary }}>
            {item.typeLabel}
          </span>
        </span>
        <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.06em', color: C.tertiary }}>NO. {n}</span>
      </div>

      {title && (
        <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: isAd ? 26 : 32, lineHeight: 1.14, color: C.ink, margin: '12px 0 0', textWrap: 'balance' }}>
          {title}
        </h2>
      )}

      {deck && (
        <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 17.5, lineHeight: 1.5, color: C.secondary, margin: '10px 0 0' }}>
          {deck}
        </p>
      )}

      {item.isVisual && (
        <figure style={{ margin: '16px 0 0' }}>
          <div
            style={{
              height: 220,
              background: `repeating-linear-gradient(45deg, ${C.sunken}, ${C.sunken} 8px, ${C.canvas} 8px, ${C.canvas} 16px)`,
              border: `1px solid ${C.hairMed}`,
              borderTop: `3px solid ${color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.tertiary, textAlign: 'center', lineHeight: 1.7, padding: '0 16px' }}>
              [ {item.cropNote || item.typeLabel} ]
              <br />
              the printed block sits on the scan — open SCAN to see it in place
            </span>
          </div>
          {item.caption && (
            <figcaption style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 1.5, color: C.body, marginTop: 8 }}>
              {item.caption}
            </figcaption>
          )}
        </figure>
      )}

      <div style={{ fontFamily: SERIF, fontSize: 17.5, lineHeight: 1.72, color: C.body, marginTop: 14, whiteSpace: 'pre-wrap' }}>
        {body}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14, marginTop: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.05em', color: C.tertiary }}>
          {item.credit}
        </div>
        <button className="dc-underline-hover" onClick={onOpen} style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: C.navy, flexShrink: 0 }}>
          SEE IN THE INDEX →
        </button>
      </div>
    </article>
  );
}

function NothingToRead({ page, onView }: { page: ShelfPage; onView: (v: ReaderView) => void }) {
  const read = page.ingested;
  return (
    <div style={{ marginTop: 40, border: `1px solid ${C.hairMed}`, padding: 40, textAlign: 'center' }}>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 25, color: C.ink }}>
        {read ? 'This page has been read, but not released.' : 'The pipeline hasn’t read this page yet.'}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em', color: C.tertiary, marginTop: 12, lineHeight: 1.9 }}>
        {read ? (
          <>
            {page.objectCount} OBJECT{page.objectCount === 1 ? '' : 'S'} EXTRACTED · 0 PUBLISHED.
            <br />
            EVERY OBJECT WAITS FOR A CURATOR TO REVIEW AND PUBLISH IT.
          </>
        ) : (
          <>
            NO TEXT HAS BEEN EXTRACTED FROM THIS LEAF.
            <br />
            THE SCANNED PAGE IS STILL YOURS TO READ.
          </>
        )}
      </div>
      <button
        className="dc-btn-primary"
        onClick={() => onView('scan')}
        style={{ display: 'inline-block', marginTop: 22, fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', border: `1px solid ${C.navy}`, background: C.navy, color: C.canvas, padding: '10px 18px' }}
      >
        READ THE SCAN INSTEAD ⤢
      </button>
    </div>
  );
}

function TurnButton({ show, label, onClick, align = 'left' }: { show: boolean; label: string; onClick: () => void; align?: 'left' | 'right' }) {
  if (!show) return <div />;
  return (
    <button
      className="dc-btn-ghost"
      onClick={onClick}
      style={{
        fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', color: C.navy,
        border: `1px solid ${C.hairMed}`, padding: '10px 16px', textAlign: align,
      }}
    >
      {label}
    </button>
  );
}
