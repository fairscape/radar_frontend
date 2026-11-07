import { useEffect, useState } from 'react';
import { useBackendHealth } from '../api/hooks';
import { getMe, updateMe, type User } from '../api/endpoints/users';
import { errorMessage } from '../lib/format';
import { setThemePref, useTheme, type ThemePref } from '../lib/theme';
import { addLeaveGuard } from '../lib/router';
import { toast } from '../lib/toast';
import { EMAIL_RE, getSignedInWith, signOut as endSession } from '../lib/userEmail';
import { Badge, Button, ErrorBox, Field, Input, LoadingRows, Panel, Segmented, confirmDialog, useAction } from '../ui';
import { refuseSecret } from '../lib/secretText';

function signedInHint(): string {
  const by = getSignedInWith();
  return by ? `The address of the ${by === 'google' ? 'Google' : 'Prosopia'} account you signed in with.` : 'The address this site knows you by.';
}

export function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mailto, setMailto] = useState('');
  const { pref } = useTheme();
  const health = useBackendHealth();

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    getMe()
      .then((u) => { if (!cancelled) { setUser(u); setMailto(u.mailto ?? u.email); } })
      .catch((e) => { if (!cancelled) setLoadError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, []);

  const save = useAction(async () => {
    const v = mailto.trim();
    refuseSecret(v);
    if (!EMAIL_RE.test(v)) throw new Error('Enter a valid email address.');
    const u = await updateMe({ mailto: v });
    setUser(u);
    setMailto(u.mailto ?? u.email);
    toast.success('Contact email saved.');
  });

  function signOut() {
    // Clearing the cached address is not signing out: the backend's session
    // cookie would still be attached to the very next request. endSession
    // ends it at /auth/logout.
    void endSession();
  }

  const dirty = !!user && mailto.trim() !== (user.mailto ?? user.email);
  // As every page with typed, unsaved work: leaving asks first.
  const unsaved = dirty && !save.busy;
  useEffect(() => {
    if (!unsaved) return;
    return addLeaveGuard(() => confirmDialog({
      title: 'Leave without saving?',
      body: <p>The contact email is not saved.</p>,
      confirmLabel: 'Discard changes',
      danger: true,
    }));
  }, [unsaved]);

  return (
    <div className="page page-narrow">
      <header className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
        </div>
      </header>

      <Panel title="Account">
        {loadError && <ErrorBox message={loadError} onRetry={() => window.location.reload()} />}
        {!user && !loadError && <LoadingRows rows={2} />}
        {user && (
          <div className="stack" style={{ gap: 16 }}>
            <Field label="Signed in as" hint={signedInHint()}>
              <Input value={user.email} readOnly />
            </Field>
            <Field label="Contact email for OpenAlex" hint="Sent with every OpenAlex request so BioXplorer gets the faster polite pool. Defaults to your sign-in email." error={save.error}>
              <Input type="email" maxLength={254} value={mailto} onChange={(e) => { setMailto(e.target.value); save.clearError(); }} />
            </Field>
            <div className="row">
              <Button write variant="primary" onClick={() => save.run()} loading={save.busy} disabled={!dirty}>Save</Button>
              {dirty && <Button variant="ghost" onClick={() => setMailto(user.mailto ?? user.email)}>Discard</Button>}
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Appearance">
        {/* Not a Field: that is a <label>, which names the first button inside
            it -- "System" was announced as "Theme System Light Dark". */}
        <div className="field">
          <span className="field-label">Theme</span>
          <div>
            <Segmented<ThemePref> ariaLabel="Theme" value={pref} onChange={setThemePref} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </div>
        </div>
      </Panel>

      <Panel title="Backend">
        {health.error && !health.data && <ErrorBox compact message={errorMessage(health.error)} onRetry={health.refresh} />}
        {health.data && (
          <div className="stack" style={{ gap: 6, fontSize: 13.5 }}>
            <div className="row spread"><span>Status</span><Badge tone={health.data.status === 'ok' ? 'ok' : 'warn'}>{health.data.status}</Badge></div>
            <div className="row spread"><span>Version</span><span className="mono">{health.data.version}</span></div>
            <div className="row spread"><span>Chat model</span><span className="mono">{health.data.llm_model ?? health.data.ollama_model ?? 'not configured'}{health.data.llm_provider ? ` (${health.data.llm_provider})` : ''}</span></div>
          </div>
        )}
      </Panel>

      <Panel title="Session">
        <p className="small muted" style={{ marginBottom: 10 }}>Sign out signs out this tab. If other BioXplorer tabs in this browser are still signed in, they stay signed in. To sign out of this browser completely, for example on a shared computer, close those tabs or sign out in each one. Signing out does not sign you out of Google or Prosopia. Your interests and vault stay on the server.</p>
        <Button onClick={signOut}>Sign out</Button>
      </Panel>
    </div>
  );
}
