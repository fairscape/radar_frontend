import { useProfiles, useResearchers } from '../api/hooks';
import { errorMessage } from '../lib/format';
import { paths } from '../lib/router';
import { TERMS } from '../lib/terms';
import type { Profile } from '../types/radar';
import { ErrorBox, Icon, Swatch, type IconName } from '../ui';
import { Link } from '../ui/Link';

/**
 * "What you can do here", reachable from the Radar mark in the sidebar
 * and the first thing a user with no interests sees. Leads with adding
 * an interest because nothing else in the app works without one.
 */
export function HomePage() {
  const { data: profiles, error, refresh } = useProfiles();
  const live = (profiles ?? []).filter((p) => !p.isDraft);
  const drafts = (profiles ?? []).filter((p) => p.isDraft);

  return (
    <div className="page page-narrow">
      <header className="page-head">
        <div>
          <h1 className="page-title">What you can do in Radar</h1>
          <p className="page-sub">Radar watches OpenAlex for new papers and scores them against papers you already care about.</p>
        </div>
      </header>

      {error && !profiles && <ErrorBox message={errorMessage(error)} onRetry={refresh} />}

      <ol className="home-steps">
        <li className="home-step">
          <span className="home-step-n">1</span>
          <div>
            <h2>Add an {TERMS.interest}</h2>
            <p>Everything starts here. An {TERMS.interest} is a topic you want to follow, defined by a set of papers. Build one from:</p>
            <AddInterestCards />
            {profiles && profiles.length > 0 && <YourInterests live={live} drafts={drafts} />}
          </div>
        </li>
        <li className="home-step">
          <span className="home-step-n">2</span>
          <div>
            <h2>Read the {TERMS.feed}</h2>
            <p>
              Radar scans every {TERMS.interest} each morning and puts the matches in the {TERMS.feed}, best first.
              Save the useful ones and dismiss the rest. Both teach the scoring.
            </p>
            <Link href={paths.feed} className="home-link">Open the {TERMS.feed} <Icon name="arrow-right" size={13} /></Link>
          </div>
        </li>
        <li className="home-step">
          <span className="home-step-n">3</span>
          <div>
            <h2>Ask your papers</h2>
            <p>Every PDF you upload lands in the {TERMS.vault}. Ask it a question and get an answer grounded in those papers.</p>
            <Link href={paths.vault} className="home-link">Open the {TERMS.vault} <Icon name="arrow-right" size={13} /></Link>
          </div>
        </li>
      </ol>
    </div>
  );
}

const WAYS: { source: 'upload' | 'orcid' | 'prosopia' | 'profile'; icon: IconName; title: string; body: string }[] = [
  { source: 'upload', icon: 'upload', title: 'Papers you have', body: 'Upload PDFs. Five to fifteen focused papers work best; one is enough to start.' },
  { source: 'orcid', icon: 'id', title: 'An ORCID', body: "Import a researcher's published papers from OpenAlex by ORCID." },
  { source: 'prosopia', icon: 'interests', title: 'A Prosopia profile', body: 'Import every paper on a Prosopia researcher profile.' },
  { source: 'profile', icon: 'user', title: `A saved ${TERMS.profile}`, body: `Pick papers from a researcher you already imported. Nothing to wait for.` },
];

/** The ways into the wizard. Shared by the home page and empty states. */
export function AddInterestCards() {
  const { data: researchers } = useResearchers();
  // The fourth way only makes sense once a profile exists; until then
  // the card leads to the Profiles page, where one can be imported.
  const haveProfiles = (researchers?.length ?? 0) > 0;
  return (
    <div className="home-ways">
      {WAYS.map((w) => (
        <Link key={w.source} href={w.source === 'profile' && !haveProfiles ? paths.profiles : paths.wizardFrom(w.source)} className="home-way">
          <Icon name={w.icon} size={18} />
          <b>{w.title}</b>
          <span>{w.source === 'profile' && researchers && !haveProfiles ? `Import a researcher under ${TERMS.Profiles} first; ORCID and Prosopia imports save one automatically.` : w.body}</span>
        </Link>
      ))}
    </div>
  );
}

function YourInterests({ live, drafts }: { live: Profile[]; drafts: Profile[] }) {
  return (
    <div className="home-yours">
      <div className="field-label">Your {TERMS.interests}</div>
      {live.map((p) => (
        <Link key={p.key} href={paths.interest(p.key)} className="home-yours-row">
          <Swatch hue={p.hue} /> <span className="truncate">{p.name}</span>
          <span className="small muted">{p.seeds} seeds</span>
        </Link>
      ))}
      {drafts.map((p) => (
        <Link key={p.key} href={paths.wizard(p.key)} className="home-yours-row">
          <Swatch hue={p.hue} /> <span className="truncate muted">{p.name}</span>
          <span className="small muted">draft · resume</span>
        </Link>
      ))}
    </div>
  );
}
