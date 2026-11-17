import { paths } from '../lib/router';
import { Icon } from '../ui';
import { Link } from '../ui/Link';

/**
 * ``/about``: what BioXplorer is, open without signing in (App renders
 * it before the sign-in gate, like /privacy).
 *
 * The three sections come from the bioxplorer.org home page (record 37),
 * rewritten to say only what this site does today: no bulk annotation,
 * no shared endpoint, no downloads, no collaboration, and scans run only
 * when the user starts one. "Evaluation" counts only what the Privacy
 * page says is kept; change the two together.
 */
export function AboutPage() {
  return (
    <main className="page doc-page" style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px' }}>
      <div className="row" style={{ gap: 10, marginBottom: 16 }}>
        <span className="brand-mark"><Icon name="radar" size={16} /></span>
        <span className="brand-name">BioXplorer</span>
      </div>
      <h1>About BioXplorer</h1>
      <p className="lede">BioXplorer is a research tool run at the University of Virginia. It helps biomedical researchers keep up with newly published papers that matter to their work.</p>

      <h2>Personalised Search</h2>
      <p>BioXplorer builds a personalised search from papers you already care about. Our target users are biomedical researchers. The tool offers a streamlined interface with several practical functionalities.</p>
      <p>First, you describe an interest with a set of seed papers: upload PDFs, or import a researcher's papers by ORCID or from a Prosopia profile. BioXplorer checks how closely the seed papers agree with each other and lists the research topics they belong to, from OpenAlex and from the medical concepts (UMLS) found in the papers; you choose which topics to search.</p>
      <p>Second, a trial scan scores real papers against your seeds, so you can see the scores and choose how strict the interest should be.</p>
      <p>Third, when you save an interest and whenever you start a scan, BioXplorer searches OpenAlex for papers in those topics (newly published ones, or a range of years you choose), scores them against your seeds, and shows the ones that clear your threshold in your feed. Save what is useful to the interest's Saved list and your Vault, and dismiss the rest.</p>

      <h2>Evaluation of BioXplorer</h2>
      <p>We evaluate BioXplorer through how it is used: the number of people who have signed in at least once, the number who come back to run scans or go through their feed again, the interests they build and keep, and how many of the recommended papers they save. These figures come from what BioXplorer already keeps (see <Link href={paths.privacy}>Privacy</Link>). Beyond the site, we also count citations to our platform and the number of people attending our training workshops and community outreach.</p>

      <h2>Sustainability of BioXplorer</h2>
      <p>Our goal is to continually seek funding and partnerships for supporting the system, maintaining a healthy community to use the platform, and constantly analyzing the risks and technology updates to adapt to new products. We are particularly interested in partnering with large-scale curation efforts, and have already taken steps in this direction.</p>

      <p style={{ marginTop: 32 }}>
        <Link href="/">Open BioXplorer</Link>
        {' · '}
        <Link href={paths.privacy}>Privacy</Link>
      </p>
    </main>
  );
}
