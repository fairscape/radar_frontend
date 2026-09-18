/**
 * Shapes for the Prosopia import job.
 *
 * Mirrors the backend's ``POST /api/import/prosopia`` and
 * ``GET /api/import/prosopia/{run_id}``. The status route has the same
 * ``{run, result}`` envelope as the wizard dry-run status route, so the
 * ``run`` half reuses ``GatherRunStatus``.
 *
 * COUPLING: the ``result`` fields below are the ones the UI reads. The
 * backend may add more; the index signature keeps ``tsc`` quiet if it
 * does, and the UI treats every count as optional so a shape drift
 * degrades to "imported" instead of a crash.
 */

import type { GatherRunStatus } from '../api/endpoints/profiles';

export interface ProsopiaImportRequest {
  /** Prosopia profile slug (``sheffield-nathan``) or ORCID. */
  ref: string;
  /** Optional profile name; the server derives one from the profile if omitted. */
  name?: string;
  embedding_model?: string;
}

export interface ProsopiaImportStart {
  draft_slug: string;
  run_id: number;
}

export interface ProsopiaImportResult {
  draft_slug: string;
  /** Display name the server chose for the draft, if it reports one. */
  name?: string;
  n_seeds?: number;
  n_resolved?: number;
  n_synthetic?: number;
  [extra: string]: unknown;
}

export interface ProsopiaImportStatus {
  run: GatherRunStatus;
  result: ProsopiaImportResult | null;
}
