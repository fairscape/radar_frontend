/**
 * Where a topic came from, for the topic lists. ``null`` is OpenAlex's own
 * assignment to a seed; ``umls`` is mapped from a seed's UMLS concepts;
 * ``pdf_content`` is read from the text of an uploaded PDF OpenAlex does not
 * have (rag_lib/content_topics.py).
 */
export function topicSourceTag(source: string | null | undefined): string | null {
  if (source === 'umls') return 'UMLS';
  if (source === 'pdf_content') return 'PDF';
  return null;
}

export function topicSourceLabel(source: string | null | undefined): string {
  if (source === 'umls') return 'mapped via UMLS';
  if (source === 'pdf_content') return "read from an uploaded PDF's text (not on OpenAlex)";
  return 'OpenAlex topic';
}
