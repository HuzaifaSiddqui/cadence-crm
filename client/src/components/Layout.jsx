import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, BarChart3, CreditCard, KanbanSquare, LayoutDashboard, LogOut, Search, Users, Workflow, UserRound, Sparkles } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Avatar, Meter } from './ui';
import Assistant from './Assistant';
import { DealPanelProvider, useDealPanel } from './DealPanel';
import { timeAgo } from '../fmt';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { to: '/contacts', label: 'Contacts', icon: UserRound },
  { to: '/workflows', label: 'Workflows', icon: Workflow },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
];
const NAV2 = [
  { to: '/team', label: 'Team & roles', icon: Users },
  { to: '/billing', label: 'Billing', icon: CreditCard },
];
const TITLES = { '/': 'Dashboard', '/pipeline': 'Pipeline', '/contacts': 'Contacts & Companies', '/workflows': 'Workflows', '/analytics': 'Analytics', '/team': 'Team & roles', '/billing': 'Billing' };

function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const ref = useRef(null);
  const { openDeal } = useDealPanel();

  const load = () => api('/notifications').then(setItems).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const unread = items.filter((n) => !n.read).length;

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="btn icon" aria-label="Notifications" onClick={() => setOpen((o) => !o)} style={{ position: 'relative' }}>
        <Bell size={17} />
        {unread > 0 && <span style={{ position: 'absolute', top: 7, right: 8, width: 8, height: 8, borderRadius: 99, background: 'var(--accent)', border: '2px solid var(--bg)' }} />}
      </button>
      {open && (
        <div className="popover">
          <div className="row sb" style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
            <b>Notifications</b>
            {unread > 0 && <button className="btn ghost sm" onClick={async () => { await api('/notifications/read-all', { method: 'POST' }); load(); }}>Mark all read</button>}
          </div>
          {items.length === 0 && <p className="muted small" style={{ padding: 20, textAlign: 'center' }}>You’re all caught up.</p>}
          {items.map((n) => (
            <button key={n.id} className={`noti ${n.read ? '' : 'unread'}`} onClick={() => { setOpen(false); n.dealId && openDeal(n.dealId); }}>
              <div><div className="strong small">{n.title}</div><div className="small sub">{n.body}</div><div className="xs muted" style={{ marginTop: 2 }}>{timeAgo(n.at)}</div></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Shell() {
  const { user, workspace, plan, usage, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [thread, setThread] = useState([]);
  const title = TITLES['/' + loc.pathname.split('/')[1]] || (loc.pathname.startsWith('/companies') ? 'Account' : loc.pathname.startsWith('/contacts') ? 'Contact' : 'Cadence');

  useEffect(() => {
    const h = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setAssistantOpen((o) => !o); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const seatsMax = plan.limits.seats;
  const aiMax = plan.limits.aiQueries;

  const mobile = [
    { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
    { to: '/pipeline', label: 'Deals', icon: KanbanSquare },
    { to: '/contacts', label: 'Contacts', icon: UserRound },
    { to: '/analytics', label: 'Insights', icon: BarChart3 },
  ];

  return (
    <div className={`app ${assistantOpen ? 'with-assistant' : ''}`}>
      <nav className="sidebar" aria-label="Primary">
        <div className="brand">
          <span className="brand-mark"><svg width="16" height="16" viewBox="0 0 32 32"><path d="M10 16.5c0-3.6 2.7-6.2 6.2-6.2 2 0 3.6.8 4.7 2.1l-2.1 1.9c-.6-.7-1.5-1.1-2.6-1.1-1.9 0-3.2 1.4-3.2 3.3s1.3 3.3 3.2 3.3c1.1 0 2-.4 2.6-1.1l2.1 1.9c-1.1 1.3-2.7 2.1-4.7 2.1-3.5 0-6.2-2.6-6.2-6.2z" fill="#fff" /></svg></span>
          <span className="brand-name">Cadence</span>
        </div>
        <div className="ws-switch">
          <span className="ws-dot">{workspace.name[0]}</span>
          <div className="grow" style={{ minWidth: 0 }}><div className="truncate strong small">{workspace.name}</div><div className="xs muted">{plan.name} plan</div></div>
        </div>

        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={17} />{label}</NavLink>
        ))}
        <button className={`nav-item ai ${assistantOpen ? 'open' : ''}`} onClick={() => setAssistantOpen((o) => !o)}>
          <Sparkles size={17} />Sales Assistant<span className="count">⌘J</span>
        </button>

        <div className="nav-label">Workspace</div>
        {NAV2.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={17} />{label}</NavLink>
        ))}

        <div className="side-foot">
          <div className="usage-mini">
            <div className="row sb small" style={{ marginBottom: 6 }}><span className="strong">AI queries</span><span className="muted num">{usage.aiQueries}{aiMax ? ` / ${aiMax}` : ''}</span></div>
            <Meter value={usage.aiQueries} max={aiMax} tone={aiMax && usage.aiQueries / aiMax < 0.8 ? 'ai' : undefined} />
            <div className="row sb small" style={{ margin: '10px 0 6px' }}><span className="strong">Seats</span><span className="muted num">{usage.seats}{seatsMax ? ` / ${seatsMax}` : ''}</span></div>
            <Meter value={usage.seats} max={seatsMax} />
          </div>
          <div className="me">
            <Avatar name={user.name} color={user.color} size={32} />
            <div className="grow" style={{ minWidth: 0 }}><div className="truncate strong small">{user.name}</div><div className="xs muted" style={{ textTransform: 'capitalize' }}>{user.role}</div></div>
            <button className="btn ghost icon sm" onClick={() => { logout(); nav('/login'); }} aria-label="Sign out" title="Sign out"><LogOut size={15} /></button>
          </div>
        </div>
      </nav>

      <div className="main">
        <header className="topbar">
          <h1>{title}</h1>
          <div className="right row" style={{ gap: 10 }}>
            <label className="search"><Search size={15} /><input placeholder="Search deals, contacts…" aria-label="Search" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) nav(`/contacts?q=${encodeURIComponent(e.target.value.trim())}`); }} /><kbd>⌘K</kbd></label>
            <button className="btn ai" onClick={() => setAssistantOpen((o) => !o)}><Sparkles size={15} /><span className="only-desktop-inline">Ask Cadence</span></button>
            <Notifications />
          </div>
        </header>
        <Outlet />
      </div>

      {assistantOpen && <Assistant onClose={() => setAssistantOpen(false)} thread={thread} setThread={setThread} />}

      <nav className="bottom-nav" aria-label="Mobile">
        {mobile.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'on' : '')}><Icon size={20} />{label}</NavLink>
        ))}
        <button className="ai-btn" onClick={() => setAssistantOpen(true)}><Sparkles size={20} />Ask AI</button>
      </nav>
    </div>
  );
}

export default function Layout() {
  return (
    <DealPanelProvider>
      <Shell />
    </DealPanelProvider>
  );
}
