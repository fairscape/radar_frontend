import { IconSoft } from '../../components/soft/IconSoft';
import { swatchFor, useProfiles, useProfileDetail } from '../../lib/apiSwitch';

export function ProfilesViewSoft({
  selected,
  setSelected,
  onNew,
}: {
  selected: string;
  setSelected: (k: string) => void;
  onNew?: () => void;
}) {
  const { profiles, loading: profilesLoading } = useProfiles();
  const { detail, loading } = useProfileDetail(selected);
  const active = detail?.profile ?? profiles.find((p) => p.key === selected) ?? profiles[0];

  if (!active) {
    return (
      <div className="view">
        <div className="page-head">
          <div>
            <h1>Profiles</h1>
            <div className="sub">Each profile tells Radar what kind of papers to surface for you.</div>
          </div>
          <div className="actions">
            <button className="btn primary" type="button" onClick={onNew}>
              <IconSoft name="plus" size={14} /> New profile
            </button>
          </div>
        </div>
        <div className="empty">
          {profilesLoading
            ? 'Loading profiles…'
            : 'No profiles yet — click New profile to create one.'}
        </div>
      </div>
    );
  }

  // Bimodal ('warn') is expected for multi-topic profiles; we don't surface
  // it as a problem. Treat it as healthy for display purposes; only the
  // 'err' (low coherence) state warrants a banner.
  const isUnhealthy = active.health === 'err';
  const healthWord = isUnhealthy ? 'Off-target' : 'Healthy';
  const healthDesc = isUnhealthy
    ? 'Very low coherence. Consider re-selecting seed papers or splitting.'
    : 'This profile is focused and matching well.';

  const totalSD = active.saves30 + active.dismisses30;
  const saveRate = totalSD > 0 ? Math.round((active.saves30 / totalSD) * 100) : 0;

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <h1>Profiles</h1>
          <div className="sub">Each profile tells Radar what kind of papers to surface for you.</div>
        </div>
        <div className="actions">
          <button className="btn primary" type="button" onClick={onNew}>
            <IconSoft name="plus" size={14} /> New profile
          </button>
        </div>
      </div>

      <div className="pa-grid">
        <div className="pa-list">
          {profiles.map((p) => (
            <div
              key={p.key}
              className={`pa-item ${p.key === active.key ? 'active' : ''}`}
              onClick={() => setSelected(p.key)}
            >
              <div className="row1">
                <span className="dot" style={{ background: swatchFor(p.hue) }} />
                <span className="nm">{p.name}</span>
                <span className={`status ${p.health === 'err' ? 'err' : 'ok'}`}>
                  {p.health === 'err' ? 'Off-target' : 'Healthy'}
                </span>
              </div>
              <div className="sub">
                <span><b>{p.seeds}</b> seeds</span>
                <span><b>{p.saves30}</b> saved · 30d</span>
              </div>
            </div>
          ))}
        </div>

        <div className="pa-panel">
          <h2>
            <span className="dot" style={{ background: swatchFor(active.hue) }} />
            {active.name}
          </h2>
          <div className="lead">
            Uses {active.seeds} seed papers from your vault. Updated daily at 7am with papers from OpenAlex.
          </div>

          {isUnhealthy && (
            <div className="pa-banner">
              <div className="ico">!</div>
              <div className="txt">
                <b>{healthWord}</b>
                {healthDesc}
              </div>
              <div className="act">
                <button className="btn ghost">Learn more</button>
                <button className="btn primary">Review seeds</button>
              </div>
            </div>
          )}

          <div className="pa-stats">
            <div className="pa-stat">
              <div className="k">Coherence</div>
              <div className={`v ${active.coherence < 0.6 ? 'warn' : 'ok'}`}>
                {active.coherence.toFixed(2)}
              </div>
              <div className="d">How tightly your seeds cluster</div>
            </div>
            <div className="pa-stat">
              <div className="k">Match threshold</div>
              <div className="v">{active.threshold.toFixed(2)}</div>
              <div className="d">Minimum score to surface</div>
            </div>
            <div className="pa-stat">
              <div className="k">Save rate · 30 days</div>
              <div className="v">{saveRate}%</div>
              <div className="d">
                {active.saves30} saved of {totalSD} shown
              </div>
            </div>
            <div className="pa-stat">
              <div className="k">Last refit</div>
              <div className="v" style={{ fontSize: 16, marginTop: 12 }}>2 weeks ago</div>
              <div className="d">2026-04-08</div>
            </div>
          </div>

          {detail && (
            <>
              <div className="pa-section">
                <h3>
                  Seed papers
                  <span style={{ color: 'var(--fg-4)', fontWeight: 400, fontSize: 12, marginLeft: 6 }}>
                    — the papers that define this profile
                  </span>
                </h3>
                <div className="pa-seeds">
                  {detail.seeds.slice(0, 8).map((s) => (
                    <div className="pa-seed" key={s.id}>
                      <span className="n">{String(s.idx).padStart(2, '0')}</span>
                      <span className="t">{s.title}</span>
                      <span className="y">{s.year}</span>
                      <span className={`cbar ${s.coh < 0.65 ? 'err' : s.coh < 0.72 ? 'warn' : ''}`}>
                        <i style={{ width: `${s.coh * 100}%` }} />
                      </span>
                    </div>
                  ))}
                  {detail.seeds.length > 8 && (
                    <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--fg-4)' }}>
                      + {detail.seeds.length - 8} more seeds
                    </div>
                  )}
                </div>
              </div>

              <div className="pa-section">
                <h3>Topic filter</h3>
                <div className="hint">
                  Radar narrows down daily candidates to these OpenAlex topics before scoring.
                </div>
                <div className="pa-topics">
                  {detail.topics.map((t) => (
                    <span key={t.id} className={`pa-topic ${t.on ? 'on' : ''}`}>
                      {t.name} <span className="tn">{t.id}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="pa-section">
                <h3>Tune the threshold</h3>
                <div className="hint">
                  Lower = more papers (noisier). Higher = fewer but tighter matches.
                </div>
                <div className="pa-sweep">
                  {detail.sweep.map((s) => (
                    <div
                      key={s.th}
                      className={`pa-sw ${Math.abs(s.th - active.threshold) < 0.01 ? 'on' : ''}`}
                    >
                      <div className="t">{s.th.toFixed(2)}</div>
                      <div className="c">{s.n} papers</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {loading && !detail && <div className="empty">Loading profile…</div>}
        </div>
      </div>
    </div>
  );
}
