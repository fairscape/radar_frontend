import { apiGet, apiPost } from '../client';
import { invalidate } from '../../lib/query';
import type {
  ProsopiaImportRequest,
  ProsopiaImportStart,
  ProsopiaImportStatus,
} from '../../types/prosopia';

export async function startProsopiaImport(body: ProsopiaImportRequest): Promise<ProsopiaImportStart> {
  const res = await apiPost<ProsopiaImportStart>('/api/import/prosopia', body);
  invalidate('profiles');
  return res;
}

export function getProsopiaImportStatus(runId: number): Promise<ProsopiaImportStatus> {
  return apiGet<ProsopiaImportStatus>(`/api/import/prosopia/${runId}`);
}
