/**
 * useVault — real-API mirror of the mock hook.
 *
 * Same return shape as ``src/mock-api/hooks/useVault.ts`` plus an
 * ``error`` field. The view distinguishes "loading", "fetch failed",
 * and "real empty result" so a backend hiccup no longer renders as
 * "no papers". On a refetch we keep the previous successful values
 * visible until the new ones arrive (no flash of empty state).
 *
 * Refetches when ``tag`` changes, on tab focus / visibility, and on
 * ``vault:changed`` / ``profiles:changed`` events from the dataBus.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  listVaultDocs,
  getVaultStats,
  getTagCounts,
  getVaultMeta,
  type VaultMeta,
} from '../endpoints/vault';
import type { VaultDoc, VaultStats } from '../../types/radar';
import { ApiError } from '../client';
import { dataBus } from '../../lib/dataBus';
import { useFocusRevalidate } from './useFocusRevalidate';

export function useVault(tag: string) {
  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [meta, setMeta] = useState<VaultMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      listVaultDocs(tag),
      getVaultStats(),
      getTagCounts(),
      getVaultMeta(),
    ]).then(([d, s, c, m]) => {
      if (cancelled) return;
      setDocs(d);
      setStats(s);
      setTagCounts(c);
      setMeta(m);
    }).catch((e) => {
      if (cancelled) return;
      // Keep previous successful values visible — the view picks the
      // right empty/error/loading branch off ``error`` and ``docs``.
      setError(e as Error);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tag, refreshTick]);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);
  useFocusRevalidate(refresh);
  useEffect(() => dataBus.subscribe('vault:changed', refresh), [refresh]);
  useEffect(() => dataBus.subscribe('profiles:changed', refresh), [refresh]);

  return { docs, stats, tagCounts, meta, loading, error, refresh };
}
