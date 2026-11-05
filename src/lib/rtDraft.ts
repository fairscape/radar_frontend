/**
 * Step 3's research topics on a new interest's draft (FUNCTIONAL_SPEC RT,
 * ``ResearchTopics autoSave``): what has to outlive the panel itself.
 *
 * The wizard unmounts the panel on every step change. With "one save at a
 * time" (user 11-05) kept in the panel, Back then Next while a save was out
 * dropped the lock and two saves raced (review FF-1); a failed save of a
 * generated list landed on the gone panel and the list was lost (FF-2).
 * Kept here instead, per draft:
 * - ``saving`` / ``mapping`` / ``generating``: a save, a mapping or a
 *   generation is out (a generation left behind by Back still saves what it
 *   brings, so the panel mounted again stays locked meanwhile; review R3);
 * - ``preview``: a generated list the draft could not keep, with the topics
 *   removed or added on it since (``terms`` / ``removed``, FF-5).
 *
 * Tied to the draft and the person, not to a name in memory (FF-3): an
 * entry lives while the draft store holds that draft, for the address that
 * made it. Moving to another draft, deleting it, starting over, signing out
 * or another person in the tab (all go through ``resetDraft``) drop it;
 * so does "Discard changes". A save still out when its entry is dropped
 * writes nothing back here.
 */
import { useSyncExternalStore } from 'react';
import type { InterestTerm, InterestTerms } from '../api/endpoints/profiles';
import { getDraft, subscribeDraft } from './draft';
import { getUserEmail } from './userEmail';

export interface RtEntry {
  saving: boolean;
  mapping: boolean;
  generating: boolean;
  preview: InterestTerms | null;
  terms: InterestTerm[] | null;
  removed: InterestTerm[] | null;
}

interface Held extends RtEntry { owner: string | null; gen: number }

const NONE: RtEntry = Object.freeze({ saving: false, mapping: false, generating: false, preview: null, terms: null, removed: null }) as RtEntry;
const entries = new Map<string, Held>();
const listeners = new Set<() => void>();
let gen = 0;

function who(): string | null { return getUserEmail(); }

function emit(): void { listeners.forEach((cb) => cb()); }

/** The entry for draft ``slug``, NONE when there is none for this person. */
export function rtEntry(slug: string | null): RtEntry {
  if (!slug) return NONE;
  const e = entries.get(slug);
  if (!e) return NONE;
  return e.owner === who() ? e : NONE;
}

/** A token for the entry as it is now: a write with an older one is dropped. */
export function rtToken(slug: string): number {
  const e = entries.get(slug);
  if (e && e.owner === who()) return e.gen;
  const fresh: Held = { ...NONE, owner: who(), gen: ++gen };
  entries.set(slug, fresh);
  return fresh.gen;
}

/** Change draft ``slug``'s entry, unless it was dropped since ``token``. */
export function rtSet(slug: string, patch: Partial<RtEntry>, token: number): void {
  const e = entries.get(slug);
  if (!e || e.gen !== token || e.owner !== who()) return;
  entries.set(slug, { ...e, ...patch });
  emit();
}

export function rtDrop(slug: string): void {
  if (entries.delete(slug)) emit();
}

/** Tests and sign-out paths that bypass the draft store. */
export function rtDropAll(): void {
  if (entries.size) { entries.clear(); emit(); }
}

// Only the draft the store holds keeps its entry.
let held = typeof window !== 'undefined' ? getDraft().slug : null;
if (typeof window !== 'undefined') {
  subscribeDraft(() => {
    const now = getDraft().slug;
    if (now === held) return;
    for (const k of [...entries.keys()]) if (k !== now) entries.delete(k);
    held = now;
    emit();
  });
}

export function useRtEntry(slug: string | null): RtEntry {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => rtEntry(slug),
    () => NONE,
  );
}
