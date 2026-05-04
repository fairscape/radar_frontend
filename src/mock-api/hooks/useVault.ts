import { useCallback, useEffect, useState } from 'react';
import { listVaultDocs, getVaultStats, getTagCounts, getVaultMeta } from '../endpoints/vault';
import type { VaultDoc, VaultStats } from '../../types/radar';

export function useVault(tag: string) {
  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [meta, setMeta] = useState<Awaited<ReturnType<typeof getVaultMeta>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tag, refreshTick]);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);
  return { docs, stats, tagCounts, meta, loading, error: null as Error | null, refresh };
}
