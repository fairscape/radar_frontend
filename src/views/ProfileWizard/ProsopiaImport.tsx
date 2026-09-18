import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import {
  getProsopiaImportStatus,
  startProsopiaImport,
} from '../../api/endpoints/prosopia';
import type { ProsopiaImportResult } from '../../types/prosopia';
import { ErrorLine } from './ErrorLine';

const POLL_MS = 2500;

// Labels for the job's ``current_step`` values. COUPLING: these are the
// step names the backend importer reports; unknown names fall through
// to the raw string, so a mismatch is cosmetic.
const STEP_LABEL: Record<string, string> = {
  fetching_profile: 'Fetching Prosopia profile',
  resolving: 'Resolving papers',
  embedding: 'Embedding seeds',
  attaching: 'Attaching seeds to draft',
  done: 'Done',
};

function stepLabel(step: string | null): string {
  if (!step) return 'Starting import';
  return STEP_LABEL[step] ?? step;
}

interface Progress {
  step: string | null;
  nProcessed: number | null;
  nTotal: number | null;
  message: string | null;
}

const NO_PROGRESS: Progress = {
  step: null,
  nProcessed: null,
  nTotal: null,
  message: null,
};

export interface ProsopiaImportDone {
  slug: string;
  name: string;
  ref: string;
  nSeeds: number | null;
}

interface Props {
  /** Name typed in Step 1's name box; sent as ``name`` when non-empty. */
  name: string;
  /** Disable the control while Step 1 is busy creating a manual draft. */
  disabled?: boolean;
  onDone: (done: ProsopiaImportDone) => void;
}

function describeError(e: unknown, ref: string): string {
  if (e instanceof ApiError) {
    const detail =
      typeof e.body === 'object' && e.body !== null && 'detail' in e.body
        ? String((e.body as { detail: unknown }).detail)
        : null;
    if (e.status === 404) return detail ?? `no Prosopia profile found for "${ref}"`;
    if (e.status === 502 || e.status === 503)
      return detail ?? 'Prosopia is unreachable right now — try again in a minute';
    return detail ?? e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

export function ProsopiaImport({ name, disabled, onDone }: Props) {
  const [ref, setRef] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress>(NO_PROGRESS);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  function stopPolling() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // Stop polling on unmount so a slow import doesn't keep hitting the
  // API after the wizard advances or the user cancels.
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      stopPolling();
    };
  }, []);

  async function handleImport() {
    const trimmed = ref.trim();
    if (!trimmed || running) return;
    setError(null);
    setRunning(true);
    setProgress(NO_PROGRESS);

    let slug: string;
    let runId: number;
    try {
      const start = await startProsopiaImport({
        ref: trimmed,
        ...(name.trim() ? { name: name.trim() } : {}),
      });
      slug = start.draft_slug;
      runId = start.run_id;
    } catch (e) {
      if (cancelledRef.current) return;
      setError(describeError(e, trimmed));
      setRunning(false);
      return;
    }
    if (cancelledRef.current) return;

    const finish = (result: ProsopiaImportResult | null) => {
      stopPolling();
      setRunning(false);
      onDone({
        slug: result?.draft_slug ?? slug,
        name: result?.name ?? (name.trim() || trimmed),
        ref: trimmed,
        nSeeds: typeof result?.n_seeds === 'number' ? result.n_seeds : null,
      });
    };

    const tick = async () => {
      try {
        const status = await getProsopiaImportStatus(runId);
        if (cancelledRef.current) return;
        const run = status.run;
        if (run.finished_at) {
          if (run.error) {
            stopPolling();
            setError(run.error);
            setRunning(false);
            return;
          }
          finish(status.result);
          return;
        }
        setProgress({
          step: run.current_step,
          nProcessed: run.n_processed,
          nTotal: run.n_total,
          message: run.last_message,
        });
      } catch (e) {
        if (cancelledRef.current) return;
        stopPolling();
        setError(describeError(e, trimmed));
        setRunning(false);
      }
    };
    // Fire immediately so an import that finishes before the kickoff
    // response returns doesn't wait POLL_MS to advance.
    tick();
    pollRef.current = window.setInterval(tick, POLL_MS);
  }

  const busy = running || !!disabled;
  const pct =
    progress.nTotal && progress.nProcessed != null && progress.nTotal > 0
      ? (progress.nProcessed / progress.nTotal) * 100
      : null;

  return (
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
        OR IMPORT FROM PROSOPIA
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleImport();
          }}
          disabled={busy}
          placeholder="profile slug or ORCID, e.g. sheffield-nathan"
          style={{
            flex: 1,
            padding: 8,
            fontFamily: 'var(--font-mono)',
            background: 'var(--bg-inset)',
            color: 'var(--fg)',
            border: '1px solid var(--line-strong)',
          }}
        />
        <button
          className="btn primary"
          disabled={busy || !ref.trim()}
          onClick={handleImport}
        >
          {running ? (
            <>
              <span className="run-spinner" />IMPORTING…
            </>
          ) : (
            'IMPORT'
          )}
        </button>
      </div>
      <div
        className="mono"
        style={{ marginTop: 6, fontSize: 10, color: 'var(--fg-4)' }}
      >
        Seeds the draft with every paper on the Prosopia profile. Leave the
        name blank to use the profile's name.
      </div>

      {running && (
        <div
          className="mono"
          style={{
            marginTop: 12,
            fontSize: 11,
            color: 'var(--fg-3)',
            letterSpacing: '0.08em',
          }}
        >
          {stepLabel(progress.step).toUpperCase()}
          {progress.nTotal != null && progress.nProcessed != null
            ? ` · ${progress.nProcessed} / ${progress.nTotal}`
            : '…'}
          {progress.message && (
            <div style={{ marginTop: 4, color: 'var(--fg-4)', letterSpacing: 0 }}>
              {progress.message}
            </div>
          )}
          <div
            className="run-bar"
            style={{ maxWidth: 360, position: 'relative', overflow: 'hidden' }}
          >
            {pct != null && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '100%',
                  width: `${pct}%`,
                  background: 'var(--fg-3)',
                  transition: 'width 200ms linear',
                }}
              />
            )}
          </div>
        </div>
      )}

      {error && <ErrorLine text={error} />}
    </div>
  );
}
