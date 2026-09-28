// ── re-transcribe one object from its own boxes (SLICE-09i, SLICE-14) ────────
// A curator looking at a garbled transcription can have it read again — not the
// whole page, just this object, cropped straight out of the source scan at full
// resolution by ContentDM's IIIF server.
//
// It reads the object the way box-first transcription does, through the same
// call (readGroup): EVERY box of the object, in reading order, in one request,
// tall boxes as native-resolution slices. The first version cropped only the
// largest box, so a story that jumps columns came back cut off at the first
// column's foot — and a curator had to be warned not to trust it.
//
// It SUGGESTS ONLY. The re-read lands in the transcription editor unsaved; the
// curator reads it against the page and saves it, which is what writes it.
import { pageSize } from "./iiif.ts";
import { readingRects } from "./region.ts";
import { readGroup, chunkGroup } from "./boxTranscribe.ts";
import type { ProposalBox } from "./boxFirst.ts";
import type { Rect } from "./detect.ts";
import { BOXFIRST_MODEL } from "../config.ts";

export type Reextraction = {
  text: string;
  model: string;
  boxes: number;   // how many of the object's boxes were read
  images: number;  // crops sent, counting each slice of a tall box
  pixels: number;
};

export async function reextractObject(args: {
  iiifId: string;
  region: unknown; // the stored region_bbox
  objectClass: string;
  role?: string | null;
}): Promise<Reextraction> {
  const rects = readingRects(args.region);
  if (!rects.length) throw new Error("this object has no region to crop — draw one first");

  const page = await pageSize(args.iiifId);
  const boxes: ProposalBox[] = rects.map((rect, i) => ({
    id: i + 1, rect: rect as Rect, label: "region", conf: null, source: "human",
  }));
  // Nearly always one chunk; a sprawling object is read in consecutive parts,
  // exactly as ingestion reads it, and the parts joined in order.
  const chunks = chunkGroup(args.iiifId, page, boxes);
  const parts = await Promise.all(chunks.map((c, i) => readGroup(args.iiifId, page, c, {
    cls: args.objectClass, role: args.role ?? null, basis: "stored",
    chunk: chunks.length > 1 ? [i + 1, chunks.length] : undefined,
  })));

  const text = parts.map((p) => p.text).filter(Boolean).join("\n").trim();
  if (!text) throw new Error("the model read nothing in this object's boxes");
  return {
    text, model: BOXFIRST_MODEL, boxes: rects.length,
    images: parts.reduce((s, p) => s + p.images, 0),
    pixels: parts.reduce((s, p) => s + p.pixels, 0),
  };
}
