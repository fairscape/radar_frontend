import { useCallback, useEffect, useState } from 'react';
import {
  getDailyRadar,
  saveCard as apiSave,
  dismissCard as apiDismiss,
} from '../endpoints/radar';
import type {
  CardState,
  DailyRadarFilters,
  DailyRadarResponse,
} from '../../types/radar';

export function useDailyRadar(filters: DailyRadarFilters) {
  const [data, setData] = useState<DailyRadarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    getDailyRadar(filters)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e as Error); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters.profile, filters.bucket]);

  useEffect(() => fetchData(), [fetchData]);

  const save = useCallback(async (id: string) => {
    const { state } = await apiSave(id);
    setData((prev) => prev ? { ...prev, states: { ...prev.states, [id]: state } } : prev);
  }, []);

  const dismiss = useCallback(async (id: string) => {
    const { state } = await apiDismiss(id);
    setData((prev) => prev ? { ...prev, states: { ...prev.states, [id]: state } } : prev);
  }, []);

  const setLocalState = useCallback((id: string, state: CardState) => {
    setData((prev) => prev ? { ...prev, states: { ...prev.states, [id]: state } } : prev);
  }, []);

  const refresh = useCallback(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, save, dismiss, setLocalState, refresh };
}
