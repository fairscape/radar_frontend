interface Props {
  onOpen: (target: 'radar' | 'vault' | 'profiles', mode: 'dense' | 'approachable') => void;
}

const ARROW = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="13,5 20,12 13,19" />
  </svg>
);

export function Splash({ onOpen }: Props) {
  return (
    <div className="splash-root">
      <nav className="splash-nav">
        <div className="splash-brand">
          <div className="splash-logo">R</div>
          <span className="splash-brand-name">Radar</span>
        </div>
        <div className="splash-nav-links">
          <button
            type="button"
            className="splash-nav-link"
            onClick={() => onOpen('radar', 'approachable')}
          >
            Daily Radar
          </button>
          <button
            type="button"
            className="splash-nav-link"
            onClick={() => onOpen('vault', 'approachable')}
          >
            Vault
          </button>
          <button
            type="button"
            className="splash-nav-link"
            onClick={() => onOpen('profiles', 'approachable')}
          >
            Profiles
          </button>
          <button
            type="button"
            className="splash-nav-link splash-nav-pro"
            onClick={() => onOpen('radar', 'dense')}
          >
            Pro view
          </button>
        </div>
      </nav>

      <main className="splash-wrap">
        <section className="splash-hero">
          <h1 className="splash-mark">
            R<em>a</em>dar
          </h1>
          <p className="splash-lede">
            Radar reviews all newly published papers and scores them against the
            ones you care about — curating thousands of papers down to just the
            ones you're interested in.
          </p>
        </section>

        <section className="splash-doors">
          <button
            type="button"
            className="splash-door radar"
            onClick={() => onOpen('radar', 'approachable')}
          >
            <div className="num">01 / DAILY</div>
            <div className="ico">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="12" x2="18" y2="6" />
              </svg>
            </div>
            <h3>Daily Radar</h3>
            <p>A short stack of new papers, each scored against the topics you've told Radar to watch. Save what's useful, dismiss the rest.</p>
            <span className="arrow">Open today's list {ARROW}</span>
          </button>

          <button
            type="button"
            className="splash-door vault"
            onClick={() => onOpen('vault', 'approachable')}
          >
            <div className="num">02 / LIBRARY</div>
            <div className="ico">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="8" y1="13" x2="16" y2="13" />
              </svg>
            </div>
            <h3>Vault</h3>
            <p>Your private library of papers — uploaded, tagged, indexed. Ask questions across any subset and get answers grounded in your own reading.</p>
            <span className="arrow">Browse your vault {ARROW}</span>
          </button>

          <button
            type="button"
            className="splash-door profiles"
            onClick={() => onOpen('profiles', 'approachable')}
          >
            <div className="num">03 / TUNE</div>
            <div className="ico">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="4" height="16" rx="1" />
                <rect x="10" y="8" width="4" height="12" rx="1" />
                <rect x="17" y="12" width="4" height="8" rx="1" />
              </svg>
            </div>
            <h3>Profiles</h3>
            <p>Each profile is a small set of seed papers that defines an interest. Radar uses them to decide what to surface — and shows you when a profile drifts.</p>
            <span className="arrow">Manage your profiles {ARROW}</span>
          </button>
        </section>

        <section className="splash-help">
          <div className="splash-help-eyebrow">How to use Radar</div>
          <div className="splash-help-body">
            <p>
              Upload papers to the <b>Vault</b>, build a <b>Profile</b> by picking
              OpenAlex topic IDs and a score threshold — Radar does the rest.
            </p>
            <p>
              Each morning your <b>Daily Radar</b> shows the new papers that
              cleared the threshold for any profile you watch.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
