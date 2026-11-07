/**
 * "Research topics (Prosopia method)": an interest's topics generated the
 * way Nathan Sheffield's Prosopia generates them (backend
 * rag_lib/interest_terms.py, which runs his researcher_profiles SDK).
 * Generating gives an unsaved preview; "Save these topics" keeps it.
 *
 * The Anthropic key is typed in for each run and stored nowhere: it lives
 * in this dialog's state only (not the draft store, which persists to
 * sessionStorage; not localStorage; not the query cache), goes once in the
 * POST body, and is cleared as soon as it is sent or the dialog closes.
 *
 * ``autoSave`` (a new interest's step 3, FUNCTIONAL_SPEC RT, user 11-05:
 * "默认还是保存在草稿里吧"): no unsaved preview -- what is generated is
 * kept on the draft at once, and so is each topic removed, put back or
 * added. One save at a time (user 11-05: "没有完成的情况下禁止第二次修改，
 * 生成和发送请求"): until it is answered the topics cannot be changed,
 * generated or mapped, so an answer never overwrites a newer edit and two
 * saves never race. Nothing searches by a draft yet, so there is nothing
 * to look over first. The lock and a list the draft could not keep live in
 * lib/rtDraft, not here: the wizard unmounts this panel on every step change
 * (review FF-1..FF-5).
 */
import { useEffect, useState } from 'react';
import { generateTerms, getTerms, mapLlmTopics, saveTerms, type InterestTerm, type InterestTerms } from '../api/endpoints/profiles';
import { errorMessage, fmtRelative, plural } from '../lib/format';
import { useQuery } from '../lib/query';
import { rtDrop, rtEntry, rtSet, rtToken, useRtEntry } from '../lib/rtDraft';
import { addLeaveGuard } from '../lib/router';
import { toast } from '../lib/toast';
import { Badge, Button, Callout, Dialog, ErrorBox, Field, Icon, Input, LoadingRows, Panel, confirmDialog, useAction, useClearOnChange } from './index';
import { looksLikeSecret, SECRET_MESSAGE } from '../lib/secretText';

const SOURCE_LABEL: Record<string, string> = {
  prosopia: 'from the Prosopia profile',
  'rp-sdk-llm': 'Prosopia method, LLM',
  'rp-sdk-cluster': 'Prosopia method, clusters (no LLM)',
  manual: 'entered by hand',
};

/** ``readOnly``: a saved interest's page, which only shows them; they are
 * changed in Edit interest (FUNCTIONAL_SPEC E.4 Q1). */
