import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, CalendarPlus, Check, RefreshCw, Send, Trophy, X } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Avatar, Drawer, Logo, ScoreRing, Skeleton, Spark, useToast } from './ui';
import Timeline from './Timeline';
import { STAGES, STAGE, dateShort, dueIn, moneyFull, timeAgo } from '../fmt';

const Ctx = createContext(null);
export const useDealPanel = () => useContext(Ctx);

export function DealPanelProvider({ children }) {
  const [dealId, setDealId] = useState(null);
  const [version, setVersion] = useState(0);
  const value = {
    openDeal: useCallback((id) => setDealId(id), []),
    version,
    bump: useCallback(() => setVersion((v) => v + 1), []),
  };
  return (
    <Ctx.Provider value={value}>
      {children}
      <Drawer open={Boolean(dealId)} onClose={() => setDealId(null)}>
        {dealId && <DealContent id={dealId} onClose={() => setDealId(null)} bump={value.bump} />}
      </Drawer>
    </Ctx.Provider>
  );
}

const band = (n) => (n >= 70 ? 'Likely to close' : n >= 45 ? 'Open to persuasion' : 'Needs intervention');

export function DealIntelligence({ deal, onFollowUp, onRegenerate, busy }) {
  const ai = deal.ai || {};
  const maxImpact = Math.max(1, ...(ai.factors || []).map((f) => Math.abs(f.impact)));
  return (
    <div className="ai-card intel" data-testid="deal-intelligence">
      <div className="row sb">
        <span className="ai-tag"><Spark /> Deal Intelligence</span>
        <button className="btn ghost sm" onClick={onRegenerate} disabled={busy === 'regen'} title="Re-run the analysis">
          <RefreshCw size={13} className={busy === 'regen' ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <div className="intel-top" style={{ marginTop: 12 }}>
        <ScoreRing value={ai.winScore || 0} size={76} stroke={7} />
        <div>
          <div style={{ fontWeight: 650, fontSize: 15, letterSpacing: '-0.01em' }}>AI Win Score</div>
          <div className="small sub">{band(ai.winScore || 0)}</div>
          <div className="xs muted" style={{ marginTop: 2 }}>{ai.source === 'openai' ? 'LLM-narrated' : 'Explainable model'} · {timeAgo(ai.updatedAt)}</div>
        </div>
      </div>

      <p className="intel-quote">“{ai.summary}”</p>

      {ai.risks?.length > 0 && (
        <div className="row wrap" style={{ marginTop: 12, gap: 6 }}>
          {ai.risks.map((r) => <span className="risk-chip" key={r}><AlertTriangle size={12} />{r}</span>)}
        </div>
      )}

      <div className="reco">
        <div className="label"><ArrowUpRight size={13} /> Recommended action</div>
        <div style={{ fontWeight: 550, fontSize: 14 }}>“{ai.action}”</div>
        {deal.canEdit && !['won', 'lost'].includes(deal.stage) && !deal.signals?.followUpScheduled && (
          <button className="btn ai sm" style={{ marginTop: 10 }} onClick={onFollowUp} disabled={busy === 'follow'}>
            <CalendarPlus size={14} /> Schedule follow-up
          </button>
        )}
        {deal.signals?.followUpScheduled && <div className="xs" style={{ marginTop: 8, color: 'var(--green)', fontWeight: 600 }}>✓ Follow-up scheduled</div>}
      </div>

      {ai.factors?.length > 0 && (
        <div className="factors">
          <div className="xs muted strong" style={{ textTransform: 'uppercase', letterSpacing: '.04em' }}>Why this score</div>
          {ai.factors.slice(0, 6).map((f) => (
            <div className={`factor ${f.impact < 0 ? 'neg' : ''}`} key={f.label}>
              <span className="truncate">{f.label}</span>
              <span className="bar"><i style={{ width: `${(Math.abs(f.impact) / maxImpact) * 100}%` }} /></span>
              <span className="num" style={{ textAlign: 'right', fontWeight: 600, color: f.impact < 0 ? 'var(--red)' : 'var(--ink-2)' }}>{f.impact > 0 ? '+' : ''}{f.impact}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DealContent({ id, onClose, bump }) {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [deal, setDeal] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try { setDeal(await api(`/deals/${id}`)); } catch (e) { toast.error(e.message); onClose(); }
  }, [id]); // eslint-disable-line
  useEffect(() => { setDeal(null); load(); }, [load]);

  const guard = async (key, fn, ok) => {
    setBusy(key);
    try { await fn(); if (ok) toast.show(ok); await load(); bump(); }
    catch (e) { e.code === 'PLAN_LIMIT' ? toast.error(e.message, { action: { label: 'Upgrade', onClick: () => { onClose(); nav('/billing'); } } }) : toast.error(e.message); }
    finally { setBusy(''); }
  };

  if (!deal) {
    return <div className="drawer-b"><Skeleton h={28} w="60%" style={{ marginBottom: 18 }} /><Skeleton h={280} style={{ borderRadius: 16 }} /></div>;
  }
  const closed = ['won', 'lost'].includes(deal.stage);

  return (
    <>
      <div className="drawer-h">
        <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
          <Logo name={deal.company?.name} color={deal.company?.color} size={40} />
          <div className="grow">
            <button className="muted small" style={{ background: 'none', border: 0, padding: 0 }} onClick={() => { onClose(); nav(`/companies/${deal.company?.id}`); }}>{deal.company?.name} ↗</button>
            <h3 style={{ fontSize: 18, fontWeight: 650, letterSpacing: '-0.025em', lineHeight: 1.3 }}>{deal.title}</h3>
          </div>
          <button className="btn ghost icon sm" onClick={onClose} aria-label="Close panel"><X size={17} /></button>
        </div>
        <div className="row wrap" style={{ marginTop: 14, gap: 10 }}>
          <span className="num" style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.03em' }}>{moneyFull(deal.value)}</span>
          <select
            className="select sm" style={{ width: 'auto' }} value={deal.stage} disabled={!deal.canEdit}
            onChange={(e) => guard('stage', () => api(`/deals/${id}/stage`, { method: 'PATCH', body: { stage: e.target.value } }), 'Stage updated')}
          >
            {[...STAGES, STAGE.lost].map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {deal.owner && <span className="row small sub"><Avatar name={deal.owner.name} color={deal.owner.color} size={20} />{deal.owner.name}</span>}
        </div>
      </div>

      <div className="drawer-b">
        <DealIntelligence
          deal={deal} busy={busy}
          onFollowUp={() => guard('follow', () => api(`/deals/${id}/followup`, { method: 'POST', body: { title: `Follow up: ${deal.title}` } }), 'Follow-up scheduled for tomorrow')}
          onRegenerate={() => guard('regen', () => api(`/deals/${id}/insight`, { method: 'POST' }), 'Insight refreshed')}
        />

        <div className="card card-pad" style={{ marginTop: 16 }}>
          <dl className="kv" style={{ margin: 0 }}>
            <dt>Primary contact</dt><dd>{deal.contact ? <>{deal.contact.name}<span className="muted"> · {deal.contact.title}</span></> : '—'}</dd>
            <dt>Expected close</dt><dd>{dateShort(deal.expectedClose)}</dd>
            <dt>Priority</dt><dd style={{ textTransform: 'capitalize' }}>{deal.priority}</dd>
            <dt>Engagement</dt><dd className="small">{deal.signals.meetings14d} meetings · {deal.signals.emailsOpened14d} emails opened · {deal.signals.proposalViews} proposal views</dd>
          </dl>
        </div>

        {deal.tasks?.length > 0 && (
          <div className="card card-pad" style={{ marginTop: 16 }}>
            <div className="strong" style={{ marginBottom: 6 }}>Tasks</div>
            {deal.tasks.map((t) => (
              <div className="list-row" key={t.id}>
                <span className={`task-check ${t.done ? 'done' : ''}`}>{t.done && <Check size={12} />}</span>
                <span className="grow small" style={{ textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--ink-3)' : 'inherit' }}>{t.title}{t.auto && <span className="badge ai" style={{ marginLeft: 8, height: 18 }}>Automated</span>}</span>
                <span className="xs muted">{t.done ? 'Done' : dueIn(t.dueAt)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          <div className="strong" style={{ marginBottom: 12 }}>Activity</div>
          {deal.canEdit && (
            <form className="composer" onSubmit={(e) => { e.preventDefault(); if (!note.trim()) return; guard('note', async () => { await api(`/deals/${id}/notes`, { method: 'POST', body: { content: note } }); setNote(''); }, 'Note added'); }}>
              <Avatar name={user.name} color={user.color} size={28} />
              <input className="input" placeholder="Log a note…" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn primary icon" aria-label="Add note" disabled={!note.trim()}><Send size={15} /></button>
            </form>
          )}
          <Timeline items={deal.activities} />
        </div>

        {deal.canEdit && !closed && (
          <div className="row" style={{ marginTop: 8, gap: 10 }}>
            <button className="btn" style={{ color: 'var(--green)' }} onClick={() => guard('won', () => api(`/deals/${id}/stage`, { method: 'PATCH', body: { stage: 'won' } }), 'Marked as won 🎉')}><Trophy size={15} /> Mark won</button>
            <button className="btn danger" onClick={() => guard('lost', () => api(`/deals/${id}/stage`, { method: 'PATCH', body: { stage: 'lost' } }), 'Marked as lost')}>Mark lost</button>
          </div>
        )}
        {!deal.canEdit && <p className="xs muted" style={{ marginTop: 16 }}>You have read-only access to this deal — it belongs to {deal.owner?.name}.</p>}
      </div>
    </>
  );
}
