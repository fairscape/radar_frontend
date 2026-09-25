/**
 * A very small request cache.
 *
 * One entry per string key. Components subscribe with ``useQuery``; the
 * sidebar and a page asking for the same key share one request and one
 * result. Mutations call ``invalidate(prefix)`` to refetch everything
 * that is on screen and drop everything that is not.
 *
 * Focus / visibility revalidation is global and throttled.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

interface Entry<T> {
  key: string;
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  version: number;
  updatedAt: number;
  subs: Set<() => void>;
  fetcher: () => Promise<T>;
  inflight: Promise<void> | null;
}

const STALE_MS = 15_000;
const FOCUS_THROTTLE_MS = 5_000;

const cache = new Map<string, Entry<unknown>>();

function bump(entry: Entry<unknown>) {
  entry.version += 1;
  entry.subs.forEach((cb) => cb());
}

function getEntry<T>(key: string, fetcher: () => Promise<T>): Entry<T> {
  let e = cache.get(key) as Entry<T> | undefined;
  if (!e) {
    e = {
      key,
      data: undefined,
      error: null,
      loading: false,
      version: 0,
      updatedAt: 0,
      subs: new Set(),
      fetcher,
      inflight: null,
    };
    cache.set(key, e as Entry<unknown>);
  }
  e.fetcher = fetcher;
  return e;
}

function run<T>(entry: Entry<T>): Promise<void> {
  if (entry.inflight) return entry.inflight;
  entry.loading = true;
  bump(entry as Entry<unknown>);
  const p = entry
    .fetcher()
    .then((d) => {
      entry.data = d;
      entry.error = null;
      entry.updatedAt = Date.now();
    })
    .catch((err: unknown) => {
      entry.error = err instanceof Error ? err : new Error(String(err));
    })
    .finally(() => {
      entry.loading = false;
      entry.inflight = null;
      bump(entry as Entry<unknown>);
    });
  entry.inflight = p;
  return p;
}

/** Refetch every mounted entry whose key starts with ``prefix``; forget the rest. */
export function invalidate(...prefixes: string[]): void {
  for (const [key, entry] of cache) {
    if (!prefixes.some((p) => key === p || key.startsWith(p))) continue;
    if (entry.subs.size > 0) {
      void run(entry);
    } else {
      cache.delete(key);
    }
  }
}

/** Write a value straight into the cache (optimistic updates). */
export function setQueryData<T>(key: string, updater: (prev: T | undefined) => T): void {
  const entry = cache.get(key) as Entry<T> | undefined;
  if (!entry) return;
  entry.data = updater(entry.data);
  entry.updatedAt = Date.now();
  bump(entry as Entry<unknown>);
}

export function getQueryData<T>(key: string): T | undefined {
  return (cache.get(key) as Entry<T> | undefined)?.data;
}

let lastFocusRun = 0;
function revalidateAll() {
  const now = Date.now();
  if (now - lastFocusRun < FOCUS_THROTTLE_MS) return;
  lastFocusRun = now;
  for (const entry of cache.values()) {
    if (entry.subs.size > 0 && !entry.inflight) void run(entry);
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('focus', revalidateAll);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') revalidateAll();
  });
}

export interface QueryResult<T> {
  data: T | undefined;
  error: Error | null;
  /** True only while there is no data yet. Refetches are silent. */
  loading: boolean;
  /** True during any fetch, including silent refetches. */
  fetching: boolean;
  refresh: () => Promise<void>;
}

/**
 * ``key`` may be null to disable the query (returns an idle result).
 * ``fetcher`` is captured fresh on every render, so closures over props
 * are fine; the key is what identifies the request.
 */
export function useQuery<T>(key: string | null, fetcher: () => Promise<T>): QueryResult<T> {
  const entry = key ? getEntry(key, fetcher) : null;
  const entryRef = useRef(entry);
  entryRef.current = entry;

  useSyncExternalStore(
    useCallback(
      (cb) => {
        if (!entry) return () => {};
        entry.subs.add(cb);
        return () => {
          entry.subs.delete(cb);
        };
      },
      [entry],
    ),
    () => (entry ? entry.version : -1),
    () => -1,
  );

  useEffect(() => {
    if (!entry) return;
    const stale = Date.now() - entry.updatedAt > STALE_MS;
    if ((entry.data === undefined || stale) && !entry.inflight) void run(entry);
  }, [entry]);

  const refresh = useCallback(() => {
    const e = entryRef.current;
    return e ? run(e) : Promise.resolve();
  }, []);

  if (!entry) {
    return { data: undefined, error: null, loading: false, fetching: false, refresh };
  }
  return {
    data: entry.data,
    error: entry.error,
    loading: entry.data === undefined && (entry.loading || entry.error === null),
    fetching: entry.loading,
    refresh,
  };
}
