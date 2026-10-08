import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, Plus, Search, Sparkles, Tag, Trash2, UserRound, UserCog } from 'lucide-react';
import { api, useApi } from '../api';
import { useAuth } from '../auth';
import { Avatar, Badge, Empty, ErrorState, Field, Logo, Modal, PageLoading, Skeleton, useToast } from '../components/ui';
import { moneyFull, money, timeAgo } from '../fmt';

const STATUS_TONE = { lead: '', engaged: 'blue', customer: 'green', churned: 'red' };
const ENRICH = { enriched: ['green', 'Enriched'], pending: ['amber', 'Pending'], failed: ['red', 'Failed'] };

const ScoreBar = ({ v }) => (
  <div className="score-bar"><div className={`meter ${v >= 75 ? '' : v >= 50 ? 'warn' : 'bad'}`} style={{ '--x': 1 }}><i style={{ width: `${v}%`, background: v >= 75 ? 'var(--green)' : v >= 50 ? '#e0a030' : '#d4606c' }} /></div><span className="num small strong">{v}</span></div>
);

function AddContact({ open, onClose, onDone }) {
  const toast = useToast();
  const { data: companies } = useApi(open ? '/companies' : null, [open]);
  const [f, setF] = useState({ name: '', email: '', title: '', companyId: '' });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = async () => {
    try { await api('/contacts', { method: 'POST', body: { ...f, companyId: f.companyId || undefined } }); toast.show('Contact added'); setF({ name: '', email: '', title: '', companyId: '' }); onDone(); onClose(); }
    catch (e) { toast.error(e.message); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add contact" footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.name} onClick={save}>Add contact</button></>}>
      <Field label="Full name"><input className="input" autoFocus value={f.name} onChange={set('name')} /></Field>
      <div className="grid-2" style={{ gap: 12 }}>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Job title"><input className="input" value={f.title} onChange={set('title')} /></Field>
      </div>
      <Field label="Company"><select className="select" value={f.companyId} onChange={set('companyId')}><option value="">None</option>{companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    </Modal>
  );
}

function ContactsTab() {
  const nav = useNavigate();
  const toast = useToast();
  const { isManager } = useAuth();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [status, setStatus] = useState('');
  const [sel, setSel] = useState([]);
  const [adding, setAdding] = useState(false);
  const path = `/contacts?${new URLSearchParams({ ...(q && { q }), ...(status && { status }) })}`;
  const { data, loading, error, reload } = useApi(path);
  const { data: team } = useApi(isManager ? '/team' : null);

  const all = data || [];
  const allSel = all.length > 0 && sel.length === all.length;
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const bulk = async (action, value, msg) => {
    try { await api('/contacts/bulk', { method: 'POST', body: { ids: sel, action, value } }); toast.show(msg); setSel([]); reload(); }
    catch (e) { toast.error(e.message); }
  };

  return (
    <>
      <div className="board-bar">
        <label className="search" style={{ width: 300 }}><Search size={15} /><input value={q} onChange={(e) => { setQ(e.target.value); setSel([]); }} placeholder="Search name, email, company…" aria-label="Search contacts" /></label>
        <select className="select sm" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option><option value="lead">Lead</option><option value="engaged">Engaged</option><option value="customer">Customer</option>
        </select>
        <span className="muted small">{all.length} contacts</span>
        <button className="btn primary right" onClick={() => setAdding(true)}><Plus size={16} /> Add contact</button>
      </div>

      {sel.length > 0 && (
        <div className="bulk" role="toolbar" aria-label="Bulk actions">
          <b>{sel.length} selected</b>
          <button className="btn sm" onClick={() => bulk('enrich', null, `Enriched ${sel.length} contacts`)}><Sparkles size={14} /> Enrich</button>
          <button className="btn sm" onClick={() => { const t = window.prompt('Tag to add'); t && bulk('tag', t.trim(), `Tagged ${sel.length} contacts`); }}><Tag size={14} /> Tag</button>
          {isManager && (
            <select className="select sm" style={{ width: 150, background: 'rgba(255,255,255,.12)', color: '#fff', border: 0 }} value="" onChange={(e) => e.target.value && bulk('assign', e.target.value, 'Owner updated')} aria-label="Assign owner">
              <option value="">Assign owner…</option>{team?.members.map((m) => <option key={m.id} value={m.id} style={{ color: '#000' }}>{m.name}</option>)}
            </select>
          )}
          {isManager && <button className="btn sm" onClick={() => window.confirm(`Delete ${sel.length} contacts?`) && bulk('delete', null, 'Contacts deleted')}><Trash2 size={14} /> Delete</button>}
          <button className="btn sm ghost right" style={{ color: '#fff' }} onClick={() => setSel([])}>Clear</button>
        </div>
      )}

      <div className="card only-desktop">
        <div className="table-wrap">
          <table className="t">
            <thead><tr>
              <th style={{ width: 40 }}><input type="checkbox" className="check" checked={allSel} onChange={() => setSel(allSel ? [] : all.map((c) => c.id))} aria-label="Select all" /></th>
              <th>Name</th><th>Company</th><th>Status</th><th style={{ width: 140 }}>Lead score</th><th>Owner</th><th>Last activity</th><th>Enrichment</th><th>Tags</th>
            </tr></thead>
            <tbody>
              {loading && !data && [0, 1, 2, 3, 4, 5].map((i) => <tr key={i}><td colSpan={9}><Skeleton h={22} /></td></tr>)}
              {all.map((c) => (
                <tr key={c.id} className={`click ${sel.includes(c.id) ? 'sel' : ''}`} onClick={() => nav(`/contacts/${c.id}`)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" className="check" checked={sel.includes(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.name}`} /></td>
                  <td><div className="row" style={{ gap: 10 }}><Avatar name={c.name} color={c.company?.color || '#8b8b97'} size={32} /><div><div className="strong">{c.name}</div><div className="xs muted">{c.title}</div></div></div></td>
                  <td>{c.company ? <span className="row" style={{ gap: 8 }}><Logo name={c.company.name} color={c.company.color} size={20} />{c.company.name}</span> : '—'}</td>
                  <td><Badge tone={STATUS_TONE[c.status]}><span style={{ textTransform: 'capitalize' }}>{c.status}</span></Badge></td>
                  <td><ScoreBar v={c.leadScore} /></td>
                  <td>{c.owner && <span className="row small" style={{ gap: 7 }}><Avatar name={c.owner.name} color={c.owner.color} size={20} />{c.owner.name.split(' ')[0]}</span>}</td>
                  <td className="small sub">{timeAgo(c.lastActivityAt)}</td>
                  <td><Badge tone={ENRICH[c.enrichmentStatus][0]}>{ENRICH[c.enrichmentStatus][1]}</Badge></td>
                  <td><div className="row" style={{ gap: 4 }}>{c.tags.slice(0, 2).map((t) => <span className="tag" key={t}>{t}</span>)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && all.length === 0 && <Empty title="No contacts found">Try a different search or filter.</Empty>}
        </div>
      </div>

      <div className="mobile-list">
        {all.map((c) => (
          <button key={c.id} className="card" style={{ display: 'flex', gap: 12, padding: 14, marginBottom: 10, width: '100%', textAlign: 'left', alignItems: 'center' }} onClick={() => nav(`/contacts/${c.id}`)}>
            <Avatar name={c.name} color={c.company?.color || '#8b8b97'} size={40} />
            <div className="grow" style={{ minWidth: 0 }}><div className="strong truncate">{c.name}</div><div className="xs muted truncate">{c.title} · {c.company?.name}</div><div className="row" style={{ marginTop: 6, gap: 6 }}><Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge><span className="xs muted">{timeAgo(c.lastActivityAt)}</span></div></div>
            <div className="num strong">{c.leadScore}</div>
          </button>
        ))}
      </div>
      <AddContact open={adding} onClose={() => setAdding(false)} onDone={reload} />
    </>
  );
}

function CompaniesTab() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const { data, loading } = useApi(`/companies${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const all = data || [];
  return (
    <>
      <div className="board-bar">
        <label className="search" style={{ width: 300 }}><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies…" aria-label="Search companies" /></label>
        <span className="muted small">{all.length} companies</span>
      </div>
      <div className="card only-desktop">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Company</th><th>Industry</th><th>Size</th><th>Location</th><th>Contacts</th><th>Open pipeline</th><th>Won</th><th>Owner</th><th>Enrichment</th></tr></thead>
            <tbody>
              {loading && !data && [0, 1, 2, 3, 4].map((i) => <tr key={i}><td colSpan={9}><Skeleton h={22} /></td></tr>)}
              {all.map((c) => (
                <tr key={c.id} className="click" onClick={() => nav(`/companies/${c.id}`)}>
                  <td><div className="row" style={{ gap: 10 }}><Logo name={c.name} color={c.color} size={32} /><div><div className="strong">{c.name}</div><div className="xs muted">{c.domain}</div></div></div></td>
                  <td className="small">{c.industry}</td><td className="small sub">{c.size}</td><td className="small sub">{c.location}</td>
                  <td className="num">{c.contacts}</td>
                  <td>{c.openDeals ? <><span className="num strong">{money(c.openValue)}</span> <span className="xs muted">· {c.openDeals} {c.openDeals === 1 ? 'deal' : 'deals'}</span></> : <span className="muted">—</span>}</td>
                  <td className="num">{c.wonValue ? money(c.wonValue) : <span className="muted">—</span>}</td>
                  <td>{c.owner && <span className="row small" style={{ gap: 7 }}><Avatar name={c.owner.name} color={c.owner.color} size={20} />{c.owner.name.split(' ')[0]}</span>}</td>
                  <td><Badge tone={ENRICH[c.enrichmentStatus][0]}>{ENRICH[c.enrichmentStatus][1]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mobile-list">
        {all.map((c) => (
          <button key={c.id} className="card" style={{ display: 'flex', gap: 12, padding: 14, marginBottom: 10, width: '100%', textAlign: 'left', alignItems: 'center' }} onClick={() => nav(`/companies/${c.id}`)}>
            <Logo name={c.name} color={c.color} size={40} />
            <div className="grow" style={{ minWidth: 0 }}><div className="strong truncate">{c.name}</div><div className="xs muted truncate">{c.industry} · {c.location}</div></div>
            <div style={{ textAlign: 'right' }}><div className="num strong small">{c.openValue ? money(c.openValue) : '—'}</div><div className="xs muted">{c.contacts} contacts</div></div>
          </button>
        ))}
      </div>
    </>
  );
}

export default function Contacts() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'companies' ? 'companies' : 'contacts';
  return (
    <div className="page">
      <div className="page-head"><div><h2>Contacts &amp; companies</h2><p>Every person and account in one searchable workspace.</p></div></div>
      <div className="tabs" style={{ marginBottom: 18 }}>
        <button className={tab === 'contacts' ? 'on' : ''} onClick={() => setParams({})}><UserRound size={15} />Contacts</button>
        <button className={tab === 'companies' ? 'on' : ''} onClick={() => setParams({ tab: 'companies' })}><Building2 size={15} />Companies</button>
      </div>
      {tab === 'contacts' ? <ContactsTab /> : <CompaniesTab />}
    </div>
  );
}
