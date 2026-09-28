-- Dateline Cleveland — box-first ingestion (SLICE-14)
--
-- A second way to ingest a page, chosen by a curator per page. Page-first (the
-- original path) has the VLM read the whole page and OCR locate each object
-- afterwards. Box-first reverses it:
--
--   detect boxes → auto-group → CURATOR REVIEW → read each box from its own
--   full-res crop → join per group → enrich → persist
--
-- The same enrichment and persistence run either way; what differs is where the
-- words and the geometry come from, so that is what these columns record.
--
-- page_ingests gains:
--   mode            'page-first' | 'box-first' — how this page's objects were made.
--   detector        which detector drew the boxes (box-first only).
--   grouping_model  the model that proposed the grouping (box-first only).
--
-- box_proposals holds a detector's boxes and their grouping for ONE page, while a
-- curator works on them and after. One row per (page, detector): a curator can
-- run a second detector on the same page and switch between the two, and both
-- are kept, because comparing detectors is the point of offering more than one.
--
--   raw_boxes   the detector's output exactly as it came back. Never edited —
--               it is the baseline the curator's corrections are measured from.
--   boxes       the working set: raw_boxes as the curator has corrected them.
--   groups      [{ id, boxes:[box ids in reading order], object_class, role }],
--               the groups themselves in page reading order. NULL until grouped.
--   edits       how many corrections the curator made — the comparison metric:
--               the detector a curator has to fix least is the better one here.
--   edit_log    [{ op, at, … }] one entry per correction, so the count can be
--               broken down (moved vs added vs deleted vs regrouped) later.
--   status      draft (in review) | used (transcribed into content_objects) |
--               superseded (another detector's proposal was used for the page).
--
-- Region provenance for box-first objects: region_bbox keeps its shape
-- ({ rects, source, … }) but stores EVERY rect of the object — they were checked
-- by a person, so they are not the anchoring noise that made 09 keep only one —
-- with source 'detector:<id>', or 'human' where a curator drew or moved the box.
--
-- Idempotent, applied after 007 by migrate() in filename order.

ALTER TABLE page_ingests
  ADD COLUMN IF NOT EXISTS mode           TEXT NOT NULL DEFAULT 'page-first',
  ADD COLUMN IF NOT EXISTS detector       TEXT,
  ADD COLUMN IF NOT EXISTS grouping_model TEXT;

CREATE TABLE IF NOT EXISTS box_proposals (
  id              BIGSERIAL PRIMARY KEY,
  collection      TEXT        NOT NULL,
  page_record     INTEGER     NOT NULL,
  detector        TEXT        NOT NULL,
  detector_model  TEXT        NOT NULL,
  detect_ms       INTEGER,
  raw_boxes       JSONB       NOT NULL,
  boxes           JSONB       NOT NULL,
  groups          JSONB,
  grouping_model  TEXT,
  edits           INTEGER     NOT NULL DEFAULT 0,
  edit_log        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  status          TEXT        NOT NULL DEFAULT 'draft',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (collection, page_record, detector)
);

CREATE INDEX IF NOT EXISTS idx_bp_page ON box_proposals (collection, page_record);
