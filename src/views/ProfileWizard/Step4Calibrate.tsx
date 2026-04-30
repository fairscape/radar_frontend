import { useEffect, useState } from 'react';
import {
  commitDraft,
  dryRunDraft,
  type DraftDryRun,
} from '../../api/endpoints/wizard';
import { useDraft } from '../../api/hooks/useDraft';
import { ThresholdHistogram } from '../../components/ThresholdHistogram';

const DEFAULT_CRON = '0 4 * * *';
const DEFAULT_TZ = 'UTC';

interface Props {
  onPrev: () => void;
  onDone: (slug: string) => void;
}

export function Step4Calibrate({ onPrev, onDone }: Props) {
  const { state, setThreshold, reset } = useDraft();
  const [dry, setDry] = useState<DraftDryRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    if (!state.slug) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    dryRunDraft(state.slug, { days: 30 })
      .then((d) => {
        if (cancelled) return;
        setDry(d);
        if (state.threshold === null) {
          // Default to the θ that admits ~20 candidates ("useful but
          // not overwhelming"). Prefer the raw scores (slider precision)
          // and fall back to the sweep buckets when scores are absent.
          if (d.scores.length > 0) {
            const target = 20;
            const sorted = [...d.scores].sort((a, b) => b - a);
            const pick =
              sorted[Math.min(target - 1, sorted.length - 1)] ?? sorted[0];
            setThreshold(Number(pick.toFixed(2)));
          } else if (d.sweep.length > 0) {
            const best = d.sweep.reduce((acc, row) =>
              Math.abs(row.n - 20) < Math.abs(acc.n - 20) ? row : acc,
            );
            setThreshold(best.th);
          }
        }
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.slug, setThreshold, state.threshold]);

  async function handleSave() {
    if (!state.slug || state.threshold === null) return;
    setCommitting(true);
    setError(null);
    try {
      const profile = await commitDraft({
        slug: state.slug,
        threshold: state.threshold,
        selected_topic_ids: state.selectedTopicIds,
        cron: DEFAULT_CRON,
        tz: DEFAULT_TZ,
      });
      reset();
      onDone(profile.key);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCommitting(false);
    }
  }

  const activeThreshold = state.threshold ?? 0;
  const previewCount = dry
    ? dry.scores.reduce((acc, s) => (s >= activeThreshold ? acc + 1 : acc), 0)
    : 0;

  return (
    <div className="section">
      <h3>
        Step 4 — Calibrate threshold <span className="hr" />
        <span
          className="mono"
          style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.08em' }}
        >
          DRY-RUN · LAST 30 DAYS
        </span>
      </h3>

      {loading && (
        <div className="empty">
          <span className="run-spinner" />
          RUNNING DRY-RUN · GATHERING + SCORING CANDIDATES…
          <div className="run-bar" style={{ maxWidth: 360, margin: '8px auto 0' }} />
        </div>
      )}
      {error && (
        <div
          className="mono"
          style={{
            padding: 8,
            color: 'var(--err)',
            background: 'color-mix(in oklab, var(--bg-0), var(--err) 4%)',
            borderLeft: '2px solid var(--err)',
            fontSize: 11,
          }}
        >
          {error}
        </div>
      )}

      {dry && (
        <>
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: 'var(--fg-3)',
              marginBottom: 8,
            }}
          >
            <b className="num">{previewCount}</b> of{' '}
            <b className="num">{dry.scores.length}</b> fetched papers would
            pass at θ = <b className="num">{activeThreshold.toFixed(2)}</b>
          </div>
          {dry.scores.length === 0 ? (
            <div className="empty">no candidates returned — try a longer window</div>
          ) : (
            <ThresholdHistogram
              scores={dry.scores}
              value={activeThreshold}
              onChange={(v) => setThreshold(Number(v.toFixed(2)))}
            />
          )}

          <div style={{ marginTop: 18 }}>
            <div
              className="mono"
              style={{
                fontSize: 11,
                color: 'var(--fg-3)',
                letterSpacing: '0.08em',
                marginBottom: 6,
              }}
            >
              PREVIEW · TOP {dry.preview.length} CARDS
            </div>
            {dry.preview.length === 0 && (
              <div className="empty">no candidates returned</div>
            )}
            {dry.preview.map((c, i) => (
              <div
                key={c.id || i}
                style={{
                  padding: '6px 0',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--fg)' }}>
                  {c.title}
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 10, color: 'var(--fg-4)' }}
                >
                  {c.venue || '—'} · score {c.score.toFixed(3)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div
        style={{
          marginTop: 18,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <button className="btn" onClick={onPrev}>
          ← BACK
        </button>
        <button
          className="btn primary"
          onClick={handleSave}
          disabled={committing || state.threshold === null}
        >
          {committing ? (
            <>
              <span className="run-spinner" />SAVING…
            </>
          ) : (
            'SAVE PROFILE'
          )}
        </button>
      </div>
    </div>
  );
}
