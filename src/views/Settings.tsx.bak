import { useEffect, useState } from 'react';
import { TopBar } from '../components/TopBar';
import { getMe, updateMe, type User } from '../api/endpoints/users';
import { clearUserEmail } from '../lib/userEmail';

interface Props {
  onSignOut: () => void;
}

export function Settings({ onSignOut }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [mailto, setMailto] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        setMailto(u.mailto ?? u.email);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateMe({ mailto: mailto.trim() });
      setUser(updated);
      setMailto(updated.mailto ?? updated.email);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function signOut() {
    clearUserEmail();
    onSignOut();
  }

  return (
    <div className="view">
      <TopBar crumbs={['Settings']} right={null} />

      <div className="section">
        <h3>
          Account <span className="hr" />
        </h3>
        {error && (
          <div
            className="mono"
            style={{
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
        {!user && !error && <div className="empty">LOADING…</div>}
        {user && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div
                className="mono"
                style={{
                  fontSize: 10,
                  color: 'var(--fg-3)',
                  letterSpacing: '0.16em',
                  marginBottom: 4,
                }}
              >
                EMAIL · IDENTITY
              </div>
              <div
                className="mono"
                style={{
                  fontSize: 14,
                  color: 'var(--fg)',
                  padding: 8,
                  background: 'var(--bg-inset)',
                  border: '1px solid var(--line)',
                }}
              >
                {user.email}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div
                className="mono"
                style={{
                  fontSize: 10,
                  color: 'var(--fg-3)',
                  letterSpacing: '0.16em',
                  marginBottom: 4,
                }}
              >
                MAILTO · OPENALEX POLITE POOL
              </div>
              <input
                type="email"
                value={mailto}
                onChange={(e) => setMailto(e.target.value)}
                style={{
                  width: '100%',
                  padding: 8,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  background: 'var(--bg-inset)',
                  color: 'var(--fg)',
                  border: '1px solid var(--line-strong)',
                  boxSizing: 'border-box',
                }}
              />
              <div
                className="mono"
                style={{ fontSize: 10, color: 'var(--fg-4)', marginTop: 6 }}
              >
                Sent as the gatherer's contact when querying OpenAlex. Defaults
                to your sign-in email.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                className="btn primary"
                onClick={save}
                disabled={saving || mailto.trim() === (user.mailto ?? user.email)}
              >
                {saving ? 'SAVING…' : 'SAVE'}
              </button>
              {savedAt && (
                <span className="mono" style={{ fontSize: 10, color: 'var(--ok)' }}>
                  saved
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="section">
        <h3>
          Session <span className="hr" />
        </h3>
        <button className="btn" onClick={signOut}>
          SIGN OUT
        </button>
      </div>
    </div>
  );
}
