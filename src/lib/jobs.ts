/**
 * Background job tracker.
 *
 * Scans, dry-runs and Prosopia imports run on the server for minutes.
 * This store remembers every job the user started (sessionStorage, so a
 * reload keeps it), polls each running one, and tells the rest of the
 * app when something finishes. Pages render ``useJobs()`` in a status
 * strip so "what is happening right now" is always visible.
 */
import { useSyncExternalStore } from 'react';
import { gatherNow, listProfileRuns, type GatherRunStatus } from '../api/endpoints/profiles';
import { getProsopiaImportStatus, startOrcidImport as postOrcidImport, startProsopiaImport } from '../api/endpoints/prosopia';
import { startResearcherImport as postResearcherImport } from '../api/endpoints/researchers';
import type { ResearcherSource } from '../types/researchers';
import { getDraftDryRunStatus, startDraftDryRun, type DraftDryRun } from '../api/endpoints/wizard';
import type { ProsopiaImportResult } from '../types/prosopia';
import { errorMessage } from './format';
import { invalidate } from './query';
import { toast } from './toast';

export type JobKind = 'scan' | 'dryrun' | 'import';
export type JobStatus = 'running' | 'done' | 'error';

export interface Job {
  id: string;
  kind: JobKind;
  runId: number;
  /** Interest slug (draft slug for imports / dry-runs), or ``researcher:<id>`` for a profile import. */
  profileKey: string;
  profileName: string;
  /** Set for an import into a stored profile rather than a draft. */
  researcherId?: number | null;
  startedAt: number;
  finishedAt: number | null;
  status: JobStatus;
  step: string | null;
  nProcessed: number | null;
  nTotal: number | null;
  message: string | null;
  /** When the current step began and what ``nProcessed`` read then — the
   *  base for the rate / time-left estimate in ``jobEstimate``. */
  stepStartedAt: number | null;
  stepBase: number | null;
  error: string | null;
  /** One line for the status strip once finished. */
  summary: string | null;
  /** Payload the starting page needs (dry-run scores, import counts). */
  result: DraftDryRun | ProsopiaImportResult | null;
  /** Scan window, for the summary. */
  days: number | null;
  dismissed: boolean;
}

const STORAGE_KEY = 'radar.jobs.v1';
const POLL_MS = 2500;
const KEEP_FINISHED_MS = 60 * 60 * 1000;
const MAX_POLL_FAILURES = 6;

const STEP_LABELS: Record<JobKind, Record<string, string>> = {
  scan: {
    loading_profile: 'Loading interest',
    fetching: 'Querying OpenAlex',
    embedding: 'Embedding candidates',
    reranking: 'Reranking',
    persisting: 'Saving results',
    done: 'Done',
  },
  dryrun: {
    loading_profile: 'Loading seeds',
    fetching: 'Querying OpenAlex',
    embedding: 'Embedding candidates',
    persisting: 'Finishing',
    done: 'Done',
  },
  import: {
    fetching_profile: 'Fetching profile',
    resolving: 'Resolving papers',
    embedding: 'Embedding seeds',
    attaching: 'Attaching seeds',
    done: 'Done',
  },
};

export function stepLabel(job: Pick<Job, 'kind' | 'step' | 'status'>): string {
  if (job.status === 'done') return 'Done';
  if (job.status === 'error') return 'Failed';
  if (!job.step) return 'Starting';
  return STEP_LABELS[job.kind][job.step] ?? job.step.replace(/_/g, ' ');
}

export function kindLabel(kind: JobKind): string {
  return kind === 'scan' ? 'Scan' : kind === 'dryrun' ? 'Trial scan' : 'Import';
}

let jobs: Job[] = load();
const listeners = new Set<() => void>();
const failures = new Map<string, number>();
const inflight = new Set<string>();
let timer: number | null = null;

function load(): Job[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Job[];
    const cutoff = Date.now() - KEEP_FINISHED_MS;
    return parsed.filter((j) => j.status === 'running' || (j.finishedAt ?? 0) > cutoff);
  } catch {
    return [];
  }
}

function persist() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch {
    /* ignore quota errors */
  }
}

function setJobs(next: Job[]) {
  jobs = next;
  persist();
  listeners.forEach((l) => l());
  ensurePolling();
}

