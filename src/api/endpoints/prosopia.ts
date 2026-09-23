import { apiGet, apiPost } from '../client';
import { invalidate } from '../../lib/query';
import type {
  OrcidImportRequest,
  OrcidWorksResponse,
  ProsopiaImportRequest,
  ProsopiaImportStart,
  ProsopiaImportStatus,
  ProsopiaWorksResponse,
} from '../../types/prosopia';

export async function startProsopiaImport(body: ProsopiaImportRequest): Promise<ProsopiaImportStart> {
  const res = await apiPost<ProsopiaImportStart>('/api/import/prosopia', body);
  invalidate('profiles');
  return res;
}

export function fetchProsopiaWorks(ref: string): Promise<ProsopiaWorksResponse> {
  return apiGet<ProsopiaWorksResponse>('/api/import/prosopia/works', { ref });
}

export function fetchOrcidWorks(orcid: string): Promise<OrcidWorksResponse> {
  return apiGet<OrcidWorksResponse>(`/api/import/orcid/${encodeURIComponent(orcid)}/works`);
}

/** Starts an import; the run is polled through ``getProsopiaImportStatus`` like any import. */
export async function startOrcidImport(body: OrcidImportRequest): Promise<ProsopiaImportStart> {
  const res = await apiPost<ProsopiaImportStart>('/api/import/orcid', body);
  invalidate('profiles');
  return res;
}

export function getProsopiaImportStatus(runId: number): Promise<ProsopiaImportStatus> {
  return apiGet<ProsopiaImportStatus>(`/api/import/prosopia/${runId}`);
}
