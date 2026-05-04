/**
 * useFocusRevalidate — calls ``refresh()`` when the tab becomes visible
 * or regains focus, with a small throttle so flipping between windows
 * doesn't fire a flurry of requests.
 *
 * Pair this with a hook's existing ``refresh`` callback so coming back
 * to the app picks up backend-side changes without Ctrl+R.
 */

import { useEffect, useRef } from 'react';

const THROTTLE_MS = 2000;

export function useFocusRevalidate(refresh: () => void): void {
  const lastRef = useRef<number>(0);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const fire = () => {
      const now = Date.now();
      if (now - lastRef.current < THROTTLE_MS) return;
      lastRef.current = now;
      refreshRef.current();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') fire();
    };

    window.addEventListener('focus', fire);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', fire);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
