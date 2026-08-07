-- Dateline Cleveland — human transcription overlay (SLICE-09c)
--
-- A curator fixes what the VLM misread. Principle 4 and the workbench header both
-- promise the same thing — edits are an OVERLAY, the raw row is immutable — so the
-- correction does NOT overwrite content_objects.text. It lands beside it:
--
--   text          the machine's read, exactly as transcribed. Never rewritten.
--   text_human    the curator's correction, or NULL when there isn't one.
--   text_edited_at when that correction was made.
--
-- Every reader resolves the pair with COALESCE(text_human, text), which makes
-- "revert to the machine's text" a matter of setting text_human back to NULL —
-- nothing is lost, and the two reads stay comparable forever.
--
-- Idempotent, and applied after 001 by migrate(), which runs every file in this
-- directory in filename order.

ALTER TABLE content_objects
  ADD COLUMN IF NOT EXISTS text_human     TEXT,
  ADD COLUMN IF NOT EXISTS text_edited_at TIMESTAMPTZ;

-- The review dashboard wants "how many objects has a human touched?" cheaply.
CREATE INDEX IF NOT EXISTS idx_objects_text_human
  ON content_objects (page_record) WHERE text_human IS NOT NULL;
