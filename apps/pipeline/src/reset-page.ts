// reset-page — take an ingested page back to un-ingested: its transcription and
// every box proposal. The command-line twin of the workbench's ⌫ Clear page…,
// with the same rules (lib/clearPage.ts).
//
//   npm run reset-page -- 7600 7620     # one or more page records
//   npm run reset-page -- 7600 --dry    # report only, write nothing
//
// A page whose transcription carries curator work — corrected text, a review,
// a note, a title, a publication, an accepted re-read or summary, a region
// corrected after transcription — is refused, with what is on it. Clearing that
// is a decision to make looking at the page: use the workbench, which lists the
// work and asks. Boxes drawn in box-first review are not curator work here; they
// are part of the proposal being cleared.
import { closePool } from "./lib/pg.ts";
import { pagePlan, clearPage } from "./lib/clearPage.ts";
import { CDM_COLLECTION } from "./config.ts";

const argv = process.argv.slice(2);
const dry = argv.includes("--dry");
const records = argv.filter((a) => /^\d+$/.test(a)).map(Number);

async function reset(pageRecord: number) {
  const plan = await pagePlan(CDM_COLLECTION, pageRecord);
  if (!plan.status && !plan.proposals.length) return `${pageRecord}: not ingested — nothing to reset`;
  if (plan.work.length) {
    return `${pageRecord}: REFUSED — curator work on it: ${plan.work.map((w) => `${w.n} ${w.label}`).join(", ")}`;
  }
  const what = `${plan.objects} ${plan.mode ?? ""} objects and ${plan.proposals.length} box proposal(s)`;
  if (dry) return `${pageRecord}: would clear ${what}`;
  await clearPage(CDM_COLLECTION, pageRecord, {
    transcription: true,
    boxes: Object.fromEntries(plan.proposals.map((p) => [p.detector, { detector: true, drawn: true }])),
  });
  return `${pageRecord}: cleared ${what} — un-ingested`;
}

async function main() {
  if (!records.length) throw new Error("name at least one page record, e.g. npm run reset-page -- 7600");
  for (const r of records) console.log(await reset(r));
  await closePool();
}

main().catch(async (e) => { console.error("reset-page failed:", (e as Error).message); await closePool(); process.exit(1); });
