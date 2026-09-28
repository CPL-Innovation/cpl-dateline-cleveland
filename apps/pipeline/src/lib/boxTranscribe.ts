// boxTranscribe — the last step of box-first ingestion (SLICE-14).
//
//   coverage check → read every box from its own crop → join per group →
//   the shared enrich + persist path page-first uses
//
// Box-first's promise is resolution: page-first sends the WHOLE page to the VLM
// at 2200px, so an 8-column broadsheet gives each column ~200px of width. Here a
// box is cut from the archival master at native resolution. A full-height column
// is ~650×4400px, over the model's ~2576px image ceiling — shrinking it to fit
// would throw most of the gain away — so a tall crop is sent as overlapping
// vertical SLICES in one request, each at native resolution.
//
// Its risk is the mirror image: text outside every box is never read, and
// nothing downstream would notice. So transcription is refused while the page
// has coverage GAPS — runs of OCR-read text that no grouped box contains — unless
// the curator has looked at them and said to go ahead.
import { fetchRetry } from "./http.ts";
import { query } from "./pg.ts";
import { pageOcr, type PageOcr } from "./ocrAnchor.ts";
import { pageSize, jpegSize } from "./reextract.ts";
import { explodePage } from "./explode.ts";
import { SYSTEM_PROMPT, type VlmBlock } from "./vlm-prompt.ts";
import { assertIngestable, enrichAndPersist, pMap, type AssembledRow, type Progress } from "./ingestPage.ts";
import { getProposal, pageImage, BoxFirstRefused, type Proposal, type ProposalBox } from "./boxFirst.ts";
import type { Rect } from "./detect.ts";
import {
  iiifId, BOXFIRST_MODEL, BOXFIRST_EFFORT, BOXFIRST_CONCURRENCY, BOXFIRST_PAD, COVERAGE_MIN_WORDS,
  REEXTRACT_MAX_EDGE, type DetectorId,
} from "../config.ts";

// ── coverage ─────────────────────────────────────────────────────────────────
export interface Gap {
  rect: Rect; // normalized, the union of the uncovered lines
  words: number; // confident OCR words in it
  sample: string; // the first few OCR tokens — enough to recognise the text
}
export interface Coverage { gaps: Gap[]; uncoveredWords: number; totalWords: number; ms: number }

export class CoverageGaps extends Error {
  coverage: Coverage;
  constructor(coverage: Coverage) {
    super(`${coverage.gaps.length} stretch${coverage.gaps.length === 1 ? "" : "es"} of printed text lie outside every grouped box`);
    this.coverage = coverage;
  }
}

// Tesseract is ~25s a page. A curator checks coverage, fixes a box, checks again —
// the page image does not change between those, so its OCR is kept for the life
// of the server process.
const ocrCache = new Map<string, PageOcr>();
function ocrOf(imagePath: string): PageOcr {
  let o = ocrCache.get(imagePath);
  if (!o) { o = pageOcr(imagePath); ocrCache.set(imagePath, o); }
  return o;
}

