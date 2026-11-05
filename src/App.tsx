import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, onSessionLost, onWriteRejected } from './api/client';
import { invalidateAfterRefusal } from './lib/query';
import { getAuthConfig, SIGN_IN_PROVIDERS, type SignInProvider } from './api/endpoints/auth';
import { getMe } from './api/endpoints/users';
import { useThemeEffect } from './lib/theme';
import { clearTabSignedOut, forgetSessionState, getUserEmail, isTabSignedOut, setSignedInWith, setUserEmail, useUserEmail } from './lib/userEmail';
import { setPublicPage, startLease, stopLease } from './lib/writeLease';
import { resumeJobs } from './lib/jobs';
import { navigate, useRoute } from './lib/router';
import { TERMS } from './lib/terms';
import { LoginPage, OTHER_TABS_NOTE } from './pages/LoginPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { Shell } from './pages/Shell';
import { Button, ConfirmHost, Spinner, Toaster } from './ui';

/**
 * Identity comes from the server, not from localStorage.
 *
 * The backend signs people in itself (``GET /auth/config``: Google,
 * Prosopia) and holds the session in a cookie; the anonymous gate shows
 * those buttons. Until 2026-11 Cloudflare Access did this, with the proxy
 * setting ``X-User-Email``. Either way the stored address decides nothing:
 * a browser signed in as one person and then another once showed the
 * first address beside the second person's data. A setup without sign-in
 * buttons (dev, the test site) still identifies by the header.
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

/**
 * Where a tab was when its session ran out mid-visit, so signing in again
 * brings it back there rather than to the start page (the backend's
 * callback always lands on ``/``). Per tab (sessionStorage), for the same
 * person only, and for half an hour (B1-4).
 */
const RETURN_KEY = 'radar.returnTo';
const RETURN_MS = 30 * 60 * 1000;

function rememberReturnTo(who: string | null): void {
  if (!who) return;
  try {
    const path = window.location.pathname + window.location.search;
    window.sessionStorage.setItem(RETURN_KEY, JSON.stringify({ path, who: who.toLowerCase(), at: Date.now() }));
  } catch { /* storage blocked: the start page, as before */ }
}

