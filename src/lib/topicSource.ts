/**
 * Where a topic came from, for the topic lists. ``null`` is OpenAlex's own
 * assignment to a seed; ``umls`` is mapped from a seed's UMLS concepts;
 * ``pdf_content`` is read from the text of an uploaded PDF OpenAlex does not
 * have (rag_lib/content_topics.py); ``researcher`` was declared on the
 * researcher's own profile and no seed carries it (rag_lib/researcher_topics.py).
 */
export function topicSourceTag(source: string | null | undefined): string | null {
  if (source === 'umls') return 'UMLS';
  if (source === 'pdf_content') return 'PDF';
  if (source === 'researcher') return 'PROFILE';
  return null;
}

export function topicSourceLabel(source: string | null | undefined): string {
  if (source === 'umls') return 'mapped via UMLS';
  if (source === 'pdf_content') return "read from an uploaded PDF's text (not on OpenAlex)";
  if (source === 'researcher') return "declared on the researcher's profile (no seed carries it)";
  if (source === 'adopted') return "kept from the profile of a researcher since forgotten";
  return 'OpenAlex topic';
}

/** How the researcher's profile reads on a topic, for a title or a note. */
export function topicProfileNote(profile: string | null | undefined): string | null {
  if (profile === 'interest') return "an interest on the researcher's profile";
  if (profile === 'not_interest') return "not wanted, per the researcher's profile";
  return null;
}
