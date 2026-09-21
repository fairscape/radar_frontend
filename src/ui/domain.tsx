/** Domain-specific widgets shared by several pages. */
import { useMemo, useState, type ReactNode } from 'react';
import type { Bucket, Profile, RerankerCandidate } from '../types/radar';
import { Badge, Button, Icon, ProgressBar, Swatch, type Tone } from './index';
import { kindLabel, stepLabel, type Job } from '../lib/jobs';
import { paths } from '../lib/router';
import { Link } from './Link';
import { fmtDuration } from '../lib/format';

export function healthOf(p: Profile): { tone: Tone; label: string; hint: string } {
  if (p.isDraft) return { tone: 'warn', label: 'Draft', hint: 'Not finished. Resume to complete setup.' };
  if (p.seeds < 2) return { tone: 'neutral', label: 'Single seed', hint: 'Coherence is not measurable with one seed.' };
  if (p.health === 'err') return { tone: 'err', label: 'Low coherence', hint: 'Seeds do not cluster on one topic. Consider removing outliers or splitting the interest.' };
  if (p.health === 'warn') return { tone: 'warn', label: 'Loose', hint: 'The topic is real but broad. More focused seeds will sharpen it.' };
  return { tone: 'ok', label: 'Healthy', hint: 'Seeds cluster cleanly.' };
}

export function HealthBadge({ profile }: { profile: Profile }) {
  const h = healthOf(profile);
  return (
    <Badge tone={h.tone} dot title={h.hint}>
      {h.label}
    </Badge>
  );
}

export function BucketBadge({ bucket }: { bucket: Bucket }) {
  const label = bucket === 'high' ? 'High' : bucket === 'medium' ? 'Medium' : 'Low';
  return <Badge tone={bucket}>{label}</Badge>;
}

export function InterestName({ profile, link = true }: { profile: Profile; link?: boolean }) {
  const inner = (
    <>
      <Swatch hue={profile.hue} />
      <span className="truncate">{profile.name}</span>
    </>
  );
  if (!link) return <span className="paper-interest">{inner}</span>;
  return (
    <Link className="paper-interest" href={paths.interest(profile.key)}>
      {inner}
    </Link>
  );
}

export function JobProgress({ job, compact }: { job: Job; compact?: boolean }) {
  const frac = job.nTotal && job.nProcessed != null && job.nTotal > 0 ? job.nProcessed / job.nTotal : null;
  const counts = job.nTotal != null && job.nProcessed != null ? `${job.nProcessed.toLocaleString()} / ${job.nTotal.toLocaleString()}` : '';
  if (job.status === 'error') {
    return (
      <div className="row" style={{ color: 'var(--err)', fontSize: 13 }}>
        <Icon name="alert" size={14} /> {job.error}
      </div>
    );
  }
  if (job.status === 'done') {
    return (
      <div className="row" style={{ color: 'var(--ok)', fontSize: 13 }}>
        <Icon name="check" size={14} /> {job.summary ?? 'Done'}
      </div>
    );
  }
  return (
    <ProgressBar
      value={job.step && job.step !== 'loading_profile' ? frac : null}
      label={compact ? undefined : `${kindLabel(job.kind)} · ${stepLabel(job)}`}
      sub={compact ? undefined : `${counts}${counts && job.message ? ' · ' : ''}${job.message ?? ''}`.trim() || fmtDuration(new Date(job.startedAt).toISOString(), null)}
    />
  );
}

export function ScoreValue({ score }: { score: number }) {
  return <span className="score-value">{score.toFixed(3)}</span>;
}

// --- Threshold histogram ------------------------------------------------------

export function ThresholdHistogram({
  scores,
  value,
  onChange,
  bins = 40,
  min = 0.5,
  max = 1,
  reference,
}: {
  scores: number[];
  value: number;
  onChange: (v: number) => void;
  bins?: number;
  min?: number;
  max?: number;
  /** Optional second marker (e.g. the currently saved threshold). */
  reference?: number | null;
}) {
  const counts = useMemo(() => {
    const out = new Array(bins).fill(0) as number[];
    const span = max - min;
    for (const s of scores) {
      if (!Number.isFinite(s)) continue;
      const c = Math.max(min, Math.min(max, s));
      let i = Math.floor(((c - min) / span) * bins);
      if (i >= bins) i = bins - 1;
      out[i] += 1;
    }
    return out;
  }, [scores, bins, min, max]);
  const peak = Math.max(1, ...counts);
  const passing = scores.filter((s) => s >= value).length;
  const refPassing = reference != null ? scores.filter((s) => s >= reference).length : null;
  return (
    <div className="hist">
      <div className="hist-legend">
        <span>
          Threshold <b className="mono">{value.toFixed(2)}</b>
        </span>
        <span>
          <b className="mono">{passing.toLocaleString()}</b> of <b className="mono">{scores.length.toLocaleString()}</b> would pass
          {refPassing != null && reference != null && Math.abs(reference - value) > 0.004 && (
            <span className="muted"> (saved {reference.toFixed(2)} passes {refPassing.toLocaleString()})</span>
          )}
        </span>
      </div>
      <div className="hist-bars" aria-hidden="true">
        {counts.map((c, i) => {
          const start = min + ((max - min) * i) / bins;
          return (
            <div
              key={i}
              className={`hist-bar ${start >= value - 1e-9 ? 'hot' : 'muted'}`}
              style={{ height: `${Math.max(2, (c / peak) * 100)}%` }}
              title={`${c} papers scored ${start.toFixed(3)}–${(start + (max - min) / bins).toFixed(3)}`}
            />
          );
        })}
      </div>
      <input
        type="range"
        className="range"
        min={min}
        max={max}
        step={0.005}
        value={value}
        aria-label="Threshold"
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="hist-axis">
        <span>{min.toFixed(2)}</span>
        <span>{((min + max) / 2).toFixed(2)}</span>
        <span>{max.toFixed(2)}</span>
      </div>
    </div>
  );
}

