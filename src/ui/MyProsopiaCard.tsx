import { useMyProsopia } from '../api/hooks';
import { fmtDate, plural } from '../lib/format';
import { startResearcherImport } from '../lib/jobs';
import { invalidate } from '../lib/query';
import { navigate, paths } from '../lib/router';
import { TERMS } from '../lib/terms';
import { Badge, Button, Icon, useAction, useClearOnChange } from './index';
import { Link } from './Link';

/**
 * "Your Prosopia profile": the signed-in person's own profile (the
 * ``self_rid`` Prosopia sent at sign-in), offered as one click instead of
 * pasting a slug. Renders nothing unless that profile exists and is
 * public -- many people have none, and that is not an error.
 *
 * Not imported: Import takes every paper (no pick list; the profile page
 * can drop papers later) and lands on the new profile, which shows the
 * import's progress. Imported: Open, or Check for new papers, which is
 * the profile page's own check opened on arrival.
 */
export function MyProsopiaCard() {
  const { data } = useMyProsopia();
  const p = data?.profile;
  const importNow = useAction(async () => {
    if (!p) return;
    const job = await startResearcherImport('prosopia', p.slug, p.name);
    invalidate('users/me/prosopia');
    if (job.researcherId != null) navigate(paths.profile(job.researcherId));
  });
  useClearOnChange(importNow, [p?.slug]);
  if (!p) return null;
  const rid = data?.researcher_id ?? null;
  const facts = [p.affiliation, p.paper_count != null ? plural(p.paper_count, 'paper') : null].filter(Boolean).join(' · ');
  return (
    <section className="my-prosopia">
      <Icon name="user" size={18} />
      <div className="my-prosopia-body">
        <div className="field-label">Your Prosopia profile {rid != null && <Badge tone="ok">Connected</Badge>}</div>
        <b>{p.name}</b>
        <span className="small muted">
          {facts}
          {rid != null && data?.imported_at && <>{facts ? ' · ' : ''}Last imported {fmtDate(data.imported_at)}</>}
          {' · '}<a href={p.url} target="_blank" rel="noreferrer" className="linklike">On Prosopia <Icon name="external" size={11} /></a>
        </span>
        {importNow.error && <span className="field-error">{importNow.error}</span>}
      </div>
      <div className="my-prosopia-actions">
        {rid == null ? (
          <Button variant="primary" icon="upload" onClick={() => importNow.run()} loading={importNow.busy} title={`Save ${p.name} as a ${TERMS.profile}, with every paper`}>Import</Button>
        ) : (
          <>
            <Button icon="refresh" onClick={() => navigate(paths.profile(rid, true))}>Check for new papers</Button>
            <Link href={paths.profile(rid)} className="btn btn-secondary btn-md">Open</Link>
          </>
        )}
      </div>
    </section>
  );
}
