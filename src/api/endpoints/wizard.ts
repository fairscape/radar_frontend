/** Draft-interest (wizard) endpoints. Shapes mirror ``rag_lib/api/schemas.py``. */
import type { Card, CoherenceLabel, Profile, SeedSimilarity, SweepRow, Topic, VaultDoc } from '../../types/radar';
import { apiDelete, apiGet, apiPost } from '../client';
import { invalidate } from '../../lib/query';
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

export function getDraftTopics(slug: string): Promise<Topic[]> {
  return apiGet<Topic[]>(`/api/profiles/draft/${enc(slug)}/topics`);
}

export function startDraftDryRun(slug: string, days = 30): Promise<{ ok: true; run_id: number }> {
  return apiPost<{ ok: true; run_id: number }>(`/api/profiles/draft/${enc(slug)}/dry-run`, { days });
}

export function getDraftDryRunStatus(slug: string, runId: number): Promise<DraftDryRunStatus> {
  return apiGet<DraftDryRunStatus>(`/api/profiles/draft/${enc(slug)}/dry-run/${runId}`);
}

export async function commitDraft(body: CommitDraftRequest): Promise<Profile> {
  const res = await apiPost<Profile>('/api/profiles', body);
  invalidate('profiles', 'vault', 'radar');
  return res;
}

/** Take one paper out of a draft's seeds. The paper stays in the vault. */
export async function removeDraftSeed(slug: string, openalexId: string): Promise<{ ok: boolean }> {
  const res = await apiDelete<{ ok: boolean }>(`/api/profiles/draft/${enc(slug)}/seeds/${enc(openalexId)}`);
  invalidate('profiles', 'vault', `draft/${slug}/`);
  return res;
}

export async function deleteDraft(slug: string): Promise<{ ok: boolean }> {
  const res = await apiDelete<{ ok: boolean }>(`/api/profiles/draft/${enc(slug)}`);
  invalidate('profiles', 'vault');
  return res;
}
