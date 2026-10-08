import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckSquare, Clock, Flag, GitBranch, Play, Plus, Trash2, Zap } from 'lucide-react';
import { api, useApi } from '../api';
import { useAuth } from '../auth';
import { Empty, ErrorState, PageLoading, Switch, useToast } from '../components/ui';
import { STAGES, timeAgo } from '../fmt';

const TRIGGERS = {
  deal_inactive: 'A deal has had no activity for…',
  stage_changed: 'A deal moves to a stage…',
  deal_created: 'A new deal is created',
};
const ACTIONS = {
  create_task: ['Create a follow-up task', CheckSquare],
  notify_owner: ['Notify the deal owner', Bell],
  notify_manager: ['Notify managers', Bell],
  set_priority: ['Set deal priority', Flag],
};
const FIELDS = { value: 'Deal value', priority: 'Priority' };
const OPS = { gte: '≥ at least', lte: '≤ at most', eq: 'is', neq: 'is not' };

const blank = () => ({
  _id: 'new', name: 'Untitled workflow', active: true, runCount: 0, runs: [],
  trigger: { type: 'deal_inactive', days: 7 },
  conditions: [],
  actions: [{ type: 'create_task', params: { title: 'Follow up on {{deal}}', dueInDays: 1 } }],
});

function describe(w) {
  const t = w.trigger;
  const when = t.type === 'deal_inactive' ? `Deal inactive ${t.days}d` : t.type === 'stage_changed' ? `Moves to ${STAGES.find((s) => s.id === t.stage)?.label || 'any stage'}` : 'Deal created';
  return `${when} → ${w.actions.map((a) => ACTIONS[a.type][0].toLowerCase()).join(', ')}`;
}

