export const money = (n = 0) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 2).replace(/\.?0+$/, '')}M`;
  if (a >= 1000) return `$${(n / 1000).toFixed(a >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return `$${Math.round(n)}`;
};
export const moneyFull = (n = 0) => `$${Math.round(n).toLocaleString('en-US')}`;

export const timeAgo = (date) => {
  if (!date) return '—';
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 0) return dueIn(date);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
export const dueIn = (date) => {
  const d = Math.round((new Date(date) - Date.now()) / 86400000);
  if (d < 0) return `${-d}d overdue`;
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return `In ${d}d`;
};
export const dateShort = (date) => (date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—');
export const dateLong = (date) => (date ? new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—');
export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
export const idleDays = (date) => Math.floor((Date.now() - new Date(date)) / 86400000);

export const STAGES = [
  { id: 'new', label: 'New Lead', color: '#a8a8b3' },
  { id: 'qualified', label: 'Qualified', color: '#5b8def' },
  { id: 'discovery', label: 'Discovery', color: '#8b7cf6' },
  { id: 'proposal', label: 'Proposal', color: '#f0a23b' },
  { id: 'negotiation', label: 'Negotiation', color: '#e8590c' },
  { id: 'won', label: 'Closed Won', color: '#2f9e44' },
];
export const STAGE = Object.fromEntries([...STAGES, { id: 'lost', label: 'Closed Lost', color: '#c92a3e' }].map((s) => [s.id, s]));

export const scoreTone = (n) => (n >= 70 ? 'hi' : n >= 45 ? 'mid' : 'lo');
export const scoreColor = (n) => (n >= 70 ? '#17803d' : n >= 45 ? '#b45f06' : '#c92a3e');

/** Very small **bold** renderer for assistant replies (no HTML injection). */
export const boldParts = (text = '') => text.split(/(\*\*[^*]+\*\*)/g).map((p) => (p.startsWith('**') ? { b: p.slice(2, -2) } : { t: p }));
