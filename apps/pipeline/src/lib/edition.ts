// SLICE-15 — Your Edition: a persona-tuned, four-section zine built from one issue.
//
// Two halves, and only one of them spends money:
//
//   DEALING (no model call). The patron's Reader Card and the issue's own published
//   index decide which prompt cards are offered, round by round. Every card is
//   backed by MATERIAL — the published objects it would draw on — and a card with
//   no material is never dealt. Persona filters the deck; it never fakes material.
//
//   WRITING (one Sonnet call per section). The same corpus the reading-room chat is
//   handed (buildIssueCorpus — one issue's published objects, nothing else), the
//   same cached block, a stricter job: one headline, one paragraph in the reader's
//   register, and the ids it drew on. Citations are validated against the ids that
//   were actually in the corpus; an invented one is dropped, and a section left
//   with none is not a section.
//
// The cost rails live here, server-side, where a refusal costs nothing: four
// sections, a hard ceiling of six model calls per edition (a section that comes
// back with no surviving citation still spent its call), two free-text retries.
import { query } from "./pg.ts";
import { buildIssueCorpus, streamMessages, ChatRefused } from "./chat.ts";
import { CHAT_MODEL, iiifId } from "../config.ts";
import { pageSize } from "./iiif.ts";
import { readingRects } from "./region.ts";

export { ChatRefused as EditionRefused };

export const EDITION_SECTIONS = 4;
export const EDITION_MAX_CALLS = 6;
export const EDITION_MAX_REGENERATES = 2;
const FREE_TEXT_MAX = 300;
const MAX_REFS = 8;

/* ── the Reader Card ──────────────────────────────────────────────────────── */

export const ROLES = ["local", "family", "researcher", "curious", "kid"] as const;
export const REGISTERS = ["quick", "full", "ten", "facts"] as const;
export type Role = (typeof ROLES)[number];
export type Register = (typeof REGISTERS)[number];
export interface ReaderCard { role: Role; interests: string[]; register: Register }

export function readReaderCard(v: unknown): ReaderCard {
  const o = (v ?? {}) as Record<string, unknown>;
  if (!ROLES.includes(o.role as Role)) throw new ChatRefused("the Reader Card needs a role");
  if (!REGISTERS.includes(o.register as Register)) throw new ChatRefused("the Reader Card needs a register");
  const interests = Array.isArray(o.interests)
    ? [...new Set(o.interests.filter((x): x is string => typeof x === "string" && x.length <= 60))].slice(0, 3)
    : [];
  return { role: o.role as Role, register: o.register as Register, interests };
}

/** How each role is spoken to. Lenses on appetite — never a guess at who they are. */
const ROLE_TONE: Record<Role, string> = {
  local: "A neighbor who lives near where this paper circulated. Anchor what you tell them in the streets, shops, halls and churches the paper names, so they can picture where it happened.",
  family: "Someone tracing family history. Foreground people's names exactly as printed, relationships, addresses and occupations — the details a genealogist would write down.",
  researcher: "A researcher. Be precise and even-handed; note counts, patterns and how the paper frames things; distinguish what the paper asserts from what is established.",
  curious: "A curious general reader. Be warm and a little wry; lead with what is most surprising or human.",
  kid: "A young reader who chose the kid's lens. Be friendly and concrete; explain anything unfamiliar in plain words; nothing gruesome dwelt on.",
};

/** How much, and how plainly. The word ceilings are the brief's. */
const REGISTER_RULE: Record<Register, { words: number; rule: string }> = {
  quick: { words: 90, rule: "Quick bites: one short, lively paragraph of AT MOST 90 words." },
  full: { words: 220, rule: "The full story: one full paragraph of AT MOST 220 words, with the specifics — names, places, figures." },
  ten: { words: 110, rule: "Explain it like I'm ten: one paragraph of AT MOST 110 words, short sentences, everyday vocabulary; explain any old-fashioned term right where it appears." },
  facts: { words: 120, rule: "Just the facts, with sources: one paragraph of AT MOST 120 words, declarative, no adjectives or opinion, every claim traceable to a cited item." },
};

/* ── the issue's index: what material each card could draw on ────────────── */

interface Obj {
  id: number; page: number; record: number; cls: string; articleType: string | null;
  advertorial: boolean; title: string | null; text: string; region: unknown;
  topics: string[]; people: number; orgs: number; events: number; eventPrice: boolean;
}

interface Ix {
  pointer: number;
  objs: Obj[];
  byId: Map<number, Obj>;
  corpusIds: Set<number>;
  topics: Array<{ name: string; slug: string; ids: number[] }>;
  serial: string;
  dateLabel: string;
  publishedCount: number;
}

