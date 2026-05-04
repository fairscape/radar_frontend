/**
 * dataBus — tiny typed event emitter for cross-component invalidation.
 *
 * Mutation sites (saveCard, ingestPdf, commitDraft, ...) emit one of
 * the events below; data hooks (useProfiles, useVault, useDailyRadar)
 * subscribe and call their own ``refresh()`` so the UI catches up
 * without waiting for a tab-focus revalidation.
 *
 * Why not a Context: hooks need to subscribe at module scope, and a
 * standalone bus avoids forcing every consumer through a provider.
 */

export type DataEvent =
  | 'profiles:changed'
  | 'vault:changed'
  | 'radar:changed';

type Listener = () => void;

const listeners: Record<DataEvent, Set<Listener>> = {
  'profiles:changed': new Set(),
  'vault:changed': new Set(),
  'radar:changed': new Set(),
};

export function subscribe(event: DataEvent, fn: Listener): () => void {
  listeners[event].add(fn);
  return () => listeners[event].delete(fn);
}

export function emit(event: DataEvent): void {
  listeners[event].forEach((fn) => {
    try {
      fn();
    } catch {
      // Listeners are best-effort; one throwing must not block others.
    }
  });
}

export const dataBus = { subscribe, emit };
