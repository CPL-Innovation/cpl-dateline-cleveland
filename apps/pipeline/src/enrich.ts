// SLICE-02 run command: Stage-4 tiered enrichment over the SLICE-01 content_objects.
//   route by object_class -> enrich heavy (adapter) -> overlay topics/entities/events.
// Run: npm run enrich    (ENRICH_PROVIDER=fixture by default; =anthropic with a key)
//
// The cost lever (data-schema §Enrichment routing): ~75% of the issue is
// ads/filler and NEVER touches the enrichment model. Routing happens first.
import { openDb } from "./lib/db.ts";
import {
  enrichObject,
  enrichObjectOptional,
  type EnrichResult,
} from "./lib/enrichAdapter.ts";
import {
  CONTROLLED_TOPICS,
  type Enrichment,
  type LightPayload,
} from "./lib/enrich-prompt.ts";
import { ISSUE_ID, ENRICH_PROVIDER, ENRICH_PROMPT_VERSION } from "./config.ts";

type Tier = "heavy" | "light" | "structured" | "capture_only";

const RUN_ID = `${ENRICH_PROMPT_VERSION}_${ENRICH_PROVIDER}_run1`;
// Fixture runs keep a fixed stamp; a LIVE run is dated honestly (Principle 5).
const CREATED_AT =
  ENRICH_PROVIDER === "fixture"
    ? "2026-07-14T00:00:00Z"
    : new Date().toISOString().slice(0, 10) + "T00:00:00Z";

// Classes that never touch the enrichment model (data-schema §routing).
const CAPTURE_ONLY = new Set([
  "filler_slug",
  "manuscript_annotation",
  "masthead", // issue-level metadata is Stage 1.5's job, not article enrichment
  "illustration", // text-first image policy: caption already transcribed; entity-linking deferred
  "caption",
]);
const STRUCTURED = new Set(["classified_section", "legal_notice"]);

