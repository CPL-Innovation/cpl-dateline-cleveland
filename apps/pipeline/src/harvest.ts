// SLICE-06 Part A — harvest ONE Brooklyn News issue LIVE from ContentDM's IIIF
// Image API. This is the pipeline's real front door: instead of reading images a
// human placed in inbox/ by hand, we pull them over the network from CPL's own
// ContentDM (collection p16014coll5), exactly the claim the pitch makes —
// "point it at your existing digitized collection and it works."
//
//   npm run harvest
//
// For each page it fetches:
//   • the FULL-res page image  → inbox/<file>            (the live-VLM pipeline input)
//   • a display-size JPEG       → discovery/public/pages/ (what the reader/workbench show)
//   • the IIIF info.json        → real dimensions + the canonical @id (provenance)
// and writes a committed manifest (PD metadata) recording where every pixel came from.
//
// One item only. No tiling server, no batch, no in-copyright material (Brooklyn
// News is PD). ContentDM already serves IIIF; we consume it.
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fetchRetry } from "./lib/http.ts";
import {
  INBOX_DIR,
  PAGES,
  PAGES_OUT_DIR,
  ISSUE_ID,
  CDM_COLLECTION,
  iiifId,
  iiifImageUrl,
  HARVEST_DISPLAY_SIZE,
} from "./config.ts";

const HARVEST_DIR = resolve(INBOX_DIR, "..", "harvest");

interface IiifInfo {
  "@id": string;
  width: number;
  height: number;
  profile: unknown;
}

interface ManifestPage {
  pageNumber: number;
  pageRecord: number;
  iiifId: string; // canonical IIIF identifier (info.json @id)
  fullImageUrl: string; // full-res request → pipeline input
  displayImageUrl: string; // display-size request → front-end
  displayFile: string; // committed file name under public/pages/
  width: number;
  height: number;
  fullBytes: number;
  displayBytes: number;
}

async function fetchInfo(record: number): Promise<IiifInfo> {
  const res = await fetchRetry(`${iiifId(record)}/info.json`, {}, {
    label: `IIIF info.json ${record}`,
  });
  if (!res.ok) throw new Error(`IIIF info.json ${record} → HTTP ${res.status}`);
  return (await res.json()) as IiifInfo;
}

async function fetchImage(url: string, label: string): Promise<Buffer> {
  const res = await fetchRetry(url, {}, { label });
  if (!res.ok) throw new Error(`${label} → HTTP ${res.status}: ${await res.text()}`);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.startsWith("image/")) {
    throw new Error(`${label} → expected an image, got ${ct}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  await mkdir(INBOX_DIR, { recursive: true });
  await mkdir(PAGES_OUT_DIR, { recursive: true });
  await mkdir(HARVEST_DIR, { recursive: true });

  console.log(
    `Harvesting ${ISSUE_ID} live from ContentDM IIIF (collection ${CDM_COLLECTION})…\n`,
  );

  const pages: ManifestPage[] = [];
  for (const page of PAGES) {
    const info = await fetchInfo(page.pageRecord);

    // 1) full-res → inbox/ (the live-VLM pipeline reads this)
    const fullUrl = iiifImageUrl(page.pageRecord, "full");
    const full = await fetchImage(fullUrl, `full page ${page.pageNumber}`);
    await writeFile(resolve(INBOX_DIR, page.file), full);

    // 2) display-size → discovery/public/pages/ (the reader + workbench show this)
    const displayUrl = iiifImageUrl(page.pageRecord, HARVEST_DISPLAY_SIZE);
    const displayFile = `${CDM_COLLECTION}_${page.pageRecord}.jpg`;
    const display = await fetchImage(displayUrl, `display page ${page.pageNumber}`);
    await writeFile(resolve(PAGES_OUT_DIR, displayFile), display);

    pages.push({
      pageNumber: page.pageNumber,
      pageRecord: page.pageRecord,
      iiifId: info["@id"],
      fullImageUrl: fullUrl,
      displayImageUrl: displayUrl,
      displayFile,
      width: info.width,
      height: info.height,
      fullBytes: full.length,
      displayBytes: display.length,
    });
    console.log(
      `  page ${page.pageNumber} (rec ${page.pageRecord}) ← ${info["@id"]}\n` +
        `    full ${info.width}×${info.height} (${(full.length / 1024).toFixed(0)}KB → inbox/${page.file})\n` +
        `    display ${HARVEST_DISPLAY_SIZE} (${(display.length / 1024).toFixed(0)}KB → public/pages/${displayFile})`,
    );
  }

  const manifest = {
    issueId: ISSUE_ID,
    collection: CDM_COLLECTION,
    source: "ContentDM IIIF Image API 2.0",
    // Fixed stamp so re-harvests of the same issue stay byte-stable in git
    // (the images themselves are the proof of the live pull; the manifest is metadata).
    harvestedFrom: "cdm16014.contentdm.oclc.org",
    displaySize: HARVEST_DISPLAY_SIZE,
    pages,
  };
  await writeFile(
    resolve(HARVEST_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  // A copy beside the display images so the front-end can cite provenance.
  await writeFile(
    resolve(PAGES_OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  console.log(
    `\nHarvested ${pages.length} pages live from ContentDM.\n` +
      `  pipeline input → inbox/ (full-res)\n` +
      `  front-end images → discovery/public/pages/ (${HARVEST_DISPLAY_SIZE}, committed PD)\n` +
      `  provenance → harvest/manifest.json + public/pages/manifest.json`,
  );
}

main().catch((err) => {
  console.error("harvest failed:", err.message);
  process.exit(1);
});
