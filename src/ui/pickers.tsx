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
import { toast } from '../lib/toast';
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
  /** See OrcidWork.claimed. Tri-state; `null` is "unknown", not "no". */
  claimed?: boolean | null;
  /** See OrcidWork.duplicate_of. Set on the redundant copy only. */
  duplicate_of?: string | null;
}

/** OpenAlex work types that read as papers; software and dataset records start unticked. */
export const PAPER_TYPES = new Set(['article', 'preprint', 'review', 'book-chapter', 'book', 'conference-paper', 'dissertation', 'letter', 'report', 'editorial', 'erratum', 'reference-entry', 'paratext', 'other']);
export function papersOf(works: PickWork[]): PickWork[] {
  return works.filter((w) => !w.type || PAPER_TYPES.has(w.type));
}

/**
 * What starts ticked.
 *
 * Three reasons to leave a row alone, none of which hides it:
 *  - it is not a paper (software, a dataset deposit)
 *  - it is a redundant copy of another row in this list -- ticking both a
 *    preprint and its published version counts one paper twice in the
 *    centroid the selector fits
 *  - the author's own ORCID record does not list it, which is how a work
 *    OpenAlex attached to an over-merged author entity shows up
 *
 * `claimed === false`, not `!claimed`: null means the registry could not be
 * read, and unticking on "we never asked" would leave nothing selected for
 * anyone whose record is private or uncurated.
 */
export function defaultPicks(works: PickWork[]): PickWork[] {
  return papersOf(works).filter((w) => !w.duplicate_of && w.claimed !== false);
}

/**
 * Every note a row carries, not just the first.
 *
 * Composed rather than short-circuited: a row can be both loosely matched
 * and a duplicate, and showing only one leaves the count above describing
 * a reason the user cannot find on any row.
 */
function noteParts(w: PickWork): { chip: string; title: string }[] {
  const out: { chip: string; title: string }[] = [];
  if (w.note) {
    out.push({ chip: w.note, title: 'How this paper was matched to OpenAlex' });
  }
  if (w.duplicate_of) {
    out.push({
      chip: 'duplicate',
      title: 'Another row in this list is the same paper (a preprint and its '
        + 'published version). Ticking both would count it twice.',
    });
  }
  if (w.claimed === false) {
    out.push({
      chip: 'not on ORCID',
      title: "This work is not on the author's own ORCID record. OpenAlex "
        + 'sometimes merges two people with the same name into one author, '
        + 'so it may belong to somebody else — tick it if it is theirs.',
    });
  }
  return out;
}

/** Why a row starts unticked, for the note at the right. Null when it does not. */
export function pickNote(w: PickWork): string | null {
  const p = noteParts(w);
  return p.length ? p.map((x) => x.chip).join(' · ') : null;
}

/** What the note means, spelled out on hover. */
export function noteTitle(w: PickWork): string {
  return noteParts(w).map((x) => x.title).join('\n\n');
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
    return { key: r.orcid, name: r.name, works: r.works.map((w) => ({ id: w.openalex_id, title: w.title, year: w.year, venue: w.venue, type: w.type, cited_by_count: w.cited_by_count, authors: w.authors, n_authors: w.n_authors, claimed: w.claimed, duplicate_of: w.duplicate_of })) };
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
  // Each reason gets its own sentence. One combined "N start unticked"
  // leaves the user guessing which rows and why, and the three causes call
  // for different judgements: a dataset is probably right to leave out, a
  // duplicate definitely is, and an unclaimed work needs their eye.
  // Counted over papersOf, not over works: a dataset row is already
  // excluded by type, and counting it again under "duplicate" or "not on
  // ORCID" would describe two rows where there is one -- and the totals
  // could exceed the number actually unticked.
  const papers = papersOf(works);
  const nDup = papers.filter((w) => w.duplicate_of).length;
  const nUnclaimed = papers.filter((w) => !w.duplicate_of && w.claimed === false).length;
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
          {defaultPicks(works).length !== works.length && (
            // Shown whenever anything starts unticked, not only for
            // software/dataset rows: with three duplicate copies and no
            // datasets there was no way back to the default after All.
            <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(new Set(defaultPicks(works).map((w) => w.id)))}>Reset</Button>
          )}
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(new Set())}>None</Button>
        </span>
      </div>
      {(nonPapers > 0 || nDup > 0 || nUnclaimed > 0) && (
        <p className="small muted" style={{ margin: 0 }}>
          {[
            nonPapers > 0 ? `${plural(nonPapers, 'software or dataset record')}` : null,
            nDup > 0 ? `${plural(nDup, 'duplicate copy', 'duplicate copies')} of a paper already listed` : null,
            nUnclaimed > 0 ? `${plural(nUnclaimed, 'work')} not on the author’s ORCID record` : null,
          ].filter(Boolean).join('; ')}
          {' — these start unticked. Nothing is hidden; tick any that should count.'}
        </p>
      )}
      {nUnclaimed > 0 && (
        <p className="small muted" style={{ margin: 0 }}>
          An ORCID record is often incomplete, so “not on ORCID” is a hint
          rather than a verdict.
        </p>
      )}
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
              {pickNote(w) && (
                <span className="pick-type" title={noteTitle(w)}>{pickNote(w)}</span>
              )}
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
    setPicked(new Set(defaultPicks(res.works).map((w) => w.id)));
  });
  const go = useAction(async () => {
    if (!listing || picked.size === 0) return;
    const j = await start(listing.key, Array.from(picked), listing.name);
    if (j.joinedExisting) {
      // The server answered with a run that was already going, so this
      // selection was not applied. Saying "imported" here would be a lie
      // the progress bar then appears to confirm.
      toast.info('An import of this person was already running — showing that one. Your selection was not applied.');
    }
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
