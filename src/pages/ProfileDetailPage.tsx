import { useEffect, useState } from 'react';
import { useResearcher, useResearcherSuggestions } from '../api/hooks';
import { createInterestFromResearcher, deleteResearcher, getResearcherWorks } from '../api/endpoints/researchers';
import { resetDraft, setDraft } from '../lib/draft';
import { errorMessage, fmtDateTime, fmtRelative, plural } from '../lib/format';
import { researcherJobKey, startResearcherImport, useRunningJob } from '../lib/jobs';
import { navigate, paths } from '../lib/router';
import { useQuery } from '../lib/query';
import { TERMS } from '../lib/terms';
import { toast } from '../lib/toast';
import type { Profile } from '../types/radar';
import type { ResearcherPaper, SuggestedInterest } from '../types/researchers';
import { Badge, Button, Callout, EmptyState, ErrorBox, Field, Icon, Input, LoadingRows, Panel, Stat, Swatch, Tabs, confirmDialog, useAction } from '../ui';
import { Link } from '../ui/Link';
import { HealthBadge, JobProgress, agreementTone } from '../ui/domain';
import { PaperLink, PaperPickList, defaultPicks, orcidPickWorks, prosopiaPickWorks, type PickWork } from '../ui/pickers';
import type { OrcidWork, ProsopiaWork } from '../types/prosopia';
import type { Researcher } from '../types/researchers';

type Tab = 'suggested' | 'papers' | 'interests' | 'about';

/**
 * One stored researcher: their papers, the interests built from them,
 * and what the source published about them. The primary action is
 * building another interest, which opens the wizard with this profile
 * preselected.
 */
