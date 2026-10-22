import { useEffect, useRef, useState, type DragEvent } from 'react';
import { reorderResearchers, setResearcherMark } from '../api/endpoints/researchers';
import { useResearchers } from '../api/hooks';
import { errorMessage, fmtRelative } from '../lib/format';
import { invalidateExact } from '../lib/query';
import { researcherJobKey, startResearcherImport, useJob, useJobs, type Job } from '../lib/jobs';
import { paths } from '../lib/router';
import { TERMS } from '../lib/terms';
import { toast } from '../lib/toast';
import type { Researcher, ResearcherMark } from '../types/researchers';
import { Badge, Button, EmptyState, ErrorBox, Icon, IconButton, LoadingRows, Panel, Segmented, Select, Spinner } from '../ui';
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
        <ResearcherList
          researchers={researchers}
          runningIds={new Set(jobs.filter((j) => j.kind === 'import' && j.status === 'running').map((j) => j.profileKey))}
        />
      )}

      <ImportPanel />
    </div>
  );
}

export const MARK_LABEL: Record<ResearcherMark, string> = { self: 'You', followed: 'Following' };

/** The badge a marked researcher carries wherever they are shown. */
export function MarkBadge({ mark }: { mark: ResearcherMark | null }) {
  if (!mark) return null;
  return (
    <Badge tone={mark === 'self' ? 'info' : 'ok'} title={mark === 'self' ? `This ${TERMS.profile} is you` : `A researcher you follow`}>
      <Icon name={mark === 'self' ? 'user' : 'star'} size={10} /> {MARK_LABEL[mark]}
    </Badge>
  );
}

/** Mark as you / following / neither. Saves on change; the list re-sorts. */
export function MarkSelect({ r, size = 'sm' }: { r: Researcher; size?: 'sm' | 'md' }) {
  const [busy, setBusy] = useState(false);
  // One person is the user: marking another as "You" takes the mark off
  // the first, which the toast says rather than leaving them to notice.
  const { data: all } = useResearchers();
  // Shown value: the choice at once (a controlled select snapped back to the
  // old mark until the list was re-read), the server's once it answers.
  const [value, setValue] = useState<string>(r.mark ?? '');
  useEffect(() => { setValue(r.mark ?? ''); }, [r.mark]);
  return (
    <Select
      className={size === 'sm' ? 'compact' : undefined}
      value={value}
      disabled={busy}
      aria-label={`Mark ${r.name}`}
      title="Mark this profile as you, or as a researcher you follow: it is highlighted and moves to the top of its group. Clearing the mark moves it to the top of the unmarked ones."
      onChange={async (e) => {
        const mark = (e.target.value || null) as ResearcherMark | null;
        setValue(mark ?? '');
        setBusy(true);
        try {
          const previousSelf = mark === 'self' ? (all ?? []).find((o) => o.mark === 'self' && o.id !== r.id) : undefined;
          await setResearcherMark(r.id, mark);
          toast.success(mark ? `${r.name} marked as ${MARK_LABEL[mark].toLowerCase()}.${previousSelf ? ` ${previousSelf.name} is no longer marked as you.` : ''}` : `Mark removed from ${r.name}.`);
        } catch (err) {
          setValue(r.mark ?? '');
          toast.error(`Couldn't save the mark: ${errorMessage(err)}`);
        } finally {
          setBusy(false);
        }
      }}
    >
      <option value="">No mark</option>
      <option value="self">You</option>
      <option value="followed">Following</option>
    </Select>
  );
}

/**
 * The cards, in the user's order. Drag a card onto another to move it
 * there (left half: before it; right half: after it), or use the arrows.
 * The new order is shown at once and stored; if storing fails the server's
 * order comes back.
 */
