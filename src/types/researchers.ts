/**
 * Shapes for stored researcher profiles.
 *
 * Mirrors the ``Researcher*`` models in ``rag_lib/api/schemas.py``. A
 * researcher is a person Radar has imported (from Prosopia or by ORCID)
 * together with their papers, which are resolved and embedded once and
 * then reusable as the seeds of any number of interests. The UI calls
 * this a "profile"; the API says ``researchers``.
 */
import type { Profile } from './radar';

export type ResearcherSource = 'prosopia' | 'orcid';

/** ``self``: the user themself; ``followed``: someone they follow. Marked researchers list first. */
export type ResearcherMark = 'self' | 'followed';

export interface Researcher {
  id: number;
  source: ResearcherSource;
  /** Prosopia slug or bare ORCID. */
  key: string;
  name: string;
  orcid: string | null;
  affiliation: string | null;
  url: string | null;
  base_url: string | null;
  n_papers: number;
  n_interests: number;
  imported_at: string | null;
  last_run_id: number | null;
  /** True while the last import is still running (poll ``last_run_id``). */
  importing: boolean;
  last_error: string | null;
  created_at: string | null;
  mark: ResearcherMark | null;
  /** Where the user placed them in the list (lower first); null = never placed. */
  position: number | null;
}

/** One OpenAlex topic a researcher's Prosopia profile has an opinion on. */
export interface ResearcherTopic {
  id: string;
  name: string;
  weight: number | null;
  /** ``declared`` by the owner, ``inferred`` from their papers, or ``label``: matched from a text concept. */
  method: 'declared' | 'inferred' | 'label' | string;
  /** The text concept this topic was matched from (method ``label``). */
  label: string | null;
  /** How close the label's nearest topic is (method ``label``). */
  similarity?: number | null;
}

/** What one not-wanted topic does on an interest: filtered out, kept as the other sources have it, or added. */
export type NotInterestChoice = 'filter' | 'keep' | 'add';

/** One topic the researcher's profile does not want, as the topic step lists it. */
export interface NotInterestTopic {
  id: string;
  name: string;
  method: string;
  label: string | null;
  weight: number | null;
  similarity: number | null;
  /** Other sources listing the same topic: ``openalex`` (a seed), ``umls``, ``pdf_content``, ``llm``, ``adopted``, ``profile_interest``. */
  overlap: string[];
  /** Recorded once the profile is applied; before that, the default (``keep`` when it overlaps, else ``filter``). */
  choice: NotInterestChoice;
  in_list: boolean;
  on: boolean | null;
}

/** What a researcher's profile says they do and do not want; empty for an ORCID-only one. */
export interface ResearcherTopics {
  available: boolean;
  wanted: ResearcherTopic[];
  unwanted: ResearcherTopic[];
  /** Text concepts that map to no topic. */
  wanted_labels: string[];
  unwanted_labels: string[];
  /** The labels could not be mapped to topics just now (the mapper is down); the lists hold only the topics the profile asserts outright. */
  labels_unmapped: boolean;
  /** ``unwanted`` with each topic's choice on this interest (an interest's view only). */
  not_interest?: NotInterestTopic[];
}

/** ``GET /api/profiles/{key}/researcher-topics``: the profile topics an interest can take from its researcher. */
export interface ProfileResearcherTopics {
  researcher_id: number | null;
  researcher_name: string | null;
  applied: boolean;
  topics: ResearcherTopics;
}

export interface ResearcherPaper {
  /** OpenAlex id, or ``prosopia:…`` for a paper that resolved nowhere. */
  id: string;
  title: string;
  year: number | null;
  venue: string | null;
  doi: string | null;
  authors: string[];
  abstract: string | null;
  /** Which rung of the resolution ladder found it: work_id | doi | pmcid | title | none. */
  resolved_by: string | null;
  summary: string | null;
  pdf_url: string | null;
  added_at: string | null;
}

export interface ResearcherDetail {
  researcher: Researcher;
  expertise: string | null;
  soul: string | null;
  grants: Record<string, unknown>[];
  papers: ResearcherPaper[];
  /** Interests (drafts included) built from this researcher. */
  interests: Profile[];
  topics: ResearcherTopics;
}

export interface ResearcherImportRequest {
  source: ResearcherSource;
  ref: string;
  base_url?: string;
  /** Prosopia paper ids or OpenAlex work ids to keep; omitted = everything. */
  paper_ids?: string[];
}

export interface ResearcherImportStart {
  researcher_id: number;
  run_id: number;
  /** An import of this person was already running; this request's papers were not added. */
  already_running?: boolean;
}

export interface ResearcherInterestRequest {
  name: string;
  /** Papers to seed with; omitted = all of them. */
  openalex_ids?: string[];
}

export interface ResearcherInterestResponse {
  draft: { slug: string; name: string };
  n_seeds: number;
}

/** One group of a profile's papers that could be an interest. */
export interface SuggestedInterest {
  name: string;
  /** Most typical first. */
  paper_ids: string[];
  /** In the group but below the same-field floor; unticked by default. */
  loose_ids: string[];
  topics: { id: string; name: string; count: number }[];
  coherence_median: number | null;
  agreement: number | null;
  label: string;
  seed_titles: string[];
}

/** ``GET /api/researchers/{id}/works``: the source read again; ``saved_ids`` are already saved. */
export interface ResearcherWorks {
  source: 'orcid' | 'prosopia' | string;
  key: string;
  name: string | null;
  /** ``OrcidWork`` or ``ProsopiaWork`` items, by ``source``. */
  works: unknown[];
  saved_ids: string[];
  /** More works than listed; the newest are. */
  truncated?: boolean;
}

export interface ResearcherSuggestions {
  researcher_id: number;
  embedding_model: string;
  n_papers: number;
  n_embedded: number;
  /** Papers inside some suggestion; the rest are left out on purpose. */
  n_grouped: number;
  suggestions: SuggestedInterest[];
  note: string | null;
}
