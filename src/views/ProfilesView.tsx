import { useEffect, useState } from 'react';
import { TopBar } from '../components/TopBar';
import { Chip } from '../components/Chip';
import { ThresholdHistogram } from '../components/ThresholdHistogram';
import {
  dryRunProfile,
  swatchFor,
  updateProfileThreshold,
  useProfiles,
  useProfileDetail,
} from '../lib/apiSwitch';
import {
  recomputeCoherence,
  recomputeTopics,
  type DryRunResult,
} from '../api/endpoints/profiles';

export function ProfilesView({
  selected,
  setSelected,
  onNew,
}: {
  selected: string;
  setSelected: (k: string) => void;
  onNew?: () => void;
}) {
  const { profiles, refresh: refreshList } = useProfiles();
  const { detail, loading, refresh: refreshDetail } = useProfileDetail(selected);
  const active = detail?.profile ?? profiles.find((p) => p.key === selected) ?? profiles[0];
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeError, setRecomputeError] = useState<string | null>(null);
  const [dry, setDry] = useState<DryRunResult | null>(null);
  const [dryRunning, setDryRunning] = useState(false);
  const [dryError, setDryError] = useState<string | null>(null);
  // ``calibTh`` follows ``active.threshold`` until the user drags the
  // slider, then stays put so they can compare. Edits to the saved θ
  // (via the inline-edit UI) reset it back in sync.
  const [calibTh, setCalibTh] = useState<number | null>(null);
  const [thrEditing, setThrEditing] = useState(false);
  const [thrInput, setThrInput] = useState('');
  const [thrSaving, setThrSaving] = useState(false);
  const [thrError, setThrError] = useState<string | null>(null);

  // Drop any stale dry-run + edit state when the selected profile changes.
  useEffect(() => {
    setDry(null);
    setDryError(null);
    setCalibTh(null);
    setThrEditing(false);
    setThrError(null);
  }, [active?.key]);

  const onRecompute = async () => {
    if (!active?.key) return;
    setRecomputing(true);
    setRecomputeError(null);
    try {
      await Promise.all([
        recomputeCoherence(active.key),
        recomputeTopics(active.key),
      ]);
      refreshDetail();
      refreshList();
    } catch (e) {
      setRecomputeError(e instanceof Error ? e.message : String(e));
    } finally {
      setRecomputing(false);
    }
  };

  const onDryRun = async () => {
    if (!active?.key) return;
    setDryRunning(true);
    setDryError(null);
    try {
      const result = await dryRunProfile(active.key);
      setDry(result);
    } catch (e) {
      setDryError(e instanceof Error ? e.message : String(e));
    } finally {
      setDryRunning(false);
    }
  };

  const onSaveThreshold = async () => {
    if (!active?.key) return;
    const next = Number(thrInput);
    if (!Number.isFinite(next) || next < 0 || next > 1) {
      setThrError('θ must be between 0 and 1');
      return;
    }
    setThrSaving(true);
    setThrError(null);
    try {
      await updateProfileThreshold(active.key, next);
      setThrEditing(false);
      setCalibTh(null);
      refreshDetail();
      refreshList();
    } catch (e) {
      setThrError(e instanceof Error ? e.message : String(e));
    } finally {
      setThrSaving(false);
    }
  };

  const sliderTh = calibTh ?? active?.threshold ?? 0;

  return (
    <div className="view">
      <TopBar
        crumbs={['Profiles', active?.name ?? '…']}
        right={
          <>
            <Chip label="VIEW" value="DETAIL" />
            <Chip label="SELECTOR" value="CENTROID" />
          </>
        }
      />
      <div className="prof-grid">
        <div className="prof-list">
          <div className="prof-list-head">
            <span>Profiles · {profiles.length}</span>
            <button
              type="button"
              className="btn-new"
              onClick={onNew}
            >
              + NEW
            </button>
          </div>
          {profiles.length === 0 && (
            <div
              className="empty mono"
              style={{ padding: '24px 16px', fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.06em' }}
            >
              NO PROFILES YET — CLICK <b style={{ color: 'var(--fg)' }}>+ NEW</b> TO CREATE ONE
            </div>
          )}
          {profiles.map((p) => (
            <div
              key={p.key}
              className={`prof-item ${p.key === active?.key ? 'active' : ''}`}
              onClick={() => setSelected(p.key)}
            >
              <div className="name">
                <span className="swatch" style={{ background: swatchFor(p.hue) }} />
                {p.name}
                {p.isDraft && (
                  <span
                    className="mono"
                    style={{
                      marginLeft: 6,
                      fontSize: 9,
                      letterSpacing: '0.12em',
                      padding: '1px 5px',
                      border: '1px solid var(--line-strong)',
                      color: 'var(--fg-3)',
                    }}
                  >
                    DRAFT
                  </span>
                )}
              </div>
              <div className={`health ${p.health === 'warn' ? 'ok' : p.health}`}>
                {p.isDraft
                  ? 'IN PROGRESS'
                  : p.health === 'err'
                  ? 'LOW COH.'
                  : 'HEALTHY'}
              </div>
              <div className="meta">
                <span>SEEDS <b>{p.seeds}</b></span>
                <span>θ <b className="num">{p.threshold.toFixed(2)}</b></span>
                <span>COH <b className="num">{p.coherence.toFixed(2)}</b></span>
                <span>S/D <b className="num">{p.saves30}/{p.dismisses30}</b></span>
              </div>
            </div>
          ))}
        </div>

        <div className="prof-detail">
          {profiles.length === 0 && !loading && (
            <div className="empty">NO PROFILE SELECTED — CREATE ONE TO SEE DETAILS</div>
          )}
          {loading && !detail && profiles.length > 0 && <div className="empty">LOADING PROFILE DETAIL…</div>}
          {active && detail && (
            <>
              <div className="pd-head">
                <div>
                  <h2>
                    <span className="swatch" style={{ background: swatchFor(active.hue) }} />
                    {active.name}
                  </h2>
                  <div className="sub mono">
                    selector <b style={{ color: 'var(--fg)' }}>CentroidSelector</b> · model{' '}
                    <span className="dim">allenai/specter2 · proximity · pinned sha256 : 4a2f…e19b</span>
                  </div>
                  <div className="sub mono">
                    created 2024-07-12 · last refit 2026-03-28 · fit cost{' '}
                    <span className="dim">2.84 s · 14 vecs</span>
                  </div>
                </div>
                <div className="pd-actions">
                  <button
                    className="btn"
                    onClick={onRecompute}
                    disabled={recomputing}
                    title="Re-aggregate topics and recompute coherence from current seeds"
                  >
                    {recomputing ? 'RECOMPUTING…' : 'RECOMPUTE'}
                  </button>
                  <button
                    className="btn"
                    onClick={onDryRun}
                    disabled={dryRunning}
                    title="Pull persisted candidate scores and render the threshold histogram"
                  >
                    {dryRunning ? 'DRY-RUN…' : 'DRY-RUN'}
                  </button>
                </div>
              </div>

              {recomputeError && (
                <div
                  className="mono"
                  style={{
                    margin: '8px 0',
                    padding: 8,
                    color: 'var(--err)',
                    background: 'color-mix(in oklab, var(--bg-0), var(--err) 4%)',
                    borderLeft: '2px solid var(--err)',
                    fontSize: 11,
                  }}
                >
                  RECOMPUTE FAILED: {recomputeError}
                </div>
              )}

              <div className="section">
                <h3>
                  Selector Diagnostics <span className="hr" />
                </h3>
                <div className="health-grid">
                  <div className="hg-cell">
                    <div className="k">Coherence · median</div>
                    <div
                      className={`v ${
                        active.coherence < 0.60 ? 'err' : active.coherence < 0.70 ? 'warn' : 'ok'
                      }`}
                    >
                      {active.coherence.toFixed(2)}
                    </div>
                    <div className="d">
                      IQR 0.12 ·{' '}
                      <span className={active.coherence > 0.7 ? 'up' : 'down'}>
                        {active.coherence > 0.7 ? 'tight' : 'loose'}
                      </span>
                    </div>
                  </div>
                  <div className="hg-cell">
                    <div className="k">Threshold · θ</div>
                    {thrEditing ? (
                      <div className="v-edit">
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.01}
                          value={thrInput}
                          autoFocus
                          onChange={(e) => setThrInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onSaveThreshold();
                            if (e.key === 'Escape') {
                              setThrEditing(false);
                              setThrError(null);
                            }
                          }}
                        />
                        <button
                          className="save"
                          onClick={onSaveThreshold}
                          disabled={thrSaving}
                        >
                          {thrSaving ? 'SAVING…' : 'SAVE'}
                        </button>
                        <button
                          className="cancel"
                          onClick={() => {
                            setThrEditing(false);
                            setThrError(null);
                          }}
                        >
                          CANCEL
                        </button>
                      </div>
                    ) : (
                      <div
                        className="v num editable"
                        title="Click to edit"
                        onClick={() => {
                          setThrInput(active.threshold.toFixed(2));
                          setThrEditing(true);
                          setThrError(null);
                        }}
                      >
                        {active.threshold.toFixed(2)}
                      </div>
                    )}
                    <div className="d">
                      {thrError ? (
                        <span className="down">{thrError}</span>
                      ) : (
                        <>click value to edit</>
                      )}
                    </div>
                  </div>
                  <div className="hg-cell">
                    <div className="k">Centroid drift</div>
                    <div className="v num">0.024</div>
                    <div className="d">
                      vs. creation · <span className="up">stable</span>
                    </div>
                  </div>
                  <div className="hg-cell">
                    <div className="k">Save rate · 30d</div>
                    <div className="v num">
                      {((active.saves30 / (active.saves30 + active.dismisses30)) * 100).toFixed(0)}%
                    </div>
                    <div className="d">
                      {active.saves30}/{active.saves30 + active.dismisses30} ·{' '}
                      <span className="up">+4 pp</span>
                    </div>
                  </div>
                  <div className="hg-cell">
                    <div className="k">Prec@10 · 30d</div>
                    <div className="v num">0.71</div>
                    <div className="d">7/10 saved in top-10</div>
                  </div>
                  <div className="hg-cell">
                    <div className="k">Recall · tagged vault</div>
                    <div className="v num">0.84</div>
                    <div className="d">126/150 retrospective</div>
                  </div>
                  <div className="hg-cell">
                    <div className="k">Wall · select avg</div>
                    <div className="v num">312 ms</div>
                    <div className="d">≈ 1,240 candidates/run</div>
                  </div>
                  <div className="hg-cell">
                    <div className="k">Fetches since refit</div>
                    <div className="v num">19</div>
                    <div className="d">81 saves logged</div>
                  </div>
                </div>
              </div>

              <div className="section">
                <h3>
                  Pairwise Cosine Distribution <span className="hr" />
                  <span
                    className="mono"
                    style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.08em' }}
                  >
                    {active.seeds >= 2
                      ? `N = ${(active.seeds * (active.seeds - 1)) / 2} pairs`
                      : 'NEEDS ≥ 2 SEEDS'}
                  </span>
                </h3>
                {detail.coherenceBins.length === 0 ? (
                  <div className="empty mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
                    No coherence histogram yet. Upload at least two seeds, then click
                    RECOMPUTE.
                  </div>
                ) : (
                  <div className="hist-wrap">
                    <div className="hist-legend">
                      <span>
                        min <b className="mono num">{detail.coherenceStats.min.toFixed(2)}</b>
                      </span>
                      <span>
                        median <b className="mono num">{active.coherence.toFixed(2)}</b>
                      </span>
                      <span>
                        max <b className="mono num">{detail.coherenceStats.max.toFixed(2)}</b>
                      </span>
                    </div>
                    <div className="hist">
                      {detail.coherenceBins.map((v, i) => {
                        const isHot = i >= 7 && i <= 11;
                        const max = Math.max(...detail.coherenceBins, 1);
                        return (
                          <div
                            key={i}
                            className={`bar ${isHot ? 'hot' : 'muted'}`}
                            style={{ height: `${(v / max) * 100}%` }}
                          />
                        );
                      })}
                    </div>
                    <div className="hist-axis">
                      <span>0.00</span>
                      <span>0.25</span>
                      <span>0.50</span>
                      <span>0.75</span>
                      <span>1.00</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="section">
                <h3>
                  Seed Corpus <span className="hr" />
                  <span
                    className="mono"
                    style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.08em' }}
                  >
                    {active.seeds} papers
                  </span>
                </h3>
                <div className="seed-table">
                  <div className="seed-row head">
                    <span>#</span>
                    <span>TITLE</span>
                    <span style={{ textAlign: 'right' }}>YEAR</span>
                    <span style={{ textAlign: 'right' }}>COH.TO.CENTROID</span>
                    <span></span>
                  </div>
                  {detail.seeds.map((s) => (
                    <div className="seed-row" key={s.id}>
                      <span className="num">{String(s.idx).padStart(2, '0')}</span>
                      <span className="ttl">{s.title}</span>
                      <span className="num" style={{ textAlign: 'right', color: 'var(--fg-3)' }}>
                        {s.year}
                      </span>
                      <span
                        className={`coh num ${s.coh < 0.65 ? 'err' : s.coh < 0.72 ? 'warn' : ''}`}
                      >
                        {s.coh.toFixed(3)}
                      </span>
                      <span />
                    </div>
                  ))}
                </div>
              </div>

              <div className="section">
                <h3>
                  OpenAlex Topic Filter <span className="hr" />
                  <span
                    className="mono"
                    style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.08em' }}
                  >
                    {detail.topics.length} TOPICS
                  </span>
                </h3>
                {detail.topics.length === 0 ? (
                  <div className="empty mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
                    No topics aggregated yet. Upload seeds (whose OpenAlex enrichment
                    succeeds), then click RECOMPUTE.
                  </div>
                ) : (
                  <div className="topics">
                    {detail.topics.map((t) => (
                      <span key={t.id} className={`topic ${t.on ? 'on' : ''}`}>
                        <span className="tid">{t.id}</span>
                        {t.name}
                        <span className="tct">n={t.count}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="section">
                <h3>
                  Threshold Calibration <span className="hr" />
                  <span
                    className="mono"
                    style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.08em' }}
                  >
                    {dry
                      ? `DRY-RUN · ${dry.n} CANDIDATES`
                      : 'CLICK DRY-RUN TO POPULATE'}
                  </span>
                </h3>
                {dryError && (
                  <div
                    className="mono"
                    style={{
                      margin: '8px 0',
                      padding: 8,
                      color: 'var(--err)',
                      background: 'color-mix(in oklab, var(--bg-0), var(--err) 4%)',
                      borderLeft: '2px solid var(--err)',
                      fontSize: 11,
                    }}
                  >
                    DRY-RUN FAILED: {dryError}
                  </div>
                )}
                {dry ? (
                  dry.scores.length === 0 ? (
                    <div className="empty mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
                      No persisted candidates yet. Run a gather first, then DRY-RUN.
                    </div>
                  ) : (
                    <ThresholdHistogram
                      scores={dry.scores}
                      value={sliderTh}
                      onChange={setCalibTh}
                    />
                  )
                ) : (
                  <div className="empty mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
                    No dry-run yet. Click DRY-RUN above to load the candidate
                    score distribution and slide θ to preview pass-counts.
                  </div>
                )}
              </div>

              <div className="section" style={{ borderBottom: 0, paddingBottom: 40 }}>
                <h3>
                  Feedback Log (last 20) <span className="hr" />
                </h3>
                <div
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: 'var(--fg-3)',
                    background: 'var(--bg-inset)',
                    border: '1px solid var(--line)',
                    padding: 12,
                    maxHeight: 220,
                    overflowY: 'auto',
                    lineHeight: 1.7,
                  }}
                >
                  {detail.feedbackLog.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                  <div style={{ color: 'var(--fg-4)' }}>... {detail.feedbackMoreCount} more</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
