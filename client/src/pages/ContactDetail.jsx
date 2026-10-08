import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Mail, Phone, Send } from 'lucide-react';
import { api, useApi } from '../api';
import { useAuth } from '../auth';
import { Avatar, Badge, ErrorState, Logo, PageLoading, ScoreRing, WinPill, useToast } from '../components/ui';
import { useDealPanel } from '../components/DealPanel';
import Timeline from '../components/Timeline';
import { STAGE, dateShort, moneyFull, timeAgo } from '../fmt';

export default function ContactDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { openDeal, version } = useDealPanel();
  const { data: c, loading, error, reload } = useApi(`/contacts/${id}`, [version]);
  const [note, setNote] = useState('');

  if (loading && !c) return <PageLoading />;
  if (error && !c) return <ErrorState error={error} retry={reload} />;

  const addNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    try { await api(`/contacts/${id}/notes`, { method: 'POST', body: { content: note } }); setNote(''); toast.show('Note added'); reload(); } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="page">
      <button className="back" onClick={() => nav(-1)}><ArrowLeft size={15} /> Back</button>
      <div className="hero">
        <Avatar name={c.name} color={c.company?.color || '#6d5ef5'} size={60} />
        <div className="grow">
          <h2 style={{ fontSize: 26, fontWeight: 650, letterSpacing: '-0.035em' }}>{c.name}</h2>
          <div className="small muted">{c.title}{c.company && <> at <button style={{ background: 'none', border: 0, padding: 0, color: 'var(--ink-2)', fontWeight: 550 }} onClick={() => nav(`/companies/${c.company.id}`)}>{c.company.name}</button></>}</div>
        </div>
        <div className="only-desktop row" style={{ gap: 8 }}>
          {c.email && <a className="btn" href={`mailto:${c.email}`}><Mail size={15} />Email</a>}
          {c.phone && <a className="btn" href={`tel:${c.phone}`}><Phone size={15} />Call</a>}
        </div>
      </div>

      <div className="detail-grid">
        <div className="col gap-16">
          <div className="card card-pad">
            <div className="row" style={{ gap: 18 }}>
              <ScoreRing value={c.leadScore} size={72} stroke={7} />
              <div>
                <div className="strong">Lead score</div>
                <p className="small sub" style={{ marginTop: 2 }}>{c.leadScore >= 75 ? 'Highly engaged — a strong contact to multi-thread through.' : c.leadScore >= 50 ? 'Moderately engaged. A relevant touchpoint could move this forward.' : 'Low engagement so far. Consider a different channel.'}</p>
                <div className="row wrap" style={{ marginTop: 8, gap: 6 }}><Badge tone={c.status === 'customer' ? 'green' : c.status === 'engaged' ? 'blue' : ''}><span style={{ textTransform: 'capitalize' }}>{c.status}</span></Badge>{c.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-h"><h3>Opportunities</h3></div>
            <div className="card-b" style={{ paddingTop: 6 }}>
              {c.deals.length === 0 && <p className="small muted" style={{ padding: '10px 0' }}>This contact isn’t linked to a deal yet.</p>}
              {c.deals.map((d) => (
                <button key={d.id} className="contact-row" onClick={() => openDeal(d.id)}>
                  <div className="grow" style={{ minWidth: 0 }}><div className="strong truncate">{d.title}</div><div className="xs muted">{STAGE[d.stage].label} · closes {dateShort(d.expectedClose)}</div></div>
                  <span className="num strong">{moneyFull(d.value)}</span>
                  {!['won', 'lost'].includes(d.stage) && <WinPill value={d.ai.winScore} />}
                </button>
              ))}
            </div>
          </div>

          <div className="card card-pad">
            <div className="strong" style={{ marginBottom: 14 }}>Activity</div>
            <form className="composer" onSubmit={addNote}>
              <Avatar name={user.name} color={user.color} size={28} />
              <input className="input" placeholder="Log a note…" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn primary icon" aria-label="Add note" disabled={!note.trim()}><Send size={15} /></button>
            </form>
            <Timeline items={c.activities} empty="No activity logged for this contact yet." />
          </div>
        </div>

        <div className="col gap-16">
          <div className="card card-pad">
            <dl className="kv" style={{ margin: 0 }}>
              <dt>Email</dt><dd className="truncate">{c.email || '—'}</dd>
              <dt>Phone</dt><dd>{c.phone || '—'}</dd>
              <dt>Company</dt><dd>{c.company ? <span className="row" style={{ gap: 6 }}><Logo name={c.company.name} color={c.company.color} size={18} />{c.company.name}</span> : '—'}</dd>
              <dt>Industry</dt><dd>{c.company?.industry || '—'}</dd>
              <dt>Location</dt><dd>{c.company?.location || '—'}</dd>
              <dt>Owner</dt><dd>{c.owner && <span className="row" style={{ gap: 6 }}><Avatar name={c.owner.name} color={c.owner.color} size={18} />{c.owner.name}</span>}</dd>
              <dt>Last activity</dt><dd>{timeAgo(c.lastActivityAt)}</dd>
              <dt>Enrichment</dt><dd><Badge tone={c.enrichmentStatus === 'enriched' ? 'green' : 'amber'}>{c.enrichmentStatus}</Badge></dd>
            </dl>
          </div>
          {c.company && <button className="btn" onClick={() => nav(`/companies/${c.company.id}`)}><Building2 size={15} /> View account 360°</button>}
        </div>
      </div>
    </div>
  );
}
