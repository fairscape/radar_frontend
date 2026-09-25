/** Stored researcher profiles: ``/api/researchers``. */
import { apiDelete, apiGet, apiPost } from '../client';
import { invalidate } from '../../lib/query';
import type {
  Researcher,
  ResearcherDetail,
  ResearcherImportRequest,
  ResearcherImportStart,
  ResearcherInterestRequest,
  ResearcherInterestResponse,
  ResearcherSuggestions,
} from '../../types/researchers';

export function listResearchers(): Promise<Researcher[]> {
  return apiGet<Researcher[]>('/api/researchers');
}

export function getResearcher(id: number): Promise<ResearcherDetail> {
  return apiGet<ResearcherDetail>(`/api/researchers/${id}`);
}

/** Two or three groups of the profile's papers worth making interests from. A read; nothing is embedded. */
export function getResearcherSuggestions(id: number): Promise<ResearcherSuggestions> {
  return apiGet<ResearcherSuggestions>(`/api/researchers/${id}/suggestions`);
}

/** Starts (or refreshes) a profile; the papers arrive under ``run_id``. */
export async function startResearcherImport(body: ResearcherImportRequest): Promise<ResearcherImportStart> {
  const res = await apiPost<ResearcherImportStart>('/api/researchers/import', body);
  invalidate('researchers');
  return res;
}

export async function deleteResearcher(id: number): Promise<{ ok: boolean }> {
  const res = await apiDelete<{ ok: boolean }>(`/api/researchers/${id}`);
  invalidate('researchers', 'profiles');
  return res;
}

/** A draft seeded with the profile's papers. Synchronous: they are already embedded. */
export async function createInterestFromResearcher(id: number, body: ResearcherInterestRequest): Promise<ResearcherInterestResponse> {
  const res = await apiPost<ResearcherInterestResponse>(`/api/researchers/${id}/interests`, body);
  invalidate('researchers', 'profiles', 'vault');
  return res;
}

/** Attach papers the user already has (uploaded or imported with a profile) to a draft. */
export async function addDraftSeeds(slug: string, openalexIds: string[]): Promise<{ attached: number; rejected: string[] }> {
  const res = await apiPost<{ attached: number; rejected: string[] }>(`/api/profiles/draft/${encodeURIComponent(slug)}/seeds`, { openalex_ids: openalexIds });
  invalidate('profiles', 'vault', `draft/${slug}/`);
  return res;
}