export function CoherenceHistogram({ bins }: { bins: number[] }) {
  const peak = Math.max(1, ...bins);
  return (
    <div className="hist">
      <div className="hist-bars" aria-hidden="true">
        {bins.map((v, i) => (
          <div key={i} className={`hist-bar ${i >= bins.length / 2 ? 'hot' : 'muted'}`} style={{ height: `${Math.max(2, (v / peak) * 100)}%` }} title={`${v} pairs at ${(i / bins.length).toFixed(2)}–${((i + 1) / bins.length).toFixed(2)}`} />
        ))}
      </div>
      <div className="hist-axis">
        <span>0.00</span>
        <span>0.50</span>
        <span>1.00</span>
      </div>
    </div>
  );
}

// --- Reranker bump chart ------------------------------------------------------

const ROW_H = 28;
const MAX_SHOW = 25;

export function RerankerBumpChart({ candidates, n }: { candidates: RerankerCandidate[]; n: number }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? candidates : candidates.slice(0, MAX_SHOW);
  const before = [...visible].sort((a, b) => b.score_selector - a.score_selector);
  const after = [...visible].sort((a, b) => a.rank_after - b.rank_after);
  const bIdx: Record<string, number> = {};
  before.forEach((c, i) => (bIdx[c.openalex_id] = i));
  const aIdx: Record<string, number> = {};
  after.forEach((c, i) => (aIdx[c.openalex_id] = i));
  const delta = (c: RerankerCandidate) => c.rank_before - c.rank_after;
  const cls = (d: number) => (d > 0 ? 'up' : d < 0 ? 'down' : 'flat');
  const fmt = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `${d}` : '=');
  const h = visible.length * ROW_H;
  const Row = ({ c, rank, score }: { c: RerankerCandidate; rank: number; score: number }) => (
    <div className={`rr-row ${hovered === c.openalex_id ? 'hl' : ''}`} onMouseEnter={() => setHovered(c.openalex_id)} onMouseLeave={() => setHovered(null)}>
      <span className="rank">{rank}</span>
      <span className="ttl" title={c.title}>{c.title}</span>
      <span className="sc">{score.toFixed(3)}</span>
      <span className={`rr-delta ${cls(delta(c))}`}>{fmt(delta(c))}</span>
    </div>
  );
  return (
    <div>
      <p className="small muted" style={{ marginBottom: 8 }}>
        Ranks are over all {n} reranked candidates; only {visible.length} rows are drawn, so the lines compress distances.
      </p>
      <div className="rr-chart">
        <div>
          <div className="rr-col-head">Before · selector</div>
          {before.map((c) => <Row key={c.openalex_id} c={c} rank={c.rank_before} score={c.score_selector} />)}
        </div>
        <div className="rr-lines">
          <svg width="100%" height={h} viewBox={`0 0 120 ${h}`} preserveAspectRatio="none" aria-hidden="true">
            {visible.map((c) => {
              const y1 = bIdx[c.openalex_id] * ROW_H + ROW_H / 2;
              const y2 = aIdx[c.openalex_id] * ROW_H + ROW_H / 2;
              return <path key={c.openalex_id} className={`rr-line ${cls(delta(c))} ${hovered === c.openalex_id ? 'hl' : ''}`} d={`M 0 ${y1} C 60 ${y1}, 60 ${y2}, 120 ${y2}`} onMouseEnter={() => setHovered(c.openalex_id)} onMouseLeave={() => setHovered(null)} />;
            })}
          </svg>
        </div>
        <div>
          <div className="rr-col-head">After · blended</div>
          {after.map((c) => <Row key={c.openalex_id} c={c} rank={c.rank_after} score={c.score_blended} />)}
        </div>
      </div>
      {candidates.length > MAX_SHOW && (
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <Button size="sm" onClick={() => setShowAll((v) => !v)}>{showAll ? `Show top ${MAX_SHOW}` : `Show all ${candidates.length}`}</Button>
        </div>
      )}
    </div>
  );
}

export function SectionNote({ children }: { children: ReactNode }) {
  return <p className="small muted" style={{ marginBottom: 10 }}>{children}</p>;
}