const has = (re: RegExp) => (o: Obj) => re.test(o.text);
const PRICE = /(\$\s?\d|\b\d+\s?(¢|cents?\b)|\b\d+c\b)/i;
const LOST = /\b(lost|found|strayed|reward|stolen|missing)\b/i;
const MILESTONE = /\b(married|marriage|wedding|bride|funeral|died|death of|passed away|born|birth|anniversary|engaged|engagement)\b/i;
const KIDS = /\b(school|pupils?|children|boys|girls|scouts?|kiddies|juvenile|kindergarten)\b/i;
const SHOWS = /\b(theat(er|re)|photoplay|movie|film|picture show|vaudeville|screen)\b/i;
const CIVIC = /\b(council|civic|ordinance|sewer|paving|improvement association|ward|mayor|commissioners?)\b/i;
const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const isPrice = (o: Obj) => o.eventPrice || PRICE.test(o.text);
const isOdd = (o: Obj) =>
  o.advertorial || o.cls === "legal_notice" || o.cls === "classified_section" || o.cls === "coupon" || LOST.test(o.text);

const ixCache = new Map<number, { at: number; ix: Ix }>();
const IX_TTL = 60_000;

/** One issue's published objects with the facts cards are dealt on. Cheap SQL, no model. */
export async function issueIndex(pointer: number): Promise<Ix> {
  const hit = ixCache.get(pointer);
  if (hit && Date.now() - hit.at < IX_TTL) return hit.ix;

  const corpus = await buildIssueCorpus(pointer);
  const rows = (await query<any>(
    `SELECT co.id, pi.page_number, co.page_record, co.object_class, co.article_type, co.is_advertorial,
            co.display_title, COALESCE(co.text_human, co.text) AS text, co.region_bbox,
            COALESCE((SELECT array_agg(t.name ORDER BY ot.rank) FROM object_topics ot
                        JOIN topics t ON t.topic_id = ot.topic_id WHERE ot.object_id = co.id), '{}') AS topics,
            (SELECT count(*) FROM object_entities oe JOIN entities e ON e.entity_id = oe.entity_id
              WHERE oe.object_id = co.id AND e.entity_type = 'person')::int AS people,
            (SELECT count(*) FROM object_entities oe JOIN entities e ON e.entity_id = oe.entity_id
              WHERE oe.object_id = co.id AND e.entity_type = 'organization')::int AS orgs,
            (SELECT count(*) FROM events ev WHERE ev.source_object_id = co.id)::int AS events,
            EXISTS (SELECT 1 FROM events ev WHERE ev.source_object_id = co.id AND ev.price_text IS NOT NULL) AS event_price
       FROM content_objects co JOIN page_ingests pi ON pi.page_record = co.page_record
      WHERE pi.issue_pointer = $1 AND co.is_published
      ORDER BY pi.page_number, co.seq`, [pointer])).rows;

  // Only what the model will actually be handed counts as material: a card built
  // on an object the corpus cap left out would ask for something it can't see.
  const corpusIds = new Set(corpus.ids);
  const objs: Obj[] = rows
    .filter((r) => corpusIds.has(Number(r.id)))
    .map((r) => ({
      id: Number(r.id), page: r.page_number ?? 0, record: Number(r.page_record), cls: r.object_class,
      articleType: r.article_type, advertorial: !!r.is_advertorial, title: r.display_title, text: r.text ?? "",
      region: r.region_bbox, topics: r.topics ?? [], people: r.people, orgs: r.orgs, events: r.events,
      eventPrice: !!r.event_price,
    }));

  const topicMap = new Map<string, number[]>();
  for (const o of objs) for (const t of o.topics) topicMap.set(t, [...(topicMap.get(t) ?? []), o.id]);
  const topics = [...topicMap.entries()]
    .map(([name, ids]) => ({ name, slug: slug(name), ids }))
    .sort((a, b) => b.ids.length - a.ids.length || a.name.localeCompare(b.name));

  const ix: Ix = {
    pointer, objs, byId: new Map(objs.map((o) => [o.id, o])), corpusIds, topics,
    serial: corpus.serial, dateLabel: corpus.dateLabel, publishedCount: corpus.publishedCount,
  };
  ixCache.set(pointer, { at: Date.now(), ix });
  return ix;
}

/* ── interests (Phase 1, question 2) ──────────────────────────────────────── */

interface Interest { id: string; label: string; phrase: string; material: (ix: Ix) => number[]; min: number }

const ids = (ix: Ix, f: (o: Obj) => boolean) => ix.objs.filter(f).map((o) => o.id);

