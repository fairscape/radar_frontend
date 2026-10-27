import { getResearcherTopics, setNotInterestChoice, setResearcherTopics } from '../api/endpoints/profiles';
import { keys } from '../api/hooks';
import { errorMessage, plural } from '../lib/format';
import { useQuery } from '../lib/query';
import { TERMS } from '../lib/terms';
import { toast } from '../lib/toast';
import type { NotInterestChoice, NotInterestTopic, ResearcherTopic, ResearcherTopics } from '../types/researchers';
import { Button, Callout, confirmDialog, useAction } from '.';

/**
 * Offers the topics the researcher's own profile declares -- what they
 * want more of and what they do not -- to an interest built from them.
 * Applied, the wanted topics join the list switched on. The not-wanted
 * ones are listed on their own (``NotInterestList``), each filtered out,
 * kept as the other sources have it, or added as a topic -- kept by
 * default when another source lists it too, filtered otherwise. Shown only
 * when the interest has such a researcher.
 *
 * ``onChanged`` runs after the server has changed the list: the page
 * re-reads its topics and drops any local tick state.
 */
export function ProfileTopicsBox({ profileKey, saved = false, unsavedTicks = false, onChanged }: { profileKey: string; saved?: boolean; unsavedTicks?: boolean; onChanged: () => void | Promise<void> }) {
  const q = useQuery(keys.researcherTopics(profileKey), () => getResearcherTopics(profileKey));
  const confirmTicks = async (doing: string, label: string) => !unsavedTicks || confirmDialog({
    title: 'Replace your unsaved ticks?',
    body: <p>The ticks you changed below are not saved yet. {doing} rebuilds the list from what is saved, so they would be lost.</p>,
    confirmLabel: label,
  });
  const toggle = useAction(async (enabled: boolean) => {
    if (!(await confirmTicks(enabled ? "Applying the profile's topics" : "Removing the profile's topics",
      enabled ? 'Apply and replace' : 'Remove and replace'))) return;
    try {
      await setResearcherTopics(profileKey, enabled);
    } catch (e) {
      toast.error(`Couldn't ${enabled ? 'apply' : 'remove'} the profile's topics: ${errorMessage(e)}`);
      return;
    }
    await q.refresh();
    await onChanged();
    toast.success(enabled
      ? `The profile's topics are applied${saved ? ' and saved' : ''}.`
      : `The profile's topics were removed; the other topics are back as they were${saved ? ', and saved' : ''}.`);
  });
  const choose = useAction(async (row: NotInterestTopic, choice: NotInterestChoice) => {
    if (!(await confirmTicks('Changing a not-wanted topic', 'Change and replace'))) return;
    try {
      await setNotInterestChoice(profileKey, row.id, choice);
    } catch (e) {
      toast.error(`Couldn't change “${row.name}”: ${errorMessage(e)}`);
      return;
    }
    await q.refresh();
    await onChanged();
  });
  const d = q.data;
  // Shown while applied even if the profile cannot be read right now: the
  // list still carries its topics and marks, and this is where they are removed.
  if (!d || d.researcher_id == null || (!d.topics.available && !d.applied)) return null;
  const t = d.topics;
  const who = d.researcher_name ?? `this ${TERMS.profile}`;
  // A wanted topic the user filters out (a not-wanted label matched it too) is off.
  const filteredIds = new Set((t.not_interest ?? []).filter((r) => r.choice === 'filter').map((r) => r.id));
  const wantedOn = t.wanted.filter((x) => !filteredIds.has(x.id)).length;
  if (d.applied && !t.available) {
    return (
      <Callout tone="warn" title={`Using ${who}'s profile topics`} icon="user">
        <p style={{ margin: '0 0 6px' }}>The profile lists no topics Radar can read just now: it may have been re-imported without research interests, or it has only text concepts and the topic mapper is unavailable. Its topics and marks stay in the list as last read. Remove them if they are out of date.</p>
        <div className="row" style={{ marginTop: 10 }}>
          <Button size="sm" onClick={() => toggle.run(false)} loading={toggle.busy}>Remove profile topics</Button>
        </div>
      </Callout>
    );
  }
  return (
    <Callout tone={d.applied ? 'ok' : 'info'} title={d.applied ? `Using ${who}'s profile topics` : `${who}'s profile lists research interests`} icon="user">
      <p style={{ margin: '0 0 6px' }}>
        {d.applied
          ? <>The {plural(wantedOn, 'topic')} the profile wants {wantedOn === 1 ? 'is' : 'are'} on{wantedOn < t.wanted.length ? ` (${t.wanted.length - wantedOn} filtered out below)` : ''}. They follow the profile: a change there shows up here on the next recompute. Removing them puts the other topics back as they were.</>
          : <>The profile declares {plural(t.wanted.length, 'wanted topic')}{t.unwanted.length > 0 ? ` and ${plural(t.unwanted.length, 'topic')} it does not want` : ''}. Apply them and Radar adds the wanted ones to this list, switched on{t.unwanted.length > 0 ? ', and filters out the not-wanted ones ticked below' : ''}.</>}
        {saved && <> <b>This is saved straight away</b>, unlike the ticks below, and applies from the next scan.</>}
      </p>
      <TopicChips topics={{ ...t, unwanted: [], unwanted_labels: [], unmatched_labels: [] }} offIds={filteredIds} />
      <NotInterestList topics={t} applied={d.applied} busy={choose.busy || toggle.busy} onChoose={(row, c) => choose.run(row, c)} />
      {t.labels_unmapped && <p className="small muted" style={{ margin: '6px 0 0' }}>The profile's text concepts could not be matched to topics just now (the topic mapper is unavailable); the ones matched before stay in the list.</p>}
      <div className="row" style={{ marginTop: 10 }}>
        {d.applied
          ? <Button size="sm" onClick={() => toggle.run(false)} loading={toggle.busy}>Remove profile topics</Button>
          : <Button size="sm" variant="primary" icon="plus" onClick={() => toggle.run(true)} loading={toggle.busy}>Use profile topics</Button>}
      </div>
    </Callout>
  );
}

const OVERLAP_LABEL: Record<string, string> = {
  openalex: 'the seed papers',
  umls: 'UMLS concepts',
  pdf_content: "a PDF's text",
  llm: 'Claude research topics',
  adopted: 'a forgotten profile',
  profile_interest: "the profile's own interests",
};

/**
 * The topics the profile does not want, each on its own row: what it was
 * matched from, where else it shows up, and the user's choice -- filter it
 * out (ticked), keep it as the other sources have it (unticked), or add it
 * as a topic. Before the profile is applied the rows show the defaults it
 * would use, read-only.
 */
function NotInterestList({ topics: t, applied, busy, onChoose }: {
  topics: ResearcherTopics; applied: boolean; busy: boolean;
  onChoose: (row: NotInterestTopic, choice: NotInterestChoice) => void;
}) {
  const rows = t.not_interest ?? [];
  // From the server, which knows what each label matched; none is known
  // while the mapper is down (the note under the list says so).
  const unmatched = t.labels_unmapped ? [] : (t.unmatched_labels ?? []);
  if (rows.length === 0 && unmatched.length === 0) return null;
  return (
    <div className="not-interest" aria-label="Not interested">
      <div className="not-interest-head">
        <b>Not interested</b>, per the profile
        <span className="small muted"> · ticked: filtered out (off wherever the seeds bring it in). Unticked where another source lists the same topic, so you decide.{!applied && ' Apply the profile to change them.'}</span>
      </div>
      <ul>
        {rows.map((r) => {
          const filtered = r.choice === 'filter';
          // Struck through only while it is off: the user may have switched it back on by hand.
          return (
            <li key={r.id} className={filtered && r.on !== true ? 'filtered' : undefined}>
              <label className="ni-tick" title={applied ? undefined : 'Apply the profile first'}>
                <input type="checkbox" checked={filtered} disabled={!applied || busy}
                  onChange={(e) => onChoose(r, e.target.checked ? 'filter' : 'keep')} />
                <span>Filter out</span>
              </label>
              <span className="ni-what">
                {r.label ? <>“{r.label}” → </> : null}
                <span title={r.id}>{r.name}</span>
                {r.similarity != null && <span className="small muted"> · match {r.similarity.toFixed(2)}</span>}
                {!r.label && <span className="small muted"> · {r.method === 'declared' ? 'declared' : 'inferred'}</span>}
              </span>
              <span className="ni-note small">
                {r.overlap.length > 0
                  ? <>Also from {r.overlap.map((o) => OVERLAP_LABEL[o] ?? o).join(', ')}</>
                  : <span className="muted">No other source lists it</span>}
                {r.choice === 'add' && <> · <b>added as a topic</b></>}
                {r.choice === 'keep' && r.in_list && <span className="muted"> · in the list, {r.on ? 'on' : 'off'}</span>}
                {filtered && r.on === true && <span className="muted"> · switched back on in the list</span>}
              </span>
              <span className="ni-act">
                {r.choice === 'add'
                  ? <Button size="sm" variant="ghost" disabled={!applied || busy} onClick={() => onChoose(r, r.overlap.length > 0 ? 'keep' : 'filter')}>Undo add</Button>
                  : !(r.in_list && r.on)
                    ? <Button size="sm" variant="ghost" icon="plus" disabled={!applied || busy} onClick={() => onChoose(r, 'add')}>Add as topic</Button>
                    : null}
              </span>
            </li>
          );
        })}
        {unmatched.map((l) => (
          <li key={`lbl-${l}`} className="unmatched">
            <span className="ni-what">“{l}”</span>
            <span className="ni-note small muted">matches no OpenAlex topic closely enough; listed for information</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The wanted topics as chips, the unwanted ones dashed, the unmapped words greyed. */
export function TopicChips({ topics: t, compact = false, offIds }: { topics: ResearcherTopics; compact?: boolean; offIds?: Set<string> }) {
  const unmatched = t.labels_unmapped ? [] : (t.unmatched_labels ?? []);
  const chip = (x: ResearcherTopic, off: boolean) => (
    <li key={`${off ? 'off' : 'on'}-${x.id}`} className={off ? 'off' : undefined} title={`${x.id} · ${methodLabel(x)}`}>
      {off ? <s>{x.name}</s> : x.name}
      {x.method === 'label' && x.label && <span className="lbl">from “{x.label}”</span>}
    </li>
  );
  return (
    <>
      {t.wanted.length > 0 && (
        <ul className="profile-topic-list" aria-label="Wanted topics">{t.wanted.map((x) => chip(x, offIds?.has(x.id) ?? false))}</ul>
      )}
      {(t.unwanted.length > 0 || unmatched.length > 0) && (
        <ul className="profile-topic-list" aria-label="Not wanted">
          {t.unwanted.map((x) => chip(x, true))}
          {!compact && unmatched.map((l) => (
            <li key={`lbl-${l}`} className="off" title="A concept on the profile that matches no OpenAlex topic; listed for information"><s>{l}</s></li>
          ))}
        </ul>
      )}
    </>
  );
}

function methodLabel(x: ResearcherTopic): string {
  if (x.method === 'declared') return `declared by the researcher${x.weight != null ? ` (weight ${x.weight})` : ''}`;
  if (x.method === 'label') return `nearest topic to the profile's “${x.label ?? ''}”`;
  return "inferred from the researcher's papers";
}
