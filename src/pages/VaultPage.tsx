import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useChatHistory, useChatProviders, useProfiles, useVaultDocs, useVaultMeta, useVaultStats, useVaultTags } from '../api/hooks';
import { clearChatHistory, postChat } from '../api/endpoints/chat';
import { uploadPdf } from '../api/endpoints/vault';
import { errorMessage, fmtDate, fmtRelative, plural } from '../lib/format';
import { invalidate, setQueryData } from '../lib/query';
import { TERMS } from '../lib/terms';
import { toast } from '../lib/toast';
import type { ChatSource, ChatTurn, LLMProvider, VaultDoc } from '../types/radar';
import { Badge, Button, EmptyState, ErrorBox, Icon, IconButton, Input, LoadingRows, Select, Spinner, Swatch, Textarea, confirmDialog } from '../ui';
import { keys } from '../api/hooks';

export function VaultPage() {
  const [tag, setTag] = useState('all');
  const [search, setSearch] = useState('');
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  const { data: profiles } = useProfiles();
  const byKey = useMemo(() => Object.fromEntries((profiles ?? []).map((p) => [p.key, p])), [profiles]);
  const docs = useVaultDocs(tag);
  const stats = useVaultStats();
  const tags = useVaultTags();
  const meta = useVaultMeta();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = docs.data ?? [];
    if (!q) return list;
    return list.filter((d) => d.title.toLowerCase().includes(q) || d.authors.some((a) => a.toLowerCase().includes(q)) || d.venue.toLowerCase().includes(q));
  }, [docs.data, search]);
  const active = filtered.find((d) => d.id === activeDoc) ?? null;

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    let ok = 0;
    const fails: string[] = [];
    for (let i = 0; i < list.length; i++) {
      setUploading({ done: i, total: list.length });
      try {
        await uploadPdf(list[i], tag !== 'all' ? tag : undefined);
        ok += 1;
      } catch (e) {
        fails.push(`${list[i].name}: ${errorMessage(e)}`);
      }
    }
    setUploading(null);
    if (ok) toast.success(`${plural(ok, 'PDF')} added to the ${TERMS.vault}${tag !== 'all' ? ` and tagged ${byKey[tag]?.name ?? tag}` : ''}.`);
    for (const f of fails) toast.error(f);
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">{TERMS.vault}</h1>
          <p className="page-sub">Your PDFs, indexed for search. Seeds land here automatically; upload anything else you want to ask questions about.</p>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon="upload" onClick={() => inputRef.current?.click()} loading={!!uploading} title={tag !== 'all' ? `Uploads will be tagged "${byKey[tag]?.name ?? tag}"` : 'Upload PDFs'}>
            {uploading ? `Uploading ${uploading.done + 1}/${uploading.total}` : tag !== 'all' ? `Upload to ${byKey[tag]?.name ?? tag}` : 'Upload PDFs'}
          </Button>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
        </div>
      </header>

      <div className="vault-layout">
        <div className="vault-col">
          <div className="vault-col-head"><span>Collections</span><span className="small muted">{stats.data?.docs ?? '—'} docs</span></div>
          <div className="vault-col-body">
            <button type="button" className={`tag-row ${tag === 'all' ? 'on' : ''}`} onClick={() => setTag('all')}>
              <Icon name="vault" size={14} /> All documents <span className="n">{stats.data?.docs ?? ''}</span>
            </button>
            {(profiles ?? []).map((p) => (
              <button key={p.key} type="button" className={`tag-row ${tag === p.key ? 'on' : ''}`} onClick={() => setTag(p.key)} title={p.isDraft ? 'Draft interest' : undefined}>
                <Swatch hue={p.hue} size={8} /><span className="truncate">{p.name}</span><span className="n">{tags.data?.[p.key] ?? 0}</span>
              </button>
            ))}
          </div>
          {meta.data && stats.data && (
            <div className="vault-meta">
              <span><b>{stats.data.pages.toLocaleString()}</b> pages · <b>{stats.data.chunks.toLocaleString()}</b> chunks</span>
              <span>chunking: {meta.data.chunkSize}</span>
              <span>last upload: {stats.data.lastIngest ? fmtRelative(stats.data.lastIngest) : 'never'}</span>
            </div>
          )}
        </div>

        <div className="vault-col">
          <div className="vault-col-head">
            <span>Documents{docs.data ? ` · ${filtered.length}` : ''}</span>
            <div style={{ width: 200 }}>
              <Input placeholder="Filter by title, author, venue" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Filter documents" />
            </div>
          </div>
          <div className="vault-col-body">
            {docs.error && !docs.data && <div style={{ padding: 14 }}><ErrorBox message={errorMessage(docs.error)} onRetry={docs.refresh} /></div>}
            {docs.loading && !docs.data && <div style={{ padding: 14 }}><LoadingRows rows={4} /></div>}
            {docs.data && filtered.length === 0 && (
              search ? <EmptyState compact icon="search" title="No documents match" action={<Button size="sm" onClick={() => setSearch('')}>Clear filter</Button>} />
              : <EmptyState compact icon="file" title={tag === 'all' ? 'The vault is empty' : 'Nothing tagged here yet'} body={tag === 'all' ? 'Upload PDFs, or create an interest: its seeds are stored here.' : 'Upload PDFs while this collection is selected to tag them.'} action={<Button size="sm" icon="upload" onClick={() => inputRef.current?.click()}>Upload PDFs</Button>} />
            )}
            {filtered.map((d) => (
              <button key={d.id} type="button" className={`doc-row ${active?.id === d.id ? 'active' : ''}`} onClick={() => setActiveDoc(active?.id === d.id ? null : d.id)} aria-expanded={active?.id === d.id}>
                <div className="doc-title">{d.title}</div>
                <div className="doc-meta">
                  <span className="truncate" style={{ maxWidth: 260 }}>{d.authors.join(', ') || 'Unknown authors'}</span>
                  <span>{d.venue || '—'}</span>
                  <span>{d.pages} p</span>
                  {d.tags.map((t) => (
                    <span key={t} className="row" style={{ gap: 4 }}><Swatch hue={byKey[t]?.hue ?? 200} size={7} />{byKey[t]?.name ?? t}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>
          {active && <DocDetail doc={active} tagName={(t) => byKey[t]?.name ?? t} />}
        </div>

        <ChatPanel profiles={(profiles ?? []).filter((p) => !p.isDraft)} defaultScope={tag !== 'all' ? [tag] : []} />
      </div>
    </div>
  );
}

function DocDetail({ doc, tagName }: { doc: VaultDoc; tagName: (t: string) => string }) {
  return (
    <dl className="doc-detail">
      <div><dt>Title</dt><dd>{doc.title}</dd></div>
      <div><dt>Authors</dt><dd>{doc.authors.join(', ') || '—'}</dd></div>
      <div className="row" style={{ gap: 24 }}>
        <div><dt>Venue</dt><dd>{doc.venue || '—'}</dd></div>
        <div><dt>Pages</dt><dd>{doc.pages}</dd></div>
        <div><dt>Chunks</dt><dd>{doc.chunks}</dd></div>
        <div><dt>Added</dt><dd>{fmtDate(doc.added)}</dd></div>
      </div>
      <div><dt>Tagged</dt><dd>{doc.tags.length ? doc.tags.map(tagName).join(', ') : 'Untagged'}</dd></div>
    </dl>
  );
}

function ChatPanel({ profiles, defaultScope }: { profiles: import('../types/radar').Profile[]; defaultScope: string[] }) {
  const history = useChatHistory();
  const providers = useChatProviders();
  const [scope, setScope] = useState<Set<string>>(new Set(defaultScope));
  useEffect(() => setScope(new Set(defaultScope)), [defaultScope.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<ChatTurn | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<LLMProvider | ''>('');
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const turns = history.data ?? [];
  const configured = (providers.data?.available ?? []).filter((p) => p.configured);
  const activeProvider = providers.data?.available.find((p) => p.id === (provider || providers.data?.default));

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [turns.length, pending, sending]);

  async function send() {
    const q = query.trim();
    if (!q || sending) return;
    const t = new Date().toTimeString().slice(0, 5);
    const mine: ChatTurn = { who: 'user', t, body: q };
    setPending(mine);
    setSending(true);
    setError(null);
    setQuery('');
    try {
      const reply = await postChat(q, [...scope], provider || undefined);
      setQueryData<ChatTurn[]>(keys.chatHistory, (prev) => [...(prev ?? []), mine, reply]);
      setPending(null);
    } catch (e) {
      setError(errorMessage(e));
      setQuery(q);
      setPending(null);
    } finally {
      setSending(false);
    }
  }

  async function clear() {
    const ok = await confirmDialog({ title: 'Clear chat history?', body: <p>All previous questions and answers are deleted from the server.</p>, confirmLabel: 'Clear', danger: true });
    if (!ok) return;
    try {
      await clearChatHistory();
      invalidate(keys.chatHistory);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="vault-col">
      <div className="vault-col-head">
        <span className="row" style={{ gap: 6 }}><Icon name="chat" size={14} /> Ask your {TERMS.vault}</span>
        <IconButton icon="trash" label="Clear chat history" size="sm" onClick={clear} disabled={turns.length === 0} />
      </div>
      <div className="chat-msgs" ref={bodyRef}>
        {history.error && !history.data && <ErrorBox compact message={errorMessage(history.error)} onRetry={history.refresh} />}
        {turns.length === 0 && !pending && (
          <EmptyState compact icon="chat" title="Ask a question about your papers" body="Answers are grounded in the documents in scope and cite the passages used. Each question is answered on its own; there is no conversation memory." />
        )}
        {[...turns, ...(pending ? [pending] : [])].map((m, i) => (
          <div key={i} className={`chat-msg ${m.who}`}>
            <div className="chat-who">{m.who === 'user' ? 'You' : activeProvider ? activeProvider.model : 'Assistant'} · {m.t}</div>
            <div className="chat-bubble"><ChatBody body={m.body} /></div>
            {m.sources && m.sources.length > 0 && <Sources sources={m.sources} />}
          </div>
        ))}
        {sending && <div className="row muted small"><Spinner size={14} /> Retrieving and answering…</div>}
      </div>
      <div className="chat-input-wrap">
        <div className="scope-chips">
          <span>Scope:</span>
          <button type="button" className={`scope-chip ${scope.size === 0 ? 'on' : ''}`} onClick={() => setScope(new Set())}>Whole {TERMS.vault}</button>
          {profiles.map((p) => (
            <button key={p.key} type="button" className={`scope-chip ${scope.has(p.key) ? 'on' : ''}`} onClick={() => setScope((s) => { const n = new Set(s); if (n.has(p.key)) n.delete(p.key); else n.add(p.key); return n; })} aria-pressed={scope.has(p.key)}>
              <Swatch hue={p.hue} size={7} />{p.name}
            </button>
          ))}
        </div>
        {error && <ErrorBox compact message={error} />}
        <div className="chat-input-row">
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Which of these papers report sensitivity for early sepsis detection?"
            rows={2}
            aria-label="Question"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          />
          <Button variant="primary" icon="send" onClick={send} loading={sending} disabled={!query.trim()}>Ask</Button>
        </div>
        <div className="chat-foot">
          <span>{configured.length > 1 ? (
            <Select className="compact" value={provider} onChange={(e) => setProvider(e.target.value as LLMProvider | '')} aria-label="Model">
              <option value="">Default ({providers.data?.default})</option>
              {configured.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.model}</option>)}
            </Select>
          ) : activeProvider ? `Model: ${activeProvider.model}${activeProvider.configured ? '' : ' (not configured)'}` : ''}</span>
          <span>Enter to send · Shift+Enter for a new line</span>
        </div>
      </div>
    </div>
  );
}

function ChatBody({ body }: { body: ChatTurn['body'] }) {
  const paras = Array.isArray(body) ? body : [body];
  return (
    <>
      {paras.map((p, j) => (
        <p key={j}>
          {p.split(/(\[\d+\])/g).map((part, k) => {
            const m = part.match(/^\[(\d+)\]$/);
            return m ? <span key={k} className="chat-cite">{m[1]}</span> : <Fragment key={k}>{part}</Fragment>;
          })}
        </p>
      ))}
    </>
  );
}

function Sources({ sources }: { sources: ChatSource[] }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [all, setAll] = useState(false);
  const shown = all ? sources : sources.slice(0, 3);
  return (
    <div className="chat-sources">
      {shown.map((s) => {
        const has = !!s.text?.trim();
        const isOpen = open.has(s.n);
        return (
          <div key={s.n} className="chat-src">
            <button type="button" className="chat-src-row" disabled={!has} onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(s.n)) n.delete(s.n); else n.add(s.n); return n; })} title={has ? 'Show the passage used' : 'No passage text stored'} aria-expanded={isOpen}>
              <span className="n">[{s.n}]</span>
              <span className="truncate">{s.title}</span>
              <span className="sc">{s.score.toFixed(2)}</span>
              <span>{has && <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={12} />}</span>
            </button>
            {isOpen && has && <div className="chat-src-text">{s.text}</div>}
          </div>
        );
      })}
      {sources.length > 3 && <Button size="sm" variant="ghost" onClick={() => setAll((v) => !v)}>{all ? 'Fewer sources' : `All ${sources.length} sources`}</Button>}
      {sources.length > 0 && <span className="small muted"><Badge>{sources.length} sources</Badge></span>}
    </div>
  );
}
