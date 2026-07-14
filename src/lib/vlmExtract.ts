// vlmExtract — the single adapter behind which the VLM lives (CN pattern).
// The model is a CONFIG SWAP: callers never know which provider ran.
// Providers:
//   fixture   — replay a session-VLM transcription committed under fixtures/.
//   gemini    — Gemini vision (production default per SLICE-01 §engine choice).
//   anthropic — Claude vision.
//   openai    — GPT vision.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { VLM_PROVIDER, VLM_MODEL, VLM_MAX_EDGE, FIXTURES_DIR } from "../config.ts";
import { buildUserPrompt, SYSTEM_PROMPT, OBJECT_CLASSES } from "./vlm-prompt.ts";
import type { VlmBlock, ObjectClass } from "./vlm-prompt.ts";
import { conditionedImage } from "./condition.ts";

export interface VlmResult {
  blocks: VlmBlock[];
  model: string;
  provider: string;
}

export interface VlmArgs {
  imagePath: string;
  pageRecord: number;
  pageNumber: number;
}

// Public entry: one page image in, ordered content-object blocks out.
export async function vlmExtract(args: VlmArgs): Promise<VlmResult> {
  let raw: unknown;
  switch (VLM_PROVIDER) {
    case "gemini":
      raw = await callGemini(args);
      break;
    case "anthropic":
      raw = await callAnthropic(args);
      break;
    case "openai":
      raw = await callOpenAI(args);
      break;
    case "fixture":
    default:
      raw = await loadFixture(args.pageRecord);
  }
  return { blocks: validateBlocks(raw), model: VLM_MODEL, provider: VLM_PROVIDER };
}

// --- fixture provider -------------------------------------------------------
// The session VLM (Claude, reading the real page pixels) produced these, exactly
// as Dry Run 01 did — the genuine structured output of a VLM pass on the real
// images, replayed through the real explode/store/view pipeline.
async function loadFixture(pageRecord: number): Promise<unknown> {
  const path = resolve(FIXTURES_DIR, `p16014coll5_${pageRecord}.json`);
  return JSON.parse(await readFile(path, "utf8"));
}

function requireKey(name: string, provider: string): string {
  const key = process.env[name];
  if (!key) {
    throw new Error(
      `VLM_PROVIDER=${provider} requires ${name}. Set it in .env (see README).`,
    );
  }
  return key;
}

// --- gemini provider --------------------------------------------------------
async function callGemini(args: VlmArgs): Promise<unknown> {
  const key = requireKey("GEMINI_API_KEY", "gemini");
  const img = conditionedImage(args.imagePath, VLM_MAX_EDGE);
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${VLM_MODEL}:generateContent?key=${key}`;
  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: img.mediaType, data: img.data } },
          { text: buildUserPrompt(args.pageNumber) },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      response_mime_type: "application/json",
      maxOutputTokens: 65536,
      // 2.5-flash spends "thinking" tokens from the output budget by default;
      // this is bounded transcription, so turn thinking off to reserve the budget.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text =
    json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return parseLooseArray(text);
}

// --- anthropic provider -----------------------------------------------------
async function callAnthropic(args: VlmArgs): Promise<unknown> {
  const key = requireKey("ANTHROPIC_API_KEY", "anthropic");
  const img = conditionedImage(args.imagePath, VLM_MAX_EDGE);
  const body = {
    model: VLM_MODEL,
    max_tokens: 32000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: img.mediaType, data: img.data },
          },
          { type: "text", text: buildUserPrompt(args.pageNumber) },
        ],
      },
    ],
  };
  // Use the public API host explicitly — ANTHROPIC_BASE_URL may point at an
  // OAuth gateway that rejects x-api-key auth.
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { content: Array<{ text?: string }> };
  return parseLooseArray(json.content.map((c) => c.text ?? "").join(""));
}

// --- openai provider --------------------------------------------------------
async function callOpenAI(args: VlmArgs): Promise<unknown> {
  const key = requireKey("OPENAI_API_KEY", "openai");
  const img = conditionedImage(args.imagePath, VLM_MAX_EDGE);
  const body = {
    model: VLM_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${img.mediaType};base64,${img.data}` },
          },
          {
            type: "text",
            text:
              buildUserPrompt(args.pageNumber) +
              '\n\nReturn a JSON object of the form {"blocks": [ ...the array... ]}.',
          },
        ],
      },
    ],
  };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const parsed = JSON.parse(stripCodeFence(json.choices[0].message.content));
  // response_format=json_object forces an object wrapper; unwrap to the array.
  return Array.isArray(parsed) ? parsed : (parsed.blocks ?? parsed.objects ?? parsed);
}

function stripCodeFence(s: string): string {
  let t = s.trim();
  // strip a leading ```json / ``` fence and any closing fence, tolerating a
  // preamble line and a MISSING closing fence (truncated output).
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/,"").trim();
  return t;
}

// Tolerant array parse: real VLMs wrap in fences, add preamble, or truncate the
// tail on long dense pages. Recover the largest valid array prefix rather than
// dropping the whole page. Returns the parsed array (throws only if nothing usable).
function parseLooseArray(text: string): unknown[] {
  const body = stripCodeFence(text);
  const start = body.indexOf("[");
  if (start < 0) throw new Error("no JSON array found in VLM output");
  const candidate = body.slice(start);
  try {
    return JSON.parse(candidate);
  } catch {
    // truncation-repair: cut back to the last complete object and close the array.
    const lastObj = candidate.lastIndexOf("}");
    if (lastObj > 0) {
      const repaired = candidate.slice(0, lastObj + 1) + "]";
      const arr = JSON.parse(repaired);
      console.warn(
        `  ⚠ VLM output was truncated; recovered ${arr.length} complete blocks (tail dropped).`,
      );
      return arr;
    }
    throw new Error("VLM output was not recoverable JSON");
  }
}

// --- validation (guards every provider) -------------------------------------
const CLASS_SET = new Set<string>(OBJECT_CLASSES);

function validateBlocks(raw: unknown): VlmBlock[] {
  if (!Array.isArray(raw)) {
    throw new Error("VLM output must be a JSON array of blocks");
  }
  return raw.map((b, i) => {
    if (typeof b !== "object" || b === null) {
      throw new Error(`block ${i} is not an object`);
    }
    const obj = b as Record<string, unknown>;
    const cls = obj.object_class;
    if (typeof cls !== "string" || !CLASS_SET.has(cls)) {
      throw new Error(`block ${i} has invalid object_class: ${String(cls)}`);
    }
    // text is expected but real models legitimately omit it for text-less blocks
    // (e.g. an illustration with no printed caption) — capture the block, don't drop it.
    return {
      object_class: cls as ObjectClass,
      role: typeof obj.role === "string" ? obj.role : null,
      text: typeof obj.text === "string" ? obj.text : "",
      region_bbox: Array.isArray(obj.region_bbox)
        ? (obj.region_bbox as [number, number, number, number])
        : null,
      continues_hint:
        typeof obj.continues_hint === "string" ? obj.continues_hint : null,
    };
  });
}
