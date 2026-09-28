-- Dateline Cleveland — how a page's objects were made, stated by every writer
--
-- 008 added page_ingests.mode with a DEFAULT of 'page-first', which was true
-- when page-first was the only way in. It stopped being true twice: JSON import
-- never set a mode, so imported pages were recorded as page-first; and page-first
-- is now retired, so a default naming it would label every future writer that
-- forgets to say otherwise with a method that no longer runs.
--
--   page-first  whole-page VLM read + OCR anchoring. Historical: the pages it
--               made are kept as they are (curators corrected them by hand) and
--               nothing writes this value any more.
--   box-first   detect → group → curator review → per-group crop transcription.
--   import      objects supplied as JSON by a person; no model read the page.
--
-- The default goes, so a writer that does not name its mode fails loudly rather
-- than recording a false one. Idempotent, applied after 009 by migrate().

UPDATE page_ingests SET mode = 'import'
 WHERE vlm_model = 'imported' AND mode = 'page-first';

ALTER TABLE page_ingests ALTER COLUMN mode DROP DEFAULT;

DO $$ BEGIN
  ALTER TABLE page_ingests ADD CONSTRAINT page_ingests_mode_chk
    CHECK (mode IN ('page-first', 'box-first', 'import'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
