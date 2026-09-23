/**
 * Minimal History-API router. One store, one hook, one Link.
 *
 * Routes are matched by ``matchRoute`` into a discriminated union so
 * pages get typed params without a dependency.
 */
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', notify);
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  const current = window.location.pathname + window.location.search;
  if (current === to) return;
  if (opts.replace) window.history.replaceState({}, '', to);
  else window.history.pushState({}, '', to);
  notify();
}

function snapshot(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname + window.location.search;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export type Route =
  | { name: 'home' }
  | { name: 'feed' }
  | { name: 'interests' }
  | { name: 'interest'; key: string }
  | { name: 'wizard'; draft: string | null; source: string | null }
  | { name: 'vault' }
  | { name: 'settings' }
  | { name: 'notfound'; path: string };

export function matchRoute(full: string): Route {
  const qIdx = full.indexOf('?');
  const path = (qIdx >= 0 ? full.slice(0, qIdx) : full).replace(/\/+$/, '') || '/';
  const search = new URLSearchParams(qIdx >= 0 ? full.slice(qIdx + 1) : '');
  if (path === '/start' || path === '/home') return { name: 'home' };
  if (path === '/' || path === '/feed' || path === '/radar') return { name: 'feed' };
  if (path === '/interests' || path === '/profiles') return { name: 'interests' };
  if (path === '/interests/new' || path === '/profiles/new') {
    return { name: 'wizard', draft: search.get('draft'), source: search.get('source') };
  }
  const m = path.match(/^\/interests\/([^/]+)$/);
  if (m) return { name: 'interest', key: decodeURIComponent(m[1]) };
  if (path === '/vault' || path === '/library') return { name: 'vault' };
  if (path === '/settings') return { name: 'settings' };
  return { name: 'notfound', path };
}

export function useRoute(): Route {
  const full = useSyncExternalStore(subscribe, snapshot, () => '/');
  return matchRoute(full);
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, snapshot, () => '/');
}

export const paths = {
  home: '/start',
  feed: '/feed',
  interests: '/interests',
  interest: (key: string) => `/interests/${encodeURIComponent(key)}`,
  wizard: (draft?: string | null) =>
    draft ? `/interests/new?draft=${encodeURIComponent(draft)}` : '/interests/new',
  /** The wizard with a seed source preselected (``upload`` | ``orcid`` | ``prosopia``). */
  wizardFrom: (source: string) => `/interests/new?source=${encodeURIComponent(source)}`,
  vault: '/vault',
  settings: '/settings',
};
