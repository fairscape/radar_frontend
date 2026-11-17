import { useEffect, useState } from 'react';
import { getSeedUmls, type SeedUmlsStatus } from '../api/endpoints/wizard';
import { plural } from '../lib/format';
import { Button, Callout } from '.';

const KEPT = 'The UMLS topics found before are kept, with their on/off settings.';

// The list no longer reads seeds itself (review U5): "Read them now" waits
// for them as the page did on entry, then builds the list again. Not
// "Reload the page": on the edit page that leaves the edit (UF-R4).
function message(st: SeedUmlsStatus): string {
  const n = st.topics_n ?? 0;
  switch (st.topics_reason) {
    case 'busy':
      return `The database was busy, so this list was built without them. ${KEPT}`;
    case 'bad_data':
      return `The stored UMLS data of ${plural(n, 'seed')} could not be read, so ${n === 1 ? 'it has' : 'they have'} to be read again. ${KEPT}`;
    case 'failed':
      return `UMLS concepts could not be read from ${plural(n, 'seed')}; BioXplorer tries again in a few hours. ${KEPT}`;
    case 'pending':
      return `${plural(n, 'seed')} ${n === 1 ? 'has' : 'have'} not been read for UMLS concepts yet. ${KEPT}`;
    default:
      return `Something went wrong bringing them in. ${KEPT}`;
  }
}

/**
 * Warns when the topic list above was built without (all of) the seeds'
 * UMLS concepts. ``listed`` is the list's data: the server records how its
 * last aggregation went, so this asks again whenever the list is rebuilt.
 */
export function UmlsNotice({ profileKey, listed, onReadNow }: { profileKey: string; listed: unknown; onReadNow: () => void }) {
  const [st, setSt] = useState<SeedUmlsStatus | null>(null);
  useEffect(() => {
    if (!listed) return;
    let alive = true;
    getSeedUmls(profileKey).then((s) => { if (alive) setSt(s); }).catch(() => {});
    return () => { alive = false; };
  }, [profileKey, listed]);
  if (!st || st.topics_available) return null;
  return (
    <Callout tone="warn" title="UMLS concepts are temporarily not available">
      {message(st)}
      {st.topics_reason !== 'failed' && (
        <div style={{ marginTop: 8 }}>
          <Button size="sm" onClick={onReadNow}>{st.topics_reason === 'pending' || st.topics_reason === 'bad_data' ? 'Read them now' : 'Try again'}</Button>
        </div>
      )}
    </Callout>
  );
}
