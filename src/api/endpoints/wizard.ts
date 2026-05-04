/**
 * Typed wrappers for the Phase 11 wizard endpoints.
 *
 * Names mirror the backend service in ``rag_lib/api/services/wizard.py``;
 * shapes mirror ``rag_lib/api/schemas.py``.
 */

import type { Card, Profile, SweepRow, Topic, VaultDoc } from '../../types/radar';
import { api } from '../client';
import type { GatherRunStatus } from './profiles';

export interface Draft {
  slug: string;
  name: string;
}

export interface DraftCoherence {
  bins: number[];
  median: number;
  iqr: number;
  bimodal: boolean;
  n: number;
}

export interface DraftDryRun {
  sweep: SweepRow[];
  preview: Card[];
  // Raw selector cosines, one per fetched candidate. The wizard's
  // calibration step bins these into a histogram and lets the user
  // slide θ to see how many would pass.
  scores: number[];
}

export interface DraftDryRunStart {
  ok: true;
  run_id: number;
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

export interface WizardOption {
  key: string;
  label: string;
  description: string;
  default: boolean;
}

export interface WizardOptions {
  embedders: WizardOption[];
  selectors: WizardOption[];
}

export function getWizardOptions(): Promise<WizardOptions> {
  return api.get<WizardOptions>('/api/profiles/wizard/options');
}

export interface CreateDraftBody {
  name: string;
  embedding_model?: string;
  selector?: string;
}

export function createDraft(body: CreateDraftBody | string): Promise<Draft> {
  // Backwards-compatible: a bare string still works ("just give me a
  // draft, server-side defaults are fine").
  const payload = typeof body === 'string' ? { name: body } : body;
  return api.post<Draft>('/api/profiles/draft', payload);
}

export function uploadSeed(
  file: File,
  profileSlug: string,
): Promise<VaultDoc> {
  const form = new FormData();
  form.append('file', file);
  form.append('profile_slug', profileSlug);
  return api.postForm<VaultDoc>('/api/vault/upload', form);
}

export function listSeedDocs(profileSlug: string): Promise<VaultDoc[]> {
  return api.get<VaultDoc[]>(
    `/api/vault/docs?tag=${encodeURIComponent(profileSlug)}`,
  );
}

export function getDraftCoherence(slug: string): Promise<DraftCoherence> {
  return api.post<DraftCoherence>(
    `/api/profiles/draft/${encodeURIComponent(slug)}/coherence`,
  );
}

export function getDraftTopics(slug: string): Promise<Topic[]> {
  return api.get<Topic[]>(
    `/api/profiles/draft/${encodeURIComponent(slug)}/topics`,
  );
}

export function dryRunDraft(
  slug: string,
  body: { days: number; thresholds?: number[] },
): Promise<DraftDryRunStart> {
  return api.post<DraftDryRunStart>(
    `/api/profiles/draft/${encodeURIComponent(slug)}/dry-run`,
    body,
  );
}

export function getDraftDryRunStatus(
  slug: string,
  runId: number,
): Promise<DraftDryRunStatus> {
  return api.get<DraftDryRunStatus>(
    `/api/profiles/draft/${encodeURIComponent(slug)}/dry-run/${runId}`,
  );
}

export function commitDraft(body: CommitDraftRequest): Promise<Profile> {
  return api.post<Profile>('/api/profiles', body);
}

export function deleteDraft(slug: string): Promise<{ ok: boolean }> {
  return api.delete<{ ok: boolean }>(
    `/api/profiles/draft/${encodeURIComponent(slug)}`,
  );
}
