/**
 * Wizard state, shared by every step through one module-level store and
 * persisted to sessionStorage so a reload mid-wizard resumes where it was.
 */
import { useCallback, useSyncExternalStore } from 'react';
import type { VaultDoc } from '../types/radar';

const STORAGE_KEY = 'radar.wizard.v2';

/**
 * Where a draft's seeds come from. ``orcid`` pulls the author's works from
 * OpenAlex; ``prosopia`` a published profile; ``profile`` picks from a
 * researcher already stored in Radar (no import, the papers are embedded).
 */
export type SeedSource = 'upload' | 'orcid' | 'prosopia' | 'profile';

export function isSeedSource(v: unknown): v is SeedSource {
  return v === 'upload' || v === 'orcid' || v === 'prosopia' || v === 'profile';
}

export interface DraftState {
  slug: string | null;
  name: string;
  source: SeedSource;
  seeds: VaultDoc[];
  /** The import this draft came from (Prosopia slug or ORCID), if any. */
  prosopia: { ref: string; nSeeds: number | null } | null;
  /** The stored researcher this draft was built from, if any. */
  researcher: { id: number; name: string; nSeeds: number } | null;
  importJobId: string | null;
  dryRunJobId: string | null;
  selectedTopicIds: string[] | null;
  threshold: number | null;
  step: number;
}

export const EMPTY_DRAFT: DraftState = {
  slug: null,
  name: '',
  source: 'upload',
  seeds: [],
  prosopia: null,
  researcher: null,
  importJobId: null,
  dryRunJobId: null,
  selectedTopicIds: null,
  threshold: null,
  step: 1,
};

function load(): DraftState {
  if (typeof window === 'undefined') return EMPTY_DRAFT;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_DRAFT;
    return { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<DraftState>) };
  } catch {
    return EMPTY_DRAFT;
  }
}

let current: DraftState = load();
const listeners = new Set<() => void>();

function set(updater: (s: DraftState) => DraftState) {
  const next = updater(current);
  if (next === current) return;
  current = next;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function resetDraft() {
  current = EMPTY_DRAFT;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function getDraft(): DraftState {
  return current;
}

/**
 * Set draft fields from outside the wizard (a page that just created a
 * draft on the server and is about to open it). Going through the
 * store rather than ``?draft=`` alone means the wizard does not have to
 * find the new draft in a profiles list that may not have refreshed yet.
 */
export function setDraft(p: Partial<DraftState>): void {
  set((s) => ({ ...s, ...p }));
}

export function useDraft() {
  const state = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => EMPTY_DRAFT,
  );
  const update = useCallback((p: Partial<DraftState>) => set((s) => ({ ...s, ...p })), []);
  const addSeed = useCallback(
    (doc: VaultDoc) =>
      set((s) => (s.seeds.some((d) => d.id === doc.id) ? s : { ...s, seeds: [...s.seeds, doc] })),
    [],
  );
  const removeSeed = useCallback(
    (id: string) => set((s) => ({ ...s, seeds: s.seeds.filter((d) => d.id !== id) })),
    [],
  );
  const toggleTopic = useCallback(
    (id: string) =>
      set((s) => {
        const cur = s.selectedTopicIds ?? [];
        return {
          ...s,
          selectedTopicIds: cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id],
        };
      }),
    [],
  );
  return { state, update, addSeed, removeSeed, toggleTopic, reset: resetDraft };
}
