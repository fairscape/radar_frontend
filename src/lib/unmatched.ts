/**
 * Telling the user which papers RADAR could not find on OpenAlex.
 *
 * Such a paper is still a seed, scored from its own text (a PDF's title
 * and body, a Prosopia paper's summary). What it lacks is an OpenAlex
 * record: an uploaded PDF's topics are then read from its text instead
 * (marked PDF in the topic list), and a Prosopia paper adds none.
 */
import { ApiError } from '../api/client';
import { plural } from './format';
import { toast } from './toast';

/**
 * A paper OpenAlex has no record of. An upload is its user's own version,
 * ``local:upload:…``, matched or not; ``canonicalId`` names the work it
 * matched. Pass the doc (or seed) when there is one.
 */
export function isUnmatched(paper: string | { id: string; canonicalId?: string | null } | null | undefined): boolean {
  if (!paper) return false;
  if (typeof paper === 'string') return paper.startsWith('local:');
  return !paper.canonicalId && paper.id.startsWith('local:');
}

/** The id to link a paper by: the public work of an uploaded version. */
export function workId(paper: { id: string; canonicalId?: string | null }): string {
  return paper.canonicalId ?? paper.id;
}

/** Every id a list of seeds stands for: each seed's own and its work's. */
export function seedKeys(seeds: { id: string; canonicalId?: string | null }[]): Set<string> {
  return new Set(seeds.flatMap((s) => (s.canonicalId ? [s.id, s.canonicalId] : [s.id])));
}

/**
 * ``seeds`` with ``doc`` attached, as the backend attaches it: every
 * uploaded file is a seed of its own, beside an earlier file or the public
 * record of the same paper; the public record of a paper already seeded as
 * an upload adds nothing (FUNCTIONAL_SPEC 1.7).
 */
export function withSeed<T extends { id: string; canonicalId?: string | null }>(seeds: T[], doc: T): T[] {
  if (seeds.some((d) => d.id === doc.id)) return seeds;
  if (!doc.id.startsWith('local:upload:') && seeds.some((d) => d.canonicalId === doc.id)) return seeds;
  return [...seeds, doc];
}

/**
 * A paper's name as listed: its title, and -- when the user has uploaded
 * two or more files of it -- which file this is and when it was uploaded,
 * e.g. "Title (version 2, uploaded 2026-10-27)". Only the name: the stored
 * title is unchanged.
 */
export function displayTitle(p: { title: string; version?: number | null; uploaded?: string | null; added?: string | null }): string {
  if (!p.version) return p.title;
  const when = (p.uploaded ?? p.added ?? '').slice(0, 10);
  return `${p.title} (version ${p.version}${when ? `, uploaded ${when}` : ''})`;
}

function names(list: string[]): string {
  const shown = list.slice(0, 3).join(', ');
  return list.length > 3 ? `${shown} and ${list.length - 3} more` : shown;
}

/**
 * After uploads: the PDFs that matched no OpenAlex paper. ``where`` is where
 * they went, because what happens next differs: in the Vault they are only
 * stored; a draft's topics are aggregated from them at the topic step; a
 * saved interest is re-fitted at once but its topics change only when the
 * user saves them under Topics.
 */
export function noteUnmatchedUploads(files: string[], where: 'vault' | 'draft' | 'interest'): void {
  if (!files.length) return;
  const it = files.length === 1 ? 'It is' : 'They are';
  const next = where === 'vault'
    ? `${it} kept with ${files.length === 1 ? 'its' : 'their'} own text.`
    : where === 'draft'
      ? `${it} kept as ${files.length === 1 ? 'a seed' : 'seeds'}, scored from the PDF's own text; topics to search are read from that text where it is clear enough (marked PDF under Topics).`
      : `${it} kept as ${files.length === 1 ? 'a seed' : 'seeds'}, scored from the PDF's own text. Topics read from it appear under Edit interest → Topics, switched off until you choose them.`;
  toast.info(`Not found on OpenAlex: ${names(files)}. ${next}`);
}

/** After an import: the papers that resolved to no OpenAlex work (by the source's own ids). */
export function noteUnmatchedImport(unresolved: string[] | null | undefined): void {
  const n = unresolved?.length ?? 0;
  if (!n) return;
  toast.info(
    `${plural(n, 'paper')} not found on OpenAlex (${names(unresolved!)}). ${n === 1 ? 'It is' : 'They are'} kept as ${n === 1 ? 'a seed' : 'seeds'}, scored from the summary the source gives, but add no topics to search.`,
  );
}

/**
 * After uploads: the files added as another version of a paper already in
 * the vault (both versions are kept, both seeds; FUNCTIONAL_SPEC 1.7).
 */
export function noteNewVersions(docs: { title: string; version?: number | null }[]): void {
  const v = docs.filter((d) => d.version && d.version > 1);
  if (!v.length) return;
  toast.info(`Already in your vault as another file: ${names(v.map((d) => `${d.title} (now version ${d.version})`))}. Both files are kept, each a seed; remove either from the seeds if you want only one.`);
}

/** An upload refused because OpenAlex could not answer: stop the batch. */
export function openAlexStopped(e: unknown): boolean {
  return e instanceof ApiError && e.status === 503 && !!e.body && typeof e.body === 'object' && 'openalex' in e.body;
}

/** Where a seed came from, in words, for the interest's seed list; null when not recorded. */
export function seedSource(s: { source?: string | null; sourceResearcherName?: string | null }): string | null {
  switch (s.source) {
    case 'upload': return 'Uploaded PDF';
    case 'researcher': return s.sourceResearcherName ? `From ${s.sourceResearcherName}'s profile` : 'From a researcher profile';
    case 'vault': return 'Picked from the vault';
    case 'feed': return 'Added from the feed';
    default: return null;
  }
}
