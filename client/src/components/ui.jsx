import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { initials, scoreColor, scoreTone } from '../fmt';

/* ───────── identity ───────── */
export function Avatar({ name, color = '#6d5ef5', size = 28 }) {
  return (
    <span className="avatar" title={name} style={{ width: size, height: size, background: color, fontSize: Math.max(10, size * 0.38) }}>
      {initials(name)}
    </span>
  );
}

export function Logo({ name, color = '#6d5ef5', size = 32 }) {
  return (
    <span className="logo" style={{ width: size, height: size, background: color, fontSize: size * 0.42, borderRadius: size * 0.28 }}>
      {(name || '?')[0]}
    </span>
  );
}

export const Badge = ({ tone = '', children, ...p }) => <span className={`badge ${tone}`} {...p}>{children}</span>;

/* ───────── AI win-score ring ───────── */
export function ScoreRing({ value = 0, size = 64, stroke = 6, label = true }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = scoreColor(value);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(109,76,240,.12)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (value / 100) * c} style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      {label && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', fontWeight: 650, fontSize: size * 0.3, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
          {value}<span style={{ fontSize: size * 0.17, marginLeft: 1, color: 'var(--ink-3)', alignSelf: 'center', marginTop: size * 0.06 }}>%</span>
        </div>
      )}
    </div>
  );
}

export const WinPill = ({ value }) => (
  <span className={`win-pill ${scoreTone(value)}`} title="AI win score">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9l-5.6 1.9L12 16.5l-1.9-5.6L4.5 9l5.6-1.4L12 2zm7 12l.9 2.6L22.5 17.5l-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14z" /></svg>
    <span className="num">{value}%</span>
  </span>
);

export const Spark = ({ size = 18 }) => (
  <span className="spark" style={{ width: size, height: size, borderRadius: size * 0.34 }}>
    <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9l-5.6 1.9L12 16.5l-1.9-5.6L4.5 9l5.6-1.4L12 2z" /></svg>
  </span>
);

/* ───────── states ───────── */
export const Skeleton = ({ h = 16, w = '100%', style }) => <div className="skeleton" style={{ height: h, width: w, ...style }} />;
export const Empty = ({ title, children }) => (
  <div className="empty">
    <h4>{title}</h4>
    <p className="small">{children}</p>
  </div>
);
export const PageLoading = () => (
  <div className="page">
    <Skeleton h={30} w={220} style={{ marginBottom: 24 }} />
    <div className="kpis">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={104} style={{ borderRadius: 16 }} />)}</div>
    <Skeleton h={300} style={{ borderRadius: 16 }} />
  </div>
);
export const ErrorState = ({ error, retry }) => (
  <div className="page">
    <div className="card"><Empty title="Couldn’t load this view">{error?.message}</Empty><div className="row" style={{ justifyContent: 'center', paddingBottom: 28 }}><button className="btn" onClick={retry}>Try again</button></div></div>
  </div>
);

/* ───────── overlays ───────── */
export function Drawer({ open, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">{children}</aside>
    </>
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-h">
          <div className="row sb"><h3 style={{ fontSize: 17, fontWeight: 650, letterSpacing: '-0.02em' }}>{title}</h3><button className="btn ghost icon sm" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
          {subtitle && <p className="muted small" style={{ marginTop: 2 }}>{subtitle}</p>}
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </>
  );
}

/* ───────── toasts ───────── */
const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setItems((s) => [...s, { id, message, ...opts }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), opts.duration || 4200);
  }, []);
  const value = {
    show: (m, o) => push(m, o),
    error: (m, o) => push(m, { ...o, err: true }),
  };
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.err ? 'err' : ''}`}>
            <span>{t.message}</span>
            {t.action && <button onClick={t.action.onClick}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function Field({ label, children, hint }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <span className="xs muted">{hint}</span>}
    </div>
  );
}

export const Switch = ({ on, onChange, label }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />
);

export const Meter = ({ value, max, tone }) => {
  const pct = max ? Math.min(100, (value / max) * 100) : 8;
  const cls = tone || (max && pct >= 100 ? 'bad' : max && pct >= 80 ? 'warn' : '');
  return <div className={`meter ${cls}`}><i style={{ width: `${pct}%` }} /></div>;
};
