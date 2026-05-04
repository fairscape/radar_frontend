/**
 * useProfiles / useProfileDetail — real-API mirror of the mock hooks.
 *
 * Same signatures and same internal state machine as
 * ``src/mock-api/hooks/useProfiles.ts`` so views see no behavioral
 * difference when ``apiSwitch`` flips between the two branches.
 *
 * Adds a few hardening behaviors over the mock:
 *  - Errors from ``listProfiles`` / ``getProfileDetail`` surface via the
 *    returned ``error`` so views can distinguish empty-result from
 *    "fetch failed" instead of rendering a misleading empty state.
 *  - Focus / visibility revalidation pulls fresh data when the user
 *    returns to the tab.
 *  - dataBus ``profiles:changed`` triggers a refetch on cross-component
 *    mutations (wizard commit, threshold update, recompute, ...).
 */

import { useCallback, useEffect, useState } from 'react';
import { listProfiles, getProfileDetail } from '../endpoints/profiles';
import type { ProfileDetail } from '../endpoints/profiles';
import type { Profile } from '../../types/radar';
import { ApiError } from '../client';
import { dataBus } from '../../lib/dataBus';
import { useFocusRevalidate } from './useFocusRevalidate';

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listProfiles()
      .then((p) => { if (!cancelled) setProfiles(p); })
      .catch((e) => { if (!cancelled) setError(e as Error); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshTick]);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);
  useFocusRevalidate(refresh);
  useEffect(() => dataBus.subscribe('profiles:changed', refresh), [refresh]);

  return { profiles, loading, error, refresh };
}

export function useProfileDetail(key: string) {
  const [detail, setDetail] = useState<ProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!key) {
      setDetail(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getProfileDetail(key)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((e) => {
        if (cancelled) return;
        setDetail(null);
        setError(e as Error);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [key, refreshTick]);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);
  useFocusRevalidate(refresh);
  useEffect(() => dataBus.subscribe('profiles:changed', refresh), [refresh]);

  return { detail, loading, error, refresh };
}
