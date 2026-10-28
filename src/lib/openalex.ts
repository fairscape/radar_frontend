/**
 * Whether OpenAlex can be used (FUNCTIONAL_SPEC F2).
 *
 * When OpenAlex's daily quota is used up, or it wants an API key, the
 * backend pauses everything that needs it until the time OpenAlex gave and
 * answers 503 with ``openalex`` in the body. The shell shows a banner and
 * the upload drop zones are disabled while paused.
 */
import { useEffect } from 'react';
import { apiGet, onOpenAlexStatus } from '../api/client';
import { invalidateExact, setQueryData, useQuery } from './query';

export interface OpenAlexStatus {
  available: boolean;
  kind: 'quota' | 'auth' | 'down' | null;
  until: string | null;
  message: string | null;
}

const KEY = 'openalex/status';

export function useOpenAlexStatus() {
  const q = useQuery(KEY, () => apiGet<OpenAlexStatus>('/api/openalex/status'));
  const until = q.data?.until ? Date.parse(q.data.until) : NaN;
  // Look again once the pause is over, so the banner goes by itself.
  useEffect(() => {
    if (!Number.isFinite(until)) return;
    const t = window.setTimeout(() => invalidateExact(KEY), Math.max(1000, until - Date.now() + 1000));
    return () => window.clearTimeout(t);
  }, [until]);
  return q;
}

/** A 503 from any request carries the current status: show it at once. */
export function useOpenAlexStatusFromErrors(): void {
  useEffect(() => onOpenAlexStatus((s) => setQueryData<OpenAlexStatus>(KEY, () => s as OpenAlexStatus)), []);
}

/** True while paused. */
export function useOpenAlexPaused(): OpenAlexStatus | null {
  const { data } = useOpenAlexStatus();
  return data && !data.available ? data : null;
}