// Which OCR-read text is outside every box that will be transcribed? Only boxes
// IN a group count — a box in no group is not read either. A word is covered
// when its centre is inside a box; that also catches a line a box clips in half.
// Uncovered words are gathered into lines, lines of fewer than 3 words are
// dropped (Tesseract reads rules, specks and ornament as stray 1-2 word "lines"),
// and neighbouring lines are merged into one gap.
export function coverageOf(ocr: PageOcr, boxes: ProposalBox[], groupedIds: Set<number>): Omit<Coverage, "ms"> {
  const { width: W, height: H } = ocr;
  const rects = boxes.filter((b) => groupedIds.has(b.id)).map((b) => b.rect);
  const TOL = 0.002;
  const inside = (x: number, y: number) =>
    rects.some((r) => x >= r[0] - TOL && x <= r[0] + r[2] + TOL && y >= r[1] - TOL && y <= r[1] + r[3] + TOL);

  const lines = new Map<number, { x1: number; y1: number; x2: number; y2: number; n: number; toks: string[] }>();
  let uncovered = 0;
  for (const w of ocr.words) {
    if (inside((w.x + w.w / 2) / W, (w.y + w.h / 2) / H)) continue;
    uncovered++;
    const l = lines.get(w.line);
    if (l) {
      l.x1 = Math.min(l.x1, w.x); l.y1 = Math.min(l.y1, w.y);
      l.x2 = Math.max(l.x2, w.x + w.w); l.y2 = Math.max(l.y2, w.y + w.h); l.n++; l.toks.push(w.t);
    } else lines.set(w.line, { x1: w.x, y1: w.y, x2: w.x + w.w, y2: w.y + w.h, n: 1, toks: [w.t] });
  }

  const real = [...lines.values()].filter((l) => l.n >= 3).sort((a, b) => a.y1 - b.y1);
  const lh = real.length ? real.map((l) => l.y2 - l.y1).sort((a, b) => a - b)[Math.floor(real.length / 2)] : 0;
  const gaps: Array<{ x1: number; y1: number; x2: number; y2: number; n: number; toks: string[] }> = [];
  for (const l of real) {
    const g = gaps.find((g) => {
      const overlap = Math.min(g.x2, l.x2) - Math.max(g.x1, l.x1);
      return overlap > 0.5 * Math.min(g.x2 - g.x1, l.x2 - l.x1) && l.y1 - g.y2 < 2 * lh;
    });
    if (g) {
      g.x1 = Math.min(g.x1, l.x1); g.y1 = Math.min(g.y1, l.y1);
      g.x2 = Math.max(g.x2, l.x2); g.y2 = Math.max(g.y2, l.y2); g.n += l.n; g.toks.push(...l.toks);
    } else gaps.push({ ...l, toks: [...l.toks] });
  }
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  return {
    gaps: gaps
      .filter((g) => g.n >= COVERAGE_MIN_WORDS)
      .sort((a, b) => b.n - a.n)
      .map((g) => ({
        rect: [r4(g.x1 / W), r4(g.y1 / H), r4((g.x2 - g.x1) / W), r4((g.y2 - g.y1) / H)] as Rect,
        words: g.n,
        sample: g.toks.slice(0, 12).join(" "),
      })),
    uncoveredWords: uncovered,
    totalWords: ocr.words.length,
  };
}

export async function checkCoverage(collection: string, pageRecord: number, detector: DetectorId): Promise<Coverage> {
  const t0 = performance.now();
  const p = await getProposal(collection, pageRecord, detector);
  if (!p) throw new BoxFirstRefused("no proposal for this page and detector — run the detector first");
  const img = await pageImage(collection, pageRecord);
  const grouped = new Set(p.groups.flatMap((g) => g.boxes));
  return { ...coverageOf(ocrOf(img), p.boxes, grouped), ms: Math.round(performance.now() - t0) };
}

// ── reading one box ──────────────────────────────────────────────────────────
const TEXT_SCHEMA = {
  type: "object",
  properties: { text: { type: "string", description: "The verbatim transcription of the region." } },
  required: ["text"],
  additionalProperties: false,
} as const;

