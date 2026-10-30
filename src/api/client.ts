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
  '';

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

const sessionLostListeners = new Set<() => void>();

/**
 * Called when a request came back as Cloudflare Access's login page: the
 * session lapsed mid-visit. ``App`` flips to "Session expired" rather than
 * handing a page of HTML to components that expected a list.
 */
export function onSessionLost(cb: () => void): () => void {
  sessionLostListeners.add(cb);
  return () => { sessionLostListeners.delete(cb); };
}

const writeRejectedListeners = new Set<() => void>();

/**
 * Called when a write is refused for the state it found: 404 (deleted in
 * another tab), 409 (busy, or changed meanwhile), 400 (e.g. "not a seed",
 * removed in another tab). The page that sent it was showing state the
 * server no longer has -- a deleted interest stayed usable, a seed list
 * stayed one long (round 19) -- so ``App`` re-reads what is on screen.
 */
export function onWriteRejected(cb: () => void): () => void {
  writeRejectedListeners.add(cb);
  return () => { writeRejectedListeners.delete(cb); };
}

const openAlexListeners = new Set<(status: unknown) => void>();

/**
 * Called with ``openalex`` from a 503's body: OpenAlex could not answer,
 * and the request stopped (FUNCTIONAL_SPEC F2). The banner follows it.
 */
export function onOpenAlexStatus(cb: (status: unknown) => void): () => void {
  openAlexListeners.add(cb);
  return () => { openAlexListeners.delete(cb); };
}

function looksLikeLoginPage(resp: Response, body: unknown): boolean {
  if (typeof body !== 'string') return false;
  const ct = resp.headers.get('content-type') ?? '';
  return resp.redirected || ct.includes('text/html') || /^\s*<(!doctype|html)/i.test(body);
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
    if (resp.status === 503 && body && typeof body === 'object' && 'openalex' in body) {
      const status = (body as { openalex: unknown }).openalex;
      openAlexListeners.forEach((cb) => cb(status));
    }
    if ((init.method ?? 'GET') !== 'GET' && [400, 404, 409].includes(resp.status)) {
      writeRejectedListeners.forEach((cb) => cb());
    }
    throw new ApiError(
      `${init.method ?? 'GET'} ${path} failed (${resp.status})`,
      resp.status,
      body,
    );
  }
  if (looksLikeLoginPage(resp, body)) {
    // An expired Access session answers with its own login page, HTML and
    // status 200. Returned as data, the first component to iterate it threw
    // during render and the whole app unmounted to a blank page.
    sessionLostListeners.forEach((cb) => cb());
    throw new ApiError(`${init.method ?? 'GET'} ${path}: the session has expired`, 401, body);
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

/** A POST sent as the page goes (``pagehide``): ``keepalive`` lets it
 *  outlive the page, and unlike ``sendBeacon`` it carries the headers.
 *  Nothing waits for the answer. */
export function apiPostOnLeave(path: string): void {
  try {
    void fetch(`${API_BASE_URL}${path}`, {
      method: 'POST', keepalive: true, headers: { Accept: 'application/json', ...userEmailHeader() },
    }).catch(() => {});
  } catch { /* the page is going either way */ }
}

export function apiPatch<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
  }, signal);
}

export function apiPut<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
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
