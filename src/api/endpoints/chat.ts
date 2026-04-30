/**
 * Real-API chat endpoint helpers.
 *
 * Signatures mirror ``src/mock-api/endpoints/chat.ts``. ``postChat``
 * sends ``{query, scope}`` per the Phase 9 backend contract; chat
 * history is a flat ``ChatTurn[]`` ordered oldest-first.
 */

import { apiGet, apiPost } from '../client';
import type { ChatTurn } from '../../types/radar';

export function getChatHistory(): Promise<ChatTurn[]> {
  return apiGet<ChatTurn[]>('/api/chat/history');
}

export function postChat(query: string, scope: string[]): Promise<ChatTurn> {
  return apiPost<ChatTurn>('/api/chat', { query, scope });
}
