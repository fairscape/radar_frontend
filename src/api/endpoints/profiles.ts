/**
 * Interest ("profile" on the wire) endpoint helpers.
 *
 * Mutations invalidate the query cache for the data they change so
 * every mounted view refreshes.
 */
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../client';
import { invalidate, invalidateWhere, markStale, setQueryData } from '../../lib/query';
import type { YearSpan } from '../../types/radar';
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
import type { ProfileResearcherTopics } from '../../types/researchers';
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
  /** Null for a researcher import, which fills no interest. */
  profile_id: number | null;
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
  /** When the run last reported progress (server time); null before the first tick. */
  progress_updated_at?: string | null;
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
  // 'researchers': a researcher's page lists the interests built from them.
  invalidate('profiles', 'radar', 'researchers');
  return res;
}

export async function recomputeCoherence(key: string): Promise<DraftCoherence> {
  const res = await apiPost<DraftCoherence>(`/api/profiles/${enc(key)}/recompute-coherence`);
  invalidate('profiles');
  return res;
}

export async function recomputeTopics(key: string): Promise<Topic[]> {
  const res = await apiPost<Topic[]>(`/api/profiles/${enc(key)}/recompute-topics`);
  // `draft/<key>/`: Edit interest's topic step reads the list under that prefix.
  invalidate('profiles', `draft/${key}/`);
  return res;
}

/** A saved interest's topics re-aggregated from its seeds; writes nothing. New ones come back off. */
export function previewTopics(key: string): Promise<Topic[]> {
  return apiGet<Topic[]>(`/api/profiles/${enc(key)}/topics/preview`);
}

export interface InterestTerm { label: string; weight?: number | null; paper_ids?: string[]; kind?: string | null }
export interface InterestTerms {
  source: 'prosopia' | 'rp-sdk-llm' | 'rp-sdk-cluster' | 'manual' | null;
  model: string | null;
  generated_at: string | null;
  stale: boolean;
  terms: InterestTerm[];
  /** Struck out by the user: kept so they can be put back, never used. */
  removed: InterestTerm[];
  not_interests: string[];
  edited: boolean;
  usage?: Record<string, unknown> | null;
  seed_hash?: string | null;
  /** False for a freshly generated preview, which is not stored until saved. */
  saved: boolean;
}

/** An interest's research topics (Prosopia method); empty until generated. */
export function getTerms(key: string): Promise<InterestTerms> {
  return apiGet<InterestTerms>(`/api/profiles/${enc(key)}/terms`);
}

/**
 * Generate a preview (nothing is stored). ``apiKey`` is the user's Anthropic
 * key for this one call: sent in the body, never stored by the server;
 * null = clustering, no LLM.
 */
export function generateTerms(key: string, apiKey: string | null): Promise<InterestTerms> {
  return apiPost<InterestTerms>(`/api/profiles/${enc(key)}/terms/generate`, apiKey ? { api_key: apiKey } : {});
}

/**
 * Store topics: a generated preview being kept (pass its provenance in
 * ``from``), or edits to the stored ones (omit it).
 */
export async function saveTerms(key: string, terms: InterestTerm[], removed: InterestTerm[], notInterests: string[], from?: InterestTerms, edited = true): Promise<InterestTerms> {
  const provenance = from ? { source: from.source, model: from.model, generated_at: from.generated_at, seed_hash: from.seed_hash, usage: from.usage } : {};
  const res = await apiPut<InterestTerms>(`/api/profiles/${enc(key)}/terms`, { terms, removed, not_interests: notInterests, ...provenance, edited });
  // The saved list is shown at once: re-read, the editor sat "unsaved"
  // (and its leave guard asked) until the answer came back.
  setQueryData<InterestTerms>(`profiles/${key}/terms`, () => res);
  markStale(`profiles/${key}/terms`);
  // The rest of the interest: in topic mode the terms are the reranker's
  // queries (Rank refinement lists them).
  invalidateWhere((k) => k.startsWith(`profiles/${key}/`) && k !== `profiles/${key}/terms`);
  return res;
}

