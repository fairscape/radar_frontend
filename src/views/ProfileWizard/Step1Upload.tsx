import { useEffect, useRef, useState } from 'react';
import type { VaultDoc } from '../../types/radar';
import {
  createDraft,
  createDraftFromOrcid,
  createDraftFromProfile,
  deleteDraft,
  getOrcidImportStatus,
  listDraftSeeds,
  listDraftWorks,
  selectDraftSeeds,
  listSeedDocs,
  uploadSeed,
  type OrcidImportResult,
  type OrcidWork,
  type RpDraftStart,
} from '../../api/endpoints/wizard';
import { ApiError } from '../../api/client';
import { useDraft, type DraftMode } from '../../api/hooks/useDraft';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { normalizeOrcidInput, previewProfile } from '../../lib/profilePreview';
import { WorkPicker } from './WorkPicker';

interface Props {
  onNext: () => void;
}

const POLL_MS = 2500;
// Consecutive poll failures tolerated before giving up (Cloudflare hiccups
// during a multi-minute import are normal).
const POLL_MAX_ERRORS = 3;
// No progress write for this long → the job is probably gone (server
// restart drops APScheduler's in-memory jobs).
const STALL_MS = 120_000;
const IMPORT_STEP_LABEL: Record<string, string> = {
  parse_profile: 'Reading the profile document',
  fetch_author: 'Resolving author on OpenAlex',
  fetch_works: 'Fetching works from OpenAlex',
  store_works: 'Storing the works',
  embedding: 'Embedding seed papers',
  attach_seeds: 'Attaching seeds',
  topics: 'Aggregating concepts (OpenAlex topics)',
  write_rp: 'Writing researcher-profile files',
  rp_signals: 'Applying the profile\'s expertise and not-interests',
  done: 'Done',
};

interface ImportProgress {
  step: string | null;
  nProcessed: number | null;
  nTotal: number | null;
  message: string | null;
  stalled: boolean;
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: 8,
  fontFamily: 'var(--font-mono)',
  background: 'var(--bg-inset)',
  color: 'var(--fg)',
  border: '1px solid var(--line-strong)',
};