export function ProfileDetailPage({ id }: { id: number }) {
  const { data, loading, error, refresh } = useResearcher(id);
  const [tab, setTab] = useState<Tab>('suggested');
  const running = useRunningJob('import', researcherJobKey(id));
  const r = data?.researcher;

  // An import started elsewhere (another tab, or before a reload that
  // lost the job tracker) is only visible through ``importing``; poll
  // until it clears so the papers appear without a manual refresh.
  const importingRemotely = !!r?.importing && !running;
  useEffect(() => {
    if (!importingRemotely) return;
    const t = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(t);
  }, [importingRemotely, refresh]);

  // "Check for new papers" reads the source again and offers only the
  // works not saved yet. The old Re-import imported everything the source
  // lists: papers deselected the first time came back, and every paper
  // was resolved against OpenAlex again.
  const [checking, setChecking] = useState(false);

  async function forget() {
    if (!r) return;
    const ok = await confirmDialog({
      title: `Forget ${r.name}?`,
      body: (
        <>
          <p>The {TERMS.profile} and its list of {plural(r.n_papers, 'paper')} are removed.</p>
          <p>{r.n_interests > 0 ? `The ${plural(r.n_interests, TERMS.interest)} built from it keep their seeds and carry on scanning. ` : ''}Papers that seed one of your {TERMS.interests} stay in your vault; the others leave it with this {TERMS.profile}.</p>
        </>
      ),
      confirmLabel: 'Forget',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteResearcher(r.id);
      toast.success(`Forgot ${r.name}.`);
      navigate(paths.profiles);
    } catch (e) {
      toast.error(`Couldn't remove the ${TERMS.profile}: ${errorMessage(e)}`);
    }
  }

  if (error && !data) {
    const notFound = /404|not found/i.test(errorMessage(error));
    return (
      <div className="page">
        {notFound
          ? <EmptyState icon="alert" title={`No ${TERMS.profile} with id ${id}`} body="It may have been removed, or the link is wrong." action={<Link href={paths.profiles} className="btn">All {TERMS.profiles}</Link>} />
          : <ErrorBox message={errorMessage(error)} onRetry={refresh} />}
      </div>
    );
  }
  if (!data || !r) {
    return <div className="page">{loading ? <LoadingRows rows={4} /> : <ErrorBox message="Nothing came back." onRetry={refresh} />}</div>;
  }
  const importing = !!running || r.importing;

  return (
    <div className="page">
      <nav className="crumbs"><Link href={paths.profiles}>{TERMS.Profiles}</Link><Icon name="chevron-right" size={12} /><span>{r.name}</span></nav>
      <header className="page-head">
        <div>
          <h1 className="page-title">
            <Icon name="user" size={18} />
            {r.name}
            <Badge tone={r.source === 'prosopia' ? 'info' : 'neutral'}>{r.source === 'prosopia' ? 'Prosopia' : 'ORCID'}</Badge>
          </h1>
          <p className="page-sub">
            {[r.affiliation, r.orcid ? `ORCID ${r.orcid}` : null].filter(Boolean).join(' · ')}
            {r.url && <> · <a href={r.url} target="_blank" rel="noreferrer" className="linklike">{r.source === 'prosopia' ? 'Open on Prosopia' : 'Open on orcid.org'} <Icon name="external" size={11} /></a></>}
          </p>
        </div>
        <div className="page-actions">
          <Button icon="refresh" onClick={() => setChecking(true)} disabled={importing || checking} title={`Read ${r.source === 'prosopia' ? 'the Prosopia profile' : 'OpenAlex for this ORCID'} again and pick the papers that are new`}>Check for new papers</Button>
          <Button variant="danger" icon="trash" onClick={forget} disabled={importing}>Forget</Button>
          <Button variant="primary" icon="plus" onClick={() => navigate(paths.wizardFrom('profile', r.id))} disabled={r.n_papers === 0} title={r.n_papers === 0 ? 'No papers to build from yet' : undefined}>{TERMS.newInterest} from these papers</Button>
        </div>
      </header>

      {running && <div style={{ marginBottom: 16 }}><JobProgress job={running} /></div>}
      {!running && r.importing && <Callout tone="info" title="Importing" icon="clock">The papers are still being matched and embedded. This page refreshes on its own.<span style={{ marginLeft: 8 }}><button type="button" className="linklike" onClick={() => void refresh()}>Refresh now</button></span></Callout>}
      {!importing && r.last_error && <Callout tone="err" title="The last import failed">{r.last_error} <button type="button" className="linklike" onClick={() => setChecking(true)}>Try again</button></Callout>}
      {checking && !importing && <NewPapersPanel researcher={r} onClose={() => setChecking(false)} />}

      <div className="stat-grid" style={{ marginBottom: 18 }}>
        <Stat label="Papers" value={r.n_papers} sub={r.imported_at ? `imported ${fmtRelative(r.imported_at)}` : 'not imported yet'} />
        <Stat label={TERMS.Interests} value={r.n_interests} sub={r.n_interests === 0 ? 'none built from this profile yet' : 'built from these papers'} />
        <Stat label="Unmatched" value={data.papers.filter((p) => p.resolved_by === 'none').length} sub="papers not found on OpenAlex; embedded from their summary" />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'suggested', label: `Suggested ${TERMS.interests}` },
          { id: 'papers', label: 'Papers', count: data.papers.length },
          { id: 'interests', label: TERMS.Interests, count: data.interests.length },
          { id: 'about', label: 'About' },
        ]}
      />

      {tab === 'suggested' && <SuggestedTab researcherId={r.id} researcherName={r.name} papers={data.papers} importing={importing} />}
      {tab === 'papers' && <PapersTab papers={data.papers} />}
      {tab === 'interests' && <InterestsTab interests={data.interests} researcherId={r.id} nPapers={r.n_papers} />}
      {tab === 'about' && (
        <Panel title="About" description={`What ${r.source === 'prosopia' ? 'the Prosopia profile' : 'OpenAlex'} says about this researcher. Stored as read; Radar does not add to it.`}>
          <dl className="doc-detail" style={{ border: 0, background: 'transparent', padding: 0 }}>
            <div><dt>Name</dt><dd>{r.name}</dd></div>
            {r.affiliation && <div><dt>Affiliation</dt><dd>{r.affiliation}</dd></div>}
            {r.orcid && <div><dt>ORCID</dt><dd className="mono">{r.orcid}</dd></div>}
            <div><dt>Source</dt><dd>{r.source === 'prosopia' ? `Prosopia profile "${r.key}"${r.base_url ? ` at ${r.base_url}` : ''}` : `OpenAlex works by ORCID ${r.key}`}</dd></div>
            <div><dt>Imported</dt><dd>{r.imported_at ? fmtDateTime(r.imported_at) : '—'}</dd></div>
            {data.expertise && <div><dt>Expertise</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{data.expertise}</dd></div>}
            {data.grants.length > 0 && (
              <div>
                <dt>Grants</dt>
                <dd>
                  {data.grants.map((g, i) => (
                    <div key={i} className="small">{String(g.name ?? g.title ?? g.id ?? 'Grant')}{g.funder ? ` · ${String(g.funder)}` : ''}{g.role ? ` · ${String(g.role)}` : ''}</div>
                  ))}
                </dd>
              </div>
            )}
            {!r.affiliation && !data.expertise && data.grants.length === 0 && <p className="muted small">Only the name and papers were available from this source.</p>}
          </dl>
        </Panel>
      )}
    </div>
  );
}

