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
 */
import { useEffect, useState } from 'react';
import { generateTerms, getTerms, saveTerms, type InterestTerm, type InterestTerms } from '../api/endpoints/profiles';
import { errorMessage, fmtRelative } from '../lib/format';
import { useQuery } from '../lib/query';
import { toast } from '../lib/toast';
import { Badge, Button, Callout, Dialog, ErrorBox, Field, Icon, Input, LoadingRows, Panel } from './index';

const SOURCE_LABEL: Record<string, string> = {
  prosopia: 'from the Prosopia profile',
  'rp-sdk-llm': 'Prosopia method, LLM',
  'rp-sdk-cluster': 'Prosopia method, clusters (no LLM)',
  manual: 'entered by hand',
};

export function ResearchTopics({ profileKey }: { profileKey: string }) {
  const q = useQuery(`profiles/${profileKey}/terms`, () => getTerms(profileKey));
  // A generated preview is held here, unsaved, until the user keeps or discards it.
  const [preview, setPreview] = useState<InterestTerms | null>(null);
  const [terms, setTerms] = useState<InterestTerm[] | null>(null);
  // Struck out, not dropped: shown crossed through so they can be put back.
  const [removed, setRemoved] = useState<InterestTerm[]>([]);
  const [notInterests, setNotInterests] = useState<string[]>([]);
  const [adding, setAdding] = useState('');
  const [dialog, setDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const shown = preview ?? q.data ?? null;
  useEffect(() => {
    if (shown) { setTerms(shown.terms); setRemoved(shown.removed ?? []); setNotInterests(shown.not_interests); }
  }, [shown]);
  const list = terms ?? [];
  const labels = (ts: InterestTerm[]) => JSON.stringify(ts.map((t) => t.label));
  const editedSincePreviewOrSave = !!shown
    && (labels(list) !== labels(shown.terms) || labels(removed) !== labels(shown.removed ?? []));
  const strike = (i: number) => { setRemoved([...removed, list[i]]); setTerms(list.filter((_, j) => j !== i)); };
  const restore = (i: number) => { setTerms([...list, removed[i]]); setRemoved(removed.filter((_, j) => j !== i)); };
  const add = (label: string) => {
    // Adding a struck-out topic by name puts it back rather than duplicating it.
    const k = removed.findIndex((t) => t.label.toLowerCase() === label.toLowerCase());
    if (k >= 0) restore(k);
    else if (!list.some((t) => t.label.toLowerCase() === label.toLowerCase())) setTerms([...list, { label }]);
    setAdding('');
  };

  async function save() {
    setSaving(true);
    try {
      if (preview) await saveTerms(profileKey, list, removed, notInterests, preview, editedSincePreviewOrSave);
      else await saveTerms(profileKey, list, removed, notInterests);
      setPreview(null);
      toast.success('Research topics saved.');
    } catch (e) {
      toast.error(`Couldn't save: ${errorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const d = shown;
  return (
    <Panel
      title="Research topics (Prosopia method)"
      description="Topics generated the way Prosopia generates them, from this interest's seeds (or the researcher's Prosopia profile). Demo: they are not used for scanning or for the feed's ranking yet."
      actions={<Button size="sm" icon="refresh" onClick={() => setDialog(true)} disabled={!!preview}>{q.data?.terms.length ? 'Regenerate' : 'Generate'}</Button>}
    >
      {q.error && <ErrorBox compact message={errorMessage(q.error)} onRetry={q.refresh} />}
      {!d && q.loading && <LoadingRows rows={2} />}
      {preview && (
        <Callout tone="warn" title="Generated — not saved yet">
          Look them over, remove or add topics, then keep them.{q.data?.terms.length ? ' Saving replaces the topics saved now.' : ''}
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <Button size="sm" variant="primary" icon="check" loading={saving} disabled={list.length === 0} onClick={() => void save()}>Save these topics</Button>
            <Button size="sm" icon="x" disabled={saving} onClick={() => setPreview(null)}>Discard</Button>
          </div>
        </Callout>
      )}
      {d && !d.source && list.length === 0 && <p className="muted small" style={{ margin: 0 }}>None yet. Generate them from the seeds.</p>}
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
      {(list.length > 0 || removed.length > 0) && (
        <div className="topics" style={{ marginTop: 8 }}>
          {list.map((t, i) => (
            <span key={`on-${t.label}-${i}`} className="topic-toggle on" title={[t.weight != null ? `weight ${t.weight}` : null, t.paper_ids?.length ? `drawn from ${t.paper_ids.length} seed${t.paper_ids.length === 1 ? '' : 's'}` : null, t.kind].filter(Boolean).join(' · ')}>
              {t.label}
              <button type="button" className="linklike" aria-label={`Remove "${t.label}"`} title="Remove (it stays below, struck out)" onClick={() => strike(i)}><Icon name="x" size={11} /></button>
            </span>
          ))}
          {removed.map((t, i) => (
            <span key={`off-${t.label}-${i}`} className="topic-toggle topic-struck" title="Removed — not used. Click ↺ to put it back.">
              <s>{t.label}</s>
              <button type="button" className="linklike" aria-label={`Put "${t.label}" back`} title="Put back" onClick={() => restore(i)}><Icon name="refresh" size={11} /></button>
            </span>
          ))}
        </div>
      )}
      {d && (
        <div className="row" style={{ gap: 6, marginTop: 10 }}>
          <Input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add a topic" aria-label="Add a research topic"
            onKeyDown={(e) => { if (e.key === 'Enter' && adding.trim()) add(adding.trim()); }} />
          <Button size="sm" disabled={!adding.trim()} onClick={() => add(adding.trim())}>Add</Button>
          {!preview && editedSincePreviewOrSave && <Button size="sm" variant="primary" icon="check" loading={saving} onClick={() => void save()}>Save changes</Button>}
        </div>
      )}
      {notInterests.length > 0 && (
        <p className="small muted" style={{ marginTop: 10 }}>Not interested in: {notInterests.join(' · ')}</p>
      )}
      <GenerateDialog open={dialog} profileKey={profileKey} onClose={() => setDialog(false)} onGenerated={setPreview} />
    </Panel>
  );
}

function GenerateDialog({ open, profileKey, onClose, onGenerated }: { open: boolean; profileKey: string; onClose: () => void; onGenerated: (r: InterestTerms) => void }) {
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cleared whenever the dialog closes, however it closes.
  useEffect(() => { if (!open) { setApiKey(''); setError(null); } }, [open]);

  async function run() {
    const sent = apiKey.trim();
    setApiKey('');                       // out of state before the request is even made
    setBusy(true);
    setError(null);
    try {
      const res = await generateTerms(profileKey, sent || null);
      onGenerated(res);
      toast.info(`Generated ${res.terms.length} topics. Review them, then Save.`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Generate research topics"
      onClose={() => { if (!busy) onClose(); }}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" icon="play" loading={busy} onClick={() => void run()}>Generate</Button></>}
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
        {busy && <p className="small muted" style={{ margin: 0 }}>Building the index and generating — up to a minute the first time.</p>}
        {error && <ErrorBox compact title="Couldn't generate" message={error} />}
      </div>
    </Dialog>
  );
}
