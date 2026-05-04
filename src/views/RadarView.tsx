import { useEffect, useMemo, useRef, useState } from 'react';
import { TopBar } from '../components/TopBar';
import { Chip } from '../components/Chip';
import { Card } from './radar/Card';
import { useDailyRadar, useProfiles } from '../lib/apiSwitch';
import { gatherNow, listProfileRuns } from '../api/endpoints/profiles';
import type { Bucket } from '../types/radar';

const STEP_LABEL: Record<string, string> = {
  loading_profile: 'Loading profile',
  fetching: 'Querying OpenAlex',
  embedding: 'Embedding candidates',
  persisting: 'Saving results',
  done: 'Done',
};

function stepLabel(step: string | null): string {
  if (!step) return 'Working';
  return STEP_LABEL[step] ?? step;
}

export function RadarView() {
  const [profFilter, setProfFilter] = useState<string>('all');
  const [bucketFilter, setBucketFilter] = useState<'all' | Bucket>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['c1', 'c2']));

  const { profiles } = useProfiles();
  const profileByKey = useMemo(
    () => Object.fromEntries(profiles.map((p) => [p.key, p])),
    [profiles],
  );

  const { data, loading, save, dismiss, refresh } = useDailyRadar({
    profile: profFilter,
    bucket: bucketFilter === 'all' ? undefined : bucketFilter,
  });

  const [pullOpen, setPullOpen] = useState(false);
  const [pullProfile, setPullProfile] = useState<string>('');
  const [pullDays, setPullDays] = useState<number>(7);
  const [pullLimit, setPullLimit] = useState<number>(500);
  const [pullStatus, setPullStatus] = useState<
    | { phase: 'idle' }
    | {
        phase: 'running';
        runId: number;
        profileKey: string;
        startedAt: number;
        step: string | null;
        nProcessed: number | null;
        nTotal: number | null;
        message: string | null;
      }
    | { phase: 'done'; runId: number; nFetched: number | null; nNew: number | null }
    | { phase: 'error'; message: string }
  >({ phase: 'idle' });
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (pullProfile === '' && profiles.length > 0) {
      setPullProfile(profiles[0].key);
    }
  }, [profiles, pullProfile]);

  useEffect(() => () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPull = async () => {
    if (!pullProfile) return;
    setPullStatus({ phase: 'idle' });
    try {
      const { run_id } = await gatherNow(pullProfile, {
        days: pullDays,
        limit: pullLimit,
      });
      setPullStatus({
        phase: 'running',
        runId: run_id,
        profileKey: pullProfile,
        startedAt: Date.now(),
        step: null,
        nProcessed: null,
        nTotal: null,
        message: null,
      });
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        try {
          const runs = await listProfileRuns(pullProfile, 10);
          const row = runs.find((r) => r.id === run_id);
          if (!row) return;
          if (row.finished_at) {
            if (pollRef.current) {
              window.clearInterval(pollRef.current);
              pollRef.current = null;
            }
            if (row.error) {
              setPullStatus({ phase: 'error', message: row.error });
            } else {
              setPullStatus({
                phase: 'done',
                runId: run_id,
                nFetched: row.n_fetched,
                nNew: row.n_new,
              });
              refresh();
            }
          } else {
            // Still running — surface live progress so the user sees
            // the step + counter advance instead of a static spinner.
            setPullStatus((prev) =>
              prev.phase === 'running' && prev.runId === run_id
                ? {
                    ...prev,
                    step: row.current_step,
                    nProcessed: row.n_processed,
                    nTotal: row.n_total,
                    message: row.last_message,
                  }
                : prev,
            );
          }
        } catch (e) {
          if (pollRef.current) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setPullStatus({
            phase: 'error',
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }, 2500);
    } catch (e) {
      setPullStatus({
        phase: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const cards = data?.cards ?? [];
  const states = data?.states ?? {};
  // Once a card is saved or dismissed it leaves the radar — the user has
  // already triaged it. Stats reflect what's left to review (saved /
  // dismissed counts come from the states map regardless).
  const inbox = cards.filter(
    (c) => states[c.id] !== 'saved' && states[c.id] !== 'dismissed',
  );
  const stats = {
    total: inbox.length,
    high: inbox.filter((c) => c.bucket === 'high').length,
    med: inbox.filter((c) => c.bucket === 'medium').length,
    low: inbox.filter((c) => c.bucket === 'low').length,
    saved: Object.values(states).filter((s) => s === 'saved').length,
    dismissed: Object.values(states).filter((s) => s === 'dismissed').length,
  };

  const rightChips = (
    <>
      <Chip
        label="PROFILE"
        value={profFilter === 'all' ? 'ALL' : profileByKey[profFilter]?.name ?? profFilter}
        onClick={() => {
          const keys = ['all', ...profiles.map((p) => p.key)];
          const i = keys.indexOf(profFilter);
          setProfFilter(keys[(i + 1) % keys.length]);
        }}
      />
      <Chip
        label="BUCKET"
        value={bucketFilter.toUpperCase()}
        onClick={() => {
          const opts: Array<'all' | Bucket> = ['all', 'high', 'medium', 'low'];
          setBucketFilter(opts[(opts.indexOf(bucketFilter) + 1) % opts.length]);
        }}
      />
      <Chip label="SORT" value="SCORE ↓" />
    </>
  );

  return (
    <div className="view">
      <TopBar crumbs={['Radar', 'Daily', data?.date ?? '…']} right={rightChips} />
      <div className="radar-head">
        <div>
          <div className="rh-title">
            <h1>Daily Radar</h1>
            <span className="date mono">{data?.date ?? '—'}</span>
          </div>
          <div className="rh-sub">
            <b>{inbox.length}</b> cards &nbsp;/&nbsp; from <b>{profiles.length}</b> profiles &nbsp;/&nbsp;
            <b>{(data?.candidatesScored ?? 0).toLocaleString()}</b> candidates scored &nbsp;/&nbsp;
            fetched <b>{data?.fetchedAt ?? '—'}</b>&nbsp;·&nbsp;{data?.fetchMs ?? 0}s
          </div>
        </div>
        <div className="rh-stats">
          <div className="rh-stat"><span className="k">Total</span><span className="v num">{stats.total}</span></div>
          <div className="rh-stat"><span className="k">High</span><span className="v num high">{stats.high}</span></div>
          <div className="rh-stat"><span className="k">Med</span><span className="v num med">{stats.med}</span></div>
          <div className="rh-stat"><span className="k">Low</span><span className="v num low">{stats.low}</span></div>
          <div className="rh-stat"><span className="k">Saved</span><span className="v num">{stats.saved}</span></div>
          <div className="rh-stat"><span className="k">Trashed</span><span className="v num">{stats.dismissed}</span></div>
          <div className="rh-stat" style={{ justifyContent: 'flex-end', alignItems: 'flex-end' }}>
            <button
              type="button"
              className="pull-btn"
              onClick={() => setPullOpen((o) => !o)}
              disabled={profiles.length === 0}
              title={profiles.length === 0 ? 'No profiles available' : 'Gather new papers for a profile'}
            >
              {pullStatus.phase === 'running' ? (
                <>
                  <span className="run-spinner" />
                  {stepLabel(pullStatus.step).toUpperCase()}
                  {pullStatus.nTotal != null && pullStatus.nProcessed != null
                    ? ` ${pullStatus.nProcessed}/${pullStatus.nTotal}`
                    : '…'}
                </>
              ) : (
                '+ PULL PAPERS'
              )}
            </button>
          </div>
        </div>
      </div>

      {pullOpen && (
        <div className="pull-panel">
          <div className="pull-row">
            <label className="pull-lbl">PROFILE</label>
            <select
              className="pull-select"
              value={pullProfile}
              onChange={(e) => setPullProfile(e.target.value)}
              disabled={pullStatus.phase === 'running'}
            >
              {profiles.map((p) => (
                <option key={p.key} value={p.key}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="pull-row">
            <label className="pull-lbl">WINDOW · DAYS</label>
            <input
              className="pull-input num"
              type="number"
              min={1}
              max={365}
              value={pullDays}
              onChange={(e) => setPullDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
              disabled={pullStatus.phase === 'running'}
            />
          </div>
          <div className="pull-row">
            <label className="pull-lbl">MAX PAPERS</label>
            <input
              className="pull-input num"
              type="number"
              min={1}
              max={5000}
              step={50}
              value={pullLimit}
              onChange={(e) => setPullLimit(Math.max(1, Math.min(5000, Number(e.target.value) || 1)))}
              disabled={pullStatus.phase === 'running'}
            />
          </div>
          <div className="pull-actions">
            <button
              type="button"
              className="pull-go"
              onClick={startPull}
              disabled={!pullProfile || pullStatus.phase === 'running'}
            >
              {pullStatus.phase === 'running' ? (
                <>
                  <span className="run-spinner" />RUNNING…
                </>
              ) : (
                'GATHER + SCORE'
              )}
            </button>
            <button
              type="button"
              className="pull-cancel"
              onClick={() => setPullOpen(false)}
            >
              CLOSE
            </button>
          </div>
          {pullStatus.phase === 'running' && (
            <div className="pull-status">
              <span className="run-pulse" />
              run #{pullStatus.runId} · {stepLabel(pullStatus.step)}
              {pullStatus.nTotal != null && pullStatus.nProcessed != null
                ? ` (${pullStatus.nProcessed} / ${pullStatus.nTotal})`
                : '…'}
              {pullStatus.message && (
                <div className="pull-status-msg">{pullStatus.message}</div>
              )}
              <div className="run-bar" />
            </div>
          )}
          {pullStatus.phase === 'done' && (
            <div className="pull-status ok">
              run #{pullStatus.runId} finished · fetched {pullStatus.nFetched ?? 0} ·
              {' '}{pullStatus.nNew ?? 0} new
            </div>
          )}
          {pullStatus.phase === 'error' && (
            <div className="pull-status err">
              gather failed: {pullStatus.message}
            </div>
          )}
        </div>
      )}

      <div className="radar-colhead">
        <span>Score</span>
        <span>Profile</span>
        <span>Title · Authors · Abstract</span>
        <span>Identifiers</span>
        <span>Signals</span>
        <span className="right">Actions</span>
      </div>

      <div>
        {loading && inbox.length === 0 && <div className="empty">LOADING DAILY RADAR…</div>}
        {!loading && inbox.length === 0 && (
          <div className="empty">
            {cards.length === 0 ? 'NO CARDS FOR THIS FILTER' : 'INBOX ZERO — ALL TRIAGED'}
          </div>
        )}
        {inbox.map((c) => {
          const profile = profileByKey[c.profile];
          if (!profile) return null;
          return (
            <Card
              key={c.id}
              card={c}
              profile={profile}
              expanded={expanded.has(c.id)}
              onToggle={() => toggle(c.id)}
              state={states[c.id] ?? null}
              onSave={() => save(c.id)}
              onDismiss={() => dismiss(c.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
