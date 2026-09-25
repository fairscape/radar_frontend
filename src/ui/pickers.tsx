/**
 * Paper pick lists.
 *
 * Two places offer a researcher's papers as checkboxes: the wizard
 * (seeds for a new interest) and the Profiles page (papers to store).
 * ``LookupPicker`` is the "type an id → Find papers → tick → go" flow
 * they share; ``PaperPickList`` is the list itself, also used when the
 * papers are already known (a stored profile).
 */
import { useState } from 'react';
import { fetchOrcidWorks, fetchProsopiaWorks } from '../api/endpoints/prosopia';
import { plural } from '../lib/format';
import type { Job } from '../lib/jobs';
import { Button, EmptyState, ErrorBox, Field, Input, useAction } from './index';
import { JobProgress } from './domain';

/** A paper offered for import, whichever service listed it. */
export interface PickWork {
  id: string;
  title: string;
  year: number | null;
  venue: string | null;
  type?: string | null;
  cited_by_count?: number | null;
  authors: string[];
  n_authors?: number | null;
  /** Extra note shown at the right (e.g. the resolution rung). */
  note?: string | null;
}

/** OpenAlex work types that read as papers; software and dataset records start unticked. */
export const PAPER_TYPES = new Set(['article', 'preprint', 'review', 'book-chapter', 'book', 'conference-paper', 'dissertation', 'letter', 'report', 'editorial', 'erratum', 'reference-entry', 'paratext', 'other']);
export function papersOf(works: PickWork[]): PickWork[] {
  return works.filter((w) => !w.type || PAPER_TYPES.has(w.type));
}

