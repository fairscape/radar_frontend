/**
 * This tab's id, for Edit interest's first come first served
 * (FUNCTIONAL_SPEC E.7 R5): a copy belongs to the tab that opened it, and
 * another tab's Edit interest is refused while that tab is there.
 *
 * Kept in ``sessionStorage``, so a reload keeps it (the reloaded page takes
 * its own copy back rather than being locked out by it). "Duplicate tab"
 * copies ``sessionStorage`` too: the tabs ask each other as one loads
 * (``BroadcastChannel``), and the newcomer takes an id of its own.
 */
const KEY = 'bxTab';
const CHANNEL = 'bx-tab';

let ready: Promise<string> | null = null;

function fresh(): string {
  try { return crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
}

function keep(id: string): string {
  try { window.sessionStorage.setItem(KEY, id); } catch { /* this load only, then */ }
  return id;
}

export function tabId(): Promise<string> {
  if (ready) return ready;
  ready = new Promise<string>((resolve) => {
    let stored: string | null = null;
    try { stored = window.sessionStorage.getItem(KEY); } catch { /* none */ }
    let ch: BroadcastChannel | null = null;
    try { ch = new BroadcastChannel(CHANNEL); } catch { /* not here: a duplicated tab goes unnoticed */ }
    const settle = (id: string) => {
      // Answer a tab duplicated from this one: the id is taken.
      ch?.addEventListener('message', (e: MessageEvent) => {
        const m = e.data as { type?: string; id?: string; nonce?: string } | null;
        if (m?.type === 'claim' && m.id === id) ch.postMessage({ type: 'taken', nonce: m.nonce });
      });
      resolve(id);
    };
    if (!stored || !ch) { settle(keep(stored ?? fresh())); return; }
    const nonce = fresh();
    let taken = false;
    const onReply = (e: MessageEvent) => {
      const m = e.data as { type?: string; nonce?: string } | null;
      if (m?.type === 'taken' && m.nonce === nonce) taken = true;
    };
    ch.addEventListener('message', onReply);
    ch.postMessage({ type: 'claim', id: stored, nonce });
    window.setTimeout(() => {
      ch.removeEventListener('message', onReply);
      settle(taken ? keep(fresh()) : stored!);
    }, 150);
  });
  return ready;
}
