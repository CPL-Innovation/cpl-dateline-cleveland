// clearPage — take an ingested page back: its transcription, its boxes, or both.
//
// A page holds two kinds of thing a curator may want gone:
//   transcription  its content_objects, with their enrichment (topics, names,
//                  events, provenance go with them by ON DELETE CASCADE) and every
//                  correction made on them since
//   boxes          box-first proposals, one per detector run: the detector's boxes
//                  (including ones a curator moved) and the boxes a curator DREW —
//                  told apart by raw_boxes, which is the detector's output as it
//                  came back and is never edited: a drawn box has an id it lacks
//
// What the page becomes follows from what is left, never from a mode the caller
// names: objects left → still done; proposals left → box-first review, reopened
// on them; nothing left → un-ingested (no page_ingests row), as if never touched.
//
// Two refusals keep a clear from destroying more than the curator meant:
//   - the proposal a transcription was READ FROM cannot lose boxes while that
//     transcription stays; its text would no longer match any box
//   - clearing a transcription that carries curator work needs `acknowledge`,
//     and the plan lists that work so the confirmation can say what goes
import { query, tx } from "./pg.ts";
import { DETECTOR_INFO } from "./detect.ts";
import type { DetectorId } from "../config.ts";

export class ClearRefused extends Error {}

// Work a curator did AFTER transcription. Boxes drawn in box-first review are not
// on this list: they live on in the proposal. A region edited on the transcribed
// page is — setObjectRegion stamps it `editedAt`, which transcription never does.
const WORK: Array<[string, string, string]> = [   // [one, many, condition]
  ["corrected text", "corrected texts", "text_human IS NOT NULL"],
  ["reviewed", "reviewed", "(reviewed_at IS NOT NULL OR curation_status <> 'unreviewed')"],
  ["review note", "review notes", "review_note IS NOT NULL"],
  ["title", "titles", "display_title_at IS NOT NULL"],
  ["published", "published", "is_published"],
  ["accepted re-read", "accepted re-reads", "text_reread_model IS NOT NULL"],
  ["replaced summary", "replaced summaries", "summary_at IS NOT NULL"],
  ["region corrected by hand", "regions corrected by hand", "region_bbox ? 'editedAt'"],
];

export interface ProposalSummary {
  detector: string;
  label: string;
  status: "draft" | "used" | "superseded";
  detectorBoxes: number; // boxes the detector drew, still on the page
  moved: number;         // …of which a curator moved or resized
  drawn: number;         // boxes a curator drew
  groups: number;
  groupingModel: string | null;
}

export interface PagePlan {
  collection: string;
  pageRecord: number;
  status: string | null; // null = not ingested
  mode: string | null;
  detector: string | null;
  objects: number;
  work: Array<{ label: string; n: number }>;
  proposals: ProposalSummary[];
}

function summarize(p: any): ProposalSummary {
  const raw = new Set<number>((p.raw_boxes ?? []).map((b: any) => b.id));
  const boxes: any[] = p.boxes ?? [];
  const fromDetector = boxes.filter((b) => raw.has(b.id));
  return {
    detector: p.detector,
    label: DETECTOR_INFO[p.detector as DetectorId]?.label ?? p.detector,
    status: p.status,
    detectorBoxes: fromDetector.length,
    moved: fromDetector.filter((b) => b.source === "human").length,
    drawn: boxes.length - fromDetector.length,
    groups: (p.groups ?? []).length,
    groupingModel: p.grouping_model ?? null,
  };
}

export async function pagePlan(collection: string, pageRecord: number): Promise<PagePlan> {
  const pi = await query<any>(
    "SELECT status, mode, detector FROM page_ingests WHERE collection=$1 AND page_record=$2", [collection, pageRecord]);
  const counts = await query<Record<string, string>>(
    `SELECT count(*) AS n, ${WORK.map(([, , cond], i) => `count(*) FILTER (WHERE ${cond}) AS w${i}`).join(", ")}
     FROM content_objects WHERE page_record=$1`, [pageRecord]);
  const props = await query<any>(
    "SELECT * FROM box_proposals WHERE collection=$1 AND page_record=$2 ORDER BY created_at", [collection, pageRecord]);
  const c = counts.rows[0];
  return {
    collection, pageRecord,
    status: pi.rows[0]?.status ?? null,
    mode: pi.rows[0]?.mode ?? null,
    detector: pi.rows[0]?.detector ?? null,
    objects: Number(c.n),
    work: WORK.map(([one, many], i) => ({ n: Number(c[`w${i}`]), one, many }))
      .filter((w) => w.n > 0).map((w) => ({ label: w.n === 1 ? w.one : w.many, n: w.n })),
    proposals: props.rows.map(summarize),
  };
}

export interface ClearRequest {
  transcription?: boolean;
  // per detector: which of its boxes to clear. Both → the whole proposal goes.
  boxes?: Record<string, { detector?: boolean; drawn?: boolean }>;
  acknowledge?: boolean; // the curator has seen the work listed in the plan
}

