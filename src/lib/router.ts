/**
 * Minimal History-API router. One store, one hook, one Link.
 *
 * Routes are matched by ``matchRoute`` into a discriminated union so
 * pages get typed params without a dependency.
 */
import { useCallback, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}

/**
 * A page with unsaved work registers a guard; every way out of the page --
 * in-app links, ``navigate``, the browser's Back/Forward, closing the tab --
 * asks it first. Several can hold unsaved work at once (Edit interest's
 * topic ticks and its Research topics panel); each is asked in turn.
 */
type LeaveGuard = () => Promise<boolean>;
// Named, so a page that has just saved can leave past its own guard only:
// ``force`` skipped every guard, and Edit interest's "Save topics and
// continue" dropped an unsaved Research topics edit without asking.
const guards = new Map<LeaveGuard, string | undefined>();
function currentGuard(skip: string[] = []): LeaveGuard | null {
  const list = [...guards].filter(([, name]) => !name || !skip.includes(name)).map(([g]) => g);
  if (list.length === 0) return null;
  return async () => {
    for (const g of list) if (!(await g())) return false;
    return true;
  };
}
let shownUrl = typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search;
// Each history entry this page made carries its position, so a guarded
// Back/Forward can be undone with history.go() -- keeping the entries as
// they were -- instead of pushing a copy of the page (which left a
// duplicate that the next Back stopped on, and dropped Forward).
let shownIdx = 0;
let restoring = false;   // the popstate of our own go() back to the page
let asking = false;

function entryIdx(state: unknown): number | null {
  const idx = (state as { idx?: unknown } | null)?.idx;
  return typeof idx === 'number' ? idx : null;
}

/** Ask ``guard`` before leaving the page; returns the function that stops asking. */
export function addLeaveGuard(guard: LeaveGuard, name?: string): () => void {
  guards.set(guard, name);
  return () => { guards.delete(guard); };
}

if (typeof window !== 'undefined') {
  const start = entryIdx(window.history.state);
  if (start === null) window.history.replaceState({ ...(window.history.state ?? {}), idx: 0 }, '');
  shownIdx = start ?? 0;
  window.addEventListener('popstate', (e) => {
    const target = window.location.pathname + window.location.search;
    const idx = entryIdx(e.state);
    if (restoring) {
      restoring = false;
      return;
    }
    const guard = currentGuard();
    if (!guard || target === shownUrl) {
      shownUrl = target;
      if (idx !== null) shownIdx = idx;
      notify();
      return;
    }
    // Back/Forward cannot be cancelled: return to the page's entry, ask,
    // and only then go where the button pointed.
    const delta = idx !== null ? shownIdx - idx : null;
    if (delta) {
      restoring = true;
      window.history.go(delta);
    } else {
      window.history.pushState({ idx: shownIdx }, '', shownUrl);
    }
    if (asking) return;   // a second Back while the question is open
    asking = true;
    void guard().then((ok) => {
      asking = false;
      if (!ok) return;
      guards.clear();
      if (delta) {
        window.history.go(-delta);   // its popstate, unguarded now, shows the page
      } else {
        window.history.replaceState({ idx: shownIdx }, '', target);
        shownUrl = target;
        notify();
      }
    });
  });
  window.addEventListener('beforeunload', (e) => {
    if (guards.size > 0) e.preventDefault();
  });
}

/**
 * ``force``: past every guard (the page's object is gone, nothing to keep).
 * ``past``: past the guards of these names only (what the caller just saved).
 */
