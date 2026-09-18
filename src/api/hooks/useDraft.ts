/**
 * useDraft — sessionStorage-backed wizard state.
 *
 * The wizard accumulates: draft slug + name (from create), staged seed
 * VaultDocs (from Step 1), selected topic ids (Step 3), chosen
 * threshold (Step 4). We persist to sessionStorage so a reload mid-
 * wizard recovers, but use sessionStorage (not local) so closing the
 * tab clears it.
 *
 * State is held in a single module-level store and exposed via
 * useSyncExternalStore so every consumer (parent ProfileWizard + each
 * Step) shares one source of truth. An earlier version gave each
 * useDraft caller its own useState — the parent's stale copy then
 * raced and overwrote sessionStorage on setStep(), wiping the slug
 * between steps.
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { VaultDoc } from '../../types/radar';

const STORAGE_KEY = 'radar.wizard.draft';

export interface ProsopiaImportInfo {
  ref: string;
  nSeeds: number | null;
}

export interface DraftState {
  slug: string | null;
  name: string;
  seeds: VaultDoc[];
  /** Set when the draft was seeded by the Prosopia import instead of uploads. */
  prosopia: ProsopiaImportInfo | null;
  selectedTopicIds: string[];
  threshold: number | null;
  step: number;
}

const EMPTY: DraftState = {
  slug: null,
  name: '',
  seeds: [],
  prosopia: null,
  selectedTopicIds: [],
  threshold: null,
  step: 1,
};

function load(): DraftState {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<DraftState>;
    return { ...EMPTY, ...parsed };
  } catch {
    return EMPTY;
  }
}

function persist(state: DraftState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / disabled — silently ignore. */
  }
}

let currentState: DraftState = load();
const listeners = new Set<() => void>();

function setState(updater: (s: DraftState) => DraftState): void {
  const next = updater(currentState);
  if (next === currentState) return;
  currentState = next;
  persist(currentState);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): DraftState {
  return currentState;
}

function getServerSnapshot(): DraftState {
  return EMPTY;
}

export function useDraft() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setSlug = useCallback((slug: string, name: string) => {
    setState((s) => ({ ...s, slug, name }));
  }, []);

  const addSeed = useCallback((doc: VaultDoc) => {
    setState((s) =>
      s.seeds.some((d) => d.id === doc.id)
        ? s
        : { ...s, seeds: [...s.seeds, doc] },
    );
  }, []);

  const removeSeed = useCallback((docId: string) => {
    setState((s) => ({ ...s, seeds: s.seeds.filter((d) => d.id !== docId) }));
  }, []);

  const setSeeds = useCallback((seeds: VaultDoc[]) => {
    setState((s) => ({ ...s, seeds }));
  }, []);

  const setProsopia = useCallback((info: ProsopiaImportInfo | null) => {
    setState((s) => ({ ...s, prosopia: info }));
  }, []);

  const toggleTopic = useCallback((id: string) => {
    setState((s) =>
      s.selectedTopicIds.includes(id)
        ? { ...s, selectedTopicIds: s.selectedTopicIds.filter((t) => t !== id) }
        : { ...s, selectedTopicIds: [...s.selectedTopicIds, id] },
    );
  }, []);

  const setSelectedTopics = useCallback((ids: string[]) => {
    setState((s) => ({ ...s, selectedTopicIds: ids }));
  }, []);

  const setThreshold = useCallback((threshold: number) => {
    setState((s) => ({ ...s, threshold }));
  }, []);

  const setStep = useCallback((step: number) => {
    setState((s) => ({ ...s, step }));
  }, []);

  const reset = useCallback(() => {
    currentState = EMPTY;
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
    listeners.forEach((l) => l());
  }, []);

  return {
    state,
    setSlug,
    addSeed,
    removeSeed,
    setSeeds,
    setProsopia,
    toggleTopic,
    setSelectedTopics,
    setThreshold,
    setStep,
    reset,
  };
}