function patch(id: string, p: Partial<Job>) {
  setJobs(jobs.map((j) => (j.id === id ? { ...j, ...p } : j)));
}

function ensurePolling() {
  const anyRunning = jobs.some((j) => j.status === 'running');
  if (anyRunning && timer === null) {
    timer = window.setInterval(tick, POLL_MS);
    void tick();
  } else if (!anyRunning && timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

async function tick() {
  for (const job of jobs) {
    if (job.status !== 'running' || inflight.has(job.id)) continue;
    inflight.add(job.id);
    void pollOne(job).finally(() => inflight.delete(job.id));
  }
}

function progressFrom(job: Job, run: GatherRunStatus): Partial<Job> {
  const p: Partial<Job> = {
    step: run.current_step,
    nProcessed: run.n_processed,
    nTotal: run.n_total,
    message: run.last_message,
  };
  // A new step restarts the clock: the rate of "embedding" says nothing
  // about "fetching", and a counter that reset would give a negative rate.
  const reset = run.current_step !== job.step || job.stepStartedAt == null || (run.n_processed ?? 0) < (job.stepBase ?? 0);
  if (reset) {
    p.stepStartedAt = Date.now();
    p.stepBase = run.n_processed ?? 0;
  }
  return p;
}

export interface JobEstimate {
  /** Items per second over the current step. */
  perSec: number;
  /** Seconds until the current step's ``nTotal`` at that rate. */
  secondsLeft: number | null;
}

/** Live throughput for a running job, or null until there is enough signal. */
export function jobEstimate(job: Job, now = Date.now()): JobEstimate | null {
  if (job.status !== 'running' || job.stepStartedAt == null || job.stepBase == null || job.nProcessed == null) return null;
  const done = job.nProcessed - job.stepBase;
  const elapsed = (now - job.stepStartedAt) / 1000;
  if (done < 5 || elapsed < 3) return null;
  const perSec = done / elapsed;
  const left = job.nTotal != null && job.nTotal > job.nProcessed ? (job.nTotal - job.nProcessed) / perSec : null;
  return { perSec, secondsLeft: left };
}

export function fmtSeconds(s: number): string {
  const r = Math.max(0, Math.round(s));
  if (r < 60) return `${r}s`;
  const m = Math.floor(r / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${r % 60}s`;
}

async function pollOne(job: Job) {
  try {
    if (job.kind === 'scan') {
      const runs = await listProfileRuns(job.profileKey, 10);
      const run = runs.find((r) => r.id === job.runId);
      if (!run) throw new Error('run not found');
      if (!run.finished_at) {
        patch(job.id, progressFrom(job, run));
        return;
      }
      if (run.error) return fail(job, run.error);
      const fetched = run.n_fetched ?? 0;
      const fresh = run.n_new ?? 0;
      finish(job, {
        summary: `${fetched.toLocaleString()} papers found, ${fresh.toLocaleString()} new`,
        result: null,
      });
      invalidate('radar', 'profiles');
      toast.success(`Scan of "${job.profileName}" finished: ${fresh} new papers.`);
      return;
    }
    if (job.kind === 'dryrun') {
      const status = await getDraftDryRunStatus(job.profileKey, job.runId);
      if (!status.run.finished_at) {
        patch(job.id, progressFrom(job, status.run));
        return;
      }
      if (status.run.error) return fail(job, status.run.error);
      if (!status.result) return fail(job, 'The trial scan finished without a result.');
      finish(job, {
        summary: `${status.result.scores.length.toLocaleString()} candidates scored`,
        result: status.result,
      });
      return;
    }
    const status = await getProsopiaImportStatus(job.runId);
    if (!status.run.finished_at) {
      patch(job.id, progressFrom(job, status.run));
      return;
    }
    if (status.run.error) return fail(job, status.run.error);
    const result = status.result;
    const n = typeof result?.drafted === 'number' ? result.drafted : (result?.n_seeds as number | undefined);
    finish(job, {
      summary: n != null ? `${n} ${job.researcherId != null ? 'papers' : 'seeds'} imported` : 'Import finished',
      result: result ?? null,
      profileName: job.researcherId != null ? job.profileName : ((result?.name as string | undefined) ?? job.profileName),
    });
    invalidate('profiles', 'vault', 'researchers');
    if (job.researcherId != null) toast.success(`Profile "${job.profileName}" imported${n != null ? `: ${n} papers` : ''}.`);
  } catch (e) {
    const n = (failures.get(job.id) ?? 0) + 1;
    failures.set(job.id, n);
    if (n >= MAX_POLL_FAILURES) {
      fail(job, `Lost contact with the job: ${errorMessage(e)}`);
    }
  }
}

function finish(job: Job, p: Partial<Job>) {
  failures.delete(job.id);
  patch(job.id, { ...p, status: 'done', finishedAt: Date.now(), step: 'done', error: null });
}

function fail(job: Job, error: string) {
  failures.delete(job.id);
  patch(job.id, { status: 'error', error, finishedAt: Date.now() });
  toast.error(`${kindLabel(job.kind)} of "${job.profileName}" failed: ${error}`);
}

function add(job: Job): Job {
  setJobs([...jobs.filter((j) => j.id !== job.id), job]);
  return job;
}

function base(kind: JobKind, runId: number, profileKey: string, profileName: string): Job {
  return {
    id: `${kind}:${profileKey}:${runId}`,
    kind,
    runId,
    profileKey,
    profileName,
    startedAt: Date.now(),
    finishedAt: null,
    status: 'running',
    step: null,
    nProcessed: null,
    nTotal: null,
    message: null,
    stepStartedAt: null,
    stepBase: null,
    error: null,
    summary: null,
    result: null,
    days: null,
    dismissed: false,
  };
}

// --- public API -------------------------------------------------------------

export async function startScan(
  profile: { key: string; name: string },
  opts: { days: number; limit: number },
): Promise<Job> {
  const { run_id } = await gatherNow(profile.key, opts);
  invalidate(`profiles/${profile.key}/runs`);
  return add({ ...base('scan', run_id, profile.key, profile.name), days: opts.days });
}

export async function startDryRun(slug: string, name: string, days = 30): Promise<Job> {
  const { run_id } = await startDraftDryRun(slug, days);
  return add({ ...base('dryrun', run_id, slug, name), days });
}

export async function startImport(ref: string, name?: string, paperIds?: string[]): Promise<Job> {
  const start = await startProsopiaImport({ ref, ...(name ? { name } : {}), ...(paperIds ? { paper_ids: paperIds } : {}) });
  return add(base('import', start.run_id, start.draft_slug, name || ref));
}

export async function startOrcidImport(orcid: string, openalexIds: string[], name?: string): Promise<Job> {
  const start = await postOrcidImport({ orcid, openalex_ids: openalexIds, ...(name ? { name } : {}) });
  return add(base('import', start.run_id, start.draft_slug, name || orcid));
}

/** Import (or refresh) a stored profile. Polled like any import; no draft is created. */
export async function startResearcherImport(source: ResearcherSource, ref: string, name: string, paperIds?: string[]): Promise<Job> {
  const start = await postResearcherImport({ source, ref, ...(paperIds ? { paper_ids: paperIds } : {}) });
  return add({ ...base('import', start.run_id, `researcher:${start.researcher_id}`, name || ref), researcherId: start.researcher_id });
}

export function researcherJobKey(id: number): string {
  return `researcher:${id}`;
}

export function dismissJob(id: string) {
  patch(id, { dismissed: true });
}

export function clearFinishedJobs() {
  setJobs(jobs.filter((j) => j.status === 'running'));
}

export function findJob(id: string | null | undefined): Job | undefined {
  return id ? jobs.find((j) => j.id === id) : undefined;
}

export function runningJob(kind: JobKind, profileKey: string): Job | undefined {
  return jobs.find((j) => j.kind === kind && j.profileKey === profileKey && j.status === 'running');
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useJobs(): Job[] {
  return useSyncExternalStore(subscribe, () => jobs, () => jobs);
}

export function useJob(id: string | null | undefined): Job | undefined {
  const all = useJobs();
  return id ? all.find((j) => j.id === id) : undefined;
}

export function useRunningJob(kind: JobKind, profileKey: string | null): Job | undefined {
  const all = useJobs();
  return profileKey
    ? all.find((j) => j.kind === kind && j.profileKey === profileKey && j.status === 'running')
    : undefined;
}

if (typeof window !== 'undefined') ensurePolling();
