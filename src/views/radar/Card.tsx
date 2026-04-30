import { ScoreCell } from './ScoreCell';
import { SignalBars } from './SignalBars';
import { swatchFor } from '../../lib/apiSwitch';
import type { Card as CardData, CardState, Profile } from '../../types/radar';

export function Card({
  card,
  profile,
  expanded,
  onToggle,
  state,
  onSave,
  onDismiss,
}: {
  card: CardData;
  profile: Profile;
  expanded: boolean;
  onToggle: () => void;
  state: CardState;
  onSave: () => void;
  onDismiss: () => void;
}) {
  const cls = `card ${expanded ? 'expanded' : ''} ${state === 'saved' ? 'saved' : ''} ${state === 'dismissed' ? 'dismissed' : ''}`;
  return (
    <div className={cls}>
      <ScoreCell score={card.score} bucket={card.bucket} />
      <div className="c-profile">
        <span className="p-name">
          <span className="swatch" style={{ background: swatchFor(profile.hue) }} />
          {profile.name}
        </span>
        <span className="p-meta">Δ θ = +{(card.score - profile.threshold).toFixed(3)}</span>
        <span className="p-meta">{card.mins} min read</span>
      </div>
      <div className="c-body">
        <div className="title" onClick={onToggle}>{card.title}</div>
        <div className="c-authors">
          {card.authors.join(', ')} <span className="venue">· {card.venue}</span>
        </div>
        {expanded && (
          <div className="abstract">
            <span className="fieldlabel">Abstract</span>
            {card.abstract}
            {card.terms && card.terms.length > 0 && (
              <div className="abs-terms">
                <span className="fieldlabel" style={{ width: '100%', marginBottom: 2 }}>
                  Term matches
                </span>
                {card.terms.map((t) => (
                  <span key={t} className={`term ${card.matched.includes(t) ? 'match' : ''}`}>
                    {card.matched.includes(t) ? '✓ ' : ''}
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="c-meta">
        <div className="row">
          <span className="lbl">DOI</span>
          <span className="val link">{card.doi || '—'}</span>
        </div>
        <div className="row">
          <span className="lbl">OA</span>
          <span className="val">{card.openalex}</span>
        </div>
        <div className="row">
          <span className="lbl">Date</span>
          <span className="val">{card.date}</span>
        </div>
        <div className="row">
          <span className="lbl">MeSH</span>
          <span className="val">{card.mesh.length ? card.mesh.slice(0, 2).join(', ') : '—'}</span>
        </div>
      </div>
      <SignalBars card={card} />
      <div className="c-actions">
        <div className="act save" onClick={onSave}>
          <span>{state === 'saved' ? '✓ SAVED' : 'SAVE'}</span>
          <span className="k">S</span>
        </div>
        <div className="act dismiss" onClick={onDismiss}>
          <span>{state === 'dismissed' ? '✗ DISMISSED' : 'DISMISS'}</span>
          <span className="k">X</span>
        </div>
        <div className="act open" onClick={onToggle}>
          <span>{expanded ? 'COLLAPSE' : 'ABSTRACT'}</span>
          <span className="k">␣</span>
        </div>
      </div>
    </div>
  );
}
