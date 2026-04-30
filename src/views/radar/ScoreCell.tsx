import type { Bucket } from '../../types/radar';

export function ScoreCell({ score, bucket }: { score: number; bucket: Bucket }) {
  const short = bucket === 'medium' ? 'med' : bucket;
  return (
    <div className="c-score">
      <div className="pct mono num">{score.toFixed(3)}</div>
      <div className={`bucket ${short}`}>{short}</div>
    </div>
  );
}
