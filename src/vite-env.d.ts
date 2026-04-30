/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  // Legacy name (Phase 11 wizard). Kept so existing checked-in
  // .env files don't silently regress.
  readonly VITE_API_URL?: string;
  readonly VITE_USE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
