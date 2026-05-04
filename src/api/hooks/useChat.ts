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
import { clearChatHistory, getBackendHealth, getChatHistory, postChat } from '../endpoints/chat';
import { ApiError } from '../client';
import type { ChatTurn } from '../../types/radar';

export function useChat() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [model, setModel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getChatHistory()
      .then((h) => { if (!cancelled) setTurns(h); })
      .catch(() => { /* show empty history on error. */ });
    getBackendHealth()
      .then((h) => { if (!cancelled) setModel(h.ollama_model); })
      .catch(() => { /* leave model null; UI falls back. */ });
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

  // Wipes the panel AND deletes server-side history so reload doesn't
  // restore prior turns. Each turn is independent at the LLM level
  // anyway (single-shot), so this is purely a panel/history reset.
  const reset = useCallback(async () => {
    setTurns([]);
    setError(null);
    try {
      await clearChatHistory();
    } catch (e) {
      // Non-fatal: panel is already cleared locally.
      setError(e as Error);
    }
  }, []);

  return { turns, sending, send, error, model, reset };
}
