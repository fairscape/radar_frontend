/**
 * "Publication years": new papers only, or a range of years.
 *
 * RADAR used to gather only papers published since its last scan, so every
 * interest's pool was recent. A range makes the trial scan sample those
 * years and, once saved, fetches papers from them once (a backfill); the
 * later scans (Scan now) add new papers either way. ``to`` null = "now".
 */
import type { YearSpan } from '../types/radar';
import { Select } from './index';

const NOW = new Date().getFullYear();
const FIRST = 1990;
const YEARS = Array.from({ length: NOW - FIRST + 1 }, (_, i) => NOW - i);
const MAX_SPAN = 15;   // rag_lib/years.MAX_BACKFILL_YEARS

export function YearRange({ value, onChange, disabled = false, newOnlyLabel = 'New papers only' }: {
  value: YearSpan | null;
  onChange: (v: YearSpan | null) => void;
  disabled?: boolean;
  newOnlyLabel?: string;
}) {
  const span = value ? (value.to ?? NOW) - value.from + 1 : 0;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row-wrap" style={{ gap: 16 }} role="radiogroup" aria-label="Publication years">
        <label className="row small" style={{ gap: 6, cursor: 'pointer' }}>
          <input type="radio" checked={!value} disabled={disabled} onChange={() => onChange(null)} />
          {newOnlyLabel}
        </label>
        <label className="row small" style={{ gap: 6, cursor: 'pointer' }}>
          <input type="radio" checked={!!value} disabled={disabled} onChange={() => onChange({ from: NOW - 4, to: null })} />
          A range of years
        </label>
      </div>
      {value && (
        <div className="row" style={{ gap: 8 }}>
          <span className="small muted">From</span>
          <Select className="compact" value={value.from} disabled={disabled} aria-label="From year"
            onChange={(e) => {
              const from = Number(e.target.value);
              onChange({ from, to: value.to != null && value.to < from ? from : value.to });
            }}>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <span className="small muted">to</span>
          <Select className="compact" value={value.to ?? 'now'} disabled={disabled} aria-label="To year"
            onChange={(e) => onChange({ from: value.from, to: e.target.value === 'now' ? null : Number(e.target.value) })}>
            <option value="now">Now</option>
            {YEARS.filter((y) => y >= value.from).map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          {span > MAX_SPAN && <span className="small muted">Papers are fetched for the last {MAX_SPAN} of these years.</span>}
        </div>
      )}
    </div>
  );
}

/** Whether a paper's year falls in the range (no year, or no range: yes). */
/** The first year a backfill of ``span`` reaches: rag_lib/years.fetch_span
 * keeps only the most recent MAX_SPAN years of a longer range. */
export function fetchStart(span: YearSpan): number {
  return Math.max(span.from, (span.to ?? NOW) - MAX_SPAN + 1);
}

export function inSpan(year: number | null | undefined, span: YearSpan | null): boolean {
  if (!span || year == null) return true;
  return year >= span.from && (span.to == null || year <= span.to);
}
