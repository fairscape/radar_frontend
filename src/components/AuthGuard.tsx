import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Login } from '../views/Login';
import { getMe } from '../api/endpoints/users';
import { ApiError } from '../api/client';
import { setUserEmail } from '../lib/userEmail';

/**
 * AuthGuard — asks the server who the user is, and waits for the answer.
 *
 * It used to gate on ``localStorage.userEmail``: whoever typed an
 * address into the login box became that user as far as the UI was
 * concerned. Cloudflare Access now decides identity before a request
 * reaches the app, and the reverse proxy replaces ``X-User-Email`` with
 * the address it verified — so the stored value stopped meaning
 * anything while the UI kept displaying it. The result was a browser
 * showing one person's address next to another person's data.
 *
 * So identity is read, not declared: ``GET /api/users/me`` is the only
 * source, and its answer is cached for the address in the sidebar.
 *
 * The manual login box survives for ``vite dev``, where there is no
 * Access in front and the backend has no verified header to work from.
 * It is never reachable in a build served behind the proxy.
 */

type State =
  | { k: 'loading' }
  | { k: 'ready' }
  | { k: 'anonymous' }
  | { k: 'error'; message: string };

/** Access answers an expired session with a redirect to its login page.
 *  Followed by fetch, that arrives as HTML with a 200, so a successful
 *  response is not on its own proof of an identity — check the shape. */
function emailOf(u: unknown): string | null {
  if (u && typeof u === 'object' && 'email' in u) {
    const e = (u as { email: unknown }).email;
    if (typeof e === 'string' && e.includes('@')) return e;
  }
  return null;
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ k: 'loading' });

  const resolve = useCallback(() => {
    setState({ k: 'loading' });
    getMe()
      .then((u) => {
        const email = emailOf(u);
        if (!email) {
          setState({ k: 'anonymous' });
          return;
        }
        setUserEmail(email);
        setState({ k: 'ready' });
      })
      .catch((e) => {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setState({ k: 'anonymous' });
          return;
        }
        setState({
          k: 'error',
          message: e instanceof Error ? e.message : String(e),
        });
      });
  }, []);

  useEffect(resolve, [resolve]);

  if (state.k === 'ready') return <>{children}</>;

  if (state.k === 'loading') {
    return (
      <div className="splash-root splash-login">
        <div className="splash-login-card">
          <div className="splash-login-mark">
            <div className="splash-logo">R</div>
            <span className="name">Radar</span>
          </div>
          <p className="splash-login-sub">Signing in…</p>
        </div>
      </div>
    );
  }

  if (state.k === 'anonymous') {
    // Dev has no Access in front of it, so the old manual gate is the
    // only way in. A build behind the proxy never lands here unless the
    // session expired mid-visit, which reloading resolves.
    if (import.meta.env.DEV) return <Login onLogin={resolve} />;
    return (
      <div className="splash-root splash-login">
        <div className="splash-login-card">
          <div className="splash-login-mark">
            <div className="splash-logo">R</div>
            <span className="name">Radar</span>
          </div>
          <h1 className="splash-login-title">Session expired</h1>
          <p className="splash-login-sub">
            Sign in again to continue.
          </p>
          <button
            type="button"
            className="splash-login-btn"
            onClick={() => window.location.reload()}
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="splash-root splash-login">
      <div className="splash-login-card">
        <div className="splash-login-mark">
          <div className="splash-logo">R</div>
          <span className="name">Radar</span>
        </div>
        <h1 className="splash-login-title">Can’t reach the server</h1>
        <p className="splash-login-sub">{state.message}</p>
        <button type="button" className="splash-login-btn" onClick={resolve}>
          Retry
        </button>
      </div>
    </div>
  );
}
