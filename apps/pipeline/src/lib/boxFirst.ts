// boxFirst — the box-first ingestion path, up to curator review (SLICE-14).
//
//   harvest → detect (curator's choice of detector) → group → PROPOSAL (draft)
//
// A proposal is one detector's boxes plus a grouping, for one page, saved as a
// draft while a curator corrects it. Nothing here writes content_objects: a
// page stays un-ingested until the curator transcribes a proposal (a later step).
//
// Per page there can be one proposal PER DETECTOR. Running a second detector
// does not replace the first — both are kept so the curator can compare them,
// and the edit counts on each are how we learn which detector suits these papers.
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fetchRetry } from "./http.ts";
import { query } from "./pg.ts";
import { detectBoxes, detectorAvailable, DETECTOR_INFO, type DetectedBox, type Rect } from "./detect.ts";
import { groupBoxes, normalizeGroups, type BoxGroup } from "./group.ts";
import { assertIngestable, type Progress } from "./ingestPage.ts";
import { ROOT, INBOX_DIR, DETECTOR_IDS, iiifImageUrl, type DetectorId } from "../config.ts";

const PAGES_DIR = resolve(ROOT, "scratch", "pages");
const OVERLAY_DIR = resolve(ROOT, "scratch", "boxfirst");

// A proposal box: the detector's box, plus what the curator has done to it.
//   source     'detector' as drawn, 'human' once a curator drew or moved it
//   discarded  the grouper judged it to hold no publication content; it sits in
//              no group, and the curator can bring it back
export interface ProposalBox extends DetectedBox {
  source: "detector" | "human";
  discarded?: true;
}

export interface Proposal {
  detector: DetectorId;
  detectorLabel: string;
  detectorModel: string;
  detectMs: number | null;
  boxes: ProposalBox[];
  rawBoxCount: number;
  groups: BoxGroup[];
  groupingModel: string | null;
  edits: number;
  status: "draft" | "used" | "superseded";
  updatedAt: string;
}

export class BoxFirstRefused extends Error {}

export interface BoxFirstArgs {
  collection: string;
  issuePointer: number | null;
  issueId: string;
  pageRecord: number;
  pageNumber: number;
  detector: DetectorId;
}

