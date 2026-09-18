import { useEffect, useRef, useState } from 'react';
import type { VaultDoc } from '../../types/radar';
import {
  createDraft,
  listSeedDocs,
  uploadSeed,
} from '../../api/endpoints/wizard';
import { useDraft } from '../../api/hooks/useDraft';
import { ProsopiaImport, type ProsopiaImportDone } from './ProsopiaImport';
import { ErrorLine } from './ErrorLine';

interface Props {
  onNext: () => void;
}

export function Step1Upload({ onNext }: Props) {
  const { state, setSlug, addSeed, removeSeed, setSeeds, setProsopia } =
    useDraft();
  const [name, setName] = useState(state.name);
  const [creating, setCreating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    total: number;
    done: number;
    currentName: string | null;
    failures: { name: string; message: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Refresh staged seeds from the server when we already have a slug
  // (handles reload partway through the wizard).
  useEffect(() => {
    if (!state.slug) return;
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
  }, [state.slug, setSeeds]);

  async function handleCreate() {
    if (!name.trim()) {
      setError('profile name is required');
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const draft = await createDraft({
        name: name.trim(),
      });
      setSlug(draft.slug, draft.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  function handleProsopiaDone(done: ProsopiaImportDone) {
    setSlug(done.slug, done.name);
    setProsopia({ ref: done.ref, nSeeds: done.nSeeds });
    onNext();
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

  if (!state.slug) {
    return (
      <div className="section">
        <h3>
          Step 1 — Name your profile <span className="hr" />
        </h3>
        <div className="mono" style={{ color: 'var(--fg-3)', marginBottom: 12 }}>
          Name the profile and create an empty draft to upload PDFs into, or
          import a Prosopia profile below.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
            placeholder="e.g. neonatal vitals"
            style={{
              flex: 1,
              padding: 8,
              fontFamily: 'var(--font-mono)',
              background: 'var(--bg-inset)',
              color: 'var(--fg)',
              border: '1px solid var(--line-strong)',
            }}
          />
          <button
            className="btn primary"
            disabled={creating}
            onClick={handleCreate}
          >
            {creating ? 'CREATING…' : 'CREATE DRAFT'}
          </button>
        </div>
        {/* Embedder/selector dropdowns hidden — upload always uses the
            server default (specter2 + centroid). Showing them caused
            profile ↔ upload embedding model mismatches. */}
        <ProsopiaImport
          name={name}
          disabled={creating}
          onDone={handleProsopiaDone}
        />
        {error && <ErrorLine text={error} />}
      </div>
    );
  }

  const imported = state.prosopia;
  const haveSeeds = state.seeds.length > 0 || imported !== null;

  return (
    <div className="section">
      <h3>
        Step 1 — Upload seed PDFs <span className="hr" />
        <span
          className="mono"
          style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.08em' }}
        >
          DRAFT · {state.slug}
        </span>
      </h3>

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
        {imported && (
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: 'var(--fg-3)',
              letterSpacing: '0.08em',
              marginBottom: 6,
            }}
          >
            IMPORTED FROM PROSOPIA · {imported.ref}
            {imported.nSeeds != null ? ` · ${imported.nSeeds} papers` : ''}
          </div>
        )}
        {state.seeds.length === 0 && (
          <div className="empty">
            {imported
              ? 'imported seeds live on the server; upload PDFs to add more'
              : 'no seeds yet — upload 8–15 PDFs'}
          </div>
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
        {!haveSeeds && (
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
        <button className="btn primary" disabled={!haveSeeds} onClick={onNext}>
          NEXT · COHERENCE →
        </button>
      </div>
    </div>
  );
}

function SeedRow({ doc, onRemove }: { doc: VaultDoc; onRemove: () => void }) {
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
        {doc.pages} p
      </span>
      <span className="num" style={{ textAlign: 'right', color: 'var(--fg-4)' }}>
        {doc.added.slice(0, 10)}
      </span>
      <span style={{ textAlign: 'right' }}>
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
      </span>
    </div>
  );
}
