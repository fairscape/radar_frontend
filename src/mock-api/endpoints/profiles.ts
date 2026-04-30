import { PROFILES } from '../data/profiles';
import { SEEDS_BY_PROFILE } from '../data/seeds';
import { TOPICS_BY_PROFILE } from '../data/topics';
import { SWEEP } from '../data/sweep';
import { COH_BINS, COH_STATS } from '../data/coherence';
import { FEEDBACK_LOG, FEEDBACK_MORE_COUNT } from '../data/feedback-log';
import { simulateLatency } from '../client';
import type { Profile, Seed, Topic, SweepRow } from '../../types/radar';

export async function listProfiles(): Promise<Profile[]> {
  await simulateLatency();
  return [...PROFILES];
}

export async function getProfile(key: string): Promise<Profile | null> {
  await simulateLatency();
  return PROFILES.find((p) => p.key === key) ?? null;
}

export interface ProfileDetail {
  profile: Profile;
  seeds: Seed[];
  topics: Topic[];
  sweep: SweepRow[];
  coherenceBins: number[];
  coherenceStats: typeof COH_STATS;
  feedbackLog: string[];
  feedbackMoreCount: number;
}

export async function getProfileDetail(key: string): Promise<ProfileDetail | null> {
  await simulateLatency(200, 500);
  const profile = PROFILES.find((p) => p.key === key);
  if (!profile) return null;
  return {
    profile,
    seeds: SEEDS_BY_PROFILE[key] ?? [],
    topics: TOPICS_BY_PROFILE[key] ?? [],
    sweep: SWEEP,
    coherenceBins: COH_BINS,
    coherenceStats: COH_STATS,
    feedbackLog: FEEDBACK_LOG,
    feedbackMoreCount: FEEDBACK_MORE_COUNT,
  };
}

export async function refitProfile(key: string): Promise<{ ok: true; key: string; cost: string }> {
  await simulateLatency(800, 1400);
  return { ok: true, key, cost: '2.84 s · 14 vecs' };
}

export interface DryRunResult {
  ok: true;
  key: string;
  n: number;
  scores: number[];
}

export async function dryRunProfile(key: string): Promise<DryRunResult> {
  await simulateLatency(400, 900);
  // Synthesize a plausible score distribution so the slider/histogram
  // demos look reasonable in mock mode.
  const n = 34;
  const scores: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    scores.push(Number((0.55 + 0.40 * Math.pow(1 - u, 1.6)).toFixed(3)));
  }
  return { ok: true, key, n, scores };
}

export async function updateProfileThreshold(
  key: string,
  threshold: number,
): Promise<Profile> {
  await simulateLatency(80, 220);
  const p = PROFILES.find((x) => x.key === key);
  if (!p) throw new Error(`profile '${key}' not found`);
  p.threshold = threshold;
  return { ...p };
}
