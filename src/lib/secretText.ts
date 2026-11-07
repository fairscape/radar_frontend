/**
 * Text that looks like an API key or another secret is never stored (user
 * 2026-11-06): a Claude key typed into "Add a topic" was saved as a research
 * topic. The server refuses such text too (rag_lib/secret_text.py); the two
 * patterns are kept identical (tests/test_secret_text.py checks). Here it
 * also keeps a lookup box from remembering one in localStorage.
 */
export const KNOWN_PREFIX = String.raw`(?:^|[^A-Za-z0-9_-])(?:sk-ant-|sk-proj-|sk-|ghp_|gho_|ghs_|ghu_|github_pat_|glpat-|xox[abprs]-|hf_)(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]{16,}|(?:^|[^A-Za-z0-9])AKIA[0-9A-Z]{16}|(?:^|[^A-Za-z0-9])AIza[0-9A-Za-z_-]{30,}|(?:^|[^A-Za-z0-9_-])[Bb]earer\s+(?=[A-Za-z0-9._~+/-]*[0-9])[A-Za-z0-9._~+/-]{16,}`;
export const RANDOM_TOKEN = String.raw`(?:^|[^A-Za-z0-9])(?=[A-Za-z0-9]*[0-9])(?=[A-Za-z0-9]*[a-z])(?=[A-Za-z0-9]*[A-Z])[A-Za-z0-9]{24,}(?![A-Za-z0-9])`;
const PATTERN = new RegExp(`${KNOWN_PREFIX}|${RANDOM_TOKEN}`);

export const SECRET_MESSAGE = 'This looks like an API key or another secret, so it was not saved. Paste an API key only into the field that asks for one.';

export function looksLikeSecret(text: string | null | undefined): boolean {
  return !!text && PATTERN.test(text);
}

/** Throws (the reason) when ``text`` looks like a secret: for a useAction handler. */
export function refuseSecret(text: string | null | undefined): void {
  if (looksLikeSecret(text)) throw new Error(SECRET_MESSAGE);
}
