/**
 * apiSwitch — single import surface that resolves to either the real
 * fetch-backed module (``src/api``) or the mock module
 * (``src/mock-api``) based on ``VITE_USE_MOCK``.
 *
 * Why this shape: a top-level conditional ``export * from`` isn't valid
 * ES syntax, and conditionally selecting a namespace via
 * ``import * as`` then re-destructuring loses React Fast-Refresh
 * boundaries on hooks. So we import both namespaces, pick one at
 * module init, and re-export each symbol as a thin function (or value)
 * forwarder. Vite still bundles both branches, but the unused one
 * tree-shakes cleanly because nothing in user code references the
 * underlying namespaces directly.
 *
 * Both branches export the same identifiers — see ``src/api/index.ts``
 * and ``src/mock-api/index.ts``. The real branch has a few extras
 * (``ApiError``, ``API_BASE_URL``) that the mock branch doesn't
 * publish; views that need those should import from ``src/api``
 * directly.
 */

import * as realApi from '../api';
import * as mockApi from '../mock-api';

// The mock-api module is the contract: it defines the surface every
// view consumes. The real-api module is a superset (it ships extras
// like ``uploadPdf`` and ``ApiError`` that the wizard imports
// directly). We pick the active impl at module-init time and forward
// the mock-shaped subset below.
const useMock = import.meta.env.VITE_USE_MOCK === '1';
const impl = (useMock ? mockApi : (realApi as unknown as typeof mockApi));

// --- endpoints ---------------------------------------------------------------
export const listProfiles = impl.listProfiles;
export const getProfile = impl.getProfile;
export const getProfileDetail = impl.getProfileDetail;
export const refitProfile = impl.refitProfile;
export const dryRunProfile = impl.dryRunProfile;
export const updateProfileThreshold = impl.updateProfileThreshold;

export const getDailyRadar = impl.getDailyRadar;
export const saveCard = impl.saveCard;
export const dismissCard = impl.dismissCard;

export const listVaultDocs = impl.listVaultDocs;
export const getVaultStats = impl.getVaultStats;
export const getVaultMeta = impl.getVaultMeta;
export const getTagCounts = impl.getTagCounts;
export const ingestPdf = impl.ingestPdf;

export const getChatHistory = impl.getChatHistory;
export const postChat = impl.postChat;

// --- hooks -------------------------------------------------------------------
export const useProfiles = impl.useProfiles;
export const useProfileDetail = impl.useProfileDetail;
export const useDailyRadar = impl.useDailyRadar;
export const useVault = impl.useVault;
export const useChat = impl.useChat;

// --- shared client-side helpers ---------------------------------------------
export const swatchFor = impl.swatchFor;

// Re-export types — pure TypeScript with no runtime cost regardless
// of which branch is active. ``ProfileDetail`` is identically shaped
// in both branches; ``VaultMeta`` lives only in the real branch (the
// mock returns the same shape inline). Views that need them can
// import either path.
export type { ProfileDetail } from '../api/endpoints/profiles';
export type { VaultMeta } from '../api/endpoints/vault';
