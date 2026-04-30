import { CARDS, TODAY, FETCH_INFO } from '../data/cards';
import { simulateLatency } from '../client';
import type {
  Card,
  CardState,
  DailyRadarFilters,
  DailyRadarResponse,
} from '../../types/radar';

const cardStates: Record<string, CardState> = {};

export async function getDailyRadar(
  filters: DailyRadarFilters = {},
): Promise<DailyRadarResponse> {
  await simulateLatency();
  const cards = CARDS.filter((c) => {
    if (filters.profile && filters.profile !== 'all' && c.profile !== filters.profile) return false;
    if (filters.bucket && c.bucket !== filters.bucket) return false;
    return true;
  });
  return {
    date: TODAY,
    fetchedAt: FETCH_INFO.fetchedAt,
    fetchMs: FETCH_INFO.fetchMs,
    candidatesScored: FETCH_INFO.candidatesScored,
    cards,
    states: { ...cardStates },
  };
}

export async function saveCard(id: string): Promise<{ id: string; state: CardState }> {
  await simulateLatency(80, 200);
  cardStates[id] = cardStates[id] === 'saved' ? null : 'saved';
  return { id, state: cardStates[id] };
}

export async function dismissCard(id: string): Promise<{ id: string; state: CardState }> {
  await simulateLatency(80, 200);
  cardStates[id] = cardStates[id] === 'dismissed' ? null : 'dismissed';
  return { id, state: cardStates[id] };
}

export function getCardById(id: string): Card | undefined {
  return CARDS.find((c) => c.id === id);
}
