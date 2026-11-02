/**
 * "Add more seeds" imports (ORCID, Prosopia) under way, by the draft or
 * Edit interest copy they fill. Set the moment Add is clicked, not when
 * the job shows up: the request that starts it takes seconds (Prosopia,
 * the ORCID registry), and Save changes clicked in that gap saved the
 * copy, whose import then had nowhere to go (FUNCTIONAL_SPEC E.12, X-42).
 * Module-wide, like the seed uploads: the picker can unmount while it runs.
 */
import { useSyncExternalStore } from 'react';

const running = new Set<string>();
const listeners = new Set<() => void>();

export function setSeedImport(slug: string, on: boolean): void {
  if (on === running.has(slug)) return;
  if (on) running.add(slug); else running.delete(slug);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Whether an "Add more seeds" import into ``slug`` is starting or running. */
export function useSeedImport(slug: string | null | undefined): boolean {
  return useSyncExternalStore(subscribe, () => !!slug && running.has(slug));
}
