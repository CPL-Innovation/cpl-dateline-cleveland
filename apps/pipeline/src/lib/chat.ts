// The reading-room assistant — a patron conversation about ONE issue.
//
// The whole design is the corpus boundary. The model is given the published text
// of a single issue and nothing else: no other issue, no unpublished read, no
// retrieval, no web. That is not a prompt-level request, it is what the context
// contains — the corpus is assembled here, from `is_published` rows only, so the
// publication gate (Principle 15) holds in the chat exactly as it holds in the
// index and the reader.
//
// Citations are structural, not prose: the model marks a claim with [[co-269]] and
// the patron app resolves that id into a chip that turns the reader to the page.
// An id the model invents resolves to nothing and is dropped by the client, so a
// hallucinated citation degrades to no citation rather than to a false one.
//
// Raw HTTP + fetchRetry, matching every other Claude call site in this service.
import { query } from "./pg.ts";
import { fetchRetry } from "./http.ts";
import { CHAT_MODEL, CHAT_MAX_CORPUS_CHARS, CHAT_MAX_TURNS } from "../config.ts";
import { dateLabel } from "./discovery.ts";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export class ChatRefused extends Error {}

interface CorpusRow {
  id: number;
  page_number: number | null;
  object_class: string;
  role: string | null;
  display_title: string | null;
  text: string;
  summary: string | null;
  is_published: boolean;
  serial: string | null;
  sort_date: string | null;
  title: string | null;
  page_count: number | null;
}

/** Everything the assistant is allowed to know, assembled for one issue. */
export async function buildIssueCorpus(pointer: number) {
  const rows = (await query<CorpusRow>(
    `SELECT co.id, pi.page_number, co.object_class, co.role, co.display_title,
            COALESCE(co.text_human, co.text) AS text, co.summary, co.is_published,
            i.serial, i.sort_date, i.title, i.page_count
       FROM content_objects co
       JOIN page_ingests pi ON pi.page_record = co.page_record
       LEFT JOIN issues i ON i.pointer = pi.issue_pointer
      WHERE pi.issue_pointer = $1
      ORDER BY pi.page_number, co.seq`, [pointer])).rows;

  if (!rows.length) throw new ChatRefused("that issue has nothing ingested to read");

  const head = rows[0];
  const published = rows.filter((r) => r.is_published);
  // Which pages a patron can be told about, and which are read-but-withheld. The
  // model is told both, so "I can't see page 2" is answerable as a fact about the
  // library's review queue rather than as a shrug.
  const pagesRead = [...new Set(rows.map((r) => r.page_number ?? 0))].sort((a, b) => a - b);
  const pagesPublished = [...new Set(published.map((r) => r.page_number ?? 0))].sort((a, b) => a - b);

  let used = 0;
  let truncated = 0;
  const items: string[] = [];
  for (const r of published) {
    const title = (r.display_title ?? "").trim();
    const body = r.text.replace(/\s+\n/g, "\n").trim().slice(0, 6000);
    const block = [
      `[[co-${r.id}]] p.${r.page_number ?? "?"} · ${r.object_class}${r.role ? ` (${r.role})` : ""}`,
      title ? `TITLE: ${title}` : null,
      r.summary ? `SUMMARY: ${r.summary}` : null,
      `TEXT: ${body}`,
    ].filter(Boolean).join("\n");
    if (used + block.length > CHAT_MAX_CORPUS_CHARS) { truncated++; continue; }
    used += block.length;
    items.push(block);
  }

  const issueLabel = `${head.serial ?? "this newspaper"} — ${dateLabel(head.sort_date)}`;
  const coverage = [
    `ISSUE: ${issueLabel}`,
    head.title ? `CATALOG TITLE: ${head.title}` : null,
    `PRINTED PAGES: ${head.page_count ?? pagesRead.length}`,
    `PAGES WITH PUBLISHED TEXT: ${pagesPublished.length ? pagesPublished.join(", ") : "none"}`,
    `PAGES READ BY THE PIPELINE BUT NOT YET RELEASED: ${
      pagesRead.filter((p) => !pagesPublished.includes(p)).join(", ") || "none"}`,
    `PUBLISHED ITEMS IN THIS CONTEXT: ${items.length}${truncated ? ` (${truncated} omitted for length)` : ""}`,
  ].filter(Boolean).join("\n");

  return {
    issueLabel,
    serial: head.serial ?? "this newspaper",
    dateLabel: dateLabel(head.sort_date),
    publishedCount: published.length,
    document: `${coverage}\n\n=== PUBLISHED ITEMS FROM THIS ISSUE ===\n\n${items.join("\n\n")}`,
  };
}

