import type { ResearcherTopic, ResearcherTopics } from '../types/researchers';

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
