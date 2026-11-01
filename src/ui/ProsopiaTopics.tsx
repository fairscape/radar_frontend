import type { Topic } from '../types/radar';

/**
 * The Prosopia profiles that list a topic as an interest (FUNCTIONAL_SPEC
 * M.3). A profile imported in step 1 brings its interests into the topic
 * list: a topic the seeds have is only marked, one they do not is added
 * off. The mark says where it comes from; it suggests nothing, and the
 * topic switches as any other.
 */
export function prosopiaProfiles(t: Topic): string[] {
  return (t.prosopia ?? []).map((p) => p.profile);
}

/** "Prosopia interest of A, B", for a chip's title; null when no profile lists it. */
export function prosopiaNote(t: Topic): string | null {
  const names = prosopiaProfiles(t);
  return names.length > 0 ? `Prosopia interest of ${names.join(', ')}` : null;
}

/** The chip's "Prosopia interest" tag. */
export function ProsopiaTag({ topic }: { topic: Topic }) {
  const note = prosopiaNote(topic);
  return note ? <span className="src" title={note}>Prosopia interest</span> : null;
}
