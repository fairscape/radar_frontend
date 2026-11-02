/**
 * Paper pick lists.
 *
 * Two places offer a researcher's papers as checkboxes: the wizard
 * (seeds for a new interest) and the Profiles page (papers to store).
 * ``LookupPicker`` is the "type an id → Find papers → tick → go" flow
 * they share; ``PaperPickList`` is the list itself, also used when the
 * papers are already known (a stored profile).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fetchOrcidWorks, fetchProsopiaWorks } from '../api/endpoints/prosopia';
import { toast } from '../lib/toast';
import { plural } from '../lib/format';
import { TERMS } from '../lib/terms';
import { getUserEmail } from '../lib/userEmail';
import type { Job } from '../lib/jobs';
import type { OrcidWork, ProsopiaWork, SavedProfileRef } from '../types/prosopia';
import { Button, Callout, EmptyState, ErrorBox, Field, Input, useAction, useClearOnChange } from './index';
import { JobProgress } from './domain';
import { paperHref, PaperLink } from './paperLink';
export { paperHref, PaperLink };

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
  /** For the title link: the DOI, else the OpenAlex id when `id` is not one. */
  doi?: string | null;
  openalex?: string | null;
  /** ORCID listings: the author's institutions on this work, and whether none is theirs. */
  institutions?: string[];
  otherInstitution?: boolean;
  /** Already a seed of the interest being added to (FUNCTIONAL_SPEC M.4): shown, never ticked. */
  seeded?: boolean;
}

/**
 * ``works`` with those already among ``seedIds`` marked ``seeded``. Compared
 * by OpenAlex code (ids come as URLs or bare); a Prosopia record OpenAlex
 * has no record of is the seed ``prosopia:<user>:<profile>:<record id>``.
 */
