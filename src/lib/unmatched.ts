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

/** After uploads: the PDFs that matched no OpenAlex paper. */
export function noteUnmatchedUploads(files: string[]): void {
  if (!files.length) return;
  toast.info(
    `Not found on OpenAlex: ${names(files)}. ${files.length === 1 ? 'It is' : 'They are'} kept and scored from the PDF's own text, and the topics to search are read from that text too (marked PDF under Topics).`,
  );
}

/** After a Prosopia import: the papers that resolved to no OpenAlex work. */
export function noteUnmatchedImport(unresolved: string[] | null | undefined): void {
  const n = unresolved?.length ?? 0;
  if (!n) return;
  toast.info(
    `${plural(n, 'paper')} not found on OpenAlex (${names(unresolved!)}). ${n === 1 ? 'It is' : 'They are'} kept as ${n === 1 ? 'a seed' : 'seeds'}, scored from the Prosopia summary, but add no OpenAlex topics to search.`,
  );
}