function systemPrompt(issueLabel: string): string {
  return [
    `You are the reading-room assistant at the Cleveland Public Library, sitting with a patron who is reading one issue of a digitized historic newspaper: ${issueLabel}.`,
    "",
    "YOUR SOURCE",
    "- The items below are the ONLY text you have from this issue. They are the items a curator has reviewed and published.",
    "- Do not claim anything about this issue that is not in those items. You have no other pages, no other issues, and no archive to search.",
    "- The transcriptions were made by a machine reading a scan. They contain errors, and [illegible] or [loss] marks where the paper is damaged. Treat them as a good but imperfect read, and say so when a passage is unclear.",
    "- Some pages of this issue have been read but not yet released for public reading. If the patron asks about one, tell them plainly which pages you can see and that the rest is still with the curators.",
    "",
    "CITING",
    "- Cite the item you are drawing on by writing its id in double brackets immediately after the claim, like this: [[co-269]].",
    "- Use ONLY ids that appear in the items below. Never invent one. If you cannot cite it, do not assert it.",
    "- Cite the specific item, not the page. Two or three citations in an answer is plenty.",
    "",
    "HOW TO TALK",
    "- You are helping someone read, not delivering a report. Be concise — usually under 150 words — and plain-spoken.",
    "- Quote the paper sparingly and exactly; never smooth its wording or invent a quote.",
    "- Do not moralize about the period's language or attitudes; when the paper reflects the prejudices of its time, describe what it says and let the patron think.",
    "- If a question cannot be answered from this issue, say so in one sentence and offer what the issue DOES have on the subject.",
    "- You may add at most one sentence of general historical background where it genuinely helps, prefixed exactly with 'Beyond this issue:' so the patron can see it did not come from the paper.",
    "- Never invent names, dates, figures, headlines or advertisements.",
  ].join("\n");
}

/**
 * Stream an answer. `onDelta` receives text fragments as they arrive; the promise
 * resolves when the model is done. Throws ChatRefused for anything the patron
 * caused (turn cap, empty corpus) and Error for anything the service caused.
 */
export async function streamIssueChat(
  pointer: number,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
): Promise<{ model: string; turns: number }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set — the reading-room assistant needs it");

  const clean = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 6000) }));
  if (!clean.length || clean[clean.length - 1].role !== "user") {
    throw new ChatRefused("the last message must be from the patron");
  }
  const turns = clean.filter((m) => m.role === "user").length;
  if (turns > CHAT_MAX_TURNS) {
    throw new ChatRefused(`this conversation has reached its ${CHAT_MAX_TURNS}-question limit — start a fresh one`);
  }

  const corpus = await buildIssueCorpus(pointer);
  if (!corpus.publishedCount) {
    throw new ChatRefused("nothing from this issue has been published yet, so there is nothing to discuss");
  }

  const res = await fetchRetry("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      max_tokens: 1024,
      stream: true,
      system: [
        { type: "text", text: systemPrompt(corpus.issueLabel) },
        // The corpus is one large, stable block reused across every turn of the
        // conversation — exactly what the cache is for.
        { type: "text", text: corpus.document, cache_control: { type: "ephemeral" } },
      ],
      messages: clean,
    }),
  }, { label: `Anthropic reading-room chat (${CHAT_MODEL})`, retries: 1 });

  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 400)}`);
  if (!res.body) throw new Error("Anthropic returned no stream");

  // Parse Anthropic's SSE and forward only the text deltas.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload) as any;
        if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta" && evt.delta.text) {
          onDelta(evt.delta.text as string);
        } else if (evt.type === "error") {
          throw new Error(evt.error?.message ?? "stream error");
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue; // a split frame — the buffer will catch it
        throw e;
      }
    }
  }

  return { model: CHAT_MODEL, turns };
}
