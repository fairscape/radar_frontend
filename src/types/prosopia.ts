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
  /**
   * Does the author's own ORCID record list this work?
   *
   * Tri-state, and the third state matters: `null` means the registry could
   * not be read, or had nothing comparable for this work -- it is NOT a
   * "no". Test `claimed === false`, never `!claimed`: in JSON both null and
   * false are falsy, and treating "we never asked" as "not yours" unticks a
   * researcher's whole corpus.
   *
   * OpenAlex over-merges author entities, so `author.orcid:` returns papers
   * the person never wrote; this is how those are told apart.
   */
  claimed: boolean | null;
  /**
   * The openalex_id of the copy kept when several rows are one paper -- a
   * preprint and its version of record. Null on the kept copy. The
   * redundant one stays in the list, unticked, rather than being hidden:
   * the rule is a heuristic and the user is right there looking.
   */
  duplicate_of: string | null;
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
  /**
   * True when nothing was started: an import of this person was already in
   * flight, so `run_id` points at that one and `draft_slug` at the draft it
   * is filling. **This request's selection was not applied.** Without
   * saying so we would report progress for a selection the server never
   * saw -- "importing your 40 works" while someone else's 80 are running.
   */
  already_running?: boolean;
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
