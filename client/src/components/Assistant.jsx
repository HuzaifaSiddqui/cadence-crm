import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, X } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Spark, WinPill, Logo, useToast } from './ui';
import { boldParts, money } from '../fmt';
import { useDealPanel } from './DealPanel';

const SUGGESTIONS = ['Which deals are at risk?', 'Summarize Acme Corp', 'What should I follow up today?', 'Show deals above $20K likely to close this month'];

const Rich = ({ text }) => (
  <>{boldParts(text).map((p, i) => (p.b ? <b key={i}>{p.b}</b> : <span key={i}>{p.t}</span>))}</>
);

export default function Assistant({ onClose, thread, setThread }) {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { openDeal } = useDealPanel();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [thread, busy]);

  const ask = async (q) => {
    const message = (q ?? text).trim();
    if (!message || busy) return;
    setText('');
    setThread((t) => [...t, { role: 'user', text: message }]);
    setBusy(true);
    try {
      const r = await api('/ai/chat', { method: 'POST', body: { message } });
      setThread((t) => [...t, { role: 'ai', text: r.text, cards: r.cards }]);
      refresh();
    } catch (e) {
      setThread((t) => [...t, { role: 'ai', text: e.message, cards: [], error: true }]);
      if (e.code === 'PLAN_LIMIT') toast.error(e.message, { action: { label: 'Upgrade', onClick: () => nav('/billing') } });
    } finally { setBusy(false); }
  };

  return (
    <aside className="assistant" aria-label="AI Sales Assistant">
      <div className="as-head">
        <Spark size={26} />
        <div className="grow"><div style={{ fontWeight: 650, letterSpacing: '-0.01em' }}>Sales Assistant</div><div className="xs muted">Answers from your live pipeline</div></div>
        <button className="btn ghost icon sm" onClick={onClose} aria-label="Close assistant"><X size={17} /></button>
      </div>

      <div className="as-body">
        {thread.length === 0 && (
          <div className="col gap-16">
            <div>
              <h3 style={{ fontSize: 20, fontWeight: 650, letterSpacing: '-0.03em', lineHeight: 1.25 }}>Good to see you, {user.name.split(' ')[0]}.<br /><span style={{ color: 'var(--ink-3)' }}>What should we look at?</span></h3>
            </div>
            <div className="col gap-4" style={{ gap: 8, alignItems: 'flex-start' }}>
              {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>)}
            </div>
          </div>
        )}

        {thread.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="msg-user">{m.text}</div>
          ) : (
            <div key={i} className="msg-ai">
              <Spark size={22} />
              <div className="bubble grow">
                <p style={m.error ? { color: 'var(--red)' } : null}><Rich text={m.text} /></p>
                {m.cards?.map((c) => (
                  <button key={c.dealId} className="mini-card" onClick={() => openDeal(c.dealId)}>
                    <Logo name={c.company} size={28} color="#6d5ef5" />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="truncate strong small">{c.title}</div>
                      <div className="xs muted truncate">{c.reason}</div>
                    </div>
                    <div className="col" style={{ alignItems: 'flex-end', gap: 3 }}>
                      <span className="num strong small">{money(c.value)}</span>
                      <WinPill value={c.winScore} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        )}
        {busy && <div className="msg-ai"><Spark size={22} /><div className="typing" style={{ paddingTop: 6 }}><span /><span /><span /></div></div>}
        <div ref={end} />
      </div>

      <div className="as-input">
        <form onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <textarea
            rows={1} value={text} placeholder="Ask about deals, accounts, forecast…" aria-label="Ask the assistant"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
          />
          <button className="btn primary icon sm" style={{ borderRadius: 10 }} disabled={!text.trim() || busy} aria-label="Send"><ArrowUp size={16} /></button>
        </form>
      </div>
    </aside>
  );
}