const BASE_INTERESTS: Interest[] = [
  { id: "ads", label: "the ads", phrase: "an eye for the ads", min: 3, material: (ix) => ids(ix, (o) => o.cls === "advertisement" || o.cls === "coupon") },
  { id: "people", label: "the people", phrase: "an interest in the people", min: 5, material: (ix) => ids(ix, (o) => o.people > 0) },
  { id: "week", label: "what happened this week", phrase: "a taste for the week's news", min: 3, material: (ix) => ids(ix, (o) => o.cls === "article" || o.events > 0) },
  { id: "money", label: "the money", phrase: "a head for money", min: 2, material: (ix) => ids(ix, isPrice) },
  { id: "strange", label: "the strange stuff", phrase: "a nose for the strange", min: 2, material: (ix) => ids(ix, isOdd) },
];

function topicInterests(ix: Ix): Interest[] {
  // One or two hooks from what THIS issue is most about — only topics with real depth.
  return ix.topics.filter((t) => t.ids.length >= 4).slice(0, 2).map((t) => ({
    id: `topic:${t.slug}`,
    label: t.name.charAt(0) + t.name.slice(1).toLowerCase(),
    phrase: `a soft spot for ${t.name.toLowerCase()}`,
    min: 4,
    material: () => t.ids,
  }));
}

export function availableInterests(ix: Ix) {
  return [...BASE_INTERESTS, ...topicInterests(ix)]
    .map((i) => ({ i, n: i.material(ix).length }))
    .filter(({ i, n }) => n >= i.min)
    .map(({ i, n }) => ({ id: i.id, label: i.label, phrase: i.phrase, count: n }));
}

/* ── the prompt library ───────────────────────────────────────────────────── */

interface Entry {
  id: string;
  card: string;                       // the words on the card (and the section's kicker)
  serves: string[];                   // interest ids this answers; [] = general
  roles?: Role[];                     // who it's dealt to; absent = everyone
  odd?: boolean;                      // a round-3 "didn't expect that" candidate
  min: number;                        // material needed before it may be dealt
  material: (ix: Ix) => number[];
  instruction: string;                // the job, to the model
}

