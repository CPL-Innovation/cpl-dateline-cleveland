// ocrAnchor — derive a content object's page region from OCR word coordinates
// instead of asking the VLM to estimate it.
//
// WHY: a VLM is excellent at reading a page and terrible at regressing geometry
// on one. The SLICE-03 bake-off is the proof — the same prompt, the same page,
// three engines, three DIFFERENT coordinate conventions and none of them the
// normalized [x,y,w,h] the prompt asks for:
//     gemini-flash  [85, 79, 165, 872]     → native [ymin,xmin,ymax,xmax]/1000
//     sonnet        [90, 170, 1400, 200]   → pixels
//     gpt-4o        null                   → declined
// So we split the job along the grain of what each tool is good at: the VLM
// supplies accurate TEXT grouped into content objects, OCR supplies accurate
// COORDINATES for every word, and we anchor one to the other. Deterministic,
// free per page, and repeatable — no model spend, no false precision.
//
// The output is a Region (see below): one rect PER COLUMN RUN, not one rect for
// the object. A story that jumps columns genuinely occupies several rectangles;
// collapsing that into one bounding box would be exactly the false precision the
// workbench's "approximate" note exists to avoid.
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import {
  ROOT, TESSERACT_BIN, OCR_MAX_EDGE, OCR_MIN_RUN, OCR_MIN_COVERAGE,
  OCR_WORD_CONF, OCR_LANG, OCR_MIN_RECT_SHARE,
} from "../config.ts";

const OCR_DIR = resolve(ROOT, "scratch", "ocr");

// A located region. ONE rect per object (Jungu's call) — `rects` stays an array
// for schema compatibility with everything already stored, but never holds more
// than one entry. `coverage` is matched transcript tokens ÷ total — the honest
// confidence axis. `continuedIn` counts the column runs this object was ALSO
// found in and which are deliberately not stored; see the tail of locate().
export interface Region {
  rects: [[number, number, number, number]];
  coverage: number;
  source: "ocr-anchor";
  ocrConf: number; // mean OCR word confidence for the page (0-100)
  continuedIn: number; // column runs found but not stored (0 = the box is the whole story)
}

interface Word {
  t: string; // normalized token
  x: number; y: number; w: number; h: number; // pixels
  line: number; // synthetic line id (block/par/line)
}

export interface PageOcr {
  width: number;
  height: number;
  words: Word[];
  meanConf: number;
  /** Column grid: left edge + typical right edge of each print column, 0-1. */
  columns: Array<{ left: number; right: number }>;
  /** token → indices into `words`, for anchor lookup. */
  index: Map<string, number[]>;
}

export class OcrUnavailable extends Error {}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// ── stage A: OCR the page ────────────────────────────────────────────────────
// Resolution is the whole game here. Measured on Brooklyn News p1: the 1600px
// display JPEG gives mean word confidence ~43 and anchoring mostly fails; the
// full-res master resampled once to ~4100 gives ~88 and it works. Feed this the
// MASTER, not an already-downscaled render — resampling an intermediate costs
// ~10 points of confidence (88 → 77) and a chunk of coverage.
function downscale(imagePath: string, maxEdge: number): string {
  try {
    // Already within budget → OCR it as-is rather than re-encoding for nothing.
    const dims = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", imagePath], { encoding: "utf8" });
    const nums = [...dims.matchAll(/pixel(?:Width|Height):\s*(\d+)/g)].map((m) => +m[1]);
    if (nums.length === 2 && Math.max(...nums) <= maxEdge) return imagePath;

    mkdirSync(OCR_DIR, { recursive: true });
    const out = resolve(OCR_DIR, `${maxEdge}_${basename(imagePath)}`);
    if (!existsSync(out)) {
      execFileSync("sips", ["-Z", String(maxEdge), imagePath, "--out", out], { stdio: "ignore" });
    }
    return out;
  } catch {
    return imagePath; // non-macOS or sips failure — OCR the original, just slower
  }
}

