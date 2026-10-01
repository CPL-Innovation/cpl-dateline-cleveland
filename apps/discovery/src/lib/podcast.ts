// Your Edition, read aloud (SLICE-16) — the client half: ask for an episode,
// follow it while it's made, and the shape of what comes back.
//
// The server holds the episode (lib/podcast.ts in the pipeline), so the podcast
// page is addressable on its own: `?issue=p7622&view=podcast&pod=<id>` reopens it
// after a reload, or for anyone the patron sends it to.

import type { Built, ReaderCard } from './edition';
import { API } from './api';

export type PodStatus = 'queued' | 'scripting' | 'voicing' | 'mixing' | 'done' | 'failed';

export interface PodLine { speaker: 0 | 1; text: string; t0?: number; t1?: number }
export interface PodSegment { kind: 'intro' | 'section' | 'outro'; section: number | null; title: string; lines: PodLine[]; t0?: number; t1?: number }
export interface PodCrop { id: string; url: string | null; page: number; title: string | null }

export interface Podcast {
  id: string;
  status: PodStatus;
  progress: { done?: number; total?: number };
  error: string | null;
  pointer: number;
  serial: string | null;
  dateLabel: string | null;
  label: string | null;
  sections: Array<{ kicker: string; headline: string; references: string[]; crops: PodCrop[] }>;
  script: { title: string; segments: PodSegment[] } | null;
  queuePosition: number;
  hosts: Array<{ name: string; voice: string }>;
  format: 'duo' | 'solo';
  ttsModel: string | null;
  scriptModel: string | null;
  durationS: number | null;
  audioBytes: number | null;
}

export class PodcastRefusal extends Error {}

/** Every section must carry the server's signature — an edition made before
 *  signing existed can't be voiced, and the patron is told so up front. */
export function voiceable(sections: Built[]): boolean {
  return sections.length > 0 && sections.every((b) => !!b.signed);
}

export async function requestPodcast(pointer: number, rc: ReaderCard, label: string, sections: Built[]): Promise<{ id: string; cached: boolean }> {
  const r = await fetch(API() + '/api/podcast', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pointer, readerCard: rc, label,
      sections: sections.map((b) => ({ kicker: b.kicker, section: b.signed!.section, sig: b.signed!.sig })),
    }),
  }).catch(() => null);
  if (!r) throw new Error('The reading room is unreachable right now.');
  const j = await r.json();
  if (!r.ok) throw j.refused ? new PodcastRefusal(j.error) : new Error(j.error ?? 'HTTP ' + r.status);
  return j;
}

export async function fetchPodcast(id: string): Promise<Podcast> {
  const r = await fetch(API() + '/api/podcast?id=' + encodeURIComponent(id));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new PodcastRefusal(j.error ?? 'That episode couldn’t be found.');
  return j;
}

/** Try again with the reading room's current voices. The answer may be another
 *  episode — one those voices already made of this edition. */
export async function retryPodcast(id: string): Promise<{ id: string }> {
  const r = await fetch(API() + '/api/podcast/retry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new PodcastRefusal(j.error ?? 'It can’t be tried again right now.');
  return j;
}

export const audioUrl = (id: string, download = false) =>
  `${API()}/api/podcast/audio?id=${encodeURIComponent(id)}${download ? '&download=1' : ''}`;

export const podcastLink = (issueKey: string, id: string) =>
  `${location.origin}${location.pathname}?${new URLSearchParams({ issue: issueKey, view: 'podcast', pod: id })}`;

export const clock = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
