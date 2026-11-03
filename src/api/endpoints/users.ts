/**
 * Users endpoint helpers (Phase 12).
 *
 * The acting user is implied by the ``X-User-Email`` header which
 * ``client.ts`` attaches automatically from ``localStorage.userEmail``.
 */

import { apiGet, apiPatch } from '../client';

export interface User {
  id: number;
  email: string;
  mailto: string | null;
  created_at: string | null;
}

export function getMe(): Promise<User> {
  return apiGet<User>('/api/users/me');
}

/** The signed-in person's own Prosopia profile (its public record). */
export interface MyProsopiaProfile {
  slug: string;
  name: string;
  affiliation: string | null;
  paper_count: number | null;
  /** The profile on Prosopia itself. */
  url: string;
}

/**
 * ``GET /api/users/me/prosopia``. All-null is the usual answer (no
 * Prosopia sign-in, no own profile on the account, no public copy of it,
 * Prosopia unreachable); only ``profile`` decides whether to offer it.
 */
export interface MyProsopia {
  profile: MyProsopiaProfile | null;
  /** This user's saved profile for it, once imported. */
  researcher_id: number | null;
  imported_at: string | null;
}

export function getMyProsopia(): Promise<MyProsopia> {
  return apiGet<MyProsopia>('/api/users/me/prosopia');
}

export function updateMe(body: { mailto?: string }): Promise<User> {
  return apiPatch<User>('/api/users/me', body);
}
