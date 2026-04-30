import { useCallback, useEffect, useState } from 'react';
import { getChatHistory, postChat } from '../endpoints/chat';
import type { ChatTurn } from '../../types/radar';

export function useChat() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getChatHistory().then((h) => { if (!cancelled) setTurns(h); });
    return () => { cancelled = true; };
  }, []);

  const send = useCallback(async (query: string, scope: string[]) => {
    if (!query.trim()) return;
    const now = new Date();
    const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setTurns((prev) => [...prev, { who: 'user', t, body: query }]);
    setSending(true);
    try {
      const reply = await postChat(query, scope);
      setTurns((prev) => [...prev, reply]);
    } finally {
      setSending(false);
    }
  }, []);

  return { turns, sending, send };
}