function runTesseract(imagePath: string): string {
  try {
    return execFileSync(TESSERACT_BIN, [imagePath, "stdout", "-l", OCR_LANG, "tsv"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    throw new OcrUnavailable(
      `${TESSERACT_BIN} failed (${(e as Error).message.slice(0, 120)}). ` +
      `Install it (brew install tesseract) or set OCR_ENABLED=0 to keep VLM-estimated regions.`,
    );
  }
}

export function pageOcr(imagePath: string): PageOcr {
  const tsv = runTesseract(downscale(imagePath, OCR_MAX_EDGE));
  const lines = tsv.split("\n");
  let width = 0, height = 0;
  const words: Word[] = [];
  const lineBoxes: Array<{ left: number; right: number }> = [];
  let confSum = 0, confN = 0;

  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split("\t");
    if (f.length < 11) continue;
    const level = +f[0];
    const left = +f[6], top = +f[7], w = +f[8], h = +f[9], conf = +f[10];
    if (level === 1) { width = w; height = h; continue; }
    // level 4 = a text LINE. Its left edge is what reveals the column grid.
    if (level === 4) { if (w > 0) lineBoxes.push({ left, right: left + w }); continue; }
    if (level !== 5) continue;
    const t = norm(f[11] ?? "");
    if (!t) continue;
    confSum += conf; confN++;
    if (conf < OCR_WORD_CONF) continue;
    words.push({ t, x: left, y: top, w, h, line: (+f[2] << 16) | (+f[3] << 8) | +f[4] });
  }
  if (!width || !height) throw new OcrUnavailable("tesseract returned no page geometry");
  if (words.length < 50) throw new OcrUnavailable(`only ${words.length} confident OCR words on the page`);

  const index = new Map<string, number[]>();
  for (let i = 0; i < words.length; i++) {
    const list = index.get(words[i].t);
    if (list) list.push(i); else index.set(words[i].t, [i]);
  }
  return {
    width, height, words, index,
    meanConf: confN ? confSum / confN : 0,
    columns: columnGrid(lineBoxes, width),
  };
}

// ── stage B: the column grid ─────────────────────────────────────────────────
// Newspaper pages are a rigid grid, and snapping to it removes nearly all of the
// horizontal error. Full-height ink-projection gutter detection does NOT work on
// these pages — ads and column rules break the whitespace runs (it found zero
// gutters on Brooklyn News p1). Clustering LINE-START x-positions does: p1 comes
// out as 8 columns at a dead-regular 0.119–0.125 pitch.
function columnGrid(lineBoxes: Array<{ left: number; right: number }>, width: number) {
  if (lineBoxes.length < 40) return [];
  const BINS = 200;
  const hist = new Array(BINS).fill(0);
  for (const lb of lineBoxes) hist[Math.min(BINS - 1, Math.floor((lb.left / width) * BINS))]++;
  const floor = Math.max(6, lineBoxes.length / 120);
  let peaks: number[] = [];
  for (let i = 1; i < BINS - 1; i++) {
    if (hist[i] >= floor && hist[i] >= hist[i - 1] && hist[i] >= hist[i + 1]) {
      const at = i / BINS;
      // collapse twin bins of one column into a single edge
      if (peaks.length && at - peaks[peaks.length - 1] < 0.04) {
        if (hist[i] > hist[Math.round(peaks[peaks.length - 1] * BINS)]) peaks[peaks.length - 1] = at;
      } else peaks.push(at);
    }
  }
  if (peaks.length < 3) return [];
  // Drop sliver "columns" — a margin artefact or a decorative rule picked up as a
  // peak. Anything under half the median column pitch is not a print column.
  const pitch = median(peaks.slice(1).map((p, i) => p - peaks[i]));
  const solid = peaks.filter((p, i) => i === 0 || (i + 1 < peaks.length ? peaks[i + 1] : 1) - p >= pitch * 0.5);
  peaks = solid.length >= 3 ? solid : peaks;
  // Each column's right edge is data-driven: the 95th-percentile line right-edge
  // among the lines that start in it. Never invent a gutter width.
  return peaks.map((left, k) => {
    const next = k + 1 < peaks.length ? peaks[k + 1] : 1.0;
    const rights = lineBoxes
      .filter((lb) => lb.left / width >= left - 0.01 && lb.left / width < next - 0.01)
      .map((lb) => lb.right / width)
      .sort((a, b) => a - b);
    const right = rights.length ? rights[Math.floor(rights.length * 0.95)] : next;
    return { left, right: Math.min(right, next) };
  });
}

// ── stage C: anchor a transcript to the OCR word stream ──────────────────────
// Two steps, and the second one matters as much as the first.
//
// C1 — find every run of >= OCR_MIN_RUN consecutive tokens shared by the
// transcript and the OCR stream. A DP over match diagonals: the run at OCR index
// i, token j extends the run at (i-1, j-1). Requiring RUNS rather than bare token
// hits is what stops "the" from anchoring to 200 places on the page.
//
// C2 — keep only a single monotone alignment through those runs. A transcript
// reads through the page in order, so the true occurrence is the heaviest chain
// of runs increasing in BOTH coordinates; everything off that chain is a phrase
// that happens to recur elsewhere on the page. Skipping this was what produced
// coverage above 1.0 and scattered one-line rects in half the columns.
interface Run { o: number; t: number; len: number } // OCR start, token start, length

function findRuns(ocr: PageOcr, toks: string[]): Run[] {
  const runs: Run[] = [];
  let prev = new Map<number, number>(); // OCR index i → length of run ending at (i, j-1)
  for (let j = 0; j < toks.length; j++) {
    const cur = new Map<number, number>();
    for (const i of ocr.index.get(toks[j]) ?? []) cur.set(i, (prev.get(i - 1) ?? 0) + 1);
    // a run that does not continue into step j is maximal — emit it
    for (const [i, r] of prev) {
      if (r >= OCR_MIN_RUN && !cur.has(i + 1)) runs.push({ o: i - r + 1, t: j - r, len: r });
    }
    prev = cur;
  }
  for (const [i, r] of prev) if (r >= OCR_MIN_RUN) runs.push({ o: i - r + 1, t: toks.length - r, len: r });
  return runs;
}

// Heaviest chain of non-overlapping runs increasing in both OCR and token order.
// O(n²) over runs, which is tens-to-hundreds in practice.
// `ties` counts how many DIFFERENT chains tie for that best score — see below.
function bestChain(runs: Run[]): { chain: Run[]; ties: number } {
  if (runs.length <= 1) return { chain: runs, ties: 1 };
  const rs = [...runs].sort((a, b) => a.o - b.o || a.t - b.t);
  const score = new Array(rs.length).fill(0);
  const from = new Array(rs.length).fill(-1);
  let bestI = 0;
  for (let i = 0; i < rs.length; i++) {
    score[i] = rs[i].len;
    for (let j = 0; j < i; j++) {
      if (rs[j].o + rs[j].len <= rs[i].o && rs[j].t + rs[j].len <= rs[i].t && score[j] + rs[i].len > score[i]) {
        score[i] = score[j] + rs[i].len;
        from[i] = j;
      }
    }
    if (score[i] > score[bestI]) bestI = i;
  }
  const chain: Run[] = [];
  for (let i = bestI; i >= 0; i = from[i]) chain.push(rs[i]);
  return { chain: chain.reverse(), ties: score.filter((s) => s === score[bestI]).length };
}

function matchedIndices(ocr: PageOcr, transcript: string) {
  const toks = transcript.split(/\s+/).map(norm).filter(Boolean);
  const { chain, ties } = bestChain(findRuns(ocr, toks));
  const idx: number[] = [];
  for (const r of chain) for (let k = r.o; k < r.o + r.len; k++) idx.push(k);
  return { idx, tokens: toks.length, ties };
}

// ── stage D: matched words → one rect per column run ─────────────────────────
export function anchorRegion(ocr: PageOcr, transcript: string): Region | null {
  if (!transcript.trim()) return null;
  const { idx, tokens, ties } = matchedIndices(ocr, transcript);
  const coverage = tokens ? idx.length / tokens : 0;
  // Enough evidence to place it? Scale the floor to the transcript — a 3-word
  // nameplate ("The Brooklyn News") can never clear a fixed 4-word minimum, and
  // silently nulling every short object is its own kind of wrong.
  if (idx.length < Math.max(2, Math.min(3, tokens)) || coverage < OCR_MIN_COVERAGE) return null;
  // …but a short phrase often occurs several times on a newspaper page ("The
  // Brooklyn News" appears in the nameplate AND in half the house ads). When the
  // alignment can't choose between them, the location is genuinely unknown —
  // say so rather than drawing one of the candidates and hoping.
  if (tokens < 5 && ties > 1) return null;

  const W = ocr.width, H = ocr.height;
  const cols = ocr.columns;
  // bucket matched words by print column (or by a coarse x-band if no grid)
  const colOf = (x: number) => {
    if (!cols.length) return Math.floor((x / W) * 8);
    let best = 0;
    for (let k = 0; k < cols.length; k++) if (x / W >= cols[k].left - 0.015) best = k;
    return best;
  };
  const buckets = new Map<number, Word[]>();
  for (const i of idx) {
    const wd = ocr.words[i];
    const k = colOf(wd.x);
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(wd);
  }
  // Drop columns holding only a sliver of the match — those are stray anchors,
  // and they are exactly what blows a one-column story up to full page width.
  const minShare = Math.max(3, idx.length * 0.04);
  const kept = [...buckets.entries()].filter(([, ws]) => ws.length >= minShare).sort((a, b) => a[0] - b[0]);
  if (!kept.length) return null;

  const medH = median(idx.map((i) => ocr.words[i].h)) || 0;
  const padY = medH * 0.35;

  let rects = kept.map(([k, ws]) => {
    const y0 = Math.min(...ws.map((w) => w.y)) - padY;
    const y1 = Math.max(...ws.map((w) => w.y + w.h)) + padY;
    // snap x to the print column; fall back to the words' own extent if no grid
    const x0 = cols[k] ? cols[k].left * W : Math.min(...ws.map((w) => w.x));
    const x1 = cols[k] ? cols[k].right * W : Math.max(...ws.map((w) => w.x + w.w));
    return { k, x0, y0, x1, y1 };
  });

  // Merge neighbouring columns that share a y-band — that is a banner headline or
  // a wide ad spanning columns, one rectangle, not eight. Columns whose y-ranges
  // barely overlap are a story JUMPING columns and stay separate rects.
  const merged: typeof rects = [];
  for (const r of rects) {
    const last = merged[merged.length - 1];
    if (last && r.k === last.k + 1 && yOverlap(last, r) > 0.6) {
      last.x1 = r.x1; last.k = r.k;
      last.y0 = Math.min(last.y0, r.y0); last.y1 = Math.max(last.y1, r.y1);
    } else merged.push({ ...r });
  }

  let out = merged.map((r) => clamp01([
    r.x0 / W, r.y0 / H, (r.x1 - r.x0) / W, (r.y1 - r.y0) / H,
  ]));

  // Crumb filter. The column filter above is a share of WORD COUNT, which lets a
  // three-word stray survive beside a story holding seventy matched words — and
  // measured across 254 located objects that is what almost every extra rect was
  // ("BOWLING SCORES" came out 16.11% of the page + 0.08%). Judge the secondary
  // rects by AREA instead: anything under OCR_MIN_RECT_SHARE of the biggest rect
  // is noise from a wandering chain, not a column jump. Largest rect first, so
  // rects[0] is always the primary — the UI shows that one.
  out.sort((a, b) => b[2] * b[3] - a[2] * a[3]);
  const primary = out[0][2] * out[0][3];
  out = out.filter((r) => r[2] * r[3] >= primary * OCR_MIN_RECT_SHARE);

  // ONE box per object. The surviving secondary rects are genuine column jumps —
  // the rest of a story that continues elsewhere on the page — but they are no
  // longer stored. Their COUNT is, because "this box is not the whole story" is
  // true and a curator judging the box needs to know it; dropping the geometry
  // silently would make a partial region look complete.
  return {
    rects: [out[0]],
    continuedIn: out.length - 1,
    coverage: round(coverage),
    source: "ocr-anchor",
    ocrConf: round(ocr.meanConf, 1),
  };
}

function yOverlap(a: { y0: number; y1: number }, b: { y0: number; y1: number }): number {
  const inter = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  return inter / Math.max(1, Math.min(a.y1 - a.y0, b.y1 - b.y0));
}
function median(ns: number[]): number {
  if (!ns.length) return 0;
  const s = [...ns].sort((a, b) => a - b);
  return s[s.length >> 1];
}
function round(n: number, dp = 2): number { const f = 10 ** dp; return Math.round(n * f) / f; }
function clamp01(r: number[]): [number, number, number, number] {
  let [x, y, w, h] = r;
  x = Math.max(0, Math.min(1, x)); y = Math.max(0, Math.min(1, y));
  w = Math.max(0, Math.min(1 - x, w)); h = Math.max(0, Math.min(1 - y, h));
  return [round(x, 4), round(y, 4), round(w, 4), round(h, 4)];
}

// ── the stage the pipeline calls ─────────────────────────────────────────────
// One OCR pass per page, then anchor every object's transcript against it.
// Returns a Region (or null) per input text, positionally aligned.
export function locateObjects(imagePath: string, texts: string[]): {
  regions: Array<Region | null>;
  meanConf: number;
  columns: number;
} {
  const ocr = pageOcr(imagePath);
  return {
    regions: texts.map((t) => anchorRegion(ocr, t)),
    meanConf: round(ocr.meanConf, 1),
    columns: ocr.columns.length,
  };
}
