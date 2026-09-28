/**
 * ResumeDraftPrompt — the wizard opened onto a draft the user had
 * walked away from (kept via the leave dialog, or a page reload / new
 * tab). Ask before dropping them back into it.
 */

interface Props {
  name: string;
  step: number;
  nSeeds: number;
  onResume: () => void;
  onStartNew: () => void;
}

const STEP_NAME: Record<number, string> = {
  1: 'Seeds',
  2: 'Coherence',
  3: 'Concepts',
  4: 'Calibrate',
};

export function ResumeDraftPrompt({ name, step, nSeeds, onResume, onStartNew }: Props) {
  return (
    <div className="section">
      <h3>
        Unfinished topic <span className="hr" />
      </h3>
      <div className="resume-draft">
        <p>
          You left <strong>{name || 'an untitled topic'}</strong> before saving it.
          Continue where you stopped, or start a new topic.
        </p>
        <div className="meta">
          Step {step} · {STEP_NAME[step] ?? 'Seeds'} · {nSeeds} seed{nSeeds === 1 ? '' : 's'}
        </div>
        <div className="actions">
          <button type="button" className="btn primary" onClick={onResume} autoFocus>
            CONTINUE DRAFT
          </button>
          <button type="button" className="btn" onClick={onStartNew}>
            DISCARD &amp; START NEW
          </button>
        </div>
      </div>
    </div>
  );
}