function ResearcherList({ researchers, runningIds }: { researchers: Researcher[]; runningIds: Set<string> }) {
  const serverIds = researchers.map((r) => r.id).join(',');
  const [order, setOrder] = useState<number[] | null>(null);
  // Saves still in flight. While there are any, a server list that lands
  // is an earlier save's answer: the shown order stays the user's latest,
  // and the server's is taken once the last save has answered.
  const pending = useRef(0);
  const [settled, setSettled] = useState(0);
  useEffect(() => { if (pending.current === 0) setOrder(null); }, [serverIds, settled]);
  const byId = new Map(researchers.map((r) => [r.id, r]));
  // A profile that landed meanwhile (an import finishing in another tab)
  // is shown at the end rather than hidden; a save then names every id.
  const shown = (order ?? researchers.map((r) => r.id)).filter((id) => byId.has(id));
  const known = new Set(shown);
  const ids = [...shown, ...researchers.map((r) => r.id).filter((id) => !known.has(id))];
  const [drag, setDrag] = useState<number | null>(null);
  // Draggable only from the grip, and only while the pointer is down on it:
  // a card that is always draggable swallows the mark <select> inside it in
  // some browsers (Firefox), and the grip is what promises the drag.
  const [armed, setArmed] = useState<number | null>(null);
  useEffect(() => {
    // Released off the grip without a drag: no dragend comes, so the card
    // would stay draggable. During a real drag no pointerup fires.
    if (armed === null) return;
    const off = () => setArmed(null);
    window.addEventListener('pointerup', off);
    window.addEventListener('pointercancel', off);
    return () => { window.removeEventListener('pointerup', off); window.removeEventListener('pointercancel', off); };
  }, [armed]);
  const [over, setOver] = useState<{ id: number; side: 'before' | 'after' } | null>(null);
  // Saves run one after another: two quick arrow clicks are two PUTs, and
  // whichever answered last would otherwise be the order shown.
  const chain = useRef<Promise<void>>(Promise.resolve());

  function commit(next: number[]) {
    if (next.join(',') === ids.join(',')) return;
    setOrder(next);
    pending.current += 1;
    chain.current = chain.current.then(async () => {
      try {
        await reorderResearchers(next);
      } catch (e) {
        // The list may have changed under us (a profile forgotten or added
        // in another tab): show the server's.
        invalidateExact('researchers');
        toast.error(`Couldn't save the order: ${errorMessage(e)}`);
      } finally {
        pending.current -= 1;
        if (pending.current === 0) setSettled((n) => n + 1);
      }
    });
  }
  function moveTo(id: number, target: number, side: 'before' | 'after') {
    if (id === target) return;
    const rest = ids.filter((x) => x !== id);
    const at = rest.indexOf(target) + (side === 'after' ? 1 : 0);
    void commit([...rest.slice(0, at), id, ...rest.slice(at)]);
  }
  function moveBy(id: number, delta: number) {
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    next.splice(i, 1);
    next.splice(j, 0, id);
    void commit(next);
  }
  // One card per row on a narrow screen: the list then runs downwards, so
  // the arrows point up and down and a drop goes by the card's top or
  // bottom half. They were left/right, and the drop went by left/right.
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [oneColumn, setOneColumn] = useState(false);
  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const check = () => {
      const first = el.firstElementChild as HTMLElement | null;
      setOneColumn(!!first && first.getBoundingClientRect().width > el.getBoundingClientRect().width * 0.6);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  function sideOf(e: DragEvent<HTMLElement>): 'before' | 'after' {
    const box = e.currentTarget.getBoundingClientRect();
    if (oneColumn) return e.clientY < box.top + box.height / 2 ? 'before' : 'after';
    return e.clientX < box.left + box.width / 2 ? 'before' : 'after';
  }

  return (
    <div ref={gridRef} className={`interest-grid${oneColumn ? ' one-column' : ''}`} style={{ marginBottom: 18 }} role="list" aria-label={`${TERMS.Profiles}, in your order`}>
      {ids.map((id, i) => {
        const r = byId.get(id)!;
        const running = runningIds.has(researcherJobKey(r.id)) || r.importing;
        const cls = ['researcher-card', r.mark === 'self' ? 'is-self' : '', r.mark === 'followed' ? 'is-followed' : '',
          drag === id ? 'dragging' : '', over?.id === id && drag !== null && drag !== id ? `drop-${over.side}` : ''].filter(Boolean).join(' ');
        return (
          <div
            key={id}
            role="listitem"
            className={cls}
            draggable={armed === id}
            onDragStart={(e) => { setDrag(id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(id)); }}
            onDragEnd={() => { setDrag(null); setOver(null); setArmed(null); }}
            onDragOver={(e) => { if (drag === null) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; const side = sideOf(e); if (over?.id !== id || over.side !== side) setOver({ id, side }); }}
            onDragLeave={(e) => { if (over?.id === id && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null); }}
            onDrop={(e) => { e.preventDefault(); const from = drag ?? Number(e.dataTransfer.getData('text/plain')); if (Number.isFinite(from)) moveTo(from, id, sideOf(e)); setDrag(null); setOver(null); }}
          >
            <ResearcherCard r={r} running={running} />
            <div className="researcher-card-tools">
              <span className="grab" title="Drag to move this profile in the list" aria-hidden="true" onPointerDown={() => setArmed(id)} onPointerUp={() => setArmed(null)}><Icon name="grip" size={14} /></span>
              <MarkSelect r={r} />
              <span className="spacer" />
              <IconButton icon="arrow-left" size="sm" className="move-btn" label={`Move ${r.name} ${oneColumn ? 'up' : 'earlier'}`} disabled={i === 0} onClick={() => moveBy(id, -1)} />
              <IconButton icon="arrow-right" size="sm" className="move-btn" label={`Move ${r.name} ${oneColumn ? 'down' : 'later'}`} disabled={i === ids.length - 1} onClick={() => moveBy(id, 1)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ResearcherCard({ r, running }: { r: Researcher; running: boolean }) {
  return (
    <Link href={paths.profile(r.id)} className="interest-card" draggable={false}>
      <div className="interest-card-head">
        <Icon name="user" size={14} />
        <span className="interest-card-name truncate">{r.name}</span>
        <MarkBadge mark={r.mark} />
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
