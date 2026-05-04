/**
 * Real-API radar endpoint helpers.
 *
 * Signatures mirror ``src/mock-api/endpoints/radar.ts`` so views can
 * swap branches via ``src/lib/apiSwitch.ts`` without touching component
 * code. Server returns ``{id, state}`` from save/dismiss; the local
 * state map is owned by ``useDailyRadar``.
 */

import { apiGet, apiPost } from '../client';
import type {
  Card,
  CardState,
  DailyRadarFilters,
  DailyRadarResponse,
} from '../../types/radar';
import { dataBus } from '../../lib/dataBus';

export function getDailyRadar(
  filters: DailyRadarFilters = {},
): Promise<DailyRadarResponse> {
  const params: Record<string, string> = {};
  if (filters.profile && filters.profile !== 'all') params.profile = filters.profile;
  if (filters.bucket) params.bucket = filters.bucket;
  return apiGet<DailyRadarResponse>('/api/radar/daily', params);
}

export async function saveCard(id: string): Promise<{ id: string; state: CardState }> {
  const res = await apiPost<{ id: string; state: CardState }>(
    `/api/radar/cards/save`,
    { card_id: id },
  );
  // Saved cards land in the vault as docs, so notify both surfaces.
  // Profile saves30 also ticks, but ``radar:changed`` is enough for
  // sidebar counts since the saves30 number lives on the profile row.
  dataBus.emit('radar:changed');
  dataBus.emit('vault:changed');
  dataBus.emit('profiles:changed');
  return res;
}

export async function dismissCard(id: string): Promise<{ id: string; state: CardState }> {
  const res = await apiPost<{ id: string; state: CardState }>(
    `/api/radar/cards/dismiss`,
    { card_id: id },
  );
  dataBus.emit('radar:changed');
  dataBus.emit('profiles:changed');
  return res;
}

// Surface-parity shim with the mock module (which exposed a synchronous
// in-memory lookup over its hard-coded card array). On the real API a
// card is just a row inside ``getDailyRadar``'s response, so callers
// should grab the card from there instead. We keep this export so
// ``apiSwitch`` can forward it without a TS structural mismatch.
export function getCardById(_id: string): Card | undefined {
  return undefined;
}