export default function Workflows() {
  const { isManager } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { data, loading, error, reload } = useApi('/workflows');
  const [sel, setSel] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => { if (data && !sel && data.length) setSel(data[0]._id); }, [data, sel]);
  useEffect(() => {
    if (sel === 'new') return;
    const w = data?.find((x) => x._id === sel);
    if (w) setDraft(structuredClone(w));
  }, [sel, data]);

  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} retry={reload} />;

  const guard = (e) => (e.code === 'PLAN_LIMIT' ? toast.error(e.message, { action: { label: 'Upgrade', onClick: () => nav('/billing') } }) : toast.error(e.message));
  const patchDraft = (fn) => setDraft((d) => { const c = structuredClone(d); fn(c); return c; });
  const dirty = draft && (sel === 'new' || JSON.stringify({ ...draft, runs: 0, runCount: 0 }) !== JSON.stringify({ ...data.find((x) => x._id === sel), runs: 0, runCount: 0 }));

  const save = async () => {
    setSaving(true);
    try {
      const body = { name: draft.name, active: draft.active, trigger: draft.trigger, conditions: draft.conditions, actions: draft.actions };
      const saved = sel === 'new' ? await api('/workflows', { method: 'POST', body }) : await api(`/workflows/${sel}`, { method: 'PATCH', body });
      toast.show('Workflow saved');
      await reload();
      setSel(saved._id);
    } catch (e) { guard(e); } finally { setSaving(false); }
  };
  const toggle = async (w, on) => {
    try { await api(`/workflows/${w._id}`, { method: 'PATCH', body: { active: on } }); reload(); } catch (e) { guard(e); }
  };
  const del = async () => {
    if (!window.confirm('Delete this workflow?')) return;
    await api(`/workflows/${sel}`, { method: 'DELETE' }); setSel(null); setDraft(null); reload();
  };
  const run = async () => {
    setRunning(true);
    try {
      const { results } = await api('/workflows/run', { method: 'POST' });
      toast.show(results.length ? `${results.length} automation${results.length === 1 ? '' : 's'} ran — tasks created & owners notified` : 'No deals matched right now — everything is on track');
      reload();
    } catch (e) { guard(e); } finally { setRunning(false); }
  };

  const list = sel === 'new' ? [draft, ...data] : data;

  return (
    <div className="page">
      <div className="page-head">
        <div><h2>Workflow automation</h2><p>When something happens, do something — automatically. Build rules without code.</p></div>
        {isManager && <div className="row"><button className="btn" onClick={run} disabled={running}><Play size={15} /> {running ? 'Running…' : 'Run inactivity check'}</button><button className="btn primary" onClick={() => { setSel('new'); setDraft(blank()); }}><Plus size={16} /> New workflow</button></div>}
      </div>

      <div className="wf-layout">
        <div>
          {list.map((w) => w && (
            <button key={w._id} className={`wf-item ${sel === w._id ? 'on' : ''}`} onClick={() => setSel(w._id)}>
              <div className="row sb" style={{ alignItems: 'flex-start' }}>
                <span className="strong">{w.name}</span>
                {w._id !== 'new' && <span onClick={(e) => e.stopPropagation()}><Switch on={w.active} onChange={(v) => isManager && toggle(w, v)} label={`Toggle ${w.name}`} /></span>}
              </div>
              <p className="small sub" style={{ marginTop: 6, lineHeight: 1.45 }}>{describe(w)}</p>
              <div className="row xs muted" style={{ marginTop: 10, gap: 12 }}><span className="row" style={{ gap: 4 }}><Zap size={12} />{w.runCount} runs</span>{w.lastRunAt && <span className="row" style={{ gap: 4 }}><Clock size={12} />{timeAgo(w.lastRunAt)}</span>}</div>
            </button>
          ))}
          {list.length === 0 && <div className="card"><Empty title="No workflows yet">Create your first automation.</Empty></div>}
        </div>

        {draft ? (
          <div>
            <div className="card card-pad" style={{ marginBottom: 16 }}>
              <div className="row" style={{ gap: 12 }}>
                <input className="input" style={{ fontWeight: 650, fontSize: 16, border: 0, padding: 0, height: 32, letterSpacing: '-0.02em' }} value={draft.name} disabled={!isManager} onChange={(e) => patchDraft((d) => { d.name = e.target.value; })} aria-label="Workflow name" />
                {isManager && <>
                  {sel !== 'new' && <button className="btn ghost icon sm danger" onClick={del} aria-label="Delete workflow"><Trash2 size={15} /></button>}
                  <button className="btn primary sm" disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
                </>}
              </div>
            </div>

            <div className="flow">
              {/* trigger */}
              <div className="flow-step">
                <div className="flow-tag" style={{ color: 'var(--amber)' }}>Trigger</div>
                <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
                  <span className="flow-ico trigger"><Zap size={17} /></span>
                  <div className="grow col gap-12">
                    <select className="select" disabled={!isManager} value={draft.trigger.type} onChange={(e) => patchDraft((d) => { d.trigger = { type: e.target.value, days: e.target.value === 'deal_inactive' ? 7 : undefined, stage: undefined }; })}>
                      {Object.entries(TRIGGERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    {draft.trigger.type === 'deal_inactive' && (
                      <div className="inline-form"><input className="input" style={{ width: 90 }} type="number" min="1" disabled={!isManager} value={draft.trigger.days || 7} onChange={(e) => patchDraft((d) => { d.trigger.days = Number(e.target.value); })} aria-label="Days" /><span className="sub">days</span></div>
                    )}
                    {draft.trigger.type === 'stage_changed' && (
                      <select className="select" disabled={!isManager} value={draft.trigger.stage || ''} onChange={(e) => patchDraft((d) => { d.trigger.stage = e.target.value || undefined; })}>
                        <option value="">Any stage</option>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              </div>
              <div className="flow-gap" />

              {/* conditions */}
              <div className="flow-step">
                <div className="row sb"><div className="flow-tag" style={{ color: 'var(--blue)' }}>Only if</div>
                  {isManager && <button className="btn ghost sm" onClick={() => patchDraft((d) => { d.conditions.push({ field: 'value', op: 'gte', value: 10000 }); })}><Plus size={13} /> Add condition</button>}</div>
                {draft.conditions.length === 0 && <p className="small muted">Runs for every matching deal.</p>}
                <div className="col gap-12">
                  {draft.conditions.map((c, i) => (
                    <div className="row" style={{ alignItems: 'flex-start', gap: 14 }} key={i}>
                      <span className="flow-ico cond"><GitBranch size={17} /></span>
                      <div className="inline-form grow">
                        <select className="select" disabled={!isManager} value={c.field} onChange={(e) => patchDraft((d) => { d.conditions[i] = { field: e.target.value, op: e.target.value === 'value' ? 'gte' : 'eq', value: e.target.value === 'value' ? 10000 : 'high' }; })}>{Object.entries(FIELDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                        <select className="select" disabled={!isManager} value={c.op} onChange={(e) => patchDraft((d) => { d.conditions[i].op = e.target.value; })}>{Object.entries(OPS).filter(([k]) => (c.field === 'value' ? ['gte', 'lte'] : ['eq', 'neq']).includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                        {c.field === 'value'
                          ? <input className="input" style={{ width: 120 }} type="number" disabled={!isManager} value={c.value} onChange={(e) => patchDraft((d) => { d.conditions[i].value = Number(e.target.value); })} aria-label="Amount" />
                          : <select className="select" disabled={!isManager} value={c.value} onChange={(e) => patchDraft((d) => { d.conditions[i].value = e.target.value; })}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>}
                        {isManager && <button className="btn ghost icon sm" onClick={() => patchDraft((d) => { d.conditions.splice(i, 1); })} aria-label="Remove condition"><Trash2 size={14} /></button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flow-gap" />

              {/* actions */}
              <div className="flow-step">
                <div className="row sb"><div className="flow-tag" style={{ color: 'var(--green)' }}>Then</div>
                  {isManager && <button className="btn ghost sm" onClick={() => patchDraft((d) => { d.actions.push({ type: 'notify_owner', params: { message: '{{deal}} needs your attention' } }); })}><Plus size={13} /> Add action</button>}</div>
                <div className="col gap-12">
                  {draft.actions.map((a, i) => {
                    const Icon = ACTIONS[a.type][1];
                    return (
                      <div className="row" style={{ alignItems: 'flex-start', gap: 14 }} key={i}>
                        <span className="flow-ico action"><Icon size={17} /></span>
                        <div className="grow col gap-12">
                          <div className="inline-form">
                            <select className="select" disabled={!isManager} value={a.type} onChange={(e) => patchDraft((d) => { d.actions[i] = { type: e.target.value, params: e.target.value === 'set_priority' ? { priority: 'high' } : e.target.value === 'create_task' ? { title: 'Follow up on {{deal}}', dueInDays: 1 } : { message: '{{deal}} needs your attention' } }; })}>
                              {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}
                            </select>
                            {draft.actions.length > 1 && isManager && <button className="btn ghost icon sm" onClick={() => patchDraft((d) => { d.actions.splice(i, 1); })} aria-label="Remove action"><Trash2 size={14} /></button>}
                          </div>
                          {a.type === 'create_task' && <div className="inline-form"><input className="input" style={{ flex: 1, minWidth: 180 }} disabled={!isManager} value={a.params.title} onChange={(e) => patchDraft((d) => { d.actions[i].params.title = e.target.value; })} aria-label="Task title" /><span className="small muted">due in</span><input className="input" style={{ width: 70 }} type="number" min="0" disabled={!isManager} value={a.params.dueInDays} onChange={(e) => patchDraft((d) => { d.actions[i].params.dueInDays = Number(e.target.value); })} aria-label="Due in days" /><span className="small muted">days</span></div>}
                          {(a.type === 'notify_owner' || a.type === 'notify_manager') && <input className="input" disabled={!isManager} value={a.params.message} onChange={(e) => patchDraft((d) => { d.actions[i].params.message = e.target.value; })} aria-label="Message" />}
                          {a.type === 'set_priority' && <select className="select" style={{ width: 160 }} disabled={!isManager} value={a.params.priority} onChange={(e) => patchDraft((d) => { d.actions[i].params.priority = e.target.value; })}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="xs muted" style={{ marginTop: 12 }}>Use <code>{'{{deal}}'}</code> and <code>{'{{value}}'}</code> as placeholders.</p>
              </div>
            </div>

            {draft.runs?.length > 0 && (
              <div className="card card-pad" style={{ marginTop: 16 }}>
                <div className="strong" style={{ marginBottom: 6 }}>Recent runs</div>
                {draft.runs.slice(0, 5).map((r, i) => (<div className="list-row small" key={i}><span className="dot" style={{ background: 'var(--green)' }} /><span className="grow">{r.summary}</span><span className="xs muted">{timeAgo(r.at)}</span></div>))}
              </div>
            )}
          </div>
        ) : <div className="card"><Empty title="Select a workflow">Pick one on the left to inspect or edit it.</Empty></div>}
      </div>
    </div>
  );
}
