import { Link } from '../ui/Link';

/**
 * ``/privacy``: what BioXplorer keeps about a person and where it goes.
 *
 * Open without signing in: Google's consent screen links here, so it is
 * rendered before the sign-in gate (App). Every statement is checked
 * against the code (records/21); change them together.
 */

export function PrivacyPage() {
  return (
    <main className="page" style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px' }}>
      <h1>Privacy</h1>
      <p className="lede">BioXplorer is a research tool run at the University of Virginia. This page says what it keeps about you and where it goes.</p>

      <h2>Signing in</h2>
      <p>You sign in with Google or Prosopia. BioXplorer asks Google only for your email address (and that it is verified); Prosopia also tells it which Prosopia profile is yours, so you can import it in one click. Your account is that address: signing in with a different address is a different account. BioXplorer never sees your Google or Prosopia password.</p>
      <p>A signed cookie in your browser keeps you signed in until you sign out on that browser, or until you have not used BioXplorer for 14 days.</p>

      <h2>What is kept</h2>
      <ul>
        <li>Your email address, and the contact address you may set in Settings.</li>
        <li>What you put in: interests, the papers and PDFs you add, researcher profiles you import, what you save or dismiss in the feed, and your Vault.</li>
      </ul>
      <p>It is stored on a University of Virginia server, with encrypted backups in Cloudflare R2 storage. It is not sold or shared, and not used for advertising.</p>

      <h2>What leaves the server</h2>
      <ul>
        <li><b>OpenAlex</b> (the open catalogue of papers): searches for papers carry your contact address, as OpenAlex asks of every client. Set a different one in Settings if you prefer.</li>
        <li><b>Prosopia</b>: when you import a Prosopia profile, or sign in with Prosopia.</li>
        <li><b>Anthropic</b>: only if you ask for research topics written by Claude, with an API key you type in for that one request. The key is not stored.</li>
      </ul>

      <h2>Deleting</h2>
      <p>You can delete your interests, profiles and Vault papers yourself at any time.</p>

      <p style={{ marginTop: 32 }}><Link href="/">Back to BioXplorer</Link></p>
    </main>
  );
}
