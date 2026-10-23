/**
 * The second click of a double click on a button is dropped, for every
 * button in the app. A button whose click takes its row away (Save or
 * Dismiss on a feed card, striking a research topic, moving a researcher)
 * had that click land on the row moved up under it: two papers triaged for
 * one (round 19). Done here, before React sees the click, so a button added
 * later is covered too; the Button component alone left 19 plain buttons out.
 *
 * ``detail`` counts the clicks of one quick series on one spot. A control
 * meant for quick repeated clicks opts out with ``data-repeat``.
 */
const TARGET = 'button, [role="button"]';

export function installRepeatClickGuard(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('click', (e) => {
    if (e.detail < 2) return;
    const el = (e.target as Element | null)?.closest?.(TARGET);
    if (!el || el.closest('[data-repeat]')) return;
    e.stopPropagation();
    e.preventDefault();
  }, { capture: true });
}
