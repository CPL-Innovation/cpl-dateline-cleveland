// SLICE-15 acceptance #5 — an invented citation id never renders.
//   npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSection } from "./edition.ts";

const corpus = new Set([269, 306, 312]);   // the ids actually handed to the model

test("a forced bad id is dropped; real ones survive", () => {
  const raw = JSON.stringify({
    headline: "Tires, and a trick",
    body: "Loesch put in balloon tires [[co-306]] and a made-up shop sold radios [[co-99999]].",
    references: ["co-269", "co-99999", "co-12345", "co-306"],
    beyond_this_issue: null,
  });
  const s = validateSection(raw, corpus, "fallback");
  assert.deepEqual(s.references, ["co-269", "co-306"]);
  assert.ok(!s.body.includes("[["), "citation marks never reach the prose");
  assert.ok(!JSON.stringify(s).includes("99999"), "the invented id appears nowhere");
});

test("a section whose citations are all invented has none left", () => {
  const s = validateSection('{"headline":"x","body":"y","references":["co-1","co-2"]}', corpus, "fallback");
  assert.deepEqual(s.references, []);   // → rendered as "Nothing in this issue matched that", not counted
});

test("fenced or chatty output still parses; beyond-this-issue is held to one sentence", () => {
  const raw = 'Here you go:\n```json\n{"headline":"","body":"b","references":["co-312"],"beyond_this_issue":"Beyond this issue: A balloon tire was a low-pressure tire. It was new then."}\n```';
  const s = validateSection(raw, corpus, "The kicker");
  assert.equal(s.headline, "The kicker");
  assert.deepEqual(s.references, ["co-312"]);
  assert.equal(s.beyondThisIssue, "A balloon tire was a low-pressure tire.");
});

test("unparseable output yields no citations rather than a crash", () => {
  const s = validateSection("I'm sorry, I can't", corpus, "k");
  assert.deepEqual(s.references, []);
});

test("ids written into the prose are lifted out — and still checked", () => {
  const raw = JSON.stringify({
    headline: "Prices",
    body: "Back issues were 10c (co-269). Gas was 24c (co-306, co-99999), and a dance cost 65c co-312.",
    references: [],
  });
  const s = validateSection(raw, corpus, "k");
  assert.equal(s.body, "Back issues were 10c. Gas was 24c, and a dance cost 65c.");
  assert.deepEqual(s.references, ["co-269", "co-306", "co-312"]);
});

