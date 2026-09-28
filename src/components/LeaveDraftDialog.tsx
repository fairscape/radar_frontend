/**
 * LeaveDraftDialog — shown when the user is about to leave the profile
 * wizard with an unfinished draft behind (CANCEL, sidebar, keyboard
 * shortcut, browser back).
 *
 * Three answers, none of them destructive by default:
 *   KEEP DRAFT  — leave; the wizard offers to resume it next time.
 *   DISCARD     — delete the server draft (seeds, running import) and
 *                 forget it locally; leave.
 *   STAY        — close the dialog, nothing changes.
 */

import { useEffect } from 'react';

interface Props {
  name: string;
  step: number;
  onKeep: () => void;
  onDiscard: () => void;
  onStay: () => void;
}

const STEP_LABEL: Record<number, string> = {
  1: 'seeds',
  2: 'coherence',
  3: 'concepts',
  4: 'calibrate',
};

export function LeaveDraftDialog({ name, step, onKeep, onDiscard, onStay }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onStay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStay]);

  return (
    <div className="modal-backdrop" onClick={onStay}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-draft-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head" id="leave-draft-title">
          UNFINISHED TOPIC
        </div>
        <div className="modal-body">
          <p>
            <strong>{name || 'Untitled'}</strong> is not saved yet
            {' '}(stopped at step {step}, {STEP_LABEL[step] ?? 'seeds'}).
          </p>
          <p className="dim">
            Keep it to continue later, or discard it to delete the draft and
            everything uploaded or imported for it.
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onStay}>
            STAY
          </button>
          <button type="button" className="btn" onClick={onDiscard}>
            DISCARD
          </button>
          <button type="button" className="btn primary" onClick={onKeep} autoFocus>
            KEEP DRAFT
          </button>
        </div>
      </div>
    </div>
  );
}
