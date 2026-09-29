import { useState } from 'react';
import type { DraftSummary } from '../api/endpoints/profiles';
import { useDrafts, useProfiles } from '../api/hooks';
import { deleteDraft } from '../api/endpoints/wizard';
import { getDraft, resetDraft } from '../lib/draft';
import { errorMessage } from '../lib/format';
import { useJobs } from '../lib/jobs';
import { paths } from '../lib/router';
import { TERMS } from '../lib/terms';
import { toast } from '../lib/toast';
import type { Profile } from '../types/radar';
import { Badge, Button, EmptyState, ErrorBox, Icon, LoadingRows, Panel, Spinner, Swatch, confirmDialog } from '../ui';
import { Link } from '../ui/Link';
import { HealthBadge } from '../ui/domain';
import { AddInterestCards } from './HomePage';

export function InterestsPage() {
  const { data: profiles, loading, error, refresh } = useProfiles();
  // The profile list says which drafts exist; this says what each is
  // waiting for. Kept separate so a slow or failed drafts call never stops
  // the page rendering -- the rows still work, just without the badge.
  const { data: draftInfo } = useDrafts();
  const draftPhase = new Map((draftInfo ?? []).map((d) => [d.slug, d]));
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
          body={`An ${TERMS.interest} is a topic you want to follow, defined by a set of papers. It takes about five minutes to set up, most of it waiting for the trial scan. Start from:`}
          action={<AddInterestCards />}
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
          {drafts.map((d) => <DraftRow key={d.key} draft={d} info={draftPhase.get(d.key)} />)}
        </Panel>
      )}
    </div>
  );
}

function DraftRow({ draft, info }: { draft: Profile; info?: DraftSummary }) {
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
      <div className="col" style={{ minWidth: 0, gap: 2 }}>
        <div className="row" style={{ minWidth: 0 }}>
          <Swatch hue={draft.hue} />
          <span className="truncate" style={{ fontWeight: 500 }}>{draft.name}</span>
          {info?.phase === 'importing' ? (
            // Mid-import the seeds are not attached yet, so the count would
            // read "0 seeds" for a job busy fetching eighty papers.
            <Badge tone="info" dot title="Radar is still fetching and embedding this researcher's papers.">importing</Badge>
          ) : info?.phase === 'failed' ? (
            <Badge tone="err" title={info.import_error ?? undefined}>import failed</Badge>
          ) : (
            <span className="small muted">{draft.seeds} seed{draft.seeds === 1 ? '' : 's'}</span>
          )}
          {info?.researcher_name && (
            <span className="small muted truncate" title={info.orcid ?? undefined}>
              {info.researcher_name}
            </span>
          )}
        </div>
        {info?.phase === 'failed' && info.import_error && (
          // Surfaced rather than only logged: the draft looks empty either
          // way, and without this the user is invited to start adding seeds
          // by hand with no idea the import died.
          <span className="small mono" style={{ color: 'var(--err)' }}>{info.import_error}</span>
        )}
      </div>
      <div className="row">
        <Link href={paths.wizard(draft.key)} className="btn btn-sm btn-primary">Resume</Link>
        <Button size="sm" variant="danger" icon="trash" onClick={remove} loading={deleting}>Delete</Button>
      </div>
    </div>
  );
}
