-- SLICE-17 — what the AI costs: one row per paid model call.
--
-- Every Claude and Gemini response reports the tokens it used; lib/spend.ts
-- writes them here with WHAT the call was for (the step) and WHERE (page, issue,
-- object, or a patron's edition/podcast), and prices them at the rate in force
-- when the call was made. Rows are never deleted — clearing a page doesn't
-- un-spend the money, so re-ingests and retries all count.
CREATE TABLE IF NOT EXISTS model_calls (
  id                 BIGSERIAL   PRIMARY KEY,
  at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider           TEXT        NOT NULL,          -- anthropic | gemini | openai
  model              TEXT        NOT NULL,
  step               TEXT        NOT NULL,          -- group | transcribe | enrich | title | reextract | summary | chat | edition | podcast-script | podcast-voice | voice-test
  page_record        INTEGER,
  issue_pointer      INTEGER,
  object_id          INTEGER,
  ref                TEXT,                          -- e.g. podcast:<id>, edition:<id>
  input_tokens       INTEGER     NOT NULL DEFAULT 0, -- uncached input (text + images)
  output_tokens      INTEGER     NOT NULL DEFAULT 0, -- includes thinking; audio for TTS
  cache_write_tokens INTEGER     NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER     NOT NULL DEFAULT 0,
  cost_usd           NUMERIC(12,6),                 -- NULL = no price on file for this model
  ms                 INTEGER,
  ok                 BOOLEAN     NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS model_calls_page  ON model_calls (page_record);
CREATE INDEX IF NOT EXISTS model_calls_issue ON model_calls (issue_pointer);
CREATE INDEX IF NOT EXISTS model_calls_at    ON model_calls (at DESC);
