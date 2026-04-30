import { useMemo } from 'react';

interface Props {
  scores: number[];
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  bins?: number;
  // Optional override for the count summary label.
  label?: string;
}

// Slidable histogram for dry-run calibration. Bars left of the slider
// (scores < θ) render muted; bars at/right of the slider (scores ≥ θ)
// render hot, and the summary line tells the user how many of the
// fetched candidates would pass at the chosen threshold.
export function ThresholdHistogram({
  scores,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  bins = 40,
  label,
}: Props) {
  const counts = useMemo(() => {
    const out = new Array(bins).fill(0) as number[];
    if (max <= min) return out;
    const span = max - min;
    for (const s of scores) {
      if (!Number.isFinite(s)) continue;
      const clamped = Math.max(min, Math.min(max, s));
      let idx = Math.floor(((clamped - min) / span) * bins);
      if (idx >= bins) idx = bins - 1;
      if (idx < 0) idx = 0;
      out[idx] += 1;
    }
    return out;
  }, [scores, bins, min, max]);

  const peak = useMemo(() => Math.max(1, ...counts), [counts]);
  const passing = useMemo(
    () => scores.reduce((acc, s) => (s >= value ? acc + 1 : acc), 0),
    [scores, value],
  );

  return (
    <div className="thr-hist">
      <div className="thr-hist-legend mono">
        <span>
          θ = <b className="num">{value.toFixed(2)}</b>
        </span>
        <span>
          {label ?? (
            <>
              <b className="num">{passing}</b> of{' '}
              <b className="num">{scores.length}</b> would pass
            </>
          )}
        </span>
      </div>

      <div className="thr-hist-bars">
        {counts.map((c, i) => {
          const binStart = min + ((max - min) * i) / bins;
          const isHot = binStart >= value - 1e-9;
          return (
            <div
              key={i}
              className={`thr-hist-bar ${isHot ? 'hot' : 'muted'}`}
              style={{ height: `${(c / peak) * 100}%` }}
              title={`${c} @ ${binStart.toFixed(2)}–${(binStart + (max - min) / bins).toFixed(2)}`}
            />
          );
        })}
      </div>

      <input
        type="range"
        className="thr-hist-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />

      <div className="thr-hist-axis mono">
        <span>{min.toFixed(2)}</span>
        <span>{((min + max) / 2).toFixed(2)}</span>
        <span>{max.toFixed(2)}</span>
      </div>
    </div>
  );
}
