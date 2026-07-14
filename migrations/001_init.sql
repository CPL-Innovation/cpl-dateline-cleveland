-- SLICE-01 minimal store. Store shape is FIXED by SLICE-01 §"Store shape".
-- Resist adding fields — anything richer is the cathedral, not this slice.

CREATE TABLE IF NOT EXISTS content_objects (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id                 TEXT    NOT NULL,
  page_record             INTEGER NOT NULL,          -- 7618..7621
  seq                      INTEGER NOT NULL,          -- reading-order index within the page
  object_class            TEXT    NOT NULL,
  role                     TEXT,
  text                     TEXT    NOT NULL,
  region_bbox             TEXT,                        -- nullable JSON [x,y,w,h]
  is_publication_content  INTEGER NOT NULL DEFAULT 1,  -- bool; 0 for filler_slug / manuscript_annotation
  occurrences             INTEGER NOT NULL DEFAULT 1,  -- filler-collapse count
  transcription_confidence REAL,                       -- nullable
  run_id                   TEXT    NOT NULL,
  model                    TEXT    NOT NULL,
  created_at               TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_co_page ON content_objects (page_record, seq);
CREATE INDEX IF NOT EXISTS idx_co_class ON content_objects (object_class);
CREATE INDEX IF NOT EXISTS idx_co_run ON content_objects (run_id);
