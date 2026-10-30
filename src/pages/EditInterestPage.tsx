/**
 * Edit interest: walk a saved interest's steps again -- seeds, check,
 * topics, threshold -- in the wizard's layout.
 *
 * The steps change a copy of the interest, not the interest
 * (FUNCTIONAL_SPEC E): opening the page makes the copy, Save changes
 * writes it onto the interest in one go, and leaving without saving --
 * Cancel, a link, Back, closing the tab -- discards it, with the papers it
 * brought in that nothing else uses. Until then the interest, its feed and
 * its scans are as they were, and nothing else can change it.
 *
 * Saving does not scan (E.4 Q5): the recommendations stay those of the
 * last scan, and step 4 says when they no longer match the seeds or the
 * topics, with Scan now once the changes are saved.
 *
 * The step is in the URL (?step=), so the browser's Back button moves
 * between steps; moving between them keeps the copy.
 *
 * One tab at a time, first come first served (E.7 R5): the copy is this
 * tab's (``tabId``), the page says every 30 s that it is still there, and
 * Edit interest in another tab is refused meanwhile. Closing the tab
 * discards the copy as it goes; a tab gone without a word (a crash, the
 * computer asleep) frees the interest 2 minutes on.
 */
import { useEffect, useRef, useState } from 'react';
import { useProfileDetail, useProfiles } from '../api/hooks';
import { discardEdit, discardEditOnLeave, editAlive, editState, openEdit, previewTopics, recomputeCoherence, saveEdit, saveTopics, scanTopics } from '../api/endpoints/profiles';
import { ApiError } from '../api/client';
import { UmlsNotice } from '../ui/UmlsNotice';
import { ProfileTopicsBox } from '../ui/ProfileTopics';
import { errorMessage, plural } from '../lib/format';
import { useQuery } from '../lib/query';
import { tabId } from '../lib/tab';
import { navigate, paths, addLeaveGuard } from '../lib/router';
import { TERMS } from '../lib/terms';
import { toast } from '../lib/toast';
import { topicProfileNote, topicSourceLabel, topicSourceTag } from '../lib/topicSource';
import { UmlsAllOn, UmlsConcept } from '../ui/UmlsAllOn';
import { Button, Callout, EmptyState, ErrorBox, Icon, LoadingRows, Panel, confirmDialog, useAction } from '../ui';
import { CoherenceHistogram } from '../ui/domain';
import { Link } from '../ui/Link';
import { PaperLink } from '../ui/paperLink';
import { workId } from '../lib/unmatched';
import { ResearchTopics } from '../ui/ResearchTopics';
import { ScanDialog, SeedsTab, ThresholdTab, useScanBusy, useSeedUpload } from './InterestDetailPage';
import { AgreementMeter, verdictFor } from './WizardPage';
import type { Profile } from '../types/radar';

const STEPS = [
  { n: 1, label: 'Seeds', hint: 'add or remove papers' },
  { n: 2, label: 'Check', hint: 'do the papers agree?' },
  { n: 3, label: 'Topics', hint: 'what to search for' },
  { n: 4, label: 'Threshold', hint: 'how strict' },
];

