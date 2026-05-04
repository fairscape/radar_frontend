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
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshTick]);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);
  return { profiles, loading, error: null as Error | null, refresh };
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
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [key, refreshTick]);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);
  return { detail, loading, error: null as Error | null, refresh };
}
