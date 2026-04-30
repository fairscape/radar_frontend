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

export function updateMe(body: { mailto?: string }): Promise<User> {
  return apiPatch<User>('/api/users/me', body);
}
