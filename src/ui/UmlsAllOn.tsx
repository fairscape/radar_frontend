import type { Topic } from '../types/radar';
import { Button } from '.';

/**
 * UMLS topics are added switched off (FUNCTIONAL_SPEC U.2): they are found
 * by matching a seed's words to UMLS concepts, and a misread word matches
 * as surely as the subject. This turns them all on at once, with a word on
 * why to look first; each can still be switched on or off on its own.
 */
export function UmlsAllOn({ list, selected, onAdd }: { list: Topic[]; selected: Set<string>; onAdd: (ids: string[]) => void }) {
  const umls = list.filter((t) => t.source === 'umls');
  if (umls.length === 0) return null;
  // One the researcher's profile does not want stays as the profile says.
  const off = umls.filter((t) => !selected.has(t.id) && t.profile !== 'not_interest');
  return (
    <div className="row" style={{ gap: 10, margin: '6px 0 10px', alignItems: 'center', flexWrap: 'wrap' }}>
      <Button size="sm" disabled={off.length === 0} onClick={() => onAdd(off.map((t) => t.id))}>
        {off.length === 0 ? 'All UMLS topics are in the query' : off.length === umls.length ? `Add all ${umls.length} UMLS topics to the query` : `Add the other ${off.length} UMLS topics to the query`}
      </Button>
      <span className="small muted">UMLS topics are found by matching words, so some may be off-topic. Have a look before adding them.</span>
    </div>
  );
}

/** The concept a UMLS topic came from, shown beside it. */
export function UmlsConcept({ topic }: { topic: Topic }) {
  if (topic.source !== 'umls' || !topic.umls_concept) return null;
  return <span className="small muted" title={topic.umls_confidence != null ? `concept confidence ${topic.umls_confidence.toFixed(2)}` : undefined}>from “{topic.umls_concept}”</span>;
}
