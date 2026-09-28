/**
 * WorkPicker — choose which fetched works become the seeds of an ORCID /
 * profile draft (phase B of the import).
 *
 * Every kept work is listed, newest first; the default rule's pick is
 * pre-checked. Datasets cannot be seeds (row disabled). Duplicate
 * preprint / repository copies are listed unchecked with a pointer to the
 * copy the rule keeps.
 */

import { useMemo, useState } from 'react';
import type { OrcidWork } from '../../api/endpoints/wizard';

type Filter = 'all' | 'lead' | 'claimed';

interface Props {
  works: OrcidWork[];
  /** current selection (ids) */
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** the default rule's cap, for the ">N seeds" notice */
  softCap: number;
  busy: boolean;
  onConfirm: () => void;
  /** shown when the user came back from the seeds list */
  onCancel?: () => void;
}

function isLead(w: OrcidWork): boolean {
  return w.position === 'first' || w.position === 'last' || w.is_corresponding;
}

function positionLabel(w: OrcidWork): string {
  if (w.is_corresponding && w.position !== 'first' && w.position !== 'last') return 'CORR';
  if (w.position === 'first') return w.is_corresponding ? 'FIRST·CORR' : 'FIRST';
  if (w.position === 'last') return w.is_corresponding ? 'LAST·CORR' : 'LAST';
  if (w.position === 'middle') return 'MIDDLE';
  return '?';
}

export function WorkPicker({ works, selected, onChange, softCap, busy, onConfirm, onCancel }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return works.filter((w) => {
      if (filter === 'lead' && !isLead(w)) return false;
      if (filter === 'claimed' && w.claimed !== true) return false;
      if (q && !`${w.title} ${w.venue ?? ''} ${w.first_author ?? ''} ${w.year ?? ''}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [works, filter, query]);

  const eligibleVisible = visible.filter((w) => w.seed_eligible);
  const nDefault = works.filter((w) => w.default_selected).length;
  const nLead = works.filter((w) => isLead(w) && w.seed_eligible).length;
  const nSelectedVisible = eligibleVisible.filter((w) => selected.has(w.openalex_id)).length;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  const setAllVisible = (on: boolean) => {
    const next = new Set(selected);
    for (const w of eligibleVisible) {
      if (on) next.add(w.openalex_id);
      else next.delete(w.openalex_id);
    }
    onChange(next);
  };
  const selectDefault = () => onChange(new Set(works.filter((w) => w.default_selected).map((w) => w.openalex_id)));

  const chip = (key: Filter, label: string, n: number) => (
    <button
      type="button"
      key={key}
      aria-pressed={filter === key}
      onClick={() => setFilter(key)}
    >
      {label} · {n}
    </button>
  );

  return (
    <div className="work-picker">
      <div className="mono" style={{ color: 'var(--fg-3)', marginBottom: 10, fontSize: 11 }}>
        Tick the papers that should define this topic. The rule that used to run automatically
        (first / last / corresponding author, newest {softCap}) is pre-checked; you can add
        middle-author papers or drop any of these. Datasets cannot be seeds.
      </div>

      <div className="wp-toolbar">
        <div className="seg" role="group" aria-label="Show">
          {chip('all', 'ALL', works.length)}
          {chip('lead', 'LEAD-AUTHOR', nLead)}
          {chip('claimed', 'ON ORCID RECORD', works.filter((w) => w.claimed === true).length)}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="filter by title, venue, author, year"
          className="wp-search"
        />
        <div className="wp-bulk">
          <button type="button" className="btn ghost" onClick={selectDefault} disabled={busy}>
            DEFAULT · {nDefault}
          </button>
          <button type="button" className="btn ghost" onClick={() => setAllVisible(true)} disabled={busy}>
            ALL SHOWN
          </button>
          <button type="button" className="btn ghost" onClick={() => setAllVisible(false)} disabled={busy}>
            NONE SHOWN
          </button>
        </div>
      </div>

      <div className="wp-table" role="list">
        <div className="wp-row head">
          <span />
          <span>YEAR</span>
          <span>TITLE · VENUE</span>
          <span>ROLE</span>
          <span>ORCID</span>
          <span>CITED</span>
        </div>
        {visible.length === 0 && <div className="empty">no works match this filter</div>}
        {visible.map((w) => {
          const on = selected.has(w.openalex_id);
          const disabled = !w.seed_eligible;
          return (
            <label
              key={w.openalex_id}
              className={`wp-row ${on ? 'on' : ''} ${disabled ? 'disabled' : ''}`}
              title={
                disabled
                  ? 'datasets cannot be seeds'
                  : w.dup_of
                    ? `duplicate copy of ${w.dup_of} (the rule keeps that one)`
                    : !w.has_abstract
                      ? 'no abstract on OpenAlex: the embedding uses the title only'
                      : undefined
              }
            >
              <input
                type="checkbox"
                checked={on}
                disabled={disabled || busy}
                onChange={() => toggle(w.openalex_id)}
              />
              <span className="num">{w.year ?? '—'}</span>
              <span className="ttl">
                {w.title || w.openalex_id}
                <span className="sub">
                  {w.first_author ? `${w.first_author}${w.total_authors && w.total_authors > 1 ? ' et al.' : ''}` : ''}
                  {w.venue ? ` · ${w.venue}` : ''}
                  {w.work_type && w.work_type !== 'article' ? ` · ${w.work_type}` : ''}
                  {w.dup_of ? ' · duplicate copy' : ''}
                  {!w.has_abstract && w.seed_eligible ? ' · no abstract' : ''}
                </span>
              </span>
              <span className={`role ${isLead(w) ? 'lead' : ''}`}>{positionLabel(w)}</span>
              <span className="num">{w.claimed === true ? '✓' : w.claimed === false ? '·' : '?'}</span>
              <span className="num">{w.cited_by_count}</span>
            </label>
          );
        })}
      </div>

      <div className="wp-footer">
        <span className="mono" style={{ fontSize: 11, color: selected.size > softCap ? 'var(--warn)' : 'var(--fg-3)' }}>
          {selected.size} selected
          {filter !== 'all' || query ? ` (${nSelectedVisible} shown)` : ''}
          {selected.size > softCap
            ? ` · above the usual ${softCap}: embedding takes about a second per paper and coherence loosens with size`
            : ''}
          {selected.size === 0 ? ' · pick at least one' : ''}
        </span>
        <span style={{ flex: 1 }} />
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            KEEP CURRENT SEEDS
          </button>
        )}
        <button
          type="button"
          className="btn primary"
          onClick={onConfirm}
          disabled={busy || selected.size === 0}
        >
          {busy ? 'STARTING…' : `CONFIRM ${selected.size} SEED${selected.size === 1 ? '' : 'S'}`}
        </button>
      </div>
    </div>
  );
}
