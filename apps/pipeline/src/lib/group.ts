// group — turn a detector's REGIONS into content OBJECTS (SLICE-14).
//
// A detector returns "a headline here, a column of body there". Which of those
// make one story, and in what order they read, is the judgement page-first
// ingestion makes implicitly while it transcribes. Box-first has to make it
// explicitly, so this asks a VLM — but only about structure:
//
//   it sees the page with every box drawn and NUMBERED, and answers in numbers
//   ("3, 7, 8, 12 are one article"). It never emits a coordinate.
//
// That keeps the VLM on the side of the line ocrAnchor drew: excellent at reading
// a page's structure, poor at regressing geometry. The geometry is the detector's
// and the curator's; the grouping is a proposal the curator corrects.
import { readFile } from "node:fs/promises";
import { fetchRetry } from "./http.ts";
import { renderOverlay, type DetectedBox } from "./detect.ts";
import { OBJECT_CLASSES, type ObjectClass } from "./vlm-prompt.ts";
import { GROUPING_MODEL, GROUPING_EFFORT, GROUPING_MAX_EDGE, type DetectorId } from "../config.ts";
import { DETECTOR_INFO } from "./detect.ts";

export interface BoxGroup {
  id: number; // 1-based, page reading order
  boxes: number[]; // box ids, in reading order within the object
  object_class: ObjectClass;
  role: string | null;
  // Set when the grouper did not account for a box and it was given a group of
  // its own so nothing is silently lost. The curator should look at these first.
  unplaced?: true;
}

export interface Grouping {
  groups: BoxGroup[];
  discarded: number[]; // box ids the grouper judged to hold no publication content
  model: string; // GROUPING_MODEL, or "none" when no model ran (fallback)
  ms: number;
  usage?: { inputTokens: number | null; outputTokens: number | null };
  note?: string; // why the fallback ran, when it did
}

// A detector label → the object_class a box of that kind most likely is. Used
// for the fallback grouping and for unplaced boxes. A hint, never the answer.
const LABEL_CLASS: Record<string, ObjectClass> = {
  // american-stories
  article: "article", headline: "article", author: "article",
  cartoon_or_advertisement: "advertisement", image_caption: "caption",
  masthead: "masthead", newspaper_header: "masthead", page_number: "filler_slug",
  photograph: "illustration", table: "listing",
  // pp-doclayout
  text: "article", paragraph_title: "article", doc_title: "article", abstract: "article",
  content: "article", aside_text: "article", vertical_text: "article",
  image: "illustration", chart: "illustration", header_image: "illustration", footer_image: "illustration",
  figure_title: "caption", vision_footnote: "caption", footnote: "caption",
  header: "filler_slug", footer: "filler_slug", number: "filler_slug", seal: "illustration",
  // tesseract uses "text" and "image", covered above
};
export const classForLabel = (label: string): ObjectClass => LABEL_CLASS[label] ?? "article";

// ── the prompt ───────────────────────────────────────────────────────────────
const SYSTEM = `You are the layout editor for a library's historical-newspaper digitization pipeline.
You decide which regions of a printed page belong together as one content object, and in what order they are read.
You do not transcribe. You report only structure that is visible on the page.`;

function prompt(boxes: DetectedBox[], detector: DetectorId): string {
  const f = (n: number) => n.toFixed(3);
  const list = boxes
    .map((b) => `#${b.id} ${b.label} @ ${f(b.rect[0])},${f(b.rect[1])} ${f(b.rect[2])}x${f(b.rect[3])}`)
    .join("\n");
  return `This is a 1920s newspaper page. A layout detector (${DETECTOR_INFO[detector].label}) found ${boxes.length} regions and drew them as numbered boxes — each number is printed at its box's top-left corner.
The detector finds REGIONS, not stories: one article is often several boxes (a headline, a deck, body text in two or three columns). Your job is to group the boxes into content objects.

The boxes (number, detector label, then x,y of the top-left corner and width x height, all as fractions of the page):
${list}

Return JSON: { "groups": [ { "boxes": [ids], "object_class": "...", "role": "..." }, ... ], "discard": [ids] }

RULES (follow exactly):
- ONE GROUP PER CONTENT OBJECT. An article is its headline, any subhead/deck, and EVERY box of its body — including where the body continues at the top of the next column. Distinct stories are distinct groups. The same holds for ads, listings and notices: the whole unit is one group, not its typographic parts.
- Inside a group, list box numbers in READING ORDER: headline first, then any deck, then the body down each column, then on to the next column.
- List the groups themselves in PAGE READING ORDER: down each column, then the next column. A banner spanning several columns comes before the columns beneath it.
- EVERY box number appears exactly once — in one group, or in "discard". Discard only a box that holds no publication content: a stray rule, a speck, a box that merely duplicates another box's area.
- object_class is one of [${OBJECT_CLASSES.join(", ")}]. Classify by what the object IS: a display ad is "advertisement" (not "article"); a repeated column-divider ad bar is "filler_slug"; a bucket of many micro-entries is "classified_section"; the nameplate and the publication statement/officers block are "masthead"; handwritten pencil/pen marks are "manuscript_annotation".
- An advertisement OWNS everything inside its border or layout: its pictures, price panels, captions and store footer all go in the ad's ONE group. A full-page ad is one group. "illustration" and "caption" are only for editorial pictures standing on their own — a news photo is one "illustration" group and the caption under it is a separate "caption" group.
- role: "headline+body" for a story with its headline; otherwise a short free-text role, or "".
- The detector's labels are hints and are sometimes wrong. Judge by the page itself: headline type, column rules, ad borders, whitespace.`;
}

