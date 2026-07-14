// Vendored VLM prompt module — the transcription CONTRACT for SLICE-01.
// Spec is intent; THIS FILE is truth (SLICE-01 §"Vendored prompt file", hand-synced
// to the brief's §Prompt contract). Ported honesty spine from CPL Cleveland Neighborhoods.
//
// The model returns ONE JSON array per page: ordered content-object blocks in reading order.

// object_class enum is FIXED by data-schema v0.3 (§object_class spine). Do not extend it.
export const OBJECT_CLASSES = [
  "article",
  "advertisement",
  "listing",
  "classified_section",
  "legal_notice",
  "coupon",
  "masthead",
  "filler_slug",
  "manuscript_annotation",
  "caption",
  "illustration",
] as const;

export type ObjectClass = (typeof OBJECT_CLASSES)[number];

// The shape of one block the VLM must emit (SLICE-01 §Prompt contract).
export interface VlmBlock {
  object_class: ObjectClass;
  role: string | null; // headline | subhead | body | ... (free)
  text: string; // verbatim transcription of what is printed
  region_bbox: [number, number, number, number] | null; // [x,y,w,h] best-effort or null
  continues_hint: string | null;
}

export const SYSTEM_PROMPT = `You are a faithful newspaper transcription engine for a library digitization pipeline.
You transcribe historical newspaper page images into ordered, classified content-object blocks.
You never invent, summarize, or embellish. You report only what is printed and visible in the frame.`;

// The per-page instruction. Baked rules mirror SLICE-01 §Prompt contract exactly.
export function buildUserPrompt(pageNumber: number): string {
  return `Transcribe this newspaper page (page ${pageNumber}) into a JSON array of content-object blocks.

Return ONLY a JSON array. Each element:
{
  "object_class": one of [${OBJECT_CLASSES.join(", ")}],
  "role": "headline | subhead | body | ..." (free text, or null),
  "text": "verbatim transcription of what is printed",
  "region_bbox": [x, y, w, h] or null,
  "continues_hint": string or null
}

RULES (follow exactly):
- READING ORDER: read DOWN each column, then move to the next column. NEVER read across columns.
- TRANSCRIBE ONLY WHAT IS PRINTED AND VISIBLE. Mark unreadable text [illegible] and physical damage [loss]. NEVER invent text to bridge a gap.
- HANDWRITING IS NOT PUBLICATION CONTENT. Pencil/pen marginalia -> object_class "manuscript_annotation"; do NOT fold it into adjacent article text.
- region_bbox is BEST-EFFORT OR null. Do not fabricate coordinates.
- object_class enum is FIXED. Do not extend it.
- Classify by what the object IS: a display ad is "advertisement" (not "article"); a repeated column-divider ad bar is "filler_slug"; a bucket of many micro-entries is "classified_section"; the publication statement/officers block is "masthead".
- Output valid JSON only. No prose before or after.`;
}
