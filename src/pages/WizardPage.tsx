import { useEffect, useMemo, useRef, useState } from 'react';
import { useProfiles, useResearcher, useResearchers, useVaultDocs } from '../api/hooks';
import { uploadPdf } from '../api/endpoints/vault';
import { createInterestFromResearcher } from '../api/endpoints/researchers';
import {
  commitDraft,
  createDraft,
  deleteDraft,
  getDraftCoherence,
  getDraftTopics,
  removeDraftSeed,
  type DraftCoherence,
  type DraftDryRun,
} from '../api/endpoints/wizard';
import { getDraft, isSeedSource, resetDraft, useDraft, type DraftState, type SeedSource } from '../lib/draft';
import { errorMessage, plural } from '../lib/format';
import { findJob, startDryRun, startImport, startOrcidImport, startScan, useJob, type Job } from '../lib/jobs';
import { useQuery, invalidate } from '../lib/query';
import { navigate, paths } from '../lib/router';
import { TERMS } from '../lib/terms';
import { toast } from '../lib/toast';
import type { ProsopiaImportResult } from '../types/prosopia';
import { Button, Callout, EmptyState, ErrorBox, Field, Icon, IconButton, Input, LoadingRows, Panel, Select, confirmDialog, useAction } from '../ui';
import { Link } from '../ui/Link';
import { CoherenceHistogram, JobProgress, ThresholdHistogram, agreementTone, axisFor } from '../ui/domain';
import { LookupPicker, ORCID_LOOKUP, PROSOPIA_LOOKUP, PaperPickList, papersOf, type Lookup, type PickWork } from '../ui/pickers';

const STEPS = [
  { n: 1, label: 'Seeds', hint: 'name it, add papers' },
  { n: 2, label: 'Check', hint: 'do the papers agree?' },
  { n: 3, label: 'Topics', hint: 'what to search for' },
  { n: 4, label: 'Threshold', hint: 'how strict, then save' },
];

const DEFAULT_CRON = '0 4 * * *';
const DEFAULT_TZ = 'UTC';

const SOURCES: { source: SeedSource; icon: import('../ui').IconName; title: string; body: string }[] = [
  { source: 'upload', icon: 'upload', title: 'Papers you have', body: 'Upload PDFs. Radar reads each one and finds it on OpenAlex.' },
  { source: 'orcid', icon: 'id', title: 'An ORCID', body: "A researcher's papers on OpenAlex. You pick which ones count." },
  { source: 'prosopia', icon: 'interests', title: 'A Prosopia profile', body: 'The papers on a Prosopia researcher profile. You pick which ones count.' },
  { source: 'profile', icon: 'user', title: `A saved ${TERMS.profile}`, body: `Papers from a ${TERMS.profile} you already imported. No waiting: they are ready to use.` },
];

