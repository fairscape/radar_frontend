/**
 * useDraft — localStorage-backed wizard state, keyed by the signed-in user.
 *
 * The wizard accumulates: draft slug + name (from create), staged seed
 * VaultDocs (from Step 1), selected topic ids (Step 3), chosen
 * threshold (Step 4). It is persisted so that leaving the wizard (or
 * closing the tab) and coming back offers to resume the same draft
 * instead of silently dropping the user into it, or losing it.
 *
 * Storage is per user: the key carries the address AuthGuard cached, so
 * two people sharing a browser never see each other's draft slug (and
 * the 404s that would follow).
 *
 * ``parked`` marks a draft the user walked away from — either through
 * the leave dialog ("keep draft") or by reloading the page. The wizard
 * shows a resume / start-new prompt while it is set.
 *
 * State is held in a single module-level store and exposed via
 * useSyncExternalStore so every consumer (parent ProfileWizard + each
 * Step) shares one source of truth. An earlier version gave each
 * useDraft caller its own useState — the parent's stale copy then
 * raced and overwrote storage on setStep(), wiping the slug between
 * steps.
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { VaultDoc } from '../../types/radar';
import { getUserEmail, subscribeUserEmail } from '../../lib/userEmail';

const STORAGE_PREFIX = 'radar.wizard.draft';

export type DraftMode = 'pdf' | 'orcid' | 'profile';

export interface DraftState {
  slug: string | null;
  name: string;
  seeds: VaultDoc[];
  selectedTopicIds: string[];
  threshold: number | null;
  step: number;
  /** How Step 1 seeds the draft. Persisted so a reload resumes the right panel. */
  mode: DraftMode;
  /** Set once an ORCID import has been kicked off for this draft. */
  orcid: string | null;
  /** Phase A run (fetch the works). */
  importRunId: number | null;
  /** Phase B run (embed + attach the chosen works); null until the user confirms. */
  seedRunId: number | null;
  /** Phase A finished: the works are on the server and the picker can show them. */
  worksReady: boolean;
  /** Phase B finished: seeds attached, NEXT may be enabled. */
  importDone: boolean;
  /** The user left this draft behind; ask before dropping them back into it. */
  parked: boolean;
}

const EMPTY: DraftState = {
  slug: null,
  name: '',
  seeds: [],
  selectedTopicIds: [],
  threshold: null,
  step: 1,
  mode: 'pdf',
  orcid: null,
  importRunId: null,
  seedRunId: null,
  worksReady: false,
  importDone: false,
  parked: false,
};

function storageKey(): string {
  const email = getUserEmail();
  return email ? `${STORAGE_PREFIX}:${email.toLowerCase()}` : STORAGE_PREFIX;
}

function load(): DraftState {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(storageKey());
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<DraftState>;
    const state = { ...EMPTY, ...parsed };
    // Coming back from a reload or a new tab counts as having left.
    return state.slug ? { ...state, parked: true } : state;
  } catch {
    return EMPTY;
  }
}

function persist(state: DraftState): void {
  if (typeof window === 'undefined') return;
  try {
    if (state.slug) {
      window.localStorage.setItem(storageKey(), JSON.stringify(state));
    } else {
      window.localStorage.removeItem(storageKey());
    }
  } catch {
    /* quota / disabled — silently ignore. */
  }
}

let loadedFor: string | null = null;
let currentState: DraftState = EMPTY;
const listeners = new Set<() => void>();

/** Load lazily so the key sees the address AuthGuard cached, not the
 *  empty value at module-import time; reload when the user changes. */
function ensureLoaded(): void {
  const key = storageKey();
  if (loadedFor === key) return;
  loadedFor = key;
  currentState = load();
}

if (typeof window !== 'undefined') {
  subscribeUserEmail(() => {
    const key = storageKey();
    if (loadedFor === key) return;
    ensureLoaded();
    listeners.forEach((l) => l());
  });
}

function setState(updater: (s: DraftState) => DraftState): void {
  ensureLoaded();
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
  ensureLoaded();
  return currentState;
}

function getServerSnapshot(): DraftState {
  return EMPTY;
}

function clear(): void {
  ensureLoaded();
  currentState = EMPTY;
  persist(EMPTY);
  listeners.forEach((l) => l());
}