// The rules are lifted from the page-ingestion contract (vlm-prompt.ts) and the
// single-object re-read (reextract.ts), so a box-first object's text has the same
// shape and the same honesty markers as one ingested page-first.
function buildPrompt(a: { cls: string; role: string | null; part: number; parts: number; slices: number }): string {
  const what = `"${a.cls}"${a.role ? ` (role: ${a.role})` : ""}`;
  const lines = [
    a.slices > 1
      ? `These images are one region of a historical newspaper page, cropped from the archival scan and delivered as ${a.slices} consecutive vertical slices, top to bottom. Adjacent slices overlap by a few lines — transcribe the overlapping lines ONCE.`
      : `This image is one region of a historical newspaper page, cropped from the archival scan.`,
    a.parts > 1
      ? `It is part ${a.part} of ${a.parts} of one content object classified as ${what}. Transcribe only this part.`
      : `It is one content object classified as ${what}.`,
    ``,
    `Transcribe it.`,
    ``,
    `RULES (follow exactly):`,
    `- TRANSCRIBE ONLY WHAT IS PRINTED AND VISIBLE. Mark unreadable text [illegible] and physical damage [loss].`,
    `  NEVER invent text to bridge a gap, and never continue a sentence past the edge of the region.`,
    `- READING ORDER: read DOWN each column inside the region, then move to the next column. NEVER read across columns.`,
    `- The crop has a thin margin. A sliver of a neighbouring column, or a line cut in half at the very edge, belongs`,
    `  to a neighbouring region — leave it out.`,
  ];
  if (a.part === 1) lines.push(`- If the region begins with a headline, put the headline on the first line, then any subhead/deck, then the body.`);
  lines.push(
    `- Do not summarize, correct the paper's own errors, or modernize spelling or punctuation.`,
    `- Handwriting is not publication content; do not fold pencil/pen marginalia into the text.`,
    `- If the region holds no printed words at all (a picture with no text), return an empty string.`,
  );
  return lines.join("\n");
}

// The crop for a box, as one or more IIIF pixel-region URLs. ContentDM honours
// pixel regions and `w,` sizes exactly (reextract.ts documents what it silently
// ignores). A box no taller than the image ceiling is one native-resolution
// image; a taller one is cut into overlapping slices, each at the ceiling.
function sliceUrls(iiif: string, rect: number[], page: { w: number; h: number }, max = REEXTRACT_MAX_EDGE) {
  const cl = (n: number) => Math.max(0, Math.min(1, n));
  const x0 = cl(rect[0] - BOXFIRST_PAD), y0 = cl(rect[1] - BOXFIRST_PAD);
  const x1 = cl(rect[0] + rect[2] + BOXFIRST_PAD), y1 = cl(rect[1] + rect[3] + BOXFIRST_PAD);
  const x = Math.round(x0 * page.w), y = Math.round(y0 * page.h);
  const w = Math.max(1, Math.round(x1 * page.w) - x), h = Math.max(1, Math.round(y1 * page.h) - y);
  // A box wider than the ceiling (a banner, a full-width ad) is scaled to fit by
  // width; its slices are then as tall, in native pixels, as the scaled width allows.
  const scale = Math.min(1, max / w);
  const size = scale < 1 ? `${max},` : "full";
  const sliceH = Math.floor(max / scale);
  const OVERLAP = 90; // native px — about two lines of body type
  const n = h <= sliceH ? 1 : Math.min(8, Math.ceil((h - OVERLAP) / (sliceH - OVERLAP)));
  const step = n === 1 ? 0 : (h - sliceH) / (n - 1);
  const out: Array<{ url: string; w: number; h: number }> = [];
  for (let i = 0; i < n; i++) {
    const sy = y + Math.round(i * step);
    const sh = n === 1 ? h : Math.min(sliceH, y + h - sy);
    out.push({ url: `${iiif}/${x},${sy},${w},${sh}/${size}/0/default.jpg`, w, h: sh });
  }
  return { slices: out, w, h };
}

