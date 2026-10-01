/**
 * Where a paper can be read: its DOI, else its OpenAlex page. Null for an
 * id that names nothing outside Radar (an uploaded PDF's local:<hash>, an
 * unresolved prosopia:… record).
 */
export function paperHref(id: string | null | undefined, doi?: string | null): string | null {
  if (doi) return `https://doi.org/${doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}`;
  if (!id) return null;
  if (/^https:\/\/openalex\.org\/W\d+$/.test(id)) return id;
  if (/^W\d+$/.test(id)) return `https://openalex.org/${id}`;
  return null;
}

/**
 * Just the link (or plain text when the paper has nowhere to open), for a
 * title that already sits in its own styled element.
 */
export function PaperLink({ title, id, doi }: { title: string; id?: string | null; doi?: string | null }) {
  const href = paperHref(id, doi);
  if (!href) return <>{title}</>;
  return <a className="paper-link" href={href} target="_blank" rel="noopener noreferrer" title="Open the paper in a new tab" onClick={(e) => e.stopPropagation()}>{title}</a>;
}
