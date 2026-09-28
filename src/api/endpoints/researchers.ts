/**
 * Researchers library — imported Researcher Profile documents, per user.
 * Independent of topics (nothing here feeds recommendation).
 */

import { api } from '../client';
import { dataBus } from '../../lib/dataBus';
import type { RpMeta } from '../../types/radar';

export interface ResearcherSummary {
  id: number;
  rid: string;
  orcid: string | null;
  name: string;
  affiliation: string | null;
  field: string | null;
  level: string | null;
  provenance: string | null;
  date_modified: string | null;
  source_kind: string;
  imported_at: string | null;
  updated_at: string | null;
  n_expertise: number;
  n_not_interests: number;
  n_papers: number | null;
}

export interface TrainingEntry {
  kind?: string | null;
  degree?: string | null;
  institution?: string | null;
  advisor?: string | null;
  field?: string | null;
  year_start?: number | null;
  year_end?: number | null;
}

export interface CareerEntry {
  role?: string | null;
  institution?: string | null;
  start_year?: number | null;
  end_year?: number | null;
}

export interface ManifestSummary {
  n_entries: number;
  by_role: Record<string, number>;
  by_visibility: Record<string, number>;
  bytes_total: number;
  paper_ids: string[];
  persona_documents: string[];
  restricted_roles: string[];
  works_url: string | null;
}

/** The server's parsed view of the document (``parsed_json``). */
export interface ResearcherParsed extends RpMeta {
  n_expertise?: number;
  n_not_interests?: number;
  n_papers?: number | null;
  training?: TrainingEntry[];
  career?: CareerEntry[];
  career_stage?: Record<string, unknown> | null;
  license?: string | null;
  visibility?: string | null;
  capabilities?: Record<string, boolean>;
  manifest?: ManifestSummary;
  warnings?: string[];
}

export interface ResearcherDetail extends ResearcherSummary {
  parsed: ResearcherParsed;
  doc: Record<string, unknown>;
  warnings: string[];
}

export interface ResearcherImportResult {
  researcher: ResearcherSummary;
  created: boolean;
  warnings: string[];
}

export function listResearchers(): Promise<ResearcherSummary[]> {
  return api.get<ResearcherSummary[]>('/api/researchers');
}

export function getResearcher(id: number): Promise<ResearcherDetail> {
  return api.get<ResearcherDetail>(`/api/researchers/${id}`);
}

export async function importResearcher(
  profileJson: string,
  sourceKind: 'paste' | 'file' = 'paste',
): Promise<ResearcherImportResult> {
  const res = await api.post<ResearcherImportResult>('/api/researchers', {
    profile_json: profileJson,
    source_kind: sourceKind,
  });
  dataBus.emit('researchers:changed');
  return res;
}

export async function deleteResearcher(id: number): Promise<{ ok: boolean }> {
  const res = await api.delete<{ ok: boolean }>(`/api/researchers/${id}`);
  dataBus.emit('researchers:changed');
  return res;
}