function PapersTab({ papers }: { papers: ResearcherPaper[] }) {
  if (papers.length === 0) return <Panel title="Papers"><p className="muted small">No papers yet.</p></Panel>;
  return (
    <Panel title="Papers" description="Everything imported for this researcher. Any subset can seed an interest." className="panel-flush">
      {papers.map((p, i) => (
        <div className="rp-row" key={p.id}>
          <span className="idx">{String(i + 1).padStart(2, '0')}</span>
          <span>
            <div className="rp-title"><PaperLink title={p.title} id={p.id} doi={p.doi} /></div>
            <div className="rp-meta">{[p.year, p.venue, p.authors.length > 3 ? `${p.authors.slice(0, 3).join(', ')} +${p.authors.length - 3}` : p.authors.join(', ')].filter(Boolean).join(' · ')}</div>
          </span>
          <span className="rp-side">
            {p.resolved_by === 'none' ? <span className="pick-type" title="Not found on OpenAlex; embedded from the profile's summary">unmatched</span> : p.resolved_by === 'title' ? <span className="pick-type" title="Matched to OpenAlex by title search; worth a glance">by title</span> : null}
            {p.doi && <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer" className="linklike small" title={p.doi}>doi <Icon name="external" size={10} /></a>}
            {!p.doi && p.id.startsWith('https://openalex.org/') && <a href={p.id} target="_blank" rel="noreferrer" className="linklike small">openalex <Icon name="external" size={10} /></a>}
          </span>
        </div>
      ))}
    </Panel>
  );
}

function InterestsTab({ interests, researcherId, nPapers }: { interests: Profile[]; researcherId: number; nPapers: number }) {
  if (interests.length === 0) {
    return (
      <EmptyState
        icon="interests"
        title={`No ${TERMS.interests} from this ${TERMS.profile} yet`}
        body={`Pick some of the papers and Radar starts a draft with them as seeds. You can build several ${TERMS.interests} this way, one per topic.`}
        action={nPapers > 0 ? <Link href={paths.wizardFrom('profile', researcherId)} className="btn btn-primary"><Icon name="plus" size={14} /> {TERMS.newInterest}</Link> : undefined}
      />
    );
  }
  return (
    <Panel title={TERMS.Interests} description={`Built from this ${TERMS.profile}'s papers. Drafts open in the wizard.`} className="panel-flush">
      {interests.map((p) => (
        <Link key={p.key} href={p.isDraft ? paths.wizard(p.key) : paths.interest(p.key)} className="row spread" style={{ padding: '10px 18px', borderBottom: '1px solid var(--line)', color: 'inherit', textDecoration: 'none' }}>
          <span className="row" style={{ minWidth: 0 }}>
            <Swatch hue={p.hue} />
            <span className="truncate" style={{ fontWeight: 500 }}>{p.name}</span>
            <span className="small muted">{plural(p.seeds, 'seed')}</span>
          </span>
          <span className="row">
            {p.isDraft ? <Badge tone="warn">draft</Badge> : <HealthBadge profile={p} />}
            <Icon name="chevron-right" size={14} />
          </span>
        </Link>
      ))}
    </Panel>
  );
}

/**
 * Two or three groups found in the papers' embeddings, each one click
 * from being a draft. Papers that fit no group are left out on purpose;
 * the pick list on each card lets the user adjust before creating.
 */
function SuggestedTab({ researcherId, researcherName, papers, importing }: { researcherId: number; researcherName: string; papers: ResearcherPaper[]; importing: boolean }) {
  const { data, error, refresh } = useResearcherSuggestions(importing ? null : researcherId);
  if (importing) return <Callout tone="info" title="Waiting for the import">Suggestions are worked out from the papers' embeddings once the import has finished.</Callout>;
  if (error && !data) return <ErrorBox message={errorMessage(error)} onRetry={refresh} />;
  if (!data) return <LoadingRows rows={3} label="Grouping papers" />;
  if (data.suggestions.length === 0) {
    return <EmptyState icon="interests" title="Nothing to suggest yet" body={data.note ?? 'This profile has no embedded papers.'} />;
  }
  const byId = new Map(papers.map((p) => [p.id, p]));
  const leftOut = data.n_embedded - data.n_grouped;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <p className="small muted" style={{ margin: 0 }}>
        {data.suggestions.length === 1
          ? (data.note ?? 'One group covers these papers.')
          : `${data.suggestions.length} groups found in ${data.n_grouped} of ${data.n_embedded} papers${leftOut > 0 ? `; ${plural(leftOut, 'paper')} fit no group and ${leftOut === 1 ? 'is' : 'are'} left out` : ''}. Each is a starting point: untick what does not belong, then create it and the wizard checks the agreement.`}
        {data.note && data.suggestions.length > 1 && <> {data.note}</>}
      </p>
      {data.suggestions.map((s, i) => <SuggestionCard key={`${s.name}-${i}`} suggestion={s} researcherId={researcherId} researcherName={researcherName} byId={byId} />)}
    </div>
  );
}

