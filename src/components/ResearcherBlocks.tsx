/**
 * ResearcherBlocks — the detail body of one Researchers-library entry, and
 * the import panel. Shared by the dense and soft pages; the shells around
 * them differ per theme.
 */

import { useRef, useState } from 'react';
import type { ResearcherDetail } from '../api/endpoints/researchers';
import { previewProfile } from '../lib/profilePreview';
import { RpMetaBlock } from './RpMetaBlock';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const norm = iso.includes('T') ? iso : iso.replace(' ', 'T');
  const d = new Date(norm.endsWith('Z') || /[+-]\d\d:\d\d$/.test(norm) ? norm : `${norm}Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function labelize(s: string): string {
  return s.replace(/_/g, ' ');
}

const ROLE_LABEL: Record<string, string> = {
  works: 'works list',
  citations: 'citation graph',
  paper_summary: 'paper summaries',
  paper_fulltext: 'paper full texts',
  expertise: 'expertise document',
  soul: 'SOUL document',
  topics: 'topics document',
  embedding_index: 'embedding index',
  embedding_index_sqlite: 'local embedding index',
  html: 'landing page',
  cv: 'CV',
  web: 'web pages',
  grants: 'grants list',
  agent_entry_point: 'agent instructions',
};

export function ResearcherDetailBlocks({ detail }: { detail: ResearcherDetail }) {
  const p = detail.parsed;
  const stage = (p.career_stage ?? null) as Record<string, unknown> | null;
  const stageStr = (k: string) => {
    const v = stage?.[k];
    return v === null || v === undefined || v === '' ? '—' : String(v);
  };
  const manifest = p.manifest;
  const [copied, setCopied] = useState(false);
  const raw = JSON.stringify(detail.doc, null, 2);

  return (
    <div className="rs-blocks">
      <section>
        <h3>Identity</h3>
        <dl className="rs-dl">
          <dt>Name</dt><dd>{detail.name}</dd>
          {detail.affiliation && <><dt>Affiliation</dt><dd>{detail.affiliation}</dd></>}
          {detail.field && <><dt>Field</dt><dd>{detail.field}</dd></>}
          <dt>Researcher id</dt>
          <dd>
            {detail.orcid ? (
              <a href={`https://orcid.org/${detail.orcid}`} target="_blank" rel="noreferrer">
                ORCID {detail.orcid}
              </a>
            ) : (
              detail.rid
            )}
          </dd>
          {p.openalex_author_id && (
            <><dt>OpenAlex</dt><dd><a href={p.openalex_author_id} target="_blank" rel="noreferrer">{p.openalex_author_id.replace('https://openalex.org/', '')}</a></dd></>
          )}
          {p.same_as && p.same_as.length > 0 && (
            <><dt>Also at</dt><dd>{p.same_as.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{u.replace(/^https?:\/\//, '')}</a>)}</dd></>
          )}
          <dt>Profile</dt>
          <dd>
            {[detail.level, detail.provenance, p.visibility].filter(Boolean).join(' · ') || '—'}
            {p.license ? ` · ${p.license.replace(/^https?:\/\//, '')}` : ''}
          </dd>
          {detail.date_modified && <><dt>Document dated</dt><dd>{fmtDate(detail.date_modified)}</dd></>}
          <dt>Imported</dt>
          <dd>
            {fmtDate(detail.imported_at)}
            {detail.updated_at ? ` · updated ${fmtDate(detail.updated_at)}` : ''}
            {` · ${detail.source_kind}`}
          </dd>
        </dl>
      </section>

      {p.summary && (
        <section>
          <h3>Summary</h3>
          <p>{p.summary}</p>
        </section>
      )}

      <section>
        <h3>Interests</h3>
        {/* Identity and summary have their own blocks above; only the chips remain. */}
        <RpMetaBlock meta={{ expertise: p.expertise, not_interests: p.not_interests, collaborators: p.collaborators }} />
        {!p.expertise?.length && !p.not_interests?.length && !p.collaborators?.length && (
          <p className="dim">The document declares no expertise, not-interests or collaborators.</p>
        )}
      </section>

      {(p.training?.length ?? 0) > 0 && (
        <section>
          <h3>Training</h3>
          <table className="rs-table">
            <thead><tr><th>Degree</th><th>Institution</th><th>Advisor</th><th>Field</th><th>Years</th></tr></thead>
            <tbody>
              {p.training!.map((t, i) => (
                <tr key={i}>
                  <td>{t.degree ?? t.kind ?? '—'}</td>
                  <td>{t.institution ?? '—'}</td>
                  <td>{t.advisor ?? '—'}</td>
                  <td>{t.field ?? '—'}</td>
                  <td className="num">{[t.year_start, t.year_end].filter((y) => y != null).join('–') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(p.career?.length ?? 0) > 0 && (
        <section>
          <h3>Career</h3>
          <table className="rs-table">
            <thead><tr><th>Role</th><th>Institution</th><th>Years</th></tr></thead>
            <tbody>
              {p.career!.map((c, i) => (
                <tr key={i}>
                  <td>{c.role ?? '—'}</td>
                  <td>{c.institution ?? '—'}</td>
                  <td className="num">{c.start_year ?? '?'}–{c.end_year ?? 'present'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {stage && (
        <section>
          <h3>Career stage <span className="dim">as of {stageStr('as_of')} · confidence {stageStr('confidence')}</span></h3>
          <dl className="rs-dl">
            <dt>Current rank</dt><dd>{labelize(stageStr('current_rank'))}</dd>
            <dt>Independence</dt><dd>{labelize(stageStr('independence'))}</dd>
            <dt>Tenure</dt><dd>{labelize(stageStr('tenure_status'))}</dd>
            <dt>First independent appointment</dt><dd>{stageStr('first_independent_appointment_year')}</dd>
            <dt>Terminal degree</dt><dd>{stageStr('terminal_degree_year')} · {labelize(stageStr('terminal_degree_type'))}</dd>
            <dt>First R01-equivalent</dt><dd>{stageStr('first_r01_equivalent_year')}</dd>
            {Array.isArray(stage.sources_checked) && (
              <><dt>Sources checked</dt><dd>{(stage.sources_checked as unknown[]).map(String).join(', ')}</dd></>
            )}
          </dl>
          {typeof stage.evidence === 'string' && <p className="dim">{stage.evidence}</p>}
          {typeof stage.notes === 'string' && <p className="dim">{stage.notes}</p>}
        </section>
      )}

      {p.paper_stats && (
        <section>
          <h3>Papers <span className="dim">as counted by the profile</span></h3>
          <dl className="rs-dl">
            {Object.entries(p.paper_stats).map(([k, v]) => (
              <span key={k} style={{ display: 'contents' }}>
                <dt>{labelize(k)}</dt><dd className="num">{String(v)}</dd>
              </span>
            ))}
          </dl>
        </section>
      )}

      {manifest && (
        <section>
          <h3>Profile contents <span className="dim">declared in the manifest, not stored here</span></h3>
          <dl className="rs-dl">
            {Object.entries(manifest.by_role)
              .sort((a, b) => b[1] - a[1])
              .map(([role, n]) => (
                <span key={role} style={{ display: 'contents' }}>
                  <dt>{ROLE_LABEL[role] ?? labelize(role)}</dt>
                  <dd className="num">
                    {n}
                    {manifest.restricted_roles.includes(role) ? ' · restricted' : ''}
                  </dd>
                </span>
              ))}
            <dt>Visibility</dt>
            <dd>{Object.entries(manifest.by_visibility).map(([k, n]) => `${n} ${k}`).join(' · ') || '—'}</dd>
            <dt>Total size</dt><dd className="num">{humanBytes(manifest.bytes_total)}</dd>
            {manifest.works_url && <><dt>Works file</dt><dd>{manifest.works_url}</dd></>}
          </dl>
          {p.capabilities && Object.keys(p.capabilities).length > 0 && (
            <p className="dim">
              {Object.entries(p.capabilities).map(([k, v]) => `${k}: ${v ? 'yes' : 'no'}`).join(' · ')}
            </p>
          )}
        </section>
      )}

      {detail.warnings.length > 0 && (
        <section>
          <h3>Import notes</h3>
          {detail.warnings.map((w, i) => <p key={i} className="warn">{w}</p>)}
        </section>
      )}

      <section>
        <details className="rs-raw">
          <summary>
            Raw document
            <button
              type="button"
              className="btn ghost"
              onClick={(e) => {
                e.preventDefault();
                navigator.clipboard?.writeText(raw).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                }).catch(() => { /* clipboard blocked */ });
              }}
            >
              {copied ? 'COPIED' : 'COPY'}
            </button>
          </summary>
          <pre>{raw}</pre>
        </details>
      </section>
    </div>
  );
}

export function ResearcherImportPanel({
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (text: string, kind: 'paste' | 'file') => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'paste' | 'file'>('paste');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { preview, error: preErr } = previewProfile(text);

  const onFile = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(typeof reader.result === 'string' ? reader.result : '');
      setKind('file');
    };
    reader.readAsText(f);
  };

  return (
    <div className="rs-import">
      <p className="dim">
        Paste a Researcher Profile document (<code>profile.jsonld</code>) or pick the file. The
        whole document is kept; importing the same researcher again replaces the earlier copy.
        This does not create a topic — for recommendations use New topic → FROM PROFILE.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setKind('paste');
        }}
        spellCheck={false}
        placeholder='{"@context": "https://profiles.databio.org/context/v1.jsonld", "@type": "Person", "name": "…", …}'
      />
      <div className="rs-import-row">
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
        <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
          CHOOSE FILE…
        </button>
        <span className="mono status">
          {preview
            ? `${preview.name} · ${preview.orcid ? `ORCID ${preview.orcid}` : 'no ORCID'} · ${preview.level ?? 'level ?'} · ${preview.nExpertise} expertise · ${preview.nNotInterests} not-interests`
            : preErr ?? 'nothing pasted yet'}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
          CANCEL
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={busy || !preview}
          onClick={() => onSubmit(text, kind)}
        >
          {busy ? 'IMPORTING…' : 'IMPORT'}
        </button>
      </div>
      {error && <p className="warn">{error}</p>}
    </div>
  );
}