function takeReturnTo(email: string): string | null {
  try {
    const raw = window.sessionStorage.getItem(RETURN_KEY);
    window.sessionStorage.removeItem(RETURN_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as { path?: unknown; who?: unknown; at?: unknown };
    if (typeof r.path !== 'string' || typeof r.at !== 'number' || r.who !== email.toLowerCase()) return null;
    if (Date.now() - r.at > RETURN_MS) return null;
    // Only a path of this app: never another origin (``//host``) or the auth routes.
    if (!r.path.startsWith('/') || r.path.startsWith('//') || r.path.startsWith('/auth')) return null;
    return r.path;
  } catch {
    return null;
  }
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
  // The session ran out while this tab was signed in (not a first visit):
  // the sign-in page says so (B1-4).
  const [expired, setExpired] = useState(false);
  const gateRef = useRef<Gate>(gate);
  gateRef.current = gate;
  // undefined until /auth/config answers, so the anonymous gate does not
  // flash the wrong login page first.
  const [providers, setProviders] = useState<SignInProvider[] | undefined>(undefined);
  // Subscribed for one reason: in dev the manual LoginPage writes the cache
  // and dispatches a change, and that has to re-run the resolve or the form
  // stays on screen forever. In production nothing writes the cache except
  // this component, so the value only ever changes here and the extra
  // resolve never fires.
  const cached = useUserEmail();

  useEffect(() => {
    const titles: Record<string, string> = {
      home: 'Start', feed: 'Feed', interests: 'Interests', interest: 'Interest', interestEdit: 'Edit interest', wizard: 'New interest',
      profiles: TERMS.Profiles, profile: TERMS.Profile, vault: 'Vault', settings: 'Settings', notfound: 'Not found',
    };
    document.title = `${titles[route.name] ?? 'BioXplorer'} · BioXplorer`;
  }, [route.name]);

  // Only the newest attempt may write the gate. StrictMode runs the effect
  // twice in dev and Retry can overlap a request still in flight, so
  // without this a stale resolution lands after a newer one.
  const attempt = useRef(0);

  const resolve = useCallback(() => {
    const mine = ++attempt.current;
    if (isTabSignedOut()) {
      // This tab signed out on its own while others of this browser stayed
      // signed in (W.A R6): it stays out, reloads included, until its
      // sign-in button is clicked.
      setGate({ k: 'anonymous' });
      return;
    }
    setGate({ k: 'loading' });
    getMe()
      .then((u) => {
        if (mine !== attempt.current) return;
        const email = emailOf(u);
        if (!email) {
          setGate({ k: 'anonymous' });
          return;
        }
        // What this tab resolved last, not the shared localStorage: another
        // tab's sign-in writes the new address there first, so comparing
        // with it read "same person" and kept the previous one's state.
        const before = resolvedFor.current ?? getUserEmail();
        if (before && before.toLowerCase() !== email.toLowerCase()) forgetSessionState();
        resolvedFor.current = email;
        setUserEmail(email);
        setGate({ k: 'ready', email });
      })
      .catch((e) => {
        if (mine !== attempt.current) return;
        if (e instanceof ApiError && e.status === 401) {
          // Not signed in (no session cookie, or it expired): the sign-in
          // buttons. On a header-model setup the proxy sent no header.
          setGate({ k: 'anonymous' });
          return;
        }
        if (e instanceof ApiError && e.status === 403) {
          // Signed in, but refused. Nothing answers 403 here today (anyone
          // may sign in); kept so a refusal shows what happened rather
          // than looping back to "sign in again".
          setGate({
            k: 'error',
            message: 'Signed in, but the server refused this account.',
          });
          return;
        }
        setGate({ k: 'error', message: e instanceof Error ? e.message : String(e) });
      });
  }, []);

  // The address the last resolve stored. ``setUserEmail`` changes ``cached``
  // from null to it on a first sign-in, and re-running the resolve for that
  // tore the whole app down (gate back to loading) to ask the same question.
  const resolvedFor = useRef<string | null>(null);
  useEffect(() => {
    if (cached !== null && cached === resolvedFor.current) return;
    resolve();
  }, [resolve, cached]);
  useEffect(() => onSessionLost(() => {
    attempt.current += 1;        // a resolve still in flight must not land afterwards
    if (gateRef.current.k === 'ready') {
      rememberReturnTo(gateRef.current.email);
      setExpired(true);
    }
    void stopLease();
    setGate({ k: 'anonymous' });
  }), []);
  // Signed in again after it ran out: back where the tab was.
  // /privacy has no Shell: no banner, nothing to change. It takes no part
  // in the right to change things, nor answers for Sign out (FC-4).
  const publicPage = route.name === 'privacy';
  useEffect(() => {
    setPublicPage(publicPage);
    if (gate.k !== 'ready') return;
    if (publicPage) { void stopLease({ release: true }); return; }
    // Ask for the right to change things (W.A); stopped on any way out.
    startLease();
  }, [gate, publicPage]);
  useEffect(() => {
    if (gate.k !== 'ready') return;
    setExpired(false);
    resumeJobs();
    const to = takeReturnTo(gate.email);
    const here = window.location.pathname + window.location.search;
    if (to && to !== here && (here === '/' || here === '')) navigate(to, { replace: true });
  }, [gate]);
  // A write refused for the state it found: what is on screen is out of
  // date (another tab), so all of it is re-read. Mounted entries refetch;
  // the rest are forgotten (see invalidate).
  useEffect(() => onWriteRejected(() => invalidateAfterRefusal()), []);

  // A backend without the /auth routes behind a proxy that serves the SPA
  // for unknown paths answers with HTML, so only known provider names
  // count; anything else, failures included, means the header model.
  useEffect(() => {
    const known = (v: unknown): v is SignInProvider => SIGN_IN_PROVIDERS.includes(v as SignInProvider);
    getAuthConfig()
      .then((c) => {
        setSignedInWith(known(c?.signed_in_with) ? c.signed_in_with : null);
        return Array.isArray(c?.providers) ? c.providers.filter(known) : [];
      })
      .catch(() => [])
      .then(setProviders);
  }, []);

  let body: ReactNode;
  if (route.name === 'privacy') {
    // Open to everyone, signed in or not: Google's consent screen links
    // here, and the person reading it has not signed in yet.
    body = <PrivacyPage />;
  } else if (gate.k === 'ready') {
    body = <Shell route={route} email={gate.email} />;
  } else if (gate.k === 'loading' || (gate.k === 'anonymous' && providers === undefined)) {
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
    // Without sign-in buttons (no /auth routes, or /auth/config did not
    // answer) "Session expired" only after a session this tab had: a first
    // visit was told it had expired (B1-8).
    body = providers?.length ? <LoginPage providers={providers} expired={expired} /> : import.meta.env.DEV ? <LoginPage /> : (
      <Splash>
        <h2 style={{ margin: 0 }}>{expired ? 'Session expired' : 'Sign in'}</h2>
        <p style={{ color: 'var(--fg-3)', margin: 0 }}>{expired ? 'Sign in again to continue.' : 'Sign in to continue.'}</p>
        {!expired && isTabSignedOut() && <p style={{ color: 'var(--fg-3)', margin: 0, maxWidth: 420, textAlign: 'center' }} data-testid="other-tabs-signed-in">{OTHER_TABS_NOTE}</p>}
        <Button variant="primary" onClick={() => { clearTabSignedOut(); window.location.reload(); }}>Sign in</Button>
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
