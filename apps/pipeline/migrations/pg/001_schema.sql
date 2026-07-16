-- Dateline Cleveland — Postgres + pgvector store for the LIVE per-page ingestion
-- service (SLICE-08). Ports the SLICE-01/02 SQLite schema to Postgres, adds:
--   • an `issues` table (rights source of truth for the server-side gate),
--   • a `page_ingests` table (per-page state → idempotency + status endpoint),
--   • a pgvector `embedding` column on content_objects (population deferred until
--     an embeddings provider is wired; the column + index are ready).
-- Enrichment stays an OVERLAY over immutable raw rows (Principle 4).

CREATE EXTENSION IF NOT EXISTS vector;

-- ── issues: catalog rows (seeded from catalog.json). The rights_status here is
--    the server-side gate's source of truth — the UI cannot bypass it. ──────────
CREATE TABLE IF NOT EXISTS issues (
  pointer       INTEGER PRIMARY KEY,          -- ContentDM record pointer of the compound issue
  collection    TEXT NOT NULL,
  title         TEXT NOT NULL,
  serial        TEXT,
  sort_date     TEXT,
  filetype      TEXT,                          -- cpd | url
  rights_status TEXT NOT NULL DEFAULT 'unknown', -- open | in_copyright | unknown
  rights_label  TEXT,
  page_count    INTEGER
);

-- ── page_ingests: one row per (collection, page_record). The unit of work. ─────
CREATE TABLE IF NOT EXISTS page_ingests (
  id             BIGSERIAL PRIMARY KEY,
  collection     TEXT    NOT NULL,
  issue_pointer  INTEGER,                       -- parent compound issue (nullable)
  issue_id       TEXT    NOT NULL,              -- human issue id (e.g. brooklynnews_1924-02-01)
  page_record    INTEGER NOT NULL,              -- ContentDM page pointer — the idempotency key
  page_number    INTEGER,
  status         TEXT    NOT NULL DEFAULT 'pending', -- pending|running|done|error|blocked
  run_id         TEXT,
  vlm_model      TEXT,
  enrich_model   TEXT,
  object_count   INTEGER NOT NULL DEFAULT 0,
  error          TEXT,
  started_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ,
  UNIQUE (collection, page_record)
);
CREATE INDEX IF NOT EXISTS idx_pi_status ON page_ingests (status);

-- ── content_objects: the raw unit of record (immutable) + enrichment overlay ───
CREATE TABLE IF NOT EXISTS content_objects (
  id                        BIGSERIAL PRIMARY KEY,
  issue_id                  TEXT    NOT NULL,
  page_record               INTEGER NOT NULL,
  seq                       INTEGER NOT NULL,
  object_class              TEXT    NOT NULL,
  role                      TEXT,
  text                      TEXT    NOT NULL,
  region_bbox               JSONB,
  is_publication_content    BOOLEAN NOT NULL DEFAULT TRUE,
  occurrences               INTEGER NOT NULL DEFAULT 1,
  transcription_confidence  REAL,
  run_id                    TEXT    NOT NULL,
  model                     TEXT    NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- enrichment overlay (SLICE-02)
  article_type              TEXT,
  is_advertorial            BOOLEAN,
  is_advertorial_confidence TEXT,
  summary                   TEXT,
  context_hint              TEXT,
  event_type                TEXT,
  tags                      JSONB,
  enrichment_tier           TEXT,
  curation_status           TEXT,
  payload                   JSONB,
  -- pgvector: semantic-search embedding (nullable; populated when a provider is wired)
  embedding                 vector(1536)
);
CREATE INDEX IF NOT EXISTS idx_co_page  ON content_objects (page_record, seq);
CREATE INDEX IF NOT EXISTS idx_co_class ON content_objects (object_class);
CREATE INDEX IF NOT EXISTS idx_co_issue ON content_objects (issue_id);
-- HNSW index for cosine similarity once embeddings exist (safe to create empty).
CREATE INDEX IF NOT EXISTS idx_co_embedding ON content_objects
  USING hnsw (embedding vector_cosine_ops);

-- ── enrichment overlay tables (ported 1:1 from 002_enrichment.sql) ─────────────
CREATE TABLE IF NOT EXISTS topics (
  topic_id    TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  is_promoted BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS object_topics (
  object_id         BIGINT NOT NULL REFERENCES content_objects(id) ON DELETE CASCADE,
  topic_id          TEXT   NOT NULL,
  confidence        TEXT,
  rank              INTEGER NOT NULL DEFAULT 1,
  is_human_override BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (object_id, topic_id)
);

CREATE TABLE IF NOT EXISTS proposed_topics (
  id         BIGSERIAL PRIMARY KEY,
  object_id  BIGINT NOT NULL REFERENCES content_objects(id) ON DELETE CASCADE,
  name       TEXT   NOT NULL,
  confidence TEXT,
  status     TEXT   NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS entities (
  entity_id   TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  name        TEXT NOT NULL,
  attributes  JSONB,
  UNIQUE (entity_type, name)
);

CREATE TABLE IF NOT EXISTS object_entities (
  object_id BIGINT NOT NULL REFERENCES content_objects(id) ON DELETE CASCADE,
  entity_id TEXT   NOT NULL REFERENCES entities(entity_id),
  role      TEXT,
  PRIMARY KEY (object_id, entity_id, role)
);

CREATE TABLE IF NOT EXISTS events (
  event_id         BIGSERIAL PRIMARY KEY,
  source_object_id BIGINT NOT NULL REFERENCES content_objects(id) ON DELETE CASCADE,
  issue_id         TEXT   NOT NULL,
  title            TEXT   NOT NULL,
  event_type       TEXT,
  venue            TEXT,
  start_text       TEXT,
  recurrence_text  TEXT,
  performers       JSONB,
  price_text       TEXT,
  confidence       TEXT
);

CREATE TABLE IF NOT EXISTS provenance (
  id             BIGSERIAL PRIMARY KEY,
  object_id      BIGINT NOT NULL REFERENCES content_objects(id) ON DELETE CASCADE,
  field          TEXT   NOT NULL,
  model          TEXT   NOT NULL,
  prompt_version TEXT   NOT NULL,
  run_id         TEXT   NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ot_topic  ON object_topics (topic_id);
CREATE INDEX IF NOT EXISTS idx_oe_entity ON object_entities (entity_id);
CREATE INDEX IF NOT EXISTS idx_ev_issue  ON events (issue_id);
CREATE INDEX IF NOT EXISTS idx_prov_obj  ON provenance (object_id);
