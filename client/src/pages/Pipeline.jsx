import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Plus, AlertTriangle, Search } from 'lucide-react';
import { api, useApi } from '../api';
import { useAuth } from '../auth';
import { Avatar, Field, Logo, Modal, PageLoading, ErrorState, WinPill, useToast } from '../components/ui';
import { useDealPanel } from '../components/DealPanel';
import { STAGES, dateShort, idleDays, money } from '../fmt';
import { useNavigate } from 'react-router-dom';

function DealCard({ deal, onOpen, onDragStart, dragging }) {
  const idle = idleDays(deal.signals.lastActivityAt);
  const stalled = !['won', 'lost'].includes(deal.stage) && idle >= 10;
  return (
    <div
      className={`deal-card ${dragging ? 'dragging' : ''}`} draggable role="button" tabIndex={0}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', deal.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(deal.id); }}
      onClick={() => onOpen(deal.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(deal.id)}
    >
      <div className="co"><Logo name={deal.company?.name} color={deal.company?.color} size={20} /><span className="truncate">{deal.company?.name}</span></div>
      <div className="ttl">{deal.title.replace(/^.*? — /, '')}</div>
      <div className="val num">{money(deal.value)}</div>
      <div className="foot">
        <WinPill value={deal.ai.winScore} />
        {deal.priority === 'high' && <span className="badge red" style={{ height: 20 }}>High</span>}
        <span className="right row xs muted" style={{ gap: 4 }}><CalendarDays size={12} />{dateShort(deal.expectedClose)}</span>
        {deal.owner && <Avatar name={deal.owner.name} color={deal.owner.color} size={22} />}
      </div>
      {stalled && <div className="warn-line"><AlertTriangle size={12} /> Stalled · {idle}d without activity</div>}
      {!stalled && deal.ai.risks?.[0] && deal.stage !== 'won' && deal.stage !== 'new' && deal.stage !== 'qualified' && <div className="warn-line" style={{ color: 'var(--amber)' }}><AlertTriangle size={12} />{deal.ai.risks[0]}</div>}
    </div>
  );
}

function NewDeal({ open, onClose, onCreated }) {
  const toast = useToast();
  const nav = useNavigate();
  const { data: companies } = useApi(open ? '/companies' : null, [open]);
  const [f, setF] = useState({ title: '', companyId: '', value: '', stage: 'new', expectedClose: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async () => {
    setBusy(true);
    try {
      await api('/deals', { method: 'POST', body: { ...f, companyId: f.companyId || undefined, expectedClose: f.expectedClose || undefined } });
      toast.show('Deal created');
      setF({ title: '', companyId: '', value: '', stage: 'new', expectedClose: '' });
      onCreated();
      onClose();
    } catch (e) {
      e.code === 'PLAN_LIMIT' ? toast.error(e.message, { action: { label: 'Upgrade', onClick: () => nav('/billing') } }) : toast.error(e.message);
    } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="New deal" subtitle="Add an opportunity to your pipeline."
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.title || busy} onClick={submit}>Create deal</button></>}>
      <Field label="Deal name"><input className="input" autoFocus value={f.title} onChange={set('title')} placeholder="Acme — Platform Expansion" /></Field>
      <Field label="Company">
        <select className="select" value={f.companyId} onChange={set('companyId')}>
          <option value="">Select a company…</option>
          {companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div className="grid-2" style={{ gap: 12 }}>
        <Field label="Value (USD)"><input className="input" type="number" min="0" value={f.value} onChange={set('value')} placeholder="25000" /></Field>
        <Field label="Stage"><select className="select" value={f.stage} onChange={set('stage')}>{STAGES.slice(0, 5).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
      </div>
      <Field label="Expected close"><input className="input" type="date" value={f.expectedClose} onChange={set('expectedClose')} /></Field>
    </Modal>
  );
}

export default function Pipeline() {
  const { user } = useAuth();
  const toast = useToast();
  const { openDeal, version } = useDealPanel();
  const { data, loading, error, reload, setData } = useApi('/deals', [version]);
  const [owner, setOwner] = useState('all');
  const [q, setQ] = useState('');
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);
  const [creating, setCreating] = useState(false);
  const [mobileStage, setMobileStage] = useState(null);

  const deals = useMemo(() => (data || []).filter((d) => (owner === 'all' || d.owner?.id === user.id) && (!q || `${d.title} ${d.company?.name}`.toLowerCase().includes(q.toLowerCase()))), [data, owner, q, user.id]);
  const open = deals.filter((d) => !['won', 'lost'].includes(d.stage));
  const pipeline = open.reduce((s, d) => s + d.value, 0);
  const weighted = open.reduce((s, d) => s + (d.value * d.ai.winScore) / 100, 0);

  useEffect(() => { document.title = 'Pipeline · Cadence'; }, []);
  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} retry={reload} />;

  const move = async (id, stage) => {
    const prev = data;
    const deal = data.find((d) => d.id === id);
    if (!deal || deal.stage === stage) return;
    setData((list) => list.map((d) => (d.id === id ? { ...d, stage } : d))); // optimistic
    try {
      const updated = await api(`/deals/${id}/stage`, { method: 'PATCH', body: { stage } });
      setData((list) => list.map((d) => (d.id === id ? updated : d)));
      toast.show(`Moved to ${STAGES.find((s) => s.id === stage).label} · win score ${updated.ai.winScore}%`);
    } catch (e) { setData(prev); toast.error(e.message); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h2>Sales pipeline</h2><p>Drag deals between stages. Scores update the moment a deal moves.</p></div>
        <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> New deal</button>
      </div>

      <div className="board-bar">
        <div className="seg" role="tablist">
          <button className={owner === 'all' ? 'on' : ''} onClick={() => setOwner('all')}>All deals</button>
          <button className={owner === 'me' ? 'on' : ''} onClick={() => setOwner('me')}>My deals</button>
        </div>
        <label className="search" style={{ width: 230 }}><Search size={15} /><input placeholder="Filter deals…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter deals" /></label>
        <div className="board-stats">
          <div className="s"><span className="xs muted">Open pipeline</span><b className="num">{money(pipeline)}</b></div>
          <div className="s"><span className="xs muted">AI-weighted</span><b className="num" style={{ color: 'var(--ai)' }}>{money(Math.round(weighted))}</b></div>
          <div className="s"><span className="xs muted">Open deals</span><b className="num">{open.length}</b></div>
        </div>
      </div>

      <div className="board" role="list">
        {STAGES.map((s) => {
          const list = deals.filter((d) => d.stage === s.id);
          return (
            <section
              key={s.id} role="listitem" aria-label={s.label}
              className={`lane ${over === s.id ? 'over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(s.id); }}
              onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData('text/plain') || dragId, s.id); setDragId(null); }}
            >
              <div className="lane-h"><span className="dot" style={{ background: s.color }} /><span className="t">{s.label}</span><span className="n">{list.length}</span><span className="v num">{money(list.reduce((a, d) => a + d.value, 0))}</span></div>
              {list.length === 0 && <div className="xs muted" style={{ textAlign: 'center', padding: '24px 0' }}>Drop a deal here</div>}
              {list.map((d) => <DealCard key={d.id} deal={d} dragging={dragId === d.id} onOpen={openDeal} onDragStart={setDragId} />)}
            </section>
          );
        })}
      </div>
      <NewDeal open={creating} onClose={() => setCreating(false)} onCreated={reload} />
    </div>
  );
}
