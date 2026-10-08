import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, CalendarClock, Flame, Lightbulb, ShieldAlert, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { Avatar, Empty, ErrorState, PageLoading, Spark } from '../components/ui';
import { useDealPanel } from '../components/DealPanel';
import Timeline from '../components/Timeline';
import { dueIn, money, moneyFull } from '../fmt';

const Delta = ({ v, suffix = 'vs prior 30d' }) => {
  if (v === null || v === undefined) return <span className="xs muted">{suffix}</span>;
  const up = v >= 0;
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className={`delta ${up ? 'up' : 'down'}`}>{up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(v)}%</span>
      <span className="xs muted">{suffix}</span>
    </span>
  );
};

const ICONS = { risk: [ShieldAlert, '#c92a3e'], hot: [Flame, '#e8590c'], tip: [Lightbulb, '#6d4cf0'] };

export function ChartTip({ active, payload, label, fmt = money }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <b>{label}</b>
      {payload.map((p) => <div key={p.dataKey}><span style={{ color: p.color || p.stroke }}>●</span> {p.name || p.dataKey}: {fmt(p.value)}</div>)}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { openDeal, version } = useDealPanel();
  const { data, loading, error, reload } = useApi('/dashboard', [version]); // refetch when the deal drawer changes something
  const nav = useNavigate();
  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} retry={reload} />;

  const { kpis, funnel, trend, insights, upcoming, recent } = data;
  const maxCount = Math.max(...funnel.map((f) => f.value), 1);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>{greet}, {user.name.split(' ')[0]}</h2>
          <p>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · {kpis.activeDeals} active deals need your team’s attention</p>
        </div>
        <button className="btn primary" onClick={() => nav('/pipeline')}>Open pipeline</button>
      </div>

      <div className="kpis">
        <div className="card kpi"><div className="label">Pipeline value</div><div className="value num">{money(kpis.pipelineValue)}</div><span className="row" style={{ gap: 6 }}><span className="delta up"><ArrowUpRight size={14} />{money(kpis.pipelineAdded30)}</span><span className="xs muted">added in last 30d</span></span></div>
        <div className="card kpi"><div className="label">Won revenue · 90d</div><div className="value num">{money(kpis.wonRevenue)}</div><Delta v={kpis.wonDelta} suffix="vs prior 90d" /></div>
        <div className="card kpi"><div className="label">Active deals</div><div className="value num">{kpis.activeDeals}</div><span className="row" style={{ gap: 6 }}><span className="delta up"><ArrowUpRight size={14} />{kpis.activeAdded30}</span><span className="xs muted">opened in last 30d</span></span></div>
        <div className="card kpi"><div className="label">Win rate</div><div className="value num">{kpis.conversion}%</div><span className="xs muted">Forecast {money(kpis.weightedForecast)} weighted</span></div>
      </div>

      <div className="grid-2-1">
        <div className="card">
          <div className="card-h"><div><h3>Closed-won revenue</h3><p className="xs muted" style={{ marginTop: 2 }}>Last 6 months · current month to date</p></div></div>
          <div className="card-b" style={{ height: 280, paddingTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ left: -12, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="won" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4f46e5" stopOpacity={0.22} /><stop offset="100%" stopColor="#4f46e5" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke="#ecebe6" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#8b8b97', fontSize: 12 }} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8b8b97', fontSize: 12 }} tickFormatter={money} width={56} />
                <Tooltip content={<ChartTip />} cursor={{ stroke: '#d7d5cd' }} />
                <Area type="monotone" dataKey="won" name="Won" stroke="#4f46e5" strokeWidth={2.5} fill="url(#won)" dot={{ r: 3.5, fill: '#fff', stroke: '#4f46e5', strokeWidth: 2 }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="ai-card card-pad" style={{ padding: 20 }}>
          <div className="row sb" style={{ marginBottom: 10 }}><span className="ai-tag"><Spark /> AI insights</span><span className="xs muted">Updated just now</span></div>
          {insights.length === 0 && <p className="small muted">No urgent signals — nice work.</p>}
          {insights.map((i) => {
            const [Icon, color] = ICONS[i.kind] || ICONS.tip;
            return (
              <button className="insight" key={i.title} onClick={() => openDeal(i.dealId)}>
                <span className="insight-icon"><Icon size={16} color={color} /></span>
                <div><div className="insight-title">{i.title}</div><p>{i.body}</p></div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid-3">
        <div className="card">
          <div className="card-h"><h3>Pipeline funnel</h3><span className="xs muted">by value</span></div>
          <div className="card-b">
            {funnel.map((f, i) => (
              <div className="funnel-row" key={f.stage}>
                <span className="small sub">{f.label}</span>
                <div className="funnel-bar"><i style={{ width: `${Math.max(6, (f.value / maxCount) * 100)}%`, background: f.stage === 'won' ? '#2f9e44' : '#16161a' }} /><span>{f.count}</span></div>
                <span className="num strong small" style={{ textAlign: 'right' }}>{money(f.value)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Upcoming activities</h3><CalendarClock size={16} className="muted" /></div>
          <div className="card-b" style={{ paddingTop: 8 }}>
            {upcoming.length === 0 && <Empty title="Nothing scheduled">Tasks will appear here.</Empty>}
            {upcoming.map((t) => (
              <div className="list-row" key={t.id}>
                <span className="task-check" />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small strong truncate">{t.title}</div>
                  <div className="xs muted truncate">{t.deal || 'General'}{t.auto && ' · automated'}</div>
                </div>
                <span className={`badge ${new Date(t.dueAt) < new Date() ? 'red' : ''}`}>{dueIn(t.dueAt)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Recent activity</h3></div>
          <div className="card-b" style={{ paddingTop: 14 }}>
            <Timeline items={recent.slice(0, 5).map((a) => ({ ...a, title: a.deal ? `${a.title} · ${a.deal}` : a.title }))} />
          </div>
        </div>
      </div>
    </div>
  );
}
