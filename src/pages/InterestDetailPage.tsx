import { useEffect, useRef, useState } from 'react';
import { useProfileDetail, useProfileRuns, useProfiles, useResearchers } from '../api/hooks';
import {
  candidateScores,
  getRerankerComparison,
  getTopicYield,
  recomputeCoherence,
  recomputeTopics,
  updateProfileThreshold,
  type GatherRunStatus,
} from '../api/endpoints/profiles';
import { uploadPdf } from '../api/endpoints/vault';
import { errorMessage, fmtDateTime, fmtDuration, fmtRelative, plural } from '../lib/format';
import { startScan, useRunningJob } from '../lib/jobs';
import { useQuery, invalidate } from '../lib/query';
import { navigate, paths } from '../lib/router';
import { TERMS } from '../lib/terms';
import { toast } from '../lib/toast';
import type { Profile } from '../types/radar';
import { Badge, Button, Callout, Dialog, EmptyState, ErrorBox, Field, Icon, Input, LoadingRows, Panel, Stat, Tabs, useAction } from '../ui';
import { Link } from '../ui/Link';
import { CoherenceHistogram, HealthBadge, JobProgress, RerankerBumpChart, SectionNote, ThresholdHistogram, agreementTone, axisFor, healthOf } from '../ui/domain';
import { goToFeedFor } from './FeedPage';

type Tab = 'overview' | 'seeds' | 'topics' | 'threshold' | 'scans' | 'diagnostics';

export function InterestDetailPage({ profileKey }: { profileKey: string }) {
  const { data: profiles, loading: listLoading } = useProfiles();
  const { data: detail, loading, error, refresh } = useProfileDetail(profileKey);
  const [tab, setTab] = useState<Tab>('overview');
  const [scanOpen, setScanOpen] = useState(false);
  const running = useRunningJob('scan', profileKey);
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
          <Button icon="radar" onClick={() => goToFeedFor(profile.key)}>View in feed</Button>
          <Button variant="primary" icon="play" onClick={() => setScanOpen(true)} disabled={!!running} title={running ? 'A scan is already running' : 'Look for new papers now'}>
            {running ? 'Scanning…' : 'Scan now'}
          </Button>
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
          { id: 'diagnostics', label: 'Diagnostics' },
        ]}
      />

      {error && !detail && <ErrorBox message={errorMessage(error)} onRetry={refresh} />}
      {loading && !detail && <LoadingRows rows={4} />}
      {detail && tab === 'overview' && <OverviewTab profile={profile} detail={detail} onScan={() => setScanOpen(true)} />}
      {detail && tab === 'seeds' && <SeedsTab profile={profile} detail={detail} />}
      {detail && tab === 'topics' && <TopicsTab profile={profile} detail={detail} />}
      {detail && tab === 'threshold' && <ThresholdTab profile={profile} onScan={() => setScanOpen(true)} />}
      {tab === 'scans' && <ScansTab profile={profile} onScan={() => setScanOpen(true)} />}
      {detail && tab === 'diagnostics' && <DiagnosticsTab profile={profile} />}

      <ScanDialog profile={profile} open={scanOpen} onClose={() => setScanOpen(false)} />
    </div>
  );
}

type Detail = NonNullable<ReturnType<typeof useProfileDetail>['data']>;

