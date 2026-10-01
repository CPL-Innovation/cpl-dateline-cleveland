// Gemini text-to-speech (SLICE-16) — one call in, 16-bit mono PCM out.
//
// Gemini's TTS models speak two request dialects through the same generateContent
// endpoint, and each model accepts exactly one (probed 2026-10-01):
//
//   "transcript"  gemini-2.5-*-preview-tts, gemini-3.1-flash-tts-preview
//                 One text part: a direction line, then "Name: line" per turn.
//                 Per-part speech metadata → 400 "Speech metadata is not supported".
//   "annotated"   gemini-3.8-flash(-lite)-tts
//                 One text part PER TURN, each with speechMetadata {speaker, style}.
//                 The transcript form → 400 "must specify speech_metadata.speaker".
//
// Rather than hardcode which model is which (the workbench lists models live, so
// new ones appear without a deploy), the first call guesses from the name, and a
// 400 naming the other dialect switches it once and is remembered per model.
//
// The audio comes back as either a RIFF WAV (3.8) or headerless little-endian
// L16 with the rate in the mime type (2.5/3.1). Both are reduced to PCM here.
//
// Raw HTTP through fetchRetry, like every other model call in this service.
import { fetchRetry } from "./http.ts";
import { record, geminiUsage } from "./spend.ts";

export interface Turn { speaker: string; text: string }
export interface Voice { speaker: string; voice: string }
export interface Pcm { samples: Int16Array; rate: number }

/** The 30 prebuilt voices, with Google's one-word character for each. */
export const VOICES: Array<{ id: string; character: string }> = [
  { id: "Zephyr", character: "Bright" }, { id: "Puck", character: "Upbeat" }, { id: "Charon", character: "Informative" },
  { id: "Kore", character: "Firm" }, { id: "Fenrir", character: "Excitable" }, { id: "Leda", character: "Youthful" },
  { id: "Orus", character: "Firm" }, { id: "Aoede", character: "Breezy" }, { id: "Callirrhoe", character: "Easy-going" },
  { id: "Autonoe", character: "Bright" }, { id: "Enceladus", character: "Breathy" }, { id: "Iapetus", character: "Clear" },
  { id: "Umbriel", character: "Easy-going" }, { id: "Algieba", character: "Smooth" }, { id: "Despina", character: "Smooth" },
  { id: "Erinome", character: "Clear" }, { id: "Algenib", character: "Gravelly" }, { id: "Rasalgethi", character: "Informative" },
  { id: "Laomedeia", character: "Upbeat" }, { id: "Achernar", character: "Soft" }, { id: "Alnilam", character: "Firm" },
  { id: "Schedar", character: "Even" }, { id: "Gacrux", character: "Mature" }, { id: "Pulcherrima", character: "Forward" },
  { id: "Achird", character: "Friendly" }, { id: "Zubenelgenubi", character: "Casual" }, { id: "Vindemiatrix", character: "Gentle" },
  { id: "Sadachbia", character: "Lively" }, { id: "Sadaltager", character: "Knowledgeable" }, { id: "Sulafat", character: "Warm" },
];
export const isVoice = (v: unknown): v is string => typeof v === "string" && VOICES.some((x) => x.id === v);

/** Offered when the live model list can't be fetched (no key yet, or offline). */
export const FALLBACK_MODELS = [
  { id: "gemini-2.5-flash-preview-tts", label: "Gemini 2.5 Flash Preview TTS" },
  { id: "gemini-2.5-pro-preview-tts", label: "Gemini 2.5 Pro Preview TTS" },
];

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export class TtsError extends Error {
  status?: number;
  constructor(message: string, status?: number) { super(message); this.status = status; }
}

