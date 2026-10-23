/**
 * Which sign-in buttons the backend offers.
 *
 * ``providers``: the backend runs the OpenID Connect flow itself at
 * ``/auth/login/<provider>`` and keeps identity in a session cookie.
 * Empty: identity is the ``X-User-Email`` header (Cloudflare Access in
 * production, the typed address in dev). ``signed_in_with`` names the
 * provider behind the current session cookie, if any.
 */

import { apiGet } from '../client';

export type SignInProvider = 'google' | 'prosopia';
export const SIGN_IN_PROVIDERS: SignInProvider[] = ['google', 'prosopia'];

export interface AuthConfig {
  providers: SignInProvider[];
  signed_in_with: SignInProvider | null;
}

export function getAuthConfig(): Promise<AuthConfig> {
  return apiGet<AuthConfig>('/auth/config');
}
