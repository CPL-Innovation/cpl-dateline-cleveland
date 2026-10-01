// SLICE-16 — a signature on every section Your Edition writes.
//
// The podcast endpoint is public and spends the library's Gemini key, so it voices
// only words this server wrote. edition.ts signs each section as it hands it to a
// patron (cache hits too); podcast.ts verifies before any spend. The signature
// covers the issue, the card's words and the section's text and citations —
// change any of them and it no longer verifies.
//
// The secret is generated once and kept in app_settings, so signatures survive a
// restart (a patron's half-made edition stays voiceable across a deploy).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { query } from "./pg.ts";

export interface SignedContent {
  headline: string;
  body: string;
  beyondThisIssue: string | null;
  references: string[];
}

let secret: Buffer | null = null;
async function signingSecret(): Promise<Buffer> {
  if (secret) return secret;
  const read = async () => (await query<{ value: { hex: string } }>("SELECT value FROM app_settings WHERE key='edition_secret'")).rows[0]?.value;
  let v = await read();
  if (!v) {
    // First writer wins, so two processes booting together agree on one secret.
    await query(`INSERT INTO app_settings (key, value) VALUES ('edition_secret', $1) ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify({ hex: randomBytes(32).toString("hex") })]);
    v = await read();
  }
  secret = Buffer.from(v!.hex, "hex");
  return secret;
}

const canonical = (pointer: number, kicker: string, s: SignedContent) =>
  JSON.stringify([pointer, kicker, s.headline, s.body, s.beyondThisIssue ?? null, s.references]);

export async function signSection(pointer: number, kicker: string, s: SignedContent): Promise<string> {
  return createHmac("sha256", await signingSecret()).update(canonical(pointer, kicker, s)).digest("base64url");
}

export async function verifySection(pointer: number, kicker: string, s: SignedContent, sig: unknown): Promise<boolean> {
  if (typeof sig !== "string") return false;
  const want = Buffer.from(await signSection(pointer, kicker, s));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
