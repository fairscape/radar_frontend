import { useEffect, useMemo, useRef, useState } from 'react';
import { IconSoft } from '../../components/soft/IconSoft';
import { swatchFor, useDailyRadar, useProfiles } from '../../lib/apiSwitch';
import { gatherNow, listProfileRuns } from '../../api/endpoints/profiles';
import type { Card, CardState, Profile } from '../../types/radar';

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

function RCard({
  card,
  profile,
  expanded,
  onToggle,
  state,
  onSave,
  onDismiss,
}: {
  card: Card;
  profile: Profile;
  expanded: boolean;
  onToggle: () => void;
  state: CardState;
  onSave: () => void;
  onDismiss: () => void;
}) {
  const bucketClass = card.bucket === 'medium' ? 'med' : card.bucket;
  const bucketLabel =
    card.bucket === 'high' ? 'High match' : card.bucket === 'medium' ? 'Medium match' : 'Low match';
  return (
    <div className={`r-card ${state === 'saved' ? 'saved' : ''} ${state === 'dismissed' ? 'dismissed' : ''}`}>
      <div className="r-row1">
        <span className="r-badge profile">
          <span className="d" style={{ background: swatchFor(profile.hue) }} />
          {profile.name}
        </span>
        <span className={`r-badge bucket ${bucketClass}`}>{bucketLabel}</span>
        <span className="r-score">match <b>{Math.round(card.score * 100)}%</b></span>
      </div>
      <div className="r-title" onClick={onToggle}>{card.title}</div>
      <div className="r-authors">
        {card.authors.join(', ')} <span className="venue">· {card.venue} · {card.date}</span>
      </div>
      <div className="r-meta">
        {card.doi ? <a>doi:{card.doi}</a> : <span>no DOI · {card.openalex}</span>}
        <span>≈ {card.mins} min read</span>
      </div>
      {expanded && <div className="r-abstract">{card.abstract}</div>}
      <div className="r-actions">
        <button className={`r-act save ${state === 'saved' ? 'on' : ''}`} onClick={onSave}>
          <IconSoft name="bookmark" size={14} /> {state === 'saved' ? 'Saved' : 'Save to Vault'}
        </button>
        <button className="r-act dismiss" onClick={onDismiss}>
          <IconSoft name="x" size={14} /> {state === 'dismissed' ? 'Dismissed' : 'Dismiss'}
        </button>
        <button className="r-act-link" onClick={onToggle}>
          {expanded ? 'Hide abstract' : 'Show abstract'}
          <IconSoft name="chev" size={14} />
        </button>
      </div>
    </div>
  );
}

export function RadarViewSoft({ onNewProfile }: { onNewProfile?: () => void } = {}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['c1']));
  const [filter, setFilter] = useState<string>('all');

  const { profiles } = useProfiles();
  const profileByKey = useMemo(
    () => Object.fromEntries(profiles.map((p) => [p.key, p])),
    [profiles],
  );

  const { data, loading, error, save, dismiss, refresh } = useDailyRadar({
    profile: filter,
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
    if (pullProfile === '' && profiles.length > 0) setPullProfile(profiles[0].key);
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

  const cards = data?.cards ?? [];
  const states = data?.states ?? {};
  // Saved + dismissed cards leave the radar (already triaged).
  const inbox = cards.filter(
    (c) => states[c.id] !== 'saved' && states[c.id] !== 'dismissed',
  );
  const stats = {
    total: inbox.length,
    high: inbox.filter((c) => c.bucket === 'high').length,
    med: inbox.filter((c) => c.bucket === 'medium').length,
    saved: Object.values(states).filter((s) => s === 'saved').length,
  };

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const allCardsCount = inbox.length;

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <h1>Today's radar</h1>
          <div className="sub">
            {data?.date ?? '—'} · {inbox.length} new papers matched your profiles
          </div>
        </div>
        <div className="actions">
          <button
            className="btn ghost"
            type="button"
            onClick={() => refresh()}
          >
            Refresh
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={() => setPullOpen((o) => !o)}
            disabled={profiles.length === 0}
          >
            {pullStatus.phase === 'running' ? (
              <>
                <span className="run-spinner" />
                {stepLabel(pullStatus.step)}
                {pullStatus.nTotal != null && pullStatus.nProcessed != null
                  ? ` ${pullStatus.nProcessed}/${pullStatus.nTotal}`
                  : '…'}
              </>
            ) : (
              <>
                <IconSoft name="plus" size={14} /> Pull papers
              </>
            )}
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={onNewProfile}
          >
            <IconSoft name="plus" size={14} /> New profile
          </button>
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
              run #{pullStatus.runId} finished · fetched {pullStatus.nFetched ?? 0} ·{' '}
              {pullStatus.nNew ?? 0} new
            </div>
          )}
          {pullStatus.phase === 'error' && (
            <div className="pull-status err">
              gather failed: {pullStatus.message}
            </div>
          )}
        </div>
      )}

      <div className="tiles">
        <div className="tile">
          <div className="k">New today</div>
          <div className="v">{stats.total}</div>
          <div className="d">across {profiles.length} profiles</div>
        </div>
        <div className="tile">
          <div className="k">High match</div>
          <div className="v green">{stats.high}</div>
          <div className="d">worth a closer look</div>
        </div>
        <div className="tile">
          <div className="k">Medium match</div>
          <div className="v gold">{stats.med}</div>
          <div className="d">scan titles first</div>
        </div>
        <div className="tile">
          <div className="k">Saved today</div>
          <div className="v dim">{stats.saved}</div>
          <div className="d">added to your vault</div>
        </div>
      </div>

      <div className="pills">
        <div className={`pill ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
          All profiles <span className="n">{allCardsCount}</span>
        </div>
        {profiles.map((p) => (
          <div
            key={p.key}
            className={`pill ${filter === p.key ? 'on' : ''}`}
            onClick={() => setFilter(p.key)}
          >
            <span className="d" style={{ background: swatchFor(p.hue) }} />
            {p.name}
          </div>
        ))}
      </div>

      {error && cards.length === 0 && (
        <div className="empty" style={{ color: 'var(--err)' }}>
          Couldn’t load today’s radar.{' '}
          <button
            type="button"
            className="btn ghost"
            style={{ marginLeft: 8, padding: '2px 10px' }}
            onClick={refresh}
          >
            Retry
          </button>
        </div>
      )}
      {!error && loading && inbox.length === 0 && <div className="empty">Loading today's radar…</div>}
      {!error && !loading && inbox.length === 0 && (
        <div className="empty">
          {cards.length === 0
            ? 'No papers match this filter.'
            : 'Inbox zero — everything has been triaged.'}
        </div>
      )}
      {inbox.map((c) => {
        const profile = profileByKey[c.profile];
        if (!profile) return null;
        return (
          <RCard
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
  );
}
