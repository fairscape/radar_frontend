/**
 * Real-API client base.
 *
 * Single fetch wrapper used by every endpoint helper under
 * ``src/api/endpoints/*``. Reads the backend base URL from
 * ``VITE_API_BASE_URL`` (Phase 10) and falls back to the legacy
 * ``VITE_API_URL`` so Phase 11 wizard code that pre-dates this rename
 * keeps working. Sends ``X-User-Email`` from ``localStorage.userEmail``
 * if present — Phase 12 fills that key; until then it's null and the
 * backend uses its stub user.
 */

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.VITE_API_URL as string | undefined) ??
  'http://localhost:8000';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function userEmailHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const email = window.localStorage.getItem('userEmail');
    return email ? { 'X-User-Email': email } : {};
  } catch {
    return {};
  }
}

async function parseBody(resp: Response): Promise<unknown> {
  const ct = resp.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    try {
      return await resp.json();
    } catch {
      return null;
    }
  }
  return await resp.text();
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  const isForm = init.body instanceof FormData;
  const resp = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    signal: signal ?? init.signal,
    headers: {
      Accept: 'application/json',
      ...(init.body && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...userEmailHeader(),
      ...(init.headers ?? {}),
    },
  });
  const body = await parseBody(resp);
  if (!resp.ok) {
    throw new ApiError(
      `${init.method ?? 'GET'} ${path} failed (${resp.status})`,
      resp.status,
      body,
    );
  }
  return body as T;
}

function buildQuery(params?: Record<string, string | number | boolean | null | undefined>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  if (entries.length === 0) return '';
  const search = new URLSearchParams();
  for (const [k, v] of entries) search.set(k, String(v));
  return `?${search.toString()}`;
}

export function apiGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | null | undefined>,
  signal?: AbortSignal,
): Promise<T> {
  return request<T>(`${path}${buildQuery(params)}`, {}, signal);
}

export function apiPost<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  }, signal);
}

export function apiPatch<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
  }, signal);
}

export function apiDelete<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: 'DELETE' }, signal);
}

export function apiPostMultipart<T>(path: string, form: FormData, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: 'POST', body: form }, signal);
}

/** True for fetch aborts via AbortController. Hooks treat this as
 *  silent (the signal owner already handled the cancellation). */
export function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException && err.name === 'AbortError'
  ) || (err instanceof Error && err.name === 'AbortError');
}

// Legacy ``api.{get,post,postForm,delete}`` shape kept for the Phase 11
// wizard code (``src/api/endpoints/wizard.ts``); new code should import
// the standalone ``apiGet`` / ``apiPost`` / ``apiPostMultipart`` helpers.
export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  postForm: <T>(path: string, form: FormData) =>
    request<T>(path, { method: 'POST', body: form }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function swatchFor(hue: number): string {
  return `oklch(0.72 0.12 ${hue})`;
}