interface CObj {
  id: number;
  page_record: number;
  seq: number;
  object_class: string;
  role: string | null;
  text: string;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Deterministic light extraction (the cheap tier for retail/service ads + coupons).
// Advertiser + phone are reliably parseable from the transcription; ad_category is a
// model judgement left to the real-provider path (kept null here, honestly).
function deterministicLight(text: string): LightPayload {
  const firstLine = (text.split("\n").find((l) => l.trim()) ?? "").trim();
  const advertiser = firstLine.split(/ — |[.:]| - /)[0].trim().slice(0, 80) || null;
  const phoneMatch = text.match(/\b(?:Lincoln|LINC\.?)\s*[\d][\d-]*[A-Z]?\b/i);
  const addrMatch = text.match(/\b\d{3,5}\s+[A-Z][A-Za-z.]+(?:\s+[A-Z][A-Za-z.]+){0,3}\s+(?:Rd|Road|Ave|Avenue|St|Street|Blvd)\b/);
  const prices = [...text.matchAll(/\$[\d,]+(?:\.\d\d)?|\b\d{1,3}c\b/g)].map((m) => m[0]);
  return {
    advertiser,
    ad_category: null,
    contact_phone: phoneMatch ? phoneMatch[0] : null,
    address: addrMatch ? addrMatch[0] : null,
    prices: [...new Set(prices)].slice(0, 8),
    is_event_bearing: false,
  };
}

// Structured payload for listings/legal (typed rows are the value; here we capture
// the shape + keep raw immutable — deep typed-row extraction is the real-model path).
function structuredPayload(o: CObj): Record<string, unknown> {
  if (o.object_class === "classified_section") {
    const m = o.text.match(/\n([\s\S]*?)\n\s*\n/);
    const categories = (m ? m[1] : "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      listing_type: "classified_directory",
      banner: (o.text.split("\n")[0] || "").trim(),
      categories,
      category_count: categories.length,
      exclude_from_fulltext: false,
    };
  }
  // legal_notice
  const t = o.text.toLowerCase();
  const legalType = t.includes("bond")
    ? "bond_schedule"
    : t.includes("financial statement") || t.includes("assets")
      ? "financial_statement"
      : "resolution";
  return {
    structured_type: legalType,
    is_low_value_fulltext: legalType !== "resolution",
    exclude_from_fulltext: false,
  };
}

async function main() {
  const db = openDb();

  // Seed the controlled topic vocabulary (Principle 3).
  const seedTopic = db.prepare(
    "INSERT OR IGNORE INTO topics (topic_id, name, is_promoted) VALUES (?, ?, 1)",
  );
  for (const name of CONTROLLED_TOPICS) seedTopic.run(slug(name), name);

  // Idempotent re-run: clear the overlay, keep raw content_objects untouched.
  for (const t of [
    "object_topics",
    "object_entities",
    "events",
    "proposed_topics",
    "provenance",
    "entities",
  ]) {
    db.exec(`DELETE FROM ${t}`);
  }
  db.exec(
    `UPDATE content_objects SET article_type=NULL, is_advertorial=NULL,
       is_advertorial_confidence=NULL, summary=NULL, context_hint=NULL,
       event_type=NULL, tags=NULL, enrichment_tier=NULL, curation_status=NULL,
       payload=NULL`,
  );

  const objs = db
    .prepare(
      `SELECT id, page_record, seq, object_class, role, text
       FROM content_objects WHERE issue_id = ? ORDER BY page_record, seq`,
    )
    .all(ISSUE_ID) as unknown as CObj[];

  // Prepared writers -------------------------------------------------------
  const setTier = db.prepare(
    "UPDATE content_objects SET enrichment_tier=?, curation_status='unreviewed' WHERE id=?",
  );
  const setPayload = db.prepare("UPDATE content_objects SET payload=? WHERE id=?");
  const setHeavy = db.prepare(
    `UPDATE content_objects SET article_type=?, is_advertorial=?,
       is_advertorial_confidence=?, summary=?, context_hint=?, event_type=?,
       tags=?, enrichment_tier='heavy', curation_status='unreviewed' WHERE id=?`,
  );
  const insObjTopic = db.prepare(
    "INSERT OR IGNORE INTO object_topics (object_id, topic_id, confidence, rank) VALUES (?, ?, ?, ?)",
  );
  const insProposed = db.prepare(
    "INSERT INTO proposed_topics (object_id, name, confidence) VALUES (?, ?, ?)",
  );
  const insEntity = db.prepare(
    "INSERT OR IGNORE INTO entities (entity_id, entity_type, name, attributes) VALUES (?, ?, ?, NULL)",
  );
  const insObjEntity = db.prepare(
    "INSERT OR IGNORE INTO object_entities (object_id, entity_id, role) VALUES (?, ?, ?)",
  );
  const insEvent = db.prepare(
    `INSERT INTO events (source_object_id, issue_id, title, event_type, venue,
       start_text, recurrence_text, performers, price_text, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insProv = db.prepare(
    `INSERT INTO provenance (object_id, field, model, prompt_version, run_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  function writeHeavy(o: CObj, r: EnrichResult) {
    const e = r.enrichment;
    setHeavy.run(
      e.article_type,
      e.is_advertorial ? 1 : 0,
      e.is_advertorial_confidence,
      e.summary,
      e.context_hint,
      e.event_type,
      JSON.stringify(e.tags ?? []),
      o.id,
    );
    e.topics.slice(0, 3).forEach((t, i) =>
      insObjTopic.run(o.id, slug(t.name), t.confidence, i + 1),
    );
    if (e.proposed_topic) insProposed.run(o.id, e.proposed_topic, "medium");
    for (const ent of e.entities) {
      const id = slug(`${ent.type}:${ent.name}`);
      insEntity.run(id, ent.type, ent.name);
      insObjEntity.run(o.id, id, ent.role ?? "mentioned");
    }
    for (const ev of e.events) {
      insEvent.run(
        o.id,
        ISSUE_ID,
        ev.title,
        ev.event_type,
        ev.venue,
        ev.start_text,
        ev.recurrence_text,
        JSON.stringify(ev.performers ?? []),
        ev.price_text,
        ev.confidence,
      );
    }
    insProv.run(o.id, "enrichment", r.model, ENRICH_PROMPT_VERSION, RUN_ID, CREATED_AT);
  }

  function writeLight(o: CObj, payload: LightPayload, model: string) {
    setTier.run("light", o.id);
    setPayload.run(JSON.stringify(payload), o.id);
    insProv.run(o.id, "light_payload", model, ENRICH_PROMPT_VERSION, RUN_ID, CREATED_AT);
  }

  // Routing + enrichment ---------------------------------------------------
  const counts: Record<Tier, number> = { heavy: 0, light: 0, structured: 0, capture_only: 0 };
  let eventRows = 0;
  let advertorials = 0;

  for (const o of objs) {
    if (CAPTURE_ONLY.has(o.object_class)) {
      setTier.run("capture_only", o.id);
      counts.capture_only++;
      continue;
    }

    if (o.object_class === "article") {
      const r = await enrichObject({
        issueId: ISSUE_ID,
        pageRecord: o.page_record,
        seq: o.seq,
        objectClass: o.object_class,
        role: o.role,
        text: o.text,
      });
      writeHeavy(o, r);
      counts.heavy++;
      eventRows += r.enrichment.events.length;
      if (r.enrichment.is_advertorial) advertorials++;
      continue;
    }

    if (o.object_class === "advertisement") {
      // Route by event-bearing-ness (gap S): heavy iff the model/fixture says so.
      const r = await enrichObjectOptional({
        issueId: ISSUE_ID,
        pageRecord: o.page_record,
        seq: o.seq,
        objectClass: o.object_class,
        role: o.role,
        text: o.text,
      });
      if (r && r.enrichment.is_event_bearing) {
        writeHeavy(o, r);
        counts.heavy++;
        eventRows += r.enrichment.events.length;
      } else {
        writeLight(o, deterministicLight(o.text), "fixture:heuristic-light");
        counts.light++;
      }
      continue;
    }

    if (o.object_class === "coupon") {
      writeLight(o, deterministicLight(o.text), "fixture:heuristic-light");
      counts.light++;
      continue;
    }

    if (STRUCTURED.has(o.object_class)) {
      setTier.run("structured", o.id);
      setPayload.run(JSON.stringify(structuredPayload(o)), o.id);
      insProv.run(o.id, "structured_payload", "fixture:structured", ENRICH_PROMPT_VERSION, RUN_ID, CREATED_AT);
      counts.structured++;
      continue;
    }

    // Any unrouted class holds at capture_only (honest default).
    setTier.run("capture_only", o.id);
    counts.capture_only++;
  }

  const topicCount = (db.prepare("SELECT COUNT(*) c FROM object_topics").get() as { c: number }).c;
  const entityCount = (db.prepare("SELECT COUNT(DISTINCT entity_id) c FROM object_entities").get() as { c: number }).c;
  const proposedCount = (db.prepare("SELECT COUNT(*) c FROM proposed_topics").get() as { c: number }).c;

  console.log(
    `\nEnriched issue ${ISSUE_ID} via ${ENRICH_PROVIDER} (run ${RUN_ID}):\n` +
      `  routing → heavy ${counts.heavy} · light ${counts.light} · structured ${counts.structured} · capture_only ${counts.capture_only}\n` +
      `  overlay → ${topicCount} topic links · ${entityCount} distinct entities · ${eventRows} events · ${advertorials} advertorials flagged\n` +
      `  proposed topics (pending human review): ${proposedCount}`,
  );
  db.close();
}

main().catch((err) => {
  console.error("enrich failed:", err.message);
  process.exit(1);
});
