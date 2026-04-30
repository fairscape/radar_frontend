import { useEffect, useRef, useState } from 'react';
import type { VaultDoc } from '../../types/radar';
import {
  createDraft,
  listSeedDocs,
  uploadSeed,
} from '../../api/endpoints/wizard';
import { useDraft } from '../../api/hooks/useDraft';

interface Props {
  onNext: () => void;
}

export function Step1Upload({ onNext }: Props) {
  const { state, setSlug, addSeed, removeSeed, setSeeds } = useDraft();
  const [name, setName] = useState(state.name);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(0);
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
      const draft = await createDraft(name.trim());
      setSlug(draft.slug, draft.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !state.slug) return;
    setError(null);
    setUploading(files.length);
    try {
      for (const file of Array.from(files)) {
        try {
          const doc = await uploadSeed(file, state.slug);
          addSeed(doc);
        } catch (e) {
          setError(
            `${file.name}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    } finally {
      setUploading(0);
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
          A draft profile is created on the server so seeds can attach to it.
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
        {error && <ErrorLine text={error} />}
      </div>
    );
  }

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
        onClick={() => inputRef.current?.click()}
        style={{
          padding: 24,
          textAlign: 'center',
          border: '1px dashed var(--line-strong)',
          background: 'var(--bg-inset)',
          color: 'var(--fg-3)',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          letterSpacing: '0.08em',
        }}
      >
        {uploading > 0
          ? `UPLOADING ${uploading} FILE(S)…`
          : 'DROP PDFS HERE OR CLICK TO BROWSE'}
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
        {state.seeds.length < 2 && (
          <span
            className="mono"
            style={{ fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.06em' }}
          >
            Upload at least 2 seeds to continue.
          </span>
        )}
        <button
          className="btn primary"
          disabled={state.seeds.length < 2}
          onClick={onNext}
        >
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