const LIBRARY: Entry[] = [
  // the ads
  { id: "ads-best", card: "The best ad in the paper", serves: ["ads"], min: 3,
    material: (ix) => ids(ix, (o) => o.cls === "advertisement"),
    instruction: "Choose the single most striking advertisement. Say what it sold, how it made its pitch, and what it cost if it says." },
  { id: "ads-trick", card: "The ad that's secretly a trick", serves: ["ads", "strange"], roles: ["kid", "curious", "local"], odd: true, min: 1,
    material: (ix) => ids(ix, (o) => o.advertorial),
    instruction: "Pick an item that reads like news but is really selling something (an advertorial). Show how you can tell — what gives it away." },
  { id: "ads-numbers", card: "Ads vs. news, by the numbers", serves: ["ads"], roles: ["researcher"], min: 5,
    material: (ix) => ids(ix, (o) => o.cls === "advertisement" || o.cls === "article"),
    instruction: "Compare how much of this issue is advertising and how much is news, using counts you can make from the items, and cite representative examples of each." },
  { id: "ads-shops", card: "The businesses and who ran them", serves: ["ads", "people"], roles: ["family", "local", "researcher"], min: 3,
    material: (ix) => ids(ix, (o) => (o.cls === "advertisement" || o.cls === "article") && o.orgs > 0),
    instruction: "Survey the local businesses in these pages: what they were, where they stood, and the names of the people who ran them, as printed." },
  // the people
  { id: "people-surnames", card: "Every surname in these pages", serves: ["people"], roles: ["family"], min: 5,
    material: (ix) => ids(ix, (o) => o.people > 0),
    instruction: "Gather the family surnames that appear, grouped by what they were in the paper for (clubs, churches, business, events). Spell every name exactly as printed." },
  { id: "people-milestones", card: "A wedding, a funeral, a birth", serves: ["people"], roles: ["family", "local", "curious"], odd: true, min: 1,
    material: (ix) => ids(ix, (o) => o.articleType === "obituary" || MILESTONE.test(o.text)),
    instruction: "Tell of the life events this issue records — marriages, deaths, births, anniversaries — with the names and details the paper gives." },
  { id: "people-busy", card: "Who kept turning up", serves: ["people"], min: 3,
    material: (ix) => ids(ix, (o) => o.people >= 2),
    instruction: "Find the people who appear most often or in the most roles in this issue, and say what each was doing." },
  { id: "people-orgs", card: "Every organization named", serves: ["people", "week"], roles: ["researcher", "local"], min: 4,
    material: (ix) => ids(ix, (o) => o.orgs > 0),
    instruction: "List and characterize the clubs, lodges, churches, associations and firms this issue names, and what each was up to." },
  // the week
  { id: "week-news", card: "What happened this week", serves: ["week"], min: 3,
    material: (ix) => ids(ix, (o) => o.cls === "article" && ["news_report", "news_brief"].includes(o.articleType ?? "")),
    instruction: "Report the week's actual news — what happened, to whom, where." },
  { id: "week-calendar", card: "Where to be, and when", serves: ["week"], roles: ["local", "curious", "kid", "family"], min: 3,
    material: (ix) => ids(ix, (o) => o.events > 0),
    instruction: "Lay out the week's calendar: the meetings, dances, services and shows announced, with days, times and places as printed." },
  { id: "week-civic", card: "How this paper talks about civic life", serves: ["week"], roles: ["researcher", "local"], min: 2,
    material: (ix) => ids(ix, (o) => o.topics.includes("Local Government & Civic") || CIVIC.test(o.text)),
    instruction: "Describe how this issue covers civic affairs — which improvements, complaints and institutions it foregrounds, and in what tone." },
  { id: "week-sports", card: "The scores", serves: ["week"], min: 2,
    material: (ix) => ids(ix, (o) => o.articleType === "sports_box_score" || o.topics.includes("Sports & Recreation")),
    instruction: "Give the week's sport: who played whom, the results, and anyone singled out." },
  { id: "week-front", card: "The front page, in brief", serves: ["week"], min: 3,
    material: (ix) => ids(ix, (o) => o.page === 1 && o.cls === "article"),
    instruction: "Summarize what the paper chose to put on its front page, and why those stories might have led." },
  // the money
  { id: "money-dollar", card: "What a dollar could buy", serves: ["money"], odd: true, min: 2,
    material: (ix) => ids(ix, isPrice),
    instruction: "Using prices printed in this issue, show what everyday money bought — goods, services, admissions. Quote each price exactly." },
  { id: "money-show", card: "What a show cost", serves: ["money"], roles: ["kid", "curious", "local"], odd: true, min: 1,
    material: (ix) => ids(ix, (o) => SHOWS.test(o.text) && (isPrice(o) || o.events > 0)),
    instruction: "Find the entertainment on offer — pictures, vaudeville, dances — and what it cost to get in, as printed." },
  { id: "money-realestate", card: "Houses, lots and rents", serves: ["money"], roles: ["local", "family", "researcher"], min: 2,
    material: (ix) => ids(ix, (o) => o.topics.includes("Real Estate & Building") || /\b(lots?|bungalow|rent|for sale|acres?)\b/i.test(o.text)),
    instruction: "Describe the property on offer — houses, lots, building — with the prices and places the paper gives." },
  // the strange
  { id: "strange-lost", card: "Lost, found and wanted", serves: ["strange"], odd: true, min: 1,
    material: (ix) => ids(ix, (o) => LOST.test(o.text) || o.cls === "classified_section"),
    instruction: "Go through the lost-and-found, wanted and classified notices and tell the small human stories in them." },
  { id: "strange-fineprint", card: "The fine print", serves: ["strange"], roles: ["researcher", "curious", "family"], odd: true, min: 1,
    material: (ix) => ids(ix, (o) => o.cls === "legal_notice"),
    instruction: "Explain what the legal notices in this issue were for and what they reveal about the people and property named." },
  { id: "strange-oddest", card: "The strangest thing in here", serves: ["strange"], odd: true, min: 2,
    material: (ix) => ids(ix, isOdd),
    instruction: "Pick the single oddest, most unexpected item in this issue and tell its story." },
  { id: "strange-now", card: "What would sound strangest now", serves: ["strange"], min: 3,
    material: (ix) => ix.objs.map((o) => o.id),
    instruction: "Find the phrases, customs or assumptions in this issue that would sound most foreign to a reader today, quoting them exactly." },
  // general
  { id: "kids-then", card: "What kids got up to", serves: [], roles: ["kid", "family", "curious", "local"], odd: true, min: 1,
    material: (ix) => ids(ix, (o) => KIDS.test(o.text) || o.topics.includes("Schools & Education")),
    instruction: "Tell what children and young people were doing in these pages — school, clubs, sport, shows." },
  { id: "best-sentence", card: "The best sentence in the paper", serves: [], min: 3,
    material: (ix) => ids(ix, (o) => o.cls === "article"),
    instruction: "Choose the single best-written sentence in this issue, quote it exactly, and say why it works." },
  { id: "unchanged", card: "Something that hasn't changed at all", serves: [], min: 3,
    material: (ix) => ix.objs.map((o) => o.id),
    instruction: "Find something in this issue that would be just as at home in a paper today, and show the parallel." },
  { id: "faith", card: "Sunday, and the rest of the week at church", serves: [], roles: ["local", "family", "researcher"], min: 3,
    material: (ix) => ids(ix, (o) => o.topics.includes("Churches & Religion")),
    instruction: "Describe church life in this issue — services, societies, socials — and who led them." },
];