export function Step1Upload({ onNext }: Props) {
  const {
    state,
    setSlug,
    addSeed,
    removeSeed,
    setSeeds,
    setMode,
    setOrcidImport,
    setWorksReady,
    setSeedRun,
    setProfileImport,
    setImportDone,
    reset,
  } = useDraft();
  // Seed picker (phase B of an ORCID / profile import).
  const [works, setWorks] = useState<OrcidWork[] | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [fetchResult, setFetchResult] = useState<OrcidImportResult | null>(null);
  const [profileText, setProfileText] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(state.name);
  const [orcidInput, setOrcidInput] = useState(state.orcid ?? '');
  const [mailto, setMailto] = useState<string>(() => {
    try {
      return window.localStorage.getItem('userEmail') ?? '';
    } catch {
      return '';
    }
  });
  const [creating, setCreating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    total: number;
    done: number;
    currentName: string | null;
    failures: { name: string; message: string }[];
  } | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importResult, setImportResult] = useState<OrcidImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // START OVER deletes the draft; like CANCEL, it asks first.
  const [confirmStartOver, setConfirmStartOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pollRef = useRef<number | null>(null);

  const isOrcid = state.mode === 'orcid';
  const isProfile = state.mode === 'profile';
  // The ORCID progress/seeds panel serves both imports; a profile without
  // an ORCID never gets a run and behaves like PDF mode from here on.
  const usesImport = isOrcid || (isProfile && state.importRunId !== null);

  // PDF mode: refresh staged seeds from the vault listing when we already
  // have a slug (handles reload partway through the wizard).
  useEffect(() => {
    if (!state.slug || usesImport) return;
    let cancelled = false;
    listSeedDocs(state.slug)
      .then((docs) => {
        if (!cancelled) setSeeds(docs);
      })
      .catch(() => {
        /* a fresh draft has no docs yet — silently ignore. */
      });
    return () => {
      cancelled = true;
    };
  }, [state.slug, usesImport, setSeeds]);

  // Stop polling on unmount.
  useEffect(
    () => () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    },
    [],
  );

  // ORCID / profile mode: poll the active import run until it finishes
  // (also resumes after a reload, since the run ids live in localStorage).
  // Phase A (importRunId) fetches the works and opens the picker; phase B
  // (seedRunId) embeds the chosen ones and attaches them as seeds.
  useEffect(() => {
    if (!usesImport || !state.slug || state.importRunId === null) return;
    const slug = state.slug;
    const seedRun = state.seedRunId;
    const runId = seedRun ?? state.importRunId;
    const phase: 'fetch' | 'seed' = seedRun !== null ? 'seed' : 'fetch';
    let cancelled = false;
    let errors = 0;

    const loadWorks = async () => {
      try {
        const rows = await listDraftWorks(slug);
        if (cancelled) return;
        setWorks(rows);
        // Resume the user's confirmed choice when there is one, else the rule's pick.
        const chosen = rows.some((w) => w.selected !== null)
          ? rows.filter((w) => w.selected).map((w) => w.openalex_id)
          : rows.filter((w) => w.default_selected).map((w) => w.openalex_id);
        setSelection(new Set(chosen));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    const loadSeeds = async () => {
      try {
        const seeds = await listDraftSeeds(slug);
        if (!cancelled) setSeeds(seeds);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };

    // Reload after everything finished: re-hydrate, no polling.
    if (state.importDone) {
      if (state.seeds.length === 0) loadSeeds();
      if (works === null) loadWorks();
      getOrcidImportStatus(slug, runId)
        .then((st) => {
          // A draft adopted from the server carries only the fetch run's id;
          // its result describes the fetch, not the seeds.
          if (!cancelled && st.result && st.result.phase !== 'fetch') setImportResult(st.result);
        })
        .catch(() => {
          /* result panel is optional after a reload */
        });
      return () => {
        cancelled = true;
      };
    }
    // Reload while the picker was open: works are on the server already.
    if (phase === 'fetch' && state.worksReady) {
      if (works === null) loadWorks();
      return () => {
        cancelled = true;
      };
    }

    const stop = () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    const tick = async () => {
      try {
        const status = await getOrcidImportStatus(slug, runId);
        if (cancelled) return;
        errors = 0;
        const run = status.run;
        if (run.finished_at) {
          stop();
          setImportProgress(null);
          if (run.error) {
            setError(run.error);
            if (phase === 'seed') setSeedRun(null);
            return;
          }
          if (phase === 'fetch') {
            setFetchResult(status.result);
            setWorksReady(true);
            await loadWorks();
          } else {
            setImportResult(status.result);
            setPicking(false);
            setImportDone(true);
            await loadSeeds();
          }
          return;
        }
        const ref = run.progress_updated_at ?? run.started_at;
        const stalled = ref ? Date.now() - new Date(ref).getTime() > STALL_MS : false;
        setImportProgress({
          step: run.current_step,
          nProcessed: run.n_processed,
          nTotal: run.n_total,
          message: run.last_message,
          stalled,
        });
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          stop();
          setError('this draft no longer exists on the server (removed or committed elsewhere)');
          setImportProgress(null);
          return;
        }
        errors += 1;
        if (errors >= POLL_MAX_ERRORS) {
          stop();
          setError(e instanceof Error ? e.message : String(e));
          setImportProgress(null);
        }
      }
    };

    setImportProgress({ step: null, nProcessed: null, nTotal: null, message: null, stalled: false });
    tick();
    pollRef.current = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      stop();
    };
    // state.seeds.length / works are intentionally not dependencies: the loaders change them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usesImport, state.slug, state.importRunId, state.seedRunId, state.worksReady, state.importDone,
      setSeeds, setImportDone, setWorksReady, setSeedRun]);

  async function handleConfirmSeeds() {
    if (!state.slug || selection.size === 0) return;
    setError(null);
    setConfirming(true);
    try {
      const start = await selectDraftSeeds(state.slug, Array.from(selection));
      setSeedRun(start.run_id);
      setPicking(false);
    } catch (e) {
      if (e instanceof ApiError && e.body && typeof e.body === 'object' && 'detail' in e.body) {
        const d = (e.body as { detail: unknown }).detail;
        setError(typeof d === 'string' ? d : JSON.stringify(d));
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setConfirming(false);
    }
  }

  async function handleCreate() {
    if (!name.trim()) {
      setError('topic name is required');
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const draft = await createDraft({ name: name.trim() });
      setSlug(draft.slug, draft.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateFromOrcid() {
    const orcid = normalizeOrcidInput(orcidInput);
    if (!orcid) {
      setError('ORCID must look like 0000-0000-0000-000X (the orcid.org URL is fine too)');
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const start = await createDraftFromOrcid({
        orcid,
        name: name.trim() || undefined,
        mailto: mailto.trim() || undefined,
      });
      setSlug(start.slug, start.name);
      setOrcidImport(orcid, start.run_id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const detail = (
          e.body as { detail?: { slug?: string; run_id?: number; message?: string } } | null
        )?.detail;
        if (detail?.slug && typeof detail.run_id === 'number') {
          // An import of this ORCID is already running: attach to it.
          setSlug(detail.slug, name.trim() || detail.slug);
          setOrcidImport(orcid, detail.run_id);
          return;
        }
      }
      if (e instanceof ApiError && e.body && typeof e.body === 'object' && 'detail' in e.body) {
        const d = (e.body as { detail: unknown }).detail;
        setError(typeof d === 'string' ? d : JSON.stringify(d));
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateFromProfile() {
    const { preview, error: pre } = previewProfile(profileText);
    if (!preview) {
      setError(pre ?? 'paste a profile.jsonld document first');
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const start: RpDraftStart = await createDraftFromProfile({
        profile_json: profileText,
        name: name.trim() || undefined,
        mailto: mailto.trim() || undefined,
      });
      setSlug(start.slug, start.name);
      setProfileImport(start.orcid, start.run_id);
      setProfileText('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const detail = (
          e.body as { detail?: { slug?: string; run_id?: number; message?: string } } | null
        )?.detail;
        if (detail?.slug && typeof detail.run_id === 'number') {
          setSlug(detail.slug, name.trim() || detail.slug);
          setProfileImport(preview.orcid, detail.run_id);
          return;
        }
      }
      if (e instanceof ApiError && e.body && typeof e.body === 'object' && 'detail' in e.body) {
        const d = (e.body as { detail: unknown }).detail;
        setError(typeof d === 'string' ? d : JSON.stringify(d));
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  function handleProfileFile(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setProfileText(typeof reader.result === 'string' ? reader.result : '');
      setError(null);
    };
    reader.onerror = () => setError(`could not read ${f.name}`);
    reader.readAsText(f);
  }

  function handleStartOver() {
    setConfirmStartOver(true);
  }

  function performStartOver() {
    // Drop the server-side draft and the remembered wizard state so the
    // user lands back on the mode picker (e.g. to switch to FROM ORCID).
    setConfirmStartOver(false);
    setWorks(null);
    setSelection(new Set());
    setPicking(false);
    setFetchResult(null);
    setImportResult(null);
    const slug = state.slug;
    if (slug) {
      deleteDraft(slug).catch(() => {
        /* already gone — nothing to clean up */
      });
    }
    reset();
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !state.slug) return;
    const list = Array.from(files);
    setError(null);
    const failures: { name: string; message: string }[] = [];
    setUploadProgress({
      total: list.length,
      done: 0,
      currentName: list[0]?.name ?? null,
      failures: [],
    });
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        setUploadProgress((prev) =>
          prev ? { ...prev, currentName: file.name } : prev,
        );
        try {
          const doc = await uploadSeed(file, state.slug);
          addSeed(doc);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          failures.push({ name: file.name, message: msg });
          setError(`${file.name}: ${msg}`);
        }
        setUploadProgress((prev) =>
          prev
            ? {
                ...prev,
                done: i + 1,
                currentName: list[i + 1]?.name ?? null,
                failures: [...failures],
              }
            : prev,
        );
      }
    } finally {
      setUploadProgress(null);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  // ------------------------------------------------------------------
  // Phase A — no draft yet: pick a mode, name it, create.
  // ------------------------------------------------------------------
  if (!state.slug) {
    return (
      <div className="section">
        <h3>
          Step 1 — Seed your topic <span className="hr" />
        </h3>
        <ModeToggle
          mode={state.mode}
          onChange={(m) => {
            setError(null);
            setMode(m);
          }}
        />

        {state.mode === 'pdf' ? (
          <>
            <div className="mono" style={{ color: 'var(--fg-3)', marginBottom: 12 }}>
              A draft topic is created on the server so seeds can attach to it.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                }}
                placeholder="e.g. neonatal vitals"
                style={inputStyle}
              />
              <button className="btn primary" disabled={creating} onClick={handleCreate}>
                {creating ? 'CREATING…' : 'CREATE DRAFT'}
              </button>
            </div>
            {/* Embedder/selector dropdowns hidden — upload always uses the
                server default (specter2 + centroid). Showing them caused
                profile ↔ upload embedding model mismatches. */}
          </>
        ) : state.mode === 'orcid' ? (
          <>
            <div className="mono" style={{ color: 'var(--fg-3)', marginBottom: 12 }}>
              The researcher's publications are fetched from OpenAlex; their
              first/last/corresponding-author papers become the seeds and their
              OpenAlex topics the starting concept list.
            </div>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
              <input
                value={orcidInput}
                onChange={(e) => setOrcidInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFromOrcid();
                }}
                placeholder="ORCID · 0000-0001-5643-4068"
                style={inputStyle}
                autoFocus
              />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="topic name (optional — defaults to the researcher's name)"
                style={inputStyle}
              />
              <input
                value={mailto}
                onChange={(e) => setMailto(e.target.value)}
                placeholder="contact email for OpenAlex's polite pool (optional)"
                style={inputStyle}
              />
              <button
                className="btn primary"
                disabled={creating}
                onClick={handleCreateFromOrcid}
                style={{ justifySelf: 'end' }}
              >
                {creating ? 'RESOLVING…' : 'FETCH FROM ORCID'}
              </button>
            </div>
          </>
        ) : (
          <ProfileForm
            text={profileText}
            onText={(t) => {
              setProfileText(t);
              setError(null);
            }}
            onFile={handleProfileFile}
            fileRef={fileRef}
            name={name}
            onName={setName}
            mailto={mailto}
            onMailto={setMailto}
            creating={creating}
            onSubmit={handleCreateFromProfile}
          />
        )}
        {error && <ErrorLine text={error} />}
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Phase B (ORCID) — import progress + resulting seeds.
  // ------------------------------------------------------------------
  if (usesImport) {
    const done = state.importDone && !error;
    const running = importProgress !== null;
    const showPicker = !running && state.worksReady && (!state.importDone || picking) && !error;
    return (
      <div className="section">
      {confirmStartOver && (
        <ConfirmDialog
          title="START OVER?"
          confirmLabel="DISCARD & START OVER"
          onConfirm={performStartOver}
          onCancel={() => setConfirmStartOver(false)}
        >
          <p>
            This deletes <strong>{state.name || state.slug}</strong>
            {state.seeds.length > 0
              ? ` and its ${state.seeds.length} seed${state.seeds.length === 1 ? '' : 's'}`
              : ''}
            {usesImport && !state.importDone ? ' and stops the running import' : ''}
            , then returns to choosing PDFs, ORCID or a profile.
          </p>
          <p className="dim">To keep it for later, use CANCEL and choose KEEP DRAFT instead.</p>
        </ConfirmDialog>
      )}
        <h3>
          Step 1 — Seeds from {isProfile ? 'profile' : 'ORCID'} <span className="hr" />
          <span
            className="mono"
            style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.08em' }}
          >
            DRAFT · {state.slug} · {state.orcid}
          </span>
        </h3>

        {importProgress && (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              border: '1px dashed var(--line-strong)',
              background: 'var(--bg-inset)',
              color: 'var(--fg-3)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              letterSpacing: '0.08em',
            }}
          >
            <div>
              <span className="run-spinner" />{' '}
              {(importProgress.step && IMPORT_STEP_LABEL[importProgress.step]) ?? 'Starting import'}
              {importProgress.nTotal != null && importProgress.nProcessed != null && (
                <span style={{ color: 'var(--fg-4)' }}>
                  {' · '}{importProgress.nProcessed} / {importProgress.nTotal}
                </span>
              )}
            </div>
            {importProgress.message && (
              <div style={{ marginTop: 6, color: 'var(--fg-4)', letterSpacing: 0, fontSize: 11 }}>
                {importProgress.message}
              </div>
            )}
            <div
              style={{
                marginTop: 8,
                height: 3,
                background: 'var(--line)',
                position: 'relative',
                maxWidth: 360,
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              {importProgress.nTotal != null &&
                importProgress.nProcessed != null &&
                importProgress.nTotal > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      height: '100%',
                      width: `${(importProgress.nProcessed / importProgress.nTotal) * 100}%`,
                      background: 'var(--fg-3)',
                      transition: 'width 200ms linear',
                    }}
                  />
                )}
            </div>
            {importProgress.stalled && (
              <div style={{ marginTop: 8, color: 'var(--warn)', fontSize: 11, letterSpacing: 0 }}>
                No progress for a while — the server may have restarted. You can
                cancel and start again.
              </div>
            )}
          </div>
        )}

        {showPicker && (
          <>
            {fetchResult && (
              <div className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 8 }}>
                {fetchResult.author.display_name}
                {fetchResult.author.institution ? ` · ${fetchResult.author.institution}` : ''} ·{' '}
                {fetchResult.n_fetched} works on OpenAlex · {fetchResult.n_works} kept ·{' '}
                {fetchResult.n_default_seeds} pre-checked
                {fetchResult.warnings.map((w, i) => (
                  <div key={i} style={{ marginTop: 2, color: 'var(--warn)' }}>
                    {w}
                  </div>
                ))}
              </div>
            )}
            {works === null ? (
              <div className="empty">LOADING WORKS…</div>
            ) : (
              <WorkPicker
                works={works}
                selected={selection}
                onChange={setSelection}
                softCap={40}
                busy={confirming}
                onConfirm={handleConfirmSeeds}
                onCancel={state.importDone ? () => setPicking(false) : undefined}
              />
            )}
          </>
        )}

        {done && !showPicker && importResult && (
          <div
            className="mono"
            style={{
              padding: 12,
              fontSize: 11,
              color: 'var(--fg-3)',
              background: 'var(--bg-inset)',
              border: '1px solid var(--line)',
              letterSpacing: 0,
            }}
          >
            <div style={{ color: 'var(--fg)' }}>
              {importResult.author.display_name}
              {importResult.author.institution ? ` · ${importResult.author.institution}` : ''}
            </div>
            <div style={{ marginTop: 4 }}>
              {importResult.n_fetched} works on OpenAlex · {importResult.n_kept} kept ·{' '}
              {importResult.n_seeds} lead-author seeds · {importResult.n_embedded} embedded
            </div>
            {importResult.rp && (
              <div style={{ marginTop: 6, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                <div>
                  Profile: {importResult.rp.level ?? '?'} · {importResult.rp.provenance ?? '?'} ·{' '}
                  {importResult.rp.n_expertise} expertise · {importResult.rp.n_not_interests} not-interests
                </div>
                {importResult.rp.switched_off.length > 0 && (
                  <div style={{ marginTop: 2 }}>
                    Switched off by not-interests:{' '}
                    {importResult.rp.switched_off.map((x) => `${x.display_name} (${x.by})`).join(', ')}
                  </div>
                )}
                {importResult.rp.switched_on.length > 0 && (
                  <div style={{ marginTop: 2 }}>
                    Switched on by expertise:{' '}
                    {importResult.rp.switched_on.map((x) => `${x.display_name} (${x.by})`).join(', ')}
                  </div>
                )}
                {importResult.rp.added.length > 0 && (
                  <div style={{ marginTop: 2 }}>
                    Added from expertise:{' '}
                    {importResult.rp.added.map((x) => `${x.display_name} (${x.by})`).join(', ')}
                  </div>
                )}
              </div>
            )}
            {importResult.warnings.map((w, i) => (
              <div key={i} style={{ marginTop: 4, color: 'var(--warn)' }}>
                {w}
              </div>
            ))}
          </div>
        )}

        {error && <ErrorLine text={error} />}
        {error && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            {state.worksReady && works !== null && works.length > 0 && (
              <button
                className="btn primary"
                onClick={() => {
                  setError(null);
                  setPicking(true);
                }}
              >
                CHOOSE SEEDS AGAIN
              </button>
            )}
            <button className="btn" onClick={handleStartOver}>
              START OVER
            </button>
          </div>
        )}

        {!showPicker && (
          <>
            <div style={{ marginTop: 14 }}>
              <div
                className="mono"
                style={{
                  fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.08em', marginBottom: 6,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
              >
                SEEDS · {state.seeds.length}
                {done && works !== null && works.length > 0 && (
                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: 10, padding: '2px 8px' }}
                    onClick={() => setPicking(true)}
                    title="Go back to the list of fetched works and change which ones are seeds"
                  >
                    CHANGE SEEDS
                  </button>
                )}
              </div>
              {state.seeds.length === 0 && !importProgress && !error && (
                <div className="empty">no seeds attached yet</div>
              )}
              {state.seeds.map((doc) => (
                <SeedRow key={doc.id} doc={doc} />
              ))}
            </div>

            <div
              style={{
                marginTop: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 12,
              }}
            >
              {done && state.seeds.length > 0 && state.seeds.length < 5 && (
                <span
                  className="mono"
                  style={{ fontSize: 11, color: 'var(--warn)', letterSpacing: '0.06em' }}
                >
                  Few seed papers — the topic will be narrow.
                </span>
              )}
              <button
                className="btn primary"
                disabled={!done || state.seeds.length === 0}
                onClick={onNext}
              >
                NEXT · COHERENCE →
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Phase B (PDF) — dropzone + staged seeds (unchanged behaviour).
  // ------------------------------------------------------------------
  return (
    <div className="section">
      {confirmStartOver && (
        <ConfirmDialog
          title="START OVER?"
          confirmLabel="DISCARD & START OVER"
          onConfirm={performStartOver}
          onCancel={() => setConfirmStartOver(false)}
        >
          <p>
            This deletes <strong>{state.name || state.slug}</strong>
            {state.seeds.length > 0
              ? ` and its ${state.seeds.length} seed${state.seeds.length === 1 ? '' : 's'}`
              : ''}
            {usesImport && !state.importDone ? ' and stops the running import' : ''}
            , then returns to choosing PDFs, ORCID or a profile.
          </p>
          <p className="dim">To keep it for later, use CANCEL and choose KEEP DRAFT instead.</p>
        </ConfirmDialog>
      )}
      <h3>
        Step 1 — Upload seed PDFs <span className="hr" />
        <span
          className="mono"
          style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.08em' }}
        >
          DRAFT · {state.slug}{isProfile ? ' · from profile' : ''}
        </span>
        <button
          className="btn"
          onClick={handleStartOver}
          title="Delete this draft and go back to choosing PDFs, ORCID or a profile"
          style={{ marginLeft: 12, fontSize: 10, padding: '2px 8px' }}
        >
          START OVER
        </button>
      </h3>

      {isProfile && (
        <div className="mono" style={{ color: 'var(--fg-3)', marginBottom: 10, fontSize: 11 }}>
          This profile has no ORCID, so nothing could be fetched from OpenAlex. Upload PDFs as
          seeds; the profile's expertise and not-interests will shape the concept list at Step 3.
        </div>
      )}

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onClick={() => !uploadProgress && inputRef.current?.click()}
        style={{
          padding: 24,
          textAlign: 'center',
          border: '1px dashed var(--line-strong)',
          background: 'var(--bg-inset)',
          color: 'var(--fg-3)',
          cursor: uploadProgress ? 'progress' : 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          letterSpacing: '0.08em',
        }}
      >
        {uploadProgress ? (
          <>
            <div>
              UPLOADING {uploadProgress.done + 1} / {uploadProgress.total}
              {uploadProgress.currentName && (
                <span style={{ color: 'var(--fg-4)' }}>
                  {' · '}{uploadProgress.currentName}
                </span>
              )}
            </div>
            <div
              style={{
                marginTop: 8,
                height: 3,
                background: 'var(--line)',
                position: 'relative',
                maxWidth: 360,
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '100%',
                  width: `${(uploadProgress.done / Math.max(uploadProgress.total, 1)) * 100}%`,
                  background: 'var(--fg-3)',
                  transition: 'width 200ms linear',
                }}
              />
            </div>
            {uploadProgress.failures.length > 0 && (
              <div style={{ marginTop: 6, color: 'var(--err)', fontSize: 11 }}>
                {uploadProgress.failures.length} failed
              </div>
            )}
          </>
        ) : (
          'DROP PDFS HERE OR CLICK TO BROWSE'
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          style={{ display: 'none' }}
        />
      </div>

      {error && <ErrorLine text={error} />}

      <div style={{ marginTop: 14 }}>
        <div
          className="mono"
          style={{
            fontSize: 11,
            color: 'var(--fg-3)',
            letterSpacing: '0.08em',
            marginBottom: 6,
          }}
        >
          STAGED SEEDS · {state.seeds.length}
        </div>
        {state.seeds.length === 0 && (
          <div className="empty">no seeds yet — upload 8–15 PDFs</div>
        )}
        {state.seeds.map((doc) => (
          <SeedRow key={doc.id} doc={doc} onRemove={() => removeSeed(doc.id)} />
        ))}
      </div>

      <div
        style={{
          marginTop: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 12,
        }}
      >
        {state.seeds.length === 0 && (
          <span
            className="mono"
            style={{ fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.06em' }}
          >
            Upload at least 1 seed to continue.
          </span>
        )}
        {state.seeds.length === 1 && (
          <span
            className="mono"
            style={{ fontSize: 11, color: 'var(--warn)', letterSpacing: '0.06em' }}
          >
            One seed works — coherence is skipped, the centroid is that paper.
          </span>
        )}
        <button
          className="btn primary"
          disabled={state.seeds.length === 0}
          onClick={onNext}
        >
          NEXT · COHERENCE →
        </button>
      </div>
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: DraftMode; onChange: (m: DraftMode) => void }) {
  return (
    <div className="seg" role="group" aria-label="Seed source" style={{ marginBottom: 12 }}>
      <button type="button" aria-pressed={mode === 'pdf'} onClick={() => onChange('pdf')}>
        UPLOAD PDFS
      </button>
      <button type="button" aria-pressed={mode === 'orcid'} onClick={() => onChange('orcid')}>
        FROM ORCID
      </button>
      <button type="button" aria-pressed={mode === 'profile'} onClick={() => onChange('profile')}>
        FROM PROFILE
      </button>
    </div>
  );
}

function ProfileForm({
  text,
  onText,
  onFile,
  fileRef,
  name,
  onName,
  mailto,
  onMailto,
  creating,
  onSubmit,
}: {
  text: string;
  onText: (t: string) => void;
  onFile: (files: FileList | null) => void;
  fileRef: React.MutableRefObject<HTMLInputElement | null>;
  name: string;
  onName: (v: string) => void;
  mailto: string;
  onMailto: (v: string) => void;
  creating: boolean;
  onSubmit: () => void;
}) {
  const { preview, error } = previewProfile(text);
  return (
    <>
      <div className="mono" style={{ color: 'var(--fg-3)', marginBottom: 12 }}>
        Paste a Researcher Profile document (<code>profile.jsonld</code>) or pick the file. With
        an ORCID the researcher's publications are fetched from OpenAlex as in FROM ORCID; the
        profile's <em>expertise</em> switches concepts on and its <em>not_interests</em> switches
        them off. Without an ORCID you upload PDFs as seeds instead.
      </div>
      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder='{"@context": "https://profiles.databio.org/context/v1.jsonld", "@type": "Person", "name": "…", "rid": "0000-0000-0000-0000", …}'
        spellCheck={false}
        style={{ ...inputStyle, width: '100%', minHeight: 140, resize: 'vertical', fontSize: 11, boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
        <input
          ref={fileRef}
          type="file"
          accept=".jsonld,.json,application/ld+json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            onFile(e.target.files);
            e.target.value = '';
          }}
        />
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          CHOOSE FILE…
        </button>
        <span className="mono" style={{ fontSize: 11, color: preview ? 'var(--fg-2)' : 'var(--fg-4)' }}>
          {preview
            ? `${preview.name} · ${preview.orcid ? `ORCID ${preview.orcid}` : 'no ORCID (PDF seeds)'}` +
              ` · ${preview.level ?? 'level ?'} · ${preview.nExpertise} expertise · ${preview.nNotInterests} not-interests`
            : error
              ? error
              : 'nothing pasted yet'}
        </span>
      </div>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', marginTop: 8 }}>
        <input
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="topic name (optional — defaults to the profile's name)"
          style={inputStyle}
        />
        <input
          value={mailto}
          onChange={(e) => onMailto(e.target.value)}
          placeholder="contact email for OpenAlex's polite pool (optional)"
          style={inputStyle}
        />
        <span />
        <button
          className="btn primary"
          disabled={creating || !preview}
          onClick={onSubmit}
          style={{ justifySelf: 'end' }}
        >
          {creating ? 'IMPORTING…' : 'IMPORT PROFILE'}
        </button>
      </div>
    </>
  );
}

function SeedRow({ doc, onRemove }: { doc: VaultDoc; onRemove?: () => void }) {
  return (
    <div
      className="seed-row"
      style={{
        gridTemplateColumns: '32px 1fr 60px 80px 60px',
      }}
    >
      <span className="num">·</span>
      <span className="ttl">{doc.title || doc.id}</span>
      <span
        className="num"
        style={{ textAlign: 'right', color: 'var(--fg-3)' }}
      >
        {doc.pages ? `${doc.pages} p` : doc.year ?? ''}
      </span>
      <span className="num" style={{ textAlign: 'right', color: 'var(--fg-4)' }}>
        {doc.added.slice(0, 10)}
      </span>
      <span style={{ textAlign: 'right' }}>
        {onRemove && (
          <button
            onClick={onRemove}
            style={{
              background: 'none',
              border: 0,
              color: 'var(--fg-4)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              cursor: 'pointer',
            }}
          >
            REMOVE
          </button>
        )}
      </span>
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <div
      className="mono"
      style={{
        marginTop: 12,
        padding: 8,
        fontSize: 11,
        color: 'var(--err)',
        background: 'color-mix(in oklab, var(--bg-0), var(--err) 4%)',
        borderLeft: '2px solid var(--err)',
      }}
    >
      {text}
    </div>
  );
}
