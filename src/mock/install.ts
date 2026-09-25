/**
 * In-browser mock backend. Installed only when ``VITE_USE_MOCK=1``.
 *
 * Wraps ``window.fetch`` and answers ``/api/*`` from an in-memory state
 * that follows ``rag_lib/api/schemas.py``. Background work (scans,
 * trial scans, Prosopia imports) advances on timers so polling code is
 * exercised for real. State is keyed by the signed-in email; unknown
 * emails start empty, which is how the first-run flow is tested.
 *
 * ``window.__radarMock`` exposes ``failNext(pattern)`` so error paths
 * can be provoked from a browser console or a smoke test.
 */
import type { Card, ChatTurn, Profile, Topic, VaultDoc } from '../types/radar';
import type { Researcher, ResearcherPaper } from '../types/researchers';

interface MockRun {
  id: number;
  profile_id: number;
  started_at: string;
  finished_at: string | null;
  since_date: string | null;
  filter_string: string | null;
  tier_used: string | null;
  n_fetched: number | null;
  n_new: number | null;
  n_redup: number | null;
  api_calls: number | null;
  error: string | null;
  current_step: string | null;
  n_processed: number | null;
  n_total: number | null;
  last_message: string | null;
}

interface MockResearcher {
  id: number;
  source: 'prosopia' | 'orcid';
  key: string;
  name: string;
  orcid: string | null;
  affiliation: string | null;
  url: string | null;
  base_url: string | null;
  expertise: string | null;
  grants: Record<string, unknown>[];
  papers: ResearcherPaper[];
  imported_at: string | null;
  last_run_id: number | null;
  created_at: string;
}

interface MockProfile {
  id: number;
  slug: string;
  name: string;
  hue: number;
  is_draft: boolean;
  researcher_id?: number | null;
  threshold: number;
  coherence: number;
  seeds: { id: string; title: string; year: number; coh: number }[];
  topics: Topic[];
  candidates: { card: Card; saved: boolean; dismissed: boolean }[];
  runs: MockRun[];
  feedback: { id: number; openalex_id: string; doi: string | null; action: string; score: number; ts: string }[];
}

interface MockState {
  email: string;
  mailto: string;
  profiles: MockProfile[];
  docs: VaultDoc[];
  chat: ChatTurn[];
  dryRuns: Record<number, { slug: string; result: { sweep: unknown[]; preview: Card[]; scores: number[]; suggested_threshold?: number; seed_similarity?: { min: number; median: number; max: number }; score_range?: number[] } | null }>;
  imports: Record<number, { slug: string; result: Record<string, unknown> | null }>;
  /** Unfinished simulated runs, so a page reload can resume them. */
  sims: Record<number, { kind: 'scan' | 'dryrun' | 'import' | 'rimport'; slug: string; days?: number; limit?: number; ref?: string; name?: string; researcherId?: number; paperIds?: string[] }>;
  /** Stored researchers ("profiles" in the UI) and the runs of their imports. */
  researchers: MockResearcher[];
  researcherRuns: MockRun[];
  nextId: number;
}

const TITLES = [
  'Continuous vital-sign monitoring in preterm infants: a multicentre cohort',
  'Heart-rate variability as an early marker of late-onset sepsis',
  'Machine-readable provenance for reproducible computational pipelines',
  'Evaluating pulse-oximetry alarm thresholds in level-III NICUs',
  'Merkle-tree attestation of research object crates',
  'A transformer for physiologic waveform forecasting in neonates',
  'Interoperable metadata schemas for biomedical data commons',
  'Bradycardia clustering predicts extubation failure',
  'Signed provenance graphs for multi-institution data sharing',
  'Respiratory instability indices derived from bedside monitors',
  'FAIR principles applied to clinical time-series repositories',
  'Sepsis prediction with wearable sensors in the neonatal ward',
  'Capturing workflow provenance from Nextflow at scale',
  'Oxygen-saturation histograms and retinopathy risk',
];
const VENUES = ['Pediatrics', 'JAMIA', 'Sci Data', 'Arch Dis Child', 'PLoS Comp Bio', 'NEJM AI'];
const AUTHORS = ['Okafor A', 'Lindqvist M', 'Chen R', 'Sheffield N', 'Dubois L', 'Patel S', 'Ivanova K'];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

function makeCard(i: number, slug: string, score: number, opts: { threshold?: number; seedMin?: number; pct?: number } = {}): Card {
  const thr = opts.threshold ?? 0.917;
  const seedMin = opts.seedMin ?? 0.927;
  const bucket = score >= seedMin ? 'high' : score >= thr ? 'medium' : 'low';
  const id = `https://openalex.org/W${(4400000000 + i * 7919).toString()}`;
  return {
    id,
    title: pick(TITLES, i),
    authors: [pick(AUTHORS, i), pick(AUTHORS, i + 2), pick(AUTHORS, i + 5)],
    venue: pick(VENUES, i),
    date: new Date(Date.now() - i * 86400000 * 1.3).toISOString().slice(0, 10),
    doi: i % 4 === 3 ? null : `10.1000/radar.${1000 + i}`,
    openalex: id,
    profile: slug,
    score: Number((opts.pct ?? 1 - i / 40).toFixed(4)),
    similarity: Number(score.toFixed(4)),
    bucket,
    abstract:
      'We report a prospective study of ' +
      pick(TITLES, i).toLowerCase() +
      '. Methods combine bedside monitor streams with structured metadata; results show a measurable improvement over the baseline, with limitations discussed. ' +
      'This mock abstract exists so the layout can be judged with realistic length.',
    mesh: ['Infant, Premature', 'Monitoring, Physiologic'].slice(0, (i % 3) + 0),
    terms: ['neonatal', 'monitoring', 'provenance', 'sepsis'].slice(0, (i % 3) + 1),
    matched: i % 2 === 0 ? ['neonatal'] : [],
    topicMatch: Number((0.4 + (i % 5) * 0.12).toFixed(2)),
    centroidCos: Number(score.toFixed(2)),
    noveltyDelta: Number(((i % 7) * 0.1).toFixed(2)),
    mins: 6 + (i % 9),
  };
}

function nowIso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function mockResearcherPapers(key: string, n: number, ids?: string[]): ResearcherPaper[] {
  return Array.from({ length: n }, (_, i) => {
    const unmatched = i === n - 1;
    return {
      id: ids?.[i] ?? (unmatched ? `prosopia:${key}:paper${i}` : `https://openalex.org/W8${key.length}${i}`),
      title: pick(TITLES, i + 2), year: 2025 - (i % 9), venue: pick(VENUES, i + 1), doi: unmatched ? null : `10.1234/mock.${key}.${i}`,
      authors: ['Nathan C. Sheffield', pick(AUTHORS, i), pick(AUTHORS, i + 3)], abstract: null,
      resolved_by: unmatched ? 'none' : i % 5 === 4 ? 'doi' : 'work_id', summary: unmatched ? 'Only the profile summary describes this work.' : null, pdf_url: null, added_at: nowIso(-86400000 * 5),
    };
  });
}

function toResearcher(st: MockState, r: MockResearcher): Researcher {
  const run = st.researcherRuns.find((x) => x.id === r.last_run_id) ?? null;
  return {
    id: r.id, source: r.source, key: r.key, name: r.name, orcid: r.orcid, affiliation: r.affiliation, url: r.url, base_url: r.base_url,
    n_papers: r.papers.length, n_interests: st.profiles.filter((p) => p.researcher_id === r.id).length,
    imported_at: r.imported_at, last_run_id: r.last_run_id, importing: !!run && !run.finished_at, last_error: run?.error ?? null, created_at: r.created_at,
  };
}

