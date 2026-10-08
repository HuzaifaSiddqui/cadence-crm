import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Globe, MapPin, Send, Users } from 'lucide-react';
import { api, useApi } from '../api';
import { useAuth } from '../auth';
import { Avatar, Badge, Empty, ErrorState, Logo, PageLoading, Spark, WinPill, useToast } from '../components/ui';
import { useDealPanel } from '../components/DealPanel';
import Timeline from '../components/Timeline';
import { STAGE, dateShort, money, moneyFull } from '../fmt';

const HEALTH = { Healthy: 'green', Customer: 'green', 'Needs attention': 'amber', 'At risk': 'red', Cold: '' };

export default function CompanyDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { openDeal, version } = useDealPanel();
  const { data: c, loading, error, reload } = useApi(`/companies/${id}`, [version]);
  const [tab, setTab] = useState('timeline');
  const [note, setNote] = useState('');

  if (loading && !c) return <PageLoading />;
  if (error && !c) return <ErrorState error={error} retry={reload} />;

  const addNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    try { await api(`/companies/${id}/notes`, { method: 'POST', body: { content: note } }); setNote(''); toast.show('Note added'); reload(); } catch (err) { toast.error(err.message); }
  };
  const openDeals = c.deals.filter((d) => !['won', 'lost'].includes(d.stage));

  return (
    <div className="page">
      <button className="back" onClick={() => nav(-1)}><ArrowLeft size={15} /> Back</button>
      <div className="hero">
        <Logo name={c.name} color={c.color} size={56} />
        <div className="grow">
          <div className="row wrap" style={{ gap: 10 }}><h2 style={{ fontSize: 26, fontWeight: 650, letterSpacing: '-0.035em' }}>{c.name}</h2><Badge tone={HEALTH[c.ai.health]}>{c.ai.health}</Badge></div>
          <div className="row wrap small muted" style={{ gap: 14, marginTop: 4 }}>
            <span>{c.industry}</span><span className="row" style={{ gap: 4 }}><Users size={13} />{c.size}</span><span className="row" style={{ gap: 4 }}><MapPin size={13} />{c.location}</span><span className="row" style={{ gap: 4 }}><Globe size={13} />{c.domain}</span>
          </div>
        </div>
      </div>

      <div className="detail-grid">
        <div className="col gap-16">
          <div className="ai-card" style={{ padding: 20 }}>
            <div className="row sb"><span className="ai-tag"><Spark /> AI account summary</span><span className="xs muted">Generated from live CRM data</span></div>
            <p style={{ fontSize: 15, lineHeight: 1.6, margin: '12px 0 14px' }}>{c.ai.summary}</p>
            <div className="reco" style={{ marginTop: 0 }}>
              <div className="label"><ArrowUpRight size={13} /> Recommended next step</div>
              <div style={{ fontWeight: 550 }}>{c.ai.nextStep}</div>
            </div>
          </div>

          <div className="card">
            <div className="card-h" style={{ paddingBottom: 0 }}>
              <div className="tabs" style={{ border: 0, width: '100%' }}>
                {[['timeline', 'Timeline', c.activities.length], ['deals', 'Opportunities', c.deals.length], ['contacts', 'People', c.contacts.length]].map(([k, l, n]) => (
                  <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}<span className="pill">{n}</span></button>
                ))}
              </div>
            </div>
            <hr className="divider" />
            <div className="card-b" style={{ paddingTop: 20 }}>
              {tab === 'timeline' && (
                <>
                  <form className="composer" onSubmit={addNote}>
                    <Avatar name={user.name} color={user.color} size={28} />
                    <input className="input" placeholder="Add a note to this account…" value={note} onChange={(e) => setNote(e.target.value)} />
                    <button className="btn primary icon" aria-label="Add note" disabled={!note.trim()}><Send size={15} /></button>
                  </form>
                  <Timeline items={c.activities} />
                </>
              )}
              {tab === 'deals' && (c.deals.length ? c.deals.map((d) => (
                <button key={d.id} className="contact-row" onClick={() => openDeal(d.id)}>
                  <div className="grow" style={{ minWidth: 0 }}><div className="strong truncate">{d.title}</div><div className="xs muted">{d.stageLabel} · closes {dateShort(d.expectedClose)}</div></div>
                  <span className="num strong">{moneyFull(d.value)}</span>
                  {!['won', 'lost'].includes(d.stage) ? <WinPill value={d.ai.winScore} /> : <Badge tone={d.stage === 'won' ? 'green' : 'red'}>{STAGE[d.stage].label}</Badge>}
                </button>
              )) : <Empty title="No opportunities">Create a deal from the pipeline.</Empty>)}
              {tab === 'contacts' && c.contacts.map((p) => (
                <button key={p.id} className="contact-row" onClick={() => nav(`/contacts/${p.id}`)}>
                  <Avatar name={p.name} color={c.color} size={36} />
                  <div className="grow" style={{ minWidth: 0 }}><div className="strong">{p.name}</div><div className="xs muted">{p.title}</div></div>
                  <span className="xs muted">Score</span><span className="num strong">{p.leadScore}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="col gap-16">
          <div className="card card-pad">
            <div className="row sb"><span className="muted small">Open pipeline</span><span className="num strong" style={{ fontSize: 20, letterSpacing: '-0.03em' }}>{money(c.ai.pipeline)}</span></div>
            <hr className="divider" style={{ margin: '14px 0' }} />
            <div className="row sb"><span className="muted small">Won to date</span><span className="num strong">{money(c.ai.wonValue)}</span></div>
            <div className="row sb" style={{ marginTop: 10 }}><span className="muted small">Open deals</span><span className="num strong">{openDeals.length}</span></div>
            <div className="row sb" style={{ marginTop: 10 }}><span className="muted small">Account owner</span>{c.owner && <span className="row small strong" style={{ gap: 6 }}><Avatar name={c.owner.name} color={c.owner.color} size={20} />{c.owner.name}</span>}</div>
            <div className="row sb" style={{ marginTop: 10 }}><span className="muted small">Enrichment</span><Badge tone={c.enrichmentStatus === 'enriched' ? 'green' : 'amber'}>{c.enrichmentStatus}</Badge></div>
          </div>

          <div className="card card-pad">
            <div className="strong" style={{ marginBottom: 4 }}>Buying committee</div>
            {c.contacts.slice(0, 5).map((p) => (
              <button key={p.id} className="contact-row" onClick={() => nav(`/contacts/${p.id}`)}>
                <Avatar name={p.name} color={c.color} size={30} />
                <div className="grow" style={{ minWidth: 0 }}><div className="small strong truncate">{p.name}</div><div className="xs muted truncate">{p.title}</div></div>
                {['exec', 'director'].includes(p.seniority) && <Badge tone="accent" style={{ height: 18 }}>{p.seniority === 'exec' ? 'Exec' : 'Dir'}</Badge>}
              </button>
            ))}
          </div>

          {c.tags?.length > 0 && <div className="row wrap" style={{ gap: 6 }}>{c.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>}
        </div>
      </div>
    </div>
  );
}
