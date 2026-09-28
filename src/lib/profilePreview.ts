/**
 * profilePreview — client-side pre-check of a pasted Researcher Profile
 * document, shared by the topic wizard (FROM PROFILE) and the Researchers
 * library import panel. The server does the real validation.
 */

const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

/** What the wizard shows before submitting a pasted profile document. */
export interface ProfilePreview {
  name: string;
  orcid: string | null;
  level: string | null;
  nExpertise: number;
  nNotInterests: number;
}

export function previewProfile(text: string): { preview: ProfilePreview | null; error: string | null } {
  const t = text.trim();
  if (!t) return { preview: null, error: null };
  let doc: unknown;
  try {
    doc = JSON.parse(t);
  } catch {
    return { preview: null, error: 'not valid JSON yet' };
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { preview: null, error: 'the document must be a JSON object' };
  }
  const d = doc as Record<string, unknown>;
  const name = typeof d.name === 'string' ? d.name.trim() : '';
  if (!name) return { preview: null, error: 'the document has no "name"' };
  const rid = typeof d.rid === 'string' ? d.rid : '';
  const id = typeof d['@id'] === 'string' ? (d['@id'] as string) : '';
  const orcid = normalizeOrcidInput(rid) ?? normalizeOrcidInput(id);
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  return {
    preview: {
      name,
      orcid,
      level: typeof d.level === 'string' ? d.level : null,
      nExpertise: len(d.expertise),
      nNotInterests: len(d.not_interests),
    },
    error: null,
  };
}

export function normalizeOrcidInput(raw: string): string | null {
  let s = raw.trim();
  for (const prefix of ['https://orcid.org/', 'http://orcid.org/', 'orcid.org/']) {
    if (s.toLowerCase().startsWith(prefix)) {
      s = s.slice(prefix.length);
      break;
    }
  }
  s = s.replace(/\/+$/, '').toUpperCase();
  return ORCID_RE.test(s) ? s : null;
}

