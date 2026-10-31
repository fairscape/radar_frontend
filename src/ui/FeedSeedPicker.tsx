/**
 * "Add from the feed": in Edit interest's Seeds step, tick papers the
 * interest's own feed shows and add them as seeds of the copy
 * (FUNCTIONAL_SPEC E.11). The feed cards have no such button (E.6 R1):
 * seeds change only here, and only once the edit is saved.
 *
 * The server picks the papers -- the feed as the interest is saved, saved
 * ones first, then by score, at most 100 -- and searches the titles, so a
 * long feed is searched, not paged. Fetched only once opened.
 */
import { useEffect, useState } from 'react';
import { addSeeds, feedSeedChoices } from '../api/endpoints/profiles';
import { errorMessage, fmtScore, plural } from '../lib/format';
import { useQuery } from '../lib/query';
import { toast } from '../lib/toast';
import { Badge, Button, ErrorBox, Input, LoadingRows, useAction, useClearOnChange } from './index';
import { PaperTitle } from './pickers';

export function FeedSeedPicker({ copySlug, disabled = false }: {
  /** The Edit interest copy's slug; the list is of the interest it edits. */
  copySlug: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Asked of the server as the user stops typing, not on every key.
  const [asked, setAsked] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setAsked(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);
  // Under draft/<copy>/ so adding or removing a seed of the copy refetches it.
  const list = useQuery(open ? `draft/${copySlug}/feed-papers?q=${asked}` : null, () => feedSeedChoices(copySlug, asked));
  const papers = list.data ?? [];
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const attach = useAction(async () => {
    // A tick is kept while the user searches for the next paper, so the
    // ticked ones are not all in the list shown now.
    const ids = [...chosen];
    if (ids.length === 0) return;
    const res = await addSeeds(copySlug, ids, { source: 'feed' });
    setChosen(new Set());
    if (res.rejected.length > 0) {
      toast.error(`Added ${plural(res.attached, 'paper')}. ${plural(res.rejected.length, 'paper')} could not be added: no longer in this interest's feed (dismissed, or rescored below the bar, in another tab).`);
    } else {
      // res.attached, not ids.length: one made a seed some other way
      // meanwhile (its PDF uploaded) is not added twice.
      if (res.attached === 0) toast.info('Already seeds here; nothing was added.');
      else toast.success(`${plural(res.attached, 'seed')} added from the feed. Save changes to keep ${res.attached === 1 ? 'it' : 'them'}; the recommendations follow the new seeds from the next scan.`);
    }
  });
  useClearOnChange(attach, [chosen]);

  if (!open) {
    return (
      <p className="small" style={{ margin: '8px 0 0' }}>
        <button type="button" className="linklike" onClick={() => setOpen(true)} disabled={disabled}>Or add papers from this interest's feed</button>
      </p>
    );
  }
  const hide = (
    <Button size="sm" icon="x" onClick={() => { setOpen(false); setChosen(new Set()); setQuery(''); }} disabled={attach.busy} title="Fold the feed list away without adding anything">Hide</Button>
  );
  const busy = disabled || attach.busy;
  return (
    <div className="stack" style={{ gap: 6, marginTop: 16 }}>
      <div className="row spread">
        <span className="field-label">Papers in this interest's feed{list.data ? ` · ${papers.length === 100 ? 'the first 100' : papers.length}` : ''}</span>
        {hide}
      </div>
      <p className="muted small" style={{ margin: 0 }}>The feed as this interest is saved: papers you saved first, then the highest scores. Papers you dismissed are not listed.</p>
      <div className="row" style={{ gap: 6 }}>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the titles" aria-label="Search the feed papers by title" />
        <Button size="sm" variant="ghost" disabled={chosen.size === 0 || busy} onClick={() => setChosen(new Set())}>Clear</Button>
      </div>
      {!list.data && list.loading && <LoadingRows rows={2} />}
      {!list.data && list.error && <ErrorBox compact message={errorMessage(list.error)} onRetry={list.refresh} />}
      {list.data && papers.length === 0 && (
        <p className="muted small" style={{ margin: 0 }}>{asked ? `No paper in the feed matches “${asked}”.` : 'Nothing in the feed to add: it is empty, or every paper in it is a seed already.'}</p>
      )}
      {papers.length > 0 && (
        <div className="pick-list" role="group" aria-label="Papers in this interest's feed">
          {papers.map((p) => (
            <label className={`pick-row ${chosen.has(p.id) ? 'on' : ''}`} key={p.id}>
              <input
                type="checkbox"
                checked={chosen.has(p.id)}
                disabled={busy}
                onChange={() => setChosen((c) => {
                  const n = new Set(c);
                  if (n.has(p.id)) n.delete(p.id); else n.add(p.id);
                  return n;
                })}
              />
              <span>
                <PaperTitle title={p.title || p.id} id={p.id} />
                <div className="v">{[p.year, p.venue, p.score != null ? `score ${fmtScore(p.score)}` : null].filter(Boolean).join(' · ')}</div>
              </span>
              <span>{p.saved && <Badge tone="ok">saved</Badge>}</span>
            </label>
          ))}
        </div>
      )}
      <div className="row">
        <Button size="sm" icon="plus" disabled={chosen.size === 0 || disabled} loading={attach.busy} onClick={() => void attach.run()}>
          {chosen.size > 0 ? `Add ${plural(chosen.size, 'paper')} as seeds` : 'Tick papers to add them'}
        </Button>
        {attach.error && <span className="field-error">{attach.error}</span>}
      </div>
    </div>
  );
}
