/** ``localStorage.userEmail`` accessor + same-tab change notification. */
import { useSyncExternalStore } from 'react';

const KEY = 'userEmail';
const EVENT = 'radar:user-email-changed';

export function getUserEmail(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setUserEmail(email: string): void {
  window.localStorage.setItem(KEY, email);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function clearUserEmail(): void {
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVENT));
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
