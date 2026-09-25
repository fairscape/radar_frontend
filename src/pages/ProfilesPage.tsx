import { useEffect, useState } from 'react';
import { useResearchers } from '../api/hooks';
import { errorMessage, fmtRelative } from '../lib/format';
import { researcherJobKey, startResearcherImport, useJob, useJobs, type Job } from '../lib/jobs';
import { paths } from '../lib/router';
import { TERMS } from '../lib/terms';
import type { Researcher } from '../types/researchers';
import { Badge, Button, EmptyState, ErrorBox, Icon, LoadingRows, Panel, Segmented, Spinner } from '../ui';
import { Link } from '../ui/Link';
import { JobProgress } from '../ui/domain';
import { LookupPicker, ORCID_LOOKUP, PROSOPIA_LOOKUP } from '../ui/pickers';

/**
 * Stored researchers. A profile is a person and their papers, imported
 * once (resolved on OpenAlex, embedded) and then the raw material for
 * any number of interests. Importing through the wizard also lands
 * here, so this page fills up on its own.
 */
export function ProfilesPage() {
  const { data: researchers, loading, error, refresh } = useResearchers();
  const jobs = useJobs();

  // While any profile is importing, poll the list so the card's count
  // and "importing" state update on their own — including imports
  // started from another tab or before a reload.
  const anyImporting = (researchers ?? []).some((r) => r.importing);
  useEffect(() => {
    if (!anyImporting) return;
    const t = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(t);
  }, [anyImporting, refresh]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">{TERMS.Profiles}</h1>
          <p className="page-sub">A {TERMS.profile} is a researcher and their papers, saved once. Build as many {TERMS.interests} from a {TERMS.profile} as you like; the papers are already matched and embedded, so each one takes seconds.</p>
        </div>
      </header>

      {error && !researchers && <ErrorBox message={errorMessage(error)} onRetry={refresh} />}
      {loading && !researchers && <LoadingRows rows={3} />}

      {researchers && researchers.length === 0 && (
        <EmptyState
          icon="user"
          title={`No ${TERMS.profiles} saved yet`}
          body={`Import a researcher below by ORCID or from a Prosopia profile. Importing through the ${TERMS.newInterest} wizard saves the ${TERMS.profile} too.`}
        />
      )}

      {researchers && researchers.length > 0 && (
        <div className="interest-grid" style={{ marginBottom: 18 }}>
          {researchers.map((r) => {
            const running = jobs.some((j) => j.kind === 'import' && j.profileKey === researcherJobKey(r.id) && j.status === 'running');
            return <ResearcherCard key={r.id} r={r} running={running || r.importing} />;
          })}
        </div>
      )}

      <ImportPanel />
    </div>
  );
}

function ResearcherCard({ r, running }: { r: Researcher; running: boolean }) {
  return (
    <Link href={paths.profile(r.id)} className="interest-card">
      <div className="interest-card-head">
        <Icon name="user" size={14} />
        <span className="interest-card-name truncate">{r.name}</span>
        <Badge tone={r.source === 'prosopia' ? 'info' : 'neutral'}>{r.source === 'prosopia' ? 'Prosopia' : 'ORCID'}</Badge>
      </div>
      <div className="interest-card-stats">
        <span><b>{r.n_papers}</b>papers</span>
        <span><b>{r.n_interests}</b>{r.n_interests === 1 ? TERMS.interest : TERMS.interests}</span>
      </div>
      <div className="interest-card-foot">
        <span className="truncate">{r.affiliation ?? (r.orcid ? `ORCID ${r.orcid}` : r.key)}</span>
        {running ? <span className="row" style={{ gap: 6, color: 'var(--accent)' }}><Spinner size={12} /> importing</span> : r.last_error ? <span style={{ color: 'var(--err)' }}>import failed</span> : <span>{r.imported_at ? fmtRelative(r.imported_at) : ''}</span>}
      </div>
    </Link>
  );
}

/**
 * Same lookup → pick list as the wizard, but the target is a stored
 * profile rather than a draft: nothing else is created.
 */
function ImportPanel() {
  const [source, setSource] = useState<'orcid' | 'prosopia'>('orcid');
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  // Bumped when an import finishes so the picker remounts empty, ready
  // for the next researcher; the finished job stays visible below it.
  const [round, setRound] = useState(0);
  const [finished, setFinished] = useState<Job | null>(null);
  useEffect(() => {
    if (!job || job.status === 'running') return;
    setFinished(job);
    setJobId(null);
    setRound((n) => n + 1);
  }, [job]);
  const lookup = source === 'orcid' ? ORCID_LOOKUP : PROSOPIA_LOOKUP;
  return (
    <Panel title={`Add a ${TERMS.profile}`} description={`Look a researcher up, untick any papers that should not count, and save. Radar matches each paper on OpenAlex and embeds it in the background; that is the slow part, and it happens once.`}>
      <div className="stack" style={{ gap: 14 }}>
        {finished && (
          <div className="row spread callout callout-compact" style={{ alignItems: 'center' }}>
            <JobProgress job={finished} />
            <span className="row" style={{ gap: 6 }}>
              {finished.status === 'done' && finished.researcherId != null && <Link href={paths.profile(finished.researcherId)} className="btn btn-sm">Open {finished.profileName}</Link>}
              <Button size="sm" variant="ghost" icon="x" onClick={() => setFinished(null)}>Dismiss</Button>
            </span>
          </div>
        )}
        <div>
          <div className="field-label" style={{ marginBottom: 8 }}>Look up by</div>
          <Segmented value={source} onChange={(v) => { setSource(v); setRound((n) => n + 1); }} ariaLabel="Where to look the researcher up" options={[{ value: 'orcid', label: 'ORCID' }, { value: 'prosopia', label: 'Prosopia profile' }]} />
        </div>
        <LookupPicker
          key={`${source}:${round}`}
          lookup={lookup}
          job={job}
          startLabel="Save"
          start={async (key, ids, name) => {
            const j = await startResearcherImport(source, key, name ?? key, ids);
            setJobId(j.id);
            return j;
          }}
        />
        {job && job.status === 'running' && (
          <p className="small muted" style={{ margin: 0 }}>You can leave this page; the import continues and the {TERMS.profile} appears above when it is done.</p>
        )}
      </div>
    </Panel>
  );
}
