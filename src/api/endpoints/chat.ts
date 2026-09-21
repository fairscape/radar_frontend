import { apiDelete, apiGet, apiPost } from '../client';
import type { BackendHealth, ChatTurn, LLMProvider, ProvidersResponse } from '../../types/radar';

export function getChatHistory(): Promise<ChatTurn[]> {
  return apiGet<ChatTurn[]>('/api/chat/history');
}

export function postChat(query: string, scope: string[], provider?: LLMProvider | null): Promise<ChatTurn> {
  return apiPost<ChatTurn>('/api/chat', { query, scope, provider: provider ?? null });
}

export function clearChatHistory(): Promise<{ deleted: number }> {
  return apiDelete<{ deleted: number }>('/api/chat/history');
}

export function getBackendHealth(): Promise<BackendHealth> {
  return apiGet<BackendHealth>('/api/health');
}

export function getChatProviders(): Promise<ProvidersResponse> {
  return apiGet<ProvidersResponse>('/api/chat/providers');
}
