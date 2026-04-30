import { useState } from 'react';
import { EMAIL_RE, setUserEmail } from '../lib/userEmail';

interface Props {
  onLogin: () => void;
}

export function Login({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const v = email.trim().toLowerCase();
    if (!EMAIL_RE.test(v)) {
      setError('please enter an email address');
      return;
    }
    setUserEmail(v);
    onLogin();
  }

  return (
    <div className="view" style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <div style={{ maxWidth: 420, width: '100%' }}>
        <h1 style={{ marginBottom: 6 }}>Radar</h1>
        <div className="mono" style={{ color: 'var(--fg-3)', marginBottom: 24, fontSize: 12 }}>
          SIGN IN · NO PASSWORD
        </div>
        <div className="section">
          <div className="mono" style={{ color: 'var(--fg-3)', marginBottom: 8, fontSize: 11 }}>
            EMAIL
          </div>
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="you@example.com"
            style={{
              width: '100%',
              padding: 10,
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              background: 'var(--bg-inset)',
              color: 'var(--fg)',
              border: '1px solid var(--line-strong)',
              boxSizing: 'border-box',
            }}
          />
          {error && (
            <div
              className="mono"
              style={{
                marginTop: 12,
                padding: 8,
                fontSize: 11,
                color: 'var(--err)',
                background: 'color-mix(in oklab, var(--bg-0), var(--err) 4%)',
                borderLeft: '2px solid var(--err)',
              }}
            >
              {error}
            </div>
          )}
          <button
            className="btn primary"
            onClick={submit}
            style={{ marginTop: 14, width: '100%', padding: 10 }}
          >
            CONTINUE
          </button>
          <div
            className="mono"
            style={{ marginTop: 14, color: 'var(--fg-4)', fontSize: 10, lineHeight: 1.5 }}
          >
            Your email becomes your identity. The backend creates a row on first sign-in;
            no password is stored. Use a different email to switch users.
          </div>
        </div>
      </div>
    </div>
  );
}
