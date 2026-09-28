// iiif — what we ask CPL's ContentDM image server for, and how we check we got it.
//
// CPL's ContentDM implements IIIF Image API 2.0 only PARTIALLY, and the gaps are
// silent rather than errors — measured against the live server:
//   • `pct:x,y,w,h` regions are NOT honoured; the response is unrelated geometry.
//   • `!w,h` (best-fit) sizes are NOT honoured; the response is the FULL page.
//   • pixel regions `x,y,w,h` are exact, and `w,` / `,h` sizes are exact.
// Both unsupported forms return HTTP 200 with a perfectly valid JPEG of the wrong
// thing, so there is nothing to catch — the only defence is to use the forms the
// server actually implements, and to check the returned pixel dimensions.
import { fetchRetry } from "./http.ts";

const sizeCache = new Map<string, { w: number; h: number }>();

export async function pageSize(iiifId: string): Promise<{ w: number; h: number }> {
  const hit = sizeCache.get(iiifId);
  if (hit) return hit;
  const res = await fetchRetry(`${iiifId}/info.json`, {}, { label: "IIIF info.json" });
  if (!res.ok) throw new Error(`could not read IIIF info.json (HTTP ${res.status})`);
  const j = (await res.json()) as { width?: number; height?: number };
  if (!j.width || !j.height) throw new Error("IIIF info.json carried no page dimensions");
  const size = { w: j.width, h: j.height };
  sizeCache.set(iiifId, size);
  return size;
}

// A JPEG's real dimensions, straight from its SOF marker. Used to verify the
// server honoured the region rather than quietly handing back the whole page.
export function jpegSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}