/** Topic cards are made per issue: one to open a topic, one to go deeper after it. */
function topicEntry(ix: Ix, s: string, deeper: boolean): Entry | null {
  const t = ix.topics.find((x) => x.slug === s);
  if (!t) return null;
  return {
    id: `${deeper ? "more" : "topic"}:${t.slug}`,
    card: deeper ? `More on ${t.name.toLowerCase()}` : `All about ${t.name.toLowerCase()}`,
    serves: [`topic:${t.slug}`],
    min: deeper ? 1 : 3,
    material: () => t.ids,
    instruction: deeper
      ? `Go deeper into ${t.name}: take up items on this subject that the edition has NOT yet covered, and add what they tell.`
      : `Tell the story of ${t.name} in this issue — what was going on, who was involved, where.`,
  };
}

function resolveEntry(ix: Ix, cardId: string): Entry | null {
  const m = /^(topic|more):([a-z0-9-]+)$/.exec(cardId);
  if (m) return topicEntry(ix, m[2], m[1] === "more");
  return LIBRARY.find((e) => e.id === cardId) ?? null;
}

/* ── dealing: which three cards, this round ───────────────────────────────── */

export interface HistoryItem { cardId: string | null; references: number[] }
export interface DealtCard { id: string; text: string; count: number }

interface Cand { e: Entry; fresh: number[] }

function candidate(ix: Ix, e: Entry | null, rc: ReaderCard, taken: Set<string>, cited: Set<number>): Cand | null {
  if (!e || taken.has(e.id)) return null;
  if (e.roles && !e.roles.includes(rc.role)) return null;
  const mat = e.material(ix);
  if (mat.length < e.min) return null;
  const fresh = mat.filter((id) => !cited.has(id));
  // Never offer a card whose material has already been fully cited.
  if (!fresh.length) return null;
  return { e, fresh };
}

// Cards written for this reader's role outrank general ones; then deeper material.
const rank = (rc: ReaderCard) => (a: Cand, b: Cand) =>
  (b.e.roles?.includes(rc.role) ? 1 : 0) - (a.e.roles?.includes(rc.role) ? 1 : 0)
  || b.fresh.length - a.fresh.length || a.e.id.localeCompare(b.e.id);

