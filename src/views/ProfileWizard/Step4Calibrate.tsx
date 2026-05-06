import { useEffect, useRef, useState } from 'react';
import {
  commitDraft,
  dryRunDraft,
  getDraftDryRunStatus,
  type DraftDryRun,
} from '../../api/endpoints/wizard';
import { useDraft } from '../../api/hooks/useDraft';
import { ThresholdHistogram } from '../../components/ThresholdHistogram';

const DEFAULT_CRON = '0 4 * * *';
const DEFAULT_TZ = 'UTC';
const POLL_MS = 2500;

const STEP_LABEL: Record<string, string> = {
  loading_profile: 'Loading draft seeds',
  fetching: 'Querying OpenAlex',
  embedding: 'Embedding candidates',
  persisting: 'Saving dry-run result',
  done: 'Done',
};

function stepLabel(step: string | null): string {
  if (!step) return 'Working';
  return STEP_LABEL[step] ?? step;
}

interface Props {
  onPrev: () => void;
  onDone: (slug: string) => void;
}

interface Progress {
  step: string | null;
  nProcessed: number | null;
  nTotal: number | null;
  message: string | null;
}

export function Step4Calibrate({ onPrev, onDone }: Props) {
  const { state, setThreshold, reset } = useDraft();
  const [dry, setDry] = useState<DraftDryRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<Progress>({
    step: null,
    nProcessed: null,
    nTotal: null,
    message: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const pollRef = useRef<number | null>(null);
  const thresholdRef = useRef(state.threshold);
  useEffect(() => {
    thresholdRef.current = state.threshold;
  }, [state.threshold]);

  // Stop any in-flight poll on unmount so a slow dry-run doesn't keep
  // hitting the API after the user navigates away.
  useEffect(() => () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!state.slug) return;
    let cancelled = false;
    const slug = state.slug;
    setLoading(true);
    setError(null);
    setDry(null);
    setProgress({ step: null, nProcessed: null, nTotal: null, message: null });

    dryRunDraft(slug, { days: 30 })
      .then(({ run_id }) => {
        if (cancelled) return;
        if (pollRef.current) {
          window.clearInterval(pollRef.current);
        }
        const tick = async () => {
          try {
            const status = await getDraftDryRunStatus(slug, run_id);
            if (cancelled) return;
            const run = status.run;
            if (run.finished_at) {
              if (pollRef.current) {
                window.clearInterval(pollRef.current);
                pollRef.current = null;
              }
              if (run.error) {
                setError(run.error);
                setLoading(false);
                return;
              }
              const result = status.result;
              if (!result) {
                setError('dry-run finished without a result');
                setLoading(false);
                return;
              }
              setDry(result);
              setLoading(false);
              if (thresholdRef.current === null) {
                // Default to the θ that admits ~20 candidates ("useful
                // but not overwhelming"). Prefer the raw scores (slider
                // precision) and fall back to the sweep buckets when
                // scores are absent.
                if (result.scores.length > 0) {
                  const target = 20;
                  const sorted = [...result.scores].sort((a, b) => b - a);
                  const pick =
                    sorted[Math.min(target - 1, sorted.length - 1)] ??
                    sorted[0];
                  setThreshold(Number(pick.toFixed(2)));
                } else if (result.sweep.length > 0) {
                  const best = result.sweep.reduce((acc, row) =>
                    Math.abs(row.n - 20) < Math.abs(acc.n - 20) ? row : acc,
                  );
                  setThreshold(best.th);
                }
              }
              return;
            }
            // Still running — surface stage + counter so the user sees
            // forward motion instead of a static spinner.
            setProgress({
              step: run.current_step,
              nProcessed: run.n_processed,
              nTotal: run.n_total,
              message: run.last_message,
            });
          } catch (e) {
            if (cancelled) return;
            if (pollRef.current) {
              window.clearInterval(pollRef.current);
              pollRef.current = null;
            }
            setError(e instanceof Error ? e.message : String(e));
            setLoading(false);
          }
        };
        // Fire immediately so the inline / fixture-gatherer path
        // (which finishes before the kickoff response returns) doesn't
        // wait POLL_MS before showing the result.
        tick();
        pollRef.current = window.setInterval(tick, POLL_MS);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // Slug-only deps: state.threshold is read via ref so the slider
    // (and the auto-default setThreshold) doesn't re-kick the dry-run.
  }, [state.slug, setThreshold]);

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
          {' '}
          {stepLabel(progress.step).toUpperCase()}
          {progress.nTotal != null && progress.nProcessed != null
            ? ` · ${progress.nProcessed} / ${progress.nTotal}`
            : '…'}
          {progress.message && (
            <div
              className="mono"
              style={{
                marginTop: 6,
                fontSize: 11,
                color: 'var(--fg-4)',
                letterSpacing: 0,
              }}
            >
              {progress.message}
            </div>
          )}
          <div
            className="run-bar"
            style={{
              maxWidth: 360,
              margin: '8px auto 0',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {progress.nTotal != null &&
              progress.nProcessed != null &&
              progress.nTotal > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: '100%',
                    width: `${(progress.nProcessed / progress.nTotal) * 100}%`,
                    background: 'var(--fg-3)',
                    transition: 'width 200ms linear',
                  }}
                />
              )}
          </div>
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
