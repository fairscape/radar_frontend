/** Draft-interest (wizard) endpoints. Shapes mirror ``rag_lib/api/schemas.py``. */
import type { Card, CoherenceLabel, Profile, SeedSimilarity, SweepRow, Topic, VaultDoc, YearSpan } from '../../types/radar';
import { apiDelete, apiGet, apiPost } from '../client';
import { invalidate, invalidateUnshown } from '../../lib/query';
import type { GatherRunStatus } from './profiles';

export interface Draft {
  slug: string;
  name: string;
}

export interface LeastSimilarPair {
  a_id: string;
  a_title: string;
  b_id: string;
  b_title: string;
  cosine: number;
}

export interface DraftCoherence {
  bins: number[];
  median: number;
  iqr: number;
  bimodal: boolean;
  n: number;
  label?: CoherenceLabel;
  agreement?: number | null;
  summary?: string;
  seed_similarity?: SeedSimilarity | null;
  least_similar?: LeastSimilarPair | null;
}

export interface DraftDryRun {
  sweep: SweepRow[];
  preview: Card[];
  /** Raw cosine per fetched candidate. */
  scores: number[];
  suggested_threshold?: number | null;
  seed_similarity?: SeedSimilarity | null;
  /** [lo, hi] the slider should span. */
  score_range?: [number, number] | number[] | null;
  /** Every scored paper, best first; absent from older backends. */
  papers?: DryRunPaper[];
}

export interface DryRunPaper {
  id: string;
  title: string;
  venue: string;
  year: number | null;
  /** Same value as ``scores`` -- what the threshold compares against. */
  score: number;
}

export interface DraftDryRunStatus {
  run: GatherRunStatus;
  result: DraftDryRun | null;
}

export interface CommitDraftRequest {
  slug: string;
  threshold: number;
  selected_topic_ids: string[];
  cron?: string;
  tz?: string;
  years?: { year_from: number | null; year_to: number | null } | null;
}

const enc = encodeURIComponent;

export async function createDraft(name: string): Promise<Draft> {
  const res = await apiPost<Draft>('/api/profiles/draft', { name });
  invalidate('profiles');
  return res;
}

export function listSeedDocs(profileSlug: string): Promise<VaultDoc[]> {
  return apiGet<VaultDoc[]>('/api/vault/docs', { tag: profileSlug });
}

export function getDraftCoherence(slug: string): Promise<DraftCoherence> {
  return apiPost<DraftCoherence>(`/api/profiles/draft/${enc(slug)}/coherence`);
}

/** UMLS extraction over a draft's seeds; step 3 lists topics once nothing is pending. */
export interface SeedUmlsStatus {
  enabled: boolean;
  total: number;
  done: number;
  pending: number;
  /** Could not be read; their OpenAlex topics still count. Retried later. */
  failed: number;
  running: boolean;
  /** False when the last topic list was built without (all of) the UMLS topics; the stored ones are kept. */
  topics_available?: boolean;
  topics_reason?: 'busy' | 'error' | 'bad_data' | 'pending' | 'failed' | null;
  topics_n?: number;
}

export function getSeedUmls(slug: string): Promise<SeedUmlsStatus> {
  return apiGet<SeedUmlsStatus>(`/api/profiles/${enc(slug)}/umls`);
}

/** Start extracting the seeds that have none yet (idempotent: running or nothing pending = status only). */
export function startSeedUmls(slug: string): Promise<SeedUmlsStatus> {
  return apiPost<SeedUmlsStatus>(`/api/profiles/${enc(slug)}/umls`);
}

export function getDraftTopics(slug: string): Promise<Topic[]> {
  return apiGet<Topic[]>(`/api/profiles/draft/${enc(slug)}/topics`);
}

/**
 * ``years``: sample each of those years (most cited first) instead of the last ``days``.
 * ``selectedTopicIds``: step 3's ticks, saved on the draft before the scan so it
 * searches only those topics; omit to keep what the draft has stored.
 */
export function startDraftDryRun(slug: string, days = 30, years?: YearSpan | null, selectedTopicIds?: string[] | null): Promise<{ ok: true; run_id: number }> {
  return apiPost<{ ok: true; run_id: number }>(`/api/profiles/draft/${enc(slug)}/dry-run`, {
    days,
    ...(years ? { year_from: years.from, year_to: years.to } : {}),
    ...(selectedTopicIds ? { selected_topic_ids: selectedTopicIds } : {}),
  });
}

export function getDraftDryRunStatus(slug: string, runId: number): Promise<DraftDryRunStatus> {
  return apiGet<DraftDryRunStatus>(`/api/profiles/draft/${enc(slug)}/dry-run/${runId}`);
}

export async function commitDraft(body: CommitDraftRequest): Promise<Profile> {
  const res = await apiPost<Profile>('/api/profiles', body);
  // 'researchers': a researcher's page lists its interests, this one as a draft until now.
  invalidate('profiles', 'vault', 'radar', 'researchers');
  // The draft's own reads are forgotten, not re-read: the draft is gone, and
  // the wizard still mounted on it 404'd re-reading its topics (round 19).
  invalidateUnshown(`draft/${body.slug}/`);
  return res;
}

export async function deleteDraft(slug: string): Promise<{ ok: boolean }> {
  const res = await apiDelete<{ ok: boolean }>(`/api/profiles/draft/${enc(slug)}`);
  // 'researchers': a researcher's interests (and their count) list drafts.
  invalidate('profiles', 'vault', 'researchers');
  return res;
}
