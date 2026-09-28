// detect — the single adapter behind which box-first layout detectors live
// (SLICE-14). Same shape as vlmExtract: callers name a detector, get boxes back,
// and never know how it ran.
//
// A detector answers WHERE, never WHAT-BELONGS-WITH-WHAT. It returns regions — a
// headline, a column of body text, an ad — not stories. Grouping regions into
// content objects is a separate step (the grouper, then the curator), because no
// detector here knows that box 3 and box 12 are one article that jumped columns.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { pageOcr, OcrUnavailable } from "./ocrAnchor.ts";
import { readingOrder } from "./region.ts";
import {
  DETECT_DIR, MODELS_DIR, UV_BIN, TESS_MIN_BLOCK_AREA, TESSERACT_BIN,
  type DetectorId,
} from "../config.ts";

const run = promisify(execFile);

export type Rect = [number, number, number, number]; // [x, y, w, h], normalized 0-1

export interface DetectedBox {
  id: number; // 1-based, in rough reading order — what the grouper and curator refer to
  rect: Rect;
  label: string; // the detector's own class name, verbatim (a hint, not an object_class)
  conf: number | null; // 0-1; null when the detector has no score for it
  order?: number; // the detector's predicted reading order, when it predicts one
}

export interface Detection {
  detector: DetectorId;
  model: string; // which weights/binary drew these — provenance, not a display name
  width: number; // source image pixels
  height: number;
  ms: number;
  boxes: DetectedBox[];
}

export class DetectorUnavailable extends Error {}

// What the curator sees in the picker. `note` is the one line that matters when
// choosing — including the licence caveat, which a curator should not have to
// go and look up.
export const DETECTOR_INFO: Record<DetectorId, { label: string; note: string }> = {
  "tesseract": {
    label: "Tesseract blocks",
    note: "Tesseract's own layout blocks, snapped to the column grid. Local baseline; slowest (~25s).",
  },
  "american-stories": {
    label: "American Stories",
    note: "YOLOv8 trained on Chronicling America — article, headline, ad, masthead classes. Weights unlicensed: evaluation only.",
  },
  "pp-doclayout": {
    label: "PP-DocLayoutV3",
    note: "General document layout (Apache-2.0). Paragraph-level boxes with a predicted reading order.",
  },
};

const ONNX_MODEL: Record<Exclude<DetectorId, "tesseract">, { file: string; id: string }> = {
  "american-stories": { file: "american-stories-layout.onnx", id: "american-stories/layout_model_new.onnx" },
  "pp-doclayout": { file: "pp-doclayout-v3.onnx", id: "PaddlePaddle/PP-DocLayoutV3_onnx" },
};

// False when an ONNX detector's weights are missing, so a picker can say so
// before a curator chooses it rather than failing after.
export function detectorAvailable(id: DetectorId): boolean {
  return id === "tesseract" || existsSync(resolve(MODELS_DIR, ONNX_MODEL[id].file));
}

// ── public entry ─────────────────────────────────────────────────────────────
export async function detectBoxes(imagePath: string, detector: DetectorId): Promise<Detection> {
  const raw = detector === "tesseract" ? await detectTesseract(imagePath) : await detectOnnx(imagePath, detector);
  const boxes = readingOrder(raw.boxes).map((b, i) => ({ ...b, id: i + 1 }));
  return { ...raw, detector, boxes };
}

