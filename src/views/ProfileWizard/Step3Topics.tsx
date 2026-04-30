import { useEffect, useState } from 'react';
import type { Topic } from '../../types/radar';
import { getDraftTopics } from '../../api/endpoints/wizard';
import { useDraft } from '../../api/hooks/useDraft';

interface Props {
  onPrev: () => void;
  onNext: () => void;
}

export function Step3Topics({ onPrev, onNext }: Props) {
  const { state, toggleTopic, setSelectedTopics } = useDraft();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.slug) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDraftTopics(state.slug)
      .then((t) => {
        if (cancelled) return;
        setTopics(t);
        // Default selection: every topic the aggregator surfaced. The
        // user can prune from there.
        if (state.selectedTopicIds.length === 0) {
          setSelectedTopics(t.map((x) => x.id));
        }
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
  }, [state.slug, setSelectedTopics, state.selectedTopicIds.length]);

  const selected = new Set(state.selectedTopicIds);

  return (
    <div className="section">
      <h3>
        Step 3 — Topics <span className="hr" />
        <span
          className="mono"
          style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.08em' }}
        >
          {topics.length} CANDIDATES · {selected.size} SELECTED
        </span>
      </h3>
      <div className="mono" style={{ color: 'var(--fg-3)', marginBottom: 8 }}>
        Toggle the topics the gatherer should query OpenAlex for. Default: all
        aggregated topics on.
      </div>

      {loading && <div className="empty">LOADING TOPICS…</div>}
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

      <div className="topics">
        {topics.map((t) => (
          <span
            key={t.id}
            className={`topic ${selected.has(t.id) ? 'on' : ''}`}
            style={{ cursor: 'pointer' }}
            onClick={() => toggleTopic(t.id)}
          >
            <span className="tid">{t.id}</span>
            {t.name}
            <span className="tct">n={t.count}</span>
          </span>
        ))}
      </div>

      <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn" onClick={onPrev}>
          ← BACK
        </button>
        <button
          className="btn primary"
          onClick={onNext}
          disabled={selected.size === 0}
        >
          NEXT · CALIBRATE →
        </button>
      </div>
    </div>
  );
}
