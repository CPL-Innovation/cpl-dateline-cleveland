-- Dateline Cleveland — curator-set display title (SLICE-09e)
--
-- The overlay that overrides the resolved title. Same posture as text_human: the
-- machine's read stays untouched, the human's answer sits beside it, and clearing
-- the column hands the object back to the automatic rule (see lib/title.ts).
--
-- This is deliberately the EXCEPTION, not the mechanism. The automatic rule
-- already gets ~91% of the corpus right and honestly says "no title" for the rest;
-- this column exists for the handful a curator wants to name specifically.
--
-- Idempotent, applied after 003 by migrate() in filename order.

ALTER TABLE content_objects
  ADD COLUMN IF NOT EXISTS display_title    TEXT,
  ADD COLUMN IF NOT EXISTS display_title_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_objects_display_title
  ON content_objects (page_record) WHERE display_title IS NOT NULL;
