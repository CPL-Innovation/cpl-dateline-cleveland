// detect — run box-first layout detectors on a page and look at what they drew
// (SLICE-14). No database, no model spend: this is the eyeball test for choosing
// between detectors before a curator ever sees their boxes.
//
//   npm run detect -- 7618                         # every detector on one page
//   npm run detect -- 7618 7619 --detector pp-doclayout
//
// Writes out/detect/<record>/<detector>.jpg (numbered boxes, coloured by the
// detector's label) and .json (the boxes), and prints one summary line each.
// The page comes from inbox/ when it is there, from ContentDM IIIF otherwise.
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fetchRetry } from "./lib/http.ts";
import { detectBoxes, renderOverlay } from "./lib/detect.ts";
import { CDM_COLLECTION, INBOX_DIR, OUT_DIR, ROOT, DETECTOR_IDS, iiifImageUrl, type DetectorId } from "./config.ts";

const argv = process.argv.slice(2);
const records = argv.filter((a) => /^\d+$/.test(a)).map(Number);
const di = argv.indexOf("--detector");
const detectors: DetectorId[] = di >= 0 ? [argv[di + 1] as DetectorId] : DETECTOR_IDS;

if (!records.length || detectors.some((d) => !DETECTOR_IDS.includes(d))) {
  console.error(`usage: npm run detect -- <record>… [--detector ${DETECTOR_IDS.join("|")}]`);
  process.exit(1);
}

async function pageImage(record: number): Promise<string> {
  const local = resolve(INBOX_DIR, `${CDM_COLLECTION}_${record}_full.jpg`);
  if (existsSync(local)) return local;
  const dir = resolve(ROOT, "scratch", "detect");
  const path = resolve(dir, `${CDM_COLLECTION}_${record}_full.jpg`);
  if (existsSync(path)) return path;
  await mkdir(dir, { recursive: true });
  const res = await fetchRetry(iiifImageUrl(record, "full"), {}, { label: `IIIF full ${record}` });
  if (!res.ok) throw new Error(`IIIF image ${record} → HTTP ${res.status}`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
  return path;
}

for (const record of records) {
  const img = await pageImage(record);
  const dir = resolve(OUT_DIR, "detect", String(record));
  await mkdir(dir, { recursive: true });
  for (const d of detectors) {
    try {
      const det = await detectBoxes(img, d);
      await writeFile(resolve(dir, `${d}.json`), JSON.stringify(det, null, 1));
      await renderOverlay(img, det.boxes, resolve(dir, `${d}.jpg`), 1800);
      const labels: Record<string, number> = {};
      for (const b of det.boxes) labels[b.label] = (labels[b.label] ?? 0) + 1;
      const mix = Object.entries(labels).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
      console.log(`${record}  ${d.padEnd(17)} ${String(det.boxes.length).padStart(4)} boxes  ${String(det.ms).padStart(6)} ms   ${mix}`);
    } catch (e) {
      console.log(`${record}  ${d.padEnd(17)} FAILED  ${(e as Error).message}`);
    }
  }
  console.log(`         → ${dir}`);
}
