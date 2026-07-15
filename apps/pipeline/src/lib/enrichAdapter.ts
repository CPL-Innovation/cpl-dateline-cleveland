// enrichAdapter — the single adapter behind which the enrichment model lives
// (same spine as vlmExtract). Callers never know which provider ran.
//   fixture   — replay a session-model enrichment committed under fixtures/enrichment/.
//   anthropic — Claude enrichment call.
//   gemini    — Gemini enrichment call.
//   openai    — GPT enrichment call.
// Input is TEXT (already transcribed), so there is no image conditioning here.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ENRICH_PROVIDER,
  ENRICH_MODEL,
  FIXTURES_DIR,
} from "../config.ts";
import {
  SYSTEM_PROMPT,
  buildHeavyPrompt,
  CONTROLLED_TOPICS,
  type Enrichment,
} from "./enrich-prompt.ts";

export interface EnrichArgs {
  issueId: string;
  pageRecord: number;
  seq: number;
  objectClass: string;
  role: string | null;
  text: string;
}

export interface EnrichResult {
  enrichment: Enrichment;
  model: string;
  provider: string;
}

// The stable per-object key used to look enrichment up in the fixture map.
export function objectKey(pageRecord: number, seq: number): string {
  return `${pageRecord}:${seq}`;
}

// One fixture file per issue: { "<pageRecord>:<seq>": Enrichment, … }.
let fixtureCache: Record<string, Enrichment> | null = null;
async function loadFixtureMap(issueId: string): Promise<Record<string, Enrichment>> {
  if (fixtureCache) return fixtureCache;
  const path = resolve(FIXTURES_DIR, "enrichment", `${issueId}.json`);
  fixtureCache = JSON.parse(await readFile(path, "utf8"));
  return fixtureCache!;
}

export async function enrichObject(args: EnrichArgs): Promise<EnrichResult> {
  let enrichment: Enrichment;
  switch (ENRICH_PROVIDER) {
    case "anthropic":
      enrichment = validate(await callAnthropic(args));
      break;
    case "gemini":
      enrichment = validate(await callGemini(args));
      break;
    case "openai":
      enrichment = validate(await callOpenAI(args));
      break;
    case "fixture":
    default: {
      const map = await loadFixtureMap(args.issueId);
      const found = map[objectKey(args.pageRecord, args.seq)];
      if (!found) {
        throw new Error(
          `no enrichment fixture for object ${objectKey(args.pageRecord, args.seq)} ` +
            `(${args.objectClass}) — the fixture is the session model's Stage-4 pass; add it or route this object capture_only.`,
        );
      }
      enrichment = validate(found);
    }
  }
  return { enrichment, model: ENRICH_MODEL, provider: ENRICH_PROVIDER };
}

// Like enrichObject, but returns null instead of throwing when a fixture entry is
// absent. Used to ROUTE ads: an ad is heavy only if the model/fixture judges it
// event-bearing (gap S). In fixture mode a missing entry means "not event-bearing
// → light"; real providers always call the model and never return null here.
export async function enrichObjectOptional(
  args: EnrichArgs,
): Promise<EnrichResult | null> {
  if (ENRICH_PROVIDER === "fixture") {
    const map = await loadFixtureMap(args.issueId);
    if (!map[objectKey(args.pageRecord, args.seq)]) return null;
  }
  return enrichObject(args);
}

function requireKey(name: string, provider: string): string {
  const key = process.env[name];
  if (!key) {
    throw new Error(
      `ENRICH_PROVIDER=${provider} requires ${name}. Set it in .env (see README).`,
    );
  }
  return key;
}

// --- anthropic --------------------------------------------------------------
async function callAnthropic(args: EnrichArgs): Promise<unknown> {
  const key = requireKey("ANTHROPIC_API_KEY", "anthropic");
  const body = {
    model: ENRICH_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: promptFor(args) }],
  };
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
  return parseObject(json.content.map((c) => c.text ?? "").join(""));
}

// --- gemini -----------------------------------------------------------------
async function callGemini(args: EnrichArgs): Promise<unknown> {
  const key = requireKey("GEMINI_API_KEY", "gemini");
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${ENRICH_MODEL}:generateContent?key=${key}`;
  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: promptFor(args) }] }],
    generationConfig: {
      temperature: 0,
      response_mime_type: "application/json",
      maxOutputTokens: 4096,
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
  return parseObject(text);
}

// --- openai -----------------------------------------------------------------
async function callOpenAI(args: EnrichArgs): Promise<unknown> {
  const key = requireKey("OPENAI_API_KEY", "openai");
  const body = {
    model: ENRICH_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: promptFor(args) },
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
  return parseObject(json.choices[0].message.content);
}

function promptFor(args: EnrichArgs): string {
  return buildHeavyPrompt({
    objectClass: args.objectClass,
    role: args.role,
    text: args.text,
  });
}

function stripCodeFence(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function parseObject(text: string): unknown {
  const body = stripCodeFence(text);
  const start = body.indexOf("{");
  if (start < 0) throw new Error("no JSON object found in enrichment output");
  return JSON.parse(body.slice(start));
}

// --- validation (guards every provider) -------------------------------------
const TOPIC_SET = new Set<string>(CONTROLLED_TOPICS);

function validate(raw: unknown): Enrichment {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("enrichment must be a JSON object");
  }
  const o = raw as Record<string, unknown>;
  const topics = Array.isArray(o.topics) ? o.topics : [];
  for (const t of topics) {
    const name = (t as { name?: unknown }).name;
    if (typeof name !== "string" || !TOPIC_SET.has(name)) {
      throw new Error(`enrichment carries an off-vocab topic: ${String(name)}`);
    }
  }
  return {
    enrichment_tier: (o.enrichment_tier as Enrichment["enrichment_tier"]) ?? undefined,
    topics: topics as Enrichment["topics"],
    proposed_topic: typeof o.proposed_topic === "string" ? o.proposed_topic : null,
    tags: Array.isArray(o.tags) ? (o.tags as string[]) : [],
    article_type: (o.article_type as Enrichment["article_type"]) ?? null,
    is_advertorial: o.is_advertorial === true,
    is_advertorial_confidence:
      (o.is_advertorial_confidence as Enrichment["is_advertorial_confidence"]) ?? "medium",
    entities: Array.isArray(o.entities) ? (o.entities as Enrichment["entities"]) : [],
    summary: typeof o.summary === "string" ? o.summary : "",
    context_hint: typeof o.context_hint === "string" ? o.context_hint : null,
    event_type: (o.event_type as Enrichment["event_type"]) ?? null,
    is_event_bearing: o.is_event_bearing === true,
    events: Array.isArray(o.events) ? (o.events as Enrichment["events"]) : [],
  };
}
