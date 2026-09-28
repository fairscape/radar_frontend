/**
 * Typed wrappers for the Phase 11 wizard endpoints.
 *
 * Names mirror the backend service in ``rag_lib/api/services/wizard.py``;
 * shapes mirror ``rag_lib/api/schemas.py``.
 */

import type { Card, Profile, SweepRow, Topic, VaultDoc } from '../../types/radar';
import { api } from '../client';
import type { GatherRunStatus } from './profiles';
import { dataBus } from '../../lib/dataBus';

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

export interface OrcidDraftStart {
  slug: string;
  name: string;
  run_id: number;
}

export interface OrcidAuthor {
  orcid: string;
  openalex_author_id: string | null;
  display_name: string;
  institution: string | null;
}

export interface OrcidImportResult {
  /** "fetch": works fetched and offered; "seed": the chosen works are seeded */
  phase: 'fetch' | 'seed';
  n_fetched: number;
  n_kept: number;
  n_works: number;
  n_default_seeds: number;
  n_seeds: number;
  n_embedded: number;
  author: OrcidAuthor;
  rp_profile_dir: string | null;
  warnings: string[];
  report: Record<string, number>;
  /** "From Profile" imports: what the expertise / not_interests did to the concept list */
  rp?: RpImportSummary | null;
}

export interface RpSignalEntry {
  id: string;
  display_name: string | null;
  by: string;
  similarity: number;
}

export interface RpImportSummary {
  level: string | null;
  provenance: string | null;
  n_expertise: number;
  n_not_interests: number;
  switched_off: RpSignalEntry[];
  switched_on: RpSignalEntry[];
  added: RpSignalEntry[];
  overruled?: RpSignalEntry[];
}

export interface CreateDraftFromProfileBody {
  /** the text of a Researcher Profile profile.jsonld */
  profile_json: string;
  name?: string;
  mailto?: string;
}

export interface RpDraftStart {
  slug: string;
  name: string;
  /** "orcid": the OpenAlex import was dispatched (poll run_id); "pdf": no ORCID, upload PDFs */
  mode: 'orcid' | 'pdf';
  run_id: number | null;
  orcid: string | null;
  warnings: string[];
}

/**
 * Create a draft from a Researcher Profile document. 422 when the text is
 * not a usable profile, 404 when its ORCID is unknown to OpenAlex, 409 when
 * an import of that ORCID is already running.
 */
export function createDraftFromProfile(
  body: CreateDraftFromProfileBody,
): Promise<RpDraftStart> {
  return api.post<RpDraftStart>('/api/profiles/draft/from-profile', body);
}

export interface OrcidImportStatus {
  run: GatherRunStatus;
  result: OrcidImportResult | null;
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

export interface DraftSummary {
  slug: string;
  name: string;
  created_at: string | null;
  updated_at: string | null;
  n_seeds: number;
  orcid: string | null;
  researcher_name: string | null;
  /** an ORCID import job is still running for this draft */
  importing: boolean;
  /** latest ORCID import run, so the wizard can resume polling / show its result */
  import_run_id: number | null;
  /** seeded from a Researcher Profile document */
  rp: boolean;
  /** fetched works waiting in the seed picker */
  n_works: number;
  /** ORCID / profile drafts: fetching | selecting | seeding | seeded; null for PDF drafts */
  phase: 'fetching' | 'selecting' | 'seeding' | 'seeded' | null;
}

/** The current user's unfinished drafts on the server, newest first. */
export function listDrafts(): Promise<DraftSummary[]> {
  return api.get<DraftSummary[]>('/api/profiles/drafts');
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

export async function uploadSeed(
  file: File,
  profileSlug: string,
): Promise<VaultDoc> {
  const form = new FormData();
  form.append('file', file);
  form.append('profile_slug', profileSlug);
  const res = await api.postForm<VaultDoc>('/api/vault/upload', form);
  dataBus.emit('vault:changed');
  return res;
}

export interface CreateDraftFromOrcidBody {
  orcid: string;
  name?: string;
  mailto?: string;
}

/**
 * Create a draft seeded from a researcher's OpenAlex works. The backend
 * resolves the author synchronously (404 for an unknown ORCID, 409 when an
 * import of the same ORCID is already running), then fetches + embeds in
 * the background; poll ``getOrcidImportStatus``.
 */
export function createDraftFromOrcid(
  body: CreateDraftFromOrcidBody,
): Promise<OrcidDraftStart> {
  return api.post<OrcidDraftStart>('/api/profiles/draft/from-orcid', body);
}

export function getOrcidImportStatus(
  slug: string,
  runId: number,
): Promise<OrcidImportStatus> {
  return api.get<OrcidImportStatus>(
    `/api/profiles/draft/${encodeURIComponent(slug)}/import/${runId}`,
  );
}

/** One fetched work of an ORCID / profile draft, as the seed picker shows it. */
export interface OrcidWork {
  openalex_id: string;
  title: string;
  year: number | null;
  venue: string | null;
  doi: string | null;
  first_author: string | null;
  position: string | null;
  is_corresponding: boolean;
  author_index: number | null;
  total_authors: number | null;
  work_type: string | null;
  cited_by_count: number;
  claimed: boolean | null;
  seed_eligible: boolean;
  dup_of: string | null;
  has_abstract: boolean;
  default_selected: boolean;
  selected: boolean | null;
  is_seed: boolean;
}

/** The works the fetch phase offered for seeding. */
export function listDraftWorks(slug: string): Promise<OrcidWork[]> {
  return api.get<OrcidWork[]>(`/api/profiles/draft/${encodeURIComponent(slug)}/works`);
}

/** Phase B: confirm which works become seeds; poll the returned run_id. */
export function selectDraftSeeds(slug: string, openalexIds: string[]): Promise<OrcidDraftStart> {
  return api.post<OrcidDraftStart>(
    `/api/profiles/draft/${encodeURIComponent(slug)}/seeds/select`,
    { openalex_ids: openalexIds },
  );
}

/** Seeds attached to a draft, whoever uploaded them (ORCID imports have no vault doc). */
export function listDraftSeeds(slug: string): Promise<VaultDoc[]> {
  return api.get<VaultDoc[]>(
    `/api/profiles/draft/${encodeURIComponent(slug)}/seeds`,
  );
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

export async function commitDraft(body: CommitDraftRequest): Promise<Profile> {
  const res = await api.post<Profile>('/api/profiles', body);
  // New profile lives in the sidebar list and changes vault tag counts
  // (the seeds are tagged to it).
  dataBus.emit('profiles:changed');
  dataBus.emit('vault:changed');
  return res;
}

export async function deleteDraft(slug: string): Promise<{ ok: boolean }> {
  const res = await api.delete<{ ok: boolean }>(
    `/api/profiles/draft/${encodeURIComponent(slug)}`,
  );
  dataBus.emit('profiles:changed');
  return res;
}
