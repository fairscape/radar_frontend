import { apiGet, apiPostMultipart } from '../client';
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
export async function uploadPdf(file: File, profileSlug?: string): Promise<VaultDoc> {
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
