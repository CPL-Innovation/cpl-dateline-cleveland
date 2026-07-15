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
import type { VlmProvider } from "../config.ts";
import { buildUserPrompt, SYSTEM_PROMPT, OBJECT_CLASSES } from "./vlm-prompt.ts";
import type { VlmBlock, ObjectClass } from "./vlm-prompt.ts";
import { conditionedImage } from "./condition.ts";
import { fetchRetry } from "./http.ts";

export interface VlmUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface VlmResult {
  blocks: VlmBlock[];
  model: string;
  provider: string;
  usage?: VlmUsage; // token counts when the provider reports them (cost axis)
  latencyMs?: number; // wall-clock of the provider call (stability/throughput)
}

export interface VlmArgs {
  imagePath: string;
  pageRecord: number;
  pageNumber: number;
  // SLICE-03: override the module-configured provider/model so a harness can loop
  // several engines in one process (the bake-off). Omit → use config (SLICE-01/02).
  provider?: VlmProvider;
  model?: string;
}

interface RawCall {
  raw: unknown;
  usage?: VlmUsage;
}

// Public entry: one page image in, ordered content-object blocks out.
export async function vlmExtract(args: VlmArgs): Promise<VlmResult> {
  const provider = args.provider ?? VLM_PROVIDER;
  const model = args.model ?? VLM_MODEL;
  const started = performance.now();
  let out: RawCall;
  switch (provider) {
    case "gemini":
      out = await callGemini(args, model);
      break;
    case "anthropic":
      out = await callAnthropic(args, model);
      break;
    case "openai":
      out = await callOpenAI(args, model);
      break;
    case "fixture":
    default:
      out = { raw: await loadFixture(args.pageRecord) };
  }
  return {
    blocks: validateBlocks(out.raw),
    model,
    provider,
    usage: out.usage,
    latencyMs: Math.round(performance.now() - started),
  };
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
async function callGemini(args: VlmArgs, model: string): Promise<RawCall> {
  const key = requireKey("GEMINI_API_KEY", "gemini");
  const img = conditionedImage(args.imagePath, VLM_MAX_EDGE);
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
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
  const res = await fetchRetry(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }, { label: `Gemini VLM (${model})` });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text =
    json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return {
    raw: parseLooseArray(text),
    usage: {
      inputTokens: json.usageMetadata?.promptTokenCount ?? null,
      outputTokens: json.usageMetadata?.candidatesTokenCount ?? null,
    },
  };
}

// --- anthropic provider -----------------------------------------------------
// Transcribing a dense page takes minutes; a non-streaming request holds an idle
// connection open the whole time and gets reset by network middleboxes at ~4-5 min
// ("fetch failed"). We STREAM (SSE): continuous deltas keep the socket alive, which
// is Anthropic's own recommendation for long requests. We accumulate the text and
// usage from the event stream, then parse exactly as before.
async function callAnthropic(args: VlmArgs, model: string): Promise<RawCall> {
  const key = requireKey("ANTHROPIC_API_KEY", "anthropic");
  const img = conditionedImage(args.imagePath, VLM_MAX_EDGE);
  const body = {
    model,
    // A dense page grouped into full-text-per-story blocks can run long; give the
    // output budget real headroom so a whole page fits in one response (the 32k
    // ceiling truncated page 1 mid-transcription). Streaming keeps the socket alive.
    max_tokens: 64000,
    stream: true,
    // NB: no `temperature` — deprecated on claude-sonnet-5-class models (400 error).
    // The gemini/openai paths still pin temperature:0; this path relies on the model default.
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
  const res = await fetchRetry("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  }, { label: `Anthropic VLM (${model})` });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const streamed = await readAnthropicStream(res);
  return {
    raw: parseLooseArray(streamed.text),
    usage: streamed.usage,
  };
}

// Consume an Anthropic SSE stream into the full text + token usage. Handles the
// message_start (input tokens), content_block_delta (text_delta chunks), and
// message_delta (output tokens) events; ignores ping/other events.
async function readAnthropicStream(
  res: Response,
): Promise<{ text: string; usage: VlmUsage }> {
  if (!res.body) throw new Error("Anthropic stream returned no body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  function handle(dataLine: string) {
    let evt: any;
    try {
      evt = JSON.parse(dataLine);
    } catch {
      return; // partial/non-JSON data line; skip
    }
    if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
      text += evt.delta.text ?? "";
    } else if (evt.type === "message_start") {
      inputTokens = evt.message?.usage?.input_tokens ?? inputTokens;
    } else if (evt.type === "message_delta") {
      outputTokens = evt.usage?.output_tokens ?? outputTokens;
    } else if (evt.type === "error") {
      throw new Error(`Anthropic stream error: ${JSON.stringify(evt.error ?? evt)}`);
    }
  }

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE events are separated by blank lines; process complete lines only.
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, "");
      buf = buf.slice(nl + 1);
      if (line.startsWith("data:")) handle(line.slice(5).trim());
    }
  }
  if (buf.startsWith("data:")) handle(buf.slice(5).trim());
  return { text, usage: { inputTokens, outputTokens } };
}

// --- openai provider --------------------------------------------------------
async function callOpenAI(args: VlmArgs, model: string): Promise<RawCall> {
  const key = requireKey("OPENAI_API_KEY", "openai");
  const img = conditionedImage(args.imagePath, VLM_MAX_EDGE);
  const body = {
    model,
    temperature: 0,
    // Dense pages can run long; give room, then recover any truncated tail below
    // (parity with the anthropic/gemini paths, which already repair truncation).
    max_tokens: 16000,
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
  const res = await fetchRetry("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  }, { label: `OpenAI VLM (${model})` });
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  // json_object mode wraps the array in {"blocks":[…]}. Parse the object normally;
  // only if it's truncated (throws) fall back to array-tail recovery — same
  // resilience the anthropic/gemini paths have, without breaking the clean case.
  const content = json.choices[0].message.content;
  let raw: unknown;
  try {
    const parsed = JSON.parse(stripCodeFence(content));
    raw = Array.isArray(parsed) ? parsed : (parsed.blocks ?? parsed.objects ?? parsed);
  } catch {
    raw = parseLooseArray(content); // truncated tail → recover the largest valid prefix
  }
  return {
    raw,
    usage: {
      inputTokens: json.usage?.prompt_tokens ?? null,
      outputTokens: json.usage?.completion_tokens ?? null,
    },
  };
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