function OverviewTab({ profile, detail, onScan }: { profile: Profile; detail: Detail; onScan: () => void }) {
  const { data: runs } = useProfileRuns(profile.key, 5);
  // Trial scans from the wizard share the runs table; they are not real scans.
  const last = runs?.find((r) => r.finished_at && r.tier_used !== 'dry-run');
  return (
    <div className="two-col">
      <Panel title="How this interest works">
        <div className="stack" style={{ fontSize: 13.5, color: 'var(--fg-2)' }}>
          <p>Radar queries OpenAlex for <b>{detail.topics.filter((t) => t.on).length}</b> topics and scores each new paper by how similar it is to your <b>{detail.seeds.length}</b> seed papers. Anything at or above <b>{profile.threshold.toFixed(3)}</b> reaches the feed{profile.seedSimMin != null && <>; papers at <b>{profile.seedSimMin.toFixed(3)}</b> or more are as close as your own seeds</>}.</p>
          <p>Scans run automatically every day at 04:00 UTC. You can also start one any time.</p>
          <p>Saving or dismissing a paper in the feed is recorded as feedback for this {TERMS.interest} and used when it is refit.</p>
        </div>
      </Panel>
      <Panel title="Recent activity" actions={<Button size="sm" icon="play" onClick={onScan}>Scan now</Button>}>
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

function SeedsTab({ profile, detail }: { profile: Profile; detail: Detail }) {
  const health = healthOf(profile);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const recompute = useAction(async () => {
    await Promise.all([recomputeCoherence(profile.key), recomputeTopics(profile.key)]);
    toast.success('Coherence and topics recomputed.');
  });

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setFailures([]);
    let ok = 0;
    for (let i = 0; i < list.length; i++) {
      setProgress({ done: i, total: list.length, current: list[i].name });
      try {
        await uploadPdf(list[i], profile.key);
        ok += 1;
      } catch (e) {
        setFailures((f) => [...f, `${list[i].name}: ${errorMessage(e)}`]);
      }
    }
    setProgress(null);
    if (ok > 0) toast.success(`${plural(ok, 'seed')} added. Recompute to update coherence and topics.`);
  }

  return (
    <div className="two-col">
      <Panel title="Seed papers" description="What this interest is made of." actions={<Button size="sm" icon="refresh" onClick={() => recompute.run()} loading={recompute.busy} title="Recompute coherence and topics from the current seeds">Recompute</Button>}>
        {recompute.error && <ErrorBox compact message={recompute.error} />}
        {detail.seeds.length === 0 ? <p className="muted small">No seeds recorded.</p> : detail.seeds.map((s) => (
          <div className="seed-row" key={s.id}>
            <span className="idx">{String(s.idx).padStart(2, '0')}</span>
            <span className="truncate" title={s.title}>{s.title}</span>
            <span className="muted mono small">{s.year || ''}</span>
            <span className="mono small" title="How similar this seed is to the other seeds (leave-one-out). The lowest values are the least typical papers." style={{ color: s.coh > 0 && profile.seedSimMin != null && s.coh <= profile.seedSimMin + 1e-6 && profile.seedSimMax != null && profile.seedSimMax - profile.seedSimMin > 0.02 ? 'var(--warn)' : 'var(--fg-3)' }}>
              {s.coh > 0 ? s.coh.toFixed(3) : '—'}
            </span>
          </div>
        ))}
        <div
          className={`dropzone ${over ? 'over' : ''} ${progress ? 'busy' : ''}`}
          style={{ marginTop: 14 }}
          onClick={() => !progress && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void upload(e.dataTransfer.files); }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        >
          <Icon name="upload" />
          {progress ? <span>Uploading {progress.done + 1} of {progress.total}: <b>{progress.current}</b></span> : <span><b>Add seed PDFs</b> — drop files here or click to browse</span>}
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
        </div>
        {failures.length > 0 && <ErrorBox compact title="Some files failed" message={failures.map((f) => <div key={f}>{f}</div>)} />}
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
    <Panel title="Topics" description="What Radar asks OpenAlex for. Aggregated from the seeds; chosen when the interest was created.">
      <SectionNote>Topic selection is fixed after setup. To change it, recompute topics after adding seeds, or create a new {TERMS.interest}.</SectionNote>
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
                  <td>{t.name} <span className="muted mono small">{t.id}</span></td>
                  <td><Badge>{t.source === 'umls' ? 'UMLS' : 'OpenAlex'}</Badge></td>
                  <td className="r">{t.count}</td>
                  <td>{t.on ? <Badge tone="ok">Queried</Badge> : <Badge>Off</Badge>}</td>
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
  );
}

function ThresholdTab({ profile, onScan }: { profile: Profile; onScan: () => void }) {
  const scoresQ = useQuery(`profiles/${profile.key}/scores`, () => candidateScores(profile.key));
  const [value, setValue] = useState<number>(profile.threshold);
  useEffect(() => setValue(profile.threshold), [profile.threshold, profile.key]);
  const band = scoresQ.data?.seed_similarity ?? (profile.seedSimMin != null && profile.seedSimMax != null ? { min: profile.seedSimMin, median: (profile.seedSimMin + profile.seedSimMax) / 2, max: profile.seedSimMax } : null);
  const suggested = scoresQ.data?.suggested_threshold ?? null;
  const [axisLo, axisHi] = axisFor(scoresQ.data?.scores ?? [], band, scoresQ.data?.score_range ?? null);
  const save = useAction(async () => {
    await updateProfileThreshold(profile.key, Number(value.toFixed(3)));
    toast.success(`Threshold saved as ${value.toFixed(2)}.`);
  });
  const dirty = Math.abs(value - profile.threshold) > 0.0005;
  return (
    <Panel
      title="Threshold"
      description="The similarity a paper needs to reach your feed. The shaded band is where your own seed papers score; the suggested value sits just below it. Move the bar to see how many already-gathered papers would clear it."
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => setValue(profile.threshold)} disabled={!dirty}>Reset</Button>
          <Button size="sm" variant="primary" onClick={() => save.run()} loading={save.busy} disabled={!dirty}>Save threshold</Button>
        </>
      }
    >
      {save.error && <ErrorBox compact message={save.error} />}
      {scoresQ.error && <ErrorBox compact message={errorMessage(scoresQ.error)} onRetry={scoresQ.refresh} />}
      {scoresQ.loading && <LoadingRows rows={3} />}
      {scoresQ.data && scoresQ.data.scores.length === 0 && (
        <EmptyState compact icon="radar" title="No gathered papers to calibrate against" body="Run a scan first, then come back to tune the threshold." action={<Button icon="play" onClick={onScan}>Scan now</Button>} />
      )}
      {scoresQ.data && scoresQ.data.scores.length > 0 && (
        <>
          {suggested != null && Math.abs(suggested - value) > 0.0005 && (
            <div className="row" style={{ marginBottom: 10 }}>
              <span className="small muted">Suggested for these seeds: <b className="mono">{suggested.toFixed(3)}</b></span>
              <Button size="sm" variant="ghost" onClick={() => setValue(suggested)}>Use suggested</Button>
            </div>
          )}
          <ThresholdHistogram scores={scoresQ.data.scores} value={value} min={axisLo} max={axisHi} onChange={setValue} reference={profile.threshold} seedBand={band} suggested={suggested} periodLabel="of gathered papers would pass" />
        </>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <Field label="Exact value" inline>
          <Input type="number" min={0} max={1} step={0.001} value={value} onChange={(e) => setValue(Math.max(0, Math.min(1, Number(e.target.value) || 0)))} style={{ width: 110 }} />
        </Field>
      </div>
    </Panel>
  );
}

function ScansTab({ profile, onScan }: { profile: Profile; onScan: () => void }) {
  const { data: runs, loading, error, refresh } = useProfileRuns(profile.key, 30);
  return (
    <Panel title="Scans" description="Every gather pass for this interest, newest first. Scheduled scans run daily at 04:00 UTC." actions={<Button size="sm" icon="play" onClick={onScan}>Scan now</Button>} className="panel-flush">
      <div style={{ padding: '0 18px 12px' }}>
        {error && !runs && <ErrorBox compact message={errorMessage(error)} onRetry={refresh} />}
        {loading && !runs && <LoadingRows rows={3} />}
        {runs && runs.length === 0 && <EmptyState compact icon="clock" title="No scans yet" body="The first scheduled scan runs at 04:00 UTC, or start one now." />}
        {runs && runs.length > 0 && (
          <table className="table">
            <thead><tr><th>Started</th><th title="Which OpenAlex query tier the gatherer used">Tier</th><th>Status</th><th className="r">Fetched</th><th className="r">New</th><th className="r">Duration</th></tr></thead>
            <tbody>
              {runs.map((r) => <RunRow key={r.id} run={r} />)}
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}

function RunRow({ run }: { run: GatherRunStatus }) {
  const status = run.error ? <Badge tone="err">Failed</Badge> : run.finished_at ? <Badge tone="ok">Done</Badge> : <Badge tone="info" dot>Running</Badge>;
  return (
    <tr>
      <td className="nowrap" title={run.started_at}>{fmtDateTime(run.started_at)}</td>
      <td className="muted">{run.tier_used ?? '—'}</td>
      <td>{status}{run.error && <div className="small" style={{ color: 'var(--err)', maxWidth: 360 }}>{run.error}</div>}</td>
      <td className="r">{run.n_fetched ?? '—'}</td>
      <td className="r">{run.n_new ?? '—'}</td>
      <td className="r">{fmtDuration(run.started_at, run.finished_at)}</td>
    </tr>
  );
}

function DiagnosticsTab({ profile }: { profile: Profile }) {
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
            <div className="row-wrap small muted" style={{ marginBottom: 10 }}>
              <span>Queries:</span>
              {rr.data.queries_used.map((q) => <Badge key={q}>{q}</Badge>)}
            </div>
          )}
          <RerankerBumpChart candidates={rr.data.candidates} n={rr.data.n} />
        </>
      )}
    </Panel>
  );
}

