import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, CreditCard, Download, Lock, Sparkles } from 'lucide-react';
import { api, useApi } from '../api';
import { useAuth } from '../auth';
import { Badge, ErrorState, Field, Meter, Modal, PageLoading, useToast } from '../components/ui';
import { dateLong, dateShort, moneyFull } from '../fmt';

const ORDER = { free: 0, pro: 1, business: 2 };

function UsageRow({ label, used, max }) {
  return (
    <div className="usage-row">
      <div className="row sb small"><span className="strong">{label}</span><span className="muted num">{used.toLocaleString()} {max ? `of ${max.toLocaleString()}` : '· unlimited'}</span></div>
      <Meter value={used} max={max} />
    </div>
  );
}

/** Mirrors Stripe Checkout so the whole flow is explorable without keys (demo mode only). */
function DemoCheckout({ plan, seats, onClose, onPaid }) {
  const [busy, setBusy] = useState(false);
  const total = plan.price * seats;
  return (
    <Modal open onClose={onClose} title={`Upgrade to ${plan.name}`} subtitle="Demo checkout — add STRIPE_SECRET_KEY to switch to real Stripe Checkout."
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn accent" disabled={busy} onClick={async () => { setBusy(true); await onPaid(); }}><Lock size={14} /> {busy ? 'Processing…' : `Pay ${moneyFull(total)}`}</button></>}>
      <div className="card card-pad" style={{ background: 'var(--sunken)', border: 0 }}>
        <div className="row sb"><span>Cadence {plan.name} × {seats} seats</span><b className="num">{moneyFull(total)}/mo</b></div>
        <div className="xs muted" style={{ marginTop: 4 }}>{moneyFull(plan.price)} per seat, billed monthly. Cancel anytime.</div>
      </div>
      <Field label="Card number"><div className="input row" style={{ gap: 8 }}><CreditCard size={16} className="muted" /><span className="num">4242 4242 4242 4242</span></div></Field>
      <div className="grid-2" style={{ gap: 12 }}><Field label="Expiry"><div className="input row num">12 / 30</div></Field><Field label="CVC"><div className="input row num">•••</div></Field></div>
      <p className="xs muted">Test card prefilled — no real payment is taken.</p>
    </Modal>
  );
}

export default function Billing() {
  const { isAdmin, workspace, refresh } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { data, loading, error, reload } = useApi('/billing');
  const [checkout, setCheckout] = useState(null);

  // Returning from real Stripe Checkout — confirm the session so it works even without a webhook (local dev).
  useEffect(() => {
    const sid = params.get('session_id');
    if (params.get('checkout') === 'success' && sid) {
      api('/billing/confirm', { method: 'POST', body: { sessionId: sid } }).then(() => { toast.show('Subscription activated — thank you!'); refresh(); reload(); }).catch((e) => toast.error(e.message)).finally(() => setParams({}));
    } else if (params.get('checkout') === 'cancelled') { toast.show('Checkout cancelled'); setParams({}); }
  }, []); // eslint-disable-line

  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} retry={reload} />;

  const { current, plans, usage, invoices, mode } = data;
  const cur = plans.find((p) => p.id === current.plan);

  const choose = async (plan) => {
    try {
      if (plan.id === 'free') { if (window.confirm('Downgrade to Free? Limits apply immediately.')) { await api('/billing/demo/activate', { method: 'POST', body: { plan: 'free' } }); await refresh(); reload(); toast.show('Switched to Free'); } return; }
      const r = await api('/billing/checkout', { method: 'POST', body: { plan: plan.id } });
      if (r.url) window.location.href = r.url;
      else setCheckout(plan);
    } catch (e) { toast.error(e.message); }
  };
  const manage = async () => {
    try { const r = await api('/billing/portal', { method: 'POST' }); window.location.href = r.url; } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h2>Billing &amp; plan</h2><p>Per-seat pricing with usage limits enforced by the API.</p></div>
        {!isAdmin && <Badge><Lock size={12} /> Only admins can change the plan</Badge>}
      </div>

      <div className="grid-2-1">
        <div className="card card-pad">
          <div className="row sb" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="row" style={{ gap: 10 }}><h3 style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.03em' }}>{cur.name} plan</h3><Badge tone={current.status === 'active' ? 'green' : current.status === 'past_due' ? 'red' : ''}>{current.status === 'active' ? 'Active' : current.status === 'none' ? 'Free forever' : current.status}</Badge></div>
              <p className="small muted" style={{ marginTop: 4 }}>{current.renewsAt ? `Renews ${dateLong(current.renewsAt)} · ${moneyFull(cur.price * usage.seats)}/mo for ${usage.seats} seats` : 'Upgrade any time — your data stays exactly as it is.'}</p>
            </div>
            {isAdmin && current.plan !== 'free' && mode === 'stripe' && <button className="btn" onClick={manage}>Manage in Stripe</button>}
          </div>
          <hr className="divider" style={{ margin: '20px 0' }} />
          <div className="col gap-16">
            <UsageRow label="Seats" used={usage.seats} max={cur.limits.seats} />
            <UsageRow label="Active deals" used={usage.deals} max={cur.limits.deals} />
            <UsageRow label="AI queries this month" used={usage.aiQueries} max={cur.limits.aiQueries} />
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Invoices</h3></div>
          <div className="card-b" style={{ paddingTop: 8 }}>
            {invoices.length === 0 && <p className="small muted" style={{ padding: '14px 0' }}>Invoices appear here after your first paid month.</p>}
            {invoices.map((i) => (
              <div className="list-row" key={i.id}>
                <div className="grow"><div className="small strong">{i.id}</div><div className="xs muted">{dateShort(i.date)}</div></div>
                <span className="num small strong">{moneyFull(i.amount)}</span><Badge tone="green">Paid</Badge>
                <button className="btn ghost icon sm" aria-label="Download invoice"><Download size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="plans">
        {plans.map((p) => {
          const isCur = p.id === current.plan;
          const up = ORDER[p.id] > ORDER[current.plan];
          return (
            <div key={p.id} className={`card plan ${isCur ? 'current' : ''}`}>
              <div className="row sb"><h3 style={{ fontSize: 16, fontWeight: 650 }}>{p.name}</h3>{p.id === 'pro' && !isCur && <Badge tone="ai"><Sparkles size={11} /> Popular</Badge>}{isCur && <Badge tone="dark">Current</Badge>}</div>
              <div><span className="price num">${p.price}</span><span className="muted small"> {p.price ? '/ seat / month' : 'forever'}</span></div>
              <p className="small sub" style={{ minHeight: 40 }}>{p.blurb}</p>
              <ul>{p.features.map((f) => <li key={f} className="small"><Check size={15} />{f}</li>)}</ul>
              <button className={`btn ${up ? 'accent' : ''}`} style={{ marginTop: 'auto', height: 40 }} disabled={isCur || !isAdmin} onClick={() => choose(p)}>
                {isCur ? 'Your current plan' : up ? `Upgrade to ${p.name}` : `Switch to ${p.name}`}
              </button>
            </div>
          );
        })}
      </div>
      {checkout && <DemoCheckout plan={checkout} seats={Math.max(1, usage.seats)} onClose={() => setCheckout(null)} onPaid={async () => {
        try { await api('/billing/demo/activate', { method: 'POST', body: { plan: checkout.id } }); await refresh(); await reload(); toast.show(`You’re on ${checkout.name} 🎉`); setCheckout(null); } catch (e) { toast.error(e.message); setCheckout(null); }
      }} />}
    </div>
  );
}
