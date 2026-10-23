import { useState } from 'react';
import type { SignInProvider } from '../api/endpoints/auth';
import { EMAIL_RE, setUserEmail } from '../lib/userEmail';
import { Button, Field, Icon, Input } from '../ui';

/**
 * ``providers``: one sign-in link per provider to the backend's
 * ``/auth/login/<provider>``, which starts the OpenID Connect flow. The
 * Prosopia button's markup and CSS come from
 * https://prosopia.databio.org/brand/ (copied, not linked); Google's
 * button reuses them so the two match.
 * None: the dev-only email box, for a backend that trusts ``X-User-Email``.
 */
export function LoginPage({ providers = [] }: { providers?: SignInProvider[] }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const v = email.trim().toLowerCase();
    if (!EMAIL_RE.test(v)) {
      setError('Enter a valid email address.');
      return;
    }
    setUserEmail(v);
  }

  return (
    <div className="login">
      <section className="login-pitch">
        <div className="row" style={{ gap: 10 }}>
          <span className="brand-mark"><Icon name="radar" size={16} /></span>
          <span className="brand-name">BioXplorer</span>
        </div>
        <h1>New papers, scored against the ones you already care about.</h1>
        <p className="lede">
          BioXplorer watches OpenAlex for you. Describe an interest with a handful of seed papers, and each scan scores what is new against them and shows you only what clears the bar.
        </p>
        <div className="login-steps">
          <div className="login-step"><span className="login-step-n">1</span><div><b>Add an interest</b><span>Upload PDFs, or import a researcher's papers by ORCID or Prosopia profile. BioXplorer measures how tightly they cluster and picks the topics to watch.</span></div></div>
          <div className="login-step"><span className="login-step-n">2</span><div><b>Set the threshold</b><span>A trial scan shows real scores; you choose how strict to be.</span></div></div>
          <div className="login-step"><span className="login-step-n">3</span><div><b>Triage the feed</b><span>Save what is useful, dismiss the rest. Your choices tune the scoring over time.</span></div></div>
        </div>
      </section>
      <section className="login-form">
        {providers.length ? (
          <div className="login-card">
            <h2>Sign in</h2>
            <p className="lede">Your interests, vault and feed belong to your email address.</p>
            {providers.includes('google') && (
              <a className="prosopia-signin signin-option" href="/auth/login/google">
                <span className="prosopia-signin__mark"><GoogleMark /></span>
                <span className="prosopia-signin__text">
                  <span className="prosopia-signin__label">Sign in with Google</span>
                  <span className="prosopia-signin__hint">Use the email address on your Google account.</span>
                </span>
              </a>
            )}
            {providers.includes('prosopia') && (
              <a className="prosopia-signin signin-option" href="/auth/login/prosopia">
                <span className="prosopia-signin__mark"><ProsopiaMark /></span>
                <span className="prosopia-signin__text">
                  <span className="prosopia-signin__label">Sign in with Prosopia</span>
                  <span className="prosopia-signin__hint">Prosopia signs you in with ORCID, Google or your university.</span>
                </span>
              </a>
            )}
          </div>
        ) : (
        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <h2>Sign in</h2>
          <p className="lede">There is no password. Your email identifies your interests, vault and feed.</p>
          <Field label="Email" error={error}>
            <Input
              type="email"
              autoFocus
              autoComplete="email"
              value={email}
              placeholder="you@example.org"
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
            />
          </Field>
          <Button type="submit" variant="primary" size="lg" iconRight="arrow-right" disabled={email.trim().length === 0}>
            Continue
          </Button>
        </form>
        )}
      </section>
    </div>
  );
}

function ProsopiaMark() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 44.257 42.78">
      <path fill="currentColor" transform="translate(-4.104 -7.997)" d="M20.052 38.743c-2.59-.403-5.303-1.768-7.56-3.588-2.433-1.96-4.358-4.463-4.988-6.843L4.126 15.73a.69.69 0 0 1 .21-.683c1.4-1.33 3.133-2.555 5.093-3.587a30 30 0 0 1 6.23-2.468c2.223-.595 4.48-.91 6.633-.98 2.223-.07 4.34.122 6.23.577a.67.67 0 0 1 .49.473l2.941 10.99c1.61.14 3.238.438 4.848.876a28.4 28.4 0 0 1 6.23 2.45c1.978 1.05 3.71 2.293 5.128 3.623.175.175.245.42.175.647l-3.36 12.583c-.753 2.8-3.273 5.776-6.336 7.841-2.73 1.838-6.475 3.343-9.8 2.433-3.01-.823-5.583-3.676-7.193-7.001a18.6 18.6 0 0 1-1.593-4.76zm6.633-.893 10.413 2.783c.21.07.298.263.228.455-.42 1.173-1.4 1.978-2.538 2.45-1.4.595-3.045.683-4.147.385-1.103-.297-2.486-1.207-3.396-2.397-.752-.998-1.19-2.188-.962-3.413.035-.21.21-.298.402-.263m13.528-8.488a1.8 1.8 0 0 1 1.26 2.188 1.806 1.806 0 0 1-2.187 1.26 1.78 1.78 0 0 1-1.26-2.188 1.776 1.776 0 0 1 2.187-1.26m-10.57-2.835c.945.263 1.522 1.243 1.26 2.188a1.784 1.784 0 0 1-2.188 1.26c-.945-.245-1.505-1.225-1.26-2.188a1.806 1.806 0 0 1 2.188-1.26m.91-6.58L27.84 9.779c-1.68-.35-3.552-.508-5.512-.455-2.048.07-4.2.385-6.318.945a28.5 28.5 0 0 0-5.95 2.345c-1.733.928-3.273 1.995-4.551 3.15l3.273 12.199c.56 2.1 2.31 4.358 4.55 6.16 1.96 1.593 4.288 2.8 6.51 3.238-.122-1.348-.07-2.643.228-3.745l.928-3.43c-1.225.367-1.89.787-3.99 1.854-.193.105-.543-.087-.526-.437.263-3.01 2.38-4.2 3.99-4.638.438-.122.928-.21 1.436-.227l1.557-5.758a.68.68 0 0 1 .525-.49c1.873-.438 3.99-.63 6.196-.56.122 0 .245.017.367.017m-.42 1.312c-1.96-.07-3.833.088-5.495.455l-3.273 12.199c-.665 2.485-.018 5.968 1.47 9.013 1.47 3.028 3.763 5.618 6.388 6.318 2.975.752 6.23-.63 8.68-2.275 2.818-1.908 5.11-4.603 5.776-7.07l3.272-12.217a22.3 22.3 0 0 0-4.532-3.132 27.4 27.4 0 0 0-5.95-2.345 27 27 0 0 0-6.336-.946m-7.298-6.65a1.765 1.765 0 0 1 2.17 1.26 1.78 1.78 0 0 1-1.26 2.188c-.945.245-1.925-.315-2.17-1.26a1.77 1.77 0 0 1 1.26-2.188m-10.57 2.835a1.78 1.78 0 0 1 2.187 1.26 1.806 1.806 0 0 1-1.26 2.188 1.8 1.8 0 0 1-2.188-1.26 1.776 1.776 0 0 1 1.26-2.188" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