export async function clearPage(collection: string, pageRecord: number, req: ClearRequest) {
  const plan = await pagePlan(collection, pageRecord);
  const clearText = !!req.transcription && plan.objects > 0;
  const boxReq = Object.entries(req.boxes ?? {}).filter(([, w]) => w && (w.detector || w.drawn));
  if (!clearText && !boxReq.length) throw new ClearRefused("nothing selected to clear");
  if (plan.status === "running") throw new ClearRefused("this page is being ingested right now");
  if (clearText && plan.work.length && !req.acknowledge) {
    throw new ClearRefused(`the transcription carries curator work (${plan.work.map((w) => `${w.n} ${w.label}`).join(", ")}) — confirm to clear it`);
  }
  for (const [det] of boxReq) {
    const p = plan.proposals.find((x) => x.detector === det);
    if (!p) throw new ClearRefused(`no ${det} boxes on this page`);
    if (p.status === "used" && plan.objects > 0 && !clearText) {
      throw new ClearRefused(`the transcription was read from the ${p.label} boxes — clear the transcription too, or keep them`);
    }
  }

  const removed = { objects: 0, boxes: 0, proposals: 0 };
  const after = await tx(async (c) => {
    // serialize against a transcription or another clear of the same page
    await c.query("SELECT 1 FROM page_ingests WHERE collection=$1 AND page_record=$2 FOR UPDATE", [collection, pageRecord]);

    if (clearText) {
      const d = await c.query("DELETE FROM content_objects WHERE page_record=$1", [pageRecord]);
      removed.objects = d.rowCount ?? 0;
      // no transcription is made from any proposal now; each can be reviewed again
      await c.query("UPDATE box_proposals SET status='draft', updated_at=now() WHERE collection=$1 AND page_record=$2",
        [collection, pageRecord]);
    }

    for (const [det, which] of boxReq) {
      const r = await c.query<any>(
        "SELECT raw_boxes, boxes, groups, edit_log FROM box_proposals WHERE collection=$1 AND page_record=$2 AND detector=$3",
        [collection, pageRecord, det]);
      const p = r.rows[0];
      if (!p) continue;
      const raw = new Set<number>((p.raw_boxes ?? []).map((b: any) => b.id));
      const boxes: any[] = p.boxes ?? [];
      const goes = (b: any) => (raw.has(b.id) ? !!which.detector : !!which.drawn);
      const keep = boxes.filter((b) => !goes(b));
      removed.boxes += boxes.length - keep.length;
      if (!keep.length) {
        await c.query("DELETE FROM box_proposals WHERE collection=$1 AND page_record=$2 AND detector=$3", [collection, pageRecord, det]);
        removed.proposals++;
        continue;
      }
      // Groups lose the cleared boxes; a group left empty goes. The clear is logged
      // but not counted as an edit — `edits` measures how much a detector needed
      // correcting, and a bulk clear says nothing about that.
      const ids = new Set(keep.map((b) => b.id));
      const groups = (p.groups ?? [])
        .map((g: any) => ({ ...g, boxes: g.boxes.filter((id: number) => ids.has(id)) }))
        .filter((g: any) => g.boxes.length);
      const log = [...(p.edit_log ?? []), {
        op: "clear", at: new Date().toISOString(),
        which: [which.detector && "detector", which.drawn && "drawn"].filter(Boolean),
        removed: boxes.filter(goes).map((b) => b.id),
      }];
      await c.query(
        `UPDATE box_proposals SET boxes=$4, groups=$5, edit_log=$6, updated_at=now()
         WHERE collection=$1 AND page_record=$2 AND detector=$3`,
        [collection, pageRecord, det, JSON.stringify(keep), JSON.stringify(groups), JSON.stringify(log)]);
    }

    // What the page is now follows from what is left.
    const left = await c.query<{ n: string }>("SELECT count(*) AS n FROM content_objects WHERE page_record=$1", [pageRecord]);
    if (Number(left.rows[0].n) > 0) return { status: plan.status, detector: plan.detector };
    const props = await c.query<{ detector: string; grouping_model: string | null }>(
      "SELECT detector, grouping_model FROM box_proposals WHERE collection=$1 AND page_record=$2 ORDER BY created_at",
      [collection, pageRecord]);
    if (!props.rows.length) {
      await c.query("DELETE FROM page_ingests WHERE collection=$1 AND page_record=$2", [collection, pageRecord]);
      return { status: null, detector: null };
    }
    const reopen = props.rows.find((p) => p.detector === plan.detector) ?? props.rows[0];
    await c.query(
      `UPDATE page_ingests SET status='review', mode='box-first', detector=$3, grouping_model=$4,
         object_count=0, run_id=NULL, vlm_model=NULL, enrich_model=NULL, error=NULL, finished_at=NULL
       WHERE collection=$1 AND page_record=$2`,
      [collection, pageRecord, reopen.detector, reopen.grouping_model]);
    return { status: "review", detector: reopen.detector };
  });
  return { ...after, removed };
}
