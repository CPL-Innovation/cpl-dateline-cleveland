// SLICE-16 — Your Edition, read aloud.
//
// A finished edition becomes a short audio episode: two hosts (or one narrator)
// talking the patron through their four sections. Three stages, in order:
//
//   SCRIPT (one Claude call). The script is written from the edition's sections
//   and NOTHING else — not the issue's corpus, not the archive. The sections were
//   already held to the issue by edition.ts (citations validated, invented ids
//   dropped); the script is held to the sections. Code, not the model, writes the
//   opening line (paper, date, hosts) and the closing credit. That the voices are
//   AI is said on the patron's page, not on air.
//
//   VOICE (one Gemini TTS call per segment — intro, a segment per section, outro).
//   Segments rather than one long call: a failure costs one segment's retry, not
//   the episode, and the patron's waiting page can count them off.
//
//   MIX. Segments are joined with a short breath of silence into one WAV, and every
//   segment and line gets its start time — the player's chapters and the
//   transcript's moving highlight come from these.
//
// What the endpoint will voice is the rail that matters. It is public and it
// spends the library's Gemini key, so it reads aloud only text this server wrote:
// every section edition.ts emits carries an HMAC over its words (editionSig.ts), and
// a request whose sections don't verify is refused before any spend. A podcast is
// also keyed on its content + voice settings, so the same edition read the same way
// is recorded once and served free after.
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { query } from "./pg.ts";
import { streamMessages, ChatRefused } from "./chat.ts";
import { verifySection } from "./editionSig.ts";
import { withSpend } from "./spend.ts";
import { issueIndex, readReaderCard, EDITION_SECTIONS, type ReaderCard, type Section } from "./edition.ts";
import { synthesize, listTtsModels, wav, isVoice, VOICES, FALLBACK_MODELS, TtsError, type Pcm, type Turn } from "./tts.ts";
import {
  PODCAST_SCRIPT_MODEL, PODCAST_DEFAULT_TTS_MODEL, PODCAST_DIR, PODCAST_CONCURRENCY, PODCAST_TTS_CONCURRENCY,
} from "../config.ts";

const SCRIPT_VERSION = "slice16-v3";

/* ── settings (workbench step 09) ─────────────────────────────────────────── */

export interface Host { name: string; voice: string }
export interface PodcastSettings {
  enabled: boolean;            // offered to patrons at all
  ttsModel: string;
  format: "duo" | "solo";      // two hosts, or one narrator (hosts[0])
  hosts: [Host, Host];
  style: string;               // delivery direction handed to the TTS model
  dailyLimit: number;          // new episodes per day, server-wide (cache hits are free)
}

const DEFAULTS: PodcastSettings = {
  enabled: true,
  ttsModel: PODCAST_DEFAULT_TTS_MODEL,
  format: "duo",
  hosts: [{ name: "Margaret", voice: "Kore" }, { name: "Eddie", voice: "Puck" }],
  style: "Two warm, unhurried public-radio hosts — curious, a little wry, never breathless.",
  dailyLimit: 40,
};

async function getSetting<T>(key: string): Promise<T | null> {
  const r = await query<{ value: T }>("SELECT value FROM app_settings WHERE key=$1", [key]);
  return r.rows[0]?.value ?? null;
}
async function putSetting(key: string, value: unknown) {
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]);
}

export async function podcastSettings(): Promise<PodcastSettings> {
  const s = (await getSetting<Partial<PodcastSettings>>("podcast")) ?? {};
  return { ...DEFAULTS, ...s, hosts: (s.hosts as [Host, Host] | undefined) ?? DEFAULTS.hosts };
}

/** The key in use: the workbench's, else GEMINI_API_KEY from the server's env. */
async function geminiKey(): Promise<{ key: string | null; source: "workbench" | "env" | null }> {
  const k = await getSetting<{ key: string }>("podcast_key");
  if (k?.key) return { key: k.key, source: "workbench" };
  if (process.env.GEMINI_API_KEY) return { key: process.env.GEMINI_API_KEY, source: "env" };
  return { key: null, source: null };
}

export class SettingsRefused extends Error {}

