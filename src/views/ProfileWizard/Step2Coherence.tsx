import { useEffect, useState } from 'react';
import {
  getDraftCoherence,
  type DraftCoherence,
} from '../../api/endpoints/wizard';
import { useDraft } from '../../api/hooks/useDraft';

interface Props {
  onPrev: () => void;
  onNext: () => void;
}

export function Step2Coherence({ onPrev, onNext }: Props) {
  const { state } = useDraft();
  const [coh, setCoh] = useState<DraftCoherence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.slug) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDraftCoherence(state.slug)
      .then((c) => {
        if (!cancelled) setCoh(c);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.slug]);

  const banner = coh ? bannerFor(coh) : null;

  return (
    <div className="section">
      <h3>
        Step 2 — Coherence <span className="hr" />
        <span
          className="mono"
          style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.08em' }}
        >
          {coh ? `N=${coh.n} SEEDS` : '—'}
        </span>
      </h3>

      {loading && <div className="empty">COMPUTING COHERENCE…</div>}
      {error && (
        <div
          className="mono"
          style={{
            padding: 8,
            color: 'var(--err)',
            background: 'color-mix(in oklab, var(--bg-0), var(--err) 4%)',
            borderLeft: '2px solid var(--err)',
            fontSize: 11,
          }}
        >
          {error}
        </div>
      )}

      {coh && banner && (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            borderLeft: `2px solid ${banner.color}`,
            background: `color-mix(in oklab, var(--bg-0), ${banner.color} 4%)`,
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: banner.color,
              letterSpacing: '0.16em',
            }}
          >
            {banner.label}
          </div>
          <div style={{ marginTop: 6, color: 'var(--fg-2)', fontSize: 13 }}>
            {banner.message}
          </div>
        </div>
      )}

      {coh && (
        <>
          <div
            className="mono"
            style={{
              display: 'flex',
              gap: 24,
              fontSize: 11,
              color: 'var(--fg-3)',
              marginBottom: 8,
            }}
          >
            <span>
              median <b className="num">{coh.median.toFixed(3)}</b>
            </span>
            <span>
              IQR <b className="num">{coh.iqr.toFixed(3)}</b>
            </span>
          </div>
          <div className="hist">
            {coh.bins.map((v, i) => {
              const max = Math.max(...coh.bins, 1);
              const isHot = i >= 7 && i <= 11;
              return (
                <div
                  key={i}
                  className={`bar ${isHot ? 'hot' : 'muted'}`}
                  style={{ height: `${(v / max) * 100}%` }}
                />
              );
            })}
          </div>
          <div className="hist-axis">
            <span>0.00</span>
            <span>0.25</span>
            <span>0.50</span>
            <span>0.75</span>
            <span>1.00</span>
          </div>
        </>
      )}

      <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn" onClick={onPrev}>
          ← BACK
        </button>
        <button className="btn primary" onClick={onNext} disabled={!coh}>
          NEXT · TOPICS →
        </button>
      </div>
    </div>
  );
}

interface Banner {
  label: string;
  message: string;
  color: string;
}

function bannerFor(coh: DraftCoherence): Banner {
  // Bimodal is expected for multi-topic profiles; suppress the warning.
  if (coh.median >= 0.75) {
    return {
      label: 'HEALTH · TIGHT',
      message: 'Seeds cluster cleanly around a single topic.',
      color: 'var(--ok)',
    };
  }
  if (coh.median >= 0.6) {
    return {
      label: 'HEALTH · ACCEPTABLE',
      message:
        'The topic is real but loose; consider adding more focused seeds before committing.',
      color: 'var(--ok)',
    };
  }
  return {
    label: 'HEALTH · LOW COHERENCE',
    message:
      'Seeds do not cluster on a single topic. The selector will be dominated by whichever sub-cluster pulls the centroid.',
    color: 'var(--err)',
  };
}
