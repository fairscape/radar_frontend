/**
 * "Or use papers already in your Vault": tick papers the user already has
 * and add them as seeds of a draft or a live interest. Shared by the
 * wizard's seed step and an interest's Seeds tab.
 *
 * The seed step used to take new uploads only, so a paper that arrived
 * earlier -- a PDF uploaded from the Vault page, or the papers of an
 * imported researcher -- had no way in. Every vault row is offered, not
 * just the ones with a PDF: a first version kept only rows with pages and,
 * measured on a real vault, hid 92 of 96 papers that were all acceptable.
 * A row the server does refuse is named in the error instead.
 *
 * Fetched only once opened: listing the whole vault counts Chroma chunks
 * per paper (200-700 ms for ~100 papers, measured), and most people here
 * are uploading, not picking.
 */
import { useEffect, useState } from 'react';
import { addSeeds } from '../api/endpoints/profiles';
import { useVaultDocs } from '../api/hooks';
import { errorMessage, plural } from '../lib/format';
import { toast } from '../lib/toast';
import type { VaultDoc } from '../types/radar';
import { Button, ErrorBox, Input, LoadingRows, useAction } from './index';
import { PaperTitle } from './pickers';

export function VaultSeedPicker({ profileKey, seedIds, disabled = false, onAdded, openSignal = 0 }: {
  /** The draft's or interest's slug. */
  profileKey: string;
  /** Ids already seeds of it; they are not offered again. */
  seedIds: Set<string>;
  disabled?: boolean;
  /** Called with the docs the server accepted. */
  onAdded?: (docs: VaultDoc[]) => void;
  /** Bumped by an "Add papers" button elsewhere: unfold. */
  openSignal?: number;
}) {
  const [open, setOpen] = useState(openSignal > 0);
  useEffect(() => {
    if (openSignal > 0) setOpen(true);
  }, [openSignal]);
  const vault = useVaultDocs('all', open);
  const inVault = (vault.data ?? []).filter((d) => !seedIds.has(d.id));
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q
    ? inVault.filter((d) => [d.title, d.venue, ...d.authors].some((f) => (f ?? '').toLowerCase().includes(q)))
    : inVault;

  const attach = useAction(async () => {
    // Filtered against what is still on offer: a row ticked, then made a
    // seed some other way, would otherwise be sent twice. Not against what
    // the filter shows -- a tick is kept while the user searches for the
    // next paper.
    const ids = inVault.filter((d) => chosen.has(d.id)).map((d) => d.id);
    if (ids.length === 0) return;
    const res = await addSeeds(profileKey, ids);
    setChosen(new Set());
    const rejected = new Set(res.rejected);
    const added = inVault.filter((d) => ids.includes(d.id) && !rejected.has(d.id));
    if (added.length > 0) onAdded?.(added);
    if (res.rejected.length > 0) {
      const byId = new Map(inVault.map((d) => [d.id, d.title || d.id]));
      const names = res.rejected.slice(0, 3).map((id) => `"${byId.get(id) ?? id}"`).join(', ');
      const more = res.rejected.length > 3 ? ` and ${res.rejected.length - 3} more` : '';
      toast.error(`Added ${plural(res.attached, 'paper')}. ${names}${more} could not be added: the server does not count ${res.rejected.length === 1 ? 'it' : 'them'} as yours.`);
    } else {
      toast.success(`Added ${plural(ids.length, 'paper')} from your Vault.${res.rescored ? ` The ${plural(res.rescored, 'paper')} already found were re-scored against the new seeds.` : ''}`);
    }
  });

  if (!open) {
    return (
      <p className="small" style={{ margin: '12px 0 0' }}>
        <button type="button" className="linklike" onClick={() => setOpen(true)} disabled={disabled}>Or use papers already in your Vault</button>
      </p>
    );
  }
  if (!vault.data && vault.loading) return <div style={{ marginTop: 16 }}><LoadingRows rows={2} /></div>;
  if (!vault.data && vault.error) return <div style={{ marginTop: 16 }}><ErrorBox compact message={errorMessage(vault.error)} onRetry={vault.refresh} /></div>;
  if (inVault.length === 0) {
    return (
      <p className="muted small" style={{ margin: '12px 0 0' }}>
        {(vault.data ?? []).length === 0 ? 'Your Vault is empty.' : 'Everything in your Vault is already a seed here.'}
      </p>
    );
  }

  const busy = disabled || attach.busy;
  return (
    <div className="stack" style={{ gap: 6, marginTop: 16 }}>
      <span className="field-label">Or use papers already in your Vault · {inVault.length}</span>
      {inVault.length > 8 && (
        <div className="row" style={{ gap: 6 }}>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by title, author or venue" aria-label="Filter the papers in your Vault" />
          <Button size="sm" variant="ghost" disabled={shown.length === 0 || busy}
            onClick={() => setChosen((c) => new Set([...c, ...shown.map((d) => d.id)]))}>
            Tick {q ? 'all shown' : 'all'}
          </Button>
          <Button size="sm" variant="ghost" disabled={chosen.size === 0 || busy} onClick={() => setChosen(new Set())}>Clear</Button>
        </div>
      )}
      {shown.length === 0 && <p className="muted small" style={{ margin: 0 }}>Nothing in your Vault matches “{query.trim()}”.</p>}
      <div className="pick-list" role="group" aria-label="Papers already in your Vault">
        {shown.map((d) => (
          <label className={`pick-row ${chosen.has(d.id) ? 'on' : ''}`} key={d.id}>
            <input
              type="checkbox"
              checked={chosen.has(d.id)}
              disabled={busy}
              onChange={() => setChosen((c) => {
                const n = new Set(c);
                if (n.has(d.id)) n.delete(d.id); else n.add(d.id);
                return n;
              })}
            />
            <span>
              <PaperTitle title={d.title || d.id} id={d.id} />
              <div className="v">{[d.pages > 0 ? `${d.pages} pages` : null, d.venue, d.authors.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</div>
            </span>
            <span />
          </label>
        ))}
      </div>
      <div className="row">
        <Button size="sm" icon="plus" disabled={chosen.size === 0 || disabled} loading={attach.busy} onClick={() => void attach.run()}>
          {chosen.size > 0 ? `Add ${plural(chosen.size, 'paper')} as seeds` : 'Tick papers to add them'}
        </Button>
        {attach.error && <span className="field-error">{attach.error}</span>}
      </div>
    </div>
  );
}
