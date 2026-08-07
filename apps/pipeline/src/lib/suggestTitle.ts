// ── AI-suggested display title (SLICE-09h) ───────────────────────────────────
// Reads an object's transcription and proposes a headline for it, using Haiku.
//
// It SUGGESTS ONLY — nothing is written. The suggestion lands in the workbench's
// Display title field unsaved, and becomes real when the curator saves it. That
// keeps the same posture as the rest of this pipeline: nothing machine-written
// reaches a patron without a human putting it there.
//
// Raw HTTP through fetchRetry rather than the SDK, matching the two existing
// Claude call sites (vlmExtract, enrichAdapter) — one calling convention and one
// retry/backoff policy across every model call in the service.
import { fetchRetry } from "./http.ts";
import { TITLE_MODEL } from "../config.ts";

// Structured output, so the model cannot wrap the headline in a preamble or
// quotation marks that we would then have to strip back off.
const TITLE_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description:
        "The headline, in the newspaper's own words where possible. Empty string if the object genuinely has no headline.",
    },
  },
  required: ["title"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = [
  "You write display titles for items in a digitized 1920s community newspaper (the Brooklyn News, Cleveland).",
  "You are given one item's transcription. Return a single short headline for it.",
  "",
  "Rules:",
  "- Prefer the paper's OWN words. If the text already contains a headline or a natural title phrase, use it as-is.",
  "- Otherwise write a plain factual headline of at most 9 words, in the register of the period.",
  "- Never invent facts, names, dates or figures that are not in the text.",
  "- No trailing period. No quotation marks around the headline. No preamble.",
  "- If the item is a fragment with no describable subject (a stray price, a page number,",
  "  a printer's mark, an unlabelled illustration), return an empty string rather than inventing one.",
].join("\n");

export type TitleSuggestion = { title: string; model: string };

export async function suggestTitle(text: string, objectClass?: string | null, role?: string | null): Promise<TitleSuggestion> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set — title suggestion needs it");
  const body = String(text ?? "").trim();
  if (!body) throw new Error("this object has no transcription to write a title from");

  const res = await fetchRetry("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: TITLE_MODEL,
      max_tokens: 256, // a headline — the cap is a guard, not a budget
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: TITLE_SCHEMA } },
      messages: [{
        role: "user",
        content:
          `Item type: ${objectClass ?? "unknown"}${role ? ` (${role})` : ""}\n\n` +
          `Transcription:\n${body.slice(0, 6000)}`,
      }],
    }),
  }, { label: `Anthropic title suggestion (${TITLE_MODEL})` });

  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  const raw = json.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");

  let title = "";
  try {
    title = String((JSON.parse(raw) as { title?: unknown }).title ?? "");
  } catch {
    throw new Error("the model did not return a usable title");
  }
  // Belt and braces on top of the schema: a title is one line, and the trailing
  // period the prompt forbids is the one thing models still slip in.
  title = title.replace(/\s+/g, " ").trim().replace(/^["'“”]+|["'“”]+$/g, "").replace(/\.$/, "").trim();
  return { title, model: TITLE_MODEL };
}