// ── tesseract: the page OCR's own layout blocks ──────────────────────────────
// Runs the same OCR pass anchoring uses (pageOcr), and takes TSV level-2 blocks
// instead of words. Tesseract's block edges wander a few pixels either side of a
// column; snapping them to the column grid the same pass already derives is what
// makes them usable as crop boundaries.
async function detectTesseract(imagePath: string): Promise<Omit<Detection, "detector">> {
  const t0 = performance.now();
  let ocr;
  try { ocr = pageOcr(imagePath); }
  catch (e) {
    if (e instanceof OcrUnavailable) throw new DetectorUnavailable(e.message);
    throw e;
  }
  const { width: W, height: H, columns } = ocr;
  const SNAP = 0.015;
  const snap = (v: number, edges: number[]) => {
    let best = v, d = SNAP;
    for (const e of edges) if (Math.abs(e - v) < d) { d = Math.abs(e - v); best = e; }
    return best;
  };
  const lefts = columns.map((c) => c.left), rights = columns.map((c) => c.right);

  const boxes: Array<Omit<DetectedBox, "id">> = [];
  for (const b of ocr.blocks) {
    const area = (b.w * b.h) / (W * H);
    // Specks and rules are not layout; a block covering half the page is tesseract
    // giving up on segmentation, which is no box at all.
    if (area < TESS_MIN_BLOCK_AREA || area > 0.5) continue;
    // A wordless block is a picture only if it has some extent both ways; the
    // thin ones are column rules and cut lines, which tesseract reports as images.
    if (!b.words && (b.w / W < 0.02 || b.h / H < 0.02)) continue;
    const x1 = snap(b.x / W, lefts), x2 = snap((b.x + b.w) / W, rights);
    if (x2 <= x1) continue;
    boxes.push({
      rect: norm4(x1, b.y / H, x2 - x1, b.h / H),
      label: b.words ? "text" : "image",
      conf: b.words ? round(b.conf / 100, 3) : null,
    });
  }
  return {
    model: await tesseractVersion(),
    width: W, height: H,
    ms: Math.round(performance.now() - t0),
    boxes: boxes as DetectedBox[],
  };
}

let tessVer: string | null = null;
async function tesseractVersion(): Promise<string> {
  if (tessVer) return tessVer;
  try {
    const { stdout, stderr } = await run(TESSERACT_BIN, ["--version"]);
    tessVer = ((stdout || stderr).split("\n")[0] || "tesseract").trim();
  } catch { tessVer = "tesseract"; }
  return tessVer;
}

// ── onnx models: detect/detect.py via uv ─────────────────────────────────────
async function detectOnnx(imagePath: string, detector: Exclude<DetectorId, "tesseract">): Promise<Omit<Detection, "detector">> {
  const m = ONNX_MODEL[detector];
  if (!existsSync(resolve(MODELS_DIR, m.file))) {
    throw new DetectorUnavailable(`${detector}: weights missing at models/${m.file}. Run \`npm run detect:models\`.`);
  }
  const out = await py(["detect", "--model", detector, "--image", imagePath]);
  const j = JSON.parse(out);
  return { model: m.id, width: j.width, height: j.height, ms: j.ms, boxes: j.boxes };
}

async function py(args: string[]): Promise<string> {
  try {
    const { stdout } = await run(
      UV_BIN, ["run", "--quiet", "--project", DETECT_DIR, "python", resolve(DETECT_DIR, "detect.py"), ...args],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    return stdout;
  } catch (e) {
    const err = e as Error & { stderr?: string; code?: string };
    if (err.code === "ENOENT") {
      throw new DetectorUnavailable(`${UV_BIN} not found — install uv (brew install uv) or set UV_BIN.`);
    }
    const tail = (err.stderr ?? err.message).trim().split("\n").slice(-3).join(" ");
    throw new DetectorUnavailable(`detect.py ${args[0]} failed: ${tail.slice(0, 300)}`);
  }
}

// ── overlay: numbered boxes drawn on a downscaled page ───────────────────────
// For the grouper (which names boxes by number, never by coordinate) and for the
// detect CLI. `group` on a box colours by group; without it, by detector label.
export async function renderOverlay(
  imagePath: string,
  boxes: Array<Pick<DetectedBox, "id" | "rect" | "label"> & { group?: number | string }>,
  outPath: string,
  maxEdge = 1600,
): Promise<string> {
  const tmp = resolve(tmpdir(), `boxes_${process.pid}_${Date.now()}.json`);
  await writeFile(tmp, JSON.stringify(boxes));
  try {
    await mkdir(resolve(outPath, ".."), { recursive: true });
    await py(["overlay", "--image", imagePath, "--boxes", tmp, "--out", outPath, "--max-edge", String(maxEdge)]);
    return outPath;
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

// ── reading order ────────────────────────────────────────────────────────────
// Box ids are what a curator and the grouper say out loud ("3, 7, 8"), so they
// run the way the page reads — see readingOrder in region.ts, which re-extraction
// also reads a region's boxes by.

function round(v: number, p: number) { const k = 10 ** p; return Math.round(v * k) / k; }
function norm4(x: number, y: number, w: number, h: number): Rect {
  return [round(x, 4), round(y, 4), round(w, 4), round(h, 4)];
}