/** Find or create the stored researcher an import refers to (mirrors the backend's upsert). */
function ensureResearcher(st: MockState, source: 'prosopia' | 'orcid', key: string, name: string): MockResearcher {
  let r = st.researchers.find((x) => x.source === source && x.key === key);
  if (r) { r.name = name || r.name; return r; }
  const orcid = source === 'orcid' ? key : key === 'sheffield-nathan' ? '0000-0001-5643-4068' : null;
  r = {
    id: st.nextId++, source, key, name, orcid, affiliation: source === 'prosopia' ? 'University of Virginia' : null,
    url: source === 'prosopia' ? `https://prosopia.databio.org/${key}` : `https://orcid.org/${key}`, base_url: source === 'prosopia' ? 'https://prosopia.databio.org' : null,
    expertise: null, grants: [], papers: [], imported_at: null, last_run_id: null, created_at: nowIso(),
  };
  st.researchers.push(r);
  return r;
}

function seedState(email: string): MockState {
  const st: MockState = { email, mailto: email, profiles: [], docs: [], chat: [], dryRuns: {}, imports: {}, sims: {}, researchers: [], researcherRuns: [], nextId: 100 };
  if (!/^(demo|test)@/.test(email)) return st;

  const mk = (id: number, slug: string, name: string, hue: number, threshold: number, coherence: number, topics: [string, string, number, boolean, string | null][]): MockProfile => ({
    id, slug, name, hue, is_draft: false, threshold, coherence,
    seeds: Array.from({ length: 9 }, (_, i) => ({ id: `W${id}${i}`, title: pick(TITLES, i + id), year: 2019 + (i % 6), coh: Number((0.62 + (i % 5) * 0.06).toFixed(3)) })),
    topics: topics.map(([tid, tname, count, on, source]) => ({ id: tid, name: tname, count, on, source })),
    candidates: [], runs: [], feedback: [],
  });
  const a = mk(1, 'neonatal-vitals', 'Neonatal vital-sign monitoring', 150, 0.93, 0.926, [
    ['T10001', 'Neonatal intensive care', 7, true, null],
    ['T10234', 'Physiologic monitoring', 5, true, null],
    ['T10877', 'Sepsis prediction', 3, true, 'umls'],
    ['T11020', 'Retinopathy of prematurity', 1, false, null],
  ]);
  const b = mk(2, 'fair-provenance', 'FAIR data provenance', 40, 0.9, 0.878, [
    ['T12001', 'Research data management', 6, true, null],
    ['T12333', 'Workflow provenance', 4, true, null],
    ['T12900', 'Cryptographic attestation', 2, true, 'umls'],
  ]);
  a.candidates = Array.from({ length: 9 }, (_, i) => ({ card: makeCard(i, a.slug, 0.952 - i * 0.006, { threshold: 0.93, seedMin: 0.928, pct: 1 - i / 8 }), saved: i === 1, dismissed: i === 6 }));
  b.candidates = Array.from({ length: 6 }, (_, i) => ({ card: makeCard(i + 20, b.slug, 0.945 - i * 0.008, { threshold: 0.9, seedMin: 0.92, pct: 1 - i / 5 }), saved: false, dismissed: false }));
  a.runs = [{ id: 11, profile_id: 1, started_at: nowIso(-86400000 * 1.1), finished_at: nowIso(-86400000 * 1.1 + 92000), since_date: null, filter_string: null, tier_used: 'scheduled', n_fetched: 412, n_new: 9, n_redup: 380, api_calls: 6, error: null, current_step: 'done', n_processed: 412, n_total: 412, last_message: null }];
  b.runs = [{ id: 12, profile_id: 2, started_at: nowIso(-86400000 * 3), finished_at: nowIso(-86400000 * 3 + 40000), since_date: null, filter_string: null, tier_used: 'scheduled', n_fetched: 0, n_new: 0, n_redup: 0, api_calls: 2, error: 'OpenAlex returned 503 after 3 retries', current_step: 'fetching', n_processed: 0, n_total: null, last_message: null }];
  a.feedback = [{ id: 1, openalex_id: a.candidates[1].card.id, doi: a.candidates[1].card.doi, action: 'saved', score: 0.973, ts: nowIso(-3600000) }, { id: 2, openalex_id: a.candidates[6].card.id, doi: null, action: 'dismissed', score: 0.913, ts: nowIso(-7200000) }];
  const draft: MockProfile = { ...mk(3, 'draft-wearables', 'Wearable sensors (draft)', 300, 0.0, 0.0, []), is_draft: true, seeds: [] };
  draft.seeds = [{ id: 'W3000', title: pick(TITLES, 11), year: 2024, coh: 0 }];
  st.profiles = [a, b, draft];
  // One stored researcher, from whom the FAIR interest was built.
  const sheffield: MockResearcher = {
    id: 7, source: 'prosopia', key: 'sheffield-nathan', name: 'Nathan C. Sheffield', orcid: '0000-0001-5643-4068', affiliation: 'University of Virginia', url: 'https://prosopia.databio.org/sheffield-nathan', base_url: 'https://prosopia.databio.org',
    expertise: 'Genomic region sets, epigenomics, reproducible computational pipelines and the FAIR sharing of biomedical data.',
    grants: [{ name: 'Standards for genomic interval data', funder: 'NIH NHGRI', role: 'pi' }],
    papers: mockResearcherPapers('sheffield-nathan', 14),
    imported_at: nowIso(-86400000 * 5), last_run_id: 13, created_at: nowIso(-86400000 * 5),
  };
  st.researchers = [sheffield];
  st.researcherRuns = [{ id: 13, profile_id: 0, started_at: nowIso(-86400000 * 5), finished_at: nowIso(-86400000 * 5 + 70000), since_date: null, filter_string: null, tier_used: 'researcher_import', n_fetched: 14, n_new: 14, n_redup: 0, api_calls: 3, error: null, current_step: 'done', n_processed: 14, n_total: 14, last_message: null }];
  b.researcher_id = sheffield.id;
  st.docs = [
    ...a.seeds.map((s, i) => ({ id: `doc-a-${i}`, title: s.title, authors: [pick(AUTHORS, i)], venue: pick(VENUES, i), tags: [a.slug], pages: 8 + i, chunks: 40 + i * 3, added: nowIso(-86400000 * (30 - i)) })),
    ...b.seeds.map((s, i) => ({ id: `doc-b-${i}`, title: s.title, authors: [pick(AUTHORS, i + 3)], venue: pick(VENUES, i + 1), tags: [b.slug], pages: 12 + i, chunks: 60 + i * 2, added: nowIso(-86400000 * (20 - i)) })),
    { id: 'doc-x', title: 'Untagged reading: statistics refresher', authors: ['Anon'], venue: '—', tags: [], pages: 30, chunks: 120, added: nowIso(-86400000 * 2) },
    { id: 'doc-d', title: pick(TITLES, 11), authors: ['Patel S'], venue: 'Sci Data', tags: ['draft-wearables'], pages: 10, chunks: 44, added: nowIso(-3600000) },
  ];
  st.chat = [
    { who: 'user', t: '09:12', body: 'Which of my papers discuss sepsis prediction from heart-rate variability?' },
    { who: 'assistant', t: '09:12', body: ['Two documents cover this directly [1][2]. Both use heart-rate characteristics as an early-warning signal.', 'The second adds a wearable-sensor validation cohort [2].'], sources: [{ n: 1, title: TITLES[1], score: 0.81, text: 'Heart-rate characteristics monitoring reduced mortality in the randomized trial ...' }, { n: 2, title: TITLES[11], score: 0.77, text: 'Wearable sensors captured HRV continuously across the 14-day observation window ...' }, { n: 3, title: TITLES[0], score: 0.55 }] },
  ];
  return st;
}

