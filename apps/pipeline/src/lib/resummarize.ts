// ── regenerate an object's summary from its transcription (SLICE-09j) ────────
// The enrichment pass wrote `summary` from the text as it stood at ingestion. Once
// a curator corrects that text — or a re-extraction replaces it — the summary is
// describing a read nobody uses any more. This re-derives it from the CURRENT text.
//
// Sonnet, matching the enrichment tier: it is the same judgement call the pipeline
// makes, just for one object.
//
// It SUGGESTS ONLY. The proposed summary goes back to the workbench and is written
// only when the curator commits it.
import { fetchRetry } from "./http.ts";
import { RESUMMARIZE_MODEL } from "../config.ts";

// The definition is lifted from the enrichment contract in enrich-prompt.ts
// ("summary": <one-sentence browse pitch, rewritten — not a quote>) so a
// regenerated summary reads like the ones the pipeline produced. enrich-prompt.ts
// is the contract; keep this in sync with it.
const SYSTEM_PROMPT =
  "You write one-sentence browse pitches for items in a digitized 1924 community newspaper " +
  "(the Brooklyn News, Cleveland), for a library discovery interface. " +
  "You never invent, embellish, or editorialize — you describe only what the text says.";

function buildPrompt(text: string, objectClass: string, role: string | null): string {
  return [
    `Write the one-sentence summary for this content object.`,
    `object_class: ${objectClass}${role ? ` · role: ${role}` : ""}`,
    ``,
    `RULES:`,
    `- ONE sentence. A browse pitch: what a reader scanning an index needs to know to decide to open it.`,
    `- REWRITTEN, not a quote — do not lift a sentence from the text.`,
    `- Only what the text supports. No invented names, dates, figures or outcomes.`,
    `- Neutral and factual. No editorializing, no "this fascinating article", no addressing the reader.`,
    `- Present tense, describing the item ("A church roundup reports…"), not the events as news.`,
    `- If the text is too fragmentary to summarize, return an empty string rather than guessing.`,
    ``,
    `TEXT (machine-transcribed, may contain errors):`,
    `"""`,
    text.slice(0, 20000),
    `"""`,
  ].join("\n");
}

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "One sentence, or empty if the text cannot support one." },
  },
  required: ["summary"],
  additionalProperties: false,
} as const;

export async function resummarize(text: string, objectClass: string, role: string | null) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set — summary regeneration needs it");
  const body = String(text ?? "").trim();
  if (!body) throw new Error("this object has no transcription to summarize");

  const res = await fetchRetry("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: RESUMMARIZE_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: SUMMARY_SCHEMA } },
      messages: [{ role: "user", content: buildPrompt(body, objectClass, role) }],
    }),
  }, { label: `Anthropic re-summarize (${RESUMMARIZE_MODEL})` });

  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  const raw = json.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  let summary: string;
  try {
    summary = String((JSON.parse(raw) as { summary?: unknown }).summary ?? "");
  } catch {
    throw new Error("the model did not return a usable summary");
  }
  summary = summary.replace(/\s+/g, " ").trim();
  return { summary, model: RESUMMARIZE_MODEL };
}

// Commit a regenerated summary. `summary` is an enrichment field, not raw
// transcription, so this writes it in place — the enrichment layer has always
// been an overlay over immutable raw text, and this stays inside that layer.
//
// This is RE-EXTRACTION's shape, not a curator's edit (SLICE-13b): a machine
// redoing a machine field, replacing the previous machine read and recording
// which model wrote what is there now. The superseded summary is not kept, for
// the same reason the superseded transcription isn't — it is a machine read
// everyone has agreed is wrong.
//
// So `model` is REQUIRED for any non-empty summary. A curator clicking KEEP IT
// approves these words; they did not write them, and their approval is recorded
// in `curation_status`, not here. There is no path through this function that
// attributes a summary to a person, because there is no path that lets a person
// write one.
export async function setObjectSummary(objectId: number, summary: unknown, model: unknown) {
  const { query } = await import("./pg.ts");
  if (!Number.isFinite(objectId)) throw new Error("objectId must be a number");
  if (summary != null && typeof summary !== "string") throw new Error("summary must be a string or null");
  const clean = typeof summary === "string" ? summary.replace(/\s+/g, " ").trim() : "";
  if (clean.length > 2000) throw new Error("summary exceeds 2000 characters");
  const by = typeof model === "string" ? model.trim() : "";
  if (clean && !by) throw new Error("model is required — a summary is machine-written and must say which machine wrote it");

  const r = await query<{ summary: string | null; summary_model: string | null; summary_at: Date | null }>(
    `UPDATE content_objects
        SET summary       = $1,
            summary_model = $2,
            summary_at    = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END
      WHERE id = $3
      RETURNING summary, summary_model, summary_at`,
    [clean || null, clean ? by : null, objectId]);
  if (!r.rowCount) throw new Error(`no content object with id ${objectId}`);
  const row = r.rows[0];
  return { summary: row.summary, summaryModel: row.summary_model, summaryAt: row.summary_at };
}
