/**
 * ResearchersView (dense theme) — the user's library of imported Researcher
 * Profiles: list on the left, every section of the selected document on
 * the right. Independent of Topics.
 */

import { useEffect, useState } from 'react';
import { TopBar } from '../components/TopBar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ResearcherDetailBlocks, ResearcherImportPanel } from '../components/ResearcherBlocks';
import { deleteResearcher, importResearcher } from '../api/endpoints/researchers';
import { useResearcherDetail, useResearchers } from '../api/hooks/useResearchers';
import { ApiError } from '../api/client';

function errText(e: unknown): string {
  if (e instanceof ApiError && e.body && typeof e.body === 'object' && 'detail' in e.body) {
    const d = (e.body as { detail: unknown }).detail;
    return typeof d === 'string' ? d : JSON.stringify(d);
  }
  return e instanceof Error ? e.message : String(e);
}

export function ResearchersView() {
  const { researchers, loading, error: listError, refresh } = useResearchers();
  const [selected, setSelected] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const activeId = selected ?? researchers[0]?.id ?? null;
  const { detail, loading: detailLoading } = useResearcherDetail(activeId);
  const active = researchers.find((r) => r.id === activeId) ?? null;

  useEffect(() => {
    if (selected !== null && !researchers.some((r) => r.id === selected)) setSelected(null);
  }, [researchers, selected]);

  const onImport = async (text: string, kind: 'paste' | 'file') => {
    setBusy(true);
    setImportError(null);
    try {
      const res = await importResearcher(text, kind);
      setImporting(false);
      setSelected(res.researcher.id);
      setNotice(
        `${res.created ? 'Imported' : 'Updated'} ${res.researcher.name}` +
          (res.warnings.length ? ` · ${res.warnings.join(' · ')}` : ''),
      );
    } catch (e) {
      setImportError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!active) return;
    setConfirmDelete(false);
    try {
      await deleteResearcher(active.id);
      setSelected(null);
      setNotice(`Removed ${active.name}`);
    } catch (e) {
      setNotice(errText(e));
    }
  };

  return (
    <div className="view">
      <TopBar crumbs={['Researchers', active?.name ?? '…']} />
      <div className="prof-grid">
        <div className="prof-list">
          <div className="prof-list-head">
            <span>Researchers · {researchers.length}</span>
            <button type="button" className="btn" onClick={() => { setImporting(true); setImportError(null); }}>
              + IMPORT
            </button>
          </div>
          {researchers.length === 0 && listError && (
            <div className="empty mono" style={{ padding: '24px 16px', fontSize: 11, color: 'var(--err)', letterSpacing: '0.06em' }}>
              FAILED TO LOAD RESEARCHERS
              <button type="button" className="btn" style={{ marginLeft: 12 }} onClick={refresh}>RETRY</button>
            </div>
          )}
          {researchers.length === 0 && !listError && !loading && (
            <div className="empty mono" style={{ padding: '24px 16px', fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.06em' }}>
              NO RESEARCHERS YET — CLICK <b style={{ color: 'var(--fg)' }}>+ IMPORT</b> TO ADD A PROFILE
            </div>
          )}
          {researchers.map((r) => (
            <div
              key={r.id}
              className={`prof-item ${r.id === activeId ? 'active' : ''}`}
              onClick={() => { setSelected(r.id); setImporting(false); }}
            >
              <div className="name">{r.name}</div>
              <div className="meta" style={{ display: 'block', color: 'var(--fg-3)' }}>
                {r.affiliation ?? '—'}
              </div>
              <div className="meta">
                <span>{r.orcid ? `ORCID ${r.orcid}` : 'LOCAL'}</span>
                <span>{(r.level ?? '?').toUpperCase()}</span>
                <span>PAPERS <b className="num">{r.n_papers ?? '?'}</b></span>
              </div>
            </div>
          ))}
        </div>

        <div className="prof-detail">
          {notice && (
            <div className="mono" style={{ padding: '8px 28px', fontSize: 11, color: 'var(--fg-3)', borderBottom: '1px solid var(--line)' }}>
              {notice}
              <button type="button" className="btn ghost" style={{ marginLeft: 8 }} onClick={() => setNotice(null)}>×</button>
            </div>
          )}
          {importing ? (
            <div className="section">
              <h3>Import a researcher profile <span className="hr" /></h3>
              <ResearcherImportPanel busy={busy} error={importError} onSubmit={onImport} onCancel={() => setImporting(false)} />
            </div>
          ) : researchers.length === 0 && !loading ? (
            <div className="empty">NO RESEARCHER SELECTED — IMPORT ONE TO SEE ITS PROFILE</div>
          ) : detailLoading && !detail ? (
            <div className="empty">LOADING RESEARCHER…</div>
          ) : active && detail ? (
            <>
              <div className="pd-head">
                <div>
                  <h2>{active.name}</h2>
                  <div className="sub mono">
                    {[active.affiliation, active.field].filter(Boolean).join(' · ')}
                    {active.orcid ? ` · ORCID ${active.orcid}` : ` · ${active.rid}`}
                  </div>
                  <div className="sub mono">
                    <span className="dim">
                      Library entry only. To recommend papers for this researcher, use New topic → FROM PROFILE.
                    </span>
                  </div>
                </div>
                <div className="pd-actions">
                  <button className="btn danger" onClick={() => setConfirmDelete(true)}>DELETE</button>
                </div>
              </div>
              <ResearcherDetailBlocks detail={detail} />
            </>
          ) : null}
        </div>
      </div>
      {confirmDelete && active && (
        <ConfirmDialog
          title="REMOVE RESEARCHER?"
          confirmLabel="REMOVE"
          onConfirm={onDelete}
          onCancel={() => setConfirmDelete(false)}
        >
          <p>
            This removes <strong>{active.name}</strong> from your library. Topics created from this
            profile are not affected.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
