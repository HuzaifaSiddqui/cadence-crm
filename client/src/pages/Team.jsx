import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Lock, MailPlus, ShieldCheck, Trash2, X } from 'lucide-react';
import { api, useApi } from '../api';
import { useAuth } from '../auth';
import { Avatar, Badge, ErrorState, Field, Modal, PageLoading, useToast } from '../components/ui';
import { timeAgo } from '../fmt';

const ROLE_TONE = { admin: 'accent', manager: 'blue', rep: '' };
const ROLE_DESC = { admin: 'Full control, including billing and roles', manager: 'Edits all records, builds workflows', rep: 'Works on their own deals and contacts' };

export default function Team() {
  const { user, isAdmin, refresh } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { data, loading, error, reload } = useApi('/team');
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('rep');
  const [link, setLink] = useState('');

  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} retry={reload} />;

  const guard = (e) => (e.code === 'PLAN_LIMIT' ? toast.error(e.message, { action: { label: 'Upgrade', onClick: () => nav('/billing') } }) : toast.error(e.message));
  const invite = async () => {
    try { const r = await api('/team/invite', { method: 'POST', body: { email, role } }); setLink(r.link); setEmail(''); reload(); refresh(); } catch (e) { guard(e); }
  };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast.show('Invite link copied'); } catch { toast.show(text); } };
  const changeRole = async (m, r) => { try { await api(`/team/${m.id}/role`, { method: 'PATCH', body: { role: r } }); toast.show(`${m.name} is now ${r === 'admin' ? 'an admin' : `a ${r}`}`); reload(); if (m.id === user.id) refresh(); } catch (e) { toast.error(e.message); } };
  const remove = async (m) => { if (!window.confirm(`Remove ${m.name} from the workspace?`)) return; try { await api(`/team/${m.id}`, { method: 'DELETE' }); reload(); refresh(); } catch (e) { toast.error(e.message); } };

  const perms = data.permissions;
  const all = [...new Set(Object.values(perms).flat())];

  return (
    <div className="page">
      <div className="page-head">
        <div><h2>Team &amp; roles</h2><p>{data.members.length} members · role-based access is enforced on the server for every request.</p></div>
        {isAdmin ? <button className="btn primary" onClick={() => { setLink(''); setInviting(true); }}><MailPlus size={16} /> Invite teammate</button> : <Badge><Lock size={12} /> Only admins can manage the team</Badge>}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Member</th><th>Role</th><th>Open deals</th><th>Last active</th><th /></tr></thead>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.id}>
                  <td><div className="row" style={{ gap: 12 }}><Avatar name={m.name} color={m.color} size={36} /><div><div className="strong">{m.name}{m.id === user.id && <span className="muted small"> (you)</span>}</div><div className="xs muted">{m.email}</div></div></div></td>
                  <td>{isAdmin ? <select className="select sm" style={{ width: 130 }} value={m.role} onChange={(e) => changeRole(m, e.target.value)} aria-label={`Role for ${m.name}`}><option value="admin">Admin</option><option value="manager">Manager</option><option value="rep">Sales rep</option></select> : <Badge tone={ROLE_TONE[m.role]}><span style={{ textTransform: 'capitalize' }}>{m.role}</span></Badge>}</td>
                  <td className="num">{m.openDeals}</td>
                  <td className="small sub">{timeAgo(m.lastActiveAt)}</td>
                  <td style={{ textAlign: 'right' }}>{isAdmin && m.id !== user.id && <button className="btn ghost icon sm danger" onClick={() => remove(m)} aria-label={`Remove ${m.name}`}><Trash2 size={15} /></button>}</td>
                </tr>
              ))}
              {data.invitations.map((i) => (
                <tr key={i.id}>
                  <td><div className="row" style={{ gap: 12 }}><span className="avatar" style={{ width: 36, height: 36, background: 'var(--sunken)', color: 'var(--ink-3)' }}><MailPlus size={16} /></span><div><div className="strong">{i.email}</div><div className="xs muted">Invitation pending</div></div></div></td>
                  <td><Badge tone={ROLE_TONE[i.role]}><span style={{ textTransform: 'capitalize' }}>{i.role}</span></Badge></td>
                  <td className="muted">—</td><td className="muted small">Not joined yet</td>
                  <td style={{ textAlign: 'right' }}>{isAdmin && <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}><button className="btn sm" onClick={() => copy(i.link)}><Copy size={13} /> Copy link</button><button className="btn ghost icon sm" onClick={async () => { await api(`/team/invitations/${i.id}`, { method: 'DELETE' }); reload(); refresh(); }} aria-label="Revoke invitation"><X size={15} /></button></div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-h"><div><h3 className="row" style={{ gap: 8 }}><ShieldCheck size={16} /> Permissions</h3><p className="xs muted" style={{ marginTop: 2 }}>What each role can do</p></div></div>
        <div className="card-b" style={{ overflowX: 'auto' }}>
          <table className="t" style={{ marginTop: -6 }}>
            <thead><tr><th style={{ paddingLeft: 0 }}>Capability</th>{['admin', 'manager', 'rep'].map((r) => <th key={r} style={{ textAlign: 'center', textTransform: 'capitalize' }}>{r === 'rep' ? 'Sales rep' : r}</th>)}</tr></thead>
            <tbody>
              {all.map((cap) => (
                <tr key={cap}><td style={{ paddingLeft: 0 }} className="small">{cap}</td>
                  {['admin', 'manager', 'rep'].map((r) => <td key={r} style={{ textAlign: 'center' }}>{perms[r].includes(cap) ? <Check size={16} color="#17803d" /> : <span className="muted">—</span>}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={inviting} onClose={() => setInviting(false)} title="Invite a teammate" subtitle="They’ll get a one-time link to set up their account."
        footer={link ? <button className="btn primary" onClick={() => setInviting(false)}>Done</button> : <><button className="btn" onClick={() => setInviting(false)}>Cancel</button><button className="btn primary" disabled={!email} onClick={invite}>Create invite</button></>}>
        {!link ? (
          <>
            <Field label="Work email"><input className="input" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" /></Field>
            <Field label="Role" hint={ROLE_DESC[role]}><select className="select" value={role} onChange={(e) => setRole(e.target.value)}><option value="rep">Sales rep</option><option value="manager">Manager</option><option value="admin">Admin</option></select></Field>
          </>
        ) : (
          <>
            <div className="small" style={{ background: 'var(--green-soft)', color: 'var(--green)', padding: '10px 12px', borderRadius: 10, fontWeight: 550 }}>Invitation created. Share this link — it works once.</div>
            <div className="row"><input className="input" readOnly value={link} onFocus={(e) => e.target.select()} /><button className="btn" onClick={() => copy(link)}><Copy size={14} /> Copy</button></div>
          </>
        )}
      </Modal>
    </div>
  );
}
