import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Field, ScoreRing, Spark } from '../components/ui';

export default function Login({ invite = false }) {
  const { session, login, register, acceptInvite } = useAuth();
  const nav = useNavigate();
  const { token } = useParams();
  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({ name: '', email: '', password: '', workspaceName: '' });
  const [inv, setInv] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (invite) api(`/auth/invite/${token}`).then((d) => { setInv(d); setMode('invite'); }).catch((e) => setError(e.message));
  }, [invite, token]);

  if (session) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (mode === 'signin') await login(form.email, form.password);
      else if (mode === 'signup') await register(form);
      else await acceptInvite(token, { name: form.name, password: form.password });
      nav('/');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const demo = async () => {
    setBusy(true); setError('');
    try { await login('maya@northbeam.io', 'cadence-demo'); nav('/'); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <div className="auth-form">
        <div className="brand" style={{ padding: 0, marginBottom: 40 }}>
          <span className="brand-mark"><svg width="16" height="16" viewBox="0 0 32 32"><path d="M10 16.5c0-3.6 2.7-6.2 6.2-6.2 2 0 3.6.8 4.7 2.1l-2.1 1.9c-.6-.7-1.5-1.1-2.6-1.1-1.9 0-3.2 1.4-3.2 3.3s1.3 3.3 3.2 3.3c1.1 0 2-.4 2.6-1.1l2.1 1.9c-1.1 1.3-2.7 2.1-4.7 2.1-3.5 0-6.2-2.6-6.2-6.2z" fill="#fff" /></svg></span>
          <span className="brand-name">Cadence</span>
        </div>

        <h1 style={{ fontSize: 30, fontWeight: 650, letterSpacing: '-0.035em', lineHeight: 1.15 }}>
          {mode === 'signin' && 'Welcome back'}
          {mode === 'signup' && 'Create your workspace'}
          {mode === 'invite' && (inv ? `Join ${inv.workspace}` : 'Accept invitation')}
        </h1>
        <p className="muted" style={{ margin: '8px 0 28px' }}>
          {mode === 'signin' && 'Sign in to see what needs your attention today.'}
          {mode === 'signup' && 'Free for up to 3 seats. No credit card required.'}
          {mode === 'invite' && inv && `You’ve been invited as ${inv.role}. Set up your account to get started.`}
        </p>

        <form onSubmit={submit} className="col" style={{ gap: 14 }}>
          {mode !== 'signin' && <Field label="Full name"><input className="input" required value={form.name} onChange={set('name')} autoComplete="name" /></Field>}
          {mode === 'signup' && <Field label="Workspace name"><input className="input" required value={form.workspaceName} onChange={set('workspaceName')} placeholder="Acme Sales" /></Field>}
          {mode !== 'invite' && <Field label="Work email"><input className="input" type="email" required value={form.email} onChange={set('email')} autoComplete="email" placeholder="you@company.com" /></Field>}
          {mode === 'invite' && inv && <Field label="Email"><input className="input" value={inv.email} disabled /></Field>}
          <Field label="Password" hint={mode !== 'signin' ? 'At least 8 characters' : undefined}>
            <input className="input" type="password" required minLength={mode === 'signin' ? 1 : 8} value={form.password} onChange={set('password')} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
          </Field>
          {error && <div role="alert" className="small" style={{ color: 'var(--red)', background: 'var(--red-soft)', padding: '9px 12px', borderRadius: 10 }}>{error}</div>}
          <button className="btn primary" style={{ height: 42 }} disabled={busy || (mode === 'invite' && !inv)}>
            {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create workspace' : 'Join workspace'}<ArrowRight size={16} />
          </button>
        </form>

        {mode === 'signin' && (
          <>
            <div className="row" style={{ margin: '18px 0', color: 'var(--ink-4)' }}><hr className="divider grow" /><span className="xs">or</span><hr className="divider grow" /></div>
            <button className="btn ai" style={{ height: 42 }} onClick={demo} disabled={busy}><Sparkles size={15} /> Explore the demo workspace</button>
          </>
        )}

        {mode !== 'invite' && (
          <p className="small muted" style={{ marginTop: 22 }}>
            {mode === 'signin' ? 'New to Cadence?' : 'Already have an account?'}{' '}
            <button style={{ background: 'none', border: 0, color: 'var(--accent)', fontWeight: 600, padding: 0 }} onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}>
              {mode === 'signin' ? 'Create a workspace' : 'Sign in'}
            </button>
          </p>
        )}
      </div>

      <aside className="auth-art" aria-hidden="true">
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 440 }}>
          <span className="badge" style={{ background: 'rgba(255,255,255,.1)', color: '#d8d0ff' }}><ShieldCheck size={13} /> Multi-tenant · RBAC · Stripe billing</span>
          <h2 style={{ fontSize: 38, fontWeight: 650, letterSpacing: '-0.04em', lineHeight: 1.1, margin: '18px 0 12px' }}>The CRM that tells you what to do next.</h2>
          <p style={{ color: 'rgba(255,255,255,.62)', fontSize: 16 }}>Every deal gets an explainable AI win score, the risks behind it, and a recommended next action.</p>
        </div>
        <div className="glass" style={{ maxWidth: 440 }}>
          <div className="row" style={{ gap: 6, color: '#cfc4ff', fontSize: 11, fontWeight: 650, letterSpacing: '.05em', textTransform: 'uppercase' }}><Spark size={16} /> Deal Intelligence</div>
          <div className="row" style={{ gap: 16, margin: '14px 0' }}>
            <ScoreRing value={78} size={64} stroke={6} />
            <div><div style={{ fontWeight: 650 }}>Acme Corp — Platform Expansion</div><div style={{ color: 'rgba(255,255,255,.55)', fontSize: 13 }}>$84,000 · Proposal</div></div>
          </div>
          <p style={{ color: 'rgba(255,255,255,.82)', fontSize: 14, lineHeight: 1.55 }}>“Strong engagement over the last 14 days. Decision maker attended 2 meetings. Proposal viewed twice. No follow-up scheduled.”</p>
          <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.08)', fontSize: 13.5 }}><span style={{ color: '#b9a8ff', fontWeight: 650 }}>Recommended → </span>Follow up within 24 hours and clarify procurement timeline.</div>
        </div>
      </aside>
    </div>
  );
}
