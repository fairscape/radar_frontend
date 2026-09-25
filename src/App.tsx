import { useEffect } from 'react';
import { getMe } from './api/endpoints/users';
import { useQuery } from './lib/query';
import { useThemeEffect } from './lib/theme';
import { useUserEmail } from './lib/userEmail';
import { useRoute } from './lib/router';
import { LoginPage } from './pages/LoginPage';
import { Shell } from './pages/Shell';
import { ConfirmHost, Spinner, Toaster } from './ui';

export function App() {
  useThemeEffect();
  const email = useUserEmail();
  const route = useRoute();

  useEffect(() => {
    const titles: Record<string, string> = {
      home: 'Start', feed: 'Feed', interests: 'Interests', interest: 'Interest', wizard: 'New interest', vault: 'Vault', settings: 'Settings', notfound: 'Not found',
    };
    document.title = `${titles[route.name] ?? 'Radar'} · Radar`;
  }, [route.name]);

  // Resolve the account once before anything else fires. The backend
  // creates a user row on its first sight of an email; several parallel
  // first requests would race on that insert.
  const me = useQuery(email ? `users/me/${email}` : null, getMe);
  const ready = !email || me.data !== undefined || me.error !== null;

  return (
    <>
      {!email ? <LoginPage /> : ready ? <Shell route={route} email={email} /> : (
        <div className="row" style={{ justifyContent: 'center', padding: 64, color: 'var(--fg-3)' }}>
          <Spinner size={18} /> Signing in…
        </div>
      )}
      <ConfirmHost />
      <Toaster />
    </>
  );
}