const cleanName = (v: unknown, fallback: string) => {
  const s = typeof v === "string" ? v.replace(/[^\p{L}\p{N} .'-]/gu, "").trim().slice(0, 24) : "";
  return s || fallback;
};

/** Validate a draft from the workbench into settings. Throws on anything unusable. */
function readDraft(base: PodcastSettings, b: any): PodcastSettings {
  const out: PodcastSettings = { ...base, hosts: [{ ...base.hosts[0] }, { ...base.hosts[1] }] };
  if ("enabled" in b) out.enabled = !!b.enabled;
  if ("ttsModel" in b) {
    if (typeof b.ttsModel !== "string" || !/^[a-z0-9][a-z0-9.\-]{2,80}$/i.test(b.ttsModel)) throw new SettingsRefused("that isn't a model id");
    out.ttsModel = b.ttsModel;
  }
  if ("format" in b) {
    if (b.format !== "duo" && b.format !== "solo") throw new SettingsRefused("format is duo or solo");
    out.format = b.format;
  }
  if (Array.isArray(b.hosts)) {
    for (const i of [0, 1] as const) {
      const h = b.hosts[i] ?? {};
      if ("voice" in h) { if (!isVoice(h.voice)) throw new SettingsRefused(`${h.voice} isn't a Gemini voice`); out.hosts[i].voice = h.voice; }
      if ("name" in h) out.hosts[i].name = cleanName(h.name, DEFAULTS.hosts[i].name);
    }
    if (out.hosts[0].name.toLowerCase() === out.hosts[1].name.toLowerCase()) throw new SettingsRefused("the two hosts need different names");
  }
  if ("style" in b) out.style = typeof b.style === "string" ? b.style.trim().slice(0, 400) : "";
  if ("dailyLimit" in b) {
    const n = Math.floor(Number(b.dailyLimit));
    if (!Number.isFinite(n) || n < 0 || n > 10_000) throw new SettingsRefused("the daily limit is a number from 0 to 10000");
    out.dailyLimit = n;
  }
  return out;
}

/** What the workbench shows. The key is never sent back — only where it comes from and its last four. */
export async function settingsView() {
  const [s, k, today, recent] = await Promise.all([
    podcastSettings(), geminiKey(), episodesToday(),
    query(`SELECT p.id, p.status, p.issue_pointer, p.script->>'title' AS title, p.duration_s, p.tts_model, p.error,
                  p.created_at, i.serial, i.sort_date
             FROM edition_podcasts p LEFT JOIN issues i ON i.pointer = p.issue_pointer
            ORDER BY p.created_at DESC LIMIT 8`),
  ]);
  return {
    ...s,
    key: { set: !!k.key, source: k.source, hint: k.key ? `…${k.key.slice(-4)}` : null },
    scriptModel: PODCAST_SCRIPT_MODEL,
    scriptReady: !!process.env.ANTHROPIC_API_KEY,
    voices: VOICES,
    fallbackModels: FALLBACK_MODELS,
    usage: { today, limit: s.dailyLimit },
    available: await availability(),
    recent: recent.rows,
  };
}

export async function saveSettings(b: any) {
  const draft = readDraft(await podcastSettings(), b ?? {});
  if ("apiKey" in (b ?? {})) {
    if (b.apiKey === null || b.apiKey === "") await query("DELETE FROM app_settings WHERE key='podcast_key'");
    else if (typeof b.apiKey === "string" && /^[\w-]{20,200}$/.test(b.apiKey.trim())) await putSetting("podcast_key", { key: b.apiKey.trim() });
    else throw new SettingsRefused("that doesn't look like a Gemini API key");
  }
  const { enabled, ttsModel, format, hosts, style, dailyLimit } = draft;
  await putSetting("podcast", { enabled, ttsModel, format, hosts, style, dailyLimit });
  return settingsView();
}

export async function listModels(draftKey?: string) {
  const key = (typeof draftKey === "string" && draftKey.trim()) || (await geminiKey()).key;
  if (!key) return { live: false, models: FALLBACK_MODELS, error: "No Gemini key yet — these are the defaults." };
  try { return { live: true, models: await listTtsModels(key), error: null }; }
  catch (e) { return { live: false, models: FALLBACK_MODELS, error: (e as Error).message }; }
}

/**
 * The workbench's ▶ Preview and "Test the setup": speak a line or two with a
 * DRAFT of the settings (and, optionally, a draft key) before anything is saved.
 */
export async function testVoice(b: any): Promise<{ audio: Buffer; model: string; ms: number }> {
  const s = readDraft(await podcastSettings(), b ?? {});
  const key = (typeof b?.apiKey === "string" && b.apiKey.trim()) || (await geminiKey()).key;
  if (!key) throw new SettingsRefused("there's no Gemini key to test with — paste one first");
  const only = b?.host === 0 || b?.host === 1 ? (b.host as 0 | 1) : null;
  const [a, z] = s.hosts;
  const turns: Turn[] = only !== null
    ? [{ speaker: s.hosts[only].name, text: `This is ${s.hosts[only].name}, reading your edition of the Brooklyn News.` }]
    : s.format === "solo"
      ? [{ speaker: a.name, text: "Welcome to your edition of the Brooklyn News — February first, nineteen twenty-four. Let's open it up." }]
      : [{ speaker: a.name, text: `Welcome to your edition of the Brooklyn News. I'm ${a.name}.` },
         { speaker: z.name, text: `And I'm ${z.name}. February first, nineteen twenty-four — let's open it up.` }];
  const voices = only !== null ? [s.hosts[only]].map((h) => ({ speaker: h.name, voice: h.voice }))
    : (s.format === "solo" ? [a] : [a, z]).map((h) => ({ speaker: h.name, voice: h.voice }));
  const t = Date.now();
  try {
    const pcm = await withSpend({ step: "voice-test", ref: "workbench" },
      () => synthesize({ key, model: s.ttsModel, turns, voices, style: s.style, label: `Gemini TTS test (${s.ttsModel})` }));
    return { audio: wav(pcm.samples, pcm.rate), model: s.ttsModel, ms: Date.now() - t };
  } catch (e) {
    if (e instanceof TtsError) throw new SettingsRefused(e.message);
    throw e;
  }
}

async function episodesToday(): Promise<number> {
  const r = await query<{ n: number }>(`SELECT count(*)::int AS n FROM edition_podcasts WHERE created_at >= date_trunc('day', now())`);
  return r.rows[0]?.n ?? 0;
}

/** Can a patron make an episode right now, and if not, why — in their terms. */
export async function availability(): Promise<{ available: boolean; reason: string | null }> {
  const s = await podcastSettings();
  if (!s.enabled) return { available: false, reason: "Audio editions are switched off in this reading room." };
  if (!(await geminiKey()).key || !process.env.ANTHROPIC_API_KEY) return { available: false, reason: "Audio editions aren’t set up in this reading room yet." };
  if ((await episodesToday()) >= s.dailyLimit) return { available: false, reason: "Today’s audio editions are all made — try again tomorrow." };
  return { available: true, reason: null };
}

/* ── the request ──────────────────────────────────────────────────────────── */

interface Piece { kicker: string; section: Section }
interface Request { pointer: number; readerCard: ReaderCard; label: string; pieces: Piece[] }

const REGISTER_LENGTH: Record<ReaderCard["register"], { words: number; feel: string }> = {
  quick: { words: 110, feel: "Brisk and light — the gist of each section, a detail or two, then move on." },
  full: { words: 230, feel: "Unhurried — give the names, places and figures the section has." },
  ten: { words: 130, feel: "For a young listener — short sentences, everyday words; explain any old-fashioned word right where it comes up." },
  facts: { words: 140, feel: "Plain and exact — state what the section states; no adjectives, no speculation." },
};

const ROLE_EAR: Record<ReaderCard["role"], string> = {
  local: "a neighbor who lives near where this paper circulated",
  family: "someone tracing family history — say names slowly and exactly as printed",
  researcher: "a researcher — be precise and even-handed",
  curious: "a curious general listener",
  kid: "a young listener",
};

/* ── the script ───────────────────────────────────────────────────────────── */

export interface Line { speaker: 0 | 1; text: string; t0?: number; t1?: number }
export interface Segment { kind: "intro" | "section" | "outro"; section: number | null; title: string; lines: Line[]; t0?: number; t1?: number }
export interface Script { title: string; segments: Segment[]; cast?: string }

function scriptSource(req: Request, issue: { serial: string; dateLabel: string }): string {
  return [
    `THE EDITION: ${issue.serial}, ${spokenDate(issue.dateLabel)} — a personal edition made for ${req.label.replace(/\.$/, "")}.`,
    "",
    ...req.pieces.flatMap((p, i) => [
      `=== SECTION ${i + 1} ===`,
      `PICKED AS: ${p.kicker}`,
      `HEADLINE: ${p.section.headline}`,
      `TEXT: ${p.section.body}`,
      p.section.beyondThisIssue ? `BEYOND THIS ISSUE (outside context, already labelled as such): ${p.section.beyondThisIssue}` : "",
      "",
    ]),
  ].filter((x) => x !== null).join("\n");
}

function scriptInstructions(req: Request, s: PodcastSettings, issue: { serial: string; dateLabel: string }): string {
  const reg = REGISTER_LENGTH[req.readerCard.register];
  const duo = s.format === "duo";
  const [a, z] = s.hosts;
  return [
    `You are writing the script for a short audio episode of the Cleveland Public Library's "Your Edition": a listener's personal edition of ${issue.serial}, ${issue.dateLabel}, read aloud${duo ? ` by two hosts, ${a.name} (speaker 0) and ${z.name} (speaker 1)` : ` by one narrator, ${a.name} (speaker 0)`}.`,
    "",
    "YOUR SOURCE",
    "- The sections in the document above are the ONLY material you have. They were written from the newspaper and checked against it.",
    "- Say nothing the sections don't say: no new names, figures, dates, places, quotes or events. Rephrasing for the ear is the whole job; adding is not.",
    "- 'Beyond this issue' text is outside context. If you use it, a host must flag it as background, not as something the paper said.",
    "",
    "THE LISTENER",
    `- ${ROLE_EAR[req.readerCard.role]}.`,
    `- ${reg.feel}`,
    "",
    "THE SHAPE",
    `- Segments, in order: one "intro" (2–4 lines), then exactly one "section" segment per section (section: 1, 2, …), then one "outro" (2–3 lines).`,
    `- The episode already opens with a line, added for you, that names the paper and its date and introduces ${duo ? "both hosts" : "the narrator"}. Your intro comes right after it: don't repeat any of that — go straight to what this edition holds, and why this listener might like it.`,
    "- The hosts never talk about being AI, or about how the episode or its script was made.",
    `- Each section segment: about ${reg.words} words, ${duo ? "4–8 lines traded between the hosts — real conversation: one leads, the other reacts, asks, or picks up a detail. Not alternating monologues." : "2–5 lines."}`,
    "- Write for the ear: short sentences, numbers and dates as they'd be said aloud ('nineteen twenty-four', 'four thousand two hundred and sixty-one Pearl Road'), abbreviations spelled out.",
    "- No stage directions, sound cues, brackets, emoji or markdown. No citations or ids. Never make the hosts claim to be people or to have been there.",
    "- Do not moralize about the period; describe what the paper says.",
    "- The outro thanks the listener and points them back to the printed page; keep it short.",
    "",
    "OUTPUT — a single JSON object and nothing else:",
    '{"title": "...", "segments": [{"kind": "intro", "section": null, "lines": [{"speaker": 0, "text": "..."}]}, {"kind": "section", "section": 1, "lines": [...]}, ..., {"kind": "outro", "section": null, "lines": [...]}]}',
    "- title: shown on screen, never spoken — under 9 words, written normally (digits for dates), and not just the paper's name.",
    duo ? "" : "- Every line is speaker 0.",
  ].filter(Boolean).join("\n");
}

/** The model's script, made safe to voice. Exported for the tests. */
export function validateScript(raw: string, sections: number, duo: boolean, fallbackTitle: string): Script {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  let o: any = {};
  try { o = JSON.parse(a >= 0 && b > a ? s.slice(a, b + 1) : s); } catch { o = {}; }

  const tidy = (t: unknown) => String(t ?? "")
    .replace(/\[\[?co-\d+\]?\]|\(co-\d+\)|\bco-\d+\b/g, "")   // ids never reach a listener
    .replace(/<[^>]{0,40}>|\[[^\]]{0,40}\]|\*+/g, "")           // nor tags, cues or markdown
    .replace(/\s+([.,;:!?])/g, "$1").replace(/\s+/g, " ").trim().slice(0, 900);
  const lines = (v: unknown): Line[] => (Array.isArray(v) ? v : [])
    .map((l: any) => ({ speaker: (duo && Number(l?.speaker) === 1 ? 1 : 0) as 0 | 1, text: tidy(l?.text) }))
    .filter((l) => l.text).slice(0, 14);

  const segs: any[] = Array.isArray(o.segments) ? o.segments : [];
  const intro = segs.find((x) => x?.kind === "intro");
  const outro = segs.find((x) => x?.kind === "outro");
  const out: Segment[] = [{ kind: "intro", section: null, title: "Opening", lines: lines(intro?.lines).slice(0, 5) }];
  for (let n = 1; n <= sections; n++) {
    const seg = segs.find((x) => x?.kind === "section" && Number(x?.section) === n)
      ?? segs.filter((x) => x?.kind === "section")[n - 1];
    const l = lines(seg?.lines);
    if (!l.length) throw new Error(`the script came back without section ${n}`);
    out.push({ kind: "section", section: n, title: "", lines: l });
  }
  out.push({ kind: "outro", section: null, title: "Closing", lines: lines(outro?.lines).slice(0, 4) });
  const title = tidy(o.title).replace(/^["“]|["”]$/g, "").slice(0, 90) || fallbackTitle;
  return { title, segments: out };
}

/* ── episodes ─────────────────────────────────────────────────────────────── */

export class PodcastRefused extends ChatRefused {}

const newId = () => randomBytes(9).toString("base64url");

/**
 * A patron's request for an episode. Verifies every section, then returns the
 * existing episode for this content if there is one — or starts a new one.
 */
export async function requestPodcast(b: any): Promise<{ id: string; status: string; cached: boolean }> {
  const pointer = Number(b?.pointer);
  if (!pointer) throw new PodcastRefused("pointer required");
  const readerCard = readReaderCard(b?.readerCard);
  const raw = Array.isArray(b?.sections) ? b.sections : [];
  if (!raw.length || raw.length > EDITION_SECTIONS) throw new PodcastRefused(`an episode is made from one to ${EDITION_SECTIONS} sections`);

  const pieces: Piece[] = [];
  for (const x of raw) {
    const sec = x?.section ?? {};
    const section: Section = {
      headline: String(sec.headline ?? ""), body: String(sec.body ?? ""),
      references: Array.isArray(sec.references) ? sec.references.map(String) : [],
      beyondThisIssue: typeof sec.beyondThisIssue === "string" ? sec.beyondThisIssue : null,
      crops: Array.isArray(sec.crops) ? sec.crops : [],
    };
    const kicker = String(x?.kicker ?? "");
    // The rail: only words this server wrote, for this issue, are ever voiced.
    if (!(await verifySection(pointer, kicker, section, x?.sig))) {
      throw new PodcastRefused("this edition can’t be read aloud — one of its sections didn’t come from this reading room. Make the edition again and try once more.");
    }
    pieces.push({ kicker, section });
  }

  const settings = await podcastSettings();
  const label = typeof b?.label === "string" ? b.label.slice(0, 200) : "a reader";
  const hash = contentHash(pointer, readerCard, pieces, settings);

  const have = (await query<{ id: string; status: string }>("SELECT id, status FROM edition_podcasts WHERE content_hash=$1", [hash])).rows[0];
  if (have && have.status !== "failed") {
    // Done, or already on its way: either way, nothing new to spend.
    if (have.status !== "done" || (await audioExists(have.id))) return { id: have.id, status: have.status, cached: true };
  }

  const av = await availability();
  if (!av.available) throw new PodcastRefused(av.reason!);

  const request = { readerCard, label, sections: pieces };
  const snapshot = { ...settings };
  let id: string;
  if (have) {
    id = have.id;
    await query(
      // The script stays: if it was written for these hosts, produce() reuses it.
      `UPDATE edition_podcasts SET status='queued', progress='{}', error=NULL, request=$2, settings=$3,
              tts_model=$4, script_model=$5, created_at=now(), finished_at=NULL WHERE id=$1`,
      [id, JSON.stringify(request), JSON.stringify(snapshot), settings.ttsModel, PODCAST_SCRIPT_MODEL]);
  } else {
    id = newId();
    await query(
      `INSERT INTO edition_podcasts (id, content_hash, issue_pointer, status, request, settings, tts_model, script_model)
       VALUES ($1,$2,$3,'queued',$4,$5,$6,$7)`,
      [id, hash, pointer, JSON.stringify(request), JSON.stringify(snapshot), settings.ttsModel, PODCAST_SCRIPT_MODEL]);
  }
  enqueue(id);
  return { id, status: "queued", cached: false };
}

/** Same edition, same voices → same episode. */
function contentHash(pointer: number, rc: ReaderCard, pieces: Piece[], s: PodcastSettings): string {
  return createHash("sha256").update(JSON.stringify([
    SCRIPT_VERSION, PODCAST_SCRIPT_MODEL, pointer, rc.role, rc.register,
    pieces.map((p) => [p.kicker, p.section.headline, p.section.body, p.section.beyondThisIssue]),
    s.ttsModel, s.format, s.format === "duo" ? s.hosts : [s.hosts[0]], s.style,
  ])).digest("hex");
}

/**
 * Try a failed episode again — with the voice settings as they are NOW, since
 * the usual fix for a failure is staff changing them (a model that went away, a
 * key that needed replacing). If those settings already made this edition, that
 * episode is the answer and its id comes back instead.
 */
export async function retryPodcast(id: string): Promise<{ id: string; status: string }> {
  const r = (await query<any>("SELECT * FROM edition_podcasts WHERE id=$1", [id])).rows[0];
  if (!r) throw new PodcastRefused("there's no such episode");
  if (r.status !== "failed") return { id, status: r.status };
  const av = await availability();
  if (!av.available) throw new PodcastRefused(av.reason!);
  const settings = await podcastSettings();
  const hash = contentHash(r.issue_pointer, r.request.readerCard, r.request.sections, settings);
  if (hash !== r.content_hash) {
    const other = (await query<{ id: string; status: string }>("SELECT id, status FROM edition_podcasts WHERE content_hash=$1", [hash])).rows[0];
    if (other && other.status !== "failed" && (other.status !== "done" || (await audioExists(other.id)))) return other;
    if (other) await query("DELETE FROM edition_podcasts WHERE id=$1", [other.id]);   // a failed twin; this row takes its place
  }
  await query(
    `UPDATE edition_podcasts SET status='queued', progress='{}', error=NULL, finished_at=NULL,
            content_hash=$2, settings=$3, tts_model=$4 WHERE id=$1`,
    [id, hash, JSON.stringify(settings), settings.ttsModel]);
  enqueue(id);
  return { id, status: "queued" };
}

const audioPath = (id: string) => resolve(PODCAST_DIR, `${id.replace(/[^\w-]/g, "")}.wav`);
async function audioExists(id: string) { try { return (await stat(audioPath(id))).size > 44; } catch { return false; } }
export { audioPath };

/** The episode as the patron's page needs it. */
export async function getPodcast(id: string) {
  const r = (await query<any>(
    `SELECT p.*, i.serial, i.sort_date FROM edition_podcasts p LEFT JOIN issues i ON i.pointer = p.issue_pointer WHERE p.id=$1`, [id])).rows[0];
  if (!r) return null;
  const s: PodcastSettings = r.settings;
  const queuePos = r.status === "queued" ? waiting.indexOf(id) + 1 : 0;
  const ix = await issueIndex(r.issue_pointer).catch(() => null);
  return {
    id: r.id, status: r.status, progress: r.progress ?? {}, error: r.error,
    pointer: r.issue_pointer, serial: ix?.serial ?? r.serial, dateLabel: ix?.dateLabel ?? null,
    label: r.request?.label ?? null, register: r.request?.readerCard?.register ?? null,
    // The sections ride along so the transcript can show each one's newsprint.
    sections: (r.request?.sections ?? []).map((p: Piece) => ({ kicker: p.kicker, headline: p.section.headline, references: p.section.references, crops: p.section.crops })),
    script: r.script, queuePosition: queuePos,
    hosts: s.format === "duo" ? s.hosts : [s.hosts[0]], format: s.format,
    ttsModel: r.tts_model, scriptModel: r.script_model,
    durationS: r.duration_s, audioBytes: r.audio_bytes,
    createdAt: r.created_at, finishedAt: r.finished_at,
  };
}

/* ── the runner: a small in-process queue ─────────────────────────────────── */

const waiting: string[] = [];
let running = 0;

function enqueue(id: string) {
  if (!waiting.includes(id)) waiting.push(id);
  pump();
}
function pump() {
  while (running < PODCAST_CONCURRENCY && waiting.length) {
    const id = waiting.shift()!;
    running++;
    withSpend({ ref: `podcast:${id}` }, () => produce(id))
      .catch(async (e) => {
        const m = (e as Error).message;
        console.error(`[podcast ${id}] failed:`, m);
        await query(`UPDATE edition_podcasts SET status='failed', error=$2, finished_at=now() WHERE id=$1`, [id, patronError(e)]).catch(() => {});
      })
      .finally(() => { running--; pump(); });
  }
}

/** A failure, said to a patron. The full message is in the server log. */
function patronError(e: unknown): string {
  const m = (e as Error).message ?? "";
  if (e instanceof TtsError && (e.status === 401 || e.status === 403 || /api key/i.test(m))) return "The library’s voice service turned the request away (its key needs attention). Staff have been told in the log.";
  if (e instanceof TtsError && e.status === 429) return "The voice service is busy right now. Try again in a minute.";
  if (e instanceof TtsError && e.status === 404) return "The voice model this reading room is set to isn’t available. Staff can pick another in the workbench.";
  if (/script/i.test(m)) return "The script didn’t come out right this time. Trying again usually works.";
  return "Something went wrong while recording. Trying again usually works.";
}

/** Server boot: anything mid-flight when the process stopped didn't finish. */
export async function recoverInterrupted() {
  const r = await query(`UPDATE edition_podcasts SET status='failed', error='The recording was interrupted. Try again.', finished_at=now()
                          WHERE status IN ('queued','scripting','voicing','mixing')`);
  if (r.rowCount) console.log(`[podcast] marked ${r.rowCount} interrupted episode(s) failed`);
}

async function setStatus(id: string, status: string, extra: Record<string, unknown> = {}) {
  const cols = Object.keys(extra);
  await query(
    `UPDATE edition_podcasts SET status=$2${cols.map((c, i) => `, ${c}=$${i + 3}`).join("")} WHERE id=$1`,
    [id, status, ...cols.map((c) => (typeof extra[c] === "object" && extra[c] !== null ? JSON.stringify(extra[c]) : extra[c]))]);
}

const MONTH_NAMES: Record<string, string> = {
  JAN: "January", FEB: "February", MAR: "March", APR: "April", MAY: "May", JUN: "June",
  JUL: "July", AUG: "August", SEP: "September", OCT: "October", NOV: "November", DEC: "December",
};
/** "FEB 1 1924" → "February 1, 1924": the line code writes is read aloud as written. */
export const spokenDate = (label: string) =>
  label.replace(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/, (_, m, d, y) => `${MONTH_NAMES[m.toUpperCase()] ?? m} ${d}, ${y}`);

async function produce(id: string) {
  const row = (await query<any>("SELECT * FROM edition_podcasts WHERE id=$1", [id])).rows[0];
  if (!row) return;
  // Every call below is booked to this episode's issue (spend.ts).
  return withSpend({ issuePointer: row.issue_pointer }, () => record(id, row));
}

async function record(id: string, row: any) {
  const s: PodcastSettings = row.settings;
  const req: Request = { pointer: row.issue_pointer, readerCard: row.request.readerCard, label: row.request.label, pieces: row.request.sections };
  const ix = await issueIndex(req.pointer);
  const issue = { serial: ix.serial, dateLabel: ix.dateLabel };
  const duo = s.format === "duo";
  const tag = `[podcast ${id}]`;

  // 1 · the script — kept from an earlier attempt when it was written for these
  // same hosts (a retry after a voice failure shouldn't buy the script twice).
  const [a, z] = s.hosts;
  const castOf = (x: PodcastSettings) => JSON.stringify([x.format, x.hosts[0].name, x.format === "duo" ? x.hosts[1].name : null]);
  let script: Script;
  if (row.script?.segments?.length && row.script.cast === castOf(s)) {
    script = row.script;
    console.log(`${tag} reusing the script from the last attempt`);
  } else {
    await setStatus(id, "scripting", { script: null });
    console.log(`${tag} script · p${req.pointer} · ${req.readerCard.role}/${req.readerCard.register} · ${PODCAST_SCRIPT_MODEL}`);
    let raw = "";
    await streamMessages({
      corpus: scriptSource(req, issue),
      instructions: scriptInstructions(req, s, issue),
      messages: [{ role: "user", content: "Write the episode script." }],
      effort: "medium",
      label: `Anthropic podcast script (${PODCAST_SCRIPT_MODEL})`,
      model: PODCAST_SCRIPT_MODEL,
      step: "podcast-script",
    }, (t) => { raw += t; });
    try { script = validateScript(raw, req.pieces.length, duo, req.pieces[0]?.section.headline ?? "Your edition"); }
    catch (e) {
      console.log(`${tag} unusable script · raw: ${raw.replace(/\s+/g, " ").slice(0, 600)}`);
      throw e;
    }
    script.segments.forEach((seg) => { if (seg.kind === "section") seg.title = req.pieces[seg.section! - 1]?.kicker ?? `Section ${seg.section}`; });

    // Code-written, not model-written: the paper, the date and the hosts, said the
    // same way every time. (That the voices are AI is said on the page, not on air.)
    script.segments[0].lines.unshift({
      speaker: 0,
      text: `This is your edition of ${issue.serial} for ${spokenDate(issue.dateLabel)}, from the Cleveland Public Library. ${duo ? `I’m ${a.name}, and with me is ${z.name}.` : `I’m ${a.name}.`}`,
    });
    script.segments[script.segments.length - 1].lines.push({
      speaker: 0,
      text: `Everything you heard is in ${issue.serial} for ${spokenDate(issue.dateLabel)}. You can read the pages themselves, scan and all, at the Cleveland Public Library.`,
    });
    script.cast = castOf(s);
  }
  await setStatus(id, "voicing", { script, progress: { done: 0, total: script.segments.length } });

  // 2 · the voices
  const { key } = await geminiKey();
  if (!key) throw new TtsError("no Gemini key", 401);
  const hostsUsed = duo ? [a, z] : [a];
  const voices = hostsUsed.map((h) => ({ speaker: h.name, voice: h.voice }));
  // Kids get a slower, brighter read; the rest get the staff's direction as is.
  const style = req.readerCard.role === "kid" ? `${s.style} Speak a little slower and brighter, for a young listener.`.trim() : s.style;
  const pcm: Pcm[] = new Array(script.segments.length);
  let done = 0;
  let next = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: Math.min(PODCAST_TTS_CONCURRENCY, script.segments.length) }, async () => {
    while (next < script.segments.length) {
      const i = next++;
      const seg = script.segments[i];
      // A segment whose lines are all one host's still names both, so the model keeps their voices.
      pcm[i] = await synthesize({
        key, model: s.ttsModel, style, voices,
        turns: seg.lines.map((l) => ({ speaker: hostsUsed[l.speaker]?.name ?? a.name, text: l.text })),
        label: `${tag} segment ${i + 1}/${script.segments.length} (${s.ttsModel})`,
      });
      done++;
      await setStatus(id, "voicing", { progress: { done, total: script.segments.length } });
    }
  }));
  console.log(`${tag} voiced ${script.segments.length} segments in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // 3 · the mix
  await setStatus(id, "mixing");
  const rate = pcm[0].rate;
  if (pcm.some((p) => p.rate !== rate)) throw new Error("segments came back at different sample rates");
  const gap = Math.round(rate * 0.55), lead = Math.round(rate * 0.25);
  const total = lead + pcm.reduce((n, p) => n + p.samples.length, 0) + gap * (pcm.length - 1) + lead;
  const out = new Int16Array(total);
  let at = lead;
  script.segments.forEach((seg, i) => {
    const p = pcm[i].samples;
    out.set(p, at);
    seg.t0 = at / rate;
    seg.t1 = (at + p.length) / rate;
    timeLines(seg);
    at += p.length + gap;
  });
  await mkdir(PODCAST_DIR, { recursive: true });
  const file = wav(out, rate);
  await writeFile(audioPath(id), file);
  await query(
    `UPDATE edition_podcasts SET status='done', script=$2, duration_s=$3, audio_bytes=$4, progress=$5, finished_at=now() WHERE id=$1`,
    [id, JSON.stringify(script), total / rate, file.length, JSON.stringify({ done: script.segments.length, total: script.segments.length })]);
  console.log(`${tag} done · ${(total / rate).toFixed(1)}s · ${(file.length / 1e6).toFixed(1)} MB`);
}

/**
 * Line times within a segment. TTS gives us the segment's length, not each line's,
 * so a line's share is its share of the segment's characters (plus a small fixed
 * cost per turn for the breath between speakers). Close enough to follow along.
 */
export function timeLines(seg: Segment) {
  const t0 = seg.t0 ?? 0, t1 = seg.t1 ?? t0;
  const weight = seg.lines.map((l) => l.text.length + 14);
  const sum = weight.reduce((a, b) => a + b, 0) || 1;
  let t = t0;
  seg.lines.forEach((l, i) => { l.t0 = t; t += ((t1 - t0) * weight[i]) / sum; l.t1 = t; });
}
