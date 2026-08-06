// Minimal two-route path router (no dependency). The patron discovery SPA lives
// at the base path; the staff editorial workbench is slugged at `<base>/staff`.
// Deep-linking to /staff in a production static build needs an SPA fallback
// rewrite; the Vite dev server provides that automatically.

import { useSyncExternalStore } from 'react';

export type Route = 'discovery' | 'staff';

const BASE = import.meta.env.BASE_URL || '/';
const norm = (p: string) => p.replace(/\/+$/, '');
const STAFF_PATH = norm(BASE) + '/staff';

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener('popstate', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('popstate', cb);
  };
}

function snapshot(): Route {
  return norm(window.location.pathname).endsWith('/staff') ? 'staff' : 'discovery';
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, snapshot);
}

export function navigate(to: Route) {
  const path = to === 'staff' ? STAFF_PATH : BASE;
  if (norm(window.location.pathname) !== norm(path)) {
    window.history.pushState({}, '', path);
    emit();
  }
}

/** href for the staff route (so links are middle-click / open-in-new-tab friendly). */
export const staffHref = STAFF_PATH;

/** URL of the vendored workbench HOME asset served from public/. SLICE-07: /staff
 *  now opens the corpus coverage dashboard (the level above a single issue); the
 *  dashboard links through to the per-issue review workbench (staff.html) for the
 *  one enriched issue. */
export const staffAsset = BASE + 'staff-dashboard.html';

/**
 * Deep link from a patron object straight to that object in the staff workbench.
 * `object` is the content-object id (`co-N`); the workbench selects and scrolls to
 * it once the page loads. Returns null when we don't know which page it came from
 * (mock items have no real page behind them) so the caller can hide the affordance
 * rather than offer a link that lands nowhere.
 */
export function workbenchHref(
  pageRecord?: number | null,
  printedPage?: number | null,
  objectId?: string | null,
): string | null {
  if (!pageRecord) return null;
  const q = new URLSearchParams({ api: '1', record: String(pageRecord) });
  if (printedPage) q.set('page', String(printedPage));
  if (objectId) q.set('object', objectId);
  return BASE + 'staff.html?' + q.toString();
}