export function ResearchTopics({ profileKey, readOnly = false, autoSave = false, onUnsaved }: { profileKey: string; readOnly?: boolean; autoSave?: boolean; onUnsaved?: (unsaved: boolean) => void }) {
  const q = useQuery(`profiles/${profileKey}/terms`, () => getTerms(profileKey));
  // A generated preview is held, unsaved, until the user keeps or discards
  // it. autoSave: in lib/rtDraft with the lock, so both outlive a step change.
  const rt = useRtEntry(autoSave ? profileKey : null);
  const [localPreview, setLocalPreview] = useState<InterestTerms | null>(null);
  const preview = autoSave ? rt.preview : localPreview;
  const setPreview = (p: InterestTerms | null, token = autoSave ? rtToken(profileKey) : 0) => {
    if (!autoSave) { setLocalPreview(p); return; }
    rtSet(profileKey, { preview: p, terms: p ? p.terms : null, removed: p ? (p.removed ?? []) : null }, token);
  };
  const [localSaving, setLocalSaving] = useState(false);
  const saving = autoSave ? rt.saving : localSaving;
  const [terms, setTerms] = useState<InterestTerm[] | null>(null);
  // Struck out, not dropped: shown crossed through so they can be put back.
  const [removed, setRemoved] = useState<InterestTerm[]>([]);
  const [notInterests, setNotInterests] = useState<string[]>([]);
  const [adding, setAdding] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);
  const shown = preview ?? q.data ?? null;
  // Reset the edits only when what is shown actually changed. Every
  // refetch (window focus, a scan finishing, any seed or threshold edit)
  // hands back a new object with the same content, and resetting on that
  // threw away topics struck out or added but not yet saved.
  const shownKey = shown ? JSON.stringify([!!preview, shown.generated_at, shown.saved, shown.terms, shown.removed ?? [], shown.not_interests]) : null;
  useEffect(() => {
    if (!shown) return;
    // A preview kept across a step change comes back with its edits (FF-5).
    const kept = autoSave && preview ? rtEntry(profileKey) : null;
    setTerms(kept?.terms ?? shown.terms);
    setRemoved(kept?.removed ?? shown.removed ?? []);
    setNotInterests(shown.not_interests);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);
  const list = terms ?? [];
  const labels = (ts: InterestTerm[]) => JSON.stringify(ts.map((t) => t.label));
  const editedSincePreviewOrSave = !!shown
    && (labels(list) !== labels(shown.terms) || labels(removed) !== labels(shown.removed ?? []));
  // autoSave: each change is saved at once (not a preview's: that waits
  // for its Save button), and none is taken while a save is out.
  const apply = (nextTerms: InterestTerm[], nextRemoved: InterestTerm[]) => {
    if (autoSave && saving) return;
    setTerms(nextTerms);
    setRemoved(nextRemoved);
    if (autoSave && preview) rtSet(profileKey, { terms: nextTerms, removed: nextRemoved }, rtToken(profileKey));
    if (autoSave && !preview) void keep(nextTerms, nextRemoved);
  };
  const strike = (i: number) => apply(list.filter((_, j) => j !== i), [...removed, list[i]]);
  const restore = (i: number) => apply([...list, removed[i]], removed.filter((_, j) => j !== i));
  // Struck out stays (to put back); this takes it off the stored record for good (user 2026-11-06).
  const purge = (i: number) => apply(list, removed.filter((_, j) => j !== i));
  const add = (label: string) => {
    if (autoSave && saving) return;
    // A key typed here was saved as a topic (2026-11-06): refused, and out of the box.
    if (looksLikeSecret(label)) { setAdding(''); setAddError(SECRET_MESSAGE); return; }
    setAddError(null);
    // Adding a struck-out topic by name puts it back rather than duplicating it.
    const k = removed.findIndex((t) => t.label.toLowerCase() === label.toLowerCase());
    if (k >= 0) restore(k);
    else if (!list.some((t) => t.label.toLowerCase() === label.toLowerCase())) apply([...list, { label }], removed);
    setAdding('');
  };

  // As the threshold: a preview (perhaps a paid LLM run) or struck-out and
  // added topics were dropped without a word on leaving.
  // A topic typed but not yet added counts too.
  // With ``autoSave`` they are kept on their own: nothing to ask about.
  // Except a generated list that could not be kept on the draft and sits
  // as a preview (perhaps a paid LLM run): that one is asked about.
  const unsaved = (autoSave ? !!preview : (!!preview || editedSincePreviewOrSave || adding.trim() !== '')) && !saving;
  // Edit interest's Save changes waits for these: it saved the copy
  // without them and only then asked about them.
  useEffect(() => { onUnsaved?.(unsaved); }, [unsaved, onUnsaved]);
  useEffect(() => () => onUnsaved?.(false), [onUnsaved]);
  useEffect(() => {
    if (!unsaved) return;
    return addLeaveGuard(async () => {
      const ok = await confirmDialog({
        title: 'Leave without saving the research topics?',
        body: <p>{preview ? 'The generated topics are' : editedSincePreviewOrSave ? 'Your changes to the research topics are' : `"${adding.trim()}" is typed but not added, and is`} not saved.</p>,
        confirmLabel: 'Discard changes',
        danger: true,
      });
      // "Discard changes" discards: the kept preview goes too (FF-3).
      if (ok && autoSave) rtDrop(profileKey);
      return ok;
    });
  }, [unsaved, preview, editedSincePreviewOrSave, adding]);

  // Only a saved list Claude generated; edits are saved first, so what is
  // mapped is what is shown.
  const canMap = !readOnly && !!q.data && !preview && !editedSincePreviewOrSave && q.data.source === 'rp-sdk-llm' && list.length > 0;
  const mapTopics = useAction(async () => {
    const token = autoSave ? rtToken(profileKey) : 0;
    if (autoSave) rtSet(profileKey, { mapping: true }, token);
    let res;
    try { res = await mapLlmTopics(profileKey); } finally { if (autoSave) rtSet(profileKey, { mapping: false }, token); }
    toast.success(res.added.length
      ? `Added ${plural(res.added.length, 'LLM topic')}, switched off: ${res.added.map((t) => t.name).join(' · ')}. Switch on the ones to search by in the topic list.`
      : 'No new topics: the nearest OpenAlex topics are already in the list.');
  });
  useClearOnChange(mapTopics, [labels(list)]);
  // autoSave: nothing is changed, generated or mapped while a save or a
  // mapping is out.
  const locked = autoSave && (saving || mapTopics.busy || rt.mapping || rt.generating);

  // autoSave: "saving" is the draft's (lib/rtDraft), set and cleared with
  // one token, so a panel mounted again meanwhile stays locked (FF-1).
  const begin = (): number => {
    if (!autoSave) { setLocalSaving(true); return 0; }
    const token = rtToken(profileKey);
    rtSet(profileKey, { saving: true }, token);
    return token;
  };
  // A save while another is out (a generation's answer after Back): a
  // second PUT racing the first is what the lock is for (R3). Wait for it.
  const whenFree = async () => {
    if (!autoSave) return;
    for (let i = 0; i < 600 && rtEntry(profileKey).saving; i += 1) await new Promise((r) => window.setTimeout(r, 100));
  };
  const end = (token: number) => { if (autoSave) rtSet(profileKey, { saving: false }, token); else setLocalSaving(false); };

  async function save({ quiet = false } = {}) {
    const token = begin();
    try {
      if (preview) await saveTerms(profileKey, list, removed, notInterests, preview, editedSincePreviewOrSave);
      else await saveTerms(profileKey, list, removed, notInterests);
      setPreview(null, token);
      if (!quiet) toast.success('Research topics saved.');
    } catch (e) {
      toast.error(`Couldn't save: ${errorMessage(e)}`);
    } finally {
      end(token);
    }
  }

  // autoSave: generated topics are kept on the draft as they come. Should
  // that save fail they stay as an ordinary preview, with its Save button.
  async function generated(r: InterestTerms) {
    if (!autoSave) { setPreview(r); return; }
    await whenFree();
    const token = begin();
    try {
      await saveTerms(profileKey, r.terms, r.removed ?? [], r.not_interests, r, false);
      toast.success(`Generated ${plural(r.terms.length, 'research topic')} and kept them on the draft.`);
    } catch (e) {
      // Kept with the draft, not this panel: the step may have been left
      // meanwhile, and the list (perhaps a paid run) is there on return (FF-2).
      setPreview(r, token);
      toast.error(`Generated, but couldn't keep them on the draft: ${errorMessage(e)}. They are kept as a preview on step 3: save them there.`);
    } finally {
      end(token);
    }
  }

  // autoSave: one change kept on the draft. Refused, the list goes back
  // to what the draft has.
  async function keep(nextTerms: InterestTerm[], nextRemoved: InterestTerm[]) {
    const token = begin();
    try {
      await saveTerms(profileKey, nextTerms, nextRemoved, notInterests);
    } catch (e) {
      if (q.data) { setTerms(q.data.terms); setRemoved(q.data.removed ?? []); }
      toast.error(`Couldn't keep the change on the draft: ${errorMessage(e)}`);
    } finally {
      end(token);
    }
  }

  const d = shown;
  return (
    <Panel
      title="Research topics (Prosopia method)"
      description="Topics generated the way Prosopia generates them, from this interest's seeds (or the researcher's Prosopia profile). Scans do not search by them. They rank the feed only when BioXplorer's reranker is set to rank by research topics (see Rank refinement for what it ranks by)."
      actions={readOnly ? undefined : <Button write size="sm" icon="refresh" onClick={() => setDialog(true)} disabled={!!preview || locked}>{q.data?.terms.length ? 'Regenerate' : 'Generate'}</Button>}
    >
      {q.error && <ErrorBox compact message={errorMessage(q.error)} onRetry={q.refresh} />}
      {!d && q.loading && <LoadingRows rows={2} />}
      {preview && (
        <Callout tone="warn" title="Generated — not saved yet">
          Look them over, remove or add topics, then keep them.{q.data?.terms.length ? ' Saving replaces the topics saved now.' : ''}
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <Button write size="sm" variant="primary" icon="check" loading={saving} disabled={list.length === 0} onClick={() => void save()}>Save these topics</Button>
            <Button size="sm" icon="x" disabled={saving} onClick={() => setPreview(null)}>Discard</Button>
          </div>
        </Callout>
      )}
      {d && !d.source && list.length === 0 && <p className="muted small" style={{ margin: 0 }}>{readOnly ? 'None. Generate them in Edit interest → Topics.' : 'None yet. Generate them from the seeds.'}</p>}
      {d && d.source && (
        <div className="row-wrap small muted" style={{ gap: 8, margin: '8px 0' }}>
          <Badge tone="info">{SOURCE_LABEL[d.source] ?? d.source}</Badge>
          {d.model && <span className="mono">{d.model}</span>}
          {d.generated_at && <span>generated {fmtRelative(d.generated_at)}</span>}
          {!preview && <Badge tone="ok">Saved</Badge>}
          {!preview && d.edited && <span>· edited</span>}
        </div>
      )}
      {!preview && d?.stale && <Callout tone="warn">The seeds changed since these were generated. Regenerate to match them.</Callout>}
      {canMap && (
        <div className="row-wrap small" style={{ gap: 8, margin: '8px 0' }}>
          <Button write size="sm" icon="plus" loading={mapTopics.busy} disabled={locked && !mapTopics.busy} onClick={() => void mapTopics.run()}
            title="Find the OpenAlex topics nearest these research topics and add them to the topic list, switched off. No LLM call is made.">
            Map to OpenAlex topics
          </Button>
          <span className="muted">Adds them to the topic list as LLM topics, switched off: a scan searches by one once you switch it on.</span>
        </div>
      )}
      {mapTopics.error && <ErrorBox compact message={mapTopics.error} />}
      {(list.length > 0 || removed.length > 0) && (
        <div className="topics" style={{ marginTop: 8 }}>
          {list.map((t, i) => (
            <span key={`on-${t.label}-${i}`} className="topic-toggle on" title={[t.weight != null ? `weight ${t.weight}` : null, t.paper_ids?.length ? `drawn from ${t.paper_ids.length} seed${t.paper_ids.length === 1 ? '' : 's'}` : null, t.kind].filter(Boolean).join(' · ')}>
              {t.label}
              {!readOnly && <button type="button" className="linklike" aria-label={`Remove "${t.label}"`} title="Remove (it stays below, struck out)" disabled={locked} onClick={() => strike(i)}><Icon name="x" size={11} /></button>}
            </span>
          ))}
          {removed.map((t, i) => (
            <span key={`off-${t.label}-${i}`} className="topic-toggle topic-struck" title="Removed — not used. ↺ puts it back; the bin deletes it for good.">
              <s>{t.label}</s>
              {!readOnly && <button type="button" className="linklike" aria-label={`Put "${t.label}" back`} title="Put back" disabled={locked} onClick={() => restore(i)}><Icon name="refresh" size={11} /></button>}
              {!readOnly && <button type="button" className="linklike" aria-label={`Delete "${t.label}" for good`} title="Delete for good (it cannot be put back)" disabled={locked} onClick={() => purge(i)}><Icon name="trash" size={11} /></button>}
            </span>
          ))}
        </div>
      )}
      {d && !readOnly && (
        <div className="row" style={{ gap: 6, marginTop: 10 }}>
          <Input value={adding} onChange={(e) => { setAdding(e.target.value); setAddError(null); }} maxLength={200} autoComplete="off" placeholder="Add a topic" aria-label="Add a research topic" disabled={locked}
            onKeyDown={(e) => { if (e.key === 'Enter' && adding.trim()) add(adding.trim()); }} />
          <Button write size="sm" disabled={!adding.trim() || locked} loading={autoSave && saving} onClick={() => add(adding.trim())}>Add</Button>
          {!autoSave && !preview && editedSincePreviewOrSave && <Button write size="sm" variant="primary" icon="check" loading={saving} onClick={() => void save()}>Save changes</Button>}
        </div>
      )}
      {addError && <p className="field-error" role="alert" style={{ margin: '6px 0 0' }}>{addError}</p>}
      {notInterests.length > 0 && (
        <p className="small muted" style={{ marginTop: 10 }}>Not interested in: {notInterests.join(' · ')}</p>
      )}
      <GenerateDialog open={dialog} profileKey={profileKey} autoSave={autoSave} onBusy={(b, token) => { if (autoSave) rtSet(profileKey, { generating: b }, token); }} replacing={autoSave ? (q.data?.terms.length ?? 0) : 0} edited={!!q.data?.edited} onClose={() => setDialog(false)} onGenerated={(r) => generated(r)} />
    </Panel>
  );
}

