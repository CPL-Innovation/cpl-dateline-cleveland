// Live-wiring probe: run ONE page through the selected live provider and print a
// summary. No DB writes. Cheap way to confirm an API key + the HTTP path work.
//   VLM_PROVIDER=gemini npm run probe          (defaults to page 1 / rec 7618)
//   VLM_PROVIDER=anthropic VLM_MODEL=... npm run probe 7621
import { resolve } from "node:path";
import { vlmExtract } from "./lib/vlmExtract.ts";
import { INBOX_DIR, PAGES, VLM_PROVIDER, VLM_MODEL } from "./config.ts";

async function main() {
  const rec = Number(process.argv[2] ?? 7618);
  const page = PAGES.find((p) => p.pageRecord === rec);
  if (!page) throw new Error(`unknown page record ${rec}`);

  console.log(`Probing ${VLM_PROVIDER}/${VLM_MODEL} on page ${page.pageNumber} (rec ${rec})…`);
  const t0 = process.hrtime.bigint();
  const { blocks } = await vlmExtract({
    imagePath: resolve(INBOX_DIR, page.file),
    pageRecord: rec,
    pageNumber: page.pageNumber,
  });
  const secs = Number(process.hrtime.bigint() - t0) / 1e9;

  const dist: Record<string, number> = {};
  for (const b of blocks) dist[b.object_class] = (dist[b.object_class] ?? 0) + 1;

  console.log(`\n✓ ${blocks.length} blocks in ${secs.toFixed(1)}s`);
  console.log("class distribution:", JSON.stringify(dist));
  console.log("\nfirst 12 blocks in reading order:");
  for (const b of blocks.slice(0, 12)) {
    const title = b.text.split("\n")[0].slice(0, 70);
    console.log(`  ${b.object_class.padEnd(20)} ${title}`);
  }
}

main().catch((err) => {
  console.error("probe failed:", err.message);
  process.exit(1);
});