export function EditInterestPage({ profileKey, urlStep }: { profileKey: string; urlStep: number | null }) {
  const { data: profiles } = useProfiles();
  const listed = profiles?.find((p) => p.key === profileKey);
  // A draft is edited in the wizard, which owns its unsaved choices.
  useEffect(() => {
    if (listed?.isDraft) navigate(paths.wizard(listed.key), { replace: true });
  }, [listed]);

  // The copy's slug once it is made; ``saved`` once Save changes went through.
  const [copy, setCopy] = useState<string | null>(null);
  const [openError, setOpenError] = useState<{ message: string; missing: boolean; locked: boolean } | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);   // Edit again, or Retry
  // The copy to discard when the page goes: cleared by a save.
  const live = useRef<string | null>(null);
  // Opened at once, not after the list loads (that re-ran it, discarding
  // the first copy). A draft is refused (404) and redirected above.
  useEffect(() => {
    let alive = true;
    setCopy(null); setOpenError(null); setSaved(false);
    tabId().then((t) => { setTab(t); return openEdit(profileKey, t); }).then(
      (c) => {
        if (!alive) { void discardEdit(c.slug).catch(() => {}); return; }
        live.current = c.slug;
        setCopy(c.slug);
      },
      (e) => {
        if (!alive) return;
        const status = e instanceof ApiError ? e.status : 0;
        setOpenError({ message: errorMessage(e), missing: status === 404,
          locked: status === 409 && /another tab/.test(errorMessage(e)) });
      },
    );
    return () => {
      alive = false;
      // Left without saving (the guard asked first if anything changed):
      // the changes go with the copy.
      const c = live.current;
      live.current = null;
      if (c) void discardEdit(c).catch(() => {});
    };
  }, [profileKey, attempt]);

  // The tab closing (or reloading) on the edit page: the unmount above
  // never runs, so the copy goes now, rather than holding the interest
  // until 2 minutes pass unheard.
  useEffect(() => {
    const onHide = () => {
      const c = live.current;
      live.current = null;
      if (c) discardEditOnLeave(c);
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  if (openError?.locked) {
    return (
      <div className="page">
        <EmptyState icon="alert" title={`"${listed?.name ?? profileKey}" is being edited in another tab or window`}
          body="One tab edits an interest at a time. Save or leave the edit there first. If that tab was closed without leaving (or the browser crashed), the interest is free again within 2 minutes."
          action={<div className="row"><Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>Try again</Button><Link href={paths.interest(profileKey)} className="btn">Back to the {TERMS.interest}</Link></div>} />
      </div>
    );
  }
  if (openError) {
    return (
      <div className="page">
        {listed?.isDraft ? <LoadingRows rows={4} /> : openError.missing
          ? <EmptyState icon="alert" title={`No ${TERMS.interest} called "${profileKey}"`} body="It may have been deleted, or the link is wrong." action={<Link href={paths.interests} className="btn">All {TERMS.interests}</Link>} />
          : <ErrorBox title={`Couldn't open "${listed?.name ?? profileKey}" for editing`} message={openError.message} onRetry={() => setAttempt((n) => n + 1)} />}
      </div>
    );
  }
  if (saved) return <AfterSave profileKey={profileKey} onEditAgain={() => { navigate(paths.interestEdit(profileKey, 1)); setAttempt((n) => n + 1); }} />;
  if (!copy || !tab) return <div className="page"><LoadingRows rows={4} /></div>;
  return (
    <EditCopy
      key={copy}
      profileKey={profileKey}
      copyKey={copy}
      tab={tab}
      urlStep={urlStep}
      onSaved={() => { live.current = null; setSaved(true); }}
      onReopen={() => { live.current = null; setAttempt((n) => n + 1); }}
    />
  );
}

/** The steps, on the copy ``copyKey`` of saved interest ``profileKey``. */
function EditCopy({ profileKey, copyKey, tab, urlStep, onSaved, onReopen }: {
  profileKey: string; copyKey: string; tab: string; urlStep: number | null; onSaved: () => void; onReopen: () => void;
}) {
  const { data: detail, error, refresh } = useProfileDetail(copyKey);
  // Still here: every 30 s, and at once when the tab comes back into view
  // (or back from the browser's page cache). Gone meanwhile, the page says
  // so (below) instead of each step failing.
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const ping = () => {
      // 404: discarded; 409: another tab's (one duplicated from this).
      editAlive(copyKey, tab).catch((e) => { if (e instanceof ApiError && (e.status === 404 || e.status === 409)) setGone(true); });
    };
    const onShow = () => { if (document.visibilityState === 'visible') ping(); };
    const timer = window.setInterval(ping, 30_000);
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('pageshow', ping);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('pageshow', ping);
    };
  }, [copyKey, tab]);
  const { data: profiles } = useProfiles();
  const original = profiles?.find((p) => p.key === profileKey);
  // Step 2 checks the seeds as they are: moving on mid-upload checked half of them.
  const uploading = !!useSeedUpload(copyKey);
  const uploadingRef = useRef(uploading);
  uploadingRef.current = uploading;
  const step = urlStep ?? 1;
  // A threshold or year range not yet on the copy; a topic tick on its way.
  const [thresholdPending, setThresholdPending] = useState(false);
  const [topicsBusy, setTopicsBusy] = useState(false);
  // Research topics generated or edited but not kept with the panel's own
  // Save: Save changes would save the copy without them.
  const [researchUnsaved, setResearchUnsaved] = useState(false);
  const busy = uploading || thresholdPending || topicsBusy;
  // Whether the copy differs from the interest, for closing the tab: the
  // browser asks at once, so it cannot wait for the server (the in-app
  // guard below asks the server). Unknown counts as changed.
  const stateQ = useQuery(`profiles/${copyKey}/edit-state`, () => editState(copyKey));
  const mayLose = useRef(true);
  const localUnsaved = useRef(false);
  localUnsaved.current = thresholdPending || topicsBusy || researchUnsaved;
  mayLose.current = stateQ.data?.changed !== false || uploading || localUnsaved.current;

  // Every way off the page asks first when something changed: leaving
  // discards the changes (E.7). Moving between the steps is not leaving.
  const editPath = paths.interestEdit(profileKey);
  useEffect(() => addLeaveGuard(async () => {
    if (uploadingRef.current) { toast.info('Wait for the uploads to finish.'); return false; }
    // A value still on its way, or research topics not kept, count too.
    let changed = true;
    try { changed = (await editState(copyKey)).changed || localUnsaved.current; } catch { /* ask, to be safe */ }
    if (!changed) return true;
    return confirmDialog({
      title: 'Leave without saving?',
      body: <p>Your changes to this {TERMS.interest} are discarded: the seeds, topics, threshold and years stay as they were saved. Papers uploaded during this edit that nothing else uses are removed from your Vault.</p>,
      confirmLabel: 'Discard changes',
      danger: true,
    });
  }, 'edit-copy', (to) => to.split('?')[0] === editPath, () => mayLose.current), [copyKey, editPath]);

  // Not while a value is on its way to the copy: leaving the step dropped
  // a threshold set less than a moment before (its write was still waiting).
  const go = (n: number) => {
    if (uploading) { toast.info('Wait for the uploads to finish.'); return; }
    if (thresholdPending || topicsBusy) { toast.info(thresholdPending ? 'Applying the threshold…' : 'Applying the topics…'); return; }
    navigate(paths.interestEdit(profileKey, n));
  };
  const cancel = () => navigate(paths.interest(profileKey));
  const save = useAction(async () => {
    await saveEdit(copyKey, profileKey);
    toast.success('Changes saved. The recommendations still come from the last scan; scan to bring them in line.');
    onSaved();
    navigate(paths.interestEdit(profileKey, 4), { replace: true });
  });
  const saveTitle = uploading ? 'Wait for the uploads to finish'
    : thresholdPending ? 'Applying the threshold…'
      : topicsBusy ? 'Applying the topics…'
        : researchUnsaved ? 'Save or discard the research topics first (step 3)' : undefined;

  const profile: Profile | undefined = detail?.profile;
  // The copy is gone: this page went unheard for 2 minutes (the computer
  // asleep, the connection down) and another tab found it left behind
  // (E.7 R5), or the interest was deleted in another tab. Said, rather
  // than every step failing with "not found".
  if (detail === null || gone) {
    return (
      <div className="page">
        <EmptyState icon="alert" title="This edit was closed"
          body={`This edit is no longer open and its changes were discarded: this page may have gone unheard for over 2 minutes (the computer slept, or the connection dropped), or the ${TERMS.interest} was deleted elsewhere. "${original?.name ?? profileKey}" is as it was last saved.`}
          action={<div className="row"><Button variant="primary" onClick={onReopen}>Edit again</Button><Link href={paths.interest(profileKey)} className="btn">Back to the {TERMS.interest}</Link></div>} />
      </div>
    );
  }
  if (!profile || !detail) {
    return <div className="page">{error ? <ErrorBox message={errorMessage(error)} onRetry={refresh} /> : <LoadingRows rows={4} />}</div>;
  }
  const name = original?.name ?? profileKey;
  const saveButton = (
    <Button variant="primary" icon="check" onClick={() => void save.run()} loading={save.busy} disabled={busy || researchUnsaved} title={saveTitle}>Save changes</Button>
  );

  return (
    <div className="page">
      <nav className="crumbs">
        <Link href={paths.interests}>{TERMS.Interests}</Link><Icon name="chevron-right" size={12} />
        <Link href={paths.interest(profileKey)}>{name}</Link><Icon name="chevron-right" size={12} />
        <span>Edit</span>
      </nav>
      <header className="page-head">
        <div>
          <h1 className="page-title">Edit "{name}"</h1>
          <p className="page-sub">Nothing changes until you click Save changes; Cancel, or leaving the page, discards the changes. Saving does not scan: you choose when to look for papers with the new settings.</p>
        </div>
        <div className="page-actions">
          <Button onClick={cancel} disabled={uploading} title={uploading ? 'Wait for the uploads to finish' : undefined}>Cancel</Button>
          {/* Step 4 has its own, at the foot: two on one screen read as two different saves. */}
          {step !== 4 && saveButton}
        </div>
      </header>
      {save.error && <div style={{ marginBottom: 12 }}><ErrorBox compact title="Couldn't save the changes" message={save.error} /></div>}

      <div className="wizard">
        <aside className="wizard-rail" aria-label="Steps">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className={`wizard-step ${s.n === step ? 'current' : ''} ${s.n !== step ? 'clickable' : ''}`}
              onClick={() => s.n !== step && go(s.n)}
              role={s.n !== step ? 'button' : undefined}
              tabIndex={s.n !== step ? 0 : -1}
              onKeyDown={(e) => { if (s.n !== step && (e.key === 'Enter' || e.key === ' ')) go(s.n); }}
            >
              <span className="wizard-step-n">{s.n}</span>
              <span>{s.label}<small>{s.hint}</small></span>
            </div>
          ))}
        </aside>
        <div>
          {step === 1 && (
            <>
              <SeedsTab profile={profile} detail={detail} editing />
              <Foot next={() => go(2)} nextLabel="Next: check the seeds" nextDisabled={uploading} />
            </>
          )}
          {step === 2 && <StepCheck profile={profile} back={() => go(1)} next={() => go(3)} />}
          {step === 3 && (
            <div className="stack">
              <StepTopics profile={profile} back={() => go(2)} next={() => go(4)} onBusy={setTopicsBusy} />
              <ResearchTopics profileKey={profile.key} onUnsaved={setResearchUnsaved} />
            </div>
          )}
          {step === 4 && (
            <>
              <ScanOutdated profileKey={profile.key} editing />
              <ThresholdTab profile={profile} onScan={() => {}} editOf={profileKey} onPending={setThresholdPending} />
              <div className="wizard-foot">
                <Button icon="arrow-left" onClick={() => go(3)}>Back</Button>
                {saveButton}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Step 4 once the changes are saved: whether the recommendations still
 * match, Scan now, and fetching papers from the saved years (E.6 R2, R3). */
function AfterSave({ profileKey, onEditAgain }: { profileKey: string; onEditAgain: () => void }) {
  const { data: detail, error, refresh } = useProfileDetail(profileKey);
  const [scanOpen, setScanOpen] = useState(false);
  const { scanBusy } = useScanBusy(profileKey);
  const profile = detail?.profile;
  if (!profile) {
    return <div className="page">{error ? <ErrorBox message={errorMessage(error)} onRetry={refresh} /> : <LoadingRows rows={4} />}</div>;
  }
  return (
    <div className="page">
      <nav className="crumbs">
        <Link href={paths.interests}>{TERMS.Interests}</Link><Icon name="chevron-right" size={12} />
        <Link href={paths.interest(profile.key)}>{profile.name}</Link><Icon name="chevron-right" size={12} />
        <span>Edit</span>
      </nav>
      <header className="page-head">
        <div>
          <h1 className="page-title">"{profile.name}" saved</h1>
          <p className="page-sub">The changes are saved. The recommendations come from the last scan until you scan again.</p>
        </div>
        <div className="page-actions">
          <Button icon="sliders" onClick={onEditAgain}>Edit again</Button>
          <Button variant="primary" icon="check" onClick={() => navigate(paths.interest(profile.key))}>Done</Button>
        </div>
      </header>
      <ScanOutdated profileKey={profile.key} busy={scanBusy} onScan={() => setScanOpen(true)} />
      <ThresholdTab profile={profile} onScan={() => setScanOpen(true)} busy={scanBusy} readOnly canFetch />
      <ScanDialog profile={profile} open={scanOpen} onClose={() => setScanOpen(false)} />
    </div>
  );
}

/** The seeds or the topics on are not the ones the last scan scored with
 * and searched: the recommendations came from those. Said, not acted on:
 * the user decides when to scan (FUNCTIONAL_SPEC E.2-5, E.4 Q5). On the
 * copy, scanning waits for Save changes. Read afresh each time, and again
 * when a scan ends. */
function ScanOutdated({ profileKey, editing = false, busy = false, onScan }: { profileKey: string; editing?: boolean; busy?: boolean; onScan?: () => void }) {
  const q = useQuery(`profiles/${profileKey}/scan-topics`, () => scanTopics(profileKey));
  const wasBusy = useRef(busy);
  useEffect(() => {
    if (q.data) void q.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (wasBusy.current && !busy) void q.refresh();
    wasBusy.current = busy;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);
  const d = q.data;
  if (!d?.changed) return null;
  const now = editing ? 'you have now' : 'saved now';
  return (
    <Callout tone="warn">
      <div className="row spread" style={{ gap: 12 }}>
        <span>
          {d.seeds
            ? <>The recommendations and their scores still come from the seed papers at the last scan, not the seeds {now}.</>
            : <>The recommendations still come from the topics searched at the last scan, not the topics {now}.</>}
          {d.seeds && d.topics && <> They were also found through the topics searched then.</>}{' '}
          {editing ? 'Click Save changes below; you can scan right after.' : 'Scan to rescore them.'}
        </span>
        {!editing && onScan && <Button size="sm" icon="play" onClick={onScan} disabled={busy}>{busy ? 'Scanning…' : 'Scan now'}</Button>}
      </div>
    </Callout>
  );
}

function Foot({ back, next, nextLabel, nextIcon, nextDisabled = false, nextLoading = false }: {
  back?: () => void; next: () => void; nextLabel: string; nextIcon?: 'check'; nextDisabled?: boolean; nextLoading?: boolean;
}) {
  return (
    <div className="wizard-foot">
      {back ? <Button icon="arrow-left" onClick={back}>Back</Button> : <span />}
      <Button variant="primary" icon={nextIcon} iconRight={nextIcon ? undefined : 'arrow-right'} onClick={next} disabled={nextDisabled} loading={nextLoading}>{nextLabel}</Button>
    </div>
  );
}

/** Coherence of the seeds as they are now. Seeds were just changed on step 1, so re-run it on arrival. */
function StepCheck({ profile, back, next }: { profile: Profile; back: () => void; next: () => void }) {
  // Under draft/<key>/ so adding or removing a seed invalidates it.
  // A recompute is server work: once on arrival (below) and when a seed
  // changes, not every time the tab regains focus.
  const coh = useQuery(`draft/${profile.key}/edit-coherence`, () => recomputeCoherence(profile.key), { once: true });
  useEffect(() => {
    if (coh.data) void coh.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const c = coh.data;
  const verdict = c ? verdictFor(c) : null;
  return (
    <Panel title="Do the seeds agree?" description="Papers about the same thing make a sharp interest; a mix of topics makes a blurry one.">
      {coh.error && <ErrorBox message={errorMessage(coh.error)} onRetry={coh.refresh} />}
      {!c && coh.loading && <LoadingRows rows={3} />}
      {c && verdict && (
        <div className="stack">
          <Callout tone={verdict.tone} title={verdict.title}>{verdict.body}</Callout>
          {c.n >= 2 && (
            <>
              <AgreementMeter agreement={c.agreement ?? null} n={c.n} />
              {c.least_similar && (
                <div className="stack" style={{ gap: 6 }}>
                  <div className="small muted">
                    Least alike pair (similarity {c.least_similar.cosine.toFixed(2)}). If one is off-topic, remove it on the <button type="button" className="linklike" onClick={back}>Seeds step</button>.
                  </div>
                  {[
                    { id: c.least_similar.a_id, title: c.least_similar.a_title, canonicalId: c.least_similar.a_canonical_id },
                    { id: c.least_similar.b_id, title: c.least_similar.b_title, canonicalId: c.least_similar.b_canonical_id },
                  ].map((p) => (
                    <div className="seed-row pair-row" key={p.id}>
                      <span className="truncate" title={p.title}><PaperLink title={p.title || p.id} id={workId(p)} /></span>
                    </div>
                  ))}
                </div>
              )}
              <details>
                <summary className="small muted" style={{ cursor: 'pointer' }}>Technical detail</summary>
                <CoherenceHistogram bins={c.bins} />
              </details>
            </>
          )}
        </div>
      )}
      <Foot back={back} next={next} nextLabel="Next: topics" />
    </Panel>
  );
}

/**
 * Switch topics on or off, on the copy: each tick is written to it at
 * once and kept by Save changes. The list is re-aggregated from the
 * copy's seeds without writing (a topic the new seeds brought in shows as
 * "new" and starts off); a topic only removed seeds brought stays as it
 * was, on or off, and is marked (E.2-3): only the user switches topics.
 */
function StepTopics({ profile, back, next, onBusy }: { profile: Profile; back: () => void; next: () => void; onBusy: (busy: boolean) => void }) {
  const topics = useQuery(`draft/${profile.key}/edit-topics`, () => previewTopics(profile.key));
  useEffect(() => {
    if (topics.data) void topics.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const list = topics.data ?? [];
  const on = new Set(list.filter((t) => t.on).map((t) => t.id));
  const nNew = list.filter((t) => t.new).length;
  const nUnmatched = list.filter((t) => t.unmatched).length;

  const write = useAction(async (ids: Set<string>) => {
    await saveTopics(profile.key, [...ids]);
    await topics.refresh();
  });
  useEffect(() => onBusy(write.busy), [write.busy, onBusy]);
  useEffect(() => () => onBusy(false), [onBusy]);
  const apply = (ids: Set<string>) => {
    if (write.busy) return;
    if (list.length > 0 && ids.size === 0) { toast.info('Keep at least one topic on: a scan searches by them.'); return; }
    void write.run(ids);
  };
  const toggle = (id: string) => {
    const n = new Set(on);
    if (n.has(id)) n.delete(id); else n.add(id);
    apply(n);
  };

  return (
    <Panel title="What should BioXplorer search for?" description="Topics aggregated from the seeds' OpenAlex records. Each scan asks OpenAlex for papers in the topics that are on. Papers already found stay; a change applies from the first scan after you save.">
      {topics.error && <ErrorBox message={errorMessage(topics.error)} onRetry={topics.refresh} />}
      <UmlsNotice profileKey={profile.key} listed={topics.data} />
      {topics.data && (
        <div style={{ marginBottom: 10 }}>
          <ProfileTopicsBox profileKey={profile.key} saved unsavedTicks={false} onChanged={async () => { await topics.refresh(); }} />
        </div>
      )}
      {!topics.data && topics.loading && <LoadingRows rows={3} />}
      {topics.data && list.length === 0 && (
        <EmptyState compact icon="alert" title="No topics were found" body="None of the seeds resolved to OpenAlex topics." />
      )}
      {list.length > 0 && (
        <>
          {nNew > 0 && (
            <Callout tone="info">
              Your seeds brought in {plural(nNew, 'new topic')}, marked <b>new</b>. They start off; switch on the ones you want searched.
            </Callout>
          )}
          {nUnmatched > 0 && (
            <Callout tone="info">
              {nUnmatched === 1 ? '1 topic was' : `${nUnmatched} topics were`} brought by seed papers you removed. {nUnmatched === 1 ? 'It stays' : 'They stay'} as {nUnmatched === 1 ? 'it was' : 'they were'}, on or off; switch off any you no longer want searched.
            </Callout>
          )}
          <div className="row spread" style={{ margin: '10px 0' }}>
            <span className="small muted">{on.size} of {list.length} on</span>
            <Button size="sm" variant="ghost" disabled={write.busy} onClick={() => apply(new Set(list.map((t) => t.id)))}>Select all</Button>
          </div>
          <UmlsAllOn list={list} selected={on} onAdd={(ids) => apply(new Set([...on, ...ids]))} />
          <div className="topics">
            {list.map((t) => (
              <button key={t.id} type="button" disabled={write.busy} className={`topic-toggle ${on.has(t.id) ? 'on' : ''} ${t.profile === 'not_interest' ? 'topic-profile-off' : ''}`} onClick={() => toggle(t.id)} aria-pressed={on.has(t.id)} title={`${t.papers ?? t.count} ${(t.papers ?? t.count) === 1 ? 'seed carries' : 'seeds carry'} this topic · ${topicSourceLabel(t.source, t.llm_label, t.umls_concept)} ${t.id}${topicProfileNote(t.profile) ? ` · ${topicProfileNote(t.profile)}` : ''}`}>
                <span className="tick">{on.has(t.id) && <Icon name="check" size={10} />}</span>
                {t.profile === 'not_interest' ? <s>{t.name}</s> : t.name}
                <span className="tc">{t.papers ?? t.count}</span>
                {topicSourceTag(t.source) && <span className="src">{topicSourceTag(t.source)}</span>}
                <UmlsConcept topic={t} />
                {t.profile === 'interest' && t.source !== 'researcher' && <span className="src">PROFILE</span>}
                {t.profile === 'not_interest' && <span className="pf">not wanted</span>}
                {t.new && <span className="src">new</span>}
                {t.unmatched && <span className="pf">its seed paper was removed</span>}
              </button>
            ))}
          </div>
          {write.error && <div style={{ marginTop: 10 }}><ErrorBox compact title="Couldn't change the topics" message={write.error} /></div>}
        </>
      )}
      <Foot back={back} next={next} nextLabel="Next: threshold" nextDisabled={write.busy} />
    </Panel>
  );
}
