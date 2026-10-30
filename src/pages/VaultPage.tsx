import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useChatHistory, useChatProviders, useProfiles, useVaultDocs, useVaultMeta, useVaultStats, useVaultTags } from '../api/hooks';
import { clearChatHistory, postChat } from '../api/endpoints/chat';
import { errorMessage, fmtDate, fmtRelative } from '../lib/format';
import { invalidate, setQueryData } from '../lib/query';
import { TERMS } from '../lib/terms';
import { useSearchParam } from '../lib/router';
import { toast } from '../lib/toast';
import { displayTitle, workId } from '../lib/unmatched';
import { CHAT_ENABLED } from '../lib/features';
import type { ChatSource, ChatTurn, LLMProvider, VaultDoc } from '../types/radar';
import { Badge, Button, EmptyState, ErrorBox, Icon, IconButton, Input, LoadingRows, Select, Spinner, Swatch, Textarea, confirmDialog } from '../ui';
import { keys } from '../api/hooks';
import { PaperLink } from '../ui/pickers';

export function VaultPage() {
  const [tagParam, setTagParam] = useSearchParam('interest');
  const tag = tagParam ?? 'all';
  const setTag = (t: string) => setTagParam(t === 'all' ? null : t);
  const [search, setSearch] = useState('');
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  const { data: profiles } = useProfiles();
  const byKey = useMemo(() => Object.fromEntries((profiles ?? []).map((p) => [p.key, p])), [profiles]);
  const docs = useVaultDocs(tag);
  const stats = useVaultStats();
  const tags = useVaultTags();
  const meta = useVaultMeta();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = docs.data ?? [];
    if (!q) return list;
    return list.filter((d) => d.title.toLowerCase().includes(q) || d.authors.some((a) => a.toLowerCase().includes(q)) || d.venue.toLowerCase().includes(q));
  }, [docs.data, search]);
  const active = filtered.find((d) => d.id === activeDoc) ?? null;

  // No upload here: PDFs are uploaded into an interest (the wizard's first
  // step, an interest's Seeds tab), so every upload is someone's seed
  // (FUNCTIONAL_SPEC 1.1). The vault lists what is there.

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">{TERMS.vault}</h1>
          <p className="page-sub">{CHAT_ENABLED
            ? 'Your PDFs, indexed for search. Seeds land here automatically.'
            : 'Every paper you have uploaded or imported. Upload PDFs from an interest (its first step, or its Seeds tab); anything here can become a seed of an interest.'}</p>
        </div>
      </header>

      <div className={`vault-layout ${CHAT_ENABLED ? '' : 'no-chat'}`}>
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
              <span><b>{stats.data.pages.toLocaleString()}</b> pages</span>
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
              : <EmptyState compact icon="file" title={tag === 'all' ? 'The vault is empty' : 'Nothing tagged here yet'} body={tag === 'all' ? 'Create an interest: the PDFs you upload as its seeds are stored here.' : 'Add seeds to this interest from its Seeds tab.'} />
            )}
            {filtered.map((d) => (
              // A div, not a <button>: the title is a link, and a link inside a
              // button is invalid HTML -- Firefox gives the click to the button.
              <div
                key={d.id} role="button" tabIndex={0}
                className={`doc-row ${active?.id === d.id ? 'active' : ''}`}
                onClick={() => setActiveDoc(active?.id === d.id ? null : d.id)}
                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setActiveDoc(active?.id === d.id ? null : d.id); } }}
                aria-expanded={active?.id === d.id}
              >
                <div className="doc-title"><PaperLink title={displayTitle(d)} id={workId(d)} /></div>
                <div className="doc-meta">
                  <span className="truncate" style={{ maxWidth: 260 }}>{d.authors.join(', ') || 'Unknown authors'}</span>
                  <span>{d.venue || '—'}</span>
                  <span>{d.pages} p</span>
                  {d.tags.map((t) => (
                    <span key={t} className="row" style={{ gap: 4 }}><Swatch hue={byKey[t]?.hue ?? 200} size={7} />{byKey[t]?.name ?? t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {active && <DocDetail doc={active} tagName={(t) => byKey[t]?.name ?? t} />}
        </div>

        {CHAT_ENABLED && <ChatPanel profiles={(profiles ?? []).filter((p) => !p.isDraft)} defaultScope={tag !== 'all' ? [tag] : []} />}
      </div>
    </div>
  );
}

function DocDetail({ doc, tagName }: { doc: VaultDoc; tagName: (t: string) => string }) {
  return (
    <dl className="doc-detail">
      <div><dt>Title</dt><dd><PaperLink title={displayTitle(doc)} id={workId(doc)} /></dd></div>
      <div><dt>Authors</dt><dd>{doc.authors.join(', ') || '—'}</dd></div>
      <div className="row" style={{ gap: 24 }}>
        <div><dt>Venue</dt><dd>{doc.venue || '—'}</dd></div>
        <div><dt>Pages</dt><dd>{doc.pages}</dd></div>
        <div><dt>Added</dt><dd>{fmtDate(doc.added)}</dd></div>
      </div>
      <div><dt>Tagged</dt><dd>{doc.tags.length ? doc.tags.map(tagName).join(', ') : 'Untagged'}</dd></div>
      {/* OpenAlex's, or else the one printed in this PDF, which says so (FUNCTIONAL_SPEC P.5 Q2). */}
      <div>
        <dt>Abstract{doc.abstract && doc.abstractSource === 'pdf' && <span className="muted small"> · from the PDF</span>}</dt>
        <dd>{doc.abstract || '—'}</dd>
      </div>
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
        {/* True of the backend (services/chat.py answers one turn; history is
            stored for display only). The old UI said it as "SINGLE-SHOT · EACH
            QUESTION IS ITS OWN PROMPT · NO MEMORY OF PRIOR TURNS", which
            people asked about; the new one said nothing, which reads as if
            it does remember. */}
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          Each question is answered on its own: earlier questions and answers
          aren&rsquo;t sent with it, so ask in full rather than &ldquo;and what about…&rdquo;.
        </p>
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
