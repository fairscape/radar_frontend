/**
 * One tab at a time changes an account (FUNCTIONAL_SPEC W.A, user
 * 2026-11-04): the first tab to open holds the right to change things,
 * every other tab -- any browser, any device -- only views, until the
 * holder leaves. No "take over".
 *
 * The server decides (``POST /api/users/me/lease``, rag_lib/api/write_lease.py)
 * and refuses every change from a tab that does not hold it; this module
 * keeps the page in step so the buttons are off before anyone clicks:
 * - a holder says it is there every 30 s (2 minutes unheard and it has left);
 * - a view-only tab asks every 15 s, and at once when another tab of this
 *   browser says it let go (``BroadcastChannel``) or when it comes back to
 *   the foreground;
 * - leaving the page lets go: Sign out at once; closing or reloading after
 *   a few seconds (``?grace=1``), so a reload keeps the right (user
 *   2026-11-05: "刷新不算离开", review FC-1);
 * - however long it is left unused, an open tab keeps the right (user
 *   2026-11-05, second round); an unused tab's requests only stop renewing
 *   the sign-in (lib/activity).
 *
 * ``state``: 'unknown' until the first answer (treated as editable: the
 * server still refuses), 'editing', or 'viewing'.
 */
import { useRef, useSyncExternalStore } from 'react';
import { apiPost, apiPostOnLeave, onEditingElsewhere } from '../api/client';

export type LeaseState = 'unknown' | 'editing' | 'viewing';

export const LEASE_PATH = '/api/users/me/lease';
export const RELEASE_PATH = '/api/users/me/lease/release';
const HOLD_EVERY_MS = 30_000;
const ASK_EVERY_MS = 15_000;
/** As the server's RELEASE_GRACE_S: a closing tab still holds the right this long. */
const RELEASE_GRACE_MS = 5_000;
const CHANNEL = 'radar-lease';
/** How long Sign out waits to hear from the other signed-in tabs of this browser. */
const WHO_WAIT_MS = 250;

let state: LeaseState = 'unknown';
/** Set when this tab just got the right from another (the banner says so for a while). */
let handedAt: number | null = null;
/** On a page with no Shell (/privacy): takes no part (FC-4). */
let publicPage = false;
let started = false;
let timer: number | null = null;
let ch: BroadcastChannel | null = null;
const listeners = new Set<() => void>();

function emit(): void { listeners.forEach((cb) => cb()); }

function set(next: LeaseState): void {
  if (next === state) return;
  handedAt = state === 'viewing' && next === 'editing' ? Date.now() : null;
  state = next;
  emit();
}

export function leaseState(): LeaseState { return state; }

/** False only while another tab or device holds the account. */
export function canEdit(): boolean { return state !== 'viewing'; }

function schedule(ms: number): void {
  if (timer != null) window.clearTimeout(timer);
  timer = window.setTimeout(() => { void claim(); }, ms);
}

let asking: Promise<void> | null = null;
/** What the server last said, even after stopLease began (it decides whether to let go). */
let heldOnServer = false;

/** Ask the server for the right (or say this tab still holds it). */
export function claim(): Promise<void> {
  if (!started) return Promise.resolve();
  if (asking) return asking;
  asking = (async () => {
    try {
      const r = await apiPost<{ editing?: unknown }>(LEASE_PATH);
      heldOnServer = !!r && r.editing === true;
      if (started) set(heldOnServer ? 'editing' : 'viewing');
    } catch {
      // Not answered (offline, signed out): keep what was known; the
      // server refuses a change either way.
    } finally {
      asking = null;
      if (started) schedule(state === 'editing' ? HOLD_EVERY_MS : ASK_EVERY_MS);
    }
  })();
  return asking;
}

/** Another tab of this browser let go: its release may still be on its way,
 *  so ask again shortly. A closing or reloading tab keeps the right for
 *  RELEASE_GRACE_MS (a reload takes it straight back), so ask again after that too. */
function askSoon(grace: boolean): void {
  if (!started || state === 'editing') return;
  if (!grace) {
    window.setTimeout(() => { void claim(); }, 150);
    window.setTimeout(() => { if (state !== 'editing') void claim(); }, 1500);
  }
  window.setTimeout(() => { if (state !== 'editing') void claim(); }, RELEASE_GRACE_MS + 500);
  window.setTimeout(() => { if (state !== 'editing') void claim(); }, RELEASE_GRACE_MS + 2500);
}

/** This tab's own "who is signed in?" questions: a channel hears the other
 *  channels of its own page too, so without this a tab answered itself and
 *  the last tab never signed out for real. */
const ownQuestions = new Set<string>();

/**
 * Whether this tab counts as signed in for another tab's Sign out (R6):
 * from the moment it loads, not only once its sign-in has resolved -- a tab
 * still loading, or kept for Back, was missed and the other tab signed the
 * browser out under it (review WA-R4). Not a tab signed out on its own,
 * and not before this browser has ever been signed in.
 */
function signedInHere(): boolean {
  if (publicPage) return false;
  try {
    return window.sessionStorage.getItem('radar.tabSignedOut') !== '1' && !!window.localStorage.getItem('userEmail');
  } catch {
    return started;
  }
}

function onMessage(e: MessageEvent): void {
  const m = e.data as { type?: string; nonce?: string; grace?: boolean } | null;
  if (!m) return;
  if (m.type === 'who' && m.nonce && !ownQuestions.has(m.nonce)) {
    if (signedInHere()) ch?.postMessage({ type: 'here', nonce: m.nonce });
    return;
  }
  if (m.type === 'released' && started) askSoon(!!m.grace);
}

