/**
 * userEmail — the signed-in identity, as the UI knows it.
 *
 * This used to be the identity: whatever the user typed into the login
 * box was written here and sent as ``X-User-Email``. It is no longer.
 * The deployment puts Cloudflare Access in front of the app and the
 * reverse proxy overwrites ``X-User-Email`` with the address Access
 * verified, so what is stored here can never grant access to anything.
 *
 * It is now a display cache, filled by ``AuthGuard`` from
 * ``GET /api/users/me`` — the server's answer to "who am I". Keeping it
 * in localStorage means the sidebar and top bar can render the address
 * on the first paint instead of flashing empty, and the existing
 * subscribers keep working unchanged.
 *
 * The rule that matters: never write a value here that did not come
 * from the server. A stale or invented address shows one identity while
 * the API returns another's data, which is precisely the confusion this
 * module caused before.
 */

const KEY = 'userEmail';
const EVENT = 'radar:user-email-changed';

/** Cloudflare Access ends the session here; the app has no session of
 *  its own to end. Same-origin, so the tunnel routes it to Access. */
export const ACCESS_LOGOUT_PATH = '/cdn-cgi/access/logout';

export function getUserEmail(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setUserEmail(email: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, email);
  } catch {
    /* private mode / storage disabled — the app still works, the
       address just re-resolves from the server on every load. */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function clearUserEmail(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* see setUserEmail */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/**
 * Sign out for real.
 *
 * Clearing the cached address alone would leave the Access session
 * intact: the next request still carries the same verified identity, so
 * the user appears to sign out and then finds themselves signed in as
 * the same person. Hand off to Access and let it drop the session.
 */
export function signOut(): void {
  clearUserEmail();
  if (typeof window === 'undefined') return;
  if (import.meta.env.DEV) {
    // No Access in front of the dev server; there is nothing to log out
    // of, so fall back to the local gate.
    window.location.reload();
    return;
  }
  window.location.href = ACCESS_LOGOUT_PATH;
}

export function subscribeUserEmail(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
