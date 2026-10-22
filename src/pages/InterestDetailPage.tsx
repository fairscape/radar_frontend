import { useEffect, useRef, useState } from 'react';
import { useProfileDetail, useProfileRuns, useProfiles, useResearchers } from '../api/hooks';
import {
  afterProfileDeleted,
  candidateScores,
  deleteProfile,
  getFeedbackThreshold,
  getRerankerComparison,
  getTopicYield,
  recomputeCoherence,
  removeSeed,
  updateProfileThreshold,
  updateProfileYears,
  type FeedbackThreshold,
  type GatherRunStatus,
} from '../api/endpoints/profiles';
import { uploadPdf } from '../api/endpoints/vault';
import { daysLabel, errorMessage, fmtDateTime, fmtDuration, fmtRelative, parseServerTime, plural } from '../lib/format';
import { startBackfill, startScan, useRunningJob, yearsLabel } from '../lib/jobs';
import { useQuery, invalidate } from '../lib/query';
import { navigate, paths, setLeaveGuard } from '../lib/router';
import { TERMS } from '../lib/terms';
import { toast } from '../lib/toast';
import { topicProfileNote, topicSourceTag } from '../lib/topicSource';
import { isUnmatched, noteUnmatchedUploads } from '../lib/unmatched';
import { notifyEmptyDrop } from '../lib/dropHint';
import type { Profile } from '../types/radar';
import { Badge, Button, Callout, Dialog, EmptyState, ErrorBox, Field, Icon, IconButton, LoadingRows, NumberInput, Panel, Stat, Tabs, confirmDialog, useAction } from '../ui';
import { PaperTitle } from '../ui/pickers';
import { VaultSeedPicker } from '../ui/VaultSeedPicker';
import { ThresholdPaperList } from '../ui/ThresholdPaperList';
import { ResearchTopics } from '../ui/ResearchTopics';
import { YearRange, fetchStart, inSpan } from '../ui/YearRange';
import type { YearSpan } from '../types/radar';
import { Link } from '../ui/Link';
import { CoherenceHistogram, HealthBadge, JobProgress, RerankerBumpChart, SectionNote, ThresholdHistogram, agreementTone, axisFor, healthOf } from '../ui/domain';
import { goToFeedFor } from './FeedPage';
import { getDraft, resetDraft } from '../lib/draft';

// gather_runs.SCAN_STALE_MINUTES: the server stops treating an open scan
// row as running once it has not reported progress for this long.
const SCAN_STALE_MS = 120 * 60_000;

type Tab = 'overview' | 'seeds' | 'topics' | 'threshold' | 'scans' | 'refinement';

const TABS: Tab[] = ['overview', 'seeds', 'topics', 'threshold', 'scans', 'refinement'];

/** What the reranker's queries are, by its ``query_mode``. */
const QUERY_KIND: Record<string, string> = {
  article: 'one per seed, its title and abstract',
  title: 'the seed titles',
  topic: 'the topics that are on',
  terms: 'the research topics',
};

/**
 * Whether a scan of this interest is running: one this tab started, or one
 * the server lists as unfinished.
 */
export function useScanBusy(profileKey: string) {
  const tabJob = useRunningJob('scan', profileKey);
  // A scan this tab did not start (another tab, or before this tab opened)
  // is in the runs list as unfinished; "Scan now" answered 409 for it.
  // A row left open by a dead thread stays unfinished until the backend
  // restarts; the server stops counting it after SCAN_STALE_MS and would
  // accept a scan, so this does too.
  const { data: recentRuns, refresh: refreshRuns } = useProfileRuns(profileKey, 5);
  const serverRunning = recentRuns?.some((r) => {
    if (r.finished_at || !['scan', 'backfill'].includes(runKind(r.tier_used))) return false;
    const last = r.progress_updated_at || r.started_at;
    if (!last) return true;
    const t = parseServerTime(last).getTime();
    return Number.isNaN(t) || Date.now() - t < SCAN_STALE_MS;
  }) ?? false;
  const scanBusy = !!tabJob || serverRunning;
  // A scan this tab did not start (another tab, before a reload) has no
  // job to poll: re-read the runs until the server says it finished.
  useEffect(() => {
    if (!serverRunning || tabJob) return;
    const t = window.setInterval(() => void refreshRuns(), 5000);
    return () => window.clearInterval(t);
  }, [serverRunning, tabJob, refreshRuns]);
  return { tabJob, scanBusy };
}

