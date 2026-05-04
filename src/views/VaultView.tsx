import { Fragment, useState } from 'react';
import { TopBar } from '../components/TopBar';
import { Glyph } from '../components/Glyph';
import { swatchFor, useProfiles, useVault, useChat } from '../lib/apiSwitch';
import type { ChatTurn } from '../types/radar';

function ChatBody({ body }: { body: ChatTurn['body'] }) {
  if (!Array.isArray(body)) return <div className="body">{body}</div>;
  return (
    <div className="body">
      {body.map((p, j) => {
        const parts = p.split(/(\[\d+\])/g);
        return (
          <p key={j}>
            {parts.map((part, k) => {
              const m = part.match(/^\[(\d+)\]$/);
              if (m) return <span key={k} className="chat-cite">{m[1]}</span>;
              return <Fragment key={k}>{part}</Fragment>;
            })}
          </p>
        );
      })}
    </div>
  );
}

export function VaultView() {
  const [activeTag, setActiveTag] = useState<string>('all');
  const [activeDoc, setActiveDoc] = useState<string>('v1');
  const [scope, setScope] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const { profiles } = useProfiles();
  const profileByKey = Object.fromEntries(profiles.map((p) => [p.key, p]));
  const { docs, stats, tagCounts, meta, loading, error, refresh } = useVault(activeTag);
  const { turns, sending, send, model, reset } = useChat();
  const modelLabel = (model ?? 'MODEL').toUpperCase();

  const toggleScope = (k: string) => {
    setScope((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const crumb = activeTag === 'all' ? 'ALL' : profileByKey[activeTag]?.name ?? activeTag;

  const onSend = async () => {
    const q = query.trim();
    if (!q) return;
    setQuery('');
    await send(q, [...scope]);
  };

  const scopedDocCount = [...scope].reduce((a, k) => a + (tagCounts[k] ?? 0), 0);

  return (
    <div className="view">
      <TopBar crumbs={['Vault', crumb]} />
      <div className="vault-grid">
        <div className="v-col">
          <div className="v-col-head">
            <span>
              Tags · <b>{profiles.length}</b>
            </span>
            <span>{stats?.docs ?? 0} DOCS</span>
          </div>
          <div
            className={`tag ${activeTag === 'all' ? 'on' : ''}`}
            onClick={() => setActiveTag('all')}
          >
            <span className="sw" style={{ background: 'var(--fg-3)' }} />
            <span>all documents</span>
            <span className="n">{stats?.docs ?? 0}</span>
          </div>
          {profiles.map((p) => (
            <div
              key={p.key}
              className={`tag ${activeTag === p.key ? 'on' : ''}`}
              onClick={() => setActiveTag(p.key)}
            >
              <span className="sw" style={{ background: swatchFor(p.hue) }} />
              <span>{p.name}</span>
              <span className="n">{tagCounts[p.key] ?? 0}</span>
            </div>
          ))}
          <div
            style={{
              padding: '16px 16px',
              marginTop: 'auto',
              borderTop: '1px solid var(--line)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--fg-4)',
              letterSpacing: '0.08em',
              lineHeight: 1.8,
            }}
          >
            <div>
              <span style={{ color: 'var(--fg-3)' }}>VAULT ·</span> {meta?.rootPath}
            </div>
            <div>
              PDFS <span className="num" style={{ color: 'var(--fg-2)' }}>{stats?.docs ?? 0}</span> ·
              PAGES <span className="num" style={{ color: 'var(--fg-2)' }}>{stats?.pages ?? 0}</span>
            </div>
            <div>
              CHUNKS <span className="num" style={{ color: 'var(--fg-2)' }}>{stats?.chunks ?? 0}</span> · {meta?.chunkSize}
            </div>
            <div>
              INDEX <span style={{ color: 'var(--fg-2)' }}>{meta?.indexPath}</span>
            </div>
            <div>
              LAST INGEST <span className="num" style={{ color: 'var(--fg-2)' }}>{meta?.lastIngest}</span>
            </div>
          </div>
        </div>

        <div className="v-col">
          <div className="v-col-head">
            <span>
              Documents · <b>{docs.length}</b> of <b>{stats?.docs ?? 0}</b>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Glyph name="search" size={11} />
              <span>FILTER</span>
            </span>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {error && docs.length === 0 && (
              <div className="empty" style={{ color: 'var(--err)' }}>
                FAILED TO LOAD DOCUMENTS
                <button
                  type="button"
                  onClick={refresh}
                  style={{
                    marginLeft: 12,
                    padding: '2px 10px',
                    background: 'transparent',
                    border: '1px solid var(--err)',
                    color: 'var(--err)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    cursor: 'pointer',
                  }}
                >
                  RETRY
                </button>
              </div>
            )}
            {!error && loading && docs.length === 0 && <div className="empty">LOADING DOCUMENTS…</div>}
            {!error && !loading && docs.length === 0 && (
              <div className="empty">NO DOCUMENTS FOR THIS TAG</div>
            )}
            {docs.map((d) => (
              <div
                key={d.id}
                className={`vault-doc ${activeDoc === d.id ? 'active' : ''}`}
                onClick={() => setActiveDoc(d.id)}
              >
                <div className="ttl">{d.title}</div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'var(--fg-4)',
                    textAlign: 'right',
                    alignSelf: 'start',
                  }}
                >
                  <div>{d.pages}p</div>
                  <div>{d.chunks}c</div>
                </div>
                <div className="aut">
                  {d.authors.join(', ')} <span className="sep">·</span> {d.venue}
                </div>
                <div className="tags">
                  {d.tags.map((tk) => {
                    const p = profileByKey[tk];
                    return (
                      <span key={tk} className="tg">
                        <span className="sw" style={{ background: swatchFor(p?.hue ?? 200) }} />
                        {p?.name ?? tk}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="v-col chat">
          <div className="chat-head">
            <span>RAG · Chat</span>
            <button
              type="button"
              className="chat-clear"
              onClick={reset}
              disabled={turns.length === 0 && !sending}
              title="Clear the chat panel. Each question is independent — clearing only affects this view."
            >
              NEW QUESTION
            </button>
          </div>
          <div className="chat-mode-banner" title="Each question is sent as a fresh, single-shot prompt. The model has no memory of prior turns.">
            SINGLE-SHOT · EACH QUESTION IS ITS OWN PROMPT · NO MEMORY OF PRIOR TURNS
          </div>
          <div className="chat-scope">
            <span className="lbl">SCOPE</span>
            {profiles.map((p) => (
              <span
                key={p.key}
                className="sc"
                onClick={() => toggleScope(p.key)}
                style={{
                  cursor: 'pointer',
                  color: scope.has(p.key) ? 'var(--fg)' : 'var(--fg-4)',
                  borderColor: scope.has(p.key) ? 'var(--fg-3)' : 'var(--line-2)',
                  background: scope.has(p.key) ? 'var(--bg-2)' : 'transparent',
                }}
              >
                <span
                  className="sw"
                  style={{ background: swatchFor(p.hue), opacity: scope.has(p.key) ? 1 : 0.4 }}
                />
                {p.name}
              </span>
            ))}
          </div>

          <div className="chat-body">
            {turns.map((m, i) => (
              <div key={i} className={`chat-msg ${m.who}`}>
                <div className="who">
                  <span>{m.who === 'user' ? '› YOU' : `‹ ASSISTANT · ${modelLabel}`}</span>
                  <span className="t">{m.t}</span>
                </div>
                <ChatBody body={m.body} />
                {m.sources && (
                  <div className="chat-sources">
                    {m.sources.map((s) => (
                      <div key={s.n} className="chat-src">
                        <span className="n">[{s.n}]</span>
                        <span className="t">{s.title}</span>
                        <span className="sc num">{s.score.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {sending && (
              <div className="empty" style={{ padding: '20px 0', textAlign: 'left' }}>
                {`‹ ${modelLabel} · RETRIEVING…`}
              </div>
            )}
          </div>

          <div className="chat-input-wrap">
            <div className="chat-input">
              <textarea
                placeholder="Ask across the scoped subset… (e.g., which of my FAIRSCAPE papers discuss Merkle attestations?)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onSend();
                  }
                }}
              />
              <button className="chat-send" onClick={onSend} disabled={sending}>
                SEND  ⏎
              </button>
            </div>
            <div
              style={{
                marginTop: 8,
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--fg-4)',
                letterSpacing: '0.06em',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>
                {scope.size} PROFILES · {scopedDocCount} DOCS IN SCOPE
              </span>
              <span>NO RERANKER · COSINE TOP-K</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
