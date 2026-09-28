-- Dateline Cleveland — who decided what an object IS (SLICE-14)
--
-- Page-first ingestion decides object_class while reading the text: one VLM
-- call reads the page and says "this is a legal notice" from its wording as much
-- as its layout. Box-first splits that judgement across three hands:
--
--   grouper      proposes a class from the page LAYOUT, before anything is read,
--                at an overview resolution where body text is not legible;
--   curator      may set the class by hand during review;
--   transcriber  reads the object's boxes at full resolution and classifies it
--                from the TEXT, the way page-first does.
--
-- Precedence: a curator's explicit choice stands; otherwise the transcriber's,
-- because it is the only one that read the words. object_class holds the result.
-- This column records how it was reached, so a disagreement is visible rather
-- than silently resolved:
--
--   classification  { by: 'curator'|'transcriber', grouper, transcriber,
--                     curator?, agreed: boolean }
--
-- NULL for page-first objects, whose class and text come from the same read.
-- Idempotent, applied after 008 by migrate() in filename order.

ALTER TABLE content_objects
  ADD COLUMN IF NOT EXISTS classification JSONB;
