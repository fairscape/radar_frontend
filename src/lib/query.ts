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
  /** Invalidated while a request was in flight: that answer may predate the change. */
  again: boolean;
  /** When a render last asked for this entry (it may not have subscribed yet). */
  leasedAt: number;
  /** Fetched when there is no data and on invalidation only: never on focus or staleness. */
  once: boolean;
}

const STALE_MS = 15_000;
const FOCUS_THROTTLE_MS = 5_000;
// A render asks for an entry before the component subscribes (the
// subscription is an effect). An invalidation in that window found no
// subscribers and dropped the entry; the component then subscribed to a
// detached object that nothing could refresh again.
const LEASE_MS = 5_000;

const cache = new Map<string, Entry<unknown>>();

function bump(entry: Entry<unknown>) {
  entry.version += 1;
  entry.subs.forEach((cb) => cb());
}

function getEntry<T>(key: string, fetcher: () => Promise<T>, once = false): Entry<T> {
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
      again: false,
      leasedAt: 0,
      once,
    };
    cache.set(key, e as Entry<unknown>);
  }
  e.fetcher = fetcher;
  e.once = once;
  e.leasedAt = Date.now();
  return e;
}

function run<T>(entry: Entry<T>): Promise<void> {
  if (entry.inflight) return entry.inflight;
  entry.loading = true;
  bump(entry as Entry<unknown>);
  const p = entry
    .fetcher()
    .then((d) => {
      // A follow-up queued by markStale()/rerun() means this answer predates
      // a change (a reorder, a save): the page would show the old state for
      // one round-trip. The follow-up's answer is the one that lands.
      if (entry.again) return;
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
      if (entry.again) {
        entry.again = false;
        void run(entry);
      }
    });
  entry.inflight = p;
  return p;
}

/**
 * Fetch again, now. A request already in flight was sent before whatever
 * prompted this (an apply, a save), so its answer may predate the change:
 * it is not joined; one more fetch follows it, and the promise settles
 * after that one.
 */
function rerun<T>(entry: Entry<T>): Promise<void> {
  if (entry.inflight) {
    entry.again = true;
    return entry.inflight.then(() => entry.inflight ?? Promise.resolve());
  }
  return run(entry);
}

function invalidateEntry(key: string, entry: Entry<unknown>): void {
  if (entry.subs.size > 0) {
    // A request already in flight was sent before this change (several
    // uploads in a row invalidate each time): joining it showed the list
    // without the last upload. Fetch once more when it lands.
    if (entry.inflight) entry.again = true;
    else void run(entry);
  } else if (Date.now() - entry.leasedAt < LEASE_MS) {
    // Handed to a render that has not subscribed yet: kept, and stale, so
    // the mount effect (or the in-flight request's follow-up) fetches.
    entry.updatedAt = 0;
    if (entry.inflight) entry.again = true;
  } else {
    cache.delete(key);
  }
}

/** Refetch every mounted entry whose key starts with ``prefix``; forget the rest. */
export function invalidate(...prefixes: string[]): void {
  for (const [key, entry] of cache) {
    if (!prefixes.some((p) => key === p || key.startsWith(p))) continue;
    invalidateEntry(key, entry);
  }
}

/** As ``invalidate``, for exactly these keys: nothing that merely starts with them. */
export function invalidateExact(...keys: string[]): void {
  for (const [key, entry] of cache) {
    if (!keys.includes(key)) continue;
    invalidateEntry(key, entry);
  }
}

/**
 * Forget everything: another person signed in on this browser. Entries a
 * mounted component still holds are emptied and refetched rather than
 * dropped (dropped, they would be detached from the cache for good).
 */
export function clearQueryCache(): void {
  for (const [key, entry] of cache) {
    if (entry.subs.size > 0 || Date.now() - entry.leasedAt < LEASE_MS) {
      entry.data = undefined;
      entry.error = null;
      entry.updatedAt = 0;
      if (entry.inflight) entry.again = true;
      else if (entry.subs.size > 0) void run(entry);
      bump(entry);
    } else {
      cache.delete(key);
    }
  }
}

/**
 * After a write whose answer was put in the cache with ``setQueryData``: a
 * read of the same key still in flight was sent before the write and would
 * overwrite it with the old state when it lands. It fetches once more instead.
 */
export function markStale(...keys: string[]): void {
  for (const key of keys) {
    const entry = cache.get(key);
    if (entry?.inflight) entry.again = true;
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
    if (entry.subs.size > 0 && !entry.inflight && !entry.once) void run(entry);
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

export interface QueryOptions {
  /**
   * Fetch when there is no data and when invalidated or refreshed, never
   * because the tab regained focus or the data aged. For a fetcher that is
   * a request the server does work for (a recompute, a scoring pass).
   */
  once?: boolean;
}

/**
 * ``key`` may be null to disable the query (returns an idle result).
 * ``fetcher`` is captured fresh on every render, so closures over props
 * are fine; the key is what identifies the request.
 */
export function useQuery<T>(key: string | null, fetcher: () => Promise<T>, opts?: QueryOptions): QueryResult<T> {
  const entry = key ? getEntry(key, fetcher, opts?.once === true) : null;
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
    // updatedAt 0 is an invalidation that found this entry leased but not
    // yet subscribed: fetched now, `once` or not.
    if ((entry.data === undefined || entry.updatedAt === 0 || (stale && !entry.once)) && !entry.inflight) void run(entry);
  }, [entry]);

  const refresh = useCallback(() => {
    const e = entryRef.current;
    return e ? rerun(e) : Promise.resolve();
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
