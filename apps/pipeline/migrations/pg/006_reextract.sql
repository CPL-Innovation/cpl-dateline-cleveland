-- Dateline Cleveland — re-extraction replaces the machine's read (SLICE-09i)
--
-- A re-extraction is a MACHINE read, not a human correction, so it belongs in
-- `text` rather than the `text_human` overlay — putting it in the overlay would
-- attribute Sonnet's transcription to a curator, and would leave `text` holding a
-- read everyone has agreed is wrong.
--
-- `text` is therefore no longer write-once, and the superseded read is NOT kept
-- (Jungu's call — overwrite outright). The consequence is explicit and intended:
-- once an object is re-extracted, the original ingestion transcription is gone and
-- only a re-ingest of the page could produce it again. The workbench header's
-- "raw immutable" now means "raw is not edited by humans", not "raw never changes".
--
-- What IS recorded is which model produced the text an object currently holds:
--
--   text_reread_model  the model whose read is in `text` now (NULL = ingestion's).
--   text_reread_at     when it replaced the previous read.
--
-- Without these the workbench's credit line ("transcribed by anthropic/…") would
-- name the ingestion model for text a different model wrote. The object's own
-- `model` / `run_id` columns are left alone: they answer "where did this object
-- come from", not "who wrote the text it holds now".
--
-- Idempotent, applied after 005 by migrate() in filename order.

ALTER TABLE content_objects
  ADD COLUMN IF NOT EXISTS text_reread_model TEXT,
  ADD COLUMN IF NOT EXISTS text_reread_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_objects_reread
  ON content_objects (page_record) WHERE text_reread_at IS NOT NULL;
