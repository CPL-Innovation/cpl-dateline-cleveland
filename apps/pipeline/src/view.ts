// SLICE-01 step 4: "look at it." A crude dump, NOT a designed screen (Claude Design
// owns real interfaces later). Console print + a throwaway out/view.html.
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { openDb } from "./lib/db.ts";
import { OUT_DIR, PROMPT_VERSION, VLM_PROVIDER, PAGES } from "./config.ts";

const RUN_ID = `${PROMPT_VERSION}_${VLM_PROVIDER}_run1`;

interface Row {
  page_record: number;
  seq: number;
  object_class: string;
  role: string | null;
  text: string;
  is_publication_content: number;
  occurrences: number;
}

function main() {
  const db = openDb();

  // --- Class distribution per page (eyeball vs Dry Run 01 gold set) ---
  const dist = db
    .prepare(
      `SELECT page_record, object_class, COUNT(*) n, SUM(occurrences) units
       FROM content_objects WHERE run_id = ?
       GROUP BY page_record, object_class
       ORDER BY page_record, n DESC`,
    )
    .all(RUN_ID) as Array<{
    page_record: number;
    object_class: string;
    n: number;
    units: number;
  }>;

  console.log("\n=== Class distribution by page (rows / units incl. filler occurrences) ===");
  let curPage = -1;
  for (const d of dist) {
    if (d.page_record !== curPage) {
      curPage = d.page_record;
      const pn = PAGES.find((p) => p.pageRecord === d.page_record)?.pageNumber;
      console.log(`\n  Page ${pn} (rec ${d.page_record}):`);
    }
    console.log(
      `    ${d.object_class.padEnd(22)} ${String(d.n).padStart(3)} rows` +
        (d.units !== d.n ? `  (${d.units} units)` : ""),
    );
  }

  // --- Page 1 article-class rows in reading order (the Definition of Done) ---
  const p1 = db
    .prepare(
      `SELECT page_record, seq, object_class, role, text, is_publication_content, occurrences
       FROM content_objects
       WHERE run_id = ? AND page_record = 7618 AND object_class = 'article'
       ORDER BY seq`,
    )
    .all(RUN_ID) as Row[];

  console.log(
    `\n=== Page 1 (rec 7618) article-class rows in reading order — ${p1.length} articles ===`,
  );
  for (const r of p1) {
    const title = firstLine(r.text);
    console.log(`  [${String(r.seq).padStart(2)}] (${r.role ?? "—"}) ${title}`);
  }

  // Also surface the two gold-set tripwires explicitly.
  const anno = db
    .prepare(
      `SELECT text FROM content_objects WHERE run_id = ? AND object_class = 'manuscript_annotation'`,
    )
    .all(RUN_ID) as Array<{ text: string }>;
  console.log(
    `\n  Handwriting caught as manuscript_annotation (not article text): ${anno.length}`,
  );
  for (const a of anno) console.log(`    · ${firstLine(a.text)}`);

  const filler = db
    .prepare(
      `SELECT text, occurrences FROM content_objects
       WHERE run_id = ? AND object_class = 'filler_slug' ORDER BY occurrences DESC`,
    )
    .all(RUN_ID) as Array<{ text: string; occurrences: number }>;
  console.log(`\n  Filler slugs collapsed (canonical row + occurrences):`);
  for (const f of filler)
    console.log(`    · "${firstLine(f.text)}" ×${f.occurrences}`);

  // --- Throwaway HTML ---
  const allRows = db
    .prepare(
      `SELECT page_record, seq, object_class, role, text, is_publication_content, occurrences
       FROM content_objects WHERE run_id = ? ORDER BY page_record, seq`,
    )
    .all(RUN_ID) as Row[];
  mkdirSync(OUT_DIR, { recursive: true });
  const htmlPath = resolve(OUT_DIR, "view.html");
  writeFileSync(htmlPath, renderHtml(allRows, dist));
  console.log(`\nWrote ${htmlPath}`);

  db.close();
}

