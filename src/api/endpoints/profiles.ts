/**
 * Interest ("profile" on the wire) endpoint helpers.
 *
 * Mutations invalidate the query cache for the data they change so
 * every mounted view refreshes.
 */
import { apiGet, apiPatch, apiPost } from '../client';
import { invalidate } from '../../lib/query';
import type {
  FeedbackEvent,
  Profile,
  RerankerComparisonResponse,
  Seed,
  SeedSimilarity,
  SweepRow,
  Topic,
  TopicYieldResponse,
} from '../../types/radar';
import type { DraftCoherence } from './wizard';

export type { DraftCoherence } from './wizard';

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

export interface DryRunResult {
  ok: true;
  key: string;
  n: number;
  /** Raw cosine of every gathered candidate. */
  scores: number[];
  suggested_threshold?: number | null;
  seed_similarity?: SeedSimilarity | null;
  score_range?: [number, number] | number[] | null;
}

const enc = encodeURIComponent;

export function listProfiles(): Promise<Profile[]> {
  return apiGet<Profile[]>('/api/profiles');
}

export async function getProfileDetail(key: string): Promise<ProfileDetail | null> {
  return (await apiGet<ProfileDetail | null>(`/api/profiles/${enc(key)}/detail`)) ?? null;
}

export async function updateProfileThreshold(key: string, threshold: number): Promise<Profile> {
  const res = await apiPatch<Profile>(`/api/profiles/${enc(key)}`, { threshold });
  invalidate('profiles', 'radar');
  return res;
}

export async function recomputeCoherence(key: string): Promise<DraftCoherence> {
  const res = await apiPost<DraftCoherence>(`/api/profiles/${enc(key)}/recompute-coherence`);
  invalidate('profiles');
  return res;
}

export async function recomputeTopics(key: string): Promise<Topic[]> {
  const res = await apiPost<Topic[]>(`/api/profiles/${enc(key)}/recompute-topics`);
  invalidate('profiles');
  return res;
}

export async function refitProfile(key: string): Promise<{ ok: true; key: string; cost: string }> {
  const res = await apiPost<{ ok: true; key: string; cost: string }>(`/api/profiles/${enc(key)}/refit`);
  invalidate('profiles', 'radar');
  return res;
}

/** Persisted candidate scores for a live interest (not a new scan). */
export function candidateScores(key: string): Promise<DryRunResult> {
  return apiPost<DryRunResult>(`/api/profiles/${enc(key)}/dry-run`);
}

export function gatherNow(
  key: string,
  opts: { days?: number; limit?: number } = {},
): Promise<{ ok: true; run_id: number }> {
  return apiPost<{ ok: true; run_id: number }>(
    `/api/profiles/${enc(key)}/gather-now` +
      `?days=${opts.days ?? 7}&limit=${opts.limit ?? 500}`,
  );
}

export function listProfileRuns(key: string, limit = 20): Promise<GatherRunStatus[]> {
  return apiGet<GatherRunStatus[]>(`/api/profiles/${enc(key)}/runs`, { limit });
}

export function listProfileFeedback(key: string, limit = 50): Promise<FeedbackEvent[]> {
  return apiGet<FeedbackEvent[]>(`/api/profiles/${enc(key)}/feedback`, { limit });
}

export function getRerankerComparison(key: string, limit = 50): Promise<RerankerComparisonResponse> {
  return apiGet<RerankerComparisonResponse>(`/api/profiles/${enc(key)}/reranker-comparison`, { limit });
}

export function getTopicYield(key: string, days = 30): Promise<TopicYieldResponse> {
  return apiGet<TopicYieldResponse>(`/api/profiles/${enc(key)}/topic-yield`, { days });
}

export interface Schedule {
  profile_id: number;
  cron: string;
  tz: string;
  enabled: boolean;
  updated_at: string | null;
}

export async function updateSchedule(
  key: string,
  body: { cron?: string; tz?: string; enabled?: boolean },
): Promise<Schedule> {
  const res = await apiPatch<Schedule>(`/api/profiles/${enc(key)}/schedule`, body);
  invalidate('profiles');
  return res;
}
