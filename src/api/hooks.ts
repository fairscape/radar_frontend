/** Data hooks. Keys are hierarchical so ``invalidate('profiles')`` hits them all. */
import { useQuery } from '../lib/query';
import type { DailyRadarFilters } from '../types/radar';
import { getChatHistory, getBackendHealth, getChatProviders } from './endpoints/chat';
import { getProfileDetail, listProfileFeedback, listProfileRuns, listProfiles } from './endpoints/profiles';
import { getDailyRadar } from './endpoints/radar';
import { getTagCounts, getVaultMeta, getVaultStats, listVaultDocs } from './endpoints/vault';

export const keys = {
  profiles: 'profiles',
  profileDetail: (key: string) => `profiles/${key}/detail`,
  profileRuns: (key: string) => `profiles/${key}/runs`,
  profileFeedback: (key: string) => `profiles/${key}/feedback`,
  radar: (f: DailyRadarFilters) => `radar?profile=${f.profile ?? 'all'}&bucket=${f.bucket ?? ''}`,
  vaultDocs: (tag: string) => `vault/docs?tag=${tag}`,
  vaultStats: 'vault/stats',
  vaultTags: 'vault/tags',
  vaultMeta: 'vault/meta',
  chatHistory: 'chat/history',
  health: 'health',
  providers: 'chat/providers',
};

export function useProfiles() {
  return useQuery(keys.profiles, listProfiles);
}

export function useProfileDetail(key: string | null) {
  return useQuery(key ? keys.profileDetail(key) : null, () => getProfileDetail(key!));
}

export function useProfileRuns(key: string | null, limit = 20) {
  return useQuery(key ? keys.profileRuns(key) : null, () => listProfileRuns(key!, limit));
}

export function useProfileFeedback(key: string | null) {
  return useQuery(key ? keys.profileFeedback(key) : null, () => listProfileFeedback(key!));
}

export function useDailyRadar(filters: DailyRadarFilters) {
  return useQuery(keys.radar(filters), () => getDailyRadar(filters));
}

export function useVaultDocs(tag: string) {
  return useQuery(keys.vaultDocs(tag), () => listVaultDocs(tag));
}

export function useVaultStats() {
  return useQuery(keys.vaultStats, getVaultStats);
}

export function useVaultTags() {
  return useQuery(keys.vaultTags, getTagCounts);
}

export function useVaultMeta() {
  return useQuery(keys.vaultMeta, getVaultMeta);
}

export function useChatHistory() {
  return useQuery(keys.chatHistory, getChatHistory);
}

export function useBackendHealth() {
  return useQuery(keys.health, getBackendHealth);
}

export function useChatProviders() {
  return useQuery(keys.providers, getChatProviders);
}
