import { useState } from 'react';
import { EMAIL_RE, setUserEmail } from '../lib/userEmail';
import { Button, Field, Icon, Input } from '../ui';

export function LoginPage() {
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
          <span className="brand-name">Radar</span>
        </div>
        <h1>New papers, scored against the ones you already care about.</h1>
        <p className="lede">
          Radar watches OpenAlex for you. Describe an interest with a handful of seed papers, and every day it scores what is new against them and shows you only what clears the bar.
        </p>
        <div className="login-steps">
          <div className="login-step"><span className="login-step-n">1</span><div><b>Create an interest</b><span>Upload seed PDFs or import your Prosopia profile. Radar measures how tightly they cluster and picks the topics to watch.</span></div></div>
          <div className="login-step"><span className="login-step-n">2</span><div><b>Set the threshold</b><span>A trial scan shows real scores; you choose how strict to be.</span></div></div>
          <div className="login-step"><span className="login-step-n">3</span><div><b>Triage the feed</b><span>Save what is useful, dismiss the rest. Your choices tune the scoring over time.</span></div></div>
        </div>
      </section>
      <section className="login-form">
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
      </section>
    </div>
  );
}
