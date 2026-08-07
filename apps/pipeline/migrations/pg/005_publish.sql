-- Dateline Cleveland — publication gate (SLICE-09f)
--
-- Nothing reaches a patron until a human puts it there. `is_published` is the only
-- thing /api/discovery serves on, and it is orthogonal to curation_status: an
-- object can be confirmed but not yet live, or live and later flagged for rework
-- without silently vanishing from the site.
--
-- DEFAULT FALSE, deliberately, and no backfill: every object already in the corpus
-- starts unpublished (Jungu's call — opt in, not opt out). The consequence is
-- explicit and intended: the patron surfaces show NOTHING until a curator publishes,
-- and every future ingest is invisible until someone does the same. That is the
-- "nothing reaches patrons unreviewed" posture, paid for in curation time.
--
-- Idempotent, applied after 004 by migrate() in filename order.

ALTER TABLE content_objects
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- /api/discovery filters on this on every read, across the whole corpus.
CREATE INDEX IF NOT EXISTS idx_objects_published
  ON content_objects (is_published) WHERE is_published;
