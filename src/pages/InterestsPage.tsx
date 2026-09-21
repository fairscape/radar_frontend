import { useState } from 'react';
import { useProfiles } from '../api/hooks';
import { deleteDraft } from '../api/endpoints/wizard';
import { getDraft, resetDraft } from '../lib/draft';
import { errorMessage } from '../lib/format';
import { useJobs } from '../lib/jobs';
import { paths } from '../lib/router';
import { TERMS } from '../lib/terms';
import { toast } from '../lib/toast';
import type { Profile } from '../types/radar';
import { Button, EmptyState, ErrorBox, Icon, LoadingRows, Panel, Spinner, Swatch, confirmDialog } from '../ui';
import { Link } from '../ui/Link';
import { HealthBadge } from '../ui/domain';

export function InterestsPage() {
  const { data: profiles, loading, error, refresh } = useProfiles();
  const jobs = useJobs();
  const live = (profiles ?? []).filter((p) => !p.isDraft);
  const drafts = (profiles ?? []).filter((p) => p.isDraft);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">{TERMS.Interests}</h1>
          <p className="page-sub">Each {TERMS.interest} is a set of seed papers, the topics Radar queries for it, and a score threshold. Radar scans every {TERMS.interest} daily.</p>
        </div>
        <div className="page-actions">
          <Link href={paths.wizard()} className="btn btn-primary"><Icon name="plus" size={16} /> {TERMS.newInterest}</Link>
        </div>
      </header>

      {error && !profiles && <ErrorBox message={errorMessage(error)} onRetry={refresh} />}
      {loading && !profiles && <LoadingRows rows={3} />}

      {profiles && profiles.length === 0 && (
        <EmptyState
          icon="interests"
          title={`No ${TERMS.interests} yet`}
          body={`Create one from a few seed papers. It takes about five minutes, most of it waiting for the trial scan.`}
          action={<Link href={paths.wizard()} className="btn btn-primary"><Icon name="plus" size={16} /> Create your first {TERMS.interest}</Link>}
        />
      )}

      {live.length > 0 && (
        <div className="interest-grid">
          {live.map((p) => {
            const scanning = jobs.some((j) => j.kind === 'scan' && j.profileKey === p.key && j.status === 'running');
            return (
              <Link key={p.key} href={paths.interest(p.key)} className="interest-card">
                <div className="interest-card-head">
                  <Swatch hue={p.hue} size={12} />
                  <span className="interest-card-name truncate">{p.name}</span>
                  <HealthBadge profile={p} />
                </div>
                <div className="interest-card-stats">
                  <span><b>{p.seeds}</b>seeds</span>
                  <span><b>{p.threshold.toFixed(3)}</b>threshold</span>
                  <span title="0 = unrelated, 100 = near-identical seeds"><b>{p.agreement != null ? p.agreement : '—'}</b>agreement</span>
                </div>
                <div className="interest-card-foot">
                  <span>{p.saves30} saved · {p.dismisses30} dismissed (30 d)</span>
                  {scanning ? <span className="row" style={{ gap: 6, color: 'var(--accent)' }}><Spinner size={12} /> scanning</span> : <Icon name="chevron-right" size={14} />}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {drafts.length > 0 && (
        <Panel title="Drafts" description={`Unfinished ${TERMS.interests}. Resume to pick up where you left off, or delete to discard the draft and its uploaded seeds.`} className="panel-flush" id="drafts">
          {drafts.map((d) => <DraftRow key={d.key} draft={d} />)}
        </Panel>
      )}
    </div>
  );
}

function DraftRow({ draft }: { draft: Profile }) {
  const [deleting, setDeleting] = useState(false);
  async function remove() {
    const ok = await confirmDialog({
      title: `Delete draft "${draft.name}"?`,
      body: <p>The draft and its {draft.seeds} uploaded seed{draft.seeds === 1 ? '' : 's'} will be removed. This cannot be undone.</p>,
      confirmLabel: 'Delete draft',
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteDraft(draft.key);
      if (getDraft().slug === draft.key) resetDraft();
      toast.success(`Deleted draft "${draft.name}".`);
    } catch (e) {
      toast.error(`Couldn't delete the draft: ${errorMessage(e)}`);
    } finally {
      setDeleting(false);
    }
  }
  return (
    <div className="row spread" style={{ padding: '10px 18px', borderBottom: '1px solid var(--line)' }}>
      <div className="row" style={{ minWidth: 0 }}>
        <Swatch hue={draft.hue} />
        <span className="truncate" style={{ fontWeight: 500 }}>{draft.name}</span>
        <span className="small muted">{draft.seeds} seed{draft.seeds === 1 ? '' : 's'}</span>
      </div>
      <div className="row">
        <Link href={paths.wizard(draft.key)} className="btn btn-sm btn-primary">Resume</Link>
        <Button size="sm" variant="danger" icon="trash" onClick={remove} loading={deleting}>Delete</Button>
      </div>
    </div>
  );
}
