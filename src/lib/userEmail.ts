/**
 * userEmail — small accessor for ``localStorage.userEmail``.
 *
 * Centralised here so the Login / AuthGuard / Settings components
 * agree on the storage key and also notify each other when the value
 * changes (the ``storage`` event only fires across tabs, so we layer
 * a custom event on top of it for same-tab listeners).
 */

const KEY = 'userEmail';
const EVENT = 'radar:user-email-changed';

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
  window.localStorage.setItem(KEY, email);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function clearUserEmail(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVENT));
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
