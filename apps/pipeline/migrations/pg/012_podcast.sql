-- SLICE-16 — Your Edition, read aloud: a finished edition turned into a short
-- two-host audio episode (script by Claude from the edition's own sections,
-- voices by Gemini TTS).
--
-- app_settings: small staff-set configuration the workbench writes (the podcast
-- step's model, voices, switch and Gemini key) plus the server's own signing
-- secret. The key is write-only over HTTP — the API never sends it back, only
-- its last four characters.
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT        PRIMARY KEY,
  value      JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One episode. content_hash covers the signed sections AND the voice settings
-- that shaped it, so the same edition read the same way is made once and served
-- free after; change a voice in the workbench and the next request is a new one.
-- The audio itself is a WAV on disk (data/podcasts/<id>.wav), not a bytea.
CREATE TABLE IF NOT EXISTS edition_podcasts (
  id            TEXT        PRIMARY KEY,
  content_hash  TEXT        NOT NULL UNIQUE,
  issue_pointer INTEGER     NOT NULL,
  status        TEXT        NOT NULL,   -- queued | scripting | voicing | mixing | done | failed
  progress      JSONB       NOT NULL DEFAULT '{}',   -- {done, total} while voicing
  request       JSONB       NOT NULL,   -- {readerCard, label, sections:[{kicker, section}]}
  script        JSONB,                  -- {title, segments:[{kind, section, title, lines:[{speaker, text, t0, t1}], t0, t1}]}
  settings      JSONB       NOT NULL,   -- the voice settings it was made with (no key)
  script_model  TEXT,
  tts_model     TEXT,
  duration_s    REAL,
  audio_bytes   INTEGER,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS edition_podcasts_created ON edition_podcasts (created_at DESC);
