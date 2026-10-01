// SLICE-17 — what the AI costs.
//
// Every paid model call reports its token usage here (record), and this writes it
// to model_calls priced at the rate in force (config.ts MODEL_PRICES). Call sites
// say only WHAT the call was (its step) and hand over the response's usage; WHERE
// it belongs — which page, issue, object, edition or podcast — comes from a
// context the server route opens around the work (withSpend), carried through
// every await by AsyncLocalStorage. So the grouper, the transcriber and the
// enricher don't each need a page_record threaded down to them.
//
// Recording never breaks the call it records: it's fire-and-forget, and a write
// that fails is logged and dropped. A call made outside any context (a CLI
// script) is still recorded, just without a page.
import { AsyncLocalStorage } from "node:async_hooks";
import { query } from "./pg.ts";
import { MODEL_PRICES } from "../config.ts";

export interface SpendContext {
  pageRecord?: number | null;
  issuePointer?: number | null;
  objectId?: number | null;
  ref?: string | null;
  /** Renames the step for everything inside — a curator's re-read goes through
   *  the same transcription call as ingestion, but it isn't ingestion. */
  step?: string;
}

const store = new AsyncLocalStorage<SpendContext>();

export function withSpend<T>(ctx: SpendContext, fn: () => Promise<T>): Promise<T> {
  return store.run({ ...(store.getStore() ?? {}), ...ctx }, fn);
}

export interface Usage { input: number; output: number; cacheWrite: number; cacheRead: number }

/** Anthropic's `usage`, from a response or from a stream's message_start + message_delta. */
export function anthropicUsage(u: any): Usage {
  return {
    input: Number(u?.input_tokens) || 0,
    output: Number(u?.output_tokens) || 0,
    cacheWrite: Number(u?.cache_creation_input_tokens) || 0,
    cacheRead: Number(u?.cache_read_input_tokens) || 0,
  };
}

/** Gemini's `usageMetadata`. Cached prompt tokens are reported inside the prompt count. */
export function geminiUsage(u: any): Usage {
  const cached = Number(u?.cachedContentTokenCount) || 0;
  return {
    input: Math.max(0, (Number(u?.promptTokenCount) || 0) - cached),
    output: (Number(u?.candidatesTokenCount) || 0) + (Number(u?.thoughtsTokenCount) || 0),
    cacheWrite: 0,
    cacheRead: cached,
  };
}

/** USD for a call, or null when no price is on file for the model. Exported for the tests. */
export function priceOf(model: string, u: Usage, at = new Date()): number | null {
  const day = at.toISOString().slice(0, 10);
  const p = MODEL_PRICES
    .filter((x) => x.model === model && (!x.from || x.from <= day))
    .sort((a, b) => (b.from ?? "").localeCompare(a.from ?? ""))[0];
  if (!p) return null;
  const usd = (u.input * p.input + u.output * p.output
    + u.cacheWrite * (p.cacheWrite ?? p.input) + u.cacheRead * (p.cacheRead ?? p.input)) / 1e6;
  return Math.round(usd * 1e6) / 1e6;
}

const unpriced = new Set<string>();

