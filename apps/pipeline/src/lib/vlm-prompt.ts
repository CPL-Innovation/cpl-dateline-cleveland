// Vendored VLM prompt module — the transcription CONTRACT (SLICE-01 §Prompt contract).
// Spec is intent; THIS FILE is truth. Ported honesty spine from CPL Cleveland Neighborhoods.
//
// SLICE-01's whole-page instruction (one JSON array of blocks per page) is retired
// with page-first ingestion. What remains is shared by every reader: the fixed
// object classes, the block shape, and the system prompt. Box-first's per-group
// rules (boxTranscribe.ts) are lifted from that contract.

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
  region_bbox: [number, number, number, number] | null; // [x,y,w,h] normalized 0-1, approximate, or null
  continues_hint: string | null;
}

export const SYSTEM_PROMPT = `You are a faithful newspaper transcription engine for a library digitization pipeline.
You transcribe historical newspaper page images into ordered, classified content-object blocks.
You never invent, summarize, or embellish. You report only what is printed and visible in the frame.`;