function GenerateDialog({ open, profileKey, autoSave, replacing = 0, edited = false, onBusy, onClose, onGenerated }: { open: boolean; profileKey: string; autoSave: boolean; replacing?: number; edited?: boolean; onBusy?: (busy: boolean, token: number) => void; onClose: () => void; onGenerated: (r: InterestTerms) => void | Promise<void> }) {
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cleared whenever the dialog closes, however it closes.
  useEffect(() => { if (!open) { setApiKey(''); setError(null); } }, [open]);
  // A run in progress (perhaps a paid LLM call) was lost unseen on leaving.
  useEffect(() => {
    if (!busy) return;
    return addLeaveGuard(() => confirmDialog({
      title: 'Leave while the topics are generating?',
      // autoSave keeps what comes back on the draft, from wherever the person is by then.
      body: <p>{autoSave ? 'The run goes on, and its topics are kept on the draft when it finishes.' : 'The run goes on, but its topics are not kept.'}</p>,
      confirmLabel: 'Leave',
      danger: true,
    }), 'generate-topics');
  }, [busy, autoSave]);

  async function run() {
    const sent = apiKey.trim();
    setApiKey('');                       // out of state before the request is even made
    setBusy(true);
    setError(null);
    // autoSave: "generating" kept with the draft, so the panel mounted again
    // after Back stays locked until this run is in and saved (R3).
    const token = autoSave ? rtToken(profileKey) : 0;
    onBusy?.(true, token);
    try {
      const res = await generateTerms(profileKey, sent || null);
      // Kept on the draft before "generating" ends, so no gap unlocks the panel.
      await onGenerated(res);
      if (!autoSave) toast.info(`Generated ${plural(res.terms.length, 'topic')}. Review them, then Save.`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      onBusy?.(false, token);
    }
  }

  return (
    <Dialog
      open={open}
      title="Generate research topics"
      onClose={() => { if (!busy) onClose(); }}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button write variant="primary" icon="play" loading={busy} onClick={() => void run()}>Generate</Button></>}
    >
      <div className="stack">
        <p className="small" style={{ margin: 0 }}>
          Uses Prosopia's topic extraction over this interest's seeds. With an Anthropic API key it asks Claude to name the topics; without one it groups the seeds and names each group by its most typical abstract (weaker).
          An interest built from a published Prosopia profile uses that profile's own topics and needs no key.
        </p>
        <Field label="Anthropic API key (optional)" hint="Sent once for this run. It is not saved anywhere — not on the server, not in this browser. You will be asked again next time.">
          {/* Not an identity field: no autofill, no password manager. */}
          <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-…"
            name="one-time-llm-key" autoComplete="off" spellCheck={false} data-1p-ignore data-lpignore="true" disabled={busy} />
        </Field>
        {/* Kept on the draft at once: say what it replaces, hand edits included (FF-4). */}
        {replacing > 0 && (
          <Callout tone="warn">The new topics replace the {plural(replacing, 'research topic')} on the draft now{edited ? ', with the changes you made to them' : ''}.</Callout>
        )}
        {busy && <p className="small muted" style={{ margin: 0 }}>Building the index and generating — up to a minute the first time.</p>}
        {error && <ErrorBox compact title="Couldn't generate" message={error} />}
      </div>
    </Dialog>
  );
}
