/**
 * Whether someone is using this tab (user 2026-11-05, review BL-3).
 *
 * A tab with no mouse, key, scroll or touch for ``IDLE_AFTER_MS`` is idle; a
 * tab in the background gets none of these, so it goes idle too. Coming back
 * to the tab counts as use. An idle tab's requests say so (``X-Radar-Idle: 1``)
 * and the server does not renew the sign-in for them, so a tab forgotten on
 * another device signs out after BIOXPLORER_SESSION_DAYS. It keeps the right
 * to change things meanwhile (user 2026-11-05, second round).
 */
export const IDLE_AFTER_MS = 10 * 60_000;
export const IDLE_HEADER = 'X-Radar-Idle';

let lastUse = Date.now();
const listeners = new Set<(idle: boolean) => void>();
let wasIdle = false;
let timer: number | null = null;

export function isIdle(now = Date.now()): boolean { return now - lastUse >= IDLE_AFTER_MS; }

/** ``{'X-Radar-Idle': '1'}`` while idle, else nothing. */
export function idleHeader(): Record<string, string> { return isIdle() ? { [IDLE_HEADER]: '1' } : {}; }

/** Called when the tab goes idle (true) or is used again (false). */
export function onIdleChange(cb: (idle: boolean) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function settle(): void {
  const idle = isIdle();
  if (idle !== wasIdle) {
    wasIdle = idle;
    listeners.forEach((cb) => cb(idle));
  }
  if (timer != null) window.clearTimeout(timer);
  timer = window.setTimeout(settle, idle ? IDLE_AFTER_MS : Math.max(1000, lastUse + IDLE_AFTER_MS - Date.now() + 50));
}

let lastMark = 0;
function used(): void {
  const now = Date.now();
  lastUse = now;
  // mousemove fires many times a second: settle at most once a second,
  // but at once when it ends an idle spell.
  if (wasIdle || now - lastMark > 1000) { lastMark = now; settle(); }
}

/** Tests: pretend the last use was ``msAgo`` ago. */
export function _setLastUseForTest(msAgo: number): void { lastUse = Date.now() - msAgo; settle(); }

if (typeof window !== 'undefined') {
  const opts = { capture: true, passive: true } as const;
  for (const ev of ['mousemove', 'mousedown', 'pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart']) {
    window.addEventListener(ev, used, opts);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') used(); });
  settle();
}