export async function readBox(
  iiif: string, page: { w: number; h: number }, box: ProposalBox,
  ctx: { cls: string; role: string | null; part: number; parts: number },
): Promise<{ text: string; slices: number; pixels: number }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set — box-first transcription needs it");
  const { slices } = sliceUrls(iiif, box.rect, page);

  const images = await Promise.all(slices.map(async (s) => {
    const res = await fetchRetry(s.url, {}, { label: `IIIF crop #${box.id}` });
    if (!res.ok) throw new Error(`could not fetch box #${box.id} from ContentDM (HTTP ${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    // ContentDM answers a request it cannot honour with a valid JPEG of the WHOLE
    // page. Transcribing that would put the entire page's text in one object.
    const got = jpegSize(buf);
    if (got && got.w >= page.w * 0.98 && got.h >= page.h * 0.98 && (s.w < page.w * 0.9 || s.h < page.h * 0.9)) {
      throw new Error(`ContentDM returned the whole page instead of box #${box.id} — refusing to transcribe it`);
    }
    return { buf, pixels: got ? got.w * got.h : 0 };
  }));

  const content: any[] = [];
  images.forEach((im, i) => {
    if (images.length > 1) content.push({ type: "text", text: `Slice ${i + 1} of ${images.length}:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: im.buf.toString("base64") } });
  });
  content.push({ type: "text", text: buildPrompt({ ...ctx, slices: images.length }) });

  const res = await fetchRetry("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: BOXFIRST_MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: { effort: BOXFIRST_EFFORT, format: { type: "json_schema", schema: TEXT_SCHEMA } },
      messages: [{ role: "user", content }],
    }),
  }, { label: `Anthropic box #${box.id} (${BOXFIRST_MODEL})` });
  if (!res.ok) throw new Error(`Anthropic API ${res.status} on box #${box.id}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as {
    content: Array<{ type: string; text?: string }>; stop_reason?: string;
    stop_details?: { category?: string | null; explanation?: string } | null;
  };
  if (j.stop_reason === "max_tokens") throw new Error(`box #${box.id}: ran out of output tokens mid-transcription`);
  if (j.stop_reason === "refusal") throw new Error(`box #${box.id}: the model declined (${j.stop_details?.category ?? "no category"})`);
  const raw = j.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  let text: string;
  try { text = String((JSON.parse(raw) as { text?: unknown }).text ?? ""); }
  catch { throw new Error(`box #${box.id}: the model did not return a usable transcription`); }
  return {
    text: text.replace(/[ \t]+$/gm, "").trim(),
    slices: images.length,
    pixels: images.reduce((s, im) => s + im.pixels, 0),
  };
}

// ── transcribe a proposal into content objects ───────────────────────────────
export interface TranscribeArgs {
  collection: string;
  issuePointer: number | null;
  issueId: string;
  pageRecord: number;
  detector: DetectorId;
  force?: boolean; // transcribe despite coverage gaps — the curator has looked
}

export async function transcribeProposal(args: TranscribeArgs, onProgress: Progress = () => {}): Promise<{ count: number }> {
  const { collection, issuePointer, issueId, pageRecord, detector } = args;
  onProgress({ phase: "rights", message: "Checking rights…", pct: 2 });
  await assertIngestable(issuePointer);
  const st = await query<{ status: string }>(
    "SELECT status FROM page_ingests WHERE collection=$1 AND page_record=$2", [collection, pageRecord]);
  if (st.rows[0]?.status !== "review") throw new BoxFirstRefused("This page is not under box-first review.");
  const p = await getProposal(collection, pageRecord, detector);
  if (!p) throw new BoxFirstRefused("no proposal for this page and detector — run the detector first");
  if (p.status !== "draft") throw new BoxFirstRefused(`this proposal is ${p.status}, not a draft`);
  if (!p.groups.length) throw new BoxFirstRefused("there are no groups to transcribe");

  if (!args.force) {
    onProgress({ phase: "coverage", message: "Checking every printed line is inside a box…", pct: 5 });
    const t0 = performance.now();
    const cov = coverageOf(ocrOf(await pageImage(collection, pageRecord)), p.boxes, new Set(p.groups.flatMap((g) => g.boxes)));
    if (cov.gaps.length) throw new CoverageGaps({ ...cov, ms: Math.round(performance.now() - t0) });
  }

  await query("UPDATE page_ingests SET status='running', error=NULL WHERE collection=$1 AND page_record=$2", [collection, pageRecord]);
  try {
    const count = await transcribeAndStore(p, args, onProgress);
    return { count };
  } catch (e) {
    // Back to review, not 'error': the proposal and every correction on it are
    // intact, and the curator's next move is simply to try again.
    await query("UPDATE page_ingests SET status='review', error=$3 WHERE collection=$1 AND page_record=$2",
      [collection, pageRecord, (e as Error).message.slice(0, 500)]);
    throw e;
  }
}

async function transcribeAndStore(p: Proposal, args: TranscribeArgs, onProgress: Progress): Promise<number> {
  const { collection, issueId, pageRecord, detector } = args;
  const iiif = iiifId(pageRecord);
  const page = await pageSize(iiif);
  const byId = new Map(p.boxes.map((b) => [b.id, b]));
  const jobs = p.groups.flatMap((g, gi) => g.boxes.map((id, k) => ({ gi, k, box: byId.get(id)!, parts: g.boxes.length })))
    .filter((j) => j.box);

  onProgress({ phase: "transcribe", message: `Reading ${jobs.length} boxes in ${p.groups.length} groups…`, pct: 8 });
  let done = 0;
  const texts: string[][] = p.groups.map((g) => new Array(g.boxes.length).fill(""));
  const t0 = performance.now();
  await pMap(jobs, BOXFIRST_CONCURRENCY, async (j) => {
    const g = p.groups[j.gi];
    const r = await readBox(iiif, page, j.box, { cls: g.object_class, role: g.role, part: j.k + 1, parts: j.parts });
    texts[j.gi][j.k] = r.text;
    done++;
    onProgress({
      phase: "transcribe", pct: 8 + Math.round((done / jobs.length) * 50),
      message: `Read ${done}/${jobs.length} boxes (group ${j.gi + 1}, #${j.box.id}${r.slices > 1 ? `, ${r.slices} slices` : ""}).`,
    });
  });
  console.log(`[boxfirst] ${pageRecord}: read ${jobs.length} boxes in ${((performance.now() - t0) / 1000).toFixed(1)}s`);

  // One block per group, in the curator's page order; the region keeps EVERY
  // rect of the object — a person checked them, so they are not the anchoring
  // noise that made page-first keep only one. Largest first: the workbench and
  // re-extraction treat rects[0] as the primary.
  const blocks: VlmBlock[] = p.groups.map((g, gi) => {
    const boxes = g.boxes.map((id) => byId.get(id)!).filter(Boolean);
    const rects = boxes.map((b) => b.rect).sort((a, b) => b[2] * b[3] - a[2] * a[3]);
    return {
      object_class: g.object_class,
      role: g.role,
      text: texts[gi].filter(Boolean).join("\n"),
      region_bbox: {
        rects, source: boxes.some((b) => b.source === "human") ? "human" : `detector:${detector}`,
        // the workbench draws rects[0] and says "continues in N more" from this
        detector, boxes: g.boxes, continuedIn: rects.length - 1,
      } as unknown as VlmBlock["region_bbox"],
      continues_hint: null,
    };
  });
  const runId = `boxfirst_${detector}_p${pageRecord}`;
  const rows = explodePage({
    blocks, issueId, pageRecord, runId, model: BOXFIRST_MODEL, createdAt: new Date().toISOString(),
  }) as AssembledRow[];

  return enrichAndPersist({
    collection, pageRecord, issueId, rows, vlmModel: BOXFIRST_MODEL, onProgress,
    extra: async (c) => {
      await c.query(
        `UPDATE page_ingests SET mode='box-first', detector=$3, grouping_model=$4, run_id=$5
         WHERE collection=$1 AND page_record=$2`,
        [collection, pageRecord, detector, p.groupingModel, runId]);
      await c.query(
        `UPDATE box_proposals SET status = CASE WHEN detector=$3 THEN 'used' ELSE 'superseded' END, updated_at=now()
         WHERE collection=$1 AND page_record=$2`,
        [collection, pageRecord, detector]);
    },
  });
}
