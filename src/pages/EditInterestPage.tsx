/**
 * Edit interest: walk a saved interest's steps again -- seeds, check,
 * topics, threshold -- in the wizard's layout.
 *
 * Once the wizard's "Save" was clicked there was no way back into it: the
 * interest page could change seeds and the threshold, but nothing said that
 * was where editing happened, and topics could not be changed at all. Each
 * step here edits the live interest directly and takes effect at once
 * (seeds re-fit and re-score, topics apply from the next scan, the
 * threshold re-filters the feed); there is no final commit to lose.
 *
 * The step is in the URL (?step=), so the browser's Back button moves
 * between steps. Steps reuse the interest page's own sections, which
 * already work on live interests, rather than the wizard's, which are tied
 * to a draft.
 */
import { useEffect, useState } from 'react';
import { useProfileDetail, useProfiles } from '../api/hooks';
import { previewTopics, recomputeCoherence, saveTopics } from '../api/endpoints/profiles';
import { errorMessage, plural } from '../lib/format';
import { useQuery } from '../lib/query';
import { navigate, paths } from '../lib/router';
import { TERMS } from '../lib/terms';
import { toast } from '../lib/toast';
import { Button, Callout, EmptyState, ErrorBox, Icon, LoadingRows, Panel, useAction } from '../ui';
import { CoherenceHistogram } from '../ui/domain';
import { Link } from '../ui/Link';
import { PaperLink } from '../ui/paperLink';
import { ScanDialog, SeedsTab, ThresholdTab, type Detail } from './InterestDetailPage';
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
  const { data: detail, error, refresh } = useProfileDetail(profileKey);
  const [scanOpen, setScanOpen] = useState(false);
  const step = urlStep ?? 1;
  const go = (n: number) => navigate(paths.interestEdit(profileKey, n));
  const done = () => navigate(paths.interest(profileKey));

  const profile: Profile | undefined = detail?.profile ?? profiles?.find((p) => p.key === profileKey);
  // A draft is edited in the wizard, which owns its unsaved choices.
  useEffect(() => {
    if (detail?.profile.isDraft) navigate(paths.wizard(detail.profile.key), { replace: true });
  }, [detail]);

  if (!profile || !detail) {
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
          <h1 className="page-title">Edit "{profile.name}"</h1>
          <p className="page-sub">Each step changes the {TERMS.interest} as you go; nothing waits for a final save. Use the steps on the left, or your browser's Back button, to go back.</p>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon="check" onClick={done}>Done</Button>
        </div>
      </header>

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
              <SeedsTab profile={profile} detail={detail} />
              <Foot next={() => go(2)} nextLabel="Next: check the seeds" />
            </>
          )}
          {step === 2 && <StepCheck profile={profile} back={() => go(1)} next={() => go(3)} />}
          {step === 3 && <StepTopics profile={profile} detail={detail} back={() => go(2)} next={() => go(4)} />}
          {step === 4 && (
            <>
              <ThresholdTab profile={profile} onScan={() => setScanOpen(true)} />
              <Foot back={() => go(3)} next={done} nextLabel="Done" nextIcon="check" />
            </>
          )}
        </div>
      </div>
      <ScanDialog profile={profile} open={scanOpen} onClose={() => setScanOpen(false)} />
    </div>
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
  const coh = useQuery(`draft/${profile.key}/edit-coherence`, () => recomputeCoherence(profile.key));
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
                    { id: c.least_similar.a_id, title: c.least_similar.a_title },
                    { id: c.least_similar.b_id, title: c.least_similar.b_title },
                  ].map((p) => (
                    <div className="seed-row pair-row" key={p.id}>
                      <span className="truncate" title={p.title}><PaperLink title={p.title || p.id} id={p.id} /></span>
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
 * Switch topics on or off. The list is re-aggregated from the current
 * seeds without saving (a topic the new seeds brought in shows as "new"
 * and starts off); "Save" writes exactly the ticked ones.
 */
function StepTopics({ profile, detail, back, next }: { profile: Profile; detail: Detail; back: () => void; next: () => void }) {
  const topics = useQuery(`draft/${profile.key}/edit-topics`, () => previewTopics(profile.key));
  useEffect(() => {
    if (topics.data) void topics.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const list = topics.data ?? [];
  const [selected, setSelected] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (topics.data && selected === null) setSelected(new Set(topics.data.filter((t) => t.on).map((t) => t.id)));
  }, [topics.data, selected]);
  const sel = selected ?? new Set<string>();
  const saved = new Set(list.filter((t) => t.on).map((t) => t.id));
  const dirty = selected !== null && (sel.size !== saved.size || [...sel].some((id) => !saved.has(id)));
  const nNew = list.filter((t) => t.new).length;

  // Moves on only once saved: a failed save stays here with its error.
  const save = useAction(async () => {
    const res = await saveTopics(profile.key, [...sel]);
    setSelected(new Set(res.filter((t) => t.on).map((t) => t.id)));
    await topics.refresh();
    toast.success(`Topics saved: ${plural(res.filter((t) => t.on).length, 'topic')} on. They apply from the next scan.`);
    next();
  });
  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s ?? []);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <Panel title="What should Radar search for?" description="Topics aggregated from the seeds' OpenAlex records. Each scan asks OpenAlex for new papers in the topics that are on. Papers already found stay; a change applies from the next scan.">
      {topics.error && <ErrorBox message={errorMessage(topics.error)} onRetry={topics.refresh} />}
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
          <div className="row spread" style={{ margin: '10px 0' }}>
            <span className="small muted">{sel.size} of {list.length} on · {detail.topics.filter((t) => t.on).length} on now</span>
            <div className="row">
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(list.map((t) => t.id)))}>Select all</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          </div>
          <div className="topics">
            {list.map((t) => (
              <button key={t.id} type="button" className={`topic-toggle ${sel.has(t.id) ? 'on' : ''}`} onClick={() => toggle(t.id)} aria-pressed={sel.has(t.id)} title={`${t.count} seed${t.count === 1 ? '' : 's'} carry this topic · ${t.source === 'umls' ? 'mapped via UMLS' : 'OpenAlex topic'} ${t.id}`}>
                <span className="tick">{sel.has(t.id) && <Icon name="check" size={10} />}</span>
                {t.name}
                <span className="tc">{t.count}</span>
                {t.source === 'umls' && <span className="src">UMLS</span>}
                {t.new && <span className="src">new</span>}
              </button>
            ))}
          </div>
          {save.error && <div style={{ marginTop: 10 }}><ErrorBox compact title="Couldn't save the topics" message={save.error} /></div>}
        </>
      )}
      <div className="wizard-foot">
        <Button icon="arrow-left" onClick={back}>Back</Button>
        <div className="row">
          {dirty && <Button variant="ghost" onClick={() => setSelected(new Set(saved))}>Undo changes</Button>}
          {dirty ? (
            <Button variant="primary" icon="check" disabled={list.length > 0 && sel.size === 0} loading={save.busy}
              title={sel.size === 0 ? 'Switch on at least one topic' : undefined}
              onClick={() => void save.run()}>
              Save topics and continue
            </Button>
          ) : (
            <Button variant="primary" iconRight="arrow-right" onClick={next}>Next: threshold</Button>
          )}
        </div>
      </div>
    </Panel>
  );
}