// ---------------------------------------------------------------------------
// Module-level accessors for code outside React render (App's navigation
// guard). They read the same store the hook does.
// ---------------------------------------------------------------------------

/** The draft the user would leave behind, or null when there is none. */
export function peekDraft(): DraftState | null {
  ensureLoaded();
  return currentState.slug ? currentState : null;
}

/** Keep the draft, but flag it so the wizard asks before resuming. */
export function parkDraft(): void {
  setState((s) => (s.slug && !s.parked ? { ...s, parked: true } : s));
}

/** Forget the draft locally (the caller deletes it server-side). */
export function clearDraft(): void {
  clear();
}

export function useDraft() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setSlug = useCallback((slug: string, name: string) => {
    setState((s) => ({ ...s, slug, name, parked: false }));
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

  const setMode = useCallback((mode: DraftMode) => {
    setState((s) => (s.mode === mode ? s : { ...s, mode }));
  }, []);

  const setOrcidImport = useCallback((orcid: string, importRunId: number) => {
    setState((s) => ({
      ...s, mode: 'orcid', orcid, importRunId, seedRunId: null, worksReady: false, importDone: false,
    }));
  }, []);

  /** Phase A finished (or was found finished after a reload). */
  const setWorksReady = useCallback((worksReady: boolean) => {
    setState((s) => (s.worksReady === worksReady ? s : { ...s, worksReady }));
  }, []);

  /** The user confirmed a selection: phase B is running under ``seedRunId``. */
  const setSeedRun = useCallback((seedRunId: number | null) => {
    setState((s) =>
      seedRunId === null
        ? { ...s, seedRunId, importDone: false }
        : // A new seed choice invalidates concept toggles and the threshold picked for the old seeds.
          { ...s, seedRunId, importDone: false, seeds: [], selectedTopicIds: [], threshold: null, step: 1 },
    );
  }, []);

  /** A profile document was accepted. With an ORCID the import job runs
   *  (poll ``importRunId``); without one the draft behaves like PDF mode
   *  from here on (``importRunId`` stays null). */
  const setProfileImport = useCallback((orcid: string | null, importRunId: number | null) => {
    setState((s) => ({
      ...s, mode: 'profile', orcid, importRunId, seedRunId: null, worksReady: false,
      importDone: importRunId === null,
    }));
  }, []);

  const setImportDone = useCallback((importDone: boolean) => {
    setState((s) => (s.importDone === importDone ? s : { ...s, importDone }));
  }, []);

  /** Take over a draft that exists on the server but not in this
   *  browser (found through GET /api/profiles/drafts). Seeds are loaded
   *  by Step 1's own effects once the slug is set. */
  const adopt = useCallback(
    (d: {
      slug: string;
      name: string;
      orcid: string | null;
      nSeeds: number;
      importing: boolean;
      importRunId: number | null;
      rp?: boolean;
      phase?: 'fetching' | 'selecting' | 'seeding' | 'seeded' | null;
    }) => {
      // Where to resume: the picker when the works are fetched but not
      // seeded, the seeds list when seeded, the fetch poll otherwise.
      const worksReady = d.phase === 'selecting' || d.phase === 'seeding' || d.phase === 'seeded';
      setState(() => ({
        ...EMPTY,
        slug: d.slug,
        name: d.name,
        mode: d.rp ? 'profile' : d.orcid ? 'orcid' : 'pdf',
        orcid: d.orcid,
        importRunId: d.importRunId,
        seedRunId: null,
        worksReady,
        importDone: Boolean(d.orcid) && d.phase === 'seeded' && d.nSeeds > 0,
        parked: false,
      }));
    },
    [],
  );

  /** The user chose to continue a parked draft. */
  const resume = useCallback(() => {
    setState((s) => (s.parked ? { ...s, parked: false } : s));
  }, []);

  const reset = useCallback(() => {
    clear();
  }, []);

  return {
    state,
    setSlug,
    addSeed,
    removeSeed,
    setSeeds,
    toggleTopic,
    setSelectedTopics,
    setThreshold,
    setStep,
    setMode,
    setOrcidImport,
    setWorksReady,
    setSeedRun,
    setProfileImport,
    setImportDone,
    adopt,
    resume,
    reset,
  };
}