/** A bare ORCID or an orcid.org URL, normalised to the bare id; null if it is neither. */
export function parseOrcid(raw: string): string | null {
  const v = raw.trim().replace(/^https?:\/\/(www\.)?orcid\.org\//i, '').replace(/\/+$/, '');
  return /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(v) ? v.toUpperCase() : null;
}

export interface Lookup {
  label: string;
  hint: string;
  placeholder: string;
  /** The key to look up, or null when the text is not usable yet. */
  parse: (raw: string) => string | null;
  parseError: string;
  find: (key: string) => Promise<{ key: string; name: string | null; works: PickWork[] }>;
  emptyTitle: string;
  emptyBody: string;
}

export const ORCID_LOOKUP: Lookup = {
  label: 'ORCID iD',
  hint: 'Radar lists every paper OpenAlex attributes to this ORCID; untick the ones that should not count.',
  placeholder: '0000-0001-5643-4068 or https://orcid.org/…',
  parse: parseOrcid,
  parseError: 'That does not look like an ORCID (0000-0000-0000-0000).',
  find: async (orcid) => {
    const r = await fetchOrcidWorks(orcid);
    return { key: r.orcid, name: r.name, works: r.works.map((w) => ({ id: w.openalex_id, title: w.title, year: w.year, venue: w.venue, type: w.type, cited_by_count: w.cited_by_count, authors: w.authors, n_authors: w.n_authors })) };
  },
  emptyTitle: 'No papers on OpenAlex for this ORCID',
  emptyBody: 'OpenAlex has no works with this ORCID on an authorship. Check the iD, or upload PDFs instead.',
};

export const PROSOPIA_LOOKUP: Lookup = {
  label: 'Prosopia profile',
  hint: "The profile's slug or its URL. Radar lists the profile's papers; untick the ones that should not count.",
  placeholder: 'e.g. sheffield-nathan or https://prosopia.databio.org/…',
  parse: (raw) => raw.trim() || null,
  parseError: '',
  find: async (ref) => {
    const r = await fetchProsopiaWorks(ref);
    return { key: r.slug, name: r.name, works: r.works.map((w) => ({ id: w.id, title: w.title, year: w.year, venue: w.venue, cited_by_count: w.cited_by_count, authors: w.authors, n_authors: w.n_authors })) };
  },
  emptyTitle: 'This profile lists no papers',
  emptyBody: 'The profile exists but has no papers to import. Upload PDFs instead.',
};

export function PaperPickList({ works, picked, onChange, disabled, ariaLabel = 'Papers', head }: {
  works: PickWork[];
  picked: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
  ariaLabel?: string;
  /** Text before the count, e.g. the researcher's name. */
  head?: string | null;
}) {
  const nonPapers = works.length - papersOf(works).length;
  function toggle(id: string) {
    const n = new Set(picked);
    if (n.has(id)) n.delete(id); else n.add(id);
    onChange(n);
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="pick-head">
        <span className="field-label">{head ? `${head} · ` : ''}{picked.size} of {works.length} papers selected</span>
        <span className="row" style={{ gap: 6 }}>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(new Set(works.map((w) => w.id)))}>All</Button>
          {nonPapers > 0 && <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(new Set(papersOf(works).map((w) => w.id)))}>Papers only</Button>}
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(new Set())}>None</Button>
        </span>
      </div>
      {nonPapers > 0 && <p className="small muted" style={{ margin: 0 }}>{plural(nonPapers, 'software or dataset record')} start unticked; tick any that should count.</p>}
      <div className="pick-list" role="group" aria-label={ariaLabel}>
        {works.map((w) => (
          <label className={`pick-row ${picked.has(w.id) ? 'on' : ''}`} key={w.id}>
            <input type="checkbox" checked={picked.has(w.id)} disabled={disabled} onChange={() => toggle(w.id)} />
            <span>
              <div className="truncate" title={w.title}>{w.title}</div>
              <div className="v">{[w.year, w.venue, w.n_authors && w.n_authors > 3 ? `${w.authors.slice(0, 2).join(', ')} +${w.n_authors - 2}` : w.authors.join(', ')].filter(Boolean).join(' · ')}</div>
            </span>
            <span className="row" style={{ gap: 8 }}>
              {w.type && !PAPER_TYPES.has(w.type) && <span className="pick-type">{w.type}</span>}
              {w.note && <span className="pick-type" title="How this paper was matched to OpenAlex">{w.note}</span>}
              <span className="muted small mono">{w.cited_by_count != null ? `${w.cited_by_count} cit.` : ''}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * Lookup → the papers found → a pick list → start something with the
 * kept ones. The list is fetched on demand ("Find papers") so a typo
 * does not fire a request per keystroke, and papers start ticked
 * because pruning a few is the common case.
 */
export function LookupPicker({ lookup, start, startLabel = 'Import', job, initialRaw = '', onStarted }: {
  lookup: Lookup;
  /** Starts the job for the kept papers; ``name`` is the researcher's name from the lookup. */
  start: (key: string, ids: string[], name: string | null) => Promise<Job>;
  startLabel?: string;
  /** A job already running from here, to show progress and lock the form. */
  job?: Job | undefined;
  initialRaw?: string;
  onStarted?: (job: Job, listing: { key: string; name: string | null; works: PickWork[] }) => void;
}) {
  const [raw, setRaw] = useState(initialRaw);
  const [listing, setListing] = useState<{ forRaw: string; key: string; name: string | null; works: PickWork[] } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const key = lookup.parse(raw);
  const running = job?.status === 'running';

  const find = useAction(async () => {
    if (!key) return;
    const res = await lookup.find(key);
    setListing({ forRaw: raw.trim(), ...res });
    setPicked(new Set(papersOf(res.works).map((w) => w.id)));
  });
  const go = useAction(async () => {
    if (!listing || picked.size === 0) return;
    const j = await start(listing.key, Array.from(picked), listing.name);
    onStarted?.(j, listing);
  });

  const current = listing && listing.forRaw === raw.trim() ? listing : null;
  return (
    <div className="stack">
      <Field label={lookup.label} hint={lookup.hint} error={raw.trim() && !key ? lookup.parseError : null}>
        <div className="pick-find">
          <Input value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={lookup.placeholder} disabled={running} onKeyDown={(e) => { if (e.key === 'Enter') void find.run(); }} />
          <Button icon="search" onClick={() => find.run()} loading={find.busy} disabled={!key || running}>Find papers</Button>
        </div>
      </Field>
      {find.error && <ErrorBox compact title="Couldn't list papers" message={find.error} onRetry={() => find.run()} />}
      {current && current.works.length === 0 && (
        <EmptyState compact icon="search" title={lookup.emptyTitle} body={lookup.emptyBody} />
      )}
      {current && current.works.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <PaperPickList works={current.works} picked={picked} onChange={setPicked} disabled={running} head={current.name} ariaLabel="Papers to import" />
          {job && running && <JobProgress job={job} />}
          {job?.status === 'error' && <ErrorBox compact title="Import failed" message={job.error} />}
          <div className="row">
            <Button variant="primary" icon="upload" onClick={() => go.run()} loading={go.busy || running} disabled={picked.size === 0}>{startLabel} {plural(picked.size, 'paper')}</Button>
            {go.error && <span className="field-error">{go.error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
