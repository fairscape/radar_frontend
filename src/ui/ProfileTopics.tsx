import { getResearcherTopics, setResearcherTopics } from '../api/endpoints/profiles';
import { keys } from '../api/hooks';
import { errorMessage, plural } from '../lib/format';
import { useQuery } from '../lib/query';
import { TERMS } from '../lib/terms';
import { toast } from '../lib/toast';
import type { ResearcherTopic, ResearcherTopics } from '../types/researchers';
import { Button, Callout, useAction } from '.';

/**
 * Offers the topics the researcher's own profile declares -- what they
 * want more of and what they do not -- to an interest built from them.
 * Applied, the wanted topics join the list switched on and the not-wanted
 * ones are switched off (and stay listed, struck, so they can be switched
 * back). Shown only when the interest has such a researcher.
 *
 * ``onChanged`` runs after the server has changed the list: the page
 * re-reads its topics and drops any local tick state.
 */
export function ProfileTopicsBox({ profileKey, onChanged }: { profileKey: string; onChanged: () => void | Promise<void> }) {
  const q = useQuery(keys.researcherTopics(profileKey), () => getResearcherTopics(profileKey));
  const toggle = useAction(async (enabled: boolean) => {
    try {
      await setResearcherTopics(profileKey, enabled);
    } catch (e) {
      toast.error(`Couldn't ${enabled ? 'apply' : 'remove'} the profile's topics: ${errorMessage(e)}`);
      return;
    }
    await q.refresh();
    await onChanged();
    toast.success(enabled ? "The profile's topics are applied." : "The profile's topics were removed from the list.");
  });
  const d = q.data;
  if (!d || !d.topics.available || d.researcher_id == null) return null;
  const t = d.topics;
  const who = d.researcher_name ?? `this ${TERMS.profile}`;
  return (
    <Callout tone={d.applied ? 'ok' : 'info'} title={d.applied ? `Using ${who}'s profile topics` : `${who}'s profile lists research interests`} icon="user">
      <p style={{ margin: '0 0 6px' }}>
        {d.applied
          ? <>The {plural(t.wanted.length, 'topic')} the profile wants {t.wanted.length === 1 ? 'is' : 'are'} on{t.unwanted.length > 0 ? <>, and the {plural(t.unwanted.length, 'topic')} it does not want {t.unwanted.length === 1 ? 'is' : 'are'} off (struck in the list; switch any back on if you disagree)</> : null}. They follow the profile: a change there shows up here on the next recompute.</>
          : <>The profile declares {plural(t.wanted.length, 'wanted topic')}{t.unwanted.length > 0 ? ` and ${plural(t.unwanted.length, 'topic')} to leave out` : ''}. Apply them and Radar adds the wanted ones to this list (switched on) and switches the unwanted ones off.</>}
      </p>
      <TopicChips topics={t} />
      <div className="row" style={{ marginTop: 10 }}>
        {d.applied
          ? <Button size="sm" onClick={() => toggle.run(false)} loading={toggle.busy}>Remove profile topics</Button>
          : <Button size="sm" variant="primary" icon="plus" onClick={() => toggle.run(true)} loading={toggle.busy}>Use profile topics</Button>}
        {toggle.error && <span className="field-error">{toggle.error}</span>}
      </div>
    </Callout>
  );
}

/** The wanted topics as chips, the unwanted ones dashed, the unmapped words greyed. */
export function TopicChips({ topics: t, compact = false }: { topics: ResearcherTopics; compact?: boolean }) {
  const chip = (x: ResearcherTopic, off: boolean) => (
    <li key={`${off ? 'off' : 'on'}-${x.id}`} className={off ? 'off' : undefined} title={`${x.id} · ${methodLabel(x)}`}>
      {off ? <s>{x.name}</s> : x.name}
      {x.method === 'label' && x.label && <span className="lbl">from “{x.label}”</span>}
    </li>
  );
  return (
    <>
      {t.wanted.length > 0 && (
        <ul className="profile-topic-list" aria-label="Wanted topics">{t.wanted.map((x) => chip(x, false))}</ul>
      )}
      {(t.unwanted.length > 0 || t.unwanted_labels.length > 0) && (
        <ul className="profile-topic-list" aria-label="Not wanted">
          {t.unwanted.map((x) => chip(x, true))}
          {!compact && t.unwanted_labels.filter((l) => !t.unwanted.some((x) => x.label === l)).map((l) => (
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
