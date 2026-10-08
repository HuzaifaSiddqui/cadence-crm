import { Activity, Deal, Notification, Task, User, Workflow } from '../models/index.js';
import { daysSince, isOpen } from './scoring.js';

const DAY = 86400000;

/** Evaluate trigger-level conditions on a deal. */
function passesConditions(wf, deal) {
  return (wf.conditions || []).every((c) => {
    const actual = deal[c.field];
    switch (c.op) {
      case 'gte': return Number(actual) >= Number(c.value);
      case 'lte': return Number(actual) <= Number(c.value);
      case 'eq': return String(actual) === String(c.value);
      case 'neq': return String(actual) !== String(c.value);
      default: return true;
    }
  });
}

const fill = (tpl = '', deal) => tpl.replaceAll('{{deal}}', deal.title).replaceAll('{{value}}', `$${deal.value?.toLocaleString('en-US')}`);

async function runActions(wf, deal) {
  const done = [];
  for (const action of wf.actions || []) {
    const p = action.params || {};
    if (action.type === 'create_task') {
      await Task.create({
        workspaceId: wf.workspaceId,
        title: fill(p.title || 'Follow up on {{deal}}', deal),
        dueAt: new Date(Date.now() + (Number(p.dueInDays) || 1) * DAY),
        dealId: deal._id,
        ownerId: deal.ownerId,
        auto: true,
      });
      await Deal.updateOne({ _id: deal._id }, { $set: { 'signals.followUpScheduled': true } });
      done.push('task created');
    }
    if (action.type === 'notify_owner' && deal.ownerId) {
      await Notification.create({
        workspaceId: wf.workspaceId,
        userId: deal.ownerId,
        title: wf.name,
        body: fill(p.message || '{{deal}} needs your attention', deal),
        dealId: deal._id,
      });
      done.push('owner notified');
    }
    if (action.type === 'set_priority' && p.priority) {
      await Deal.updateOne({ _id: deal._id }, { $set: { priority: p.priority } });
      done.push(`priority → ${p.priority}`);
    }
    if (action.type === 'notify_manager') {
      const managers = await User.find({ workspaceId: wf.workspaceId, role: { $in: ['admin', 'manager'] } }).lean();
      await Notification.insertMany(
        managers.map((m) => ({ workspaceId: wf.workspaceId, userId: m._id, title: wf.name, body: fill(p.message || '{{deal}} flagged by automation', deal), dealId: deal._id }))
      );
      done.push('managers notified');
    }
  }
  if (done.length) {
    await Activity.create({
      workspaceId: wf.workspaceId,
      type: 'system',
      title: `Automation: ${wf.name}`,
      content: done.join(' · '),
      dealId: deal._id,
      companyId: deal.companyId,
    });
  }
  wf.runCount += 1;
  wf.lastRunAt = new Date();
  wf.runs = [{ at: new Date(), dealId: deal._id, summary: `${deal.title}: ${done.join(', ') || 'no-op'}` }, ...(wf.runs || [])].slice(0, 15);
  await wf.save();
  return done;
}

/** Event-driven triggers (stage change / deal created). */
export async function fireEvent(workspaceId, type, deal) {
  const flows = await Workflow.find({ workspaceId, active: true, 'trigger.type': type });
  for (const wf of flows) {
    if (type === 'stage_changed' && wf.trigger.stage && wf.trigger.stage !== deal.stage) continue;
    if (!passesConditions(wf, deal)) continue;
    await runActions(wf, deal);
  }
}

/** Time-driven triggers — called by the scheduler and the "Run now" button. */
export async function runScheduled(workspaceId) {
  const flows = await Workflow.find({ workspaceId, active: true, 'trigger.type': 'deal_inactive' });
  const results = [];
  if (!flows.length) return results;
  const deals = (await Deal.find({ workspaceId, stage: { $nin: ['won', 'lost'] } })).filter(isOpen);

  for (const wf of flows) {
    for (const deal of deals) {
      const idle = daysSince(deal.signals?.lastActivityAt);
      if (idle < (wf.trigger.days || 7)) continue;
      const last = deal.autoFired?.[wf._id.toString()];
      if (last && new Date(last) > new Date(deal.signals.lastActivityAt)) continue; // already handled this stall
      if (!passesConditions(wf, deal)) continue;
      const done = await runActions(wf, deal);
      deal.autoFired = { ...(deal.autoFired || {}), [wf._id.toString()]: new Date() };
      deal.markModified('autoFired');
      await deal.save();
      results.push({ workflow: wf.name, deal: deal.title, actions: done });
    }
  }
  return results;
}

export function startScheduler(Workspace) {
  const tick = async () => {
    try {
      const all = await Workspace.find({}, '_id').lean();
      for (const w of all) await runScheduled(w._id);
    } catch (err) {
      console.warn('[automation] scheduler tick failed:', err.message);
    }
  };
  setInterval(tick, 60 * 60 * 1000).unref();
}