function firstLine(s: string): string {
  const line = s.split("\n")[0].trim();
  return line.length > 90 ? line.slice(0, 90) + "…" : line;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderHtml(
  rows: Row[],
  dist: Array<{ page_record: number; object_class: string; n: number; units: number }>,
): string {
  const byPage = new Map<number, Row[]>();
  for (const r of rows) {
    if (!byPage.has(r.page_record)) byPage.set(r.page_record, []);
    byPage.get(r.page_record)!.push(r);
  }
  const classColor: Record<string, string> = {
    article: "#1b5e20",
    advertisement: "#8d6e00",
    classified_section: "#5d4037",
    listing: "#00695c",
    legal_notice: "#4527a0",
    coupon: "#ad1457",
    masthead: "#01579b",
    filler_slug: "#9e9e9e",
    manuscript_annotation: "#c62828",
    caption: "#00838f",
    illustration: "#6a1b9a",
  };

  let sections = "";
  for (const page of PAGES) {
    const pr = page.pageRecord;
    const pageRows = byPage.get(pr) ?? [];
    const chips = dist
      .filter((d) => d.page_record === pr)
      .map(
        (d) =>
          `<span class="chip" style="background:${classColor[d.object_class] ?? "#555"}">${d.object_class} · ${d.n}${d.units !== d.n ? ` (${d.units}u)` : ""}</span>`,
      )
      .join(" ");
    const trs = pageRows
      .map((r) => {
        const c = classColor[r.object_class] ?? "#555";
        const flag = r.is_publication_content ? "" : " · not-pub";
        const occ = r.occurrences > 1 ? ` ×${r.occurrences}` : "";
        return `<tr>
          <td class="seq">${r.seq}</td>
          <td><span class="tag" style="background:${c}">${r.object_class}</span>${flag}${occ}</td>
          <td class="role">${esc(r.role ?? "")}</td>
          <td class="text">${esc(r.text)}</td>
        </tr>`;
      })
      .join("\n");
    sections += `<section>
      <h2>Page ${page.pageNumber} <small>(CDM rec ${pr})</small></h2>
      <div class="chips">${chips}</div>
      <table>
        <thead><tr><th>seq</th><th>class</th><th>role</th><th>transcription</th></tr></thead>
        <tbody>${trs}</tbody>
      </table>
    </section>`;
  }

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>SLICE-01 — Brooklyn News, Feb 1 1924</title>
<style>
  body{font:14px/1.5 -apple-system,system-ui,sans-serif;margin:0;background:#faf8f4;color:#1a1a1a}
  header{padding:20px 28px;background:#1a1a1a;color:#fff}
  header h1{margin:0 0 4px;font-size:18px}
  header p{margin:0;opacity:.7;font-size:13px}
  section{padding:16px 28px;border-bottom:1px solid #e5e0d8}
  h2{font-size:16px;margin:0 0 8px} h2 small{color:#999;font-weight:400}
  .chips{margin-bottom:12px} .chip,.tag{display:inline-block;color:#fff;border-radius:4px;padding:2px 7px;font-size:11px;margin:2px 2px 2px 0}
  table{border-collapse:collapse;width:100%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  th,td{text-align:left;padding:7px 10px;border-bottom:1px solid #eee;vertical-align:top}
  th{background:#f0ece4;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#666}
  .seq{color:#aaa;font-variant-numeric:tabular-nums;width:36px}
  .role{color:#888;font-style:italic;width:90px}
  .text{white-space:pre-wrap;max-width:640px}
</style></head>
<body>
<header>
  <h1>The Brooklyn News — Vol. X No. 5 · Friday, Feb 1, 1924</h1>
  <p>SLICE-01 output · image → VLM → structured content-objects → viewable · run ${RUN_ID}</p>
</header>
${sections}
</body></html>`;
}

main();
