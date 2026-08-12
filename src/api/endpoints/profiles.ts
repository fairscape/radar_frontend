/**
 * Real-API profiles endpoint helpers.
 *
 * Signatures intentionally mirror ``src/mock-api/endpoints/profiles.ts``
 * so views can swap branches via ``src/lib/apiSwitch.ts`` without
 * touching component code.
 */

import { apiGet, apiPatch, apiPost } from '../client';
import type { Profile, Seed, SweepRow, Topic } from '../../types/radar';
import { dataBus } from '../../lib/dataBus';

export interface DraftCoherence {
  bins: number[];
  median: number;
  iqr: number;
  bimodal: boolean;
  n: number;
}

export interface ProfileDetail {
  profile: Profile;
  seeds: Seed[];
  topics: Topic[];
  sweep: SweepRow[];
  coherenceBins: number[];
  coherenceStats: { min: number; max: number };
  feedbackLog: string[];
  feedbackMoreCount: number;
}

export function listProfiles(): Promise<Profile[]> {
  return apiGet<Profile[]>('/api/profiles');
}

export async function getProfile(key: string): Promise<Profile | null> {
  const res = await apiGet<Profile | null>(`/api/profiles/${encodeURIComponent(key)}`);
  return res ?? null;
}

export async function getProfileDetail(key: string): Promise<ProfileDetail | null> {
  const res = await apiGet<ProfileDetail | null>(
    `/api/profiles/${encodeURIComponent(key)}/detail`,
  );
  return res ?? null;
}

export async function refitProfile(key: string): Promise<{ ok: true; key: string; cost: string }> {
  const res = await apiPost<{ ok: true; key: string; cost: string }>(
    `/api/profiles/${encodeURIComponent(key)}/refit`,
  );
  dataBus.emit('profiles:changed');
  return res;
}

export interface DryRunResult {
  ok: true;
  key: string;
  n: number;
  scores: number[];
}

export function dryRunProfile(key: string): Promise<DryRunResult> {
  return apiPost<DryRunResult>(
    `/api/profiles/${encodeURIComponent(key)}/dry-run`,
  );
}

export async function updateProfileThreshold(
  key: string,
  threshold: number,
): Promise<Profile> {
  const res = await apiPatch<Profile>(
    `/api/profiles/${encodeURIComponent(key)}`,
    { threshold },
  );
  dataBus.emit('profiles:changed');
  // θ controls which candidates pass — radar inbox composition shifts
  // immediately after a save, so refresh that view too.
  dataBus.emit('radar:changed');
  return res;
}

export async function recomputeCoherence(key: string): Promise<DraftCoherence> {
  const res = await apiPost<DraftCoherence>(
    `/api/profiles/${encodeURIComponent(key)}/recompute-coherence`,
  );
  dataBus.emit('profiles:changed');
  return res;
}

export async function recomputeTopics(key: string): Promise<Topic[]> {
  const res = await apiPost<Topic[]>(
    `/api/profiles/${encodeURIComponent(key)}/recompute-topics`,
  );
  dataBus.emit('profiles:changed');
  return res;
}

export interface GatherRunStatus {
  id: number;
  profile_id: number;
  started_at: string;
  finished_at: string | null;
  since_date: string | null;
  filter_string: string | null;
  tier_used: string | null;
  n_fetched: number | null;
  n_new: number | null;
  n_redup: number | null;
  api_calls: number | null;
  error: string | null;
  current_step: string | null;
  n_processed: number | null;
  n_total: number | null;
  last_message: string | null;
}

export function gatherNow(
  key: string,
  opts: { days?: number; limit?: number } = {},
): Promise<{ ok: true; run_id: number }> {
  const params = new URLSearchParams();
  if (opts.days !== undefined) params.set('days', String(opts.days));
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  const qs = params.toString();
  const path = `/api/profiles/${encodeURIComponent(key)}/gather-now${qs ? `?${qs}` : ''}`;
  return apiPost<{ ok: true; run_id: number }>(path);
}

export function listProfileRuns(key: string, limit = 20): Promise<GatherRunStatus[]> {
  return apiGet<GatherRunStatus[]>(
    `/api/profiles/${encodeURIComponent(key)}/runs`,
    { limit },
  );
}

export function getRerankerComparison(
  key: string,
  limit = 50,
): Promise<import('../../types/radar').RerankerComparisonResponse> {
  return apiGet<import('../../types/radar').RerankerComparisonResponse>(
    `/api/profiles/${encodeURIComponent(key)}/reranker-comparison`,
    { limit },
  );
}
