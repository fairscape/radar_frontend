/**
 * The signed-in address, as the UI displays it.
 *
 * This used to *be* the identity: whatever was typed into the login box
 * landed here and went out as ``X-User-Email``. It no longer decides
 * anything. Either Cloudflare Access verifies the person and the reverse
 * proxy overwrites that header, or (a sign-in button, Prosopia or Google) the
 * backend signs the person in through Prosopia and reads a session cookie
 * instead of the header. Either way a value invented here is ignored.
 *
 * What it is now is a display cache, written only by ``App`` from what
 * ``GET /api/users/me`` returned, so the sidebar can paint an address on
 * the first frame instead of flashing empty. The rule that matters:
 * **never store a value that did not come from the server.** A stale or
 * invented address shows one identity beside another's data, which is
 * exactly the confusion this module used to cause.
 */
import { useSyncExternalStore } from 'react';
import { resetDraft } from './draft';
import { resetJobs } from './jobs';
import { clearQueryCache } from './query';
import type { SignInProvider } from '../api/endpoints/auth';

const KEY = 'userEmail';
const EVENT = 'radar:user-email-changed';

/** Cloudflare Access ends the session here. The app has none of its own. */
export const ACCESS_LOGOUT_PATH = '/cdn-cgi/access/logout';
/** The backend ends a sign-in-button session here (clears its cookie). */
export const SESSION_LOGOUT_PATH = '/auth/logout';

let signedInWith: SignInProvider | null = null;

/** Set once by ``App`` from ``GET /auth/config``: who issued the session cookie. */
export function setSignedInWith(p: SignInProvider | null): void {
  signedInWith = p;
}

export function getUserEmail(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Cache an address the server confirmed. Not for user input. */
export function setUserEmail(email: string): void {
  try {
    window.localStorage.setItem(KEY, email);
  } catch {
    // Private mode, or storage blocked. The app still works; the address
    // just re-resolves from the server on every load.
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function clearUserEmail(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* see setUserEmail */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/**
 * Per-tab state that belongs to whoever was signed in, not to the tab.
 *
 * ``sessionStorage`` survives navigating to the Access logout and back
 * through the login in the same tab, so without clearing it the next
 * person inherits the last one's: ``radar.jobs.v1`` would render their job
 * strip (interest and researcher names included) and the module-level
 * poller -- which starts on import, before the identity gate resolves --
 * would poll their run ids under the new identity; ``radar.wizard.v2``
 * would offer to resume their half-built draft.
 */
const SESSION_KEYS = ['radar.jobs.v1', 'radar.wizard.v2'];
// Per-person localStorage keys (``<prefix>:<email>``). They are already
// scoped to whoever is signed in; signing out removes this person's too.
const PERSON_LOCAL_PREFIXES = ['radar.lastOrcid'];

/**
 * Drop the per-tab state of whoever was signed in before: called when the
 * server resolves a different address than the one cached (A's Access
 * session lapsed and B signed in through Access in the same tab), so B's
 * app does not poll A's run ids or show A's job strip.
 */
export function forgetSessionState(): void {
  // The in-memory copies first: both modules loaded their state from
  // sessionStorage at import and would write it back on the next change.
  resetJobs();
  resetDraft();
  // The request cache is per tab and outlives the Shell: without this the
  // next person saw the previous one's lists until they aged out.
  clearQueryCache();
  try {
    for (const k of SESSION_KEYS) window.sessionStorage.removeItem(k);
  } catch {
    // Storage blocked: nothing was kept either.
  }
}

/**
 * Sign out for real.
 *
 * Clearing the cached address alone leaves the real session intact (the
 * Access session, or the backend's Prosopia cookie), so the next request
 * carries the same identity and the user appears to sign out and then
 * finds themselves signed in as the same person. Hand off to whichever
 * holds the session and let it drop it.
 */
export function signOut(): void {
  // Read before clearUserEmail(): afterwards there is no one to clear for.
  const who = getUserEmail();
  clearUserEmail();
  resetJobs();
  resetDraft();
  clearQueryCache();
  try {
    for (const k of SESSION_KEYS) window.sessionStorage.removeItem(k);
    if (who) for (const p of PERSON_LOCAL_PREFIXES) window.localStorage.removeItem(`${p}:${who.toLowerCase()}`);
  } catch {
    // Storage blocked. Nothing was written either, so nothing leaks.
  }
  if (signedInWith) {
    // The session is the backend's cookie. This does not sign the person
    // out of Prosopia or Google, so the next sign-in may go straight through.
    window.location.href = SESSION_LOGOUT_PATH;
    return;
  }
  if (import.meta.env.DEV) {
    // Nothing in front of the dev server to log out of.
    window.location.reload();
    return;
  }
  window.location.href = ACCESS_LOGOUT_PATH;
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function useUserEmail(): string | null {
  return useSyncExternalStore(subscribe, getUserEmail, () => null);
}

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
