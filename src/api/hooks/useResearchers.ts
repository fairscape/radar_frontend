/**
 * useResearchers / useResearcherDetail — list and detail hooks for the
 * Researchers library, same state machine as useProfiles (focus
 * revalidation + the ``researchers:changed`` bus event).
 */

import { useCallback, useEffect, useState } from 'react';
import { getResearcher, listResearchers } from '../endpoints/researchers';
import type { ResearcherDetail, ResearcherSummary } from '../endpoints/researchers';
import { ApiError } from '../client';
import { dataBus } from '../../lib/dataBus';
import { useFocusRevalidate } from './useFocusRevalidate';

export function useResearchers() {
  const [researchers, setResearchers] = useState<ResearcherSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listResearchers()
      .then((r) => { if (!cancelled) setResearchers(r); })
      .catch((e) => { if (!cancelled) setError(e as Error); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshTick]);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);
  useFocusRevalidate(refresh);
  useEffect(() => dataBus.subscribe('researchers:changed', refresh), [refresh]);

  return { researchers, loading, error, refresh };
}

export function useResearcherDetail(id: number | null) {
  const [detail, setDetail] = useState<ResearcherDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (id === null) {
      setDetail(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getResearcher(id)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((e) => {
        if (cancelled) return;
        setDetail(null);
        setError(e as Error);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, refreshTick]);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);
  useEffect(() => dataBus.subscribe('researchers:changed', refresh), [refresh]);

  return { detail, loading, error, refresh };
}
