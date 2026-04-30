/**
 * Real-API vault endpoint helpers.
 *
 * Signatures mirror ``src/mock-api/endpoints/vault.ts`` so views can
 * swap branches via ``src/lib/apiSwitch.ts``. ``ingestPdf`` is kept as a
 * passthrough to the multipart upload endpoint so any straggling
 * caller (the mock used to expose it) still resolves; the wizard owns
 * the canonical upload path.
 */

import { apiGet, apiPostMultipart } from '../client';
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

export function uploadPdf(
  file: File,
  profileSlug?: string,
): Promise<VaultDoc> {
  const form = new FormData();
  form.append('file', file);
  if (profileSlug) form.append('profile_slug', profileSlug);
  return apiPostMultipart<VaultDoc>('/api/vault/upload', form);
}

// Compat shim for the mock's ``ingestPdf(filename)`` signature. The
// real API requires a File, so callers that only have a filename will
// fail — Phase 11 wizard uses ``uploadPdf`` directly.
export async function ingestPdf(_filename: string): Promise<{ ok: true; id: string }> {
  throw new Error(
    'ingestPdf(filename) is mock-only; use uploadPdf(file, profileSlug) against the real backend.',
  );
}