function SuggestionCard({ suggestion: s, researcherId, researcherName, byId }: { suggestion: SuggestedInterest; researcherId: number; researcherName: string; byId: Map<string, ResearcherPaper> }) {
  const [name, setName] = useState(s.name);
  const [open, setOpen] = useState(false);
  const works: PickWork[] = [...s.paper_ids, ...s.loose_ids].map((id) => {
    const p = byId.get(id);
    return { id, title: p?.title ?? id, year: p?.year ?? null, venue: p?.venue ?? null, authors: p?.authors ?? [], note: s.loose_ids.includes(id) ? 'loosely related' : null };
  });
  const [picked, setPicked] = useState<Set<string>>(() => new Set(s.paper_ids));
  const create = useAction(async () => {
    if (picked.size === 0 || !name.trim()) return;
    const res = await createInterestFromResearcher(researcherId, { name: name.trim(), openalex_ids: Array.from(picked) });
    toast.success(`Draft "${res.draft.name}" created with ${plural(res.n_seeds, 'seed')}.`);
    // Hand the wizard the draft directly; the interests list it would
    // otherwise look the slug up in is still refreshing.
    resetDraft();
    setDraft({ slug: res.draft.slug, name: res.draft.name, source: 'profile', researcher: { id: researcherId, name: researcherName, nSeeds: res.n_seeds }, step: 1 });
    navigate(paths.wizard(res.draft.slug));
  });
  const tone = agreementTone(s.agreement);
  return (
    <Panel
      title={s.name}
      description={`${plural(s.paper_ids.length, 'paper')}${s.loose_ids.length > 0 ? ` + ${s.loose_ids.length} loosely related` : ''} · ${s.topics.slice(0, 3).map((t) => t.name).join(' · ')}`}
      actions={s.agreement != null ? <Badge tone={tone} title="How much these papers agree with each other, 0–100">{s.agreement}/100 · {s.label}</Badge> : undefined}
    >
      <div className="stack" style={{ gap: 12 }}>
        {!open && (
          <ul className="small" style={{ margin: 0, paddingLeft: 18, color: 'var(--fg-2)' }}>
            {s.seed_titles.map((t) => <li key={t}>{t}</li>)}
            {s.paper_ids.length > s.seed_titles.length && <li className="muted">and {s.paper_ids.length - s.seed_titles.length} more</li>}
          </ul>
        )}
        {open && <PaperPickList works={works} picked={picked} onChange={setPicked} ariaLabel={`Papers for ${s.name}`} />}
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="row">
          <Button variant="primary" icon="plus" onClick={() => create.run()} loading={create.busy} disabled={picked.size === 0 || !name.trim()}>Create {TERMS.interest} with {plural(picked.size, 'paper')}</Button>
          <Button variant="ghost" onClick={() => setOpen((o) => !o)}>{open ? 'Hide papers' : 'Choose papers'}</Button>
          {create.error && <span className="field-error">{create.error}</span>}
        </div>
      </div>
    </Panel>
  );
}

