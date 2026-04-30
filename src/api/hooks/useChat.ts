/**
 * useChat — real-API mirror of the mock hook.
 *
 * Optimistically appends the user's turn before the server replies so
 * the chat panel feels responsive. On ApiError (e.g. 503 when Ollama
 * is unreachable) we drop the pending user turn and surface the error
 * via the returned ``error`` field; the mock never errored, so views
 * that ignore ``error`` still render fine.
 */

import { useCallback, useEffect, useState } from 'react';
import { getChatHistory, postChat } from '../endpoints/chat';
import { ApiError } from '../client';
import type { ChatTurn } from '../../types/radar';

export function useChat() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    getChatHistory()
      .then((h) => { if (!cancelled) setTurns(h); })
      .catch(() => { /* show empty history on error. */ });
    return () => { cancelled = true; };
  }, []);

  const send = useCallback(async (query: string, scope: string[]) => {
    if (!query.trim()) return;
    const now = new Date();
    const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const userTurn: ChatTurn = { who: 'user', t, body: query };
    setTurns((prev) => [...prev, userTurn]);
    setSending(true);
    setError(null);
    try {
      const reply = await postChat(query, scope);
      setTurns((prev) => [...prev, reply]);
    } catch (e) {
      // Roll back the optimistic user turn so the user can retry.
      setTurns((prev) => prev.filter((turn) => turn !== userTurn));
      if (e instanceof ApiError) {
        setError(e);
      } else {
        setError(e as Error);
      }
    } finally {
      setSending(false);
    }
  }, []);

  return { turns, sending, send, error };
}