const SCHEMA = {
  type: "object",
  properties: {
    groups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          boxes: { type: "array", items: { type: "integer" } },
          object_class: { type: "string", enum: [...OBJECT_CLASSES] },
          role: { type: "string" },
        },
        required: ["boxes", "object_class", "role"],
        additionalProperties: false,
      },
    },
    discard: { type: "array", items: { type: "integer" } },
  },
  required: ["groups", "discard"],
  additionalProperties: false,
} as const;

// ── public entry ─────────────────────────────────────────────────────────────
// Never throws for a model failure: a page whose grouping call fails still has
// its boxes, and a curator can group those by hand. The fallback (one group per
// box, classed from its label) is returned with `note` saying why.
export async function groupBoxes(
  imagePath: string, boxes: DetectedBox[], detector: DetectorId, overlayPath: string,
): Promise<Grouping> {
  const t0 = performance.now();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return fallback(boxes, t0, "ANTHROPIC_API_KEY is not set — boxes left ungrouped");
  if (!boxes.length) return { groups: [], discarded: [], model: "none", ms: 0 };

  try {
    await renderOverlay(imagePath, boxes, overlayPath, GROUPING_MAX_EDGE);
    const img = await readFile(overlayPath);
    const res = await fetchRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: GROUPING_MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        output_config: { effort: GROUPING_EFFORT, format: { type: "json_schema", schema: SCHEMA } },
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.toString("base64") } },
            { type: "text", text: prompt(boxes, detector) },
          ],
        }],
      }),
    }, { label: `Anthropic grouping (${GROUPING_MODEL})` });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
      stop_reason?: string;
      stop_details?: { category?: string | null; explanation?: string } | null;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    // Structured output guarantees the SHAPE only of a response that finished.
    // One cut off at max_tokens is truncated JSON, and a refusal carries none.
    if (j.stop_reason === "max_tokens") throw new Error("ran out of output tokens before finishing the grouping");
    if (j.stop_reason === "refusal") {
      throw new Error(`the model declined (${j.stop_details?.category ?? "no category"}: ${j.stop_details?.explanation ?? ""})`);
    }
    const raw = j.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    const parsed = JSON.parse(raw) as { groups: Array<{ boxes: number[]; object_class: string; role: string }>; discard: number[] };
    const { groups, discarded } = normalizeGroups(boxes, parsed.groups, parsed.discard);
    return {
      groups, discarded, model: GROUPING_MODEL,
      ms: Math.round(performance.now() - t0),
      usage: { inputTokens: j.usage?.input_tokens ?? null, outputTokens: j.usage?.output_tokens ?? null },
    };
  } catch (e) {
    return fallback(boxes, t0, `grouping failed (${(e as Error).message.slice(0, 200)}) — boxes left ungrouped`);
  }
}

function fallback(boxes: DetectedBox[], t0: number, note: string): Grouping {
  console.warn(`[group] fallback — ${note}`);
  return {
    groups: boxes.map((b, i) => ({ id: i + 1, boxes: [b.id], object_class: classForLabel(b.label), role: null })),
    discarded: [], model: "none", ms: Math.round(performance.now() - t0), note,
  };
}

// ── validation ───────────────────────────────────────────────────────────────
// The one invariant everything downstream relies on: every box is in at most one
// group, and every group names only boxes that exist. Used on the grouper's
// output AND on every curator save, because both can break it.
//   • unknown ids are dropped; a box claimed twice keeps its FIRST group
//   • empty groups vanish; group ids are renumbered 1..n in the given order
//   • with `placeAll`, a box in neither a group nor `discard` gets a group of
//     its own flagged `unplaced` — the grouper forgot it, and silently losing a
//     region is worse than showing the curator one extra group
export function normalizeGroups(
  boxes: Array<Pick<DetectedBox, "id" | "label">>,
  groups: Array<{ boxes: number[]; object_class: string; role?: string | null; unplaced?: boolean }>,
  discard: number[] = [],
  placeAll = true,
): { groups: BoxGroup[]; discarded: number[] } {
  const known = new Map(boxes.map((b) => [b.id, b]));
  const seen = new Set<number>();
  const out: BoxGroup[] = [];
  for (const g of groups ?? []) {
    const ids = (g.boxes ?? []).map(Number).filter((id) => known.has(id) && !seen.has(id));
    if (!ids.length) continue;
    ids.forEach((id) => seen.add(id));
    const cls = (OBJECT_CLASSES as readonly string[]).includes(g.object_class)
      ? (g.object_class as ObjectClass) : classForLabel(known.get(ids[0])!.label);
    const grp: BoxGroup = { id: out.length + 1, boxes: ids, object_class: cls, role: g.role ? String(g.role) : null };
    if (g.unplaced) grp.unplaced = true;
    out.push(grp);
  }
  const discarded = [...new Set((discard ?? []).map(Number))].filter((id) => known.has(id) && !seen.has(id));
  discarded.forEach((id) => seen.add(id));
  if (placeAll) {
    for (const b of boxes) {
      if (seen.has(b.id)) continue;
      out.push({ id: out.length + 1, boxes: [b.id], object_class: classForLabel(b.label), role: null, unplaced: true });
    }
  }
  return { groups: out, discarded };
}
