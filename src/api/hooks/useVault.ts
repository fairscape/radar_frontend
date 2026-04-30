/**
 * useVault — real-API mirror of the mock hook.
 *
 * Same return shape: ``{ docs, stats, tagCounts, meta, loading }``.
 * Refetches when ``tag`` changes; loading is true on first fetch and
 * resets per tag change so the view's spinner reappears.
 */

import { useEffect, useState } from 'react';
import {
  listVaultDocs,
  getVaultStats,
  getTagCounts,
  getVaultMeta,
  type VaultMeta,
} from '../endpoints/vault';
import type { VaultDoc, VaultStats } from '../../types/radar';

export function useVault(tag: string) {
  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [meta, setMeta] = useState<VaultMeta | null>(null);
  const [loading, setLoading] = useState(true);

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
    }).catch(() => {
      // Leave previous state visible; view's error UX is best-effort.
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tag]);

  return { docs, stats, tagCounts, meta, loading };
}