function openChannel(): void {
  if (ch) return;
  try { ch = new BroadcastChannel(CHANNEL); ch.addEventListener('message', onMessage); } catch { ch = null; }
}
if (typeof window !== 'undefined') openChannel();

function onVisible(): void {
  if (document.visibilityState === 'visible') void claim();
}

function onPageHide(): void {
  // Closed, reloaded, or gone to another site: let go, so the next tab does
  // not wait 2 minutes -- after the grace, so that a reload takes it back
  // first (FC-1). A page kept for Back resumes on pageshow.
  if (!started) return;
  const leave = `${RELEASE_PATH}?grace=1`;
  if (state === 'editing' || asking) {
    apiPostOnLeave(leave);
    // A heartbeat still on its way may reach the server after the release
    // and take the right back (review WA-R3): let go again once it is in,
    // if the page is still there to send it.
    asking?.finally(() => apiPostOnLeave(leave));
    try { ch?.postMessage({ type: 'released', grace: true }); } catch { /* closing */ }
  }
  if (timer != null) window.clearTimeout(timer);
  timer = null;
  state = 'unknown';
}

function onPageShow(e: PageTransitionEvent): void {
  if (e.persisted) void claim();
}

let stopRefused: (() => void) | null = null;
/** Bumped by every start and stop: a stop that waited sees whether it is still the latest. */
let runs = 0;

/** Signed in (App's gate is ready): take part. */
export function startLease(): void {
  if (started) return;
  started = true;
  runs += 1;
  // Listeners a stop still waiting has not removed yet: not twice.
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('pagehide', onPageHide);
  window.removeEventListener('pageshow', onPageShow);
  stopRefused?.(); stopRefused = null;
  openChannel();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  // A change refused by the server. A tab that thought it held the right
  // asks once at once: a refusal sent just before it was handed the right
  // came back after (FC-5). Otherwise it is view-only now.
  stopRefused = onEditingElsewhere(() => {
    if (state === 'editing') { void claim(); return; }
    set('viewing'); schedule(ASK_EVERY_MS);
  });
  void claim();
}

/** /privacy and the like (no Shell): this tab takes no part in the right
 *  to change things, nor counts as a signed-in tab for Sign out (FC-4). */
export function setPublicPage(on: boolean): void { publicPage = on; }

/** Signed out, or the session ended: stop asking. ``release``: let go first (Sign out). */
export async function stopLease({ release = false } = {}): Promise<void> {
  if (!started) return;
  started = false;
  const mine = ++runs;
  // A claim on its way (the first one, or a heartbeat) would take the right
  // after the release (review WA-R3): wait for it, then decide.
  if (asking) await asking.catch(() => {});
  // Started again meanwhile (/privacy and back within the wait, review
  // R5): what the new run set up is not this stop's to tear down.
  if (mine !== runs || started) {
    if (release && heldOnServer && !started) { try { await apiPost(RELEASE_PATH); } catch { /* */ } }
    return;
  }
  const held = heldOnServer;
  if (timer != null) window.clearTimeout(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('pagehide', onPageHide);
  window.removeEventListener('pageshow', onPageShow);
  stopRefused?.();
  stopRefused = null;

  heldOnServer = false;
  if (release && held) {
    try { await apiPost(RELEASE_PATH); } catch { /* the 2 minutes take care of it */ }
    try { ch?.postMessage({ type: 'released' }); } catch { /* no channel */ }
  }
  set('unknown');
}

/**
 * Whether another tab of this browser is signed in (W.A R6): Sign out then
 * leaves only this tab and keeps the browser's sign-in for them.
 */
export function otherSignedInTabs(): Promise<boolean> {
  return new Promise((resolve) => {
    let probe: BroadcastChannel;
    try { probe = new BroadcastChannel(CHANNEL); } catch { resolve(false); return; }
    const nonce = Math.random().toString(36).slice(2);
    ownQuestions.add(nonce);
    let seen = false;
    probe.addEventListener('message', (e: MessageEvent) => {
      const m = e.data as { type?: string; nonce?: string } | null;
      if (m?.type === 'here' && m.nonce === nonce) seen = true;
    });
    probe.postMessage({ type: 'who', nonce });
    window.setTimeout(() => { ownQuestions.delete(nonce); try { probe.close(); } catch { /* */ } resolve(seen); }, WHO_WAIT_MS);
  });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useLease(): LeaseState {
  return useSyncExternalStore(subscribe, leaseState, () => 'unknown' as LeaseState);
}

/** False while another tab or device holds the account: write buttons are off. */
export function useCanEdit(): boolean {
  return useLease() !== 'viewing';
}

/**
 * For a page that opens a draft or an edit copy (New interest, Edit
 * interest): whether to show it at all. A view-only tab does not open one
 * (W.A R2). Once opened while this tab held the right, the page stays when
 * the right goes (asleep past 2 minutes): what was typed stays
 * on screen, read-only, until the right comes back (user 2026-11-05,
 * review FC-2). It used to be replaced at once, without asking, and the
 * work on it lost.
 */
export function useOpensHere(): boolean {
  const lease = useLease();
  const opened = useRef(false);
  if (lease === 'editing') opened.current = true;
  return lease !== 'viewing' || opened.current;
}

/** When this tab was handed the right (for the banner's "you can change things now"). */
export function handedOverAt(): number | null { return handedAt; }

export const VIEW_ONLY_TEXT = 'This tab can only view: this account is being changed in another tab or on another device. It can change things once that one is closed or signed out (within 2 minutes if it was closed without signing out).';