// ── page image ───────────────────────────────────────────────────────────────
// Box-first touches the full-res master several times (each detector, each
// regroup's overview), so it is kept rather than deleted after one pass the way
// page-first's temp file is. scratch/ is gitignored.
export async function pageImage(collection: string, pageRecord: number): Promise<string> {
  const inbox = resolve(INBOX_DIR, `${collection}_${pageRecord}_full.jpg`);
  if (existsSync(inbox)) return inbox;
  const path = resolve(PAGES_DIR, `${collection}_${pageRecord}_full.jpg`);
  if (existsSync(path)) return path;
  await mkdir(PAGES_DIR, { recursive: true });
  const res = await fetchRetry(iiifImageUrl(pageRecord, "full"), {}, { label: `IIIF full ${pageRecord}` });
  if (!res.ok) throw new Error(`IIIF image ${pageRecord} → HTTP ${res.status}`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
  return path;
}

const overlayPath = (collection: string, pageRecord: number, detector: DetectorId) =>
  resolve(OVERLAY_DIR, `${collection}_${pageRecord}_${detector}.jpg`);

// ── detect + group → draft proposal ──────────────────────────────────────────
export async function proposeBoxes(args: BoxFirstArgs, onProgress: Progress = () => {}): Promise<Proposal> {
  const { collection, issuePointer, issueId, pageRecord, pageNumber, detector } = args;
  if (!DETECTOR_IDS.includes(detector)) throw new BoxFirstRefused(`unknown detector "${detector}"`);

  onProgress({ phase: "rights", message: "Checking rights…", pct: 2 });
  await assertIngestable(issuePointer);
  await assertNotIngested(collection, pageRecord);

  // The page is now under box-first review. `status='review'` keeps it out of
  // every "done" count (shelf, dashboard) until a proposal is transcribed.
  await query(
    `INSERT INTO page_ingests (collection, issue_pointer, issue_id, page_record, page_number, status, mode, detector, started_at)
     VALUES ($1,$2,$3,$4,$5,'review','box-first',$6, now())
     ON CONFLICT (collection, page_record)
     DO UPDATE SET status='review', mode='box-first', detector=$6, error=NULL`,
    [collection, issuePointer, issueId, pageRecord, pageNumber, detector],
  );

  onProgress({ phase: "harvest", message: "Fetching the page image…", pct: 8 });
  const img = await pageImage(collection, pageRecord);

  onProgress({ phase: "detect", message: `Detecting boxes with ${DETECTOR_INFO[detector].label}…`, pct: 20 });
  const det = await detectBoxes(img, detector);

  onProgress({ phase: "group", message: `Grouping ${det.boxes.length} boxes into objects…`, pct: 45 });
  const g = await groupBoxes(img, det.boxes, detector, overlayPath(collection, pageRecord, detector));
  if (g.note) onProgress({ phase: "group", message: g.note, pct: 90 });

  const discarded = new Set(g.discarded);
  const boxes: ProposalBox[] = det.boxes.map((b) => ({
    ...b, source: "detector" as const, ...(discarded.has(b.id) ? { discarded: true as const } : {}),
  }));

  // Re-running a detector on the same page starts that detector's proposal over:
  // new raw boxes make the old edit count meaningless, so it resets with them.
  await query(
    `INSERT INTO box_proposals
       (collection, page_record, detector, detector_model, detect_ms, raw_boxes, boxes, groups, grouping_model)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (collection, page_record, detector) DO UPDATE SET
       detector_model=EXCLUDED.detector_model, detect_ms=EXCLUDED.detect_ms,
       raw_boxes=EXCLUDED.raw_boxes, boxes=EXCLUDED.boxes, groups=EXCLUDED.groups,
       grouping_model=EXCLUDED.grouping_model, edits=0, edit_log='[]'::jsonb,
       status='draft', created_at=now(), updated_at=now()`,
    [collection, pageRecord, detector, det.model, det.ms,
     JSON.stringify(det.boxes), JSON.stringify(boxes), JSON.stringify(g.groups), g.model],
  );

  onProgress({
    phase: "done", pct: 100,
    message: `${det.boxes.length} boxes → ${g.groups.length} objects (${(det.ms / 1000).toFixed(1)}s detect, ${(g.ms / 1000).toFixed(1)}s group).`,
  });
  return (await getProposal(collection, pageRecord, detector))!;
}

// Box-first is offered on UN-ingested pages only. Re-ingesting a done page
// deletes its content_objects — and with them any curator edits — so starting
// box-first over a done page is refused here rather than trusted to the UI.
async function assertNotIngested(collection: string, pageRecord: number) {
  const r = await query<{ status: string }>(
    "SELECT status FROM page_ingests WHERE collection=$1 AND page_record=$2", [collection, pageRecord]);
  const st = r.rows[0]?.status;
  if (st === "done") throw new BoxFirstRefused("This page is already ingested — box-first runs on un-ingested pages only.");
  if (st === "running") throw new BoxFirstRefused("This page is being ingested right now.");
}

// ── read ─────────────────────────────────────────────────────────────────────
function toProposal(r: any): Proposal {
  return {
    detector: r.detector,
    detectorLabel: DETECTOR_INFO[r.detector as DetectorId]?.label ?? r.detector,
    detectorModel: r.detector_model,
    detectMs: r.detect_ms,
    boxes: r.boxes,
    rawBoxCount: Array.isArray(r.raw_boxes) ? r.raw_boxes.length : 0,
    groups: r.groups ?? [],
    groupingModel: r.grouping_model,
    edits: r.edits,
    status: r.status,
    updatedAt: r.updated_at,
  };
}

export async function getProposal(collection: string, pageRecord: number, detector: DetectorId): Promise<Proposal | null> {
  const r = await query<any>(
    "SELECT * FROM box_proposals WHERE collection=$1 AND page_record=$2 AND detector=$3",
    [collection, pageRecord, detector]);
  return r.rows[0] ? toProposal(r.rows[0]) : null;
}

// Everything the review screen needs for one page: its ingest state and every
// detector's proposal (most recently touched first — the one to open on).
export async function getProposals(collection: string, pageRecord: number) {
  const st = await query<any>(
    "SELECT status, mode, detector FROM page_ingests WHERE collection=$1 AND page_record=$2", [collection, pageRecord]);
  const r = await query<any>(
    "SELECT * FROM box_proposals WHERE collection=$1 AND page_record=$2 ORDER BY updated_at DESC",
    [collection, pageRecord]);
  return { state: st.rows[0] ?? { status: "pending" }, proposals: r.rows.map(toProposal) };
}

// ── curator save ─────────────────────────────────────────────────────────────
// The curator's working state, saved on every correction. The client sends the
// whole box set and grouping (simple, and a lost save is recovered by the next)
// plus the ops that produced this save — one per correction — which are what
// `edits` counts. The server does not trust the client's shapes: rects are
// clamped, ids de-duplicated, and groups re-validated against the boxes.
export interface EditOp { op: string; box?: number; group?: number; [k: string]: unknown }

export async function saveProposal(args: {
  collection: string; pageRecord: number; detector: DetectorId;
  boxes: ProposalBox[]; groups: BoxGroup[]; ops: EditOp[];
}): Promise<Proposal> {
  const cur = await getProposal(args.collection, args.pageRecord, args.detector);
  if (!cur) throw new BoxFirstRefused("no proposal for this page and detector — run the detector first");
  if (cur.status !== "draft") throw new BoxFirstRefused(`this proposal is ${cur.status}, not a draft — it can no longer change`);

  const boxes = cleanBoxes(args.boxes);
  // placeAll=false: a box the curator left out of every group is a deliberate
  // choice (it will not be transcribed), not a grouper slip to paper over.
  const { groups } = normalizeGroups(boxes, args.groups ?? [], [], false);
  const at = new Date().toISOString();
  const ops = (args.ops ?? []).slice(0, 500).map((o) => ({ ...o, op: String(o.op ?? "edit"), at }));

  await query(
    `UPDATE box_proposals SET boxes=$4, groups=$5, edits=edits+$6,
       edit_log = edit_log || $7::jsonb, updated_at=now()
     WHERE collection=$1 AND page_record=$2 AND detector=$3`,
    [args.collection, args.pageRecord, args.detector,
     JSON.stringify(boxes), JSON.stringify(groups), ops.length, JSON.stringify(ops)],
  );
  await query("UPDATE page_ingests SET detector=$3 WHERE collection=$1 AND page_record=$2 AND status='review'",
    [args.collection, args.pageRecord, args.detector]);
  return (await getProposal(args.collection, args.pageRecord, args.detector))!;
}

function cleanBoxes(input: ProposalBox[]): ProposalBox[] {
  const cl = (n: unknown) => Math.max(0, Math.min(1, Number(n) || 0));
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  const seen = new Set<number>();
  const out: ProposalBox[] = [];
  for (const b of input ?? []) {
    const id = Math.trunc(Number(b.id));
    if (!(id > 0) || seen.has(id) || !Array.isArray(b.rect)) continue;
    const x = cl(b.rect[0]), y = cl(b.rect[1]);
    const w = Math.min(cl(b.rect[2]), 1 - x), h = Math.min(cl(b.rect[3]), 1 - y);
    if (w <= 0 || h <= 0) continue;
    seen.add(id);
    out.push({
      id, rect: [r4(x), r4(y), r4(w), r4(h)] as Rect,
      label: String(b.label ?? "human"),
      conf: typeof b.conf === "number" ? b.conf : null,
      ...(typeof b.order === "number" ? { order: b.order } : {}),
      source: b.source === "human" ? "human" : "detector",
      ...(b.discarded ? { discarded: true as const } : {}),
    });
  }
  return out;
}

// ── regroup ──────────────────────────────────────────────────────────────────
// Ask the grouper again, over the curator's CURRENT boxes (after they fixed the
// geometry, the old grouping may no longer fit). Replaces the grouping; logged
// in edit_log but not counted as a correction — it is the machine's move.
export async function regroup(collection: string, pageRecord: number, detector: DetectorId): Promise<Proposal> {
  const cur = await getProposal(collection, pageRecord, detector);
  if (!cur) throw new BoxFirstRefused("no proposal for this page and detector — run the detector first");
  if (cur.status !== "draft") throw new BoxFirstRefused(`this proposal is ${cur.status}, not a draft`);
  const live = cur.boxes.filter((b) => !b.discarded);
  const img = await pageImage(collection, pageRecord);
  const g = await groupBoxes(img, live, detector, overlayPath(collection, pageRecord, detector));
  if (g.note) throw new Error(g.note);
  const discarded = new Set(g.discarded);
  const boxes = cur.boxes.map((b) => {
    const { discarded: _d, ...rest } = b;
    return b.discarded || discarded.has(b.id) ? { ...rest, discarded: true as const } : rest;
  });
  await query(
    `UPDATE box_proposals SET boxes=$4, groups=$5, grouping_model=$6,
       edit_log = edit_log || $7::jsonb, updated_at=now()
     WHERE collection=$1 AND page_record=$2 AND detector=$3`,
    [collection, pageRecord, detector, JSON.stringify(boxes), JSON.stringify(g.groups), g.model,
     JSON.stringify([{ op: "regroup", at: new Date().toISOString(), model: g.model }])],
  );
  return (await getProposal(collection, pageRecord, detector))!;
}

// ── the detector picker ──────────────────────────────────────────────────────
export function listDetectors() {
  return DETECTOR_IDS.map((id) => ({ id, ...DETECTOR_INFO[id], available: detectorAvailable(id) }));
}
