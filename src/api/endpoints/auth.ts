/**
 * Which sign-in buttons the backend offers.
 *
 * ``providers``: the backend runs the OpenID Connect flow itself at
 * ``/auth/login/<provider>`` and keeps identity in a session cookie.
 * Empty: identity is the ``X-User-Email`` header (the test site's proxy,
 * the typed address in dev). ``signed_in_with`` names the
 * provider behind the current session cookie, if any.
 */

import { API_BASE_URL } from '../client';

export type SignInProvider = 'google' | 'prosopia';
export const SIGN_IN_PROVIDERS: SignInProvider[] = ['google', 'prosopia'];

export interface AuthConfig {
  providers: SignInProvider[];
  signed_in_with: SignInProvider | null;
}

/**
 * Asked with a bare fetch, not ``apiGet``: behind a header-model proxy that
 * forwards only /api, /auth/config is the SPA's own index.html, and
 * ``request()`` reads an HTML answer as "the session ended" -- the gate
 * dropped the signed-in person on a page with no way in. Anything but a
 * JSON object here just means no sign-in buttons.
 */
export async function getAuthConfig(): Promise<AuthConfig> {
  const none: AuthConfig = { providers: [], signed_in_with: null };
  const resp = await fetch(`${API_BASE_URL}/auth/config`, { headers: { Accept: 'application/json' } });
  if (!resp.ok || !(resp.headers.get('content-type') ?? '').includes('json')) return none;
  const body: unknown = await resp.json().catch(() => null);
  return body && typeof body === 'object' ? { ...none, ...(body as Partial<AuthConfig>) } : none;
}
