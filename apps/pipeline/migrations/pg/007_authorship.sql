-- Dateline Cleveland — provenance attributes WORDS, not approval (SLICE-13b)
--
-- Two fields were attributing a model's words to a person. Accepting an AI
-- suggestion committed through the same route as a hand-typed one, so:
--
--   • a summary rewritten by claude-sonnet-5 landed in `summary` with nothing
--     recording that a model wrote it, and
--   • a title drafted by claude-haiku-4-5 and kept verbatim landed in
--     `display_title`, which lib/title.ts reads as titleSource:'human'.
--
-- That conflates APPROVAL with AUTHORSHIP. A curator clicking KEEP IT has
-- approved the words; they have not written them. Approval already has a home —
-- `curation_status` (003) — and provenance is not it.
--
-- The rule this migration enforces, mirroring 006's treatment of re-extraction:
-- a machine redoing a machine field stays attributed to the machine, and the
-- columns say WHICH machine and WHEN.
--
--   summary_model        the model whose words are in `summary` now
--                        (NULL = the ingestion enrichment pass wrote it).
--   summary_at           when that rewrite replaced the previous summary.
--   display_title_model  the model that drafted the title held in `display_title`
--                        (NULL = a person typed or edited those words).
--
-- Naming follows text_reread_model / text_reread_at from 006 rather than
-- inventing a parallel convention. `display_title_at` (004) already records the
-- when, so the title needs only the model column.
--
-- Deliberately NOT added: an 'ai-assisted' provenance value. The whole point is
-- to stop provenance doubling as an approval flag; a third value would re-create
-- the ambiguity in a new spelling. After this, `human` means a person wrote the
-- words — nothing more, nothing less. text_human (002) and curator-drawn regions
-- stay human, because they genuinely are.
--
-- Idempotent, applied after 006 by migrate() in filename order.

ALTER TABLE content_objects
  ADD COLUMN IF NOT EXISTS summary_model       TEXT,
  ADD COLUMN IF NOT EXISTS summary_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS display_title_model TEXT;

CREATE INDEX IF NOT EXISTS idx_objects_summary_rewritten
  ON content_objects (page_record) WHERE summary_at IS NOT NULL;
