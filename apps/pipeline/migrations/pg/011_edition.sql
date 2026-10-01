-- SLICE-15 — Your Edition: completed sections, cached.
--
-- A card pick is deterministic for a given kind of reader (the card, their
-- register, their role), so the same pick costs a model call once and is free
-- after — which is also what lets a share link, which carries picks and never
-- prose, rebuild the same edition. Free-text sections are never stored.
--
-- A cached section is re-checked against what is published NOW before it is
-- served (lib/edition.ts): a curator withdrawing an item turns every section
-- citing it back into a miss.
CREATE TABLE IF NOT EXISTS edition_sections (
  issue_pointer INTEGER     NOT NULL,
  card_id       TEXT        NOT NULL,
  register      TEXT        NOT NULL,
  role          TEXT        NOT NULL,
  section       JSONB       NOT NULL,   -- {headline, body, references, beyondThisIssue, crops}
  model         TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (issue_pointer, card_id, register, role)
);
