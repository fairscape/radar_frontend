import { ApiError, apiDelete, apiGet, apiPostMultipart } from '../client';
import { invalidate } from '../../lib/query';
import type { VaultDoc, VaultStats } from '../../types/radar';

export interface VaultMeta {
  rootPath: string;
  indexPath: string;
  chunkSize: string;
  lastIngest: string;
}

export function listVaultDocs(tag?: string): Promise<VaultDoc[]> {
  const params: Record<string, string> = {};
  if (tag && tag !== 'all') params.tag = tag;
  return apiGet<VaultDoc[]>('/api/vault/docs', params);
}

export function getVaultStats(): Promise<VaultStats> {
  return apiGet<VaultStats>('/api/vault/stats');
}

export function getVaultMeta(): Promise<VaultMeta> {
  return apiGet<VaultMeta>('/api/vault/meta');
}

export function getTagCounts(): Promise<Record<string, number>> {
  return apiGet<Record<string, number>>('/api/vault/tags');
}

// Uploads under way, from any page. Closing the tab while one runs asks
// first: the interest's Seeds tab did, the wizard and the Vault did not.
let uploadsRunning = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => { if (uploadsRunning > 0) e.preventDefault(); });
}

/**
 * Upload one PDF. With ``profileSlug`` the document is tagged to that
 * interest and, for drafts and live interests alike, becomes a seed.
 */
/** The vault's limit, as the backend has it (RADAR_UPLOAD_MAX_MB = 50, in
 * MiB); the proxy refuses anything over 55 MB before it arrives (L4).
 * Change them together. */
export const UPLOAD_MAX_MB = 50;

export async function uploadPdf(file: File, profileSlug?: string): Promise<VaultDoc> {
  // Refused here, not sent: a file over the limit would be cut off by the
  // proxy part-way, which the browser can report as a lost connection.
  if (file.size > UPLOAD_MAX_MB * 1024 * 1024) {
    throw new ApiError(`POST /api/vault/upload: ${file.name} is too large`, 413, {
      detail: `This file is larger than ${UPLOAD_MAX_MB} MB, the most the vault takes.`,
    });
  }
  const form = new FormData();
  form.append('file', file);
  if (profileSlug) form.append('profile_slug', profileSlug);
  uploadsRunning += 1;
  let res: VaultDoc;
  try {
    res = await apiPostMultipart<VaultDoc>('/api/vault/upload', form);
  } finally {
    uploadsRunning -= 1;
  }
  // 'radar' too: a seed upload re-fits a live interest and re-scores its feed.
  // draft/<slug>/ too: the edit steps' coherence and topics were computed without this seed.
  invalidate('vault', 'profiles', 'radar', ...(profileSlug ? [`draft/${profileSlug}/`] : []));
  return res;
}

/** Whether a vault doc is the user's own uploaded PDF, which they can delete (FUNCTIONAL_SPEC F1). */
export function isOwnUpload(doc: VaultDoc): boolean {
  return doc.id.startsWith('local:upload:');
}

/**
 * ``DELETE /api/vault/docs/{id}``: the PDF's file, text and vectors go.
 * Where it was a seed it is listed as deleted until the interest's next scan.
 */
export async function deleteVaultDoc(id: string): Promise<{ ok: boolean; interests: string[] }> {
  const res = await apiDelete<{ ok: boolean; interests: string[] }>(`/api/vault/docs/${encodeURIComponent(id)}`);
  invalidate('vault', 'profiles', 'radar', 'draft/');
  return res;
}
