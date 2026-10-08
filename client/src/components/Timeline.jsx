import { CalendarCheck2, FileText, Mail, Phone, StickyNote, Zap } from 'lucide-react';
import { Avatar } from './ui';
import { timeAgo } from '../fmt';

const ICON = { meeting: CalendarCheck2, email: Mail, call: Phone, note: StickyNote, proposal: FileText, system: Zap, task: Zap };

export default function Timeline({ items = [], empty = 'No activity yet.' }) {
  if (!items.length) return <p className="muted small" style={{ padding: '8px 0' }}>{empty}</p>;
  return (
    <div className="timeline">
      {items.map((a) => {
        const Icon = ICON[a.type] || Zap;
        return (
          <div className="tl-item" key={a.id}>
            <span className={`tl-icon ${a.type}`}><Icon size={14} /></span>
            <div className="tl-body grow">
              <div className="row sb" style={{ alignItems: 'flex-start', gap: 12 }}>
                <span className="t">{a.title}</span>
                <span className="xs muted" style={{ whiteSpace: 'nowrap', paddingTop: 2 }}>{timeAgo(a.at)}</span>
              </div>
              {a.content && <div className="c">{a.content}</div>}
              {a.user && (
                <div className="row xs muted" style={{ marginTop: 5, gap: 6 }}>
                  <Avatar name={a.user.name} color={a.user.color} size={16} /> {a.user.name}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
