/**
 * Interest ("profile" on the wire) endpoint helpers.
 *
 * Mutations invalidate the query cache for the data they change so
 * every mounted view refreshes.
 */
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../client';
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
import type { DraftCoherence, DryRunPaper } from './wizard';

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
  /** Every stored candidate, best first, above and below the threshold. */
  papers?: DryRunPaper[];
}

const enc = encodeURIComponent;

/** One unfinished draft, as the resume prompt shows it. */
export interface DraftSummary {
  slug: string;
  name: string;
  created_at: string | null;
  updated_at: string | null;
  n_seeds: number;
  orcid: string | null;
  researcher_name: string | null;
  researcher_source: string | null;
  /**
   * What the draft is waiting for, and so where resuming should land.
   * `importing` means a run is still filling it -- show progress, not an
   * empty seed list. `failed` means the last import errored and attached
   * nothing, which without its own state is indistinguishable from a draft
   * nobody ever imported into.
   */
  phase: 'importing' | 'failed' | 'seeded' | 'empty';
  /** The open import's run id, for polling. Null unless phase is importing. */
  import_run_id: number | null;
  /** Why the last import failed. Set only when phase is failed. */
  import_error: string | null;
}

/**
 * The server's list of unfinished drafts.
 *
 * Asked on entry rather than trusting sessionStorage: a draft left in
 * another browser, or after site data was cleared, is otherwise invisible
 * and accumulates.
 */
export function listDrafts(): Promise<DraftSummary[]> {
  return apiGet<DraftSummary[]>('/api/profiles/drafts');
}

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

/** A saved interest's topics re-aggregated from its seeds; writes nothing. New ones come back off. */
export function previewTopics(key: string): Promise<Topic[]> {
  return apiGet<Topic[]>(`/api/profiles/${enc(key)}/topics/preview`);
}

/** Switch a saved interest's topics: exactly ``selectedIds`` on (409 if none). */
export async function saveTopics(key: string, selectedIds: string[]): Promise<Topic[]> {
  const res = await apiPut<Topic[]>(`/api/profiles/${enc(key)}/topics`, { selected_topic_ids: selectedIds });
  invalidate('profiles');
  return res;
}

export async function refitProfile(key: string): Promise<{ ok: true; key: string; cost: string }> {
  const res = await apiPost<{ ok: true; key: string; cost: string }>(`/api/profiles/${enc(key)}/refit`);
  invalidate('profiles', 'radar');
  return res;
}

/**
 * Attach papers the user already has -- uploads, a researcher's papers, or
 * papers from the feed -- as seeds of a draft or a live interest. Papers
 * without a vector are embedded, and a live interest is re-fitted and the
 * papers it already found re-scored against the new seeds (``rescored``;
 * null for a draft).
 */
export async function addSeeds(key: string, openalexIds: string[]): Promise<{ attached: number; rejected: string[]; rescored?: number | null }> {
  const res = await apiPost<{ attached: number; rejected: string[]; rescored?: number | null }>(`/api/profiles/${enc(key)}/seeds`, { openalex_ids: openalexIds });
  invalidate('profiles', 'vault', 'radar', `draft/${key}/`);
  return res;
}

/**
 * Remove one seed from a draft or a live interest (re-fitted at once).
 * The id goes in the query string: it is usually https://openalex.org/W…,
 * and in the path its encoded slashes were decoded before routing, so the
 * old route answered 404 for almost every seed.
 */
export async function removeSeed(key: string, openalexId: string): Promise<{ ok: boolean }> {
  const res = await apiDelete<{ ok: boolean }>(`/api/profiles/${enc(key)}/seeds?openalex_id=${enc(openalexId)}`);
  invalidate('profiles', 'vault', 'radar', `draft/${key}/`);
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
