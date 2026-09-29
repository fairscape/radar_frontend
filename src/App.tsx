import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError } from './api/client';
import { getMe } from './api/endpoints/users';
import { useThemeEffect } from './lib/theme';
import { setUserEmail, useUserEmail } from './lib/userEmail';
import { useRoute } from './lib/router';
import { LoginPage } from './pages/LoginPage';
import { Shell } from './pages/Shell';
import { Button, ConfirmHost, Spinner, Toaster } from './ui';

/**
 * Identity comes from the server, not from localStorage.
 *
 * Cloudflare Access verifies the person before a request reaches the app,
 * and the reverse proxy replaces ``X-User-Email`` with the address it
 * verified. So the stored address stopped deciding anything while the UI
 * kept displaying it: a browser signed in as one person and then another
 * showed the first address beside the second person's data, and the app's
 * own "sign out" cleared the cache while leaving the Access session
 * attached to the very next request.
 *
 * ``GET /api/users/me`` is the only source now. It also still does what
 * the previous warm-up call did: the backend creates the user row on first
 * sight of an address, and doing that once here keeps several parallel
 * first requests from racing on the insert.
 */

type Gate =
  | { k: 'loading' }
  | { k: 'ready'; email: string }
  | { k: 'anonymous' }
  | { k: 'error'; message: string };

/**
 * An address, or null when this is not a user object.
 *
 * An expired Access session answers a fetch with its own login page: HTML,
 * status 200. A resolved promise is therefore not proof of an identity,
 * and a gate that trusted it would render the whole app for nobody.
 */
function emailOf(u: unknown): string | null {
  if (u && typeof u === 'object' && 'email' in u) {
    const e = (u as { email: unknown }).email;
    if (typeof e === 'string' && e.includes('@')) return e;
  }
  return null;
}

function Splash({ children }: { children: ReactNode }) {
  return (
    <div className="col" style={{ alignItems: 'center', gap: 12, padding: 64 }}>
      {children}
    </div>
  );
}

export function App() {
  useThemeEffect();
  const route = useRoute();
  const [gate, setGate] = useState<Gate>({ k: 'loading' });
  // Subscribed for one reason: in dev the manual LoginPage writes the cache
  // and dispatches a change, and that has to re-run the resolve or the form
  // stays on screen forever. In production nothing writes the cache except
  // this component, so the value only ever changes here and the extra
  // resolve never fires.
  const cached = useUserEmail();

  useEffect(() => {
    const titles: Record<string, string> = {
      home: 'Start', feed: 'Feed', interests: 'Interests', interest: 'Interest', wizard: 'New interest', vault: 'Vault', settings: 'Settings', notfound: 'Not found',
    };
    document.title = `${titles[route.name] ?? 'Radar'} · Radar`;
  }, [route.name]);

  // Only the newest attempt may write the gate. StrictMode runs the effect
  // twice in dev and Retry can overlap a request still in flight, so
  // without this a stale resolution lands after a newer one.
  const attempt = useRef(0);

  const resolve = useCallback(() => {
    const mine = ++attempt.current;
    setGate({ k: 'loading' });
    getMe()
      .then((u) => {
        if (mine !== attempt.current) return;
        const email = emailOf(u);
        if (!email) {
          setGate({ k: 'anonymous' });
          return;
        }
        setUserEmail(email);
        setGate({ k: 'ready', email });
      })
      .catch((e) => {
        if (mine !== attempt.current) return;
        if (e instanceof ApiError && e.status === 401) {
          // No identity reached the backend: either Access has no session
          // (it will ask on the next navigation) or the proxy sent no
          // header. Reloading is the remedy.
          setGate({ k: 'anonymous' });
          return;
        }
        if (e instanceof ApiError && e.status === 403) {
          // Access verified someone the backend refuses. Reloading returns
          // the identical answer, so this belongs with the errors that show
          // what happened rather than with "sign in again".
          setGate({
            k: 'error',
            message: 'Signed in, but this account is not allowed to use Radar. '
              + 'Ask whoever administers it to add your address.',
          });
          return;
        }
        setGate({ k: 'error', message: e instanceof Error ? e.message : String(e) });
      });
  }, []);

  useEffect(resolve, [resolve, cached]);

  let body: ReactNode;
  if (gate.k === 'ready') {
    body = <Shell route={route} email={gate.email} />;
  } else if (gate.k === 'loading') {
    // Deliberately no address here. Painting the cached one would disclose
    // the previous person's on a shared browser -- A's session lapses
    // without a Sign out, B opens the app, and it greets B by A's address
    // until the server answers.
    body = (
      <Splash>
        <div className="row" style={{ gap: 8, color: 'var(--fg-3)' }}>
          <Spinner size={18} /> Signing in…
        </div>
      </Splash>
    );
  } else if (gate.k === 'anonymous') {
    // Dev has no Access in front of it, so the manual gate is the only way
    // in there. A build behind the proxy reaches this only when the session
    // expired mid-visit, and reloading sends the browser to Access.
    body = import.meta.env.DEV ? <LoginPage /> : (
      <Splash>
        <h2 style={{ margin: 0 }}>Session expired</h2>
        <p style={{ color: 'var(--fg-3)', margin: 0 }}>Sign in again to continue.</p>
        <Button variant="primary" onClick={() => window.location.reload()}>Sign in</Button>
      </Splash>
    );
  } else {
    body = (
      <Splash>
        <h2 style={{ margin: 0 }}>Can’t reach the server</h2>
        <p className="mono" style={{ color: 'var(--fg-3)', margin: 0, fontSize: 12 }}>
          {gate.message}
        </p>
        <Button onClick={resolve}>Retry</Button>
      </Splash>
    );
  }

  return (
    <>
      {body}
      <ConfirmHost />
      <Toaster />
    </>
  );
}
