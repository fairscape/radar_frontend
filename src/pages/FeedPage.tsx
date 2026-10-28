import { useEffect, useMemo, useRef, useState } from 'react';
import { useDailyRadar, useProfiles } from '../api/hooks';
import { dismissCard, saveCard } from '../api/endpoints/radar';
import { addSeeds } from '../api/endpoints/profiles';
import { daysLabel, errorMessage, fmtRelative, fmtScore, fmtSigned, plural } from '../lib/format';
import { invalidate, invalidateUnshown } from '../lib/query';
import { SCAN_PER_TOPIC, startScan, useJobs } from '../lib/jobs';
import { navigate, paths, useSearchParam } from '../lib/router';
import { TERMS } from '../lib/terms';
import { toast } from '../lib/toast';
import type { Bucket, Card, CardState, Profile } from '../types/radar';
import { Badge, Button, Callout, EmptyState, ErrorBox, Field, Icon, Kbd, LoadingRows, NumberInput, Segmented, Select } from '../ui';
import { Link } from '../ui/Link';
import { BucketBadge, InterestName, ScoreValue } from '../ui/domain';
import { AddInterestCards } from './HomePage';

type BucketFilter = 'all' | Bucket;

const THIS_YEAR = new Date().getFullYear();
const PUBLISHED_SINCE = [
  { label: 'This year', year: THIS_YEAR },
  { label: 'Last 3 years', year: THIS_YEAR - 2 },
  { label: 'Last 5 years', year: THIS_YEAR - 4 },
  { label: 'Last 10 years', year: THIS_YEAR - 9 },
];

