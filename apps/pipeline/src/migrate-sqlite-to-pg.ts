// One-shot: copy the existing SLICE-05 SQLite run (the already-enriched Brooklyn
// News 1924-02-01 issue) into the Postgres store, so the production store is
// consistent with what the dashboard already shows as enriched. Idempotent:
// clears the issue's rows first, remaps ids, marks its pages done.
//   node --experimental-sqlite ... src/migrate-sqlite-to-pg.ts
import { DatabaseSync } from "node:sqlite";
import { DB_PATH } from "./config.ts";
import { migrate, tx, closePool } from "./lib/pg.ts";

async function main() {
  await migrate();
  const db = new DatabaseSync(DB_PATH);
  const all = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as any[];

  const cos = all("SELECT * FROM content_objects ORDER BY id");
  if (!cos.length) { console.log("SQLite store empty — nothing to migrate."); return; }
  const issueId = cos[0].issue_id;
  const hasEnrich = (db.prepare("SELECT count(*) c FROM sqlite_master WHERE type='table' AND name='object_topics'").get() as any).c > 0;
  const topics = hasEnrich ? all("SELECT * FROM topics") : [];
  const objTopics = hasEnrich ? all("SELECT * FROM object_topics") : [];
  const proposed = hasEnrich ? all("SELECT * FROM proposed_topics") : [];
  const entities = hasEnrich ? all("SELECT * FROM entities") : [];
  const objEnts = hasEnrich ? all("SELECT * FROM object_entities") : [];
  const events = hasEnrich ? all("SELECT * FROM events") : [];
  const prov = hasEnrich ? all("SELECT * FROM provenance") : [];
  db.close();

  await tx(async (c) => {
    await c.query("DELETE FROM content_objects WHERE issue_id=$1", [issueId]);
    for (const t of topics)
      await c.query("INSERT INTO topics (topic_id,name,is_promoted) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [t.topic_id, t.name, !!t.is_promoted]);
    for (const e of entities)
      await c.query("INSERT INTO entities (entity_id,entity_type,name,attributes) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [e.entity_id, e.entity_type, e.name, e.attributes ?? null]);

    const idMap = new Map<number, number>();
    for (const o of cos) {
      const r = await c.query<{ id: number }>(
        `INSERT INTO content_objects
          (issue_id,page_record,seq,object_class,role,text,region_bbox,is_publication_content,occurrences,
           transcription_confidence,run_id,model,created_at,article_type,is_advertorial,is_advertorial_confidence,
           summary,context_hint,event_type,tags,enrichment_tier,curation_status,payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING id`,
        [o.issue_id, o.page_record, o.seq, o.object_class, o.role, o.text, o.region_bbox,
         o.is_publication_content === 1, o.occurrences, o.transcription_confidence, o.run_id, o.model, o.created_at,
         o.article_type, o.is_advertorial == null ? null : o.is_advertorial === 1, o.is_advertorial_confidence,
         o.summary, o.context_hint, o.event_type, o.tags, o.enrichment_tier, o.curation_status, o.payload]);
      idMap.set(o.id, r.rows[0].id);
    }
    for (const ot of objTopics)
      await c.query("INSERT INTO object_topics (object_id,topic_id,confidence,rank,is_human_override) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [idMap.get(ot.object_id), ot.topic_id, ot.confidence, ot.rank, !!ot.is_human_override]);
    for (const p of proposed)
      await c.query("INSERT INTO proposed_topics (object_id,name,confidence,status) VALUES ($1,$2,$3,$4)", [idMap.get(p.object_id), p.name, p.confidence, p.status]);
    for (const oe of objEnts)
      await c.query("INSERT INTO object_entities (object_id,entity_id,role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [idMap.get(oe.object_id), oe.entity_id, oe.role]);
    for (const ev of events)
      await c.query(`INSERT INTO events (source_object_id,issue_id,title,event_type,venue,start_text,recurrence_text,performers,price_text,confidence)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [idMap.get(ev.source_object_id), ev.issue_id, ev.title, ev.event_type, ev.venue, ev.start_text, ev.recurrence_text, ev.performers, ev.price_text, ev.confidence]);
    for (const pr of prov)
      await c.query("INSERT INTO provenance (object_id,field,model,prompt_version,run_id,created_at) VALUES ($1,$2,$3,$4,$5,$6)",
        [idMap.get(pr.object_id), pr.field, pr.model, pr.prompt_version, pr.run_id, pr.created_at]);

    // mark each page done in page_ingests (the parent cpd of 1924-02-01 is 7622)
    const perPage = new Map<number, number>();
    for (const o of cos) perPage.set(o.page_record, (perPage.get(o.page_record) ?? 0) + 1);
    let pageNum = 1;
    for (const [rec, count] of [...perPage].sort((a, b) => a[0] - b[0])) {
      await c.query(
        `INSERT INTO page_ingests (collection,issue_pointer,issue_id,page_record,page_number,status,run_id,vlm_model,object_count,finished_at)
         VALUES ('p16014coll5',7622,$1,$2,$3,'done',$4,$5,$6, now())
         ON CONFLICT (collection,page_record) DO UPDATE SET status='done', object_count=EXCLUDED.object_count, finished_at=now()`,
        [issueId, rec, pageNum++, cos[0].run_id, cos[0].model, count]);
    }
    console.log(`Migrated ${cos.length} objects (${perPage.size} pages) for ${issueId} → Postgres.`);
  });
  await closePool();
}

main().catch((e) => { console.error("migrate failed:", e.message); process.exit(1); });
