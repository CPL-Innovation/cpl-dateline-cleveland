-- SLICE-02 enrichment store. Extends the SLICE-01 content_objects store with the
-- Stage-4 overlay: topics, entities, events, and per-field provenance.
-- Shape mirrors data-schema §Core tables / §Cross-cutting tables, minimally —
-- SQLite + JSON columns, NO Postgres/pgvector/embeddings (that is the scale build).
--
-- All raw SLICE-01 columns stay immutable; enrichment is an OVERLAY (Principle 4).
-- Article-only columns are added to content_objects in code (addColumnIfMissing) so
-- re-running is idempotent; the tables below are CREATE ... IF NOT EXISTS.

-- Controlled topic vocabulary (Principle 3: closed vocab + proposed_topics hatch).
CREATE TABLE IF NOT EXISTS topics (
  topic_id    TEXT PRIMARY KEY,          -- slug of name
  name        TEXT NOT NULL UNIQUE,
  is_promoted INTEGER NOT NULL DEFAULT 1  -- 1 = in the controlled vocab; promotions land here too
);

-- M:N object -> topic (≤3 per object, with confidence + rank). object_topics, not
-- article_topics (data-schema v0.3 rename).
CREATE TABLE IF NOT EXISTS object_topics (
  object_id        INTEGER NOT NULL,
  topic_id         TEXT    NOT NULL,
  confidence       TEXT,                  -- honesty gradient: high | medium | low
  rank             INTEGER NOT NULL DEFAULT 1,
  is_human_override INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (object_id, topic_id)
);

-- The open escape hatch (Principle 3/7): a topic the model wanted but the vocab
-- did not carry. A human promotes/remaps/merges/rejects these later.
CREATE TABLE IF NOT EXISTS proposed_topics (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  object_id  INTEGER NOT NULL,
  name       TEXT    NOT NULL,
  confidence TEXT,
  status     TEXT    NOT NULL DEFAULT 'pending'  -- pending | promoted | rejected
);

-- Deduped entities (people/places/orgs; venue/performer/creative_work where they appear).
CREATE TABLE IF NOT EXISTS entities (
  entity_id   TEXT PRIMARY KEY,          -- slug of type + name
  entity_type TEXT NOT NULL,             -- person | place | organization | venue | performer | creative_work
  name        TEXT NOT NULL,
  attributes  TEXT,                      -- JSON, type-specific (nullable)
  UNIQUE (entity_type, name)
);

CREATE TABLE IF NOT EXISTS object_entities (
  object_id INTEGER NOT NULL,
  entity_id TEXT    NOT NULL,
  role      TEXT,                        -- how the entity figures in the object (subject | mentioned | venue | performer …)
  PRIMARY KEY (object_id, entity_id, role)
);

-- The cultural calendar (data-schema §events — likely the crown-jewel asset).
-- Sourced from BOTH articles and event-bearing ads (gap S).
CREATE TABLE IF NOT EXISTS events (
  event_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  source_object_id INTEGER NOT NULL,
  issue_id        TEXT    NOT NULL,
  title           TEXT    NOT NULL,
  event_type      TEXT,                  -- concert|film|theater|race|exhibition|club_engagement|civic|other
  venue           TEXT,
  start_text      TEXT,                  -- as printed ("Sat. Feb 9"); no datetime normalization this slice
  recurrence_text TEXT,
  performers      TEXT,                  -- JSON array of names
  price_text      TEXT,                  -- as printed ("65c")
  confidence      TEXT
);

-- Per-field provenance (data-schema: model/version/prompt/timestamp). One row per
-- enriched field-group per object — you want it when a value looks wrong.
CREATE TABLE IF NOT EXISTS provenance (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  object_id      INTEGER NOT NULL,
  field          TEXT    NOT NULL,       -- e.g. "enrichment", "events"
  model          TEXT    NOT NULL,
  prompt_version TEXT    NOT NULL,
  run_id         TEXT    NOT NULL,
  created_at     TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ot_topic  ON object_topics (topic_id);
CREATE INDEX IF NOT EXISTS idx_oe_entity ON object_entities (entity_id);
CREATE INDEX IF NOT EXISTS idx_ev_issue  ON events (issue_id);
CREATE INDEX IF NOT EXISTS idx_prov_obj  ON provenance (object_id);
