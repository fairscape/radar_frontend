import { useEffect, useState } from 'react';
import { getSeedUmls, type SeedUmlsStatus } from '../api/endpoints/wizard';
import { plural } from '../lib/format';
import { Callout } from '.';

const KEPT = 'The UMLS topics found before are kept, with their on/off settings.';

function message(st: SeedUmlsStatus): string {
  const n = st.topics_n ?? 0;
  switch (st.topics_reason) {
    case 'busy':
      return `The database was busy, so this list was built without them. ${KEPT} Reload the page to try again.`;
    case 'bad_data':
      return `The stored UMLS data of ${plural(n, 'seed')} could not be read; ${n === 1 ? 'it is' : 'they are'} being read again. ${KEPT}`;
    case 'failed':
      return `UMLS concepts could not be read from ${plural(n, 'seed')}; BioXplorer tries again in a few hours. ${KEPT}`;
    case 'pending':
      return `${plural(n, 'seed')} ${n === 1 ? 'has' : 'have'} not been read for UMLS concepts yet. ${KEPT} Reload once BioXplorer has read them.`;
    default:
      return `Something went wrong bringing them in. ${KEPT} Reload the page to try again.`;
  }
}

/**
 * Warns when the topic list above was built without (all of) the seeds'
 * UMLS concepts. ``listed`` is the list's data: the server records how its
 * last aggregation went, so this asks again whenever the list is rebuilt.
 */
export function UmlsNotice({ profileKey, listed }: { profileKey: string; listed: unknown }) {
  const [st, setSt] = useState<SeedUmlsStatus | null>(null);
  useEffect(() => {
    if (!listed) return;
    let alive = true;
    getSeedUmls(profileKey).then((s) => { if (alive) setSt(s); }).catch(() => {});
    return () => { alive = false; };
  }, [profileKey, listed]);
  if (!st || st.topics_available) return null;
  return <Callout tone="warn" title="UMLS concepts are temporarily not available">{message(st)}</Callout>;
}