export function InterestDetailPage({ profileKey, urlTab = null }: { profileKey: string; urlTab?: string | null }) {
  const { data: profiles, loading: listLoading } = useProfiles();
  const { data: detail, loading, error, refresh } = useProfileDetail(profileKey);
  // The tab is in the URL (?tab=) so Back moves between tabs and other
  // pages can link straight to one ("View seeds" after seeding from the feed).
  const tab: Tab = TABS.includes(urlTab as Tab) ? (urlTab as Tab) : 'overview';
  const setTab = (t: Tab) => navigate(paths.interest(profileKey, t === 'overview' ? null : t));
  // "Add papers" in the header: open the Seeds tab with the Vault picker
  // unfolded. Adding seeds to a saved interest was possible but hard to
  // find -- the picker sat folded behind a link at the bottom of a tab.
  const [addPapers, setAddPapers] = useState(0);
  const [scanOpen, setScanOpen] = useState(false);
  const { tabJob, scanBusy } = useScanBusy(profileKey);
  const running = tabJob;
  const listed = profiles?.find((p) => p.key === profileKey);

  // Only trust the freshly fetched detail here: right after the wizard
  // commits, the cached list can still say "draft" for a moment.
  useEffect(() => {
    if (detail?.profile.isDraft) navigate(paths.wizard(detail.profile.key), { replace: true });
  }, [detail]);

  if (!listLoading && profiles && !listed && !loading && !detail) {
    return (
      <div className="page">
        <EmptyState icon="alert" title={`No ${TERMS.interest} called "${profileKey}"`} body="It may have been deleted, or the link is wrong." action={<Link href={paths.interests} className="btn">All {TERMS.interests}</Link>} />
      </div>
    );
  }
  const profile: Profile | undefined = detail?.profile ?? listed;
  if (!profile) {
    return (
      <div className="page">
        {error ? <ErrorBox message={errorMessage(error)} onRetry={refresh} /> : <LoadingRows rows={4} />}
      </div>
    );
  }
  const health = healthOf(profile);

  return (
    <div className="page">
      <nav className="crumbs"><Link href={paths.interests}>{TERMS.Interests}</Link><Icon name="chevron-right" size={12} /><span>{profile.name}</span></nav>
      <header className="page-head">
        <div>
          <h1 className="page-title">
            <span className="swatch" style={{ background: `oklch(0.68 0.13 ${profile.hue})`, width: 14, height: 14 }} />
            {profile.name}
            <HealthBadge profile={profile} />
          </h1>
          <p className="page-sub">{health.hint}{profile.researcherId != null && <BuiltFrom id={profile.researcherId} />}</p>
        </div>
        <div className="page-actions">
          <Button icon="plus" onClick={() => { setTab('seeds'); setAddPapers((n) => n + 1); }} title="Add seed papers to this interest">Add papers</Button>
          <Button icon="sliders" onClick={() => navigate(paths.interestEdit(profile.key))} title="Go through the steps again: seeds, check, topics, threshold">Edit interest</Button>
          <Button icon="radar" onClick={() => goToFeedFor(profile.key)}>View in feed</Button>
          <Button variant="primary" icon="play" onClick={() => setScanOpen(true)} disabled={scanBusy} title={scanBusy ? 'A scan is already running' : 'Look for new papers now'}>
            {scanBusy ? 'Scanning…' : 'Scan now'}
          </Button>
          <DeleteInterestButton profile={profile} busy={scanBusy} />
        </div>
      </header>

      {running && (
        <div style={{ marginBottom: 16 }}>
          <JobProgress job={running} />
        </div>
      )}

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <Stat label="Seed papers" value={profile.seeds} sub={profile.seeds < 5 ? 'Fewer than 5 is thin' : undefined} />
        <Stat label="Threshold" value={profile.threshold.toFixed(3)} sub={profile.seedSimMin != null ? `your seeds score ${profile.seedSimMin.toFixed(3)}+` : 'minimum similarity to count'} />
        <Stat label="Seed agreement" value={profile.agreement != null ? `${profile.agreement}/100` : '—'} sub={health.label} tone={profile.agreement != null ? agreementTone(profile.agreement) : undefined} />
        <Stat label="Saved · dismissed" value={`${profile.saves30} · ${profile.dismisses30}`} sub="last 30 days" />
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'seeds', label: 'Seeds', count: detail?.seeds.length ?? null },
          { id: 'topics', label: 'Topics', count: detail ? detail.topics.filter((t) => t.on).length : null },
          { id: 'threshold', label: 'Threshold' },
          { id: 'scans', label: 'Scans' },
          { id: 'refinement', label: 'Rank refinement' },
        ]}
      />

      {error && !detail && <ErrorBox message={errorMessage(error)} onRetry={refresh} />}
      {loading && !detail && <LoadingRows rows={4} />}
      {detail && tab === 'overview' && <OverviewTab profile={profile} detail={detail} onScan={() => setScanOpen(true)} busy={scanBusy} />}
      {detail && tab === 'seeds' && <SeedsTab profile={profile} detail={detail} openPicker={addPapers} />}
      {detail && tab === 'topics' && <TopicsTab profile={profile} detail={detail} />}
      {detail && tab === 'threshold' && <ThresholdTab profile={profile} onScan={() => setScanOpen(true)} busy={scanBusy} />}
      {tab === 'scans' && <ScansTab profile={profile} onScan={() => setScanOpen(true)} busy={scanBusy} />}
      {detail && tab === 'refinement' && <RankRefinementTab profile={profile} />}

      <ScanDialog profile={profile} open={scanOpen} onClose={() => setScanOpen(false)} />
    </div>
  );
}

export type Detail = NonNullable<ReturnType<typeof useProfileDetail>['data']>;