export function dealCards(ix: Ix, rc: ReaderCard, history: HistoryItem[], tried: string[]) {
  const round = history.length + 1;
  if (round > EDITION_SECTIONS) return { round, cards: [] as DealtCard[], freeTextAllowed: false, complete: true };

  const cited = new Set(history.flatMap((h) => h.references));
  const taken = new Set([...history.map((h) => h.cardId).filter((x): x is string => !!x), ...tried]);
  const pool: Cand[] = [];
  const add = (c: Cand | null) => { if (c && !pool.some((p) => p.e.id === c.e.id)) pool.push(c); };
  const all = (): Cand[] => [
    ...LIBRARY.map((e) => candidate(ix, e, rc, taken, cited)),
    ...ix.topics.map((t) => candidate(ix, topicEntry(ix, t.slug, false), rc, taken, cited)),
  ].filter((c): c is Cand => !!c).sort(rank(rc));
  const serving = (interest: string) => all().filter((c) => c.e.serves.includes(interest));

  if (round === 1) {
    // Strongest available material for each of the reader's own interests.
    for (const i of rc.interests) add(serving(i)[0] ?? null);
    for (const i of rc.interests) for (const c of serving(i)) if (pool.length < 3) add(c);
  } else if (round === 2) {
    // Deeper, wider, and one from an interest not yet served.
    const last = history[history.length - 1];
    const lastTopics = new Map<string, number>();
    for (const id of last?.references ?? []) for (const t of ix.byId.get(id)?.topics ?? []) lastTopics.set(t, (lastTopics.get(t) ?? 0) + 1);
    const deepTopic = [...lastTopics.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const deep = deepTopic ? candidate(ix, topicEntry(ix, slug(deepTopic), true), rc, taken, cited) : null;
    add(deep);
    const coveredTopics = new Set([deepTopic, ...history.flatMap((h) => h.references.flatMap((id) => ix.byId.get(id)?.topics ?? []))]);
    const side = ix.topics
      .filter((t) => !coveredTopics.has(t.name))
      .map((t) => candidate(ix, topicEntry(ix, t.slug, false), rc, taken, cited))
      .filter((c): c is Cand => !!c).sort(rank(rc))[0] ?? null;
    add(side);
    const served = new Set(history.flatMap((h) => (h.cardId ? resolveEntry(ix, h.cardId)?.serves ?? [] : [])));
    for (const i of rc.interests.filter((x) => !served.has(x))) if (pool.length < 3) add(serving(i)[0] ?? null);
  } else if (round === 3) {
    // Something you didn't expect: the odd, the human, the priced.
    for (const c of all().filter((x) => x.e.odd)) if (pool.length < 3) add(c);
  } else {
    // Whatever is still uncovered, most material first.
    for (const c of all().sort((a, b) => b.fresh.length - a.fresh.length || a.e.id.localeCompare(b.e.id))) if (pool.length < 3) add(c);
  }
  for (const c of all()) if (pool.length < 3) add(c);

  return {
    round,
    cards: pool.slice(0, 3).map((c) => ({ id: c.e.id, text: c.e.card, count: c.fresh.length })),
    freeTextAllowed: round === EDITION_SECTIONS,
    complete: false,
  };
}

/* ── writing one section ──────────────────────────────────────────────────── */

export interface Crop { id: string; url: string; w: number; h: number; page: number; title: string | null }
export interface Section {
  headline: string;
  body: string;
  references: string[];          // "co-N", validated
  beyondThisIssue: string | null;
  crops: Array<Crop | { id: string; url: null; page: number; title: string | null }>;
}

function instructions(ix: Ix): string {
  return [
    `You are the Cleveland Public Library's reading room, writing one section of a patron's personal edition of one historic newspaper issue: ${ix.serial}, ${ix.dateLabel}.`,
    "",
    "YOUR SOURCE",
    "- The items in the document above are the ONLY text you have. A curator reviewed and published them. You have no other pages, no other issues, no archive.",
    "- The transcriptions were made by a machine from a scan; they contain errors and [illegible]/[loss] marks. Never repair them into something they don't say.",
    "- Pages read but not yet released are listed in the coverage header; you may say plainly that part of the issue is still with the curators.",
    "",
    "THE JOB",
    "- Rewrite what these items say in the reader's register. DIGESTIBLE IS NOT INVENTED: never add a fact, name, figure, date, quote or place that is not in the items you cite.",
    "- Quote the paper sparingly and exactly.",
    "- Do not moralize about the period; describe what the paper says and let the reader think.",
    "- One period term may get a gloss of at most one sentence; that gloss (and nothing else from outside the issue) goes in beyond_this_issue, never in the body.",
    "",
    "OUTPUT — a single JSON object and nothing else, with keys in this order:",
    '{"headline": "...", "body": "...", "references": ["co-123", "co-456"], "beyond_this_issue": null}',
    "- headline: under 12 words, in the reader's tone.",
    "- body: ONE paragraph, plain text, no markdown, and NO ids or citation marks inside it — sources go only in references.",
    "- references: the ids (exactly as they appear in the document, e.g. co-123) of every item the body draws on — 1 to 8 of them. Use ONLY ids that appear in the document. Never invent one. Keep the body to what up to 8 items can support.",
    "- beyond_this_issue: null, or at most one sentence of outside context.",
    "- If nothing in the issue fits the request, return references: [] and a body of one sentence saying so.",
  ].join("\n");
}

function task(ix: Ix, rc: ReaderCard, job: { card: string; instruction: string; material: number[] }, cited: number[]): string {
  const reg = REGISTER_RULE[rc.register];
  const start = job.material.slice(0, 30).map((id) => `co-${id}`).join(", ");
  return [
    `THE READER: ${ROLE_TONE[rc.role]}`,
    `THE REGISTER: ${reg.rule}`,
    "",
    `THEIR PICK: "${job.card}"`,
    `THE SECTION: ${job.instruction}`,
    start ? `START FROM THESE ITEMS (the ones that fit this pick): ${start}` : "Find the items that fit this pick yourself.",
    cited.length ? `ALREADY COVERED IN EARLIER SECTIONS — build on, don't repeat: ${cited.map((id) => `co-${id}`).join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

/** Headline and body as they stream — the JSON is incomplete, so read it loosely. */
function partialOf(raw: string): { headline?: string; body?: string } {
  const field = (k: string) => {
    const m = new RegExp(`"${k}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`).exec(raw);
    if (!m) return undefined;
    try { return JSON.parse(`"${m[1].replace(/\\$/, "")}"`) as string; } catch { return m[1]; }
  };
  return { headline: field("headline"), body: field("body") };
}

/**
 * The model's answer, made safe to render. Exported for the test that proves an
 * invented citation never survives.
 */
export function validateSection(raw: string, corpusIds: Set<number>, fallbackHeadline: string): Omit<Section, "crops"> {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  let o: Record<string, unknown> = {};
  try { o = JSON.parse(a >= 0 && b > a ? s.slice(a, b + 1) : s); } catch { o = {}; }

  const norm = (v: unknown) => {
    const n = Number(String(v).replace(/^\[*co-/, "").replace(/\]*$/, ""));
    return Number.isInteger(n) && corpusIds.has(n) ? `co-${n}` : null;
  };
  let body = typeof o.body === "string" ? o.body : "";
  // Ids the model slipped into the prose — [[co-1]], (co-1), (co-1, co-2) or a
  // bare co-1 — still count as citations if they're real, and never stay in the
  // text: a reader should see the newsprint crops, not our database keys.
  const inline = [...body.matchAll(/\bco-(\d+)\b/g)].map((m) => `co-${m[1]}`);
  body = body
    .replace(/\s*\[\[co-\d+\]\]/g, "")
    .replace(/\s*\((?:\s*co-\d+\s*[,;]?)+\)/g, "")
    .replace(/\s*\bco-\d+\b/g, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s+/g, " ").trim();
  const refs = [...(Array.isArray(o.references) ? o.references : []), ...inline]
    .map(norm).filter((x): x is string => !!x);
  const references = [...new Set(refs)].slice(0, MAX_REFS);

  let beyond = typeof o.beyond_this_issue === "string" ? o.beyond_this_issue.trim() : "";
  beyond = beyond.replace(/^beyond this issue:\s*/i, "");
  const first = beyond.match(/^.*?[.!?](\s|$)/)?.[0]?.trim();   // one sentence, as promised
  return {
    headline: (typeof o.headline === "string" && o.headline.trim() ? o.headline.trim() : fallbackHeadline).slice(0, 140),
    body,
    references,
    beyondThisIssue: beyond ? (first ?? beyond).slice(0, 320) : null,
  };
}

/** The newsprint behind a citation: a pixel-form IIIF crop of its largest box. */
async function cropFor(o: Obj): Promise<Crop | null> {
  // readingRects knows every stored shape, the legacy bare [x,y,w,h] included.
  const rects = readingRects(o.region).filter((r) => r.length === 4 && r[2] > 0 && r[3] > 0);
  if (!rects.length) return null;   // never draw a crop for an unlocated object
  const r = [...rects].sort((p, q) => q[2] * q[3] - p[2] * p[3])[0];
  const base = iiifId(o.record);
  const page = await pageSize(base);
  // ContentDM honours pixel regions and `w,` sizes exactly; pct: and !w,h fail silently.
  const px = { x: Math.round(r[0] * page.w), y: Math.round(r[1] * page.h), w: Math.round(r[2] * page.w), h: Math.round(r[3] * page.h) };
  const W = Math.min(480, px.w);
  return {
    id: `co-${o.id}`, url: `${base}/${px.x},${px.y},${px.w},${px.h}/${W},/0/default.jpg`,
    w: W, h: Math.round((W * px.h) / px.w), page: o.page, title: o.title,
  };
}

async function withCrops(ix: Ix, s: Omit<Section, "crops">): Promise<Section> {
  const crops = await Promise.all(s.references.map(async (ref) => {
    const o = ix.byId.get(Number(ref.slice(3)));
    const c = o ? await cropFor(o).catch(() => null) : null;
    return c ?? { id: ref, url: null, page: o?.page ?? 0, title: o?.title ?? null };
  }));
  return { ...s, crops };
}

export interface SectionRequest {
  pointer: number;
  readerCard: unknown;
  cardId?: string | null;
  freeText?: string | null;
  history: HistoryItem[];
  callsUsed: number;
  regeneratesUsed: number;
  regenerate?: boolean;       // replacing the last (free-text) section
  editionId?: string;
}

export type SectionEvent =
  | { type: "partial"; headline?: string; body?: string }
  | { type: "section"; section: Section; cached: boolean; modelCall: boolean; empty: false }
  | { type: "empty"; message: string; modelCall: true };

export async function writeSection(req: SectionRequest, emit: (e: SectionEvent) => void): Promise<void> {
  const rc = readReaderCard(req.readerCard);
  const history = (Array.isArray(req.history) ? req.history : []).map((h) => ({
    cardId: typeof h?.cardId === "string" ? h.cardId : null,
    references: (Array.isArray(h?.references) ? h.references : []).map((x: unknown) => Number(String(x).replace(/^co-/, ""))).filter(Number.isInteger),
  }));
  const priorSections = req.regenerate ? history.slice(0, -1) : history;
  const callsUsed = Math.max(0, Number(req.callsUsed) || 0);
  const tag = `[edition ${String(req.editionId ?? "-").slice(0, 12)}]`;

  // Refusals first — they are free, and a capped edition must stay capped.
  if (priorSections.length >= EDITION_SECTIONS) throw new ChatRefused("this edition is complete — four sections is the whole paper");
  if (req.regenerate && (Number(req.regeneratesUsed) || 0) >= EDITION_MAX_REGENERATES) {
    throw new ChatRefused(`that question has been asked ${EDITION_MAX_REGENERATES + 1} ways already — this edition keeps the last answer`);
  }

  const ix = await issueIndex(req.pointer);
  if (!ix.publishedCount) throw new ChatRefused("nothing from this issue has been published yet, so there is nothing to make an edition from");

  const free = typeof req.freeText === "string" ? req.freeText.trim().slice(0, FREE_TEXT_MAX) : "";
  let job: { card: string; instruction: string; material: number[]; cacheId: string | null };
  if (free) {
    if (priorSections.length !== EDITION_SECTIONS - 1) throw new ChatRefused("your own question comes in the last round");
    job = { card: free, instruction: `Answer the reader's own question from this issue: "${free}"`, material: [], cacheId: null };
  } else {
    const e = typeof req.cardId === "string" ? resolveEntry(ix, req.cardId) : null;
    if (!e) throw new ChatRefused("that card isn't one this issue can deal");
    const cited = new Set(priorSections.flatMap((h) => h.references));
    const mat = e.material(ix);
    job = { card: e.card, instruction: e.instruction, material: [...mat.filter((id) => !cited.has(id)), ...mat.filter((id) => cited.has(id))], cacheId: e.id };
  }

  // A card pick by the same kind of reader is the same section — serve it free.
  // Re-checked against what is published NOW: a cached section citing an item a
  // curator has since withdrawn is a miss, not a leak.
  if (job.cacheId) {
    const hit = (await query<{ section: Section }>(
      `SELECT section FROM edition_sections WHERE issue_pointer=$1 AND card_id=$2 AND register=$3 AND role=$4`,
      [req.pointer, job.cacheId, rc.register, rc.role])).rows[0];
    if (hit && hit.section.references.every((r) => ix.corpusIds.has(Number(r.slice(3))))) {
      console.log(`${tag} cache hit · p${req.pointer} · ${job.cacheId} · ${rc.role}/${rc.register} — no model call`);
      emit({ type: "section", section: hit.section, cached: true, modelCall: false, empty: false });
      return;
    }
  }

  if (callsUsed >= EDITION_MAX_CALLS) {
    throw new ChatRefused(`this edition has used all ${EDITION_MAX_CALLS} of its writing turns — print it as it stands, or start over`);
  }

  console.log(`${tag} model call ${callsUsed + 1}/${EDITION_MAX_CALLS} · p${req.pointer} · ${job.cacheId ?? "free text"} · ${rc.role}/${rc.register}`);
  const corpus = await buildIssueCorpus(req.pointer);
  let raw = "";
  let last = "";
  const stream = await streamMessages({
    corpus: corpus.document,
    instructions: instructions(ix),
    messages: [{ role: "user", content: task(ix, rc, job, priorSections.flatMap((h) => h.references)) }],
    // One paragraph from a known set of items: it needs care, not deliberation.
    effort: "medium",
    label: `Anthropic Your Edition (${CHAT_MODEL})`,
  }, (t) => {
    raw += t;
    const p = partialOf(raw);
    const key = `${p.headline ?? ""}\u0000${p.body ?? ""}`;
    if (key !== last) { last = key; emit({ type: "partial", ...p }); }
  });

  const v = validateSection(raw, ix.corpusIds, job.card);
  if (!v.references.length) {
    // Logged raw, so a card that keeps coming back empty can be diagnosed.
    console.log(`${tag} no surviving citations · ${job.cacheId ?? "free text"} — not a section · stop=${stream.stopReason} text=${stream.textChars} events=${stream.eventTypes.join(",")} · raw: ${raw.replace(/\s+/g, " ").slice(0, 600)}`);
    emit({ type: "empty", message: "Nothing in this issue matched that — try another card.", modelCall: true });
    return;
  }
  const section = await withCrops(ix, v);
  if (job.cacheId) {
    await query(
      `INSERT INTO edition_sections (issue_pointer, card_id, register, role, section, model)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (issue_pointer, card_id, register, role) DO NOTHING`,
      [req.pointer, job.cacheId, rc.register, rc.role, JSON.stringify(section), CHAT_MODEL]);
  }
  emit({ type: "section", section, cached: false, modelCall: true, empty: false });
}

/** The card text for an id — for share links, which carry picks, not prose. */
export function cardText(ix: Ix, cardId: string): string | null {
  return resolveEntry(ix, cardId)?.card ?? null;
}
