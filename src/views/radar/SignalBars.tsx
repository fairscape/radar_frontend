import type { Card } from '../../types/radar';

export function SignalBars({ card }: { card: Card }) {
  const short = card.bucket === 'medium' ? 'med' : card.bucket;
  const rows = [
    { lbl: 'centroid', v: card.centroidCos, tone: short },
    { lbl: 'topic', v: card.topicMatch, tone: 'med' },
    { lbl: 'novelty', v: card.noveltyDelta, tone: 'low' },
  ];
  return (
    <div className="c-sig">
      {rows.map((r) => (
        <div className="sig-row" key={r.lbl}>
          <span className="lbl">{r.lbl}</span>
          <span className={`sig-bar ${r.tone}`}>
            <i style={{ width: `${Math.max(4, r.v * 100)}%` }} />
          </span>
          <span className="num">{r.v.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}
