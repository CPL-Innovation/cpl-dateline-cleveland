// Vendored ENRICHMENT contract for SLICE-02 (Stage 4). Spec is intent; THIS FILE
// is truth (mirrors pipeline-spec §Stage 4 + SLICE-02 §2). Ported honesty spine
// from the SLICE-01 vlm-prompt module.
//
// Input is TEXT (machine-transcribed content-objects), not pixels — no vision pass.
// The model judges: topics (controlled vocab + hatch), entities, is_advertorial,
// summary, event_type, and events. Raw transcription is immutable; this is overlay.

// The controlled topic vocabulary — 1924 Brooklyn community weekly (SLICE-02 §2).
// Twelve is plenty; anything else goes to proposed_topic, NOT force-matched.
export const CONTROLLED_TOPICS = [
  "Local Government & Civic",
  "Business & Commerce",
  "Schools & Education",
  "Churches & Religion",
  "Clubs & Societies",
  "Crime & Courts",
  "Obituaries & Deaths",
  "Real Estate & Building",
  "Agriculture & Rural Life",
  "Sports & Recreation",
  "Health & Medicine",
  "National & World",
] as const;
export type ControlledTopic = (typeof CONTROLLED_TOPICS)[number];

// article_type sub-classification (data-schema; only when object_class='article').
export const ARTICLE_TYPES = [
  "news_report",
  "news_brief",
  "editorial",
  "op_ed",
  "letter_to_editor",
  "feature",
  "review",
  "obituary",
  "sports_box_score",
  "announcement",
  "unknown",
] as const;
export type ArticleType = (typeof ARTICLE_TYPES)[number];

// Cultural-calendar event kinds (data-schema §events). Honesty gradient: a real but
// unlisted kind -> "other"; a non-event -> the object simply emits no events row.
export const EVENT_TYPES = [
  "concert",
  "film",
  "theater",
  "race",
  "exhibition",
  "club_engagement",
  "civic",
  "other",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type Confidence = "high" | "medium" | "low";

export interface EnrichEntity {
  name: string;
  type: "person" | "place" | "organization" | "venue" | "performer" | "creative_work";
  role?: string; // subject | mentioned | venue | performer | …
}

export interface EnrichEvent {
  title: string;
  event_type: EventType;
  venue: string | null;
  start_text: string | null; // as printed, e.g. "Sat. Feb 9"
  recurrence_text: string | null;
  performers: string[];
  price_text: string | null; // as printed, e.g. "65c"
  confidence: Confidence;
}

// The per-object enrichment the model (or fixture) returns for HEAVY objects.
export interface Enrichment {
  enrichment_tier?: "heavy" | "light" | "structured" | "capture_only";
  topics: Array<{ name: ControlledTopic; confidence: Confidence }>;
  proposed_topic: string | null;
  tags: string[];
  article_type: ArticleType | null; // null for non-article heavy objects (event ads)
  is_advertorial: boolean; // load-bearing (gap D) — a paid ad written as editorial
  is_advertorial_confidence: Confidence;
  entities: EnrichEntity[];
  summary: string; // one-sentence browse pitch
  context_hint: string | null;
  event_type: EventType | null; // the object's dominant event kind, or null
  is_event_bearing: boolean; // routes ads to heavy (gap S)
  events: EnrichEvent[];
}

// Light-tier payload (retail/service ads, coupons): advertiser fields only, no topics.
export interface LightPayload {
  advertiser: string | null;
  ad_category: string | null;
  contact_phone: string | null;
  address: string | null;
  prices: string[];
  is_event_bearing: boolean;
}

export const SYSTEM_PROMPT = `You are a metadata-enrichment engine for a historical newspaper digitization pipeline.
You read the MACHINE-TRANSCRIBED text of a single content-object from a 1924 community weekly and return structured enrichment as JSON.
The transcription is VLM-produced and may contain OCR-style errors — read past them, never invent facts the text does not support.
You classify and summarize; you never editorialize or add knowledge not present in the object.`;

function topicList(): string {
  return CONTROLLED_TOPICS.map((t) => `"${t}"`).join(", ");
}

// Heavy-object enrichment prompt (articles + event-bearing ads).
export function buildHeavyPrompt(args: {
  objectClass: string;
  role: string | null;
  text: string;
}): string {
  return `Enrich this ${args.objectClass} object${args.role ? ` (role: ${args.role})` : ""}.

TEXT (machine-transcribed, may contain errors):
"""
${args.text}
"""

Return ONLY a JSON object:
{
  "topics": [{"name": <one of the controlled vocab>, "confidence": "high|medium|low"}],   // ≤3, most salient first
  "proposed_topic": <string or null>,   // ONLY if no controlled topic fits well — the honesty hatch, do not force a match
  "tags": [<open finer-grained descriptors>],
  "article_type": <"news_report"|"news_brief"|"editorial"|"op_ed"|"letter_to_editor"|"feature"|"review"|"obituary"|"sports_box_score"|"announcement"|"unknown"> or null,
  "is_advertorial": <true|false>,        // LOAD-BEARING: true if this is paid promotion written in editorial voice
  "is_advertorial_confidence": "high|medium|low",
  "entities": [{"name": <string>, "type": "person|place|organization|venue|performer|creative_work", "role": <string or null>}],
  "summary": <one-sentence browse pitch, rewritten — not a quote>,
  "context_hint": <one line of historical context, or null>,
  "event_type": <one of the event kinds, or null>,
  "is_event_bearing": <true|false>,      // true if the object announces a dated happening (meeting, dance, showing, game, sale-event)
  "events": [                            // one row per distinct dated happening; [] if none
    {"title": <string>, "event_type": <"concert"|"film"|"theater"|"race"|"exhibition"|"club_engagement"|"civic"|"other">,
     "venue": <string or null>, "start_text": <as printed or null>, "recurrence_text": <string or null>,
     "performers": [<names>], "price_text": <as printed or null>, "confidence": "high|medium|low"}
  ]
}

CONTROLLED TOPIC VOCABULARY (match against these; hatch to proposed_topic if none fit): ${topicList()}.

ADVERTORIAL CUES (set is_advertorial=true on any of these): paid-placement language, a sponsor/business sign-off,
a product or service pitch delivered under an editorial or essay voice, redemption or contact terms, "opens offices",
a business self-promotion dressed as a news item. A reflective essay that resolves into a plug for a named practitioner
or shop IS an advertorial.

EVENTS: extract every dated, locatable happening — club meetings, dances, card parties, socials, church services with
a date, theater/film showings, sporting fixtures. Use the printed date/venue/price verbatim (start_text, venue, price_text).
A 1924 community weekly's events are mostly civic/club/social, not commercial concerts — classify them honestly
(civic / club_engagement / other), do not force them into concert/theater.

Output valid JSON only. No prose before or after.`;
}