export function FeedPage() {
  // The filters live in the URL: kept in state, a reload or Back from a
  // paper's interest reset them to All (round 19).
  const [interestParam, setInterestParam] = useSearchParam('interest');
  const [bucketParam, setBucketParam] = useSearchParam('bucket');
  const [sinceParam, setSinceParam] = useSearchParam('since');
  const profFilter = interestParam ?? 'all';
  const bucket: BucketFilter = bucketParam === 'high' || bucketParam === 'medium' || bucketParam === 'low' ? bucketParam : 'all';
  // "Published since" (a year), on top of each interest's own years.
  const yearFrom = Number(sinceParam) || null;
  const setProfFilter = (v: string) => setInterestParam(v === 'all' ? null : v);
  const setBucket = (v: BucketFilter) => setBucketParam(v === 'all' ? null : v);
  const setYearFrom = (v: number | null) => setSinceParam(v == null ? null : String(v));
  const [showTriaged, setShowTriaged] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, CardState>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [seeding, setSeeding] = useState<Set<string>>(new Set());
  const [scanOpen, setScanOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);


  const { data: profiles, loading: profilesLoading, fetching: profilesFetching, error: profilesError, refresh: refreshProfiles } = useProfiles();
  const live = useMemo(() => (profiles ?? []).filter((p) => !p.isDraft), [profiles]);
  const drafts = useMemo(() => (profiles ?? []).filter((p) => p.isDraft), [profiles]);
  const byKey = useMemo(() => Object.fromEntries((profiles ?? []).map((p) => [p.key, p])), [profiles]);
  // A link to an interest that has since been deleted (or never existed),
  // or to a draft: the feed read "for <slug>" over an empty list, the
  // selector (live interests only) showed something else, and "Start scan"
  // did nothing. A draft gets one refetch first -- right after a commit the
  // cached list can still call the new interest a draft.
  const draftRechecked = useRef<string | null>(null);
  useEffect(() => {
    if (!profiles || profilesFetching || profFilter === 'all' || live.some((p) => p.key === profFilter)) return;
    if (byKey[profFilter]?.isDraft && draftRechecked.current !== profFilter) {
      draftRechecked.current = profFilter;
      refreshProfiles();
      return;
    }
    toast.info(byKey[profFilter]?.isDraft
      ? `"${byKey[profFilter].name}" is still a draft; showing all ${TERMS.interests}.`
      : `No ${TERMS.interest} called "${profFilter}"; showing all ${TERMS.interests}.`);
    setProfFilter('all');
  }, [profiles, profilesFetching, live, byKey, profFilter, refreshProfiles]);
  const { data, loading, error, refresh, fetching } = useDailyRadar({
    profile: profFilter,
    bucket: bucket === 'all' ? undefined : bucket,
    yearFrom,
  });
  const jobs = useJobs();
  const scanning = jobs.filter((j) => j.kind === 'scan' && j.status === 'running');

  // One card per paper. /daily returns a card per (interest, paper) pair,
  // but everything else addresses a card by the paper alone: its id is the
  // OpenAlex id, save/dismiss resolve that id to a single interest on the
  // server, and `states` is keyed by it. So in "All interests" a paper two
  // interests both gathered appeared twice under one id -- 17 of 166 cards
  // on 2026-09-29 -- and saving either copy marked both, j/k focus could
  // only ever reach the first, and React saw a duplicate key.
  // The copy kept is the one the user has already saved or dismissed, if
  // any -- so what they did shows here, and acting again lands on the same
  // interest -- and otherwise the one from the interest it fits best
  // (highest similarity, then rank). The others are named on the card.
  // Server order is preserved. A single interest's view has no repeats,
  // so this only ever changes "All interests".
  const { cards, alsoIn } = useMemo(() => {
    const all = data?.cards ?? [];
    const fit = (c: Card) => [c.state ? 1 : 0, c.similarity ?? c.centroidCos ?? -Infinity, c.score] as const;
    const better = (a: readonly number[], b: readonly number[]) => {
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
      return false;
    };
    const best = new Map<string, Card>();
    for (const c of all) {
      const prev = best.get(c.id);
      if (!prev) { best.set(c.id, c); continue; }
      if (better(fit(c), fit(prev))) best.set(c.id, c);
    }
    const others = new Map<string, string[]>();
    for (const c of all) {
      if (best.get(c.id) !== c) others.set(c.id, [...(others.get(c.id) ?? []), c.profile]);
    }
    return { cards: all.filter((c) => best.get(c.id) === c), alsoIn: others };
  }, [data]);
  // A card is a paper in an interest, so local overrides and busy flags are
  // keyed by both: keyed by paper alone, saving a paper under one interest
  // marked its copy under another when the view switched. The server's
  // per-card `state` replaces `states[id]`, which held whichever interest
  // was iterated last; `states` is only the fallback for an older backend.
  const keyOf = (c: Card) => `${c.profile}\u0000${c.id}`;
  const stateOf = (c: Card): CardState => {
    const k = keyOf(c);
    if (k in overrides) return overrides[k];
    return c.state !== undefined ? c.state ?? null : data?.states[c.id] ?? null;
  };
  const visible = showTriaged ? cards : cards.filter((c) => stateOf(c) === null);
  const triagedCount = cards.length - cards.filter((c) => stateOf(c) === null).length;
  // The papers left to review, with this page's own Save/Dismiss counted:
  // the cap notice read the server's list and stayed at 200 beside "198".
  const toReview = visible.length - (showTriaged ? triagedCount : 0);
  // Counted over what the list shows: with triaged cards hidden, "All 57"
  // sat beside "12 papers to review".
  // Counted from the cards listed: with papers past the cap not listed, a
  // bucket can hold more than its count ("160" listed 190 once picked).
  const countLabel = (n: number, b?: 'high' | 'medium') => {
    const byBucket = data?.untriagedNotShownByBucket;
    const capped = b && byBucket ? !!byBucket[b] : !!data?.untriagedNotShown;
    return capped ? `${n}+` : n;
  };
  const bucketCounts = {
    all: visible.length,
    high: visible.filter((c) => c.bucket === 'high').length,
    medium: visible.filter((c) => c.bucket === 'medium').length,
  };

  // A paper from the feed becomes a seed of the interest it was shown
  // under. The server embeds it (feed papers are scored without their
  // vectors being kept) and re-fits the interest, so the next scan scores
  // against it. This is the "adjust the seed corpus from the article list"
  // that was missing: before, seeds could only come from uploads and
  // imports.
  async function seed(card: Card) {
    const k = keyOf(card);
    if (seeding.has(k)) return;
    setSeeding((s) => new Set(s).add(k));
    const name = byKey[card.profile]?.name ?? card.profile;
    try {
      const res = await addSeeds(card.profile, [card.id], { source: 'feed' });
      if (res.attached > 0) toast.success(`Added to the seeds of ${name}.${res.rescored ? ` Re-scored the ${plural(res.rescored, 'paper')} it had found; the feed is updated.` : ''}`, { label: 'View seeds', onClick: () => navigate(paths.interest(card.profile, 'seeds')) });
      else if (res.rejected.length > 0) toast.error(`Couldn't add "${card.title.slice(0, 60)}" as a seed.`);
      else toast.info(`Already a seed of ${name}.`);
    } catch (e) {
      toast.error(`Couldn't add "${card.title.slice(0, 60)}" as a seed: ${errorMessage(e)}`);
    } finally {
      setSeeding((s) => {
        const n = new Set(s);
        n.delete(k);
        return n;
      });
    }
  }

  // Saves and dismisses live in ``overrides`` while the page is up; the
  // cached feed still holds the old states. Refetch it when leaving, or
  // coming back within the cache's lifetime showed the old state -- and
  // the next click, a toggle, undid the save. Not on each click: a refetch
  // here would pull triaged cards out from under the reader.
  const triaged = useRef(false);
  useEffect(() => () => { if (triaged.current) invalidate('radar'); }, []);

  // A ref, not the ``busy`` state: two clicks in one frame both saw the
  // state before either set it.
  const inFlight = useRef(new Set<string>());
  // A fresh read of the feed (focus, another tab's triage) is newer than
  // what this tab did: its overrides held "Saved" over a dismiss made in
  // another tab for good, and the undo then sent the wrong toggle.
  useEffect(() => {
    setOverrides((o) => {
      const kept = Object.fromEntries(Object.entries(o).filter(([k]) => inFlight.current.has(k)));
      return Object.keys(kept).length === Object.keys(o).length ? o : kept;
    });
  }, [data]);
  async function act(card: Card, target: 'saved' | 'dismissed') {
    const k = keyOf(card);
    if (inFlight.current.has(k)) return;
    inFlight.current.add(k);
    const prev = stateOf(card);
    const next: CardState = prev === target ? null : target;
    // The card is about to leave the list (saved and dismissed are hidden):
    // hand the keyboard focus on to the one that takes its place, or j/k/s/x
    // lost their card and j jumped back to the top.
    if (!showTriaged && next !== null && focused === card.id) {
      const i = visible.findIndex((c) => c.id === card.id);
      const after = visible[i + 1] ?? visible[i - 1];
      setFocused(after ? after.id : null);
      if (after) {
        requestAnimationFrame(() => listRef.current
          ?.querySelector<HTMLElement>(`[data-card="${CSS.escape(after.id)}"]`)
          ?.focus({ preventScroll: true }));
      }
    }
    setOverrides((o) => ({ ...o, [k]: next }));
    setBusy((b) => new Set(b).add(k));
    try {
      const on = next === target;
      const res = await (target === 'saved' ? saveCard(card.id, card.profile, on) : dismissCard(card.id, card.profile, on));
      setOverrides((o) => ({ ...o, [k]: res.state }));
      triaged.current = true;
      // 'vault' too: a saved paper is listed in the Vault under its interest.
      invalidate('profiles', 'vault');
      // The feed's other views (one interest, another bucket) still held the
      // card's old state, and the switch to one showed it unsaved again.
      invalidateUnshown('radar');
    } catch (e) {
      setOverrides((o) => ({ ...o, [k]: prev }));
      toast.error(`Couldn't ${target === 'saved' ? 'save' : 'dismiss'} "${card.title.slice(0, 60)}": ${errorMessage(e)}`);
    } finally {
      inFlight.current.delete(k);
      setBusy((b) => {
        const n = new Set(b);
        n.delete(k);
        return n;
      });
    }
  }

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  // Keyboard triage: only when focus is on the list, never in inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Enter / Space on a button or link inside a card is that control's
      // own activation (Save, Dismiss, the title link); only on the card
      // itself do they expand it.
      if ((e.key === 'Enter' || e.key === ' ') && t && !t.hasAttribute('data-card')
        && t.closest('a, button, [role="button"], [role="radio"], [role="tab"], summary')) return;
      if (visible.length === 0) return;
      const idx = focused ? visible.findIndex((c) => c.id === focused) : -1;
      const focusCard = (i: number) => {
        const c = visible[Math.max(0, Math.min(visible.length - 1, i))];
        if (!c) return;
        setFocused(c.id);
        const el = listRef.current?.querySelector<HTMLElement>(`[data-card="${CSS.escape(c.id)}"]`);
        el?.focus({ preventScroll: true });
        el?.scrollIntoView({ block: 'nearest' });
      };
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); focusCard(idx + 1); return; }
      if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); focusCard(idx - 1); return; }
      // Acting keys need focus still in the list: after a click on Refresh
      // or a filter, `s` saved whichever card was focused last, off screen.
      if (idx < 0 || !t || !listRef.current?.contains(t)) return;
      const card = visible[idx];
      if (e.key === 's') { e.preventDefault(); void act(card, 'saved'); }
      else if (e.key === 'x') { e.preventDefault(); void act(card, 'dismissed'); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(card.id); }
      else if (e.key === 'o') { e.preventDefault(); window.open(card.doi ? `https://doi.org/${card.doi}` : card.openalex, '_blank', 'noopener'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const selectedName = profFilter === 'all' ? `all ${TERMS.interests}` : byKey[profFilter]?.name ?? profFilter;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">{TERMS.feed}</h1>
          <p className="page-sub">
            Every paper BioXplorer has gathered for {selectedName}, highest-ranked first (the rank blends similarity to your seeds with the reranker, so the similarity shown on each card is not strictly in order). Save what is useful and dismiss the rest; once you have triaged 30, the Threshold tab suggests a threshold from them.
            {data?.fetchedAt ? <> Last scan finished {fmtRelative(data.fetchedAt)}.</> : null}
          </p>
        </div>
        <div className="page-actions">
          <Button icon="refresh" onClick={() => refresh()} loading={fetching && !loading} title="Reload the feed">Refresh</Button>
          <Button variant="primary" icon="play" onClick={() => setScanOpen((o) => !o)} disabled={live.length === 0} title={live.length === 0 ? `Create an ${TERMS.interest} first` : 'Look for new papers now'}>
            Scan now
          </Button>
        </div>
      </header>

      {scanOpen && live.length > 0 && (
        <ScanPanel profiles={live} defaultKey={profFilter !== 'all' ? profFilter : live[0].key} onClose={() => setScanOpen(false)} />
      )}

      {profilesError && !profiles && <ErrorBox message={errorMessage(profilesError)} onRetry={refreshProfiles} />}

      {profiles && profiles.length === 0 && <Onboarding />}

      {profiles && profiles.length > 0 && live.length === 0 && (
        <Callout tone="info" title={`Finish setting up your ${TERMS.interest}`}>
          {drafts.map((d) => (
            <div key={d.key}>
              <Link href={paths.wizard(d.key)}>{d.name}</Link> is still a draft. Complete it to start scanning.
            </div>
          ))}
        </Callout>
      )}

      {live.length > 0 && (
        <>
          <div className="feed-toolbar">
            <Select className="compact" value={profFilter} onChange={(e) => setProfFilter(e.target.value)} aria-label={`Filter by ${TERMS.interest}`}>
              <option value="all">All {TERMS.interests}</option>
              {live.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </Select>
            <Segmented<BucketFilter>
              ariaLabel="Score bucket"
              value={bucket}
              onChange={setBucket}
              options={[
                { value: 'all', label: 'All', count: bucket === 'all' ? countLabel(bucketCounts.all) : null },
                { value: 'high', label: 'Like your seeds', count: bucket === 'all' ? countLabel(bucketCounts.high, 'high') : null },
                { value: 'medium', label: 'Above the bar', count: bucket === 'all' ? countLabel(bucketCounts.medium, 'medium') : null },
                // Not counted: "All" holds only papers above the threshold,
                // and this filter asks the server for the ones below it.
                { value: 'low', label: 'Below the bar', count: null },
              ]}
            />
            <Select className="compact" value={yearFrom ?? ''} onChange={(e) => setYearFrom(e.target.value ? Number(e.target.value) : null)} aria-label="Published since">
              <option value="">Published: any year</option>
              {PUBLISHED_SINCE.map((o) => <option key={o.label} value={o.year}>{o.label}</option>)}
            </Select>
            <label className="row small muted" style={{ gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={showTriaged} onChange={(e) => setShowTriaged(e.target.checked)} />
              Show saved and dismissed{triagedCount > 0 ? ` (${triagedCount})` : ''}
            </label>
            <span className="spacer" />
            <span className="feed-summary">
              {plural(toReview, 'paper')} to review
              {data?.candidatesScored ? ` · ${data.candidatesScored.toLocaleString()} scored in the last scan` : ''}
            </span>
          </div>

          {!!data?.untriagedNotShown && (
            <Callout tone="info">
              {profFilter === 'all'
                ? <>Showing each {TERMS.interest}'s top papers; at least {plural(data.untriagedNotShown, 'more paper')} to review {data.untriagedNotShown === 1 ? 'is' : 'are'} not listed. Pick one {TERMS.interest} above to see more of its papers.</>
                : <>Showing the top {plural(toReview, 'paper')}; at least {plural(data.untriagedNotShown, 'more paper')} to review {data.untriagedNotShown === 1 ? 'is' : 'are'} not listed. Save or dismiss papers here and they come up next.</>}
            </Callout>
          )}

          {scanning.length > 0 && data && visible.length === 0 && !loading && (
            <Callout tone="info" title="A scan is running">New papers appear here when it finishes.</Callout>
          )}

          {error && !data && <ErrorBox message={errorMessage(error)} onRetry={() => refresh()} />}
          {loading && !data && <LoadingRows rows={4} label="Loading the feed" />}

          {data && visible.length === 0 && !loading && scanning.length === 0 && (
            // One interest with nothing in it yet is "no papers", not a filter to clear.
            cards.length === 0 && bucket === 'all' && yearFrom == null ? (
              <EmptyState
                icon="radar"
                title="No papers yet"
                body={<>BioXplorer scans an {TERMS.interest} only when you ask. Run a scan to fill the feed.</>}
                action={<Button variant="primary" icon="play" onClick={() => setScanOpen(true)}>Scan now</Button>}
              />
            ) : cards.length === 0 ? (
              <EmptyState icon="search" title="Nothing matches these filters" action={<Button onClick={() => { setProfFilter('all'); setBucket('all'); setYearFrom(null); }}>Clear filters</Button>} />
            ) : (
              <EmptyState icon="check" title="All caught up" body="Every paper here has been saved or dismissed." action={<Button onClick={() => setShowTriaged(true)}>Show them anyway</Button>} />
            )
          )}

          {/* Only with rows: the list now draws the panel border itself, so
              an empty one was a bordered strip under the empty state. */}
          {visible.length > 0 && <div className="paper-list" ref={listRef}>
            {visible.map((c) => {
              const p = byKey[c.profile];
              return (
                <PaperCard
                  key={c.id}
                  card={c}
                  profile={p}
                  alsoIn={(alsoIn.get(c.id) ?? []).map((k) => byKey[k]?.name ?? k)}
                  state={stateOf(c)}
                  expanded={expanded.has(c.id)}
                  focused={focused === c.id}
                  busy={busy.has(keyOf(c))}
                  seeding={seeding.has(keyOf(c))}
                  onSeed={() => void seed(c)}
                  onFocus={() => setFocused(c.id)}
                  onToggle={() => toggleExpand(c.id)}
                  onSave={() => act(c, 'saved')}
                  onDismiss={() => act(c, 'dismissed')}
                />
              );
            })}
          </div>}

          {visible.length > 0 && (
            <div className="feed-keys">
              <span><Icon name="keyboard" size={13} /> Keyboard:</span>
              <span><Kbd>j</Kbd><Kbd>k</Kbd> move</span>
              <span><Kbd>s</Kbd> save</span>
              <span><Kbd>x</Kbd> dismiss</span>
              <span><Kbd>↵</Kbd> abstract</span>
              <span><Kbd>o</Kbd> open paper</span>
            </div>
          )}
        </>
      )}
      {profilesLoading && !profiles && <LoadingRows rows={3} label={`Loading ${TERMS.interests}`} />}
    </div>
  );
}

function Onboarding() {
  return (
    <div className="stack" style={{ gap: 16 }}>
      <Callout tone="info" title={`BioXplorer needs an ${TERMS.interest} to scan for`}>
        An {TERMS.interest} is a set of papers you already care about. BioXplorer learns what they have in common and watches OpenAlex for more like them. Add one from:
      </Callout>
      <AddInterestCards />
      <Link href={paths.home} className="home-link">See everything you can do in BioXplorer <Icon name="arrow-right" size={13} /></Link>
    </div>
  );
}

function ScanPanel({ profiles, defaultKey, onClose }: { profiles: Profile[]; defaultKey: string; onClose: () => void }) {
  const [key, setKey] = useState(profiles.some((p) => p.key === defaultKey) ? defaultKey : profiles[0].key);
  const [days, setDays] = useState(7);
  const [daysOk, setDaysOk] = useState(true);
  const [busy, setBusy] = useState(false);
  const jobs = useJobs();
  const already = jobs.find((j) => j.kind === 'scan' && j.profileKey === key && j.status === 'running');
  // Escape closes it, like the dialogs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function go() {
    const p = profiles.find((x) => x.key === key);
    if (!p) return;
    setBusy(true);
    try {
      await startScan(p, { days });
      toast.info(`Scanning "${p.name}" for papers from the last ${daysLabel(days)}.`);
      onClose();
    } catch (e) {
      toast.error(`Couldn't start the scan: ${errorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scan-popover" role="group" aria-label="Scan now">
      <Field label={TERMS.Interest}>
        <Select value={key} onChange={(e) => setKey(e.target.value)}>
          {profiles.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
        </Select>
      </Field>
      <Field label="Look back (days)">
        <NumberInput integer min={1} max={365} value={days} onChange={setDays} onValidity={setDaysOk} />
      </Field>
      <p className="small muted" style={{ margin: 0 }}>Takes each topic's {SCAN_PER_TOPIC} most cited papers from that window.</p>
      <div className="row">
        <Button variant="primary" icon="play" onClick={go} loading={busy} disabled={!!already || !daysOk} title={already ? 'A scan is already running for this interest' : !daysOk ? 'Days 1–365' : undefined}>
          {already ? 'Already running' : 'Start scan'}
        </Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

function PaperCard({
  card, profile, alsoIn, state, expanded, focused, busy, seeding, onFocus, onToggle, onSave, onDismiss, onSeed,
}: {
  card: Card; profile: Profile | undefined;
  /** Names of the other interests that gathered this same paper. */
  alsoIn: string[];
  state: CardState; expanded: boolean; focused: boolean; busy: boolean; seeding: boolean;
  onSeed: () => void;
  onFocus: () => void; onToggle: () => void; onSave: () => void; onDismiss: () => void;
}) {
  const href = card.doi ? `https://doi.org/${card.doi}` : card.openalex;
  const similarity = card.similarity ?? null;
  const below = card.bucket === 'low';
  const delta = profile && similarity != null ? similarity - profile.threshold : null;
  return (
    <article
      className={`paper ${state ?? ''} ${focused ? 'focused' : ''}`}
      tabIndex={0}
      data-card={card.id}
      onFocus={onFocus}
      aria-label={card.title}
    >
      <div className="paper-score" title={similarity != null ? `Similarity to the seed papers: ${fmtScore(similarity)}. ${below ? "Below this interest's threshold, so not ranked in its pool." : `Rank: top ${Math.max(1, Math.round(100 - card.score * 100))}% of this interest's pool.`}` : `Rank percentile ${Math.round(card.score * 100)}`}>
        <ScoreValue score={similarity ?? card.score} />
        {delta != null && (
          // The number alone: " vs bar" made it ~90px of unbreakable mono,
          // wider than the compact 60px score column. The words are in the
          // tooltip.
          <span className="small muted mono" title={`Similarity minus this ${TERMS.interest}'s threshold (${profile!.threshold.toFixed(3)}): above the bar when positive`}>
            {fmtSigned(delta)}
          </span>
        )}
      </div>
      <div className="paper-main">
        <h3 className="paper-title">
          <a href={href} target="_blank" rel="noopener noreferrer" title="Open the paper in a new tab">
            {card.title}
            <Icon name="external" size={12} />
          </a>
        </h3>
        <div className="paper-meta">
          {/* Here rather than under the score: its labels ("Like your seeds")
              are ~100px of unbreakable text, which overflowed even the old
              88px score column and would cover the title in the compact one. */}
          <BucketBadge bucket={card.bucket} />
          {profile && <InterestName profile={profile} />}
          {alsoIn.length > 0 && (
            <span className="small muted" title={`Also gathered by: ${alsoIn.join(', ')}`}>
              +{alsoIn.length === 1 ? ` also in ${alsoIn[0]}` : ` ${alsoIn.length} more ${TERMS.interests}`}
            </span>
          )}
          {profile && <span className="sep">·</span>}
          <span className="truncate" style={{ maxWidth: 420 }} title={card.authors.join(', ')}>{card.authors.join(', ') || 'Unknown authors'}</span>
          <span className="sep">·</span>
          <span>{card.venue || 'Unknown venue'}</span>
          <span className="sep">·</span>
          <span>{card.date}</span>
          {state && <Badge tone={state === 'saved' ? 'ok' : 'neutral'}>{state === 'saved' ? 'Saved' : 'Dismissed'}</Badge>}
        </div>
        <div className="paper-abstract-toggle">
          <button type="button" className="paper-toggle" onClick={onToggle} aria-expanded={expanded}>
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={12} />
            {expanded ? 'Hide details' : 'Abstract & details'}
          </button>
          {card.matched.length > 0 && !expanded && (
            <span className="small muted">Matches: {card.matched.slice(0, 3).join(', ')}</span>
          )}
        </div>
        {expanded && (
          <>
            <p className="paper-abstract">{card.abstract || 'No abstract available.'}</p>
            <div className="paper-extra">
              <div>
                <h4>Why it scored this way</h4>
                <div className="signals">
                  <Signal label="Similarity" value={card.similarity ?? card.centroidCos} hint="Cosine similarity to the interest's seed papers (0.80 ≈ unrelated papers in the same field, 0.93+ ≈ as close as your own seeds)" />
                  {/* A paper under the threshold is not in the pool the rank is taken over. */}
                  {!below && <Signal label="Rank" value={card.score} hint="Position within everything gathered for this interest (1 = top)" />}
                  <Signal label="Topic match" value={card.topicMatch} hint="Overlap with the interest's topic filters" />
                  <Signal label="Novelty" value={card.noveltyDelta} hint="How different this is from what you have already seen" />
                </div>
                {card.terms.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    {card.terms.map((t) => (
                      <span key={t} className={`topic-chip ${card.matched.includes(t) ? 'match' : ''}`}>
                        {card.matched.includes(t) && <Icon name="check" size={11} />}{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h4>Identifiers</h4>
                <div className="paper-links">
                  {card.doi ? <a href={`https://doi.org/${card.doi}`} target="_blank" rel="noopener noreferrer">DOI {card.doi} <Icon name="external" size={11} /></a> : <span className="muted">No DOI</span>}
                  <a href={card.openalex} target="_blank" rel="noopener noreferrer">OpenAlex {card.openalex.replace(/^https?:\/\/openalex\.org\//, '')} <Icon name="external" size={11} /></a>
                  {card.mesh.length > 0 && <span className="muted">MeSH: {card.mesh.join(', ')}</span>}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="paper-actions">
        <Button size="sm" icon={state === 'saved' ? 'check' : 'bookmark'} className={state === 'saved' ? 'on-saved' : ''} onClick={onSave} loading={busy} aria-pressed={state === 'saved'} title={state === 'saved' ? 'Click to un-save' : 'Keep this paper (S)'}>
          {state === 'saved' ? 'Saved' : 'Save'}
        </Button>
        <Button size="sm" icon="plus" variant="ghost" onClick={onSeed} loading={seeding} title={`Add this paper to the seeds of ${profile?.name ?? card.profile}`}>
          Seed
        </Button>
        <Button size="sm" icon="x" className={state === 'dismissed' ? 'on-dismissed' : ''} onClick={onDismiss} loading={busy} aria-pressed={state === 'dismissed'} title={state === 'dismissed' ? 'Click to restore' : 'Not useful (X)'}>
          {state === 'dismissed' ? 'Dismissed' : 'Dismiss'}
        </Button>
      </div>
    </article>
  );
}

function Signal({ label, value, hint }: { label: string; value: number; hint: string }) {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return (
    <div className="signal" title={hint}>
      <span>{label}</span>
      <span className="signal-bar"><i style={{ width: `${Math.max(3, v * 100)}%` }} /></span>
      <span className="num">{value.toFixed(2)}</span>
    </div>
  );
}

export function goToFeedFor(key: string) {
  navigate(`${paths.feed}?interest=${encodeURIComponent(key)}`);
}
