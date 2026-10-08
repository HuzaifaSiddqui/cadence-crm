import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import { useApi } from '../api';
import { Avatar, ErrorState, PageLoading, Spark } from '../components/ui';
import { useDealPanel } from '../components/DealPanel';
import { ChartTip } from './Dashboard';
import { money } from '../fmt';

const axis = { axisLine: false, tickLine: false, tick: { fill: '#8b8b97', fontSize: 12 } };
const SEV = { high: [AlertOctagon, '#c92a3e', 'red'], medium: [AlertTriangle, '#b45f06', 'amber'], low: [Info, '#1c64c9', 'blue'] };

const Stat = ({ label, value, hint }) => (
  <div className="card kpi"><div className="label">{label}</div><div className="value num">{value}</div><span className="xs muted">{hint}</span></div>
);

export default function Analytics() {
  const { version } = useDealPanel();
  const { data: a, loading, error, reload } = useApi('/analytics', [version]);
  if (loading && !a) return <PageLoading />;
  if (error && !a) return <ErrorState error={error} retry={reload} />;

  const forecast = a.forecast.map((f) => ({ ...f, upside: Math.max(0, f.bestCase - f.commit) }));
  const maxDwell = Math.max(...a.conversion.map((c) => c.avgDays), 1);

  return (
    <div className="page">
      <div className="page-head"><div><h2>Analytics &amp; forecasting</h2><p>Computed live from stage history, win scores and activity — not static reports.</p></div></div>

      <div className="stat-row">
        <Stat label="Win rate" value={`${a.winRate}%`} hint="By closed deal count" />
        <Stat label="Avg sales cycle" value={`${a.velocity.avgCycle}d`} hint="Created → closed won" />
        <Stat label="Avg deal size" value={money(a.velocity.avgDeal)} hint="Closed-won deals" />
        <Stat label="Sales velocity" value={`${money(a.velocity.perDay)}/day`} hint={`${a.velocity.opportunities} opportunities × win rate × deal size ÷ cycle`} />
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-h"><div><h3>Revenue forecast</h3><p className="xs muted" style={{ marginTop: 2 }}>Next 4 months by expected close</p></div>
            <div className="legend"><span><i style={{ background: '#16161a' }} />Commit</span><span><i style={{ background: '#c9c7f5' }} />Upside</span><span><i style={{ background: '#6d4cf0' }} />AI-weighted</span></div></div>
          <div className="card-b" style={{ height: 290, paddingTop: 14 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={forecast} margin={{ left: 4, right: 8 }}>
                <CartesianGrid stroke="#ecebe6" vertical={false} />
                <XAxis dataKey="month" {...axis} dy={8} /><YAxis {...axis} tickFormatter={money} width={52} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(22,22,26,.04)' }} />
                <Bar dataKey="commit" name="Commit" stackId="a" fill="#16161a" radius={[0, 0, 4, 4]} barSize={34} />
                <Bar dataKey="upside" name="Upside" stackId="a" fill="#c9c7f5" radius={[6, 6, 0, 0]} />
                <Line dataKey="weighted" name="AI-weighted" stroke="#6d4cf0" strokeWidth={2.5} dot={{ r: 4, fill: '#fff', stroke: '#6d4cf0', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <hr className="divider" />
          <div className="row" style={{ padding: '14px 20px', gap: 28 }}>
            <div><div className="xs muted">Commit</div><b className="num">{money(a.forecastTotals.commit)}</b></div>
            <div><div className="xs muted">Best case</div><b className="num">{money(a.forecastTotals.bestCase)}</b></div>
            <div><div className="xs muted">AI-weighted</div><b className="num" style={{ color: 'var(--ai)' }}>{money(a.forecastTotals.weighted)}</b></div>
          </div>
        </div>

        <div className="ai-card" style={{ padding: 20 }}>
          <div className="row sb"><span className="ai-tag"><Spark /> AI-identified bottlenecks</span></div>
          <div style={{ marginTop: 10 }}>
            {a.bottlenecks.map((b) => {
              const [Icon, color, tone] = SEV[b.severity] || SEV.low;
              return (
                <div className="bn" key={b.title} style={{ borderColor: 'var(--ai-line)' }}>
                  <span className="insight-icon" style={{ background: '#fff' }}><Icon size={16} color={color} /></span>
                  <div><div className="row" style={{ gap: 8 }}><span className="insight-title">{b.title}</span><span className={`badge ${tone}`} style={{ height: 18, fontSize: 11 }}>{b.severity}</span></div><p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 3, lineHeight: 1.5 }}>{b.body}</p></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-h"><div><h3>Pipeline by stage</h3><p className="xs muted" style={{ marginTop: 2 }}>Open value vs AI-weighted value</p></div>
            <div className="legend"><span><i style={{ background: '#16161a' }} />Open</span><span><i style={{ background: '#6d4cf0' }} />Weighted</span></div></div>
          <div className="card-b" style={{ height: 260, paddingTop: 14 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={a.byStage} margin={{ left: 4, right: 8 }} barGap={4}>
                <CartesianGrid stroke="#ecebe6" vertical={false} />
                <XAxis dataKey="label" {...axis} dy={8} /><YAxis {...axis} tickFormatter={money} width={52} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(22,22,26,.04)' }} />
                <Bar dataKey="value" name="Open" fill="#16161a" radius={[6, 6, 0, 0]} /><Bar dataKey="weighted" name="Weighted" fill="#6d4cf0" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-h"><div><h3>Wins vs. losses</h3><p className="xs muted" style={{ marginTop: 2 }}>Closed deals per month</p></div>
            <div className="legend"><span><i style={{ background: '#2f9e44' }} />Won</span><span><i style={{ background: '#e2b4ba' }} />Lost</span></div></div>
          <div className="card-b" style={{ height: 260, paddingTop: 14 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={a.winLoss} margin={{ left: -24, right: 8 }}>
                <CartesianGrid stroke="#ecebe6" vertical={false} />
                <XAxis dataKey="month" {...axis} dy={8} /><YAxis {...axis} allowDecimals={false} />
                <Tooltip content={<ChartTip fmt={(v) => v} />} cursor={{ fill: 'rgba(22,22,26,.04)' }} />
                <Bar dataKey="won" name="Won" stackId="w" fill="#2f9e44" radius={[0, 0, 4, 4]} barSize={30} /><Bar dataKey="lost" name="Lost" stackId="w" fill="#e2b4ba" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-h"><div><h3>Stage conversion &amp; time in stage</h3><p className="xs muted" style={{ marginTop: 2 }}>From recorded stage history</p></div></div>
          <div className="card-b">
            <table className="t" style={{ marginTop: -4 }}>
              <thead><tr><th style={{ paddingLeft: 0 }}>Stage</th><th>Advance rate</th><th style={{ width: '38%' }}>Avg days in stage</th></tr></thead>
              <tbody>{a.conversion.map((c) => (
                <tr key={c.stage}><td style={{ paddingLeft: 0 }} className="strong small">{c.label}</td>
                  <td><span className="num strong">{c.rate}%</span> <span className="xs muted">→ {c.next}</span></td>
                  <td><div className="row" style={{ gap: 10 }}><div className="meter grow" style={{ height: 8 }}><i style={{ width: `${(c.avgDays / maxDwell) * 100}%`, background: c.avgDays === maxDwell ? 'var(--red)' : 'var(--ink)' }} /></div><span className="num small strong" style={{ width: 32, textAlign: 'right' }}>{c.avgDays}d</span></div></td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><div><h3>Team performance</h3><p className="xs muted" style={{ marginTop: 2 }}>Closed-won, open pipeline and activity (30d)</p></div></div>
          <div className="card-b" style={{ overflowX: 'auto' }}>
            <table className="t" style={{ marginTop: -4 }}>
              <thead><tr><th style={{ paddingLeft: 0 }}>Rep</th><th>Won</th><th>Pipeline</th><th>Win rate</th><th>Activity</th></tr></thead>
              <tbody>{a.team.map((u) => (
                <tr key={u.id}><td style={{ paddingLeft: 0 }}><div className="row" style={{ gap: 9 }}><Avatar name={u.name} color={u.color} size={26} /><div><div className="small strong">{u.name}</div><div className="xs muted" style={{ textTransform: 'capitalize' }}>{u.role}</div></div></div></td>
                  <td className="num strong small">{money(u.won)}</td><td className="num small">{money(u.pipeline)}</td><td className="num small">{u.winRate === null ? '—' : `${u.winRate}%`}</td><td className="num small">{u.activities}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
