// SLICE-16 — what the podcast step will and won't voice.
//   npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateScript, timeLines, spokenDate } from "./podcast.ts";
import { decode, wav } from "./tts.ts";

const script = (segments: unknown[], title = "Pearl Road, Named") => JSON.stringify({ title, segments });
const lines = (...t: Array<[number, string]>) => t.map(([speaker, text]) => ({ speaker, text }));

test("ids, tags, cues and markdown never reach a listener", () => {
  const s = validateScript(script([
    { kind: "intro", section: null, lines: lines([0, "Hello <laughs> there."]) },
    { kind: "section", section: 1, lines: lines([0, "Lodrick ran a garage [[co-306]] at **4261** Pearl (co-12)."], [1, "[music swells] Really?"]) },
    { kind: "outro", section: null, lines: lines([1, "Goodbye."]) },
  ]), 1, true, "fallback");
  const all = s.segments.flatMap((g) => g.lines.map((l) => l.text)).join(" ");
  assert.ok(!/co-\d|<|\[|\*/.test(all), all);
  assert.equal(s.segments[1].lines[0].text, "Lodrick ran a garage at 4261 Pearl.");
  assert.equal(s.segments[1].lines[1].text, "Really?");
});

test("the shape is enforced: intro, one segment per section in order, outro", () => {
  const s = validateScript('```json\n' + script([
    { kind: "section", section: 2, lines: lines([0, "Two."]) },
    { kind: "section", section: 1, lines: lines([1, "One."]) },
  ]) + "\n```", 2, true, "fallback");
  assert.deepEqual(s.segments.map((g) => [g.kind, g.section]), [["intro", null], ["section", 1], ["section", 2], ["outro", null]]);
  assert.equal(s.segments[1].lines[0].text, "One.");
});

test("a missing section is an error, not a silent gap", () => {
  assert.throws(() => validateScript(script([{ kind: "section", section: 1, lines: lines([0, "One."]) }]), 2, true, "f"), /section 2/);
  assert.throws(() => validateScript("I can't do that", 1, true, "f"), /section 1/);
});

test("one narrator: every line is speaker 0 whatever the model wrote", () => {
  const s = validateScript(script([{ kind: "section", section: 1, lines: lines([1, "A."], [0, "B."]) }]), 1, false, "f");
  assert.deepEqual(s.segments[1].lines.map((l) => l.speaker), [0, 0]);
});

test("line times tile the segment, longer lines longer", () => {
  const seg = { kind: "section" as const, section: 1, title: "", t0: 10, t1: 40, lines: lines([0, "Short."], [1, "A much, much longer line than the first one was."]) as any };
  timeLines(seg);
  assert.equal(seg.lines[0].t0, 10);
  assert.ok(Math.abs(seg.lines[1].t1 - 40) < 1e-9);
  assert.equal(seg.lines[0].t1, seg.lines[1].t0);
  assert.ok(seg.lines[1].t1 - seg.lines[1].t0 > seg.lines[0].t1 - seg.lines[0].t0);
});

test("the code-written lines say the date the way it's spoken", () => {
  assert.equal(spokenDate("Feb 1 1924"), "February 1, 1924");
  assert.equal(spokenDate("UNDATED"), "UNDATED");
});

test("WAV and raw L16 both decode to the same samples", () => {
  const s = Int16Array.from([0, 1, -1, 32767, -32768, 1234]);
  const w = wav(s, 24000);
  assert.deepEqual([...decode(w, "audio/wav").samples], [...s]);
  assert.equal(decode(w, "audio/wav").rate, 24000);
  const raw = w.subarray(44);
  const d = decode(raw, "audio/L16;codec=pcm;rate=24000");
  assert.deepEqual([...d.samples], [...s]);
});
