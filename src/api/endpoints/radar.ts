import { apiGet, apiPost } from '../client';
import type { CardState, DailyRadarFilters, DailyRadarResponse } from '../../types/radar';

export function getDailyRadar(filters: DailyRadarFilters = {}): Promise<DailyRadarResponse> {
  const params: Record<string, string> = {};
  if (filters.profile && filters.profile !== 'all') params.profile = filters.profile;
  if (filters.bucket) params.bucket = filters.bucket;
  return apiGet<DailyRadarResponse>('/api/radar/daily', params);
}

/**
 * `profile` is the interest the card was shown under. Without it the
 * server resolves the paper alone to whichever interest fetched it last --
 * not necessarily the one on screen -- and since save toggles, a click
 * could un-save the paper there.
 */
export function saveCard(id: string, profile: string): Promise<{ id: string; state: CardState }> {
  return apiPost<{ id: string; state: CardState }>('/api/radar/cards/save', { card_id: id, profile });
}

export function dismissCard(id: string, profile: string): Promise<{ id: string; state: CardState }> {
  return apiPost<{ id: string; state: CardState }>('/api/radar/cards/dismiss', { card_id: id, profile });
}
