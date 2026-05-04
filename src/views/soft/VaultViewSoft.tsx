import { Fragment, useState } from 'react';
import { IconSoft } from '../../components/soft/IconSoft';
import { swatchFor, useProfiles, useVault, useChat } from '../../lib/apiSwitch';
import type { ChatTurn } from '../../types/radar';

function Bubble({ body }: { body: ChatTurn['body'] }) {
  if (!Array.isArray(body)) return <>{body}</>;
  return (
    <>
      {body.map((p, j) => {
        const parts = p.split(/(\[\d+\])/g);
        return (
          <p key={j}>
            {parts.map((part, k) => {
              const m = part.match(/^\[(\d+)\]$/);
              if (m) return <span key={k} className="va-cite">{m[1]}</span>;
              return <Fragment key={k}>{part}</Fragment>;
            })}
          </p>
        );
      })}
    </>
  );
}

export function VaultViewSoft() {
  const [activeTag, setActiveTag] = useState<string>('all');
  const [scope, setScope] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const { profiles } = useProfiles();
  const profileByKey = Object.fromEntries(profiles.map((p) => [p.key, p]));
  const { docs, stats, tagCounts, loading, error, refresh } = useVault(activeTag);
  const { turns, sending, send, model } = useChat();

  const toggleScope = (k: string) => {
    setScope((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const onSend = async () => {
    const q = query.trim();
    if (!q) return;
    setQuery('');
    await send(q, [...scope]);
  };

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <h1>Your vault</h1>
          <div className="sub">
            {stats?.docs ?? 0} papers uploaded · ask questions across any tag
          </div>
        </div>
      </div>

      <div className="va-tags">
        <div
          className={`pill ${activeTag === 'all' ? 'on' : ''}`}
          onClick={() => setActiveTag('all')}
        >
          All papers <span className="n">{stats?.docs ?? 0}</span>
        </div>
        {profiles.map((p) => (
          <div
            key={p.key}
            className={`pill ${activeTag === p.key ? 'on' : ''}`}
            onClick={() => setActiveTag(p.key)}
          >
            <span className="d" style={{ background: swatchFor(p.hue) }} />
            {p.name} <span className="n">{tagCounts[p.key] ?? 0}</span>
          </div>
        ))}
      </div>

      <div className="va-grid">
        <div className="va-docs">
          {error && docs.length === 0 && (
            <div className="empty" style={{ color: 'var(--err)' }}>
              Couldn’t load documents.{' '}
              <button
                type="button"
                onClick={refresh}
                className="btn ghost"
                style={{ marginLeft: 8, padding: '2px 10px' }}
              >
                Retry
              </button>
            </div>
          )}
          {!error && loading && docs.length === 0 && <div className="empty">Loading documents…</div>}
          {!error && !loading && docs.length === 0 && (
            <div className="empty">No documents for this tag.</div>
          )}
          {docs.map((d) => (
            <div key={d.id} className="va-doc">
              <div className="t">{d.title}</div>
              <div className="a">
                {d.authors.join(', ')} <span className="sep">·</span> {d.venue}
              </div>
              <div className="meta meta-row">
                {d.tags.map((tk) => {
                  const p = profileByKey[tk];
                  return (
                    <span key={tk} className="tag">
                      <span className="d" style={{ background: swatchFor(p?.hue ?? 200) }} />
                      {p?.name ?? tk}
                    </span>
                  );
                })}
                <span className="pg">{d.pages} pp · {d.chunks} chunks</span>
              </div>
            </div>
          ))}
        </div>

        <div className="va-chat">
          <div className="va-chat-head">
            <h3>Ask your vault</h3>
            <span className="model">{model ?? '—'}</span>
          </div>
          <div className="va-scope">
            <span className="lbl">Scope</span>
            {profiles.map((p) => (
              <span
                key={p.key}
                className={`va-sc ${scope.has(p.key) ? 'on' : ''}`}
                onClick={() => toggleScope(p.key)}
              >
                <span className="d" style={{ background: swatchFor(p.hue) }} />
                {p.name}
              </span>
            ))}
          </div>
          <div className="va-body">
            {turns.map((m, i) => (
              <div key={i} className={`va-msg ${m.who}`}>
                <div className="bubble">
                  <Bubble body={m.body} />
                  {m.sources && (
                    <div className="va-src">
                      {m.sources.map((s) => (
                        <div key={s.n} className="row">
                          <span className="n">[{s.n}]</span>
                          <span className="t">{s.title}</span>
                          <span className="sc">{s.score.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && <div className="empty" style={{ padding: '8px 0' }}>Thinking…</div>}
          </div>
          <div className="va-input">
            <textarea
              placeholder="Ask a question about your saved papers…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
            />
            <button
              className="btn primary"
              style={{ padding: '10px 12px' }}
              onClick={onSend}
              disabled={sending}
            >
              <IconSoft name="send" size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
