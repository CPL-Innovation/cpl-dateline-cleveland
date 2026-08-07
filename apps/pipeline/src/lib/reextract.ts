// ── re-transcribe one object from its own crop (SLICE-09i) ───────────────────
// A curator looking at a garbled transcription can have it read again — not the
// whole page, just this object's bounding box, cropped straight out of the source
// scan at full resolution.
//
// The crop is taken by ContentDM's IIIF server, not by us: the Image API accepts a
// percentage region, which is exactly the shape region_bbox already stores. So no
// page download, no local image handling, and the pixels the model sees are the
// archival scan rather than the display-size derivative the workbench renders.
//
// It SUGGESTS ONLY. The re-read lands in the transcription editor unsaved; the
// curator reads it against the crop and saves it, which is what puts it in the
// overlay. Nothing here writes.
import { fetchRetry } from "./http.ts";
import { REEXTRACT_MODEL, REEXTRACT_MAX_EDGE } from "../config.ts";
import { SYSTEM_PROMPT } from "./vlm-prompt.ts";

// The transcription rules below are lifted from the page-ingestion contract in
// vlm-prompt.ts (§Prompt contract) so a re-read produces text in the SAME shape as
// the original extraction — headline line first, body after, honesty markers
// intact. vlm-prompt.ts is the contract and is pinned; these must stay in sync
// with it, which is why they are quoted rather than paraphrased.
function buildPrompt(objectClass: string, role: string | null, continuedIn: number): string {
  return [
    `This image is a crop of a single content object from a 1924 newspaper page.`,
    `It was classified as "${objectClass}"${role ? ` (role: ${role})` : ""}.`,
    ``,
    `Transcribe it.`,
    ``,
    `RULES (follow exactly):`,
    `- Emit the object's text as ONE block: the headline line first, then any subhead/deck, then the body.`,
    `- READING ORDER: read DOWN each column, then move to the next column. NEVER read across columns.`,
    `- TRANSCRIBE ONLY WHAT IS PRINTED AND VISIBLE IN THIS CROP. Mark unreadable text [illegible] and`,
    `  physical damage [loss]. NEVER invent text to bridge a gap, and never continue a sentence that`,
    `  runs off the edge of the crop — stop where the crop stops.`,
    `- Do not summarize, correct the paper's own errors, or modernize spelling or punctuation.`,
    `- Handwriting is not publication content; do not fold marginalia into the text.`,
    continuedIn > 0
      ? `\nNOTE: this object was located in ${continuedIn + 1} column runs and this crop is only the first.` +
        ` Transcribe what is in frame and stop; do not guess at the continuation.`
      : ``,
  ].filter(Boolean).join("\n");
}

const TEXT_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string", description: "The verbatim transcription, headline line first." },
  },
  required: ["text"],
  additionalProperties: false,
} as const;

export type Reextraction = {
  text: string;
  model: string;
  cropUrl: string;
  cropBytes: number;
  cropPixels: string;
  continuedIn: number;
};

// CPL's ContentDM implements IIIF Image API 2.0 only PARTIALLY, and the gaps are
// silent rather than errors — measured against the live server:
//   • `pct:x,y,w,h` regions are NOT honoured; the response is unrelated geometry.
//   • `!w,h` (best-fit) sizes are NOT honoured; the response is the FULL page.
//   • pixel regions `x,y,w,h` are exact, and `w,` / `,h` sizes are exact.
// Both unsupported forms return HTTP 200 with a perfectly valid JPEG of the wrong
// thing, so there is nothing to catch — the only defence is to use the forms the
// server actually implements, and to check the returned pixel dimensions.
const sizeCache = new Map<string, { w: number; h: number }>();

export async function pageSize(iiifId: string): Promise<{ w: number; h: number }> {
  const hit = sizeCache.get(iiifId);
  if (hit) return hit;
  const res = await fetchRetry(`${iiifId}/info.json`, {}, { label: "IIIF info.json" });
  if (!res.ok) throw new Error(`could not read IIIF info.json (HTTP ${res.status})`);
  const j = (await res.json()) as { width?: number; height?: number };
  if (!j.width || !j.height) throw new Error("IIIF info.json carried no page dimensions");
  const size = { w: j.width, h: j.height };
  sizeCache.set(iiifId, size);
  return size;
}

