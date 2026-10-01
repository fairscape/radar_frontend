import { useEffect, useRef } from 'react';
import type { DryRunPaper } from '../api/endpoints/wizard';
import { PaperLink } from './paperLink';

/**
 * Papers best first, with a line where the threshold falls -- wizard step 4
 * (the trial scan) and an interest's Threshold tab (everything its scans
 * stored). The wizard used to list the top 8, which pass at any sensible
 * threshold, so moving the slider changed nothing in the list. Now the line
 * moves with the slider and the box scrolls to keep it in view: the papers
 * just above it are the last ones in, the ones just below are what lowering
 * it would add.
 */
export function ThresholdPaperList({ papers, value, label }: { papers: DryRunPaper[]; value: number; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const passing = papers.filter((p) => p.score >= value).length;
  useEffect(() => {
    // Scroll the box only, never the page: centre the line in it.
    const b = box.current, l = line.current;
    if (!b || !l) return;
    b.scrollTop = Math.max(0, l.offsetTop - b.clientHeight / 2);  // .threshold-papers is position: relative
  }, [passing]);
  const row = (p: DryRunPaper, i: number) => (
    <div className={`preview-row ${p.score >= value ? '' : 'below'}`} key={p.id || i}>
      <span className="sc">{p.score.toFixed(3)}</span>
      <span>
        <div><PaperLink title={p.title} id={p.id} /></div>
        <div className="v">{[p.venue, p.year].filter(Boolean).join(' · ') || '—'}</div>
      </span>
    </div>
  );
  return (
    <div>
      <div className="field-label" style={{ marginBottom: 6 }}>
        {label} · {passing} of {papers.length} reach your feed
      </div>
      <div className="threshold-papers" ref={box}>
        {papers.slice(0, passing).map(row)}
        <div className="threshold-line" ref={line}>
          <span>threshold {value.toFixed(3)} — {passing === papers.length ? 'every paper passes' : 'papers below this line are filtered out'}</span>
        </div>
        {papers.slice(passing).map((p, i) => row(p, passing + i))}
      </div>
    </div>
  );
}
