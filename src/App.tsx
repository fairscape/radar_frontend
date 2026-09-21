import { useEffect } from 'react';
import { useThemeEffect } from './lib/theme';
import { useUserEmail } from './lib/userEmail';
import { useRoute } from './lib/router';
import { LoginPage } from './pages/LoginPage';
import { Shell } from './pages/Shell';
import { ConfirmHost, Toaster } from './ui';

export function App() {
  useThemeEffect();
  const email = useUserEmail();
  const route = useRoute();

  useEffect(() => {
    const titles: Record<string, string> = {
      feed: 'Feed', interests: 'Interests', interest: 'Interest', wizard: 'New interest', vault: 'Vault', settings: 'Settings', notfound: 'Not found',
    };
    document.title = `${titles[route.name] ?? 'Radar'} · Radar`;
  }, [route.name]);

  return (
    <>
      {email ? <Shell route={route} email={email} /> : <LoginPage />}
      <ConfirmHost />
      <Toaster />
    </>
  );
}
