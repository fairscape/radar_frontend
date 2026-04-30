import { CHAT_TURNS } from '../data/chat';
import { simulateLatency } from '../client';
import type { ChatTurn } from '../../types/radar';

export async function getChatHistory(): Promise<ChatTurn[]> {
  await simulateLatency(80, 200);
  return [...CHAT_TURNS];
}

export async function postChat(
  query: string,
  scope: string[],
): Promise<ChatTurn> {
  await simulateLatency(900, 1800);
  const now = new Date();
  const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return {
    who: 'assistant',
    t,
    body: [
      `Scoped across ${scope.length} profile(s). Top-10 retrieval over the tagged subset returned 4 candidates above the 0.55 cosine floor [1][2].`,
      `Based on the returned chunks: ${query.slice(0, 80)}… — see sources below for the passages that grounded this answer [3].`,
    ],
    sources: [
      { n: 1, title: 'Top-scoring vault chunk (placeholder source)', score: 0.87 },
      { n: 2, title: 'Second vault chunk (placeholder source)', score: 0.81 },
      { n: 3, title: 'Third vault chunk (placeholder source)', score: 0.72 },
    ],
  };
}
