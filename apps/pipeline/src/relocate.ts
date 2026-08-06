// relocate — re-derive region_bbox for pages ALREADY in Postgres, using OCR
// anchoring instead of the VLM's estimate. No model calls, no re-transcription:
// the text in content_objects is already good, only the geometry was wrong.
//
//   npm run relocate             # every page with status='done'
//   npm run relocate -- 7618     # one page record (repeatable)
//   npm run relocate -- --dry    # report only, write nothing
//   npm run relocate -- --force  # ALSO overwrite regions a curator corrected by hand
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fetchRetry } from "./lib/http.ts";
import { locateObjects } from "./lib/ocrAnchor.ts";
import { query } from "./lib/pg.ts";
import { CDM_COLLECTION, iiifImageUrl, OCR_ENABLED } from "./config.ts";

const argv = process.argv.slice(2);
const dry = argv.includes("--dry");
const force = argv.includes("--force");
const only = argv.filter((a) => /^\d+$/.test(a)).map(Number);

async function relocatePage(pageRecord: number) {
  const all = await query<{ id: number; text: string; region_bbox: any }>(
    "SELECT id, text, region_bbox FROM content_objects WHERE page_record=$1 ORDER BY seq", [pageRecord],
  );
  // Regions a curator corrected by hand are NOT the machine's to overwrite. Since
  // human edits land in region_bbox itself (the chosen design), the source stamp is
  // what protects them — skip them here unless --force explicitly says otherwise.
  const isHuman = (b: any) => {
    const r = typeof b === "string" ? JSON.parse(b) : b;
    return r && r.source === "human";
  };
  const held = force ? [] : all.rows.filter((o) => isHuman(o.region_bbox));
  const objs = { rows: force ? all.rows : all.rows.filter((o) => !isHuman(o.region_bbox)) };
  if (!objs.rows.length) {
    return { pageRecord, located: 0, total: 0, held: held.length, skipped: held.length ? "all human-corrected" : "no objects" };
  }

  const tmp = resolve(tmpdir(), `relocate_${pageRecord}.jpg`);
  try {
    const res = await fetchRetry(iiifImageUrl(pageRecord, "full"), {}, { label: `IIIF full ${pageRecord}` });
    if (!res.ok) throw new Error(`IIIF ${pageRecord} → HTTP ${res.status}`);
    await writeFile(tmp, Buffer.from(await res.arrayBuffer()));

    const { regions, meanConf, columns } = locateObjects(tmp, objs.rows.map((o) => o.text));
    let located = 0;
    for (let i = 0; i < objs.rows.length; i++) {
      const r = regions[i];
      if (r) located++;
      if (!dry) {
        await query("UPDATE content_objects SET region_bbox=$1 WHERE id=$2",
          [r ? JSON.stringify(r) : null, objs.rows[i].id]);
      }
    }
    return { pageRecord, located, total: objs.rows.length, held: held.length, meanConf, columns };
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

async function main() {
  if (!OCR_ENABLED) {
    console.error("OCR_ENABLED=0 — nothing to do. Unset it to run region anchoring.");
    process.exit(1);
  }
  let records = only;
  if (!records.length) {
    const r = await query<{ page_record: number }>(
      "SELECT page_record FROM page_ingests WHERE collection=$1 AND status='done' ORDER BY page_record",
      [CDM_COLLECTION],
    );
    records = r.rows.map((x) => x.page_record);
  }
  if (!records.length) {
    console.log("No ingested pages found.");
    return;
  }
  console.log(`Relocating regions for ${records.length} page(s)${dry ? " (dry run)" : ""}…\n`);
  let totLocated = 0, totAll = 0;
  for (const rec of records) {
    try {
      const out = await relocatePage(rec);
      totLocated += out.located; totAll += out.total;
      const pct = out.total ? Math.round((out.located / out.total) * 100) : 0;
      console.log(
        `  p${rec}: ${out.located}/${out.total} located (${pct}%)` +
        (out.meanConf !== undefined ? ` · OCR conf ${out.meanConf} · ${out.columns} columns` : ` · ${out.skipped}`) +
        (out.held ? ` · ${out.held} human-corrected, left alone` : ""),
      );
    } catch (e) {
      console.error(`  p${rec}: FAILED — ${(e as Error).message}`);
    }
  }
  console.log(`\n${totLocated}/${totAll} regions located overall${dry ? " (nothing written)" : ""}.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