/**
 * The works on the researcher's source that are not saved yet, to pick
 * from. Only the picked ones are imported (``paper_ids``); the import adds
 * and never removes. Interests already built from this profile keep their
 * seeds: a new paper becomes a seed through the interest's Seeds step.
 */
function NewPapersPanel({ researcher: r, onClose }: { researcher: Researcher; onClose: () => void }) {
  const q = useQuery(`researchers/${r.id}/works`, () => getResearcherWorks(r.id));
  const fresh: PickWork[] = q.data
    ? (q.data.source === 'orcid' ? orcidPickWorks(q.data.works as OrcidWork[]) : prosopiaPickWorks(q.data.works as ProsopiaWork[]))
        .filter((w) => !q.data!.saved_ids.includes(w.id))
    : [];
  const [picked, setPicked] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (q.data && picked === null) setPicked(new Set(defaultPicks(fresh).map((w) => w.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);
  const sel = picked ?? new Set<string>();
  const add = useAction(async () => {
    const ids = fresh.filter((w) => sel.has(w.id)).map((w) => w.id);
    if (ids.length === 0) return;
    await startResearcherImport(r.source, r.key, r.name, ids, r.base_url);
    toast.success(`Importing ${plural(ids.length, 'new paper')} for ${r.name}.`);
    onClose();
  });
  return (
    <Panel
      title="New papers"
      description={`What ${r.source === 'prosopia' ? 'the Prosopia profile' : 'OpenAlex'} lists for ${r.name} now, minus the ${plural(r.n_papers, 'paper')} already saved.`}
      actions={<Button size="sm" variant="ghost" onClick={onClose}>Close</Button>}
    >
      {q.error && <ErrorBox compact title="Couldn't read the source" message={errorMessage(q.error)} onRetry={q.refresh} />}
      {!q.data && q.loading && <LoadingRows rows={3} />}
      {q.data && fresh.length === 0 && (
        <EmptyState compact icon="check" title="Nothing new" body={`All ${plural(q.data.works.length, 'paper')} on the source are already saved.`} />
      )}
      {fresh.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <PaperPickList works={fresh} picked={sel} onChange={setPicked} ariaLabel="New papers to import" />
          <div className="row">
            <Button variant="primary" icon="upload" onClick={() => add.run()} loading={add.busy} disabled={sel.size === 0}>Import {plural(sel.size, 'paper')}</Button>
            {add.error && <span className="field-error">{add.error}</span>}
          </div>
          <p className="small muted">{TERMS.Interests} built from this {TERMS.profile} keep their seeds. To use a new paper in one, add it on that {TERMS.interest}'s Seeds step.</p>
        </div>
      )}
    </Panel>
  );
}