// region_bbox is normalized 0-1 → an exact pixel region on the archival scan.
// Size: `full` when the crop already fits inside the model's image ceiling (IIIF
// never upscales, so this is the native archival resolution), otherwise constrain
// the LONG edge — asking for more only ships bytes Claude downsamples away.
export function cropUrl(
  iiifId: string, rect: number[], page: { w: number; h: number }, maxEdge = REEXTRACT_MAX_EDGE,
): { url: string; cw: number; ch: number } {
  const cl = (n: number) => Math.max(0, Math.min(1, n));
  const x = Math.round(cl(rect[0]) * page.w);
  const y = Math.round(cl(rect[1]) * page.h);
  const cw = Math.max(1, Math.min(page.w - x, Math.round(cl(rect[2]) * page.w)));
  const ch = Math.max(1, Math.min(page.h - y, Math.round(cl(rect[3]) * page.h)));
  const size = Math.max(cw, ch) <= maxEdge ? "full" : (cw >= ch ? `${maxEdge},` : `,${maxEdge}`);
  return { url: `${iiifId}/${x},${y},${cw},${ch}/${size}/0/default.jpg`, cw, ch };
}

// A JPEG's real dimensions, straight from its SOF marker. Used to verify the
// server honoured the region rather than quietly handing back the whole page.
function jpegSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

export async function reextractObject(args: {
  iiifId: string;
  rect: number[];
  objectClass: string;
  role?: string | null;
  continuedIn?: number;
}): Promise<Reextraction> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set — re-extraction needs it");
  const continuedIn = args.continuedIn ?? 0;

  const page = await pageSize(args.iiifId);
  const { url, cw, ch } = cropUrl(args.iiifId, args.rect, page);
  const imgRes = await fetchRetry(url, {}, { label: "IIIF region crop" });
  if (!imgRes.ok) throw new Error(`could not fetch the crop from ContentDM (HTTP ${imgRes.status})`);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  if (!buf.length) throw new Error("ContentDM returned an empty crop");
  const mediaType = imgRes.headers.get("content-type")?.split(";")[0] || "image/jpeg";

  // Verify we got the REGION, not the page. ContentDM answers an unsupported
  // request with a valid JPEG of the whole scan, and transcribing that would
  // silently replace one object's text with the entire page's — the worst
  // possible failure here, and one that looks like success from every angle
  // except the pixel dimensions.
  const got = jpegSize(buf);
  if (got && got.w >= page.w * 0.98 && got.h >= page.h * 0.98 && (cw < page.w * 0.9 || ch < page.h * 0.9)) {
    throw new Error(
      `ContentDM returned the whole page (${got.w}x${got.h}) instead of the ${cw}x${ch} crop — refusing to transcribe it`);
  }

  const res = await fetchRetry("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: REEXTRACT_MODEL,
      max_tokens: 16000, // one object, not a page — but a dense column runs long
      system: SYSTEM_PROMPT, // the same honesty spine the page extraction runs under
      output_config: { format: { type: "json_schema", schema: TEXT_SCHEMA } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: buf.toString("base64") } },
          { type: "text", text: buildPrompt(args.objectClass, args.role ?? null, continuedIn) },
        ],
      }],
    }),
  }, { label: `Anthropic re-extract (${REEXTRACT_MODEL})` });

  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  const raw = json.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");

  let text: string;
  try {
    text = String((JSON.parse(raw) as { text?: unknown }).text ?? "");
  } catch {
    throw new Error("the model did not return a usable transcription");
  }
  text = text.replace(/[ \t]+$/gm, "").trim();
  if (!text) throw new Error("the model read nothing in this crop");

  return {
    text, model: REEXTRACT_MODEL, cropUrl: url, cropBytes: buf.length, continuedIn,
    cropPixels: got ? `${got.w}x${got.h}` : `${cw}x${ch}`,
  };
}
