/**
 * The signed-in address, as the UI displays it.
 *
 * This used to *be* the identity: whatever was typed into the login box
 * landed here and went out as ``X-User-Email``. It no longer decides
 * anything. Cloudflare Access verifies the person in front of the app and
 * the reverse proxy overwrites that header with the address it verified,
 * so a value invented here reaches a backend that ignores it.
 *
 * What it is now is a display cache, written only by ``App`` from what
 * ``GET /api/users/me`` returned, so the sidebar can paint an address on
 * the first frame instead of flashing empty. The rule that matters:
 * **never store a value that did not come from the server.** A stale or
 * invented address shows one identity beside another's data, which is
 * exactly the confusion this module used to cause.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'userEmail';
const EVENT = 'radar:user-email-changed';

/** Cloudflare Access ends the session here. The app has none of its own. */
export const ACCESS_LOGOUT_PATH = '/cdn-cgi/access/logout';

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

/**
 * Sign out for real.
 *
 * Clearing the cached address alone leaves the Access session intact, so
 * the next request carries the same verified identity and the user appears
 * to sign out and then finds themselves signed in as the same person.
 * Hand off to Access and let it drop the session.
 */
export function signOut(): void {
  clearUserEmail();
  try {
    for (const k of SESSION_KEYS) window.sessionStorage.removeItem(k);
  } catch {
    // Storage blocked. Nothing was written either, so nothing leaks.
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
