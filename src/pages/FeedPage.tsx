import { useEffect, useMemo, useRef, useState } from 'react';
import { useDailyRadar, useProfiles } from '../api/hooks';
import { dismissCard, saveCard } from '../api/endpoints/radar';
import { errorMessage, fmtRelative } from '../lib/format';
import { invalidate } from '../lib/query';
import { startScan, useJobs } from '../lib/jobs';
import { navigate, paths, usePath } from '../lib/router';
import { TERMS } from '../lib/terms';
import { toast } from '../lib/toast';
import type { Bucket, Card, CardState, Profile } from '../types/radar';
import { Badge, Button, Callout, EmptyState, ErrorBox, Field, Icon, Input, Kbd, LoadingRows, Segmented, Select } from '../ui';
import { Link } from '../ui/Link';
import { BucketBadge, InterestName, ScoreValue } from '../ui/domain';

type BucketFilter = 'all' | Bucket;

export function FeedPage() {
  const path = usePath();
  const initialInterest = useMemo(() => new URLSearchParams(path.split('?')[1] ?? '').get('interest') ?? 'all', [path]);
  const [profFilter, setProfFilter] = useState<string>(initialInterest);
  const [bucket, setBucket] = useState<BucketFilter>('all');
  const [showTriaged, setShowTriaged] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, CardState>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [scanOpen, setScanOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setProfFilter(initialInterest), [initialInterest]);

  const { data: profiles, loading: profilesLoading, error: profilesError, refresh: refreshProfiles } = useProfiles();
  const live = useMemo(() => (profiles ?? []).filter((p) => !p.isDraft), [profiles]);
  const drafts = useMemo(() => (profiles ?? []).filter((p) => p.isDraft), [profiles]);
  const byKey = useMemo(() => Object.fromEntries((profiles ?? []).map((p) => [p.key, p])), [profiles]);
  const { data, loading, error, refresh, fetching } = useDailyRadar({
    profile: profFilter,
    bucket: bucket === 'all' ? undefined : bucket,
  });
  const jobs = useJobs();
  const scanning = jobs.filter((j) => j.kind === 'scan' && j.status === 'running');

  const cards = data?.cards ?? [];
  const stateOf = (c: Card): CardState => (c.id in overrides ? overrides[c.id] : data?.states[c.id] ?? null);
  const visible = showTriaged ? cards : cards.filter((c) => stateOf(c) === null);
  const triagedCount = cards.length - cards.filter((c) => stateOf(c) === null).length;
  const bucketCounts = useMemo(() => {
    const all = data?.cards ?? [];
    return { all: all.length, high: all.filter((c) => c.bucket === 'high').length, medium: all.filter((c) => c.bucket === 'medium').length, low: all.filter((c) => c.bucket === 'low').length };
  }, [data]);

  async function act(card: Card, target: 'saved' | 'dismissed') {
    if (busy.has(card.id)) return;
    const prev = stateOf(card);
    const next: CardState = prev === target ? null : target;
    setOverrides((o) => ({ ...o, [card.id]: next }));
    setBusy((b) => new Set(b).add(card.id));
    try {
      const res = await (target === 'saved' ? saveCard(card.id) : dismissCard(card.id));
      setOverrides((o) => ({ ...o, [card.id]: res.state }));
      invalidate('profiles');
    } catch (e) {
      setOverrides((o) => ({ ...o, [card.id]: prev }));
      toast.error(`Couldn't ${target === 'saved' ? 'save' : 'dismiss'} "${card.title.slice(0, 60)}": ${errorMessage(e)}`);
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(card.id);
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
      if (idx < 0) return;
      const card = visible[idx];
      if (e.key === 's') { e.preventDefault(); void act(card, 'saved'); }
      else if (e.key === 'x') { e.preventDefault(); void act(card, 'dismissed'); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(card.id); }
      else if (e.key === 'o') { e.preventDefault(); window.open(card.doi ? `https://doi.org/${card.doi}` : card.openalex, '_blank', 'noopener'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const filterActive = profFilter !== 'all' || bucket !== 'all';
  const selectedName = profFilter === 'all' ? `all ${TERMS.interests}` : byKey[profFilter]?.name ?? profFilter;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">{TERMS.feed}</h1>
          <p className="page-sub">
            Every paper Radar has gathered for {selectedName}, best score first. Save what is useful and dismiss the rest; both teach the scoring.
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
                { value: 'all', label: 'All', count: bucket === 'all' ? bucketCounts.all : null },
                { value: 'high', label: 'High', count: bucket === 'all' ? bucketCounts.high : null },
                { value: 'medium', label: 'Medium', count: bucket === 'all' ? bucketCounts.medium : null },
                { value: 'low', label: 'Low', count: bucket === 'all' ? bucketCounts.low : null },
              ]}
            />
            <label className="row small muted" style={{ gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={showTriaged} onChange={(e) => setShowTriaged(e.target.checked)} />
              Show saved and dismissed{triagedCount > 0 ? ` (${triagedCount})` : ''}
            </label>
            <span className="spacer" />
            <span className="feed-summary">
              {visible.length} {visible.length === 1 ? 'paper' : 'papers'} to review
              {data?.candidatesScored ? ` · ${data.candidatesScored.toLocaleString()} scored in the last scan` : ''}
            </span>
          </div>

          {scanning.length > 0 && data && visible.length === 0 && !loading && (
            <Callout tone="info" title="A scan is running">New papers appear here when it finishes.</Callout>
          )}

          {error && !data && <ErrorBox message={errorMessage(error)} onRetry={() => refresh()} />}
          {loading && !data && <LoadingRows rows={4} label="Loading the feed" />}

          {data && visible.length === 0 && !loading && scanning.length === 0 && (
            cards.length === 0 && !filterActive ? (
              <EmptyState
                icon="radar"
                title="No papers yet"
                body={<>Radar scans each {TERMS.interest} daily at 04:00 UTC. Run a scan now to fill the feed without waiting.</>}
                action={<Button variant="primary" icon="play" onClick={() => setScanOpen(true)}>Scan now</Button>}
              />
            ) : cards.length === 0 ? (
              <EmptyState icon="search" title="Nothing matches these filters" action={<Button onClick={() => { setProfFilter('all'); setBucket('all'); }}>Clear filters</Button>} />
            ) : (
              <EmptyState icon="check" title="All caught up" body="Every paper here has been saved or dismissed." action={<Button onClick={() => setShowTriaged(true)}>Show them anyway</Button>} />
            )
          )}

          <div className="paper-list" ref={listRef}>
            {visible.map((c) => {
              const p = byKey[c.profile];
              return (
                <PaperCard
                  key={c.id}
                  card={c}
                  profile={p}
                  state={stateOf(c)}
                  expanded={expanded.has(c.id)}
                  focused={focused === c.id}
                  busy={busy.has(c.id)}
                  onFocus={() => setFocused(c.id)}
                  onToggle={() => toggleExpand(c.id)}
                  onSave={() => act(c, 'saved')}
                  onDismiss={() => act(c, 'dismissed')}
                />
              );
            })}
          </div>

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
    <div>
      <Callout tone="info" title={`Radar needs an ${TERMS.interest} to scan for`}>
        An {TERMS.interest} is a handful of papers you already care about. Radar learns what they have in common and watches OpenAlex for more like them.
      </Callout>
      <div className="onboarding">
        <div className="onboarding-step"><Icon name="upload" /><b>1. Add seed papers</b><p>Upload 5–15 PDFs, or import every paper on your Prosopia profile.</p></div>
        <div className="onboarding-step"><Icon name="sliders" /><b>2. Set the threshold</b><p>A trial scan shows real scores from the last 30 days. You pick how strict to be.</p></div>
        <div className="onboarding-step"><Icon name="radar" /><b>3. Triage daily</b><p>New matches land here every morning. Save or dismiss each one.</p></div>
      </div>
      <Link href={paths.wizard()} className="btn btn-primary btn-lg">
        <Icon name="plus" size={16} /> Create your first {TERMS.interest}
      </Link>
    </div>
  );
}

function ScanPanel({ profiles, defaultKey, onClose }: { profiles: Profile[]; defaultKey: string; onClose: () => void }) {
  const [key, setKey] = useState(defaultKey);
  const [days, setDays] = useState(7);
  const [limit, setLimit] = useState(500);
  const [busy, setBusy] = useState(false);
  const jobs = useJobs();
  const already = jobs.find((j) => j.kind === 'scan' && j.profileKey === key && j.status === 'running');

  async function go() {
    const p = profiles.find((x) => x.key === key);
    if (!p) return;
    setBusy(true);
    try {
      await startScan(p, { days, limit });
      toast.info(`Scanning "${p.name}" for papers from the last ${days} days.`);
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
        <Input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))} />
      </Field>
      <Field label="Max papers to fetch">
        <Input type="number" min={1} max={5000} step={50} value={limit} onChange={(e) => setLimit(Math.max(1, Math.min(5000, Number(e.target.value) || 1)))} />
      </Field>
      <div className="row">
        <Button variant="primary" icon="play" onClick={go} loading={busy} disabled={!!already} title={already ? 'A scan is already running for this interest' : undefined}>
          {already ? 'Already running' : 'Start scan'}
        </Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

function PaperCard({
  card, profile, state, expanded, focused, busy, onFocus, onToggle, onSave, onDismiss,
}: {
  card: Card; profile: Profile | undefined; state: CardState; expanded: boolean; focused: boolean; busy: boolean;
  onFocus: () => void; onToggle: () => void; onSave: () => void; onDismiss: () => void;
}) {
  const href = card.doi ? `https://doi.org/${card.doi}` : card.openalex;
  const delta = profile ? card.score - profile.threshold : null;
  return (
    <article
      className={`paper ${state ?? ''} ${focused ? 'focused' : ''}`}
      tabIndex={0}
      data-card={card.id}
      onFocus={onFocus}
      aria-label={card.title}
    >
      <div className="paper-score">
        <ScoreValue score={card.score} />
        <BucketBadge bucket={card.bucket} />
        {delta != null && (
          <span className="small muted mono" title={`Score minus this ${TERMS.interest}'s threshold (${profile!.threshold.toFixed(2)})`}>
            {delta >= 0 ? '+' : ''}{delta.toFixed(2)} vs θ
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
          {profile && <InterestName profile={profile} />}
          {profile && <span className="sep">·</span>}
          <span className="truncate" style={{ maxWidth: 420 }} title={card.authors.join(', ')}>{card.authors.join(', ') || 'Unknown authors'}</span>
          <span className="sep">·</span>
          <span>{card.venue || 'Unknown venue'}</span>
          <span className="sep">·</span>
          <span>{card.date}</span>
          <span className="sep">·</span>
          <span>{card.mins} min read</span>
          {state && <Badge tone={state === 'saved' ? 'ok' : 'neutral'}>{state === 'saved' ? 'Saved' : 'Dismissed'}</Badge>}
        </div>
        <div className="paper-abstract-toggle">
          <Button size="sm" variant="ghost" icon={expanded ? 'chevron-up' : 'chevron-down'} onClick={onToggle} aria-expanded={expanded}>
            {expanded ? 'Hide details' : 'Abstract & details'}
          </Button>
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
                  <Signal label="Similarity" value={card.centroidCos} hint="Cosine similarity to the interest's seed centroid" />
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
        <Button icon={state === 'saved' ? 'check' : 'bookmark'} className={state === 'saved' ? 'on-saved' : ''} onClick={onSave} loading={busy} aria-pressed={state === 'saved'} title={state === 'saved' ? 'Click to un-save' : 'Keep this paper (S)'}>
          {state === 'saved' ? 'Saved' : 'Save'}
        </Button>
        <Button icon="x" className={state === 'dismissed' ? 'on-dismissed' : ''} onClick={onDismiss} loading={busy} aria-pressed={state === 'dismissed'} title={state === 'dismissed' ? 'Click to restore' : 'Not useful (X)'}>
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