const PERSIST_KEY = 'radar.mock.v1';
const states = new Map<string, MockState>();
function persistStates() {
  try {
    window.sessionStorage.setItem(PERSIST_KEY, JSON.stringify([...states.entries()]));
  } catch {
    /* ignore */
  }
}
function restoreStates() {
  try {
    const raw = window.sessionStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    for (const [k, v] of JSON.parse(raw) as [string, MockState][]) {
      v.sims ??= {};
      v.researchers ??= [];
      v.researcherRuns ??= [];
      states.set(k, v);
      for (const [runId, sim] of Object.entries(v.sims)) resumeSim(v, Number(runId), sim);
    }
  } catch {
    /* ignore */
  }
}
function stateFor(email: string): MockState {
  let s = states.get(email);
  if (!s) {
    s = seedState(email);
    states.set(email, s);
  }
  return s;
}

function toProfile(p: MockProfile): Profile {
  const saves30 = p.feedback.filter((f) => f.action === 'saved').length + p.candidates.filter((c) => c.saved).length;
  const dismisses30 = p.candidates.filter((c) => c.dismissed).length;
  const n = p.seeds.length;
  const label = n === 0 ? 'none' : n < 2 ? 'single' : p.coherence >= 0.9 ? 'focused' : p.coherence >= 0.86 ? 'broad' : 'mixed';
  const health = label === 'focused' ? 'ok' : label === 'mixed' ? 'err' : 'warn';
  const agreement = n >= 2 ? Math.round(100 * Math.max(0, Math.min(1, (p.coherence - 0.82) / 0.13))) : null;
  const band = seedBand(p);
  return { key: p.slug, name: p.name, hue: p.hue, health, threshold: p.threshold, coherence: p.coherence, seeds: n, saves30, dismisses30, isDraft: p.is_draft, coherenceLabel: label, agreement, seedSimMin: band?.min ?? null, seedSimMax: band?.max ?? null, researcherId: p.researcher_id ?? null };
}

function seedBand(p: MockProfile) {
  const n = p.seeds.length;
  if (n < 2) return null;
  const min = 0.92 + (n % 3) * 0.004;
  return { min, median: min + 0.015, max: min + 0.03 };
}

function coherenceSummary(label: string, n: number, agreement: number | null) {
  const a = agreement == null ? '—' : `${agreement}/100`;
  if (label === 'none') return 'No seed papers yet.';
  if (label === 'single') return "One seed paper. Radar will look for papers like it; agreement between seeds can't be measured until there are two.";
  if (label === 'focused') return `Your ${n} seed papers agree with each other (${a}). They describe one clear topic, so matches should be on target.`;
  if (label === 'broad') return `Your ${n} seed papers only loosely agree (${a}). They may cover two related topics; results will lean towards whichever group is larger.`;
  return `Your ${n} seed papers don't share a topic (${a}) — about as similar as random papers from the same field.`;
}

function coherenceFull(p: MockProfile) {
  const c = coherenceOf(p);
  const n = p.seeds.length;
  const label = n === 0 ? 'none' : n < 2 ? 'single' : c.median >= 0.9 ? 'focused' : c.median >= 0.86 ? 'broad' : 'mixed';
  const agreement = n >= 2 ? Math.round(100 * Math.max(0, Math.min(1, (c.median - 0.82) / 0.13))) : null;
  const band = seedBand(p);
  const least = n >= 2 ? { a_id: p.seeds[0].id, a_title: p.seeds[0].title, b_id: p.seeds[n - 1].id, b_title: p.seeds[n - 1].title, cosine: Number((c.median - 0.03).toFixed(3)) } : null;
  return { ...c, label, agreement, summary: coherenceSummary(label, n, agreement), seed_similarity: band, least_similar: least };
}

function coherenceOf(p: MockProfile) {
  const n = p.seeds.length;
  const bins = new Array(16).fill(0) as number[];
  if (n >= 2) {
    for (let i = 0; i < (n * (n - 1)) / 2; i++) bins[7 + (i % 5)] += 1;
    bins[3] += 1;
  }
  const median = n >= 2 ? (/mixed|broad/i.test(p.name) ? 0.875 : Math.min(0.94, 0.905 + n * 0.003)) : 0;
  return { bins, median: Number(median.toFixed(3)), iqr: n >= 2 ? 0.024 : 0, bimodal: false, n };
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'interest';
}

/** Advance a run through its steps on a timer; ``onDone`` fills results. */
function simulateRun(run: MockRun, kind: 'scan' | 'dryrun' | 'import', total: number, onDone: () => void, fail = false) {
  const steps = kind === 'import' ? ['fetching_profile', 'resolving', 'embedding', 'attaching'] : ['loading_profile', 'fetching', 'embedding', 'persisting'];
  let si = 0;
  let processed = 0;
  const tickMs = 500;
  const timer = window.setInterval(() => {
    const step = steps[si];
    run.current_step = step;
    if (step === 'fetching' || step === 'resolving' || step === 'embedding') {
      run.n_total = total;
      processed = Math.min(total, processed + Math.ceil(total / 6));
      run.n_processed = processed;
      run.last_message = step === 'embedding' ? `batch ${Math.ceil(processed / 32)}` : `page ${Math.ceil(processed / 200)}`;
      if (processed >= total) {
        processed = 0;
        si += 1;
      }
    } else {
      si += 1;
    }
    if (fail && step === 'fetching' && processed > total / 2) {
      window.clearInterval(timer);
      run.error = 'OpenAlex returned 503 after 3 retries';
      run.finished_at = nowIso();
      return;
    }
    if (si >= steps.length) {
      window.clearInterval(timer);
      run.current_step = 'done';
      run.finished_at = nowIso();
      run.n_fetched = total;
      onDone();
    }
  }, tickMs);
}

