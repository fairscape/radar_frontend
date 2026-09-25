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

/** One of an author's OpenAlex works, as ``GET /api/import/orcid/{orcid}/works`` lists it. */
export interface OrcidWork {
  openalex_id: string;
  doi: string | null;
  title: string;
  year: number | null;
  venue: string | null;
  type: string | null;
  cited_by_count: number | null;
  authors: string[];
  n_authors: number | null;
  author_position: string | null;
}

export interface OrcidWorksResponse {
  orcid: string;
  /** Read off the works' authorships; null when OpenAlex has none for this ORCID. */
  name: string | null;
  works: OrcidWork[];
}

export interface OrcidImportRequest {
  orcid: string;
  /** The works kept from the listing. */
  openalex_ids: string[];
  name?: string;
  embedding_model?: string;
  /** ``id`` values from the works listing to keep; omitted = the whole profile. */
  paper_ids?: string[];
}

/** One paper on a Prosopia profile, as ``GET /api/import/prosopia/works`` lists it. */
export interface ProsopiaWork {
  id: string;
  title: string;
  year: number | null;
  venue: string | null;
  doi: string | null;
  openalex_id: string | null;
  cited_by_count: number | null;
  authors: string[];
  n_authors: number | null;
}

export interface ProsopiaWorksResponse {
  slug: string;
  name: string | null;
  works: ProsopiaWork[];
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
