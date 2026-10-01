import { ApiError } from '../api/client';

/** A sentence a user can act on, from whatever an endpoint threw. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body;
    if (body && typeof body === 'object' && 'detail' in body) {
      const d = (body as { detail: unknown }).detail;
      if (typeof d === 'string') return d;
      if (Array.isArray(d)) {
        // FastAPI validation errors.
        return d
          .map((x) => (x && typeof x === 'object' && 'msg' in x ? String((x as { msg: unknown }).msg) : String(x)))
          .join('; ');
      }
    }
    if (e.status === 404) return 'Not found. It may have been deleted.';
    if (e.status === 502 || e.status === 503) return 'A service Radar depends on is unreachable right now.';
    if (e.status >= 500) return `The backend returned an error (${e.status}).`;
    return e.message;
  }
  if (e instanceof TypeError && /fetch|network/i.test(e.message)) {
    return "Can't reach the Radar backend. Is it running?";
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * Parse a time the server sent. Two zone-less shapes are read the way they
 * are meant, not the way `new Date` guesses:
 *
 * - "YYYY-MM-DD HH:MM:SS" is SQLite's datetime('now'), which is UTC.
 *   `new Date` takes it as local time, so on the east coast every "x ago"
 *   was 4-5 hours off and a draft edited a minute ago read as in the future.
 * - "YYYY-MM-DD" is a calendar date (a publication date). `new Date` takes
 *   it as UTC midnight, which is the previous evening east of Greenwich,
 *   so the day shown was one early.
 *
 * Anything with a zone ("…Z", "+00:00") is left to `new Date`.
 */
export function parseServerTime(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(iso)) {
    return new Date(`${iso.replace(' ', 'T')}Z`);
  }
  return new Date(iso);
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = parseServerTime(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = parseServerTime(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = parseServerTime(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.floor(s / 86400);
  if (days < 30) return `${days} d ago`;
  return fmtDate(iso);
}

export function fmtDuration(startIso: string, endIso: string | null): string {
  const a = parseServerTime(startIso).getTime();
  const b = endIso ? parseServerTime(endIso).getTime() : Date.now();
  if (Number.isNaN(a) || Number.isNaN(b)) return '—';
  const s = Math.max(0, Math.round((b - a) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** Hue-keyed swatch colour for an interest. */
export function swatchFor(hue: number): string {
  return `oklch(0.68 0.13 ${hue})`;
}
