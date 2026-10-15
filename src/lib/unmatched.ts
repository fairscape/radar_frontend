/**
 * Telling the user which papers RADAR could not find on OpenAlex.
 *
 * Such a paper is still a seed, scored from its own text (a PDF's title
 * and body, a Prosopia paper's summary). What it lacks is an OpenAlex
 * record: an uploaded PDF's topics are then read from its text instead
 * (marked PDF in the topic list), and a Prosopia paper adds none.
 */
import { plural } from './format';
import { toast } from './toast';

/** An upload that matched no OpenAlex work is stored under ``local:<hash>``. */
export function isUnmatched(id: string | null | undefined): boolean {
  return !!id && id.startsWith('local:');
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