export function navigate(to: string, opts: { replace?: boolean; force?: boolean; past?: string[] } = {}): void {
  if (typeof window === 'undefined') return;
  const current = window.location.pathname + window.location.search;
  if (current === to) return;
  const guard = currentGuard(opts.past);
  if (guard && !opts.force) {
    void guard().then((ok) => {
      if (!ok) return;
      guards.clear();
      navigate(to, { ...opts, force: true });
    });
    return;
  }
  if (opts.replace) {
    window.history.replaceState({ idx: shownIdx }, '', to);
  } else {
    shownIdx += 1;
    window.history.pushState({ idx: shownIdx }, '', to);
  }
  shownUrl = to;
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
  | { name: 'interest'; key: string; tab: string | null }
  | { name: 'interestEdit'; key: string; step: number | null }
  | { name: 'wizard'; draft: string | null; source: string | null; researcher: number | null; step: number | null }
  | { name: 'profiles' }
  | { name: 'profile'; id: number; check: boolean }
  | { name: 'vault' }
  | { name: 'settings' }
  | { name: 'notfound'; path: string };

export function matchRoute(full: string): Route {
  const qIdx = full.indexOf('?');
  const path = (qIdx >= 0 ? full.slice(0, qIdx) : full).replace(/\/+$/, '') || '/';
  const search = new URLSearchParams(qIdx >= 0 ? full.slice(qIdx + 1) : '');
  if (path === '/start' || path === '/home') return { name: 'home' };
  if (path === '/' || path === '/feed' || path === '/radar') return { name: 'feed' };
  if (path === '/interests') return { name: 'interests' };
  if (path === '/interests/new') {
    const r = search.get('researcher');
    const st = search.get('step');
    return {
      name: 'wizard', draft: search.get('draft'), source: search.get('source'),
      researcher: r && /^\d+$/.test(r) ? Number(r) : null,
      step: st && /^[1-4]$/.test(st) ? Number(st) : null,
    };
  }
  const me = path.match(/^\/interests\/([^/]+)\/edit$/);
  if (me) {
    const key = decodeKey(me[1]);
    if (key === null) return { name: 'notfound', path };
    const st = search.get('step');
    return { name: 'interestEdit', key, step: st && /^[1-4]$/.test(st) ? Number(st) : null };
  }
  const m = path.match(/^\/interests\/([^/]+)$/);
  if (m) {
    const key = decodeKey(m[1]);
    return key === null ? { name: 'notfound', path } : { name: 'interest', key, tab: search.get('tab') };
  }
  // "Profile" is a stored researcher (see terms.ts); interests live under /interests.
  if (path === '/profiles') return { name: 'profiles' };
  const pm = path.match(/^\/profiles\/(\d+)$/);
  if (pm) return { name: 'profile', id: Number(pm[1]), check: search.has('check') };
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

/**
 * A page setting kept in the URL's query (a tab, a filter): in component
 * state, a reload or Back to the page reset it (round 19). Set in place
 * (replace), so Back leaves the page rather than stepping through filters;
 * null removes it. Several sets in a row each start from the current URL.
 */
export function useSearchParam(name: string): [string | null, (v: string | null) => void] {
  const path = usePath();
  const value = new URLSearchParams(path.split('?')[1] ?? '').get(name);
  const set = useCallback((v: string | null) => {
    const q = new URLSearchParams(window.location.search);
    if (v == null) q.delete(name);
    else q.set(name, v);
    const qs = q.toString();
    navigate(`${window.location.pathname}${qs ? `?${qs}` : ''}`, { replace: true });
  }, [name]);
  return [value, set];
}

export const paths = {
  home: '/start',
  feed: '/feed',
  interests: '/interests',
  /** ``tab`` opens that tab (``seeds``, ``threshold``…); it is in the URL so Back moves between tabs. */
  interest: (key: string, tab?: string | null) => `/interests/${encodeURIComponent(key)}${tab ? `?tab=${encodeURIComponent(tab)}` : ''}`,
  /** ``step`` puts the wizard step in the URL, so the browser's Back button moves between steps. */
  /** Re-walk a saved interest's steps (seeds, check, topics, threshold); ``step`` is in the URL so Back works. */
  interestEdit: (key: string, step?: number | null) => `/interests/${encodeURIComponent(key)}/edit${step ? `?step=${step}` : ''}`,
  wizard: (draft?: string | null, step?: number | null) =>
    draft ? `/interests/new?draft=${encodeURIComponent(draft)}${step ? `&step=${step}` : ''}` : '/interests/new',
  /** The wizard with a seed source preselected (``upload`` | ``orcid`` | ``prosopia`` | ``profile``). */
  wizardFrom: (source: string, researcher?: number | null) =>
    `/interests/new?source=${encodeURIComponent(source)}${researcher != null ? `&researcher=${researcher}` : ''}`,
  profiles: '/profiles',
  /** ``check`` opens "Check for new papers" on arrival. */
  profile: (id: number, check?: boolean) => `/profiles/${id}${check ? '?check' : ''}`,
  vault: '/vault',
  settings: '/settings',
};

/** ``decodeURIComponent`` throws on a truncated escape (``/interests/foo%``); that is a wrong link, not a crash. */
function decodeKey(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}
