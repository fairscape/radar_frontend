import { VAULT_DOCS, VAULT_META } from '../data/vault';
import { simulateLatency } from '../client';
import type { VaultDoc, VaultStats } from '../../types/radar';

export async function listVaultDocs(tag?: string): Promise<VaultDoc[]> {
  await simulateLatency();
  if (!tag || tag === 'all') return [...VAULT_DOCS];
  return VAULT_DOCS.filter((d) => d.tags.includes(tag));
}

export async function getVaultStats(): Promise<VaultStats> {
  await simulateLatency(80, 200);
  return {
    docs: VAULT_DOCS.length,
    pages: VAULT_DOCS.reduce((a, d) => a + d.pages, 0),
    chunks: VAULT_DOCS.reduce((a, d) => a + d.chunks, 0),
    lastIngest: VAULT_META.lastIngest,
  };
}

export async function getVaultMeta() {
  await simulateLatency(50, 120);
  return VAULT_META;
}

export async function getTagCounts(): Promise<Record<string, number>> {
  await simulateLatency(60, 140);
  const counts: Record<string, number> = {};
  VAULT_DOCS.forEach((d) => d.tags.forEach((t) => { counts[t] = (counts[t] ?? 0) + 1; }));
  return counts;
}

export async function ingestPdf(filename: string): Promise<{ ok: true; id: string }> {
  await simulateLatency(1200, 2400);
  return { ok: true, id: `v${VAULT_DOCS.length + 1}-${filename}` };
}