export function WizardPage({ draftSlug, source, researcher }: { draftSlug: string | null; source: string | null; researcher?: number | null }) {
  const { state, update, reset } = useDraft();

  // ``?source=`` preselects where the seeds come from (from the home
  // page's entry points, or a profile's "new interest" button). It is a
  // request for a *new* interest: a draft still open in this tab is set
  // aside (it stays on the server, under Interests → Drafts) rather
  // than resumed. Applied once per URL value: re-applying on every
  // state change would snap the picker back to the URL's source
  // whenever the user clicked another one.
  const appliedSource = useRef<string | null>(null);
  useEffect(() => {
    if (draftSlug || !isSeedSource(source) || appliedSource.current === source) return;
    appliedSource.current = source;
    if (getDraft().slug) resetDraft();
    if (source !== getDraft().source) update({ source });
  }, [draftSlug, source, state.slug, state.source, update]);
  const { data: profiles } = useProfiles();
  const [resuming, setResuming] = useState(false);
  const staleCheck = useRef<unknown[] | 'done' | null>(null);

  // Resume a server-side draft from ``?draft=slug``; keep the URL in sync otherwise.
  // Reads the store directly rather than ``state``: the effect above may
  // have just cleared the draft in this same commit (and StrictMode
  // replays effects), and a stale slug here would push ``?draft=`` for
  // the draft that was set aside.
  useEffect(() => {
    const slug = getDraft().slug;
    if (draftSlug && draftSlug !== slug) {
      const row = profiles?.find((p) => p.key === draftSlug);
      if (!profiles) return;
      if (!row || !row.isDraft) {
        // Not a draft any more (just committed, or never existed): start clean.
        if (!row) toast.error(`No draft called "${draftSlug}".`);
        resetDraft();
        navigate(row ? paths.interest(row.key) : paths.wizard(), { replace: true });
        return;
      }
      resetDraft();
      update({ slug: row.key, name: row.name, step: 1, source: 'upload' });
      setResuming(true);
      return;
    }
    // A remembered draft that no longer exists on the server (deleted
    // elsewhere) must not be resumed. A draft created a moment ago (from
    // a profile's suggestion, say) is not in the cached list yet, so a
    // miss triggers one fresh fetch and only a second miss counts.
    // The second miss must come from a *different* list object: StrictMode
    // replays this effect with the same stale list, and that replay is
    // not evidence of anything.
    if (profiles && staleCheck.current !== 'done') {
      const missing = !!slug && !profiles.some((p) => p.key === slug && p.isDraft);
      if (!missing) {
        staleCheck.current = 'done';
      } else if (staleCheck.current === null) {
        staleCheck.current = profiles;
        invalidate('profiles');
        return;
      } else if (staleCheck.current !== profiles) {
        staleCheck.current = 'done';
        resetDraft();
        navigate(paths.wizard(), { replace: true });
        return;
      } else {
        return;
      }
    }
    if (!draftSlug && slug) navigate(paths.wizard(slug), { replace: true });
  }, [draftSlug, state.slug, profiles, update]);

  useEffect(() => {
    if (resuming && state.slug === draftSlug) setResuming(false);
  }, [resuming, state.slug, draftSlug]);

  const step = state.step;
  const canGo = (n: number) => n < step || (n === 2 && !!state.slug) || (n === 3 && !!state.slug && step >= 3) || n === step;

  async function cancel() {
    if (!state.slug) {
      reset();
      navigate(paths.interests);
      return;
    }
    const ok = await confirmDialog({
      title: 'Discard this draft?',
      body: (
        <>
          <p>"{state.name}" and its uploaded seeds will be deleted.</p>
          <p>If you would rather come back later, just leave this page: the draft stays under {TERMS.Interests} → Drafts.</p>
        </>
      ),
      confirmLabel: 'Delete draft',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteDraft(state.slug);
      toast.success('Draft deleted.');
    } catch (e) {
      toast.error(`Couldn't delete the draft on the server: ${errorMessage(e)}`);
    }
    reset();
    navigate(paths.interests);
  }

  return (
    <div className="page">
      <nav className="crumbs"><Link href={paths.interests}>{TERMS.Interests}</Link><Icon name="chevron-right" size={12} /><span>{TERMS.newInterest}</span></nav>
      <header className="page-head">
        <div>
          <h1 className="page-title">{state.name ? state.name : TERMS.newInterest}</h1>
          <p className="page-sub">An {TERMS.interest} is a topic Radar follows for you, defined by a set of papers. Four short steps; your progress is saved as a draft, so you can leave and come back.</p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" onClick={() => navigate(paths.interests)} title="Keep the draft and come back later">Save for later</Button>
          <Button variant="danger" icon="trash" onClick={cancel}>{state.slug ? 'Delete draft' : 'Cancel'}</Button>
        </div>
      </header>

      <div className="wizard">
        <aside className="wizard-rail" aria-label="Steps">
          {STEPS.map((s) => {
            const cls = s.n === step ? 'current' : s.n < step ? 'done' : '';
            const clickable = s.n !== step && canGo(s.n);
            return (
              <div key={s.n} className={`wizard-step ${cls} ${clickable ? 'clickable' : ''}`} onClick={() => clickable && update({ step: s.n })} role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : -1} onKeyDown={(e) => { if (clickable && (e.key === 'Enter' || e.key === ' ')) update({ step: s.n }); }}>
                <span className="wizard-step-n">{s.n < step ? <Icon name="check" size={12} /> : s.n}</span>
                <span>{s.label}<small>{s.hint}</small></span>
              </div>
            );
          })}
        </aside>
        <div>
          {resuming ? <LoadingRows rows={3} /> : (
            <>
              {step === 1 && <StepSeeds state={state} preselectResearcher={researcher ?? null} />}
              {step === 2 && <StepCheck state={state} />}
              {step === 3 && <StepTopics state={state} />}
              {step === 4 && <StepThreshold state={state} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Step 1 ------------------------------------------------------------------

function StepSeeds({ state, preselectResearcher }: { state: DraftState; preselectResearcher: number | null }) {
  const { update, addSeed } = useDraft();
  const [name, setName] = useState(state.name);
  const importJob = useJob(state.importJobId);
  const create = useAction(async () => {
    const d = await createDraft(name.trim());
    update({ slug: d.slug, name: d.name, source: 'upload' });
  });

  // When an import finishes, record its result and continue.
  useEffect(() => {
    if (!importJob || importJob.status !== 'done') return;
    const r = importJob.result as ProsopiaImportResult | null;
    update({
      slug: (r?.draft_slug as string | undefined) ?? importJob.profileKey,
      name: (r?.name as string | undefined) ?? importJob.profileName,
      prosopia: { ref: state.prosopia?.ref ?? '', nSeeds: typeof r?.drafted === 'number' ? r.drafted : null },
    });
  }, [importJob, update, state.prosopia?.ref]);

  if (!state.slug) {
    return (
      <Panel title="Step 1 · Name it and add seed papers" description="Seeds are the papers that define what you are interested in. 5–15 focused papers work best; one is enough to start.">
        <div className="stack" style={{ gap: 16 }}>
          <Field label="Name" hint={state.source === 'upload' ? 'How this interest appears in the feed and the sidebar.' : state.source === 'profile' ? "How this interest appears in the feed and the sidebar. Several interests can come from one profile, so say what this one is about." : "How this interest appears in the feed and the sidebar. Leave it blank to use the researcher's name."}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Neonatal vital-sign monitoring" autoFocus onKeyDown={(e) => { if (e.key === 'Enter' && state.source === 'upload') void create.run(); }} />
          </Field>
          <div>
            <div className="field-label" style={{ marginBottom: 8 }}>Where do the seeds come from?</div>
            <div className="source-picker" role="radiogroup">
              {SOURCES.map((o) => (
                <button key={o.source} type="button" role="radio" aria-checked={state.source === o.source} className={`source-option ${state.source === o.source ? 'on' : ''}`} disabled={importJob?.status === 'running'} onClick={() => update({ source: o.source })}>
                  <Icon name={o.icon} />
                  <div><b>{o.title}</b><span>{o.body}</span></div>
                </button>
              ))}
            </div>
          </div>
          {state.source === 'upload' && (
            <div className="row">
              <Button variant="primary" iconRight="arrow-right" onClick={() => create.run()} loading={create.busy} disabled={!name.trim()}>Create draft and add PDFs</Button>
              {create.error && <span className="field-error">{create.error}</span>}
            </div>
          )}
          {state.source === 'orcid' && <WorkPicker key="orcid" name={name.trim()} lookup={ORCID_LOOKUP} start={(orcid, ids, n) => startOrcidImport(orcid, ids, n)} />}
          {state.source === 'prosopia' && <WorkPicker key="prosopia" name={name.trim()} lookup={PROSOPIA_LOOKUP} start={(slug, ids, n) => startImport(slug, n, ids)} />}
          {state.source === 'profile' && <ResearcherSeedPicker key="profile" name={name.trim()} preselect={preselectResearcher} />}
        </div>
      </Panel>
    );
  }
  return <SeedUploader state={state} addSeed={addSeed} />;
}

/**
 * The wizard's lookup pickers (ORCID, Prosopia): the shared picker plus
 * the draft bookkeeping. The import creates the draft on the server,
 * so the job's key is the draft slug and step 1 continues there.
 */
function WorkPicker({ name, lookup, start }: { name: string; lookup: Lookup; start: (key: string, ids: string[], name?: string) => Promise<Job> }) {
  const { state, update } = useDraft();
  const importJob = useJob(state.importJobId);
  return (
    <LookupPicker
      lookup={lookup}
      job={importJob}
      initialRaw={state.prosopia?.ref ?? ''}
      start={(key, ids) => start(key, ids, name || undefined)}
      onStarted={(job, listing) => {
        update({ importJobId: job.id, name: name || listing.name || job.profileName, slug: job.profileKey, prosopia: { ref: listing.key, nSeeds: null } });
      }}
    />
  );
}

/**
 * Seeds from a stored profile. Nothing is imported: the papers were
 * resolved and embedded when the profile was, so creating the draft is
 * one request and the wizard continues to the seed list at once.
 */
function ResearcherSeedPicker({ name, preselect }: { name: string; preselect: number | null }) {
  const { update } = useDraft();
  const list = useResearchers();
  const [id, setId] = useState<number | null>(preselect);
  const chosenId = id ?? (list.data && list.data.length > 0 ? list.data[0].id : null);
  const detail = useResearcher(chosenId);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const papers = detail.data?.papers ?? [];
  const works: PickWork[] = useMemo(() => papers.map((p) => ({ id: p.id, title: p.title, year: p.year, venue: p.venue, authors: p.authors, note: p.resolved_by === 'none' ? 'unmatched' : null })), [papers]);
  // Every paper starts ticked once the list is known; changing profile resets the selection.
  useEffect(() => { setPicked(null); }, [chosenId]);
  const current = picked ?? new Set(papersOf(works).map((w) => w.id));
  const researcher = detail.data?.researcher ?? list.data?.find((r) => r.id === chosenId) ?? null;
  const finalName = name || (researcher ? `${researcher.name}'s papers` : '');

  const create = useAction(async () => {
    if (chosenId == null || current.size === 0 || !finalName.trim()) return;
    const res = await createInterestFromResearcher(chosenId, { name: finalName.trim(), openalex_ids: Array.from(current) });
    update({ slug: res.draft.slug, name: res.draft.name, source: 'profile', researcher: { id: chosenId, name: researcher?.name ?? '', nSeeds: res.n_seeds }, prosopia: null, importJobId: null });
    toast.success(`Draft created with ${plural(res.n_seeds, 'seed')}.`);
  });

  if (list.error && !list.data) return <ErrorBox compact message={errorMessage(list.error)} onRetry={list.refresh} />;
  if (list.loading && !list.data) return <LoadingRows rows={2} />;
  if (list.data && list.data.length === 0) {
    return (
      <EmptyState compact icon="user" title={`No saved ${TERMS.profiles} yet`} body={`Import a researcher under ${TERMS.Profiles} first, or use an ORCID or a Prosopia profile here: importing either also saves the ${TERMS.profile}.`} action={<Link href={paths.profiles} className="btn">Open {TERMS.Profiles}</Link>} />
    );
  }
  return (
    <div className="stack">
      <Field label={TERMS.Profile} hint={`Whose papers to start from. Manage these under ${TERMS.Profiles}.`}>
        <Select value={chosenId ?? ''} onChange={(e) => setId(Number(e.target.value))}>
          {(list.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name} · {r.n_papers} papers{r.importing ? ' (importing…)' : ''}</option>)}
        </Select>
      </Field>
      {detail.error && !detail.data && <ErrorBox compact message={errorMessage(detail.error)} onRetry={detail.refresh} />}
      {detail.loading && !detail.data && <LoadingRows rows={3} />}
      {detail.data && works.length === 0 && (
        <EmptyState compact icon="search" title={`This ${TERMS.profile} has no papers yet`} body={researcher?.importing ? 'Its import is still running. Come back in a moment.' : `Re-import it under ${TERMS.Profiles}, or choose another source.`} />
      )}
      {detail.data && works.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <PaperPickList works={works} picked={current} onChange={setPicked} head={researcher?.name ?? null} ariaLabel="Papers to use as seeds" />
          <div className="row">
            <Button variant="primary" iconRight="arrow-right" onClick={() => create.run()} loading={create.busy} disabled={current.size === 0 || !finalName.trim()}>Create draft with {plural(current.size, 'seed')}</Button>
            {!name && researcher && <span className="small muted">Named "{finalName}" unless you type a name above.</span>}
            {create.error && <span className="field-error">{create.error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Take a seed out of the draft, after a confirm (an imported paper can't
 * be re-added one at a time). Topics and the dry run depend on the seeds,
 * so their choices are cleared and recomputed on the way forward.
 */
function useRemoveSeed(slug: string) {
  const { update, removeSeed } = useDraft();
  const [busyId, setBusyId] = useState<string | null>(null);
  async function remove(id: string, title: string) {
    const ok = await confirmDialog({
      title: 'Remove this seed?',
      body: <p>"{title || id}" will no longer count towards this {TERMS.interest}. The paper stays in your library, and you can upload it again later.</p>,
      confirmLabel: 'Remove seed',
      danger: true,
    });
    if (!ok) return false;
    setBusyId(id);
    try {
      await removeDraftSeed(slug, id);
      removeSeed(id);
      update({ selectedTopicIds: null, dryRunJobId: null, threshold: null });
      toast.success('Seed removed.');
      return true;
    } catch (e) {
      toast.error(`Couldn't remove the seed: ${errorMessage(e)}`);
      return false;
    } finally {
      setBusyId(null);
    }
  }
  return { remove, busyId };
}

function SeedUploader({ state, addSeed }: { state: DraftState; addSeed: (d: import('../types/radar').VaultDoc) => void }) {
  const { update } = useDraft();
  const slug = state.slug!;
  const docs = useVaultDocs(slug);
  const importJob = useJob(state.importJobId);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const seeds = docs.data ?? state.seeds;
  const importing = importJob?.status === 'running';
  const removal = useRemoveSeed(slug);
  const haveSeeds = seeds.length > 0;
  // Back to the source picker. The draft on the server is thrown away
  // (an import creates one per attempt) and the wizard keeps the name.
  const startOver = useAction(async () => {
    if (seeds.length > 0) {
      const ok = await confirmDialog({ title: 'Start over?', body: `This deletes the draft "${state.name}" and its ${plural(seeds.length, 'seed')}. The name and source choice are kept.`, confirmLabel: 'Start over', danger: true });
      if (!ok) return;
    }
    try {
      await deleteDraft(slug);
    } catch {
      /* an orphaned draft is harmless; the list shows it under Drafts */
    }
    // Drop ``?draft=`` first: with it still in the URL the resume effect
    // would re-adopt the draft from the not-yet-refreshed interests list.
    navigate(paths.wizard(), { replace: true });
    update({ slug: null, seeds: [], prosopia: null, researcher: null, importJobId: null, dryRunJobId: null, selectedTopicIds: null, threshold: null, step: 1 });
  });

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setFailures([]);
    for (let i = 0; i < list.length; i++) {
      setProgress({ done: i, total: list.length, current: list[i].name });
      try {
        const doc = await uploadPdf(list[i], slug);
        addSeed(doc);
      } catch (e) {
        setFailures((f) => [...f, `${list[i].name}: ${errorMessage(e)}`]);
      }
    }
    setProgress(null);
    invalidate(`vault/docs?tag=${slug}`);
  }

  return (
    <Panel title="Step 1 · Seed papers" description={state.researcher ? `${plural(state.researcher.nSeeds, 'paper')} from the ${TERMS.profile} of ${state.researcher.name}. You can add more PDFs.` : state.prosopia ? (state.source === 'orcid' ? `Imported ${state.prosopia.nSeeds != null ? `${state.prosopia.nSeeds} papers ` : ''}from ORCID ${state.prosopia.ref}. You can add more PDFs.` : `Imported from Prosopia (${state.prosopia.ref}). You can add more PDFs.`) : 'Upload the PDFs that define this interest. Each becomes a seed.'}>
      {!importing && (
        <p className="small muted" style={{ marginTop: -6, marginBottom: 12 }}>
          Wrong source? <button type="button" className="linklike" onClick={() => void startOver.run()} disabled={startOver.busy}>Choose a different way to add seeds</button>{seeds.length > 0 ? ' — this discards the draft and its seeds.' : '.'}
        </p>
      )}
      {importing && importJob && <div style={{ marginBottom: 14 }}><JobProgress job={importJob} /></div>}
      <div
        className={`dropzone ${over ? 'over' : ''} ${progress ? 'busy' : ''}`}
        onClick={() => !progress && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void upload(e.dataTransfer.files); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
      >
        <Icon name="upload" size={20} />
        {progress ? (
          <span>Uploading {progress.done + 1} of {progress.total}: <b>{progress.current}</b></span>
        ) : (
          <span><b>Drop PDFs here</b> or click to browse. Several at once is fine.</span>
        )}
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
      </div>
      {failures.length > 0 && <div style={{ marginTop: 10 }}><ErrorBox compact title="Some files were not added" message={failures.map((f) => <div key={f}>{f}</div>)} /></div>}

      <div style={{ marginTop: 16 }}>
        <div className="row spread" style={{ marginBottom: 6 }}>
          <span className="field-label">Seeds · {seeds.length}</span>
          {docs.fetching && <span className="small muted">refreshing…</span>}
        </div>
        {docs.error && !docs.data && <ErrorBox compact message={errorMessage(docs.error)} onRetry={docs.refresh} />}
        {seeds.length === 0 && !docs.loading && !importing && <p className="muted small">No seeds yet.</p>}
        {seeds.map((d, i) => (
          <div className="seed-row removable" key={d.id}>
            <span className="idx">{String(i + 1).padStart(2, '0')}</span>
            <span className="truncate" title={d.title}>{d.title || d.id}</span>
            <span className="muted small">{d.pages ? `${d.pages} pages` : ''}</span>
            <span className="muted small">{d.authors.slice(0, 2).join(', ')}</span>
            <IconButton icon="trash" size="sm" label={`Remove "${d.title || d.id}" from the seeds`} disabled={importing || !!progress || removal.busyId !== null} onClick={() => void removal.remove(d.id, d.title)} />
          </div>
        ))}
      </div>

      <div className="wizard-foot">
        <span className="note">
          {seeds.length === 0 ? 'Add at least one seed to continue.' : seeds.length === 1 ? 'One seed works, but coherence cannot be measured; the centroid is that paper.' : seeds.length < 5 ? 'A few more seeds would make the interest sharper.' : 'Good seed count.'}
        </span>
        <Button variant="primary" iconRight="arrow-right" disabled={!haveSeeds || importing || !!progress} onClick={() => update({ step: 2 })}>
          Next: check coherence
        </Button>
      </div>
    </Panel>
  );
}

// --- Step 2 ------------------------------------------------------------------

function StepCheck({ state }: { state: DraftState }) {
  const { update } = useDraft();
  const slug = state.slug!;
  const coh = useQuery(`draft/${slug}/coherence`, () => getDraftCoherence(slug));
  const c = coh.data;
  const verdict = c ? verdictFor(c) : null;
  const removal = useRemoveSeed(slug);
  async function removeAndRecheck(id: string, title: string) {
    if (!(await removal.remove(id, title))) return;
    // Nothing left to check: back to adding seeds.
    if (c && c.n <= 1) update({ step: 1 });
  }
  return (
    <Panel title="Step 2 · Do the seeds agree?" description="Radar checks whether your seed papers are about the same thing. Papers that agree make a sharp interest; a mix of topics makes a blurry one.">
      {coh.error && <ErrorBox message={errorMessage(coh.error)} onRetry={coh.refresh} />}
      {coh.loading && (
        <div className="row muted" style={{ padding: '18px 0' }}><span className="spinner" style={{ width: 16, height: 16 }} /> Computing coherence from {plural(state.seeds.length || 1, 'seed')}…</div>
      )}
      {c && verdict && (
        <div className="stack">
          <Callout tone={verdict.tone} title={verdict.title}>{verdict.body}</Callout>
          {c.n >= 2 && (
            <>
              <AgreementMeter agreement={c.agreement ?? null} n={c.n} />
              {c.least_similar && (
                <div className="stack" style={{ gap: 6 }}>
                  <div className="small muted">
                    Least alike pair (similarity {c.least_similar.cosine.toFixed(2)}). If one of them is off-topic, remove it and Radar re-checks the rest.
                  </div>
                  {[
                    { id: c.least_similar.a_id, title: c.least_similar.a_title },
                    { id: c.least_similar.b_id, title: c.least_similar.b_title },
                  ].map((p) => (
                    <div className="seed-row pair-row" key={p.id}>
                      <span className="truncate" title={p.title}>{p.title || p.id}</span>
                      <Button size="sm" variant="ghost" icon="trash" loading={removal.busyId === p.id} disabled={removal.busyId !== null || coh.fetching} onClick={() => void removeAndRecheck(p.id, p.title)}>Remove</Button>
                    </div>
                  ))}
                  <div className="small muted">To remove other seeds or add new ones, go <button type="button" className="linklike" onClick={() => update({ step: 1 })}>back to seeds</button>.</div>
                </div>
              )}
              <details>
                <summary className="small muted" style={{ cursor: 'pointer' }}>Technical detail</summary>
                <div className="row-wrap small muted" style={{ gap: 16, margin: '8px 0' }}>
                  <span>median pairwise cosine <b className="mono">{c.median.toFixed(3)}</b></span>
                  <span>spread (IQR) <b className="mono">{c.iqr.toFixed(3)}</b></span>
                  <span>{plural(c.n, 'seed')} · {((c.n * (c.n - 1)) / 2).toLocaleString()} pairs</span>
                  {c.seed_similarity && <span>each seed vs the others <b className="mono">{c.seed_similarity.min.toFixed(3)}–{c.seed_similarity.max.toFixed(3)}</b></span>}
                </div>
                <CoherenceHistogram bins={c.bins} />
              </details>
            </>
          )}
        </div>
      )}
      <div className="wizard-foot">
        <Button icon="arrow-left" onClick={() => update({ step: 1 })}>Back to seeds</Button>
        <div className="row">
          <Button variant="ghost" icon="refresh" onClick={coh.refresh} loading={coh.fetching}>Recompute</Button>
          <Button variant="primary" iconRight="arrow-right" disabled={!c} onClick={() => update({ step: 3 })}>Next: choose topics</Button>
        </div>
      </div>
    </Panel>
  );
}

function verdictFor(c: DraftCoherence): { tone: 'ok' | 'warn' | 'err' | 'info'; title: string; body: string } {
  // Prefer the backend's calibrated reading; fall back to the same bands locally.
  const label = c.label ?? (c.n < 2 ? 'single' : c.median >= 0.9 ? 'focused' : c.median >= 0.86 ? 'broad' : 'mixed');
  const body = c.summary || '';
  if (label === 'single' || label === 'none') return { tone: 'info', title: 'Only one seed', body: body || 'There is nothing to compare it with yet. The interest will be centred on that paper; add more seeds now or later.' };
  if (label === 'focused') return { tone: 'ok', title: 'Your seeds agree', body: body || 'They describe one clear topic, so matches should be on target.' };
  if (label === 'broad') return { tone: 'warn', title: 'Your seeds only loosely agree', body: body || 'They may cover two related topics. You can continue, but removing the odd ones out would sharpen results.' };
  return { tone: 'err', title: "Your seeds don't share a topic", body: body || 'They are about as similar as random papers from the same field. Split them into separate interests or remove the ones that do not belong.' };
}

function AgreementMeter({ agreement, n }: { agreement: number | null; n: number }) {
  if (agreement == null) return null;
  const tone = agreementTone(agreement);
  return (
    <div className={`agreement agreement-${tone}`} title="0 = as unrelated as papers from different fields · 100 = near-identical papers. Focused interests score above about 60.">
      <span className="small" style={{ fontWeight: 600 }}>Agreement</span>
      <span className="agreement-track"><span className="agreement-fill" style={{ width: `${agreement}%` }} /></span>
      <b className="mono">{agreement}</b><span className="small muted">/100 across {plural(n, 'seed')}</span>
    </div>
  );
}

// --- Step 3 ------------------------------------------------------------------

function StepTopics({ state }: { state: DraftState }) {
  const { update, toggleTopic } = useDraft();
  const slug = state.slug!;
  const topics = useQuery(`draft/${slug}/topics`, () => getDraftTopics(slug));
  useEffect(() => {
    if (topics.data && state.selectedTopicIds === null) update({ selectedTopicIds: topics.data.map((t) => t.id) });
  }, [topics.data, state.selectedTopicIds, update]);
  const selected = new Set(state.selectedTopicIds ?? []);
  const list = topics.data ?? [];
  return (
    <Panel title="Step 3 · What should Radar query?" description="These topics were aggregated from the seeds' OpenAlex records. Radar asks OpenAlex for new papers in each selected topic, then scores them. Fewer, sharper topics mean less noise.">
      {topics.error && <ErrorBox message={errorMessage(topics.error)} onRetry={topics.refresh} />}
      {topics.loading && <LoadingRows rows={3} />}
      {topics.data && list.length === 0 && (
        <EmptyState compact icon="alert" title="No topics were found" body="None of the seeds resolved to OpenAlex topics. Go back and add seeds with DOIs, or continue without topic filters (Radar will fall back to a broader query)." />
      )}
      {list.length > 0 && (
        <>
          <div className="row spread" style={{ marginBottom: 10 }}>
            <span className="small muted">{selected.size} of {list.length} selected</span>
            <div className="row">
              <Button size="sm" variant="ghost" onClick={() => update({ selectedTopicIds: list.map((t) => t.id) })}>Select all</Button>
              <Button size="sm" variant="ghost" onClick={() => update({ selectedTopicIds: [] })}>Clear</Button>
            </div>
          </div>
          <div className="topics">
            {list.map((t) => (
              <button key={t.id} type="button" className={`topic-toggle ${selected.has(t.id) ? 'on' : ''}`} onClick={() => toggleTopic(t.id)} aria-pressed={selected.has(t.id)} title={`${t.count} seed${t.count === 1 ? '' : 's'} carry this topic · ${t.source === 'umls' ? 'mapped via UMLS' : 'OpenAlex topic'} ${t.id}`}>
                <span className="tick">{selected.has(t.id) && <Icon name="check" size={10} />}</span>
                {t.name}
                <span className="tc">{t.count}</span>
                {t.source === 'umls' && <span className="src">UMLS</span>}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="wizard-foot">
        <Button icon="arrow-left" onClick={() => update({ step: 2 })}>Back</Button>
        <Button variant="primary" iconRight="arrow-right" disabled={!topics.data || (list.length > 0 && selected.size === 0)} onClick={() => update({ step: 4 })}>Next: set the threshold</Button>
      </div>
    </Panel>
  );
}

// --- Step 4 ------------------------------------------------------------------

function StepThreshold({ state }: { state: DraftState }) {
  const { update, reset } = useDraft();
  const slug = state.slug!;
  const job = useJob(state.dryRunJobId);
  const [kickError, setKickError] = useState<string | null>(null);
  const kicking = useRef(false);

  async function kick() {
    if (kicking.current) return;
    kicking.current = true;
    setKickError(null);
    try {
      const j = await startDryRun(slug, state.name, 30);
      update({ dryRunJobId: j.id });
    } catch (e) {
      setKickError(errorMessage(e));
    } finally {
      kicking.current = false;
    }
  }

  // Start the trial scan once on entry (or if the remembered job vanished).
  useEffect(() => {
    if (!state.dryRunJobId || !findJob(state.dryRunJobId)) void kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const result = job?.status === 'done' ? (job.result as DraftDryRun) : null;
  const scores = useMemo(() => result?.scores ?? [], [result]);
  const band = result?.seed_similarity ?? null;
  const suggested = useMemo(() => result?.suggested_threshold ?? suggestThreshold(scores, band?.min ?? null), [result, scores, band]);
  const [axisLo, axisHi] = useMemo(() => axisFor(scores, band, result?.score_range ?? null), [scores, band, result]);
  const value = state.threshold ?? suggested ?? 0.9;
  useEffect(() => {
    if (state.threshold === null && suggested != null) update({ threshold: suggested });
  }, [state.threshold, suggested, update]);
  const passing = scores.filter((s) => s >= value).length;

  const save = useAction(async () => {
    const profile = await commitDraft({ slug, threshold: Number(value.toFixed(3)), selected_topic_ids: state.selectedTopicIds ?? [], cron: DEFAULT_CRON, tz: DEFAULT_TZ });
    // Leave the wizard before clearing its state, so no effect here can
    // re-adopt the interest we just committed from the ``?draft=`` URL.
    navigate(paths.interest(profile.key), { replace: true });
    reset();
    try {
      await startScan({ key: profile.key, name: profile.name }, { days: 7, limit: 500 });
      toast.success(`"${profile.name}" is live. Scanning the last 7 days now.`);
    } catch (e) {
      toast.error(`Saved, but the first scan didn't start: ${errorMessage(e)}`);
    }
  });

  return (
    <Panel title="Step 4 · How strict should it be?" description="Radar runs a trial scan over the last 30 days and scores every paper it finds against your seeds. The shaded band shows where your own seed papers score; the suggested threshold sits just below it. Move the bar to trade volume for precision. You can change it later.">
      {kickError && <ErrorBox title="Couldn't start the trial scan" message={kickError} onRetry={kick} />}
      {job && job.status === 'running' && (
        <JobProgress job={job} />
      )}
      {job && job.status === 'error' && <ErrorBox title="The trial scan failed" message={job.error} onRetry={kick} />}
      {result && scores.length === 0 && (
        <EmptyState compact icon="search" title="The trial scan found no papers" body="Nothing recent matched the selected topics. You can still save with a default threshold and adjust it after the first real scan." />
      )}
      {result && scores.length > 0 && (
        <div className="stack" style={{ gap: 16 }}>
          <Callout tone="info">
            <b>{passing}</b> of <b>{scores.length}</b> papers from the last 30 days ({scores.length ? Math.round((100 * passing) / scores.length) : 0}%) would have reached your feed at <b className="mono">{value.toFixed(3)}</b>.
            {band && <> Your own seeds score <b className="mono">{band.min.toFixed(3)}–{band.max.toFixed(3)}</b>; papers above <b className="mono">{band.min.toFixed(3)}</b> are as close as your seeds.</>}
            {suggested != null && Math.abs(value - suggested) > 0.0005 && (
              <> <Button size="sm" variant="ghost" onClick={() => update({ threshold: suggested })}>Use suggested {suggested.toFixed(3)}</Button></>
            )}
          </Callout>
          <ThresholdHistogram scores={scores} value={value} min={axisLo} max={axisHi} seedBand={band} suggested={suggested} periodLabel="would pass · last 30 days" onChange={(v) => update({ threshold: Number(v.toFixed(3)) })} />
          {result.preview.length > 0 && (
            <div>
              <div className="field-label" style={{ marginBottom: 6 }}>Top matches from the trial scan</div>
              {result.preview.slice(0, 8).map((c, i) => (
                <div className="preview-row" key={c.id || i} style={{ opacity: (c.similarity ?? c.score) >= value ? 1 : 0.5 }}>
                  <span className="sc">{(c.similarity ?? c.score).toFixed(3)}</span>
                  <span>
                    <div>{c.title}</div>
                    <div className="v">{c.venue || '—'}{(c.similarity ?? c.score) < value ? ' · below threshold' : ''}</div>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {save.error && <div style={{ marginTop: 12 }}><ErrorBox compact title="Couldn't save" message={save.error} /></div>}
      <div className="wizard-foot">
        <Button icon="arrow-left" onClick={() => update({ step: 3 })}>Back</Button>
        <div className="row">
          {job?.status !== 'running' && <Button variant="ghost" icon="refresh" onClick={kick}>Run trial again</Button>}
          <Button variant="primary" icon="check" onClick={() => save.run()} loading={save.busy} disabled={!result && job?.status !== 'error'} title={!result ? 'Wait for the trial scan to finish' : undefined}>
            Save {TERMS.interest} and start scanning
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/** Local fallback for older backends: same rule as rag_lib.calibration.suggest_threshold. */
function suggestThreshold(scores: number[], seedMin: number | null): number | null {
  const sorted = [...scores].filter(Number.isFinite).sort((a, b) => b - a);
  if (seedMin != null) {
    let thr = seedMin - 0.01;
    if (sorted.length >= 10) {
      const p75 = sorted[Math.floor(sorted.length * 0.25)];
      const p98 = sorted[Math.floor(sorted.length * 0.02)];
      thr = Math.min(Math.max(thr, p75), p98);
    }
    return Number(thr.toFixed(3));
  }
  if (sorted.length >= 10) return Number(sorted[Math.floor(sorted.length * 0.1)].toFixed(3));
  return null;
}

export function currentDraftSlug(): string | null {
  return getDraft().slug;
}