/** Record one call. Never throws, never waits. */
export function record(args: { provider: string; model: string; step: string; usage: Usage; ms?: number; ok?: boolean }) {
  const ctx = store.getStore() ?? {};
  const step = ctx.step ?? args.step;
  const cost = priceOf(args.model, args.usage);
  if (cost === null && !unpriced.has(args.model)) {
    unpriced.add(args.model);
    console.warn(`[spend] no price on file for ${args.model} — its calls are recorded unpriced (add it to MODEL_PRICES)`);
  }
  query(
    `INSERT INTO model_calls (provider, model, step, page_record, issue_pointer, object_id, ref,
                              input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, cost_usd, ms, ok)
     VALUES ($1,$2,$3,$4,
             COALESCE($5, (SELECT issue_pointer FROM page_ingests WHERE page_record = $4 LIMIT 1)),
             $6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [args.provider, args.model, step, ctx.pageRecord ?? null, ctx.issuePointer ?? null, ctx.objectId ?? null, ctx.ref ?? null,
     args.usage.input, args.usage.output, args.usage.cacheWrite, args.usage.cacheRead, cost,
     args.ms != null ? Math.round(args.ms) : null, args.ok ?? true],
  ).catch((e) => console.warn(`[spend] couldn't record a ${step} call: ${(e as Error).message}`));
}

/* ── reading it back ──────────────────────────────────────────────────────── */

/** Which part of the service a step belongs to. */
export const STEP_GROUP: Record<string, "ingest" | "curation" | "patron" | "staff"> = {
  group: "ingest", transcribe: "ingest", enrich: "ingest",
  title: "curation", reextract: "curation", summary: "curation",
  chat: "patron", edition: "patron", "podcast-script": "patron", "podcast-voice": "patron",
  "voice-test": "staff",
};

const SUMS = `count(*)::int AS calls,
  COALESCE(sum(cost_usd), 0)::float AS cost,
  count(*) FILTER (WHERE cost_usd IS NULL)::int AS unpriced,
  COALESCE(sum(input_tokens), 0)::bigint AS input, COALESCE(sum(output_tokens), 0)::bigint AS output,
  COALESCE(sum(cache_read_tokens), 0)::bigint AS cache_read, COALESCE(sum(cache_write_tokens), 0)::bigint AS cache_write`;

const num = (r: any) => ({
  calls: r.calls, cost: Number(r.cost), unpriced: r.unpriced,
  input: Number(r.input), output: Number(r.output), cacheRead: Number(r.cache_read), cacheWrite: Number(r.cache_write),
});

/** One page: every call that was made for it, by step. */
export async function pageSpend(record: number) {
  const [steps, span] = await Promise.all([
    query<any>(`SELECT step, model, ${SUMS} FROM model_calls WHERE page_record = $1 GROUP BY step, model ORDER BY cost DESC`, [record]),
    query<any>(`SELECT min(at) AS first, max(at) AS last, ${SUMS} FROM model_calls WHERE page_record = $1`, [record]),
  ]);
  const s = span.rows[0];
  const ingest = steps.rows.filter((r) => STEP_GROUP[r.step] === "ingest").reduce((t, r) => t + Number(r.cost), 0);
  return {
    record, first: s.first, last: s.last, ...num(s), ingestCost: ingest,
    steps: steps.rows.map((r) => ({ step: r.step, model: r.model, group: STEP_GROUP[r.step] ?? "other", ...num(r) })),
  };
}

/** The whole service: totals, by part, by issue, by page, by day. */
export async function spendSummary() {
  const [total, byStep, byIssue, byPage, byDay, unpricedModels] = await Promise.all([
    query<any>(`SELECT min(at) AS first, ${SUMS} FROM model_calls`),
    query<any>(`SELECT step, ${SUMS} FROM model_calls GROUP BY step ORDER BY cost DESC`),
    query<any>(`SELECT m.issue_pointer AS pointer, i.serial, i.sort_date, i.page_count,
                  count(DISTINCT m.page_record) FILTER (WHERE m.step IN ('group','transcribe','enrich'))::int AS pages,
                  COALESCE(sum(m.cost_usd) FILTER (WHERE m.step IN ('group','transcribe','enrich')), 0)::float AS ingest,
                  COALESCE(sum(m.cost_usd) FILTER (WHERE m.step IN ('title','reextract','summary')), 0)::float AS curation,
                  COALESCE(sum(m.cost_usd) FILTER (WHERE m.step IN ('chat','edition','podcast-script','podcast-voice')), 0)::float AS patron,
                  ${SUMS}
             FROM model_calls m LEFT JOIN issues i ON i.pointer = m.issue_pointer
            WHERE m.issue_pointer IS NOT NULL
            GROUP BY m.issue_pointer, i.serial, i.sort_date, i.page_count ORDER BY cost DESC`),
    query<any>(`SELECT m.page_record AS record, m.issue_pointer AS pointer, pi.page_number AS page, i.serial, i.sort_date,
                  (SELECT count(*) FROM content_objects co WHERE co.page_record = m.page_record)::int AS objects,
                  COALESCE(sum(m.cost_usd) FILTER (WHERE m.step = 'group'), 0)::float AS "group",
                  COALESCE(sum(m.cost_usd) FILTER (WHERE m.step = 'transcribe'), 0)::float AS transcribe,
                  COALESCE(sum(m.cost_usd) FILTER (WHERE m.step = 'enrich'), 0)::float AS enrich,
                  COALESCE(sum(m.cost_usd) FILTER (WHERE m.step IN ('title','reextract','summary')), 0)::float AS curation,
                  max(m.at) AS last,
                  ${SUMS}
             FROM model_calls m
             LEFT JOIN page_ingests pi ON pi.page_record = m.page_record
             LEFT JOIN issues i ON i.pointer = m.issue_pointer
            WHERE m.page_record IS NOT NULL
            GROUP BY m.page_record, m.issue_pointer, pi.page_number, i.serial, i.sort_date
            ORDER BY last DESC LIMIT 200`),
    query<any>(`SELECT to_char(date_trunc('day', at), 'YYYY-MM-DD') AS day, ${SUMS}
             FROM model_calls WHERE at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`),
    query<any>(`SELECT DISTINCT model FROM model_calls WHERE cost_usd IS NULL`),
  ]);
  // The question this exists to answer: what does ingesting a page cost?
  const ingested = byPage.rows.filter((r) => Number(r.group) + Number(r.transcribe) + Number(r.enrich) > 0);
  const perPage = ingested.map((r) => Number(r.group) + Number(r.transcribe) + Number(r.enrich)).sort((a, b) => a - b);
  return {
    total: { first: total.rows[0].first, ...num(total.rows[0]) },
    perPage: perPage.length ? {
      pages: perPage.length,
      mean: perPage.reduce((a, b) => a + b, 0) / perPage.length,
      median: perPage[Math.floor(perPage.length / 2)],
      min: perPage[0], max: perPage[perPage.length - 1],
    } : null,
    byStep: byStep.rows.map((r) => ({ step: r.step, group: STEP_GROUP[r.step] ?? "other", ...num(r) })),
    byIssue: byIssue.rows.map((r) => ({
      pointer: r.pointer, serial: r.serial, sortDate: r.sort_date, pageCount: r.page_count, pages: r.pages,
      ingest: Number(r.ingest), curation: Number(r.curation), patron: Number(r.patron), ...num(r),
    })),
    byPage: byPage.rows.map((r) => ({
      record: r.record, pointer: r.pointer, page: r.page, serial: r.serial, sortDate: r.sort_date, objects: r.objects,
      group: Number(r.group), transcribe: Number(r.transcribe), enrich: Number(r.enrich), curation: Number(r.curation),
      last: r.last, ...num(r),
    })),
    byDay: byDay.rows.map((r) => ({ day: r.day, ...num(r) })),
    unpricedModels: unpricedModels.rows.map((r) => r.model),
  };
}