function ScanDialog({ profile, open, onClose }: { profile: Profile; open: boolean; onClose: () => void }) {
  const [days, setDays] = useState(7);
  const [limit, setLimit] = useState(500);
  const go = useAction(async () => {
    await startScan(profile, { days, limit });
    invalidate(`profiles/${profile.key}/runs`);
    toast.info(`Scanning "${profile.name}" for papers from the last ${days} days.`);
    onClose();
  });
  return (
    <Dialog
      open={open}
      title={`Scan "${profile.name}" now`}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon="play" onClick={() => go.run()} loading={go.busy}>Start scan</Button></>}
    >
      <div className="stack">
        <p>Radar will query OpenAlex for recent papers on this {TERMS.interest}'s topics, score them, and add the results to your feed. This usually takes a few minutes.</p>
        <div className="row" style={{ gap: 12 }}>
          <Field label="Look back (days)"><Input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))} /></Field>
          <Field label="Max papers to fetch"><Input type="number" min={1} max={5000} step={50} value={limit} onChange={(e) => setLimit(Math.max(1, Math.min(5000, Number(e.target.value) || 1)))} /></Field>
        </div>
        {go.error && <ErrorBox compact message={go.error} />}
        <Callout tone="info">You can leave this page; progress shows at the top of every screen.</Callout>
      </div>
    </Dialog>
  );
}

/** "Built from the profile of X", when the interest came from a stored researcher. */
function BuiltFrom({ id }: { id: number }) {
  const { data: researchers } = useResearchers();
  const r = researchers?.find((x) => x.id === id);
  if (!r) return null;
  return <> · Built from the {TERMS.profile} of <Link href={paths.profile(r.id)}>{r.name}</Link></>;
}