function completeScan(st: MockState, p: MockProfile, run: MockRun, days: number) {
  const fresh = 3 + (days % 4);
  for (let i = 0; i < fresh; i++) {
    p.candidates.unshift({ card: makeCard(st.nextId++, p.slug, 0.948 - i * 0.007, { threshold: p.threshold || 0.917, seedMin: seedBand(p)?.min ?? 0.927, pct: 1 - i / 10 }), saved: false, dismissed: false });
  }
  run.n_new = fresh;
  run.n_redup = (run.n_fetched ?? 0) - fresh;
  run.api_calls = 4;
}
function completeDryRun(st: MockState, p: MockProfile, run: MockRun) {
  // Shaped like the measured SPECTER2 pool: 0.81–0.95, median ~0.89.
  const scores = Array.from({ length: 180 }, (_, i) => Number((0.95 - Math.pow(i / 180, 1.4) * 0.14).toFixed(3)));
  const band = seedBand(p) ?? { min: 0.927, median: 0.94, max: 0.952 };
  const sorted = [...scores].sort((x, y) => y - x);
  const p75 = sorted[Math.floor(sorted.length * 0.25)];
  const p98 = sorted[Math.floor(sorted.length * 0.02)];
  const suggested = Number(Math.min(Math.max(band.min - 0.01, p75), p98).toFixed(3));
  st.dryRuns[run.id] = { slug: p.slug, result: { sweep: [], preview: Array.from({ length: 8 }, (_, i) => makeCard(i + 40, p.slug, scores[i], { threshold: suggested, seedMin: band.min, pct: 1 - i / 179 })), scores, suggested_threshold: suggested, seed_similarity: band, score_range: [Number((Math.min(scores[scores.length - 1], band.min) - 0.01).toFixed(3)), Number((Math.max(scores[0], band.max) + 0.005).toFixed(3))] } };
}
function completeImport(st: MockState, p: MockProfile, run: MockRun, ref: string, name: string) {
  p.seeds = Array.from({ length: 12 }, (_, i) => ({ id: `W9${p.id}${i}`, title: pick(TITLES, i + 3), year: 2018 + (i % 7), coh: 0.7 }));
  st.docs.push(...p.seeds.map((s, i) => ({ id: `doc-${p.slug}-${i}`, title: s.title, authors: [pick(AUTHORS, i)], venue: pick(VENUES, i), tags: [p.slug], pages: 9, chunks: 30, added: nowIso() })));
  // The wizard's import leaves the researcher behind, like the backend.
  const isOrcid = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(ref);
  const r = ensureResearcher(st, run.tier_used === 'orcid_import' || isOrcid ? 'orcid' : 'prosopia', ref, name);
  if (r.papers.length === 0) r.papers = p.seeds.map((s, i) => ({ id: `https://openalex.org/${s.id}`, title: s.title, year: s.year, venue: pick(VENUES, i), doi: `10.1234/mock.${i}`, authors: [name, pick(AUTHORS, i)], abstract: null, resolved_by: 'work_id', summary: null, pdf_url: null, added_at: nowIso() }));
  r.imported_at = nowIso();
  p.researcher_id = r.id;
  st.imports[run.id] = { slug: p.slug, result: { slug: ref, draft_slug: p.slug, researcher_id: r.id, name, drafted: 12, resolved_by: { work_id: 9, doi: 2, title: 1, none: 0 }, unresolved: [] } };
}
function completeResearcherImport(st: MockState, run: MockRun, researcherId: number, paperIds?: string[]) {
  const r = st.researchers.find((x) => x.id === researcherId);
  if (!r) return;
  const fresh = mockResearcherPapers(r.key, paperIds?.length ?? 14, paperIds?.map((id) => (/^W\d/.test(id) ? `https://openalex.org/${id}` : `https://openalex.org/${id.replace(/[^A-Za-z0-9]/g, '').slice(0, 12)}`)));
  for (const paper of fresh) if (!r.papers.some((x) => x.id === paper.id)) r.papers.push(paper);
  r.imported_at = nowIso();
  run.n_new = fresh.length;
  run.n_redup = 0;
  st.imports[run.id] = { slug: '', result: { slug: r.key, draft_slug: null, researcher_id: r.id, name: r.name, drafted: fresh.length, resolved_by: { work_id: fresh.length - 1, doi: 0, title: 0, none: 1 }, unresolved: [] } };
}
function startSim(st: MockState, p: MockProfile | null, run: MockRun, sim: MockState['sims'][number]) {
  st.sims[run.id] = sim;
  const total = sim.kind === 'scan' ? Math.min(sim.limit ?? 500, 60 * (sim.days ?? 7)) : sim.kind === 'dryrun' ? 180 : sim.kind === 'rimport' ? (sim.paperIds?.length ?? 14) : 12;
  const fail = sim.kind === 'scan' && !!p && /fail/i.test(p.name);
  simulateRun(run, sim.kind === 'rimport' ? 'import' : sim.kind, total, () => {
    if (sim.kind === 'rimport') completeResearcherImport(st, run, sim.researcherId ?? 0, sim.paperIds);
    else if (!p) { /* unreachable: profile sims always carry a profile */ }
    else if (sim.kind === 'scan') completeScan(st, p, run, sim.days ?? 7);
    else if (sim.kind === 'dryrun') completeDryRun(st, p, run);
    else completeImport(st, p, run, sim.ref ?? '', sim.name ?? p.name);
    delete st.sims[run.id];
    persistStates();
  }, fail);
}
function resumeSim(st: MockState, runId: number, sim: MockState['sims'][number]) {
  if (sim.kind === 'rimport') {
    const run = st.researcherRuns.find((r) => r.id === runId);
    if (!run || run.finished_at) { delete st.sims[runId]; return; }
    startSim(st, null, run, sim);
    return;
  }
  const p = st.profiles.find((x) => x.slug === sim.slug);
  const run = p?.runs.find((r) => r.id === runId);
  if (!p || !run || run.finished_at) {
    delete st.sims[runId];
    return;
  }
  startSim(st, p, run, sim);
}

const FAIL_KEY = 'radar.mock.failNext';
function loadFailPatterns(): RegExp[] {
  try {
    return (JSON.parse(window.sessionStorage.getItem(FAIL_KEY) ?? '[]') as string[]).map((x) => new RegExp(x));
  } catch {
    return [];
  }
}
function saveFailPatterns() {
  try {
    window.sessionStorage.setItem(FAIL_KEY, JSON.stringify(failPatterns.map((r) => r.source)));
  } catch {
    /* ignore */
  }
}
let failPatterns: RegExp[] = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
function err(status: number, detail: string): Response {
  return json({ detail }, status);
}

