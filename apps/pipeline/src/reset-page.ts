// reset-page — clear an ingested page so it can be ingested again, box-first.
//
//   npm run reset-page -- 7600 7620     # one or more page records
//   npm run reset-page -- 7600 --dry    # report only, write nothing
//
// Box-first refuses a page that is already done (boxFirst.ts assertNotIngested),
// because re-ingesting deletes the page's content_objects and every curator edit
// with them. This is the deliberate way past that guard, and it keeps the guard's
// promise: a page carrying ANY curator work — a hand-drawn region, corrected
// text, a review, a note, a title, a publication, an accepted re-read or summary
// — is refused, and says what is on it. Page-first pages that nobody touched are
// what it is for; their objects came from a method that no longer runs.
//
// The page's box_proposals are left alone: they are a detector comparison, and a
// fresh detector run over the page resets its own proposal anyway.
import { query, tx, closePool } from "./lib/pg.ts";
import { CDM_COLLECTION } from "./config.ts";

const argv = process.argv.slice(2);
const dry = argv.includes("--dry");
const records = argv.filter((a) => /^\d+$/.test(a)).map(Number);

const WORK = {
  "hand-drawn regions": "region_bbox->>'source' = 'human'",
  "corrected texts": "text_human IS NOT NULL",
  "reviews": "(reviewed_at IS NOT NULL OR curation_status <> 'unreviewed')",
  "review notes": "review_note IS NOT NULL",
  "titles": "display_title_at IS NOT NULL",
  "publications": "is_published",
  "accepted re-reads": "text_reread_model IS NOT NULL",
  "replaced summaries": "summary_at IS NOT NULL",
};

async function reset(pageRecord: number) {
  const pi = await query<{ mode: string; status: string; object_count: number }>(
    "SELECT mode, status, object_count FROM page_ingests WHERE collection=$1 AND page_record=$2",
    [CDM_COLLECTION, pageRecord]);
  const page = pi.rows[0];
  if (!page) return `${pageRecord}: not ingested — nothing to reset`;
  if (page.status === "running") return `${pageRecord}: REFUSED — being ingested right now`;

  const counts = await query<Record<string, string>>(
    `SELECT ${Object.entries(WORK).map(([k, cond], i) => `count(*) FILTER (WHERE ${cond}) AS w${i}`).join(", ")},
            count(*) AS n
     FROM content_objects WHERE page_record=$1`, [pageRecord]);
  const c = counts.rows[0];
  const work = Object.keys(WORK).map((k, i) => [k, Number(c[`w${i}`])] as const).filter(([, n]) => n > 0);
  if (work.length) {
    return `${pageRecord}: REFUSED — curator work on it: ${work.map(([k, n]) => `${n} ${k}`).join(", ")}`;
  }

  const what = `${c.n} ${page.mode} objects (status ${page.status})`;
  if (dry) return `${pageRecord}: would clear ${what}`;
  await tx(async (t) => {
    // topics, entities, events and provenance go with their objects (ON DELETE CASCADE)
    await t.query("DELETE FROM content_objects WHERE page_record=$1", [pageRecord]);
    await t.query("DELETE FROM page_ingests WHERE collection=$1 AND page_record=$2", [CDM_COLLECTION, pageRecord]);
  });
  return `${pageRecord}: cleared ${what} — ready for box-first`;
}

async function main() {
  if (!records.length) throw new Error("name at least one page record, e.g. npm run reset-page -- 7600");
  for (const r of records) console.log(await reset(r));
  await closePool();
}

main().catch(async (e) => { console.error("reset-page failed:", (e as Error).message); await closePool(); process.exit(1); });
