// region — the order an object's boxes are READ in.
//
// region_bbox keeps its rects largest first: rects[0] is the primary, the box
// the workbench draws and a curator corrects. That order says nothing about how
// the object reads, and anything that transcribes the object from its boxes
// (box-first transcription, re-extraction) needs to hand them over the way a
// reader meets them — headline, then down the first column, then the next.
//
// So a region also carries `order`: indices into `rects`, in reading order.
//   box-first    the curator's order from review, exactly
//   hand edits   inherited from the region being edited (see inheritOrder)
//   import       the order the JSON listed its rects in
// A region without one (page-first, stored before this) is read in the
// geometric order below — the same rule the detectors number their boxes by.
import type { Rect } from "./detect.ts";

// Column bands by left edge, left to right, each band top to bottom. A detector
// that predicts reading order (pp-doclayout) is taken at its word. Headlines
// that span columns start at a column's left edge, so they fall into that
// column's band above the story they head — which is the order a reader meets them.
export function readingOrder<T extends { rect: Rect | number[]; order?: number }>(boxes: T[]): T[] {
  if (boxes.length && boxes.every((b) => typeof b.order === "number")) {
    return [...boxes].sort((a, b) => a.order! - b.order!);
  }
  const byX = [...boxes].sort((a, b) => a.rect[0] - b.rect[0]);
  const bands: T[][] = [];
  let bandLeft = -1;
  for (const b of byX) {
    if (!bands.length || b.rect[0] - bandLeft > 0.02) { bands.push([b]); bandLeft = b.rect[0]; }
    else bands[bands.length - 1].push(b);
  }
  return bands.flatMap((band) => band.sort((a, b) => a.rect[1] - b.rect[1]));
}

const isPerm = (order: unknown, n: number): order is number[] =>
  Array.isArray(order) && order.length === n &&
  new Set(order).size === n && order.every((i) => Number.isInteger(i) && i >= 0 && i < n);

// `order` for rects already sorted largest first, given the same rects in
// reading order. Rects are matched by identity of their values.
export function orderFor(rects: number[][], reading: number[][]): number[] {
  const key = (r: number[]) => r.slice(0, 4).join(",");
  const used = new Set<number>();
  return reading.map((r) => {
    const i = rects.findIndex((x, j) => !used.has(j) && key(x) === key(r));
    used.add(i);
    return i;
  });
}

// A stored region's rects, in reading order. Accepts the legacy bare [x,y,w,h].
export function readingRects(bb: unknown): number[][] {
  if (!bb) return [];
  if (Array.isArray(bb)) return bb.length >= 4 ? [bb.slice(0, 4).map(Number)] : [];
  const r = bb as { rects?: unknown; order?: unknown };
  if (!Array.isArray(r.rects) || !r.rects.length) return [];
  const rects = r.rects as number[][];
  if (isPerm(r.order, rects.length)) return r.order.map((i) => rects[i]);
  return readingOrder(rects.map((rect) => ({ rect }))).map((b) => b.rect);
}

function iou(a: number[], b: number[]): number {
  const x = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const y = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const i = x * y;
  return i ? i / (a[2] * a[3] + b[2] * b[3] - i) : 0;
}

// A curator's edit sends the object's whole set with one box moved, resized or
// removed. Each new rect takes the reading position of the old rect it overlaps
// most, so correcting a box does not reshuffle the story. When that cannot be
// done cleanly — a box dragged clear of where it was, two claiming the same old
// one — fall back to the geometric order rather than guess.
export function inheritOrder(rects: number[][], prev: unknown): number[] {
  const before = readingRects(prev);
  const rank: number[] = [];
  const taken = new Set<number>();
  for (const r of rects) {
    let best = -1, bestIou = 0;
    before.forEach((b, i) => { const v = iou(r, b); if (v > bestIou) { bestIou = v; best = i; } });
    if (best < 0 || taken.has(best)) {
      return orderFor(rects, readingOrder(rects.map((rect) => ({ rect }))).map((b) => b.rect));
    }
    taken.add(best);
    rank.push(best);
  }
  return rects.map((_, i) => i).sort((a, b) => rank[a] - rank[b]);
}
