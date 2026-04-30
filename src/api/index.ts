/**
 * Real-API barrel.
 *
 * Mirrors the surface of ``src/mock-api/index.ts`` so a single
 * ``apiSwitch`` re-export can swap between the two branches without
 * any view edits. ``swatchFor`` is kept client-side (not an API call);
 * we re-export the copy that lives in ``client.ts`` so the import path
 * matches the mock module's ``export { swatchFor } from './client'``.
 */

export * from './endpoints/profiles';
export * from './endpoints/radar';
export * from './endpoints/vault';
export * from './endpoints/chat';
export { useProfiles, useProfileDetail } from './hooks/useProfiles';
export { useDailyRadar } from './hooks/useDailyRadar';
export { useVault } from './hooks/useVault';
export { useChat } from './hooks/useChat';
export { swatchFor } from './client';
// ApiError + API_BASE_URL aren't part of the mock-api surface; views
// that need them should import directly from ``src/api/client``.
