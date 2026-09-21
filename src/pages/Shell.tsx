import { useProfiles, useVaultStats } from '../api/hooks';
import { TERMS } from '../lib/terms';
import { dismissJob, kindLabel, stepLabel, useJobs, type Job } from '../lib/jobs';
import { navigate, paths, type Route } from '../lib/router';
import { setThemePref, useTheme } from '../lib/theme';
import { Button, Icon, IconButton, Spinner, Swatch, type IconName } from '../ui';
import { Link } from '../ui/Link';
import { JobProgress } from '../ui/domain';
import { FeedPage } from './FeedPage';
import { InterestsPage } from './InterestsPage';
import { InterestDetailPage } from './InterestDetailPage';
import { WizardPage } from './WizardPage';
import { VaultPage } from './VaultPage';
import { SettingsPage } from './SettingsPage';
import { NotFoundPage } from './NotFoundPage';

const NAV: { name: Route['name']; href: string; label: string; icon: IconName }[] = [
  { name: 'feed', href: paths.feed, label: TERMS.feed, icon: 'radar' },
  { name: 'interests', href: paths.interests, label: TERMS.Interests, icon: 'interests' },
  { name: 'vault', href: paths.vault, label: TERMS.vault, icon: 'vault' },
];

export function Shell({ route, email }: { route: Route; email: string }) {
  return (
    <div className="app">
      <Sidebar route={route} email={email} />
      <div className="main">
        <JobsStrip />
        {route.name === 'feed' && <FeedPage />}
        {route.name === 'interests' && <InterestsPage />}
        {route.name === 'interest' && <InterestDetailPage profileKey={route.key} />}
        {route.name === 'wizard' && <WizardPage draftSlug={route.draft} />}
        {route.name === 'vault' && <VaultPage />}
        {route.name === 'settings' && <SettingsPage />}
        {route.name === 'notfound' && <NotFoundPage path={route.path} />}
      </div>
    </div>
  );
}

function Sidebar({ route, email }: { route: Route; email: string }) {
  const { data: profiles } = useProfiles();
  const { data: vaultStats } = useVaultStats();
  const jobs = useJobs();
  const { resolved } = useTheme();
  const live = (profiles ?? []).filter((p) => !p.isDraft);
  const drafts = (profiles ?? []).filter((p) => p.isDraft);
  const counts: Partial<Record<Route['name'], number | undefined>> = {
    interests: profiles?.length,
    vault: vaultStats?.docs,
  };
  const activeKey = route.name === 'interest' ? route.key : route.name === 'wizard' ? route.draft : null;

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark"><Icon name="radar" size={15} /></span>
        <span className="brand-name">Radar</span>
        <span className="brand-ver">v1.0</span>
      </div>
      <nav className="nav" aria-label="Main">
        {NAV.map((n) => (
          <Link key={n.name} href={n.href} className={`nav-item ${route.name === n.name ? 'active' : ''}`}>
            <Icon name={n.icon} size={16} />
            <span>{n.label}</span>
            {counts[n.name] != null && <span className="nav-count">{counts[n.name]}</span>}
          </Link>
        ))}
        <div className="nav-section">
          <span className="nav-section-label">Your {TERMS.interests}</span>
          <IconButton icon="plus" label={TERMS.newInterest} size="sm" onClick={() => navigate(paths.wizard())} />
        </div>
        {profiles && profiles.length === 0 && <div className="nav-empty">None yet.</div>}
        {live.map((p) => {
          const scanning = jobs.some((j) => j.kind === 'scan' && j.profileKey === p.key && j.status === 'running');
          return (
            <Link key={p.key} href={paths.interest(p.key)} className={`nav-sub ${activeKey === p.key ? 'active' : ''}`} title={p.name}>
              <Swatch hue={p.hue} size={8} />
              <span className="truncate">{p.name}</span>
              {scanning ? <Spinner size={12} /> : <span className="nav-sub-status">{p.saves30 + p.dismisses30 > 0 ? `${p.saves30}/${p.dismisses30}` : ''}</span>}
            </Link>
          );
        })}
        {drafts.map((p) => (
          <Link key={p.key} href={paths.wizard(p.key)} className={`nav-sub ${activeKey === p.key ? 'active' : ''}`} title={`${p.name} (draft)`}>
            <Swatch hue={p.hue} size={8} />
            <span className="truncate muted">{p.name}</span>
            <span className="nav-sub-status">draft</span>
          </Link>
        ))}
      </nav>
      <div className="sidebar-foot">
        <Link href={paths.settings} className={`nav-item sidebar-user truncate ${route.name === 'settings' ? 'active' : ''}`} title={email} style={{ padding: '6px 8px' }}>
          <Icon name="settings" size={15} />
          <span className="truncate">{email}</span>
        </Link>
        <IconButton icon={resolved === 'dark' ? 'sun' : 'moon'} label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setThemePref(resolved === 'dark' ? 'light' : 'dark')} />
      </div>
    </aside>
  );
}

function JobsStrip() {
  const jobs = useJobs().filter((j) => !j.dismissed && j.kind !== 'dryrun' && j.kind !== 'import');
  if (jobs.length === 0) return null;
  return (
    <div className="jobs-strip" aria-live="polite">
      {jobs.map((j) => <JobRow key={j.id} job={j} />)}
    </div>
  );
}

function JobRow({ job }: { job: Job }) {
  const icon = job.status === 'running' ? <Spinner size={16} /> : job.status === 'done' ? <Icon name="check" className="ok" /> : <Icon name="alert" className="err" />;
  return (
    <div className={`job-row ${job.status}`}>
      {icon}
      <div className="job-main">
        <div className="job-title">
          <b>{kindLabel(job.kind)} · {job.profileName}</b>
          <span className="job-step">
            {job.status === 'running' ? `${stepLabel(job)}${job.days ? ` · last ${job.days} days` : ''}` : job.status === 'done' ? job.summary : 'Failed'}
          </span>
        </div>
        {job.status === 'running' ? <JobProgress job={job} compact /> : job.status === 'error' && <div className="job-msg">{job.error}</div>}
      </div>
      <div className="job-side">
        {job.status === 'done' && <Button size="sm" variant="ghost" onClick={() => navigate(paths.feed)}>View feed</Button>}
        <Link href={paths.interest(job.profileKey)} className="btn btn-ghost btn-sm">Open</Link>
        {job.status !== 'running' && <IconButton icon="x" label="Dismiss" size="sm" onClick={() => dismissJob(job.id)} />}
      </div>
    </div>
  );
}
