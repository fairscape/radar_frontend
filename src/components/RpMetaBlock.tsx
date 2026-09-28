/**
 * RpMetaBlock — read-only view of the Researcher Profile metadata a topic
 * was seeded from (summary, affiliation, expertise, not_interests,
 * collaborators). Shared by both themes' detail pages.
 */

import type { RpMeta } from '../types/radar';

function deslug(s: string): string {
  return s.replace(/[-_]+/g, ' ').trim();
}

export function RpMetaBlock({ meta }: { meta: RpMeta }) {
  const line = [meta.affiliation, meta.field].filter(Boolean).join(' · ');
  const stats = meta.paper_stats;
  return (
    <div className="rp-meta">
      {(line || meta.orcid) && (
        <div>
          <div className="k">RESEARCHER</div>
          <p>
            {meta.name}
            {line ? ` · ${line}` : ''}
            {meta.orcid ? ` · ORCID ${meta.orcid}` : meta.rid ? ` · ${meta.rid}` : ''}
          </p>
        </div>
      )}
      {meta.summary && (
        <div>
          <div className="k">SUMMARY</div>
          <p>{meta.summary}</p>
        </div>
      )}
      {meta.expertise && meta.expertise.length > 0 && (
        <div>
          <div className="k">EXPERTISE · switches concepts on</div>
          <div className="chips">
            {meta.expertise.map((e) => (
              <span key={e} className="chip" title={e}>
                {deslug(e)}
              </span>
            ))}
          </div>
        </div>
      )}
      {meta.not_interests && meta.not_interests.length > 0 && (
        <div>
          <div className="k">NOT INTERESTS · switches concepts off</div>
          <div className="chips">
            {meta.not_interests.map((e) => (
              <span key={e} className="chip off" title={e}>
                {deslug(e)}
              </span>
            ))}
          </div>
        </div>
      )}
      {meta.collaborators && meta.collaborators.length > 0 && (
        <div>
          <div className="k">COLLABORATORS</div>
          <p>{meta.collaborators.join(' · ')}</p>
        </div>
      )}
      {stats && typeof stats.total === 'number' && (
        <div>
          <div className="k">PAPERS (PER THE PROFILE)</div>
          <p>
            {stats.total} total
            {typeof stats.first === 'number' ? ` · ${stats.first} first` : ''}
            {typeof stats.last === 'number' ? ` · ${stats.last} last` : ''}
            {typeof stats.corresponding === 'number' ? ` · ${stats.corresponding} corresponding` : ''}
            {stats.year_min && stats.year_max ? ` · ${stats.year_min}–${stats.year_max}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
