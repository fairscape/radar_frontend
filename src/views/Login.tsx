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
      setError('Please enter a valid email address.');
      return;
    }
    setUserEmail(v);
    onLogin();
  }

  return (
    <div className="splash-root splash-login">
      <div className="splash-login-card">
        <div className="splash-login-mark">
          <div className="splash-logo">R</div>
          <span className="name">Radar</span>
        </div>
        <h1 className="splash-login-title">Sign in</h1>
        <p className="splash-login-sub">No password — your email is your identity.</p>

        <div className="splash-login-field">
          <span className="splash-login-label">Email</span>
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="you@example.com"
            className="splash-login-input"
          />
          {error && <div className="splash-login-error">{error}</div>}
        </div>

        <button
          type="button"
          className="splash-login-btn"
          onClick={submit}
          disabled={email.trim().length === 0}
        >
          Continue
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="13,5 20,12 13,19" />
          </svg>
        </button>
      </div>
    </div>
  );
}
