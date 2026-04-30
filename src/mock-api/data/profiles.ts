import type { Profile } from '../../types/radar';

export const PROFILES: Profile[] = [
  { key: 'provenance_fairscape', name: 'provenance / fairscape', hue: 195, health: 'ok', threshold: 0.85, coherence: 0.78, seeds: 14, saves30: 23, dismisses30: 58 },
  { key: 'cryo_em_particle_picking', name: 'cryo-em / particle picking', hue: 75, health: 'ok', threshold: 0.82, coherence: 0.81, seeds: 12, saves30: 18, dismisses30: 41 },
  { key: 'single_cell_atlas', name: 'single-cell atlas / integration', hue: 145, health: 'warn', threshold: 0.79, coherence: 0.64, seeds: 11, saves30: 9, dismisses30: 62 },
  { key: 'protein_language_models', name: 'protein language models', hue: 285, health: 'ok', threshold: 0.88, coherence: 0.82, seeds: 15, saves30: 31, dismisses30: 44 },
  { key: 'knowledge_graphs_bio', name: 'bio knowledge graphs', hue: 30, health: 'err', threshold: 0.80, coherence: 0.58, seeds: 9, saves30: 4, dismisses30: 71 },
];