/** Every model the key can reach that speaks (name contains "tts" and serves generateContent). */
export async function listTtsModels(key: string): Promise<Array<{ id: string; label: string }>> {
  const res = await fetchRetry(`${BASE}/models?pageSize=1000`, { headers: { "x-goog-api-key": key } }, { label: "Gemini list models", retries: 1 });
  if (!res.ok) throw new TtsError(await errorText(res), res.status);
  const j = (await res.json()) as { models?: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }> };
  return (j.models ?? [])
    .filter((m) => /tts/i.test(m.name) && (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => ({ id: m.name.replace(/^models\//, ""), label: m.displayName ?? m.name }))
    // Newest family first: "gemini-3.8-…" before "gemini-2.5-…".
    .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
}

type Dialect = "transcript" | "annotated";
const dialects = new Map<string, Dialect>();
const guess = (model: string): Dialect => {
  const v = /gemini-(\d+)\.(\d+)/.exec(model);
  return v && (+v[1] > 3 || (+v[1] === 3 && +v[2] >= 8)) ? "annotated" : "transcript";
};

function body(dialect: Dialect, turns: Turn[], voices: Voice[], style: string) {
  const multi = voices.length > 1;
  const speechConfig = multi
    ? { multiSpeakerVoiceConfig: { speakerVoiceConfigs: voices.map((v) => ({ speaker: v.speaker, voiceConfig: { prebuiltVoiceConfig: { voiceName: v.voice } } })) } }
    : { voiceConfig: { prebuiltVoiceConfig: { voiceName: voices[0].voice } } };
  const parts = dialect === "annotated"
    ? turns.map((t) => ({ text: t.text, speechMetadata: { ...(multi ? { speaker: t.speaker } : {}), ...(style ? { style } : {}) } }))
    : [{
        text: multi
          ? `${style ? `${style}\n` : ""}Read this conversation between ${voices.map((v) => v.speaker).join(" and ")} aloud, exactly as written:\n\n${turns.map((t) => `${t.speaker}: ${t.text}`).join("\n")}`
          : `${style ? `${style}\n` : ""}Read the following aloud, exactly as written:\n\n${turns.map((t) => t.text).join("\n\n")}`,
      }];
  return { contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["AUDIO"], speechConfig } };
}

async function errorText(res: Response): Promise<string> {
  const t = await res.text();
  try { return (JSON.parse(t) as any).error?.message ?? t.slice(0, 300); } catch { return t.slice(0, 300); }
}

/**
 * Speak a run of turns. `voices` holds one entry (a narrator) or two (hosts);
 * every turn's speaker must be one of them. Throws TtsError with the API's own
 * message for anything that isn't transient (a bad key, an unknown model).
 */
export async function synthesize(args: { key: string; model: string; turns: Turn[]; voices: Voice[]; style?: string; label?: string }): Promise<Pcm> {
  const { key, model, turns, voices } = args;
  if (!turns.length) throw new TtsError("nothing to say");
  if (voices.length < 1 || voices.length > 2) throw new TtsError("one or two voices");
  let dialect = dialects.get(model) ?? guess(model);
  let switched = false;
  let emptyRetries = 2;
  for (;;) {
    const res = await fetchRetry(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body(dialect, turns, voices, args.style ?? "")),
    }, { label: args.label ?? `Gemini TTS (${model})`, retries: 3 });

    if (!res.ok) {
      const msg = await errorText(res);
      const other: Dialect = dialect === "annotated" ? "transcript" : "annotated";
      const wantsOther = dialect === "annotated" ? /speech metadata is not supported/i.test(msg) : /speech_metadata/i.test(msg);
      if (res.status === 400 && wantsOther && !switched) { dialect = other; switched = true; continue; }
      throw new TtsError(`Gemini TTS ${res.status}: ${msg}`, res.status);
    }
    dialects.set(model, dialect);

    const j = (await res.json()) as any;
    const part = j.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data);
    record({ provider: "gemini", model, step: "podcast-voice", usage: geminiUsage(j.usageMetadata), ok: !!part });
    if (!part) {
      // A 200 with no audio happens (finishReason OTHER) and is usually a one-off.
      if (emptyRetries-- > 0) continue;
      throw new TtsError(`Gemini TTS returned no audio (finishReason ${j.candidates?.[0]?.finishReason ?? "none"})`);
    }
    return decode(Buffer.from(part.inlineData.data, "base64"), String(part.inlineData.mimeType ?? ""));
  }
}

/** WAV or raw L16 → PCM samples. */
export function decode(buf: Buffer, mime: string): Pcm {
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE") {
    let rate = 24000, bits = 16, channels = 1;
    let off = 12;
    while (off + 8 <= buf.length) {
      const id = buf.toString("ascii", off, off + 4);
      // The data chunk of a streamed WAV can declare a bogus size; trust the buffer.
      const size = Math.min(buf.readUInt32LE(off + 4), buf.length - off - 8);
      if (id === "fmt ") { channels = buf.readUInt16LE(off + 10); rate = buf.readUInt32LE(off + 12); bits = buf.readUInt16LE(off + 22); }
      if (id === "data") {
        if (bits !== 16 || channels !== 1) throw new TtsError(`unexpected WAV format: ${bits}-bit, ${channels} channel(s)`);
        return { samples: int16(buf.subarray(off + 8, off + 8 + size)), rate };
      }
      off += 8 + size + (size % 2);
    }
    throw new TtsError("WAV with no data chunk");
  }
  if (/l16|pcm/i.test(mime)) {
    const rate = Number(/rate=(\d+)/i.exec(mime)?.[1] ?? 24000);
    return { samples: int16(buf), rate };
  }
  throw new TtsError(`unexpected audio type: ${mime || "unknown"}`);
}

function int16(b: Buffer): Int16Array {
  const n = Math.floor(b.length / 2);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = b.readInt16LE(i * 2);
  return out;
}

/** PCM → a playable WAV file. */
export function wav(samples: Int16Array, rate: number): Buffer {
  const data = samples.length * 2;
  const b = Buffer.alloc(44 + data);
  b.write("RIFF", 0, "ascii"); b.writeUInt32LE(36 + data, 4); b.write("WAVE", 8, "ascii");
  b.write("fmt ", 12, "ascii"); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36, "ascii"); b.writeUInt32LE(data, 40);
  Buffer.from(samples.buffer, samples.byteOffset, data).copy(b, 44);
  return b;
}