/** The topics the researcher this interest was built from declares on their profile, and whether they are applied. */
export function getResearcherTopics(key: string): Promise<ProfileResearcherTopics> {
  return apiGet<ProfileResearcherTopics>(`/api/profiles/${enc(key)}/researcher-topics`);
}

/**
 * Apply (or drop) the researcher's profile topics on a draft or a saved
 * interest: wanted topics join the list switched on, not-wanted ones are
 * switched off. Returns the new list.
 */
export async function setResearcherTopics(key: string, enabled: boolean): Promise<Topic[]> {
  const res = await apiPut<Topic[]>(`/api/profiles/${enc(key)}/researcher-topics`, { enabled });
  invalidate('profiles', `draft/${key}/`);
  return res;
}

/** Switch a saved interest's topics: exactly ``selectedIds`` on (409 if none). */
export async function saveTopics(key: string, selectedIds: string[]): Promise<Topic[]> {
  const res = await apiPut<Topic[]>(`/api/profiles/${enc(key)}/topics`, { selected_topic_ids: selectedIds });
  invalidate('profiles', `draft/${key}/`);
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
  invalidate('profiles', 'vault', 'radar', 'researchers', `draft/${key}/`);
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
  invalidate('profiles', 'vault', 'radar', 'researchers', `draft/${key}/`);
  return res;
}

/** Delete a saved interest with its seeds, stored papers, feedback and
 * scans. The papers themselves stay in the vault. 409 while it scans.
 *
 * Refetching is left to the caller, after it has left the interest's
 * page: invalidated while that page was still mounted, its queries asked
 * again for the interest just deleted (a 404 for each). */
export function deleteProfile(key: string): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/api/profiles/${enc(key)}`);
}

export function afterProfileDeleted(key: string): void {
  invalidate('profiles', 'vault', 'radar', 'researchers', `draft/${key}/`);
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

/** Fetch papers from past years into a live interest, once (a background run). */
export function backfill(key: string, years: YearSpan): Promise<{ ok: true; run_id: number }> {
  return apiPost<{ ok: true; run_id: number }>(`/api/profiles/${enc(key)}/backfill`, { year_from: years.from, year_to: years.to });
}

/** Set the years an interest's feed draws from; null clears the range. */
export async function updateProfileYears(key: string, years: YearSpan | null): Promise<Profile> {
  const res = await apiPatch<Profile>(`/api/profiles/${enc(key)}`, { years: years ? { year_from: years.from, year_to: years.to } : { year_from: null, year_to: null } });
  invalidate('profiles', 'radar', 'researchers');
  return res;
}

export function listProfileRuns(key: string, limit = 20): Promise<GatherRunStatus[]> {
  return apiGet<GatherRunStatus[]>(`/api/profiles/${enc(key)}/runs`, { limit });
}

/** What the interest's saves and dismisses say its threshold should be. */
export interface FeedbackThreshold {
  n_saved: number;
  n_dismissed: number;
  min_events: number;
  /** Null until ``min_events`` papers are triaged, with at least one save. */
  suggested: number | null;
  threshold: number | null;
}

export function getFeedbackThreshold(key: string): Promise<FeedbackThreshold> {
  return apiGet<FeedbackThreshold>(`/api/profiles/${enc(key)}/feedback-threshold`);
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

/** ``POST /api/profiles/{key}/llm-topics``: the OpenAlex topics added (off) and the list now. */
export interface LlmTopicsResult {
  added: Topic[];
  topics: Topic[];
  n_labels: number;
}

/**
 * Map the interest's saved Claude research topics to OpenAlex topics; the
 * new ones join the topic list as LLM topics, switched off. No LLM call.
 */
export async function mapLlmTopics(key: string): Promise<LlmTopicsResult> {
  const res = await apiPost<LlmTopicsResult>(`/api/profiles/${enc(key)}/llm-topics`);
  // The topic lists (detail, Edit interest step 3) read them.
  invalidate(`profiles/${key}/`);
  return res;
}
