/**
 * ServerDraftsPrompt — this browser has no draft, but the server does
 * (left in another browser, or site data was cleared). Offer each one
 * for resuming or discarding before starting a new profile.
 */

import { useEffect, useState } from 'react';
import { deleteDraft, listDrafts, type DraftSummary } from '../../api/endpoints/wizard';

interface Props {
  /** The user picked a server draft to continue. */
  onAdopt: (d: DraftSummary) => void;
  /** No drafts to offer (none exist, or the user chose to start new). */
  onNone: () => void;
}

function when(iso: string | null): string {
  if (!iso) return '';
  // SQLite writes 'YYYY-MM-DD HH:MM:SS' (UTC, no zone); make it ISO so Safari parses it too.
  const norm = iso.replace(' ', 'T');
  const d = new Date(norm.endsWith('Z') || norm.includes('+') ? norm : `${norm}Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function ServerDraftsPrompt({ onAdopt, onNone }: Props) {
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listDrafts()
      .then((rows) => {
        if (cancelled) return;
        if (rows.length === 0) onNone();
        else setDrafts(rows);
      })
      .catch(() => {
        // The endpoint is a convenience; never block profile creation on it.
        if (!cancelled) onNone();
      });
    return () => {
      cancelled = true;
    };
    // onNone is stable for the wizard's lifetime; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!drafts) {
    return <div className="empty">CHECKING FOR UNFINISHED TOPICS…</div>;
  }

  const discard = async (d: DraftSummary) => {
    setBusy(d.slug);
    try {
      await deleteDraft(d.slug);
    } catch {
      /* already gone — drop it from the list anyway */
    }
    const rest = drafts.filter((x) => x.slug !== d.slug);
    setBusy(null);
    if (rest.length === 0) onNone();
    else setDrafts(rest);
  };

  return (
    <div className="section">
      <h3>
        Unfinished topic{drafts.length === 1 ? '' : 's'} <span className="hr" />
      </h3>
      <div className="resume-draft">
        <p>
          You have {drafts.length === 1 ? 'a topic' : `${drafts.length} topics`} that
          {drafts.length === 1 ? ' was' : ' were'} started but never saved. Continue one, or
          discard {drafts.length === 1 ? 'it' : 'them'} and start fresh.
        </p>
        {drafts.map((d) => (
          <div key={d.slug} className="draft-row">
            <div>
              <div className="draft-name">{d.name || d.slug}</div>
              <div className="meta">
                {d.rp ? `From profile${d.orcid ? ` · ORCID ${d.orcid}` : ''}` : d.orcid ? `From ORCID ${d.orcid}` : 'From PDFs'}
                {' · '}
                {d.phase === 'fetching' || d.phase === 'seeding'
                  ? d.phase === 'fetching' ? 'fetching works' : 'seeding'
                  : d.phase === 'selecting'
                    ? `${d.n_works} works fetched · choose the seeds`
                    : `${d.n_seeds} seed${d.n_seeds === 1 ? '' : 's'}`}
                {d.created_at ? ` · started ${when(d.created_at)}` : ''}
              </div>
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn primary"
                disabled={busy !== null}
                onClick={() => onAdopt(d)}
              >
                CONTINUE
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy !== null}
                onClick={() => discard(d)}
              >
                {busy === d.slug ? 'DISCARDING…' : 'DISCARD'}
              </button>
            </div>
          </div>
        ))}
        <div className="actions">
          <button type="button" className="btn ghost" disabled={busy !== null} onClick={onNone}>
            START A NEW TOPIC INSTEAD
          </button>
        </div>
      </div>
    </div>
  );
}
