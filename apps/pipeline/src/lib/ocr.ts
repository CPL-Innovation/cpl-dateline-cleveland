// ocr — Tesseract's reading of a page: every word with its coordinates, the
// page's column grid, and Tesseract's own layout blocks.
//
// Box-first uses it twice: the `tesseract` detector draws its boxes from the
// blocks (snapped to the column grid), and the coverage check finds printed words
// that lie outside every grouped box. It began as the first half of page-first's
// OCR anchoring (SLICE-09), which matched a whole-page transcript to these words
// to find each object's region; that half is retired with page-first.
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { ROOT, TESSERACT_BIN, OCR_MAX_EDGE, OCR_WORD_CONF, OCR_LANG } from "../config.ts";

const OCR_DIR = resolve(ROOT, "scratch", "ocr");

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
  /** Tesseract's own layout blocks (TSV level 2), pixels, with the words each
   *  holds — the `tesseract` box-first detector. */
  blocks: OcrBlock[];
}

export interface OcrBlock {
  x: number; y: number; w: number; h: number; // pixels
  words: number; // every recognised word in the block, any confidence
  conf: number; // mean word confidence (0-100), 0 when the block holds no words
}

export class OcrUnavailable extends Error {}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// ── OCR the page ─────────────────────────────────────────────────────
// Resolution is the whole game here. Measured on Brooklyn News p1: the 1600px
// display JPEG gives mean word confidence ~43 and matching text to it mostly fails; the
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
      `Install it (brew install tesseract).`,
    );
  }
}

export function pageOcr(imagePath: string): PageOcr {
  const tsv = runTesseract(downscale(imagePath, OCR_MAX_EDGE));
  const lines = tsv.split("\n");
  let width = 0, height = 0;
  const words: Word[] = [];
  const lineBoxes: Array<{ left: number; right: number }> = [];
  const blocks = new Map<string, OcrBlock & { confSum: number }>();
  let confSum = 0, confN = 0;

  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split("\t");
    if (f.length < 11) continue;
    const level = +f[0];
    const left = +f[6], top = +f[7], w = +f[8], h = +f[9], conf = +f[10];
    if (level === 1) { width = w; height = h; continue; }
    // level 2 = a layout BLOCK — kept whole for the box-first tesseract detector.
    if (level === 2) { blocks.set(`${f[1]}:${f[2]}`, { x: left, y: top, w, h, words: 0, conf: 0, confSum: 0 }); continue; }
    // level 4 = a text LINE. Its left edge is what reveals the column grid.
    if (level === 4) { if (w > 0) lineBoxes.push({ left, right: left + w }); continue; }
    if (level !== 5) continue;
    const t = norm(f[11] ?? "");
    if (!t) continue;
    const blk = blocks.get(`${f[1]}:${f[2]}`);
    if (blk) { blk.words++; blk.confSum += conf; }
    confSum += conf; confN++;
    if (conf < OCR_WORD_CONF) continue;
    words.push({ t, x: left, y: top, w, h, line: (+f[2] << 16) | (+f[3] << 8) | +f[4] });
  }
  if (!width || !height) throw new OcrUnavailable("tesseract returned no page geometry");
  if (words.length < 50) throw new OcrUnavailable(`only ${words.length} confident OCR words on the page`);

  return {
    width, height, words,
    meanConf: confN ? confSum / confN : 0,
    columns: columnGrid(lineBoxes, width),
    blocks: [...blocks.values()].map(({ confSum: s, ...b }) => ({ ...b, conf: b.words ? s / b.words : 0 })),
  };
}

// ── the column grid ──────────────────────────────────────────────────
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

function median(ns: number[]): number {
  if (!ns.length) return 0;
  const s = [...ns].sort((a, b) => a - b);
  return s[s.length >> 1];
}
