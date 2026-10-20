import { useEffect, useState, type ReactNode } from 'react';
import { Login } from '../views/Login';
import { getUserEmail, subscribeUserEmail } from '../lib/userEmail';

/**
 * AuthGuard — gates the app on ``localStorage.userEmail``.
 *
 * Renders the ``Login`` view when no email is set; otherwise renders
 * children. Subscribes to email changes so signing in or signing out
 * elsewhere flips the gate without a page reload.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(() => getUserEmail());

  useEffect(() => {
    return subscribeUserEmail(() => setEmail(getUserEmail()));
  }, []);

  if (!email) {
    return <Login onLogin={() => setEmail(getUserEmail())} />;
  }

  return <>{children}</>;
}
