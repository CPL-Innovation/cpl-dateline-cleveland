-- Dateline Cleveland — curator review state (SLICE-09d)
--
-- Two things a human leaves on an object, both of them theirs alone:
--
--   curation_status  already existed (unreviewed | flagged | reviewed) but nothing
--                    in the workbench ever wrote it — the verdict bar was a mock.
--                    It is now set from a single status dropdown.
--   review_note      free text from the reviewer. Not a transcription and not an
--                    enrichment field: it is a note TO the next human, and it never
--                    reaches the patron-facing surfaces.
--
-- Timestamps are kept per-field rather than one "touched_at", because "when was
-- this confirmed" and "when was this note written" answer different questions.
--
-- Idempotent, applied after 002 by migrate() in filename order.

ALTER TABLE content_objects
  ADD COLUMN IF NOT EXISTS review_note    TEXT,
  ADD COLUMN IF NOT EXISTS review_note_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at    TIMESTAMPTZ;

-- curation_status was written with no constraint behind it. Now that a UI sets it,
-- pin the vocabulary here so a typo in a request body cannot invent a fourth state
-- that every counter and status dot would then silently mis-handle.
UPDATE content_objects
   SET curation_status = 'unreviewed'
 WHERE curation_status IS NULL
    OR curation_status NOT IN ('unreviewed', 'flagged', 'reviewed');

ALTER TABLE content_objects
  DROP CONSTRAINT IF EXISTS content_objects_curation_status_chk;
ALTER TABLE content_objects
  ADD CONSTRAINT content_objects_curation_status_chk
  CHECK (curation_status IN ('unreviewed', 'flagged', 'reviewed'));

-- "Which objects on this page has someone left a note on?" — the review panel and
-- the section list both ask it per page.
CREATE INDEX IF NOT EXISTS idx_objects_review_note
  ON content_objects (page_record) WHERE review_note IS NOT NULL;
