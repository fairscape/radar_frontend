import { apiGet, apiPost } from '../client';
import type { CardState, DailyRadarFilters, DailyRadarResponse } from '../../types/radar';

export function getDailyRadar(filters: DailyRadarFilters = {}): Promise<DailyRadarResponse> {
  const params: Record<string, string> = {};
  if (filters.profile && filters.profile !== 'all') params.profile = filters.profile;
  if (filters.bucket) params.bucket = filters.bucket;
  return apiGet<DailyRadarResponse>('/api/radar/daily', params);
}

export function saveCard(id: string): Promise<{ id: string; state: CardState }> {
  return apiPost<{ id: string; state: CardState }>('/api/radar/cards/save', { card_id: id });
}

export function dismissCard(id: string): Promise<{ id: string; state: CardState }> {
  return apiPost<{ id: string; state: CardState }>('/api/radar/cards/dismiss', { card_id: id });
}
