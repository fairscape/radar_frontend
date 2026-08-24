import { useState } from 'react';
import type { RerankerCandidate } from '../types/radar';

interface Props {
  candidates: RerankerCandidate[];
  n: number;
  avgRankChange: number;
  maxRankUp: number;
  maxRankDown: number;
  queriesUsed: string[];
}

const ROW_H = 28;
const MAX_SHOW = 30;

export function RerankerBumpChart({
  candidates, n, avgRankChange, maxRankUp, maxRankDown, queriesUsed,
}: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? candidates : candidates.slice(0, MAX_SHOW);
  const count = visible.length;

  // Build before-sorted list (by selector score, descending)
  const beforeSorted = [...visible].sort((a, b) => b.score_selector - a.score_selector);
  // After-sorted list (by blended rank ascending)
  const afterSorted = [...visible].sort((a, b) => a.rank_after - b.rank_after);

  // Maps: openalex_id -> visual row index (0-based) in each column.
  // These position the SVG lines and nothing else. Rows have to sit on
  // consecutive pixels; ranks do not, and a paper the selector had at
  // 114 has no row to be drawn from in a 30-row chart.
  const beforeIndex: Record<string, number> = {};
  beforeSorted.forEach((c, i) => { beforeIndex[c.openalex_id] = i; });
  const afterIndex: Record<string, number> = {};
  afterSorted.forEach((c, i) => { afterIndex[c.openalex_id] = i; });

  // How far the reranker actually moved a paper, over every candidate —
  // not over the rows on screen. Deriving it from visual positions made
  // the figure a function of how many rows were expanded: one paper read
  // "+24" collapsed, "+39" expanded and "+111" in truth, and the summary
  // said the reranker moved papers 9.7 places on average when the real
  // figure was 43.4. Positive = promoted.
  const deltaOf = (c: RerankerCandidate) => c.rank_before - c.rank_after;

  const svgH = count * ROW_H;

  return (
    <div>
      {/* Summary stats */}
      <div className="rr-summary">
        <div className="rr-stat">
          <div className="k">Reranked</div>
          <div className="v">{n}</div>
        </div>
        <div className="rr-stat">
          <div className="k">Avg Change</div>
          <div className="v" title="Mean |rank change| over all reranked candidates">
            {avgRankChange.toFixed(1)}
          </div>
        </div>
        <div className="rr-stat">
          <div className="k">Max Promoted</div>
          <div className="v" style={{ color: maxRankUp > 0 ? 'var(--ok)' : undefined }}>
            +{maxRankUp}
          </div>
        </div>
        <div className="rr-stat">
          <div className="k">Max Demoted</div>
          <div className="v" style={{ color: maxRankDown > 0 ? 'var(--err)' : undefined }}>
            -{maxRankDown}
          </div>
        </div>
      </div>

      {/* Queries used */}
      {queriesUsed.length > 0 && (
        <div className="rr-queries" style={{
          margin: '8px 0',
          padding: '6px 10px',
          background: 'var(--bg-2, #1a1a2e)',
          borderRadius: 4,
          fontSize: 11,
          lineHeight: 1.6,
        }}>
          <span className="mono" style={{ color: 'var(--fg-3)', marginRight: 6 }}>
            QUERIES ({queriesUsed.length}):
          </span>
          {queriesUsed.map((q, i) => (
            <span key={i} style={{
              display: 'inline-block',
              padding: '1px 6px',
              margin: '2px 3px',
              background: 'var(--bg-3, #252540)',
              borderRadius: 3,
              color: 'var(--fg-2)',
              fontSize: 10,
            }}>
              {q}
            </span>
          ))}
        </div>
      )}

      {/* Ranks are real; row positions are not. Saying so, because the
          two disagree on purpose and the gap is large — a paper can read
          114 while sitting on the twenty-seventh row. */}
      <div className="mono" style={{
        fontSize: 10, color: 'var(--fg-3)', margin: '6px 0 2px',
      }}>
        Ranks are over all {n} candidates; rows show only these {count}, so the
        connecting lines compress the distances.
      </div>

      {/* Bump chart */}
      <div className="rr-chart">
        {/* Before column */}
        <div className="rr-col">
          <div className="rr-col-head">Before (Selector)</div>
          {beforeSorted.map((c) => {
            const delta = deltaOf(c);
            const cls = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
            return (
              <div
                key={c.openalex_id}
                className={`rr-row ${hovered === c.openalex_id ? 'hl' : ''}`}
                onMouseEnter={() => setHovered(c.openalex_id)}
                onMouseLeave={() => setHovered(null)}
              >
                <span className="rank">{c.rank_before}</span>
                <span className="ttl">{c.title}</span>
                <span className="sc">{c.score_selector.toFixed(3)}</span>
                <span className={`rr-delta ${cls}`}>
                  {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '='}
                </span>
              </div>
            );
          })}
        </div>

        {/* SVG connecting lines */}
        <div className="rr-lines">
          <svg width="100%" height={svgH} viewBox={`0 0 200 ${svgH}`} preserveAspectRatio="none">
            {visible.map((c) => {
              const bIdx = beforeIndex[c.openalex_id] ?? 0;
              const aIdx = afterIndex[c.openalex_id] ?? 0;
              const y1 = bIdx * ROW_H + ROW_H / 2;
              const y2 = aIdx * ROW_H + ROW_H / 2;
              const delta = deltaOf(c);
              const cls = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
              const isHl = hovered === c.openalex_id;
              return (
                <path
                  key={c.openalex_id}
                  className={`rr-line ${cls} ${isHl ? 'hl' : ''}`}
                  d={`M 0 ${y1} C 100 ${y1}, 100 ${y2}, 200 ${y2}`}
                  onMouseEnter={() => setHovered(c.openalex_id)}
                  onMouseLeave={() => setHovered(null)}
                />
              );
            })}
          </svg>
        </div>

        {/* After column */}
        <div className="rr-col">
          <div className="rr-col-head">After (Blended)</div>
          {afterSorted.map((c) => {
            const delta = deltaOf(c);
            const cls = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
            return (
              <div
                key={c.openalex_id}
                className={`rr-row ${hovered === c.openalex_id ? 'hl' : ''}`}
                onMouseEnter={() => setHovered(c.openalex_id)}
                onMouseLeave={() => setHovered(null)}
              >
                <span className="rank">{c.rank_after}</span>
                <span className="ttl">{c.title}</span>
                <span className="sc">{c.score_blended.toFixed(3)}</span>
                <span className={`rr-delta ${cls}`}>
                  {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '='}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Show more / less */}
      {candidates.length > MAX_SHOW && (
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <button
            className="btn"
            onClick={() => setShowAll(!showAll)}
            style={{ fontSize: 10 }}
          >
            {showAll ? `SHOW TOP ${MAX_SHOW}` : `SHOW ALL ${candidates.length}`}
          </button>
        </div>
      )}
    </div>
  );
}