export function markSeeded(works: PickWork[], seedIds: Set<string> | undefined): PickWork[] {
  if (!seedIds || seedIds.size === 0) return works;
  const code = (id: string) => (id.startsWith('prosopia:') ? id.split(':').slice(3).join(':') : id.split('/').pop() ?? id);
  const have = new Set([...seedIds].map(code));
  return works.map((w) => (have.has(code(w.id)) || (w.openalex && have.has(code(w.openalex))) ? { ...w, seeded: true } : w));
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
 * `claimed === false`, not `!claimed`: a single work the record has nothing
 * comparable for (null) stays ticked.
 *
 * `registryRead === false` (an ORCID listing whose ORCID works list could not
 * be read at all): nothing starts ticked, so a namesake's papers OpenAlex
 * merged in are not imported by default; the user chooses (FUNCTIONAL_SPEC
 * O.2 A1). Undefined (a Prosopia listing) is not an ORCID question.
 */
export function defaultPicks(works: PickWork[], registryRead?: boolean): PickWork[] {
  if (registryRead === false) return [];
  return papersOf(works).filter((w) => !w.duplicate_of && w.claimed !== false && !w.seeded);
}

/**
 * Every note a row carries, not just the first.
 *
 * Composed rather than short-circuited: a row can be both loosely matched
 * and unclaimed, and showing only one leaves the count above describing a
 * reason the user cannot find on any row.
 *
 * No `duplicate` chip: a redundant copy is not rendered at all (see
 * PaperPickList), so a chip for it could never appear on screen.
 */
function noteParts(w: PickWork): { chip: string; title: string }[] {
  const out: { chip: string; title: string }[] = [];
  if (w.seeded) {
    out.push({ chip: 'already a seed', title: 'This paper is already one of this interest\u2019s seeds, so it cannot be added again.' });
  }
  if (w.note) {
    out.push({ chip: w.note, title: 'How this paper was matched to OpenAlex' });
  }
  if (w.claimed === false) {
    out.push({
      chip: 'not on ORCID',
      title: "This work is not on the author's own ORCID record. OpenAlex "
        + 'sometimes merges two people with the same name into one author, '
        + 'so it may belong to somebody else — tick it if it is theirs.',
    });
  }
  if (w.otherInstitution) {
    out.push({
      chip: 'other institution',
      title: `On this paper the author is at ${(w.institutions ?? []).join('; ') || 'an institution'}, `
        + 'which is none of the institutions this person has been at. It may be a namesake’s '
        + 'paper; check it. Only a hint: tick it if it is theirs.',
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
  const v = raw.trim().replace(/^(https?:\/\/)?(www\.)?orcid\.org\//i, '').replace(/\/+$/, '').toUpperCase();
  return /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(v) && orcidChecksumOk(v) ? v : null;
}

/** ISO 7064 mod 11-2, the ORCID check digit: a mistyped iD is someone else's, or nobody's. */
export function orcidChecksumOk(orcid: string): boolean {
  const d = orcid.replace(/-/g, '');
  let total = 0;
  for (const ch of d.slice(0, -1)) total = (total + Number(ch)) * 2;
  const r = (12 - (total % 11)) % 11;
  return d.slice(-1) === (r === 10 ? 'X' : String(r));
}

export interface Lookup {
  label: string;
  hint: string;
  placeholder: string;
  /** The key to look up, or null when the text is not usable yet. */
  parse: (raw: string) => string | null;
  parseError: string;
  /** ``truncated``: the source has more works than it listed (the newest are listed).
   *  ``registryRead``: ORCID only, whether the person's ORCID works list could be read. */
  find: (key: string) => Promise<{ key: string; name: string | null; works: PickWork[]; truncated?: boolean; registryRead?: boolean; savedProfile?: SavedProfileRef | null }>;
  emptyTitle: string;
  emptyBody: string;
  /** localStorage key for the last key this browser looked up, if remembered. */
  rememberAs?: string;
}

export const ORCID_LOOKUP: Lookup = {
  label: 'ORCID iD',
  hint: 'BioXplorer lists every paper OpenAlex attributes to this ORCID; untick the ones that should not count.',
  // ORCID's own documented example iD (Josiah Carberry, a fictional
  // researcher). The placeholder used to be Nathan Sheffield's real iD,
  // which read as a pre-filled value: users asked why someone else's ORCID
  // was in the box.
  placeholder: 'e.g. 0000-0002-1825-0097 or https://orcid.org/…',
  // People mostly look up their own iD, again and again.
  rememberAs: 'radar.lastOrcid',
  parse: parseOrcid,
  parseError: 'That is not an ORCID iD (0000-0000-0000-0000, and the last character is a check digit).',
  find: async (orcid) => {
    const r = await fetchOrcidWorks(orcid);
    return { key: r.orcid, name: r.name, works: orcidPickWorks(r.works), truncated: r.truncated, registryRead: !!r.registry_read, savedProfile: r.saved_profile ?? null };
  },
  emptyTitle: 'No papers on OpenAlex for this ORCID',
  emptyBody: 'OpenAlex has no works with this ORCID on an authorship. Check the iD, or upload PDFs instead.',
};

/** Said wherever a works listing was cut at the server's cap. */
export const TRUNCATED_NOTE = (n: number) =>
  `This author has more works on OpenAlex than BioXplorer lists: these are the newest ${n.toLocaleString()}. Older papers can be added as PDFs.`;

/** An ORCID works listing as pick-list rows (also used by "check for new papers"). */
export function orcidPickWorks(works: OrcidWork[]): PickWork[] {
  return works.map((w) => ({ id: w.openalex_id, title: w.title, year: w.year, venue: w.venue, type: w.type, cited_by_count: w.cited_by_count, authors: w.authors, n_authors: w.n_authors, claimed: w.claimed, duplicate_of: w.duplicate_of, doi: w.doi, institutions: w.institutions, otherInstitution: !!w.other_institution }));
}

/** A Prosopia works listing as pick-list rows. */
export function prosopiaPickWorks(works: ProsopiaWork[]): PickWork[] {
  return works.map((w) => ({ id: w.id, title: w.title, year: w.year, venue: w.venue, cited_by_count: w.cited_by_count, authors: w.authors, n_authors: w.n_authors, doi: w.doi, openalex: w.openalex_id }));
}

export const PROSOPIA_LOOKUP: Lookup = {
  label: 'Prosopia profile',
  hint: "The profile's slug or its URL. BioXplorer lists the profile's papers; untick the ones that should not count.",
  placeholder: 'e.g. sheffield-nathan or https://prosopia.databio.org/…',
  parse: (raw) => raw.trim() || null,
  parseError: '',
  find: async (ref) => {
    const r = await fetchProsopiaWorks(ref);
    return { key: r.slug, name: r.name, works: prosopiaPickWorks(r.works), savedProfile: r.saved_profile ?? null };
  },
  emptyTitle: 'This profile lists no papers',
  emptyBody: 'The profile exists but has no papers to import. Upload PDFs instead.',
};

/**
 * A paper title that opens the paper in a new tab. Lists of papers to pick
 * from showed titles only, with no way to read an abstract or the paper
 * before deciding -- the feed was the one place a title was a link.
 */
export function PaperTitle({ title, id, doi }: { title: string; id?: string | null; doi?: string | null }) {
  const href = paperHref(id, doi);
  return (
    <div className="truncate" title={title}>
      {href ? (
        // stopPropagation: these sit inside a <label>; the click opens the
        // paper, it does not tick the row.
        <a className="paper-link" href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{title}</a>
      ) : title}
    </div>
  );
}

export function PaperPickList({ works, picked, onChange, disabled, ariaLabel = 'Papers', head, registryRead, noDefaults = false }: {
  works: PickWork[];
  picked: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
  ariaLabel?: string;
  /** Text before the count, e.g. the researcher's name. */
  head?: string | null;
  /** ORCID listings: whether the person's ORCID works list could be read (see defaultPicks). */
  registryRead?: boolean;
  /** Rows that never start ticked (left out of an earlier import): no Reset to a default. */
  noDefaults?: boolean;
}) {
  // A redundant copy is collapsed out of the main list rather than shown
  // in it unticked. Shown-but-unticked was the original design, on the
  // grounds that the rule is a heuristic and hiding a row the user might
  // want is worse than showing one they do not. In use it read as a broken
  // list: the same title appearing twice is what the eye catches, and a
  // chip explaining it does not undo that.
  //
  // Collapsed, not dropped, because the heuristic is title-only: two
  // genuinely different papers sharing a title would collapse into one,
  // and a paper that silently disappears is unrecoverable. The disclosure
  // below is the way back, and rows inside it tick like any other.
  const shown = works.filter((w) => !w.duplicate_of);
  const hidden = works.filter((w) => w.duplicate_of);
  const [showHidden, setShowHidden] = useState(false);
  const nHiddenTicked = hidden.filter((w) => picked.has(w.id)).length;
  // Each reason gets its own sentence. One combined "N start unticked"
  // leaves the user guessing which rows and why, and the two causes call
  // for different judgements: a dataset is probably right to leave out, an
  // unclaimed work needs their eye. Counted over the rows on screen, so
  // the totals can never exceed what is actually listed there.
  const nonPapers = shown.length - papersOf(shown).length;
  const nUnclaimed = papersOf(shown).filter((w) => w.claimed === false).length;
  const claimedIds = shown.filter((w) => w.claimed === true).map((w) => w.id);
  const otherInst = works.filter((w) => w.otherInstitution).map((w) => w.id);
  const nOtherTicked = otherInst.filter((id) => picked.has(id)).length;
  const defaults = noDefaults ? [] : defaultPicks(works, registryRead);
  function toggle(id: string) {
    const n = new Set(picked);
    if (n.has(id)) n.delete(id); else n.add(id);
    onChange(n);
  }
  function row(w: PickWork) {
    return (
      <label className={`pick-row ${picked.has(w.id) && !w.seeded ? 'on' : ''}`} key={w.id}>
        <input type="checkbox" checked={picked.has(w.id) && !w.seeded} disabled={disabled || w.seeded} onChange={() => toggle(w.id)} />
        <span>
          <PaperTitle title={w.title} id={w.openalex ?? w.id} doi={w.doi} />
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
    );
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="pick-head">
        <span className="field-label">{head ? `${head} · ` : ''}{works.filter((w) => picked.has(w.id) && !w.seeded).length} of {plural(works.length, 'paper')} selected</span>
        <span className="row" style={{ gap: 6 }}>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(new Set([
            ...shown.filter((w) => !w.seeded).map((w) => w.id),
            // Not just `shown`: a hidden copy the user went and ticked on
            // purpose is a deliberate choice, and "All" must not be the
            // button that quietly takes it away.
            ...hidden.filter((w) => picked.has(w.id)).map((w) => w.id),
          ]))}>All</Button>
          {registryRead === true && claimedIds.length > 0 && (
            // O.2 A2: back to exactly the works the person lists on ORCID.
            <Button size="sm" variant="ghost" disabled={disabled} title="Tick only the works on this person's own ORCID record"
              onClick={() => onChange(new Set(claimedIds))}>Tick the works on their ORCID record</Button>
          )}
          {nOtherTicked > 0 && (
            // O.2 A3: the institution check only hints; this is the user's call.
            <Button size="sm" variant="ghost" disabled={disabled} title="Untick the papers marked “other institution”"
              onClick={() => onChange(new Set([...picked].filter((id) => !otherInst.includes(id))))}>Untick other institutions</Button>
          )}
          {!noDefaults && defaults.length !== works.length && (
            // Shown whenever the default leaves anything out -- a
            // dataset, an unclaimed work, a collapsed copy -- not only for
            // software/dataset rows: with every row unclaimed and no
            // datasets there was no way back to the default after All.
            // Gated on what the default excludes rather than on the current
            // selection, so unticking one row and ticking another (equal
            // size, different set) does not make the way back vanish.
            <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(new Set(defaults.map((w) => w.id)))}>Reset</Button>
          )}
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(new Set())}>None</Button>
        </span>
      </div>
      {registryRead === false && !noDefaults && (
        <Callout tone="warn">
          This person&rsquo;s works list on ORCID could not be read (it is private, empty, or ORCID did not answer),
          so nothing says which of these are theirs. None are ticked: choose the papers yourself.
        </Callout>
      )}
      {otherInst.length > 0 && (
        <p className="small muted" style={{ margin: 0 }}>
          {plural(otherInst.length, 'paper')} {otherInst.length === 1 ? 'is' : 'are'} marked <i>other institution</i>: on {otherInst.length === 1 ? 'it' : 'them'} the
          author is at none of the institutions this person has been at, so {otherInst.length === 1 ? 'it' : 'they'} may be a namesake&rsquo;s. Only a hint; what you tick is imported.
        </p>
      )}
      {(nonPapers > 0 || nUnclaimed > 0) && (
        <p className="small muted" style={{ margin: 0 }}>
          {[
            nonPapers > 0 ? `${plural(nonPapers, 'software or dataset record')}` : null,
            nUnclaimed > 0 ? `${plural(nUnclaimed, 'work')} not on the author’s ORCID record` : null,
          ].filter(Boolean).join('; ')}
          {' — these start unticked, but are listed; tick any that should count.'}
        </p>
      )}
      {hidden.length > 0 && (
        // Stated rather than left silent: these rows are the one thing the
        // main list does not show, and a count that does not add up is its
        // own bug report.
        <p className="small muted" style={{ margin: 0 }}>
          {plural(hidden.length, 'further copy', 'further copies')} of {hidden.length === 1 ? 'a paper' : 'papers'}
          {' already listed '}{hidden.length === 1 ? 'is' : 'are'} not shown: versions of one work
          (a preprint and its published version, two releases of one dataset) are one paper,
          and seeding both would count it twice.
          {nHiddenTicked > 0 && ` ${nHiddenTicked} of them ${nHiddenTicked === 1 ? 'is' : 'are'} ticked.`}
          {' '}
          <button type="button" className="linklike" onClick={() => setShowHidden((v) => !v)}>
            {showHidden ? 'Hide them' : `Show ${hidden.length === 1 ? 'it' : 'them'}`}
          </button>
        </p>
      )}
      {nUnclaimed > 0 && (
        <p className="small muted" style={{ margin: 0 }}>
          An ORCID record is often incomplete, so “not on ORCID” is a hint
          rather than a verdict.
        </p>
      )}
      <div className="pick-list" role="group" aria-label={ariaLabel}>
        {shown.map(row)}
      </div>
      {showHidden && hidden.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          {/* The toggle above sits before the whole main list; after
              scrolling down to these rows it was out of sight, and the
              copies could not be folded away again. */}
          <div className="row spread" style={{ alignItems: 'baseline' }}>
            <span className="field-label">
              {hidden.length === 1
                ? 'A second copy of a paper already above'
                : `${hidden.length} further copies of papers already above`}
            </span>
            <button type="button" className="linklike small" onClick={() => setShowHidden(false)}>
              {hidden.length === 1 ? 'Hide this copy' : 'Hide these copies'}
            </button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Matched by title — and a short title only together with the
            same year and authors, and only for datasets, software and
            preprints. If one of these is a different work after all, tick
            it: it will be imported like any other.
          </p>
          <div className="pick-list" role="group" aria-label="Duplicate copies, collapsed by default">
            {hidden.map(row)}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Lookup → the papers found → a pick list → start something with the
 * kept ones. The list is fetched on demand ("Find papers") so a typo
 * does not fire a request per keystroke, and papers start ticked
 * because pruning a few is the common case.
 */
/**
 * Per-browser, per-person convenience only. Keyed by the signed-in address:
 * localStorage outlives a session, and keyed by browser alone the next
 * person to sign in here would find the previous one's ORCID in the box --
 * the same leak the identity fix closed. Storage may be unavailable; then
 * nothing is remembered, which is fine.
 */
function storageKey(key: string | undefined): string | null {
  const who = getUserEmail();
  return key && who ? `${key}:${who.toLowerCase()}` : null;
}

function recall(key: string | undefined): string {
  const k = storageKey(key);
  if (!k) return '';
  try {
    return window.localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
}

function remember(key: string | undefined, value: string): void {
  const k = storageKey(key);
  if (!k || !value) return;
  try {
    window.localStorage.setItem(k, value);
  } catch {
    /* private window, blocked storage: just don't remember */
  }
}

export function LookupPicker({ lookup, start, startLabel = 'Import', job, initialRaw = '', onStarted, onLookupChange, footer, seedIds }: {
  lookup: Lookup;
  /** Starts the job for the kept papers; ``name`` is the researcher's name from the lookup. Null: the caller handled why nothing started. */
  start: (key: string, ids: string[], name: string | null) => Promise<Job | null>;
  startLabel?: string;
  /** A job already running from here, to show progress and lock the form. */
  job?: Job | undefined;
  initialRaw?: string;
  onStarted?: (job: Job, listing: { key: string; name: string | null; works: PickWork[] }) => void;
  /** The ORCID iD / profile being looked up changed: what the caller said
   *  about the previous one (e.g. "already one of your profiles") is stale. */
  onLookupChange?: () => void;
  /** Shown under the pick list, above the import button (the wizard's "Also save as a researcher profile");
   *  a function gets the researcher profile the user already has for this person. */
  footer?: ReactNode | ((listing: { savedProfile: SavedProfileRef | null }) => ReactNode);
  /** "Add more seeds": the interest's seeds, listed as "already a seed" and never ticked (FUNCTIONAL_SPEC M.4). */
  seedIds?: Set<string>;
}) {
  const [raw, setRaw] = useState(() => initialRaw || recall(lookup.rememberAs));
  const lookupChanged = useRef(onLookupChange);
  lookupChanged.current = onLookupChange;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    lookupChanged.current?.();
  }, [raw]);
  const [listing, setListing] = useState<{ forRaw: string; key: string; name: string | null; works: PickWork[]; truncated?: boolean; registryRead?: boolean; savedProfile?: SavedProfileRef | null } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const key = lookup.parse(raw);
  const running = job?.status === 'running';

  const find = useAction(async () => {
    if (!key) return;
    const res = await lookup.find(key);
    remember(lookup.rememberAs, raw.trim());
    setListing({ forRaw: raw.trim(), ...res });
    setPicked(new Set(defaultPicks(markSeeded(res.works, seedIds), res.registryRead).map((w) => w.id)));
  });
  useClearOnChange(find, [raw]);
  const go = useAction(async () => {
    if (!listing || picked.size === 0) return;
    // Intersected with the listing, not filtered by duplicate_of: a
    // collapsed copy the user expanded and ticked on purpose has to be
    // importable, or the disclosure that offers it is a lie. What this
    // still refuses is an id that is not in the listing at all, which is
    // what a stale selection would produce.
    const inListing = new Set(markSeeded(listing.works, seedIds).filter((w) => !w.seeded).map((w) => w.id));
    const ids = Array.from(picked).filter((id) => inListing.has(id));
    if (ids.length === 0) return;
    const j = await start(listing.key, ids, listing.name);
    if (!j) return;
    if (j.joinedExisting) {
      // The server answered with a run that was already going, so this
      // selection was not applied. Saying "imported" here would be a lie
      // the progress bar then appears to confirm.
      toast.info('An import of this person was already running — showing that one. Your selection was not applied.');
    }
    onStarted?.(j, listing);
  });
  useClearOnChange(go, [picked]);

  const listed = listing && listing.forRaw === raw.trim() ? listing : null;
  const current = listed ? { ...listed, works: markSeeded(listed.works, seedIds) } : null;
  const nPicked = current ? current.works.filter((w) => picked.has(w.id) && !w.seeded).length : 0;
  return (
    <div className="stack">
      <Field label={lookup.label} hint={lookup.hint} error={raw.trim() && !key ? lookup.parseError : null}>
        <div className="pick-find">
          {/* autoComplete off and a non-identity name: a lone text box on a
              signed-in page is what browsers fill with the user's email,
              and that is what people found in the ORCID box. */}
          <Input value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={lookup.placeholder} disabled={running} onKeyDown={(e) => { if (e.key === 'Enter' && !find.busy) void find.run(); }}
            name={lookup.rememberAs ?? 'lookup'} autoComplete="off" spellCheck={false} data-1p-ignore data-lpignore="true" />
          <Button icon="search" onClick={() => find.run()} loading={find.busy} disabled={!key || running}>Find papers</Button>
        </div>
      </Field>
      {find.error && <ErrorBox compact title="Couldn't list papers" message={find.error} onRetry={() => find.run()} />}
      {current && current.works.length === 0 && (
        <EmptyState compact icon="search" title={lookup.emptyTitle} body={lookup.emptyBody} />
      )}
      {current && current.works.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          {current.truncated && <Callout tone="info">{TRUNCATED_NOTE(current.works.length)}</Callout>}
          <PaperPickList works={current.works} picked={picked} onChange={setPicked} disabled={running} head={current.name} ariaLabel="Papers to import" registryRead={current.registryRead} />
          {job && running && <JobProgress job={job} />}
          {job?.status === 'error' && <ErrorBox compact title="Import failed" message={job.error} />}
          {typeof footer === 'function' ? footer({ savedProfile: current.savedProfile ?? null }) : footer}
          <div className="row">
            <Button variant="primary" icon="upload" onClick={() => go.run()} loading={go.busy || running} disabled={nPicked === 0}>{startLabel} {plural(nPicked, 'paper')}</Button>
            {go.error && <span className="field-error">{go.error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * "Also save as a researcher profile" under a wizard import's pick list
 * (FUNCTIONAL_SPEC M.2). Off by default: the papers are only the draft's
 * seeds and go with it. On: a researcher profile is saved at once, under
 * Profiles, and keeps its papers whatever becomes of the draft. When the
 * user has one for this person already (``saved``), on adds the papers it
 * lacks to that one instead (M.2a).
 */
export function SaveProfileCheck({ checked, onChange, disabled, saved }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; saved?: SavedProfileRef | null }) {
  return (
    <label className="row small" style={{ gap: 6, cursor: disabled ? undefined : 'pointer' }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{saved ? <>Also add to {saved.name}&rsquo;s researcher {TERMS.profile}</> : <>Also save as a researcher {TERMS.profile}</>}</span>
      <span className="muted">· {!checked
        ? 'off: these papers belong to this draft only'
        : saved
          ? `the papers it lacks are added now, and kept even if this draft is discarded`
          : `saved under ${TERMS.Profiles} now, and kept even if this draft is discarded`}</span>
    </label>
  );
}
