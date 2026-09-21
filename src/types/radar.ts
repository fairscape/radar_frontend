export type Health = 'ok' | 'warn' | 'err';
export type Bucket = 'high' | 'medium' | 'low';
export type CardState = 'saved' | 'dismissed' | null;

export interface Profile {
  key: string;
  name: string;
  hue: number;
  health: Health;
  threshold: number;
  coherence: number;
  seeds: number;
  saves30: number;
  dismisses30: number;
  isDraft?: boolean;
}

export interface Card {
  id: string;
  title: string;
  authors: string[];
  venue: string;
  date: string;
  doi: string | null;
  openalex: string;
  profile: string;
  score: number;
  bucket: Bucket;
  abstract: string;
  mesh: string[];
  terms: string[];
  matched: string[];
  topicMatch: number;
  centroidCos: number;
  noveltyDelta: number;
  mins: number;
}

export interface VaultDoc {
  id: string;
  title: string;
  authors: string[];
  venue: string;
  tags: string[];
  pages: number;
  chunks: number;
  added: string;
}

export interface Seed {
  id: string;
  idx: number;
  title: string;
  year: number;
  coh: number;
}

export interface Topic {
  id: string;
  name: string;
  count: number;
  on: boolean;
  source?: string | null;
}

export interface SweepRow {
  th: number;
  n: number;
  top: string;
}

export interface ChatSource {
  n: number;
  title: string;
  score: number;
  text?: string;
}

export interface ChatTurn {
  who: 'user' | 'assistant';
  t: string;
  body: string | string[];
  sources?: ChatSource[];
}

export interface DailyRadarFilters {
  profile?: string;
  bucket?: Bucket;
}

export interface DailyRadarResponse {
  date: string;
  fetchedAt: string;
  fetchMs: number;
  candidatesScored: number;
  cards: Card[];
  states: Record<string, CardState>;
}

export interface VaultStats {
  docs: number;
  pages: number;
  chunks: number;
  lastIngest: string;
}

export interface RerankerCandidate {
  openalex_id: string;
  title: string;
  score_selector: number;
  score_blended: number;
  rank_before: number;
  rank_after: number;
}

export interface RerankerComparisonResponse {
  ok: boolean;
  key: string;
  n: number;
  candidates: RerankerCandidate[];
  avg_rank_change: number;
  max_rank_up: number;
  max_rank_down: number;
  queries_used: string[];
}

export interface TopicYield {
  topic_id: string;
  display_name: string;
  on: boolean;
  n_candidates: number;
  n_shown: number;
  n_saved: number;
  n_dismissed: number;
  last_fetched_at: string | null;
}

export interface TopicYieldResponse {
  ok: boolean;
  key: string;
  days: number;
  topics: TopicYield[];
}

export interface FeedbackEvent {
  id: number;
  profile_id: number;
  openalex_id: string;
  doi: string | null;
  action: string;
  score: number | null;
  selector: string | null;
  ts: string;
}

export type LLMProvider = 'ollama' | 'anthropic' | 'openai';

export interface BackendHealth {
  status: string;
  version: string;
  ollama_model: string | null;
  llm_provider?: LLMProvider | null;
  llm_model?: string | null;
}

export interface ProviderInfo {
  id: LLMProvider;
  model: string;
  configured: boolean;
}

export interface ProvidersResponse {
  default: LLMProvider;
  available: ProviderInfo[];
}
