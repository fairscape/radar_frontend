/**
 * Wizard state, shared by every step through one module-level store and
 * persisted to sessionStorage so a reload mid-wizard resumes where it was.
 */
import { useCallback, useSyncExternalStore } from 'react';
import type { VaultDoc } from '../types/radar';

const STORAGE_KEY = 'radar.wizard.v2';

export type SeedSource = 'upload' | 'prosopia';

export interface DraftState {
  slug: string | null;
  name: string;
  source: SeedSource;
  seeds: VaultDoc[];
  prosopia: { ref: string; nSeeds: number | null } | null;
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
  return { state, update, addSeed, toggleTopic, reset: resetDraft };
}
