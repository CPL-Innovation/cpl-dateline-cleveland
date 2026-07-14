// Explode an ordered VLM block array into content_objects rows (SLICE-01 step 3).
// Minimal Stage 3 only:
//   - confirm object_class (validation happened in the adapter);
//   - collapse repeated filler_slug dupes to one row + occurrences (Dry Run 01 gap C);
//   - flag handwriting as manuscript_annotation, is_publication_content=false (gap H).
// NO cross-page/cross-issue stitching, NO enrichment tiers, NO events. (SLICE-01 guardrail.)
import type { VlmBlock } from "./vlm-prompt.ts";

export interface ContentObjectRow {
  issue_id: string;
  page_record: number;
  seq: number;
  object_class: string;
  role: string | null;
  text: string;
  region_bbox: string | null;
  is_publication_content: number; // 0|1
  occurrences: number;
  transcription_confidence: number | null;
  run_id: string;
  model: string;
  created_at: string;
}

// Classes that are captured but are NOT part of the published paper (gap H).
const NON_PUBLICATION = new Set(["manuscript_annotation", "filler_slug"]);

function normalizeFiller(text: string): string {
  // Loose key so "Burn YELLOW JACKET Coal" / "Burn Yellow Jacket Coal!" collapse together.
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function explodePage(args: {
  blocks: VlmBlock[];
  issueId: string;
  pageRecord: number;
  runId: string;
  model: string;
  createdAt: string;
}): ContentObjectRow[] {
  const { blocks, issueId, pageRecord, runId, model, createdAt } = args;
  const rows: ContentObjectRow[] = [];
  // filler-collapse: canonical-key -> row index in `rows`
  const fillerIndex = new Map<string, number>();
  let seq = 0;

  for (const b of blocks) {
    if (b.object_class === "filler_slug") {
      const key = normalizeFiller(b.text);
      const existing = fillerIndex.get(key);
      if (existing !== undefined) {
        rows[existing].occurrences += 1; // collapse the dupe (gap C)
        continue;
      }
    }

    const row: ContentObjectRow = {
      issue_id: issueId,
      page_record: pageRecord,
      seq: seq++,
      object_class: b.object_class,
      role: b.role,
      text: b.text,
      region_bbox: b.region_bbox ? JSON.stringify(b.region_bbox) : null,
      is_publication_content: NON_PUBLICATION.has(b.object_class) ? 0 : 1,
      occurrences: 1,
      transcription_confidence: null,
      run_id: runId,
      model,
      created_at: createdAt,
    };
    rows.push(row);
    if (b.object_class === "filler_slug") {
      fillerIndex.set(normalizeFiller(b.text), rows.length - 1);
    }
  }
  return rows;
}
