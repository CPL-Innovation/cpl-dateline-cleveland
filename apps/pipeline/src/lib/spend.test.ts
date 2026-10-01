// SLICE-17 — pricing a call from what the API reported.
//   npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { priceOf, anthropicUsage, geminiUsage } from "./spend.ts";

test("Sonnet 5: input, output, cache writes and reads each at their own rate", () => {
  const u = anthropicUsage({ input_tokens: 1_000_000, output_tokens: 100_000, cache_creation_input_tokens: 200_000, cache_read_input_tokens: 500_000 });
  // 1M × $2 + 0.1M × $10 + 0.2M × $2.50 + 0.5M × $0.20
  assert.equal(priceOf("claude-sonnet-5", u), 2 + 1 + 0.5 + 0.1);
});

test("a model with no price on file is unpriced, not free", () => {
  assert.equal(priceOf("gemini-2.5-flash", { input: 10, output: 10, cacheWrite: 0, cacheRead: 0 }), null);
});

test("Gemini TTS is priced at the rate in force on the day of the call", () => {
  const u = { input: 1_000_000, output: 1_000_000, cacheWrite: 0, cacheRead: 0 };
  assert.equal(priceOf("gemini-3.8-flash-tts", u, new Date("2026-10-01T12:00:00Z")), 0.5 + 9);
  assert.equal(priceOf("gemini-3.8-flash-tts", u, new Date("2027-01-01T12:00:00Z")), 1 + 18);
});

test("Gemini usage: audio and thinking are output; cached prompt tokens aren't billed twice", () => {
  assert.deepEqual(
    geminiUsage({ promptTokenCount: 120, cachedContentTokenCount: 20, candidatesTokenCount: 2500, thoughtsTokenCount: 30 }),
    { input: 100, output: 2530, cacheWrite: 0, cacheRead: 20 });
});

test("missing usage counts as zero rather than NaN", () => {
  assert.deepEqual(anthropicUsage(undefined), { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 });
  assert.equal(priceOf("claude-sonnet-5", anthropicUsage(undefined)), 0);
});
