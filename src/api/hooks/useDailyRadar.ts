/**
 * useDailyRadar — real-API mirror of the mock hook.
 *
 * Optimistic save/dismiss: we apply the toggled state locally before
 * the request resolves so the UI feels instant; on ApiError we roll
 * back to the previous value. This mirrors the mock's perceived
 * behavior (latency was simulated locally there).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  getDailyRadar,
  saveCard as apiSave,
  dismissCard as apiDismiss,
} from '../endpoints/radar';
import { ApiError } from '../client';
import type {
  CardState,
  DailyRadarFilters,
  DailyRadarResponse,
} from '../../types/radar';
import { dataBus } from '../../lib/dataBus';
import { useFocusRevalidate } from './useFocusRevalidate';

export function useDailyRadar(filters: DailyRadarFilters) {
  const [data, setData] = useState<DailyRadarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    getDailyRadar(filters)
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e as Error); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.profile, filters.bucket]);

  useEffect(() => fetchData(), [fetchData]);

  const toggle = useCallback(
    async (id: string, target: 'saved' | 'dismissed', call: typeof apiSave) => {
      // Optimistic: capture prior state, flip locally, roll back on error.
      let prior: CardState | undefined;
      setData((prev) => {
        if (!prev) return prev;
        prior = prev.states[id] ?? null;
        const next: CardState = prior === target ? null : target;
        return { ...prev, states: { ...prev.states, [id]: next } };
      });
      try {
        const { state } = await call(id);
        setData((prev) => prev ? { ...prev, states: { ...prev.states, [id]: state } } : prev);
      } catch (e) {
        // Roll back. We swallow the error here so the view doesn't
        // explode; the network tab still shows what happened.
        setData((prev) => prev ? { ...prev, states: { ...prev.states, [id]: prior ?? null } } : prev);
        if (e instanceof ApiError) {
          // eslint-disable-next-line no-console
          console.warn('card action failed', e.status, e.body);
        } else {
          throw e;
        }
      }
    },
    [],
  );

  const save = useCallback((id: string) => toggle(id, 'saved', apiSave), [toggle]);
  const dismiss = useCallback((id: string) => toggle(id, 'dismissed', apiDismiss), [toggle]);

  const setLocalState = useCallback((id: string, state: CardState) => {
    setData((prev) => prev ? { ...prev, states: { ...prev.states, [id]: state } } : prev);
  }, []);

  const refresh = useCallback(() => { fetchData(); }, [fetchData]);
  useFocusRevalidate(refresh);
  useEffect(() => dataBus.subscribe('radar:changed', refresh), [refresh]);
  useEffect(() => dataBus.subscribe('profiles:changed', refresh), [refresh]);

  return { data, loading, error, save, dismiss, setLocalState, refresh };
}
