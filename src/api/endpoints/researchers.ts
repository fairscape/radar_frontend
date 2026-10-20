/** Stored researcher profiles: ``/api/researchers``. */
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../client';
import { invalidate, invalidateExact, setQueryData } from '../../lib/query';
import type {
  Researcher,
  ResearcherDetail,
  ResearcherMark,
  ResearcherImportRequest,
  ResearcherImportStart,
  ResearcherInterestRequest,
  ResearcherInterestResponse,
  ResearcherSuggestions,
  ResearcherWorks,
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

/** The profile's source read again, with the works it already has marked. Nothing is written. */
export function getResearcherWorks(id: number): Promise<ResearcherWorks> {
  return apiGet<ResearcherWorks>(`/api/researchers/${id}/works`);
}

/** Starts (or refreshes) a profile; the papers arrive under ``run_id``. */
export async function startResearcherImport(body: ResearcherImportRequest): Promise<ResearcherImportStart> {
  const res = await apiPost<ResearcherImportStart>('/api/researchers/import', body);
  invalidate('researchers');
  return res;
}

/** Mark the profile as the user themself, as followed, or clear it; it moves to the top of that group. */
export async function setResearcherMark(id: number, mark: ResearcherMark | null): Promise<Researcher> {
  const res = await apiPatch<Researcher>(`/api/researchers/${id}`, { mark });
  // Other rows moved too, so the list is re-read; the detail page gets the
  // row itself. Not the prefix: that would re-run the suggestions query.
  setQueryData<ResearcherDetail>(`researchers/${id}`, (prev) => (prev ? { ...prev, researcher: res } : prev!));
  invalidateExact('researchers');
  return res;
}

/** Store the order the user dragged the list into: every profile id, once. */
export async function reorderResearchers(ids: number[]): Promise<Researcher[]> {
  const res = await apiPut<Researcher[]>('/api/researchers/order', { ids });
  setQueryData<Researcher[]>('researchers', () => res);
  return res;
}

export async function deleteResearcher(id: number): Promise<{ ok: boolean }> {
  const res = await apiDelete<{ ok: boolean }>(`/api/researchers/${id}`);
  // 'vault' too: the Vault lists a researcher's papers until it is forgotten.
  invalidate('researchers', 'profiles', 'vault');
  return res;
}

/** A draft seeded with the profile's papers. Synchronous: they are already embedded. */
export async function createInterestFromResearcher(id: number, body: ResearcherInterestRequest): Promise<ResearcherInterestResponse> {
  const res = await apiPost<ResearcherInterestResponse>(`/api/researchers/${id}/interests`, body);
  invalidate('researchers', 'profiles', 'vault');
  return res;
}

