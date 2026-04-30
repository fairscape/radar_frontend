/**
 * useProfiles / useProfileDetail — real-API mirror of the mock hooks.
 *
 * Same signatures and same internal state machine as
 * ``src/mock-api/hooks/useProfiles.ts`` so views see no behavioral
 * difference when ``apiSwitch`` flips between the two branches.
 */

import { useCallback, useEffect, useState } from 'react';
import { listProfiles, getProfileDetail } from '../endpoints/profiles';
import type { ProfileDetail } from '../endpoints/profiles';
import type { Profile } from '../../types/radar';

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listProfiles()
      .then((p) => { if (!cancelled) setProfiles(p); })
      .catch(() => { /* let view render the empty state. */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshTick]);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);
  return { profiles, loading, refresh };
}

export function useProfileDetail(key: string) {
  const [detail, setDetail] = useState<ProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!key) {
      setDetail(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getProfileDetail(key)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch(() => { if (!cancelled) setDetail(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [key, refreshTick]);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);
  return { detail, loading, refresh };
}