async function handle(method: string, url: URL, init: RequestInit | undefined, email: string | null): Promise<Response> {
  const path = url.pathname;
  const q = url.searchParams;
  const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
  const form = init?.body instanceof FormData ? init.body : null;

  if (path === '/api/health') {
    return json({ status: 'ok', version: '0.9.3-mock', ollama_model: null, llm_provider: 'anthropic', llm_model: 'claude-sonnet-5' });
  }
  if (!email) return err(401, 'X-User-Email header required');
  const st = stateFor(email);
  const findProfile = (key: string) => st.profiles.find((p) => p.slug === key);

  if (path === '/api/users/me') {
    if (method === 'PATCH') {
      const m = body?.mailto;
      if (typeof m === 'string' && m && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)) return err(422, 'mailto must be a valid email address');
      st.mailto = (m as string) || st.email;
    }
    return json({ id: 1, email: st.email, mailto: st.mailto, created_at: nowIso(-86400000 * 40) });
  }

  // --- profiles / wizard ---
  if (path === '/api/profiles' && method === 'GET') return json(st.profiles.map(toProfile));
  if (path === '/api/profiles/draft' && method === 'POST') {
    const name = String(body?.name ?? '').trim();
    if (!name) return err(422, 'name is required');
    let slug = slugify(name);
    if (findProfile(slug)) slug = `${slug}-${st.nextId}`;
    const p: MockProfile = { id: st.nextId++, slug, name, hue: (slug.length * 47) % 360, is_draft: true, threshold: 0, coherence: 0, seeds: [], topics: [], candidates: [], runs: [], feedback: [] };
    st.profiles.push(p);
    return json({ slug, name });
  }
  let m = path.match(/^\/api\/profiles\/draft\/([^/]+)\/(coherence|topics|dry-run)$/);
  if (m) {
    const p = findProfile(decodeURIComponent(m[1]));
    if (!p) return err(404, `draft '${m[1]}' not found`);
    if (m[2] === 'coherence') {
      await new Promise((r) => window.setTimeout(r, 600));
      const c = coherenceFull(p);
      p.coherence = c.median;
      return json(c);
    }
    if (m[2] === 'topics') {
      if (p.topics.length === 0) {
        const n = p.seeds.length;
        p.topics = [
          { id: 'T10001', name: 'Neonatal intensive care', count: Math.max(1, n - 1), on: true, source: null },
          { id: 'T10234', name: 'Physiologic monitoring', count: Math.max(1, n - 3), on: true, source: null },
          { id: 'T10877', name: 'Sepsis prediction', count: 2, on: true, source: 'umls' },
          { id: 'T13000', name: 'Wearable technology', count: 1, on: true, source: null },
        ];
      }
      return json(p.topics);
    }
    const run: MockRun = { id: st.nextId++, profile_id: p.id, started_at: nowIso(), finished_at: null, since_date: null, filter_string: null, tier_used: 'dry-run', n_fetched: null, n_new: null, n_redup: null, api_calls: null, error: null, current_step: null, n_processed: null, n_total: null, last_message: null };
    p.runs.unshift(run);
    st.dryRuns[run.id] = { slug: p.slug, result: null };
    startSim(st, p, run, { kind: 'dryrun', slug: p.slug });
    return json({ ok: true, run_id: run.id });
  }
  m = path.match(/^\/api\/profiles\/draft\/([^/]+)\/dry-run\/(\d+)$/);
  if (m) {
    const p = findProfile(decodeURIComponent(m[1]));
    const run = p?.runs.find((r) => r.id === Number(m![2]));
    if (!p || !run) return err(404, 'dry-run not found');
    return json({ run, result: st.dryRuns[run.id]?.result ?? null });
  }
  m = path.match(/^\/api\/profiles\/draft\/([^/]+)\/seeds\/([^/]+)$/);
  if (m && method === 'DELETE') {
    const slug = decodeURIComponent(m[1]);
    const id = decodeURIComponent(m[2]);
    const p = findProfile(slug);
    if (!p || !p.is_draft) return err(404, `draft '${slug}' not found`);
    // Mock seeds and vault docs carry different ids; match either, then the other by title.
    const doc = st.docs.find((d) => d.id === id && d.tags.includes(slug));
    const seed = p.seeds.find((s) => s.id === id || s.id === `W${id}` || (doc && s.title === doc.title));
    if (!doc && !seed) return err(404, `'${id}' is not a seed of draft '${slug}'`);
    p.seeds = p.seeds.filter((s) => s !== seed);
    const title = doc?.title ?? seed?.title;
    const gone = doc ?? st.docs.find((d) => d.tags.includes(slug) && d.title === title);
    if (gone) gone.tags = gone.tags.filter((t) => t !== slug);
    p.topics = [];
    return json({ ok: true });
  }
  m = path.match(/^\/api\/profiles\/draft\/([^/]+)$/);
  if (m && method === 'DELETE') {
    const slug = decodeURIComponent(m[1]);
    const p = findProfile(slug);
    if (!p || !p.is_draft) return err(404, `draft '${slug}' not found`);
    st.profiles = st.profiles.filter((x) => x !== p);
    st.docs = st.docs.filter((d) => !d.tags.includes(slug));
    return json({ ok: true });
  }
  if (path === '/api/profiles' && method === 'POST') {
    const p = findProfile(String(body?.slug));
    if (!p || !p.is_draft) return err(404, `draft '${body?.slug}' not found`);
    p.is_draft = false;
    p.threshold = Number(body?.threshold ?? 0.9);
    const sel = new Set((body?.selected_topic_ids as string[] | undefined) ?? []);
    p.topics = p.topics.map((t) => ({ ...t, on: sel.has(t.id) }));
    p.coherence = coherenceOf(p).median;
    return json(toProfile(p));
  }
  m = path.match(/^\/api\/profiles\/([^/]+)(?:\/(.+))?$/);
  if (m) {
    const key = decodeURIComponent(m[1]);
    const sub = m[2] ?? '';
    const p = findProfile(key);
    if (!p) return err(404, `profile '${key}' not found for current user`);
    if (sub === '' && method === 'GET') return json(toProfile(p));
    if (sub === '' && method === 'PATCH') {
      const t = Number(body?.threshold);
      if (!(t >= 0 && t <= 1)) return err(422, 'threshold must be between 0 and 1');
      p.threshold = t;
      return json(toProfile(p));
    }
    if (sub === 'detail') {
      const c = coherenceOf(p);
      const populated = c.bins.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
      return json({
        profile: toProfile(p),
        seeds: p.seeds.map((s, i) => ({ id: s.id, idx: i + 1, title: s.title, year: s.year, coh: p.seeds.length >= 2 ? Number((0.93 + ((i * 7) % 5) * 0.006).toFixed(3)) : 0 })),
        topics: p.topics,
        sweep: [],
        coherenceBins: p.seeds.length >= 2 ? c.bins : [],
        coherenceStats: populated.length ? { min: populated[0] / 16, max: (populated[populated.length - 1] + 1) / 16 } : { min: 0, max: 0 },
        feedbackLog: p.feedback.map((f) => `${f.ts.slice(0, 16)} ${f.action.padEnd(9)} ${f.openalex_id} score=${f.score}`),
        feedbackMoreCount: 0,
      });
    }
    if (sub === 'recompute-coherence') {
      await new Promise((r) => window.setTimeout(r, 700));
      const c = coherenceFull(p);
      p.coherence = c.median;
      return json(c);
    }
    if (sub === 'recompute-topics') {
      await new Promise((r) => window.setTimeout(r, 700));
      return json(p.topics);
    }
    if (sub === 'refit') return json({ ok: true, key: p.slug, cost: '1.2 s · 9 vecs' });
    if (sub === 'dry-run') {
      const scores = p.candidates.map((c) => c.card.similarity ?? c.card.score);
      const band = seedBand(p);
      const sorted = [...scores].sort((x, y) => y - x);
      const suggested = scores.length >= 10 && band ? Number(Math.min(Math.max(band.min - 0.01, sorted[Math.floor(sorted.length * 0.25)]), sorted[Math.floor(sorted.length * 0.02)]).toFixed(3)) : band ? Number((band.min - 0.01).toFixed(3)) : null;
      const all = [...scores, ...(band ? [band.min, band.max] : [])];
      return json({ ok: true, key: p.slug, n: scores.length, scores, suggested_threshold: suggested, seed_similarity: band, score_range: all.length ? [Number((Math.min(...all) - 0.01).toFixed(3)), Number((Math.max(...all) + 0.005).toFixed(3))] : null });
    }
    if (sub.startsWith('gather-now')) {
      const days = Number(q.get('days') ?? 7);
      const limit = Number(q.get('limit') ?? 500);
      const run: MockRun = { id: st.nextId++, profile_id: p.id, started_at: nowIso(), finished_at: null, since_date: null, filter_string: null, tier_used: 'manual', n_fetched: null, n_new: null, n_redup: null, api_calls: null, error: null, current_step: null, n_processed: null, n_total: null, last_message: null };
      p.runs.unshift(run);
      startSim(st, p, run, { kind: 'scan', slug: p.slug, days, limit });
      return json({ ok: true, run_id: run.id });
    }
    if (sub === 'runs') return json(p.runs.slice(0, Number(q.get('limit') ?? 20)));
    if (sub === 'feedback') return json(p.feedback.map((f) => ({ ...f, profile_id: p.id, selector: 'centroid', selector_config_hash: null, benchmark_run_id: null })));
    if (sub === 'schedule') return json({ profile_id: p.id, cron: String(body?.cron ?? '0 4 * * *'), tz: String(body?.tz ?? 'UTC'), enabled: body?.enabled ?? true, updated_at: nowIso() });
    if (sub === 'reranker-comparison') {
      const cands = p.candidates.map((c, i) => ({ openalex_id: c.card.id, title: c.card.title, score_selector: c.card.similarity ?? c.card.score, score_blended: Number(((c.card.similarity ?? c.card.score) - 0.02 + ((i * 7) % 5) * 0.01).toFixed(3)), rank_before: i + 1, rank_after: ((i + 3) % p.candidates.length) + 1 }));
      return json({ ok: true, key: p.slug, n: cands.length, candidates: cands, avg_rank_change: 2.4, max_rank_up: 4, max_rank_down: 3, queries_used: ['neonatal monitoring', 'sepsis heart rate'] });
    }
    if (sub === 'topic-yield') {
      return json({ ok: true, key: p.slug, days: Number(q.get('days') ?? 30), topics: p.topics.map((t, i) => ({ topic_id: t.id, display_name: t.name, on: t.on, n_candidates: t.on ? 12 - i * 3 : 0, n_shown: t.on ? 8 - i * 2 : 0, n_saved: t.on && i === 0 ? 2 : 0, n_dismissed: i === 1 ? 3 : 0, last_fetched_at: t.on ? nowIso(-86400000 * (i + 1)) : null })) });
    }
    return err(404, `no route ${method} ${path}`);
  }

  // --- orcid import ---
  m = path.match(/^\/api\/import\/orcid\/([^/]+)\/works$/);
  if (m && method === 'GET') {
    const orcid = decodeURIComponent(m[1]).replace(/^https?:\/\/orcid\.org\//i, '').toUpperCase();
    if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcid)) return err(400, `'${orcid}' is not an ORCID iD (expected 0000-0000-0000-0000)`);
    // One ORCID with nothing on OpenAlex, everyone else gets a shelf of papers.
    if (orcid === '0000-0002-0000-0000') return json({ orcid, name: null, works: [] });
    const works = Array.from({ length: 10 }, (_, i) => ({
      openalex_id: `W7${orcid.slice(-4)}${i}`, doi: `10.1234/mock.${i}`, title: i === 1 ? `${pick(TITLES, 6)}: a deliberately long subtitle that keeps going so the pick list has to truncate it instead of widening the page` : pick(TITLES, i + 5), year: 2026 - (i % 6), venue: pick(VENUES, i), type: 'article',
      cited_by_count: Math.max(0, 40 - i * 4), authors: [orcid === '0000-0001-5643-4068' ? 'Nathan C. Sheffield' : 'Mock Researcher', pick(AUTHORS, i)], n_authors: 2 + (i % 5), author_position: i % 3 === 0 ? 'first' : 'middle',
    }));
    return json({ orcid, name: orcid === '0000-0001-5643-4068' ? 'Nathan C. Sheffield' : 'Mock Researcher', works });
  }
  if (path === '/api/import/orcid' && method === 'POST') {
    const orcid = String(body?.orcid ?? '').trim().replace(/^https?:\/\/orcid\.org\//i, '').toUpperCase();
    const ids = Array.isArray(body?.openalex_ids) ? (body!.openalex_ids as string[]) : [];
    if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcid)) return err(400, 'orcid must be an ORCID iD such as 0000-0001-5643-4068');
    if (ids.length === 0) return err(400, 'select at least one work to import');
    const name = String(body?.name ?? '').trim() || (orcid === '0000-0001-5643-4068' ? 'Nathan C. Sheffield' : 'Mock Researcher');
    let slug = slugify(name);
    if (findProfile(slug)) slug = `${slug}-${st.nextId}`;
    const p: MockProfile = { id: st.nextId++, slug, name, hue: 140, is_draft: true, threshold: 0, coherence: 0, seeds: [], topics: [], candidates: [], runs: [], feedback: [] };
    st.profiles.push(p);
    const run: MockRun = { id: st.nextId++, profile_id: p.id, started_at: nowIso(), finished_at: null, since_date: null, filter_string: null, tier_used: 'orcid_import', n_fetched: null, n_new: null, n_redup: null, api_calls: null, error: null, current_step: null, n_processed: null, n_total: null, last_message: null };
    p.runs.unshift(run);
    st.imports[run.id] = { slug, result: null };
    startSim(st, p, run, { kind: 'import', slug, ref: orcid, name });
    return json({ draft_slug: slug, run_id: run.id });
  }

  // --- prosopia works listing ---
  if (path === '/api/import/prosopia/works' && method === 'GET') {
    const ref = String(q.get('ref') ?? '').trim();
    if (!ref) return err(400, 'ref must be a non-empty slug, profile URL or ORCID');
    if (/unknown|missing/i.test(ref)) return err(404, `prosopia profile '${ref}' not found`);
    // Same rule as the backend: the segment after "profiles" in an API URL,
    // the first segment of a site URL, the bare value otherwise.
    const segs = ref.replace(/^https?:\/\/[^/]+\//i, '').split(/[?#]/)[0].split('/').filter(Boolean);
    const at = segs.indexOf('profiles');
    const slug = at >= 0 && segs[at + 1] ? segs[at + 1] : /^https?:/i.test(ref) ? (segs[0] ?? ref) : (segs[segs.length - 1] ?? ref);
    const works = Array.from({ length: 12 }, (_, i) => ({
      id: `${slug}-${2014 + i}-paper${i}`, title: i === 0 ? `${pick(TITLES, 3)}: a deliberately long subtitle that keeps going so the pick list has to truncate it instead of widening the page` : pick(TITLES, i + 3), year: 2025 - (i % 8), venue: pick(VENUES, i), doi: `10.1234/mock.${slug}.${i}`, openalex_id: `W9${i}${i}`,
      cited_by_count: Math.max(0, 60 - i * 5), authors: ['Nathan C. Sheffield', pick(AUTHORS, i), pick(AUTHORS, i + 2)], n_authors: 3 + (i % 4),
    }));
    return json({ slug, name: 'Nathan C. Sheffield', works });
  }

  // --- prosopia import ---
  if (path === '/api/import/prosopia' && method === 'POST') {
    const ref = String(body?.ref ?? '').trim();
    if (!ref) return err(422, 'ref is required');
    if (/unknown|missing/i.test(ref)) return err(404, `no Prosopia profile found for '${ref}'`);
    // ORCID refs resolve against the (one-entry) mock profile list, like the real client.
    const orcid = ref.replace(/^https?:\/\/orcid\.org\//i, '').toUpperCase();
    const isOrcid = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcid);
    if (isOrcid && orcid !== '0000-0001-5643-4068') return err(404, `no Prosopia profile with ORCID '${orcid}'`);
    const name = String(body?.name ?? '').trim() || (isOrcid ? 'Nathan C. Sheffield' : `Papers of ${ref.replace(/-/g, ' ')}`);
    let slug = slugify(name);
    if (findProfile(slug)) slug = `${slug}-${st.nextId}`;
    const p: MockProfile = { id: st.nextId++, slug, name, hue: 210, is_draft: true, threshold: 0, coherence: 0, seeds: [], topics: [], candidates: [], runs: [], feedback: [] };
    st.profiles.push(p);
    const run: MockRun = { id: st.nextId++, profile_id: p.id, started_at: nowIso(), finished_at: null, since_date: null, filter_string: null, tier_used: 'import', n_fetched: null, n_new: null, n_redup: null, api_calls: null, error: null, current_step: null, n_processed: null, n_total: null, last_message: null };
    p.runs.unshift(run);
    st.imports[run.id] = { slug, result: null };
    startSim(st, p, run, { kind: 'import', slug, ref, name });
    return json({ draft_slug: slug, run_id: run.id });
  }
  m = path.match(/^\/api\/import\/prosopia\/(\d+)$/);
  if (m) {
    const imp = st.imports[Number(m[1])];
    const run = [...st.profiles.flatMap((p) => p.runs), ...st.researcherRuns].find((r) => r.id === Number(m![1]));
    if (!imp || !run) return err(404, 'import run not found');
    return json({ run, result: imp.result });
  }

  // --- researchers ("profiles") ---
  if (path === '/api/researchers' && method === 'GET') return json(st.researchers.map((r) => toResearcher(st, r)));
  if (path === '/api/researchers/import' && method === 'POST') {
    const source = String(body?.source ?? '');
    const rawRef = String(body?.ref ?? '').trim();
    if (source !== 'prosopia' && source !== 'orcid') return err(400, 'source must be one of prosopia, orcid');
    if (!rawRef) return err(400, 'ref must be a non-empty slug, profile URL or ORCID');
    if (/unknown|missing/i.test(rawRef)) return err(404, `prosopia profile '${rawRef}' not found`);
    let key = rawRef;
    let name = 'Nathan C. Sheffield';
    if (source === 'orcid') {
      key = rawRef.replace(/^https?:\/\/orcid\.org\//i, '').toUpperCase();
      if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(key)) return err(400, 'orcid must be an ORCID iD such as 0000-0001-5643-4068');
      name = key === '0000-0001-5643-4068' ? 'Nathan C. Sheffield' : 'Mock Researcher';
    } else {
      const segs = rawRef.replace(/^https?:\/\/[^/]+\//i, '').split(/[?#]/)[0].split('/').filter(Boolean);
      const at = segs.indexOf('profiles');
      key = at >= 0 && segs[at + 1] ? segs[at + 1] : /^https?:/i.test(rawRef) ? (segs[0] ?? rawRef) : (segs[segs.length - 1] ?? rawRef);
    }
    const paperIds = Array.isArray(body?.paper_ids) ? (body!.paper_ids as string[]) : undefined;
    if (paperIds && paperIds.length === 0) return err(400, 'select at least one paper to import');
    const r = ensureResearcher(st, source, key, name);
    const run: MockRun = { id: st.nextId++, profile_id: 0, started_at: nowIso(), finished_at: null, since_date: null, filter_string: null, tier_used: 'researcher_import', n_fetched: null, n_new: null, n_redup: null, api_calls: null, error: null, current_step: null, n_processed: null, n_total: null, last_message: null };
    st.researcherRuns.unshift(run);
    r.last_run_id = run.id;
    st.imports[run.id] = { slug: '', result: null };
    startSim(st, null, run, { kind: 'rimport', slug: '', researcherId: r.id, paperIds });
    return json({ researcher_id: r.id, run_id: run.id });
  }
  m = path.match(/^\/api\/researchers\/(\d+)(?:\/(interests|suggestions))?$/);
  if (m) {
    const r = st.researchers.find((x) => x.id === Number(m![1]));
    if (!r) return err(404, `researcher ${m[1]} not found`);
    if (m[2] === 'suggestions') {
      const ps = r.papers;
      if (ps.length < 8) return json({ researcher_id: r.id, embedding_model: 'specter2', n_papers: ps.length, n_embedded: ps.length, n_grouped: ps.length, note: 'Fewer than 8 papers, so the one suggestion is all of them.', suggestions: ps.length === 0 ? [] : [{ name: 'Everything', paper_ids: ps.map((p) => p.id), loose_ids: [], topics: [], coherence_median: 0.9, agreement: 60, label: 'broad', seed_titles: ps.slice(0, 3).map((p) => p.title) }] });
      const a = ps.filter((_, i) => i % 3 !== 2);
      const b = ps.filter((_, i) => i % 3 === 2);
      const mk = (name: string, list: ResearcherPaper[], topics: string[], median: number, loose = 0) => ({ name, paper_ids: list.slice(0, list.length - loose).map((p) => p.id), loose_ids: list.slice(list.length - loose).map((p) => p.id), topics: topics.map((t, i) => ({ id: `T${i}`, name: t, count: list.length - i })), coherence_median: median, agreement: Math.round(100 * Math.max(0, Math.min(1, (median - 0.82) / 0.13))), label: median >= 0.9 ? 'focused' : 'broad', seed_titles: list.slice(0, 3).map((p) => p.title) });
      return json({ researcher_id: r.id, embedding_model: 'specter2', n_papers: ps.length, n_embedded: ps.length, n_grouped: a.length + b.length - 1, note: null, suggestions: [mk('Neonatal intensive care', a, ['Neonatal intensive care', 'Physiologic monitoring'], 0.928, 1), mk('Research data management', b, ['Research data management', 'Workflow provenance'], 0.905)] });
    }
    if (m[2] === 'interests' && method === 'POST') {
      const name = String(body?.name ?? '').trim();
      if (!name) return err(400, 'interest name must be non-empty');
      const wanted = Array.isArray(body?.openalex_ids) ? (body!.openalex_ids as string[]) : null;
      if (wanted && wanted.length === 0) return err(400, 'select at least one paper');
      const chosen = wanted ? r.papers.filter((p) => wanted.includes(p.id)) : r.papers;
      if (chosen.length === 0) return err(400, 'none of the selected papers belong to this researcher');
      let slug = slugify(name);
      if (findProfile(slug)) slug = `${slug}-${st.nextId}`;
      const p: MockProfile = { id: st.nextId++, slug, name, hue: (slug.length * 47) % 360, is_draft: true, researcher_id: r.id, threshold: 0, coherence: 0, seeds: chosen.map((c) => ({ id: c.id.replace('https://openalex.org/', ''), title: c.title, year: c.year ?? 0, coh: 0.7 })), topics: [], candidates: [], runs: [], feedback: [] };
      st.profiles.push(p);
      st.docs.push(...chosen.map((c, i) => ({ id: c.id, title: c.title, authors: c.authors, venue: c.venue ?? '—', tags: [slug], pages: 8 + (i % 5), chunks: 20, added: nowIso() })));
      return json({ draft: { slug, name }, n_seeds: chosen.length });
    }
    if (method === 'DELETE') {
      st.researchers = st.researchers.filter((x) => x !== r);
      st.researcherRuns = st.researcherRuns.filter((x) => x.id !== r.last_run_id);
      for (const p of st.profiles) if (p.researcher_id === r.id) p.researcher_id = null;
      return json({ ok: true });
    }
    if (method === 'GET') {
      return json({ researcher: toResearcher(st, r), expertise: r.expertise, soul: null, grants: r.grants, papers: r.papers, interests: st.profiles.filter((p) => p.researcher_id === r.id).map(toProfile) });
    }
  }
  m = path.match(/^\/api\/profiles\/draft\/([^/]+)\/seeds$/);
  if (m && method === 'POST') {
    const slug = decodeURIComponent(m[1]);
    const p = findProfile(slug);
    if (!p || !p.is_draft) return err(404, `draft '${slug}' not found for current user`);
    const ids = Array.isArray(body?.openalex_ids) ? (body!.openalex_ids as string[]) : [];
    if (ids.length === 0) return err(400, 'select at least one paper');
    let attached = 0;
    const rejected: string[] = [];
    for (const id of ids) {
      const paper = st.researchers.flatMap((r) => r.papers).find((x) => x.id === id);
      if (!paper) { rejected.push(id); continue; }
      if (p.seeds.some((s) => s.id === id.replace('https://openalex.org/', ''))) continue;
      p.seeds.push({ id: id.replace('https://openalex.org/', ''), title: paper.title, year: paper.year ?? 0, coh: 0.7 });
      st.docs.push({ id, title: paper.title, authors: paper.authors, venue: paper.venue ?? '—', tags: [slug], pages: 9, chunks: 20, added: nowIso() });
      attached += 1;
    }
    return json({ attached, rejected });
  }

  // --- radar ---
  if (path === '/api/radar/daily') {
    const prof = q.get('profile');
    const bucket = q.get('bucket');
    const cards: Card[] = [];
    const states: Record<string, 'saved' | 'dismissed' | null> = {};
    for (const p of st.profiles) {
      if (p.is_draft) continue;
      if (prof && prof !== 'all' && p.slug !== prof) continue;
      for (const c of p.candidates) {
        if (bucket && c.card.bucket !== bucket) continue;
        cards.push(c.card);
        if (c.saved) states[c.card.id] = 'saved';
        else if (c.dismissed) states[c.card.id] = 'dismissed';
      }
    }
    cards.sort((a, b) => b.score - a.score);
    const lastRun = st.profiles.flatMap((p) => p.runs).filter((r) => r.finished_at && !r.error).sort((a, b) => (a.finished_at! < b.finished_at! ? 1 : -1))[0];
    return json({ date: new Date().toDateString().toUpperCase(), fetchedAt: lastRun?.finished_at ?? '', fetchMs: 12, candidatesScored: cards.length, cards, states });
  }
  m = path.match(/^\/api\/radar\/cards\/(save|dismiss)$/);
  if (m) {
    const id = String(body?.card_id);
    for (const p of st.profiles) {
      const c = p.candidates.find((x) => x.card.id === id);
      if (!c) continue;
      if (m[1] === 'save') { c.saved = !c.saved; if (c.saved) c.dismissed = false; }
      else { c.dismissed = !c.dismissed; if (c.dismissed) c.saved = false; }
      if (c.saved || c.dismissed) p.feedback.unshift({ id: st.nextId++, openalex_id: id, doi: c.card.doi, action: c.saved ? 'saved' : 'dismissed', score: c.card.score, ts: nowIso() });
      return json({ id, state: c.saved ? 'saved' : c.dismissed ? 'dismissed' : null });
    }
    return err(404, `card '${id}' not found for current user`);
  }

  // --- vault ---
  if (path === '/api/vault/docs') {
    const tag = q.get('tag');
    return json(tag ? st.docs.filter((d) => d.tags.includes(tag)) : st.docs);
  }
  if (path === '/api/vault/stats') return json({ docs: st.docs.length, pages: st.docs.reduce((a, d) => a + d.pages, 0), chunks: st.docs.reduce((a, d) => a + d.chunks, 0), lastIngest: st.docs[st.docs.length - 1]?.added ?? '' });
  if (path === '/api/vault/meta') return json({ rootPath: `/vault/${email}`, indexPath: `/chroma/${email}`, chunkSize: '800 chars · 120 overlap', lastIngest: st.docs[st.docs.length - 1]?.added ?? '' });
  if (path === '/api/vault/tags') {
    const counts: Record<string, number> = {};
    for (const d of st.docs) for (const t of d.tags) counts[t] = (counts[t] ?? 0) + 1;
    return json(counts);
  }
  if (path === '/api/vault/upload' && method === 'POST') {
    const file = form?.get('file');
    const slug = form?.get('profile_slug');
    if (!(file instanceof File)) return err(422, 'file is required');
    if (!/\.pdf$/i.test(file.name)) return err(415, `${file.name}: only PDF files are accepted`);
    await new Promise((r) => window.setTimeout(r, 900));
    const title = file.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ');
    const doc: VaultDoc = { id: `doc-${st.nextId++}`, title, authors: ['Uploaded'], venue: '—', tags: typeof slug === 'string' && slug ? [slug] : [], pages: 6 + (file.size % 20), chunks: 20 + (file.size % 50), added: nowIso() };
    st.docs.push(doc);
    if (typeof slug === 'string' && slug) {
      const p = findProfile(slug);
      if (p) p.seeds.push({ id: `W${doc.id}`, title, year: 2025, coh: 0.7 });
    }
    return json(doc);
  }

  // --- chat ---
  if (path === '/api/chat/history' && method === 'GET') return json(st.chat);
  if (path === '/api/chat/history' && method === 'DELETE') { const n = st.chat.length; st.chat = []; return json({ deleted: n }); }
  if (path === '/api/chat/providers') return json({ default: 'anthropic', available: [{ id: 'anthropic', model: 'claude-sonnet-5', configured: true }, { id: 'ollama', model: 'llama3.1', configured: false }, { id: 'openai', model: 'gpt-4o', configured: false }] });
  if (path === '/api/chat' && method === 'POST') {
    const query = String(body?.query ?? '');
    const scope = (body?.scope as string[]) ?? [];
    const t = new Date().toTimeString().slice(0, 5);
    await new Promise((r) => window.setTimeout(r, 1500));
    if (/error/i.test(query)) return err(503, 'LLM provider unreachable (mock).');
    const docs = scope.length ? st.docs.filter((d) => d.tags.some((x) => scope.includes(x))) : st.docs;
    const reply: ChatTurn = { who: 'assistant', t, body: [`Across ${docs.length} documents in scope, the most relevant passages are cited below [1]${docs.length > 1 ? '[2]' : ''}.`, 'This is a mock answer; the real backend runs retrieval over your vault.'], sources: docs.slice(0, 3).map((d, i) => ({ n: i + 1, title: d.title, score: Number((0.8 - i * 0.1).toFixed(2)), text: i < 2 ? `Excerpt from "${d.title}" that supports the answer ...` : undefined })) };
    st.chat.push({ who: 'user', t, body: query }, reply);
    return json(reply);
  }

  return err(404, `no mock route for ${method} ${path}`);
}

export function installMock(): void {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(urlStr, window.location.origin);
    if (!url.pathname.startsWith('/api/')) return realFetch(input, init);
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers ?? {});
    const email = headers.get('X-User-Email');
    await new Promise((r) => window.setTimeout(r, 120 + Math.random() * 180));
    const failing = failPatterns.findIndex((re) => re.test(`${method} ${url.pathname}`));
    if (failing >= 0) {
      failPatterns.splice(failing, 1);
      saveFailPatterns();
      return err(500, `Simulated failure for ${method} ${url.pathname}`);
    }
    try {
      return await handle(method, url, init, email);
    } catch (e) {
      return err(500, e instanceof Error ? e.message : String(e));
    } finally {
      if (method !== 'GET') persistStates();
    }
  };
  (window as unknown as { __radarMock: unknown }).__radarMock = {
    failNext: (pattern: string) => {
      failPatterns.push(new RegExp(pattern));
      saveFailPatterns();
    },
    state: (email: string) => stateFor(email),
  };
  failPatterns = loadFailPatterns();
  restoreStates();
  // eslint-disable-next-line no-console
  console.info('[radar] mock backend installed (VITE_USE_MOCK=1)');
}