function OverviewTab({ profile, detail, onScan, busy }: { profile: Profile; detail: Detail; onScan: () => void; busy: boolean }) {
  const { data: runs } = useProfileRuns(profile.key, 5);
  // Trial scans from the wizard and imports share the runs table; they are
  // not scans (a backfill is). The filter read 'dry-run'; the server writes
  // 'dry_run'.
  const last = runs?.find((r) => r.finished_at && ['scan', 'backfill'].includes(runKind(r.tier_used)));
  return (
    <div className="two-col">
      <Panel title="How this interest works">
        <div className="stack" style={{ fontSize: 13.5, color: 'var(--fg-2)' }}>
          <p>Radar queries OpenAlex for <b>{detail.topics.filter((t) => t.on).length}</b> topics and scores each new paper by how similar it is to your <b>{detail.seeds.length}</b> seed papers. Anything at or above <b>{profile.threshold.toFixed(3)}</b> reaches the feed{profile.seedSimMin != null && <>; papers at <b>{profile.seedSimMin.toFixed(3)}</b> or more are as close as your own seeds</>}.</p>
          <p>Radar does not scan on a schedule. Press Scan now to look for new papers.</p>
          <p>Saving or dismissing a paper in the feed is recorded as feedback for this {TERMS.interest} and used when it is refit.</p>
        </div>
      </Panel>
      <Panel title="Recent activity" actions={<Button size="sm" icon="play" onClick={onScan} disabled={busy}>{busy ? 'Scanning…' : 'Scan now'}</Button>}>
        {last ? (
          <div className="stack" style={{ gap: 6, fontSize: 13.5 }}>
            <div className="row spread"><span>Last scan</span><span>{fmtRelative(last.finished_at)}</span></div>
            <div className="row spread"><span>Result</span>{last.error ? <Badge tone="err">Failed</Badge> : <span>{last.n_fetched ?? 0} fetched · {last.n_new ?? 0} new</span>}</div>
            {last.error && <div className="small" style={{ color: 'var(--err)' }}>{last.error}</div>}
          </div>
        ) : (
          <p className="muted small">No scan has run yet.</p>
        )}
        <div style={{ marginTop: 14 }}>
          <div className="field-label" style={{ marginBottom: 6 }}>Latest feedback</div>
          {detail.feedbackLog.length === 0 ? (
            <p className="muted small">Nothing saved or dismissed yet.</p>
          ) : (
            <div className="mono small" style={{ background: 'var(--bg-inset)', border: '1px solid var(--line)', borderRadius: 6, padding: 10, maxHeight: 180, overflow: 'auto', lineHeight: 1.7 }}>
              {detail.feedbackLog.map((l, i) => <div key={i}>{l}</div>)}
              {detail.feedbackMoreCount > 0 && <div className="muted">… {detail.feedbackMoreCount} more</div>}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

/** Interests with a seed upload running; module-wide so leaving and re-entering the tab can't start a second loop. */
const uploadingSeeds = new Set<string>();

export function SeedsTab({ profile, detail, openPicker = 0, onBusy }: { profile: Profile; detail: Detail; openPicker?: number; onBusy?: (busy: boolean) => void }) {
  const pickerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (openPicker > 0) pickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [openPicker]);
  const health = healthOf(profile);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  // Coherence only. It used to run recompute-topics too, which switches
  // every topic the new seeds bring in *on* -- widening the next scan
  // unseen. Topics are chosen in Edit interest -> Topics now.
  const recompute = useAction(async () => {
    await recomputeCoherence(profile.key);
    toast.success('Coherence recomputed.');
  });

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    // A second drop while a batch uploads ran a second loop: it wiped the
    // first batch's failures and ended the busy state early.
    if (uploadingSeeds.has(profile.key)) { toast.info('Still uploading the previous files; drop these again when that finishes.'); return; }
    uploadingSeeds.add(profile.key);
    onBusy?.(true);
    const list = Array.from(files);
    setFailures([]);
    let ok = 0;
    const unmatched: string[] = [];
    // A PDF that is one of the seeds already: nothing is added, and the
    // toast used to say "1 seed added" all the same.
    const had = new Set(detail.seeds.map((s) => s.id));
    const already: string[] = [];
    for (let i = 0; i < list.length; i++) {
      setProgress({ done: i, total: list.length, current: list[i].name });
      try {
        const doc = await uploadPdf(list[i], profile.key);
        if (had.has(doc.id)) { already.push(list[i].name); continue; }
        if (isUnmatched(doc.id)) unmatched.push(list[i].name);
        ok += 1;
      } catch (e) {
        setFailures((f) => [...f, `${list[i].name}: ${errorMessage(e)}`]);
      }
    }
    setProgress(null);
    uploadingSeeds.delete(profile.key);
    onBusy?.(false);
    // Each upload re-fits the interest on the server; the coherence and
    // topic views are what still need a Recompute.
    if (ok > 0) toast.success(`${plural(ok, 'seed')} added. The papers already found were re-scored against the new seeds, so the feed is updated.`);
    if (already.length > 0) toast.info(`Already a seed here: ${already.join(', ')}.`);
    noteUnmatchedUploads(unmatched, 'interest');
  }

  // Seeds of a live interest could be added (by PDF) but never removed:
  // there was no route for it, and the draft route 404'd on the usual
  // https://openalex.org/W… id. The server re-fits the interest on the
  // seeds that remain, and refuses to remove the last one.
  const [removing, setRemoving] = useState<string | null>(null);
  async function remove(id: string, title: string) {
    const ok = await confirmDialog({
      title: 'Remove this seed?',
      body: <p>"{title || id}" will no longer count towards this {TERMS.interest}. The interest is re-fitted on the seeds that remain; the paper stays in your Vault.</p>,
      confirmLabel: 'Remove seed',
      danger: true,
    });
    if (!ok) return;
    setRemoving(id);
    try {
      await removeSeed(profile.key, id);
      toast.success('Seed removed. The papers already found were re-scored against the seeds that remain.');
    } catch (e) {
      toast.error(`Couldn't remove the seed: ${errorMessage(e)}`);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="two-col">
      <Panel title="Seed papers" description="What this interest is made of." actions={<Button size="sm" icon="refresh" onClick={() => recompute.run()} loading={recompute.busy} title="Recompute coherence from the current seeds">Recompute</Button>}>
        {recompute.error && <ErrorBox compact message={recompute.error} />}
        {detail.seeds.length === 0 ? <p className="muted small">No seeds recorded.</p> : detail.seeds.map((s) => (
          <div className="seed-row removable" key={s.id}>
            <span className="idx">{String(s.idx).padStart(2, '0')}</span>
            <span className="truncate"><PaperTitle title={s.title} id={s.id} /></span>
            <span className="muted mono small">{s.year || ''}</span>
            <span className="mono small" title="How similar this seed is to the other seeds (leave-one-out). The lowest values are the least typical papers." style={{ color: s.coh > 0 && profile.seedSimMin != null && s.coh <= profile.seedSimMin + 1e-6 && profile.seedSimMax != null && profile.seedSimMax - profile.seedSimMin > 0.02 ? 'var(--warn)' : 'var(--fg-3)' }}>
              {s.coh > 0 ? s.coh.toFixed(3) : '—'}
            </span>
            <IconButton icon="trash" size="sm" label={`Remove "${s.title || s.id}" from the seeds`} disabled={removing !== null || !!progress || detail.seeds.length <= 1} onClick={() => void remove(s.id, s.title)} />
          </div>
        ))}
        <div
          className={`dropzone ${over ? 'over' : ''} ${progress ? 'busy' : ''}`}
          style={{ marginTop: 14 }}
          onClick={() => !progress && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (!e.dataTransfer.files?.length) { notifyEmptyDrop(); return; } void upload(e.dataTransfer.files); }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        >
          <Icon name="upload" />
          {progress ? <span>Uploading {progress.done + 1} of {progress.total}: <b>{progress.current}</b></span> : <span><b>Add seed PDFs</b> — drop files here or click to browse</span>}
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
        </div>
        {failures.length > 0 && <ErrorBox compact title="Some files failed" message={failures.map((f) => <div key={f}>{f}</div>)} />}
        <div ref={pickerRef}>
          <VaultSeedPicker profileKey={profile.key} seedIds={new Set(detail.seeds.map((s) => s.id))} disabled={!!progress || removing !== null} openSignal={openPicker} />
        </div>
      </Panel>
      <Panel title="Do the seeds agree?" description="Whether the seed papers are about the same thing. The similarity column on the left shows how typical each seed is; the lowest ones are the odd ones out.">
        {detail.seeds.length < 2 ? (
          <p className="muted small">Needs at least two seeds.</p>
        ) : detail.coherenceBins.length === 0 ? (
          <p className="muted small">Not computed yet. Click Recompute.</p>
        ) : (
          <>
            <Callout tone={health.tone === 'ok' ? 'ok' : health.tone === 'err' ? 'err' : health.tone === 'warn' ? 'warn' : 'info'} title={health.label}>{health.hint}</Callout>
            <details style={{ marginTop: 10 }}>
              <summary className="small muted" style={{ cursor: 'pointer' }}>Technical detail</summary>
              <div className="row-wrap small muted" style={{ margin: '8px 0', gap: 16 }}>
                <span>median pairwise cosine <b className="mono">{profile.coherence.toFixed(3)}</b></span>
                <span>range <b className="mono">{detail.coherenceStats.min.toFixed(2)}–{detail.coherenceStats.max.toFixed(2)}</b></span>
                <span>{((detail.seeds.length * (detail.seeds.length - 1)) / 2).toLocaleString()} pairs</span>
                {profile.seedSimMin != null && profile.seedSimMax != null && <span>each seed vs the others <b className="mono">{profile.seedSimMin.toFixed(3)}–{profile.seedSimMax.toFixed(3)}</b></span>}
              </div>
              <CoherenceHistogram bins={detail.coherenceBins} />
            </details>
          </>
        )}
      </Panel>
    </div>
  );
}

function TopicsTab({ profile, detail }: { profile: Profile; detail: Detail }) {
  const yieldQ = useQuery(`profiles/${profile.key}/topic-yield`, () => getTopicYield(profile.key, 30));
  const yieldBy = Object.fromEntries((yieldQ.data?.topics ?? []).map((t) => [t.topic_id, t]));
  return (
    <div className="stack">
    <Panel title="Topics" description="What Radar asks OpenAlex for. Aggregated from the seeds; chosen when the interest was created.">
      <SectionNote>
        To switch topics on or off, or pick up topics that new seeds brought in, use{' '}
        <Link href={paths.interestEdit(profile.key, 3)}>Edit interest → Topics</Link>. Changes apply from the next scan.
      </SectionNote>
      {detail.topics.length === 0 ? (
        <p className="muted small">No topics. Add seeds whose OpenAlex records resolve, then Recompute on the Seeds tab.</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Topic</th><th>Source</th><th>Seeds</th><th>Status</th><th className="r" title="Candidates gathered from this topic in the last 30 days">Found · 30 d</th><th className="r">Saved</th><th className="r">Dismissed</th></tr>
          </thead>
          <tbody>
            {detail.topics.map((t) => {
              const y = yieldBy[t.id];
              return (
                <tr key={t.id} style={{ opacity: t.on ? 1 : 0.6 }}>
                  <td>{t.profile === 'not_interest' ? <s>{t.name}</s> : t.name} <span className="muted mono small">{t.id}</span></td>
                  <td>
                    <Badge>{topicSourceTag(t.source) ?? 'OpenAlex'}</Badge>
                    {t.profile === 'interest' && t.source !== 'researcher' && <> <Badge tone="info" title={topicProfileNote(t.profile) ?? undefined}>Profile</Badge></>}
                  </td>
                  <td className="r">{t.papers ?? t.count}</td>
                  <td>
                    {t.on ? <Badge tone="ok">Queried</Badge> : <Badge>Off</Badge>}
                    {t.profile === 'not_interest' && <> <Badge tone="warn" title={topicProfileNote(t.profile) ?? undefined}>Not wanted</Badge></>}
                  </td>
                  <td className="r">{yieldQ.loading ? '…' : y ? y.n_candidates : '—'}</td>
                  <td className="r">{y ? y.n_saved : '—'}</td>
                  <td className="r">{y ? y.n_dismissed : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {yieldQ.error && <div style={{ marginTop: 10 }}><ErrorBox compact title="Topic yield unavailable" message={errorMessage(yieldQ.error)} onRetry={yieldQ.refresh} /></div>}
    </Panel>
      <ResearchTopics profileKey={profile.key} />
    </div>
  );
}

/** The threshold that best separates what was saved from what was dismissed. */
function FeedbackSuggestion({ data, value, onUse }: { data: FeedbackThreshold | null; value: number; onUse: (v: number) => void }) {
  if (!data) return null;
  const n = data.n_saved + data.n_dismissed;
  if (data.suggested == null) {
    return (
      <p className="small muted" style={{ marginTop: 0, marginBottom: 10 }}>
        From your feedback: {n < data.min_events
          ? `${plural(n, 'paper')} saved or dismissed so far; a suggestion appears at ${data.min_events}.`
          : 'save at least one paper for a suggestion.'}
      </p>
    );
  }
  const s = data.suggested;
  return (
    <div className="row" style={{ marginBottom: 10 }}>
      <span className="small muted">
        From your feedback ({data.n_saved} saved, {data.n_dismissed} dismissed): <b className="mono">{s.toFixed(3)}</b> keeps what you saved and drops the most of what you dismissed.
      </span>
      {Math.abs(s - value) > 0.0005 && <Button size="sm" variant="ghost" onClick={() => onUse(s)}>Use this</Button>}
    </div>
  );
}

export function ThresholdTab({ profile, onScan, busy = false }: { profile: Profile; onScan: () => void; busy?: boolean }) {
  const scoresQ = useQuery(`profiles/${profile.key}/scores`, () => candidateScores(profile.key), { once: true });
  // Saves and dismisses are where the feed's triage feeds back into scoring.
  const feedbackQ = useQuery(`profiles/${profile.key}/feedback-threshold`, () => getFeedbackThreshold(profile.key));
  const [value, setValue] = useState<number>(profile.threshold);
  useEffect(() => setValue(profile.threshold), [profile.threshold, profile.key]);
  // The publication years this interest's feed draws from (null = all).
  const savedYears: YearSpan | null = profile.yearFrom != null ? { from: profile.yearFrom, to: profile.yearTo ?? null } : null;
  const [years, setYears] = useState<YearSpan | null>(savedYears);
  useEffect(() => setYears(savedYears), [profile.yearFrom, profile.yearTo, profile.key]);   // eslint-disable-line react-hooks/exhaustive-deps
  const yearsDirty = JSON.stringify(years) !== JSON.stringify(savedYears);
  const storedPapers = scoresQ.data?.papers ?? [];
  const papersInYears = storedPapers.filter((p) => inSpan(p.year, years));
  // From the paper list whenever there is one: the server's ``scores`` are
  // filtered by the *saved* years, so a range only tried here (above all
  // "Any year") drew the saved range's histogram, or none.
  const shownScores = scoresQ.data?.papers ? papersInYears.map((p) => p.score) : scoresQ.data?.scores ?? [];
  const oldestStored = (scoresQ.data?.papers ?? []).reduce<number | null>((m, p) => (p.year != null && (m == null || p.year < m) ? p.year : m), null);
  // Against the first year a backfill can reach: a range longer than 15
  // years fetches only its last 15, so comparing with ``from`` kept the
  // button up for good, each click repeating the same fetch.
  const needsBackfill = !!savedYears && !yearsDirty && (oldestStored == null || fetchStart(savedYears) < oldestStored);
  const saveYears = useAction(async () => {
    await updateProfileYears(profile.key, years);
    toast.success(years ? `The feed now shows papers from ${yearsLabel(years)}.` : 'The feed shows papers from any year.');
  });
  const fetchYears = useAction(async () => {
    if (!savedYears) return;
    await startBackfill({ key: profile.key, name: profile.name }, savedYears);
    toast.info(`Fetching papers from ${yearsLabel(savedYears)}. They appear here and in the feed when the run finishes.`);
  });
  const band = scoresQ.data?.seed_similarity ?? (profile.seedSimMin != null && profile.seedSimMax != null ? { min: profile.seedSimMin, median: (profile.seedSimMin + profile.seedSimMax) / 2, max: profile.seedSimMax } : null);
  const suggested = scoresQ.data?.suggested_threshold ?? null;
  const [axisLo, axisHi] = axisFor(shownScores, band, scoresQ.data?.score_range ?? null);
  const save = useAction(async () => {
    await updateProfileThreshold(profile.key, Number(value.toFixed(3)));
    toast.success(`Threshold saved as ${value.toFixed(3)}.`);
  });
  const dirty = Math.abs(value - profile.threshold) > 0.0005;
  const [exactOk, setExactOk] = useState(true);
  // Threshold and years wait for their own Save: switching tab, Done on
  // Edit interest, the sidebar or Back dropped a typed value unseen.
  const unsaved = dirty || yearsDirty || !exactOk;
  useEffect(() => {
    if (!unsaved) return;
    setLeaveGuard(() => confirmDialog({
      title: 'Leave without saving?',
      body: <p>{yearsDirty && !dirty ? 'The publication years are' : dirty && yearsDirty ? 'The threshold and the publication years are' : 'The threshold is'} not saved; the feed still uses the saved {yearsDirty && !dirty ? 'years' : 'threshold'}.</p>,
      confirmLabel: 'Discard changes',
      danger: true,
    }));
    return () => setLeaveGuard(null);
  }, [unsaved, dirty, yearsDirty]);
  return (
    <Panel
      title="Threshold"
      description="The similarity a paper needs to reach your feed. Scans keep every paper they find; the threshold decides which ones you see, and saving applies at once. The shaded band is where your own seed papers score; the suggested value sits just below it."
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => setValue(profile.threshold)} disabled={!dirty}>Reset</Button>
          <Button size="sm" variant="primary" onClick={() => save.run()} loading={save.busy} disabled={!dirty || !exactOk} title={exactOk ? undefined : 'Enter a threshold between 0 and 1'}>Save threshold</Button>
        </>
      }
    >
      {save.error && <ErrorBox compact message={save.error} />}
      <div style={{ marginBottom: 14 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>Publication years</div>
        <YearRange value={years} onChange={setYears} newOnlyLabel="Any year" />
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          {yearsDirty && <Button size="sm" variant="primary" icon="check" loading={saveYears.busy} onClick={() => saveYears.run()}>Save years</Button>}
          {yearsDirty && <Button size="sm" variant="ghost" onClick={() => setYears(savedYears)}>Reset</Button>}
          {needsBackfill && (
            <>
              <span className="small muted">{oldestStored == null ? 'No papers stored yet.' : `The oldest paper stored is from ${oldestStored}.`}</span>
              <Button size="sm" icon="play" loading={fetchYears.busy} onClick={() => fetchYears.run()}>Fetch papers from {yearsLabel(savedYears!)}</Button>
            </>
          )}
        </div>
        {(saveYears.error || fetchYears.error) && <ErrorBox compact message={saveYears.error ?? fetchYears.error ?? ''} />}
      </div>
      {scoresQ.error && <ErrorBox compact message={errorMessage(scoresQ.error)} onRetry={scoresQ.refresh} />}
      {scoresQ.loading && <LoadingRows rows={3} />}
      {scoresQ.data && scoresQ.data.scores.length === 0 && storedPapers.length === 0 && (
        <EmptyState compact icon="radar" title="No gathered papers to calibrate against" body="Run a scan first, then come back to tune the threshold." action={<Button icon="play" onClick={onScan} disabled={busy}>{busy ? 'Scanning…' : 'Scan now'}</Button>} />
      )}
      {scoresQ.data && shownScores.length === 0 && storedPapers.length > 0 && (
        // Papers are stored, none from the years chosen above.
        <EmptyState compact icon="radar" title={`No stored papers from ${years ? yearsLabel(years) : 'these years'}`} body={`${plural(storedPapers.length, 'paper')} from other years ${storedPapers.length === 1 ? 'is' : 'are'} stored${yearsDirty ? ' outside this range' : ' and hidden from the feed by the year range'}. Widen the range, or fetch papers from these years.`} />
      )}
      {scoresQ.data && shownScores.length > 0 && (
        <>
          {suggested != null && Math.abs(suggested - value) > 0.0005 && (
            <div className="row" style={{ marginBottom: 10 }}>
              <span className="small muted">Suggested for these seeds: <b className="mono">{suggested.toFixed(3)}</b></span>
              <Button size="sm" variant="ghost" onClick={() => setValue(suggested)}>Use suggested</Button>
            </div>
          )}
          <FeedbackSuggestion data={feedbackQ.data ?? null} value={value} onUse={setValue} />
          <ThresholdHistogram scores={shownScores} value={value} min={axisLo} max={axisHi} onChange={setValue} reference={profile.threshold} seedBand={band} suggested={suggested} periodLabel="of gathered papers would pass" />
          {/* Scans before 2026-10-01 dropped every paper below the threshold
              of the day, so an older interest has nothing below it to show. */}
          {scoresQ.data.papers && scoresQ.data.papers.length > 0 && !scoresQ.data.papers.some((p) => p.score < profile.threshold) && (
            <Callout tone="info">
              Nothing below <b className="mono">{profile.threshold.toFixed(3)}</b> is stored yet: earlier scans kept only the papers above the threshold. Scans now keep everything, so after the next one a lower threshold shows what it adds.{' '}
              <Button size="sm" variant="ghost" icon="play" onClick={onScan} disabled={busy}>{busy ? 'Scanning…' : 'Scan now'}</Button>
            </Callout>
          )}
          {scoresQ.data.papers && scoresQ.data.papers.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <ThresholdPaperList papers={years ? papersInYears : scoresQ.data.papers} value={value}
                label={`${dirty ? 'Papers gathered so far (not saved yet)' : 'Papers gathered so far'}${years ? ` · ${yearsLabel(years)}` : ''}`} />
            </div>
          )}
        </>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <Field label="Exact value" inline>
          <NumberInput min={0} max={1} step={0.001} digits={3} value={value} onChange={setValue} onValidity={setExactOk} style={{ width: 110 }} />
        </Field>
        {/* The chart and list keep the last valid value; say so rather than show "0 of 426 would pass" for 1.5. */}
        {!exactOk && <span className="field-error">Enter a value between 0 and 1. The counts above are for {value.toFixed(3)}.</span>}
      </div>
    </Panel>
  );
}

function ScansTab({ profile, onScan, busy }: { profile: Profile; onScan: () => void; busy: boolean }) {
  const { data: runs, loading, error, refresh } = useProfileRuns(profile.key, 30);
  return (
    <Panel title="Scans" description="Every gather pass for this interest, newest first. Scans run only when you start one." actions={<Button size="sm" icon="play" onClick={onScan} disabled={busy}>{busy ? 'Scanning…' : 'Scan now'}</Button>} className="panel-flush">
      <div style={{ padding: '0 18px 12px' }}>
        {error && !runs && <ErrorBox compact message={errorMessage(error)} onRetry={refresh} />}
        {loading && !runs && <LoadingRows rows={3} />}
        {runs && runs.length === 0 && <EmptyState compact icon="clock" title="No scans yet" body="Start a scan to look for new papers." />}
        {runs && runs.length > 0 && (
          <table className="table">
            <thead><tr><th>Started</th><th title="What the run was; for a scan, the OpenAlex query tier it used">Kind</th><th>Status</th><th className="r">Fetched</th><th className="r">New</th><th className="r">Duration</th></tr></thead>
            <tbody>
              {runs.map((r) => <RunRow key={r.id} run={r} />)}
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}

type RunKind = 'scan' | 'trial' | 'import' | 'backfill';
const RUN_LABEL: Record<RunKind, string> = { scan: 'Scan', trial: 'Trial (wizard)', import: 'Import', backfill: 'Backfill' };

function runKind(tier: string | null | undefined): RunKind {
  if (tier === 'dry_run' || tier === 'dry-run') return 'trial';
  if (tier?.endsWith('_import')) return 'import';
  if (tier?.startsWith('backfill')) return 'backfill';
  return 'scan';
}

function RunRow({ run }: { run: GatherRunStatus }) {
  const status = run.error ? <Badge tone="err">Failed</Badge> : run.finished_at ? <Badge tone="ok">Done</Badge> : <Badge tone="info" dot>Running</Badge>;
  return (
    <tr>
      <td className="nowrap" title={run.started_at}>{fmtDateTime(run.started_at)}</td>
      <td className="muted" title={run.tier_used ?? undefined}>{RUN_LABEL[runKind(run.tier_used)]}{runKind(run.tier_used) === 'scan' && run.tier_used ? ` · ${run.tier_used}` : ''}</td>
      <td>{status}{run.error && <div className="small" style={{ color: 'var(--err)', maxWidth: 360 }}>{run.error}</div>}</td>
      <td className="r">{run.n_fetched ?? '—'}</td>
      <td className="r">{run.n_new ?? '—'}</td>
      <td className="r">{fmtDuration(run.started_at, run.finished_at)}</td>
    </tr>
  );
}

// A reranker query is a seed's whole "TITLE: ... ABSTRACT: ..." text; list it by title.
function queryTitle(q: string): string {
  const m = /^TITLE:\s*(.*?)\s*(?:ABSTRACT:|$)/s.exec(q);
  return (m?.[1] || q).trim();
}

function RankRefinementTab({ profile }: { profile: Profile }) {
  const rr = useQuery(`profiles/${profile.key}/reranker`, () => getRerankerComparison(profile.key));
  return (
    <Panel title="Reranker comparison" description="How the second-stage reranker reordered the selector's ranking. Empty unless a reranker is enabled on the backend.">
      {rr.error && <ErrorBox compact message={errorMessage(rr.error)} onRetry={rr.refresh} />}
      {rr.loading && <LoadingRows rows={4} />}
      {rr.data && rr.data.n === 0 && <EmptyState compact icon="info" title="Nothing reranked" body="Run a scan with the reranker enabled to populate this view." />}
      {rr.data && rr.data.n > 0 && (
        <>
          <div className="stat-grid" style={{ marginBottom: 14 }}>
            <Stat label="Reranked" value={rr.data.n} />
            <Stat label="Avg. rank change" value={rr.data.avg_rank_change.toFixed(1)} sub="mean absolute" />
            <Stat label="Largest promotion" value={`+${rr.data.max_rank_up}`} tone="ok" />
            <Stat label="Largest demotion" value={`-${rr.data.max_rank_down}`} tone="err" />
          </div>
          {rr.data.queries_used.length > 0 && (
            <details className="rr-queries small" style={{ marginBottom: 10 }}>
              <summary className="muted">Queries the reranker scored against ({rr.data.queries_used.length}, {QUERY_KIND[rr.data.query_mode ?? ''] ?? 'as configured'})</summary>
              <ol>
                {rr.data.queries_used.map((q) => (
                  <li key={q}>
                    <details>
                      <summary title={queryTitle(q)}>{queryTitle(q)}</summary>
                      <p className="muted">{q}</p>
                    </details>
                  </li>
                ))}
              </ol>
            </details>
          )}
          <RerankerBumpChart candidates={rr.data.candidates} n={rr.data.n} />
        </>
      )}
    </Panel>
  );
}

/** Mounted only while open: a Cancel left an invalid value's "disabled" and the last error behind for the next open. */
export function ScanDialog(props: { profile: Profile; open: boolean; onClose: () => void }) {
  return props.open ? <ScanDialogBody {...props} /> : null;
}

function ScanDialogBody({ profile, open, onClose }: { profile: Profile; open: boolean; onClose: () => void }) {
  const [days, setDays] = useState(7);
  const [limit, setLimit] = useState(500);
  const [daysOk, setDaysOk] = useState(true);
  const [limitOk, setLimitOk] = useState(true);
  const go = useAction(async () => {
    await startScan(profile, { days, limit });
    invalidate(`profiles/${profile.key}/runs`);
    toast.info(`Scanning "${profile.name}" for papers from the last ${daysLabel(days)}.`);
    onClose();
  });
  return (
    <Dialog
      open={open}
      title={`Scan "${profile.name}" now`}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon="play" onClick={() => go.run()} loading={go.busy} disabled={!daysOk || !limitOk} title={daysOk && limitOk ? undefined : 'Days 1–365, papers 1–5000'}>Start scan</Button></>}
    >
      <div className="stack">
        <p>Radar will query OpenAlex for recent papers on this {TERMS.interest}'s topics, score them, and add the results to your feed. This usually takes a few minutes.</p>
        <div className="row" style={{ gap: 12 }}>
          <Field label="Look back (days)"><NumberInput integer min={1} max={365} value={days} onChange={setDays} onValidity={setDaysOk} /></Field>
          <Field label="Max papers to fetch"><NumberInput integer min={1} max={5000} step={50} value={limit} onChange={setLimit} onValidity={setLimitOk} /></Field>
        </div>
        {go.error && <ErrorBox compact message={go.error} />}
        <Callout tone="info">You can leave this page; progress shows at the top of every screen.</Callout>
      </div>
    </Dialog>
  );
}

/** "Built from the profile of X", when the interest came from a stored researcher. */
function DeleteInterestButton({ profile, busy }: { profile: Profile; busy: boolean }) {
  const [deleting, setDeleting] = useState(false);
  async function remove() {
    const ok = await confirmDialog({
      title: `Delete ${TERMS.interest} "${profile.name}"?`,
      body: (
        <p>
          Its {plural(profile.seeds, 'seed')}, its stored papers and their scores, your saves and dismissals for it, and its scan history are all removed.
          The papers stay in your vault if anything else holds them (an upload, a {TERMS.profile}, another {TERMS.interest}). This cannot be undone.
        </p>
      ),
      confirmLabel: `Delete ${TERMS.interest}`,
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteProfile(profile.key);
      if (getDraft().slug === profile.key) resetDraft();
      navigate(paths.interests, { replace: true, force: true });
      // Next tick: the interest's page has unmounted by then.
      setTimeout(() => afterProfileDeleted(profile.key), 0);
      toast.success(`Deleted "${profile.name}".`);
    } catch (e) {
      toast.error(`Couldn't delete it: ${errorMessage(e)}`);
      setDeleting(false);
    }
  }
  return (
    <Button variant="danger" icon="trash" onClick={remove} loading={deleting} disabled={busy || deleting}
      title={busy ? 'Wait for the running scan to finish' : `Delete this ${TERMS.interest}`}>
      Delete
    </Button>
  );
}

function BuiltFrom({ id }: { id: number }) {
  const { data: researchers } = useResearchers();
  const r = researchers?.find((x) => x.id === id);
  if (!r) return null;
  return <> · Built from the {TERMS.profile} of <Link href={paths.profile(r.id)}>{r.name}</Link></>;
}
