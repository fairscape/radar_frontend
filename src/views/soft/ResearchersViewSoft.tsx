/**
 * ResearchersViewSoft (approachable theme) — same content as
 * ResearchersView with the soft page layout.
 */

import { useEffect, useState } from 'react';
import { IconSoft } from '../../components/soft/IconSoft';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ResearcherDetailBlocks, ResearcherImportPanel } from '../../components/ResearcherBlocks';
import { deleteResearcher, importResearcher } from '../../api/endpoints/researchers';
import { useResearcherDetail, useResearchers } from '../../api/hooks/useResearchers';
import { ApiError } from '../../api/client';

function errText(e: unknown): string {
  if (e instanceof ApiError && e.body && typeof e.body === 'object' && 'detail' in e.body) {
    const d = (e.body as { detail: unknown }).detail;
    return typeof d === 'string' ? d : JSON.stringify(d);
  }
  return e instanceof Error ? e.message : String(e);
}

export function ResearchersViewSoft() {
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

  const head = (
    <div className="page-head">
      <div>
        <h1>Researchers</h1>
        <div className="sub">
          Profiles you imported, kept whole. Separate from Topics: nothing here changes what Radar recommends.
        </div>
      </div>
      <div className="actions">
        <button className="btn primary" type="button" onClick={() => { setImporting(true); setImportError(null); }}>
          <IconSoft name="plus" size={14} /> Import profile
        </button>
      </div>
    </div>
  );

  return (
    <div className="view">
      {head}
      {notice && (
        <div className="rs-notice">
          {notice}
          <button type="button" className="btn ghost" onClick={() => setNotice(null)}>×</button>
        </div>
      )}
      {importing && (
        <div className="pa-panel" style={{ marginBottom: 16 }}>
          <h2>Import a researcher profile</h2>
          <ResearcherImportPanel busy={busy} error={importError} onSubmit={onImport} onCancel={() => setImporting(false)} />
        </div>
      )}
      {researchers.length === 0 && !loading ? (
        <div className="empty">
          {listError ? (
            <>Couldn’t load researchers. <button type="button" className="btn" onClick={refresh}>Retry</button></>
          ) : (
            'No researchers yet — import a profile.jsonld to keep it here.'
          )}
        </div>
      ) : (
        <div className="pa-grid">
          <div className="pa-list">
            {researchers.map((r) => (
              <div
                key={r.id}
                className={`pa-item ${r.id === activeId ? 'active' : ''}`}
                onClick={() => { setSelected(r.id); setImporting(false); }}
              >
                <div className="row1">
                  <span className="nm">{r.name}</span>
                  <span className="status ok">{r.level ?? '?'}</span>
                </div>
                <div className="sub">
                  <span>{r.affiliation ?? '—'}</span>
                  <span>{r.orcid ? `ORCID ${r.orcid}` : 'local id'}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="pa-panel">
            {detailLoading && !detail ? (
              <div className="empty">Loading researcher…</div>
            ) : active && detail ? (
              <>
                <h2>{active.name}</h2>
                <div className="lead">
                  {[active.affiliation, active.field].filter(Boolean).join(' · ')}
                  {active.orcid ? ` · ORCID ${active.orcid}` : ''}
                  <div className="hint" style={{ marginTop: 6 }}>
                    Library entry only. To recommend papers for this researcher, use New topic → From profile.
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                  <button className="btn" onClick={() => setConfirmDelete(true)}>Remove</button>
                </div>
                <ResearcherDetailBlocks detail={detail} />
              </>
            ) : null}
          </div>
        </div>
      )}
      {confirmDelete && active && (
        <ConfirmDialog
          title="Remove researcher?"
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
