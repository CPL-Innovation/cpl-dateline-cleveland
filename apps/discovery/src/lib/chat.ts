// Client for the reading-room assistant (POST /api/chat, SSE over fetch).
//
// EventSource can't carry a conversation up with the request, so the stream is
// read off fetch's body. Two failure kinds are kept apart on purpose: a REFUSAL
// is the assistant's own answer (turn cap reached, nothing published to discuss)
// and belongs in the thread; anything else is the service failing and says so.

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export class ChatRefusal extends Error {}

const API = () => 'http://' + location.hostname + ':5170';

export async function streamChat(
  pointer: number,
  messages: ChatTurn[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(API() + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pointer, messages }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error('The reading room is unreachable (HTTP ' + res.status + ').');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let failure: Error | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE frames are blank-line delimited; a partial frame stays in the buffer.
    const frames = buf.split('\n\n');
    buf = frames.pop() ?? '';
    for (const frame of frames) {
      let event = 'message';
      let data = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      const payload = JSON.parse(data) as { text?: string; message?: string; refused?: boolean };
      if (event === 'delta' && payload.text) onDelta(payload.text);
      else if (event === 'error') {
        failure = payload.refused
          ? new ChatRefusal(payload.message ?? 'I can’t answer that here.')
          : new Error(payload.message ?? 'The assistant stopped unexpectedly.');
      }
    }
  }
  if (failure) throw failure;
}

/* ── the assistant's answer, as renderable pieces ───────────────────────────── */

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'cite'; id: string };

export interface Block {
  bullet: boolean;
  segments: Segment[];
}

/**
 * Answers arrive as light markdown with [[co-N]] citation markers. This parses
 * exactly what the assistant is asked to produce — paragraphs, bullets, bold, and
 * citations — and nothing more; anything else stays literal text rather than
 * dragging a markdown engine into a reading surface.
 */
export function parseAnswer(text: string): Block[] {
  const blocks: Block[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    const bullet = /^\s*[-*•]\s+/.test(line);
    const body = bullet ? line.replace(/^\s*[-*•]\s+/, '') : line;
    blocks.push({ bullet, segments: parseInline(body) });
  }
  return blocks;
}

function parseInline(s: string): Segment[] {
  const out: Segment[] = [];
  const re = /\[\[(co-\d+)\]\]|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ kind: 'text', text: s.slice(last, m.index) });
    if (m[1]) out.push({ kind: 'cite', id: m[1] });
    else out.push({ kind: 'bold', text: m[2] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ kind: 'text', text: s.slice(last) });
  return out;
}
