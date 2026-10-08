import { Router } from 'express';
import crypto from 'node:crypto';
import { Invitation, Notification, Task, User, Workflow, Deal, Workspace } from '../models/index.js';
import { HttpError, asyncHandler, requireRole } from '../middleware/auth.js';
import { assertWithinLimit } from '../services/limits.js';
import { runScheduled } from '../services/automation.js';
import { answer } from '../services/assistant.js';
import { config } from '../config.js';

/* ───────────────────────── Workflows ───────────────────────── */
export const workflowsRouter = Router();

const TRIGGERS = ['deal_inactive', 'stage_changed', 'deal_created'];
const ACTIONS = ['create_task', 'notify_owner', 'notify_manager', 'set_priority'];

function cleanWorkflow(body) {
  if (!body.name?.trim()) throw new HttpError(400, 'Give the workflow a name');
  if (!TRIGGERS.includes(body.trigger?.type)) throw new HttpError(400, 'Choose a valid trigger');
  if (!Array.isArray(body.actions) || !body.actions.length) throw new HttpError(400, 'Add at least one action');
  if (body.actions.some((a) => !ACTIONS.includes(a.type))) throw new HttpError(400, 'Unknown action');
  return {
    name: body.name.trim(),
    active: body.active !== false,
    trigger: { type: body.trigger.type, days: Number(body.trigger.days) || undefined, stage: body.trigger.stage || undefined },
    conditions: (body.conditions || []).filter((c) => c.field && c.op),
    actions: body.actions.map((a) => ({ type: a.type, params: a.params || {} })),
  };
}

workflowsRouter.get('/', asyncHandler(async (req, res) => res.json(await Workflow.find({ workspaceId: req.wid }).sort({ createdAt: 1 }).lean())));

workflowsRouter.post(
  '/',
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    if (req.workspace.plan === 'free') throw new HttpError(402, 'Workflow automation is available on Pro and Business.', { code: 'PLAN_LIMIT', limitKey: 'workflows' });
    res.status(201).json(await Workflow.create({ workspaceId: req.wid, ...cleanWorkflow(req.body) }));
  })
);

workflowsRouter.post(
  '/run',
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => res.json({ results: await runScheduled(req.wid) }))
);

workflowsRouter.patch(
  '/:id',
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const wf = await Workflow.findOne({ _id: req.params.id, workspaceId: req.wid });
    if (!wf) throw new HttpError(404, 'Workflow not found');
    if (Object.keys(req.body).length === 1 && 'active' in req.body) wf.active = Boolean(req.body.active);
    else Object.assign(wf, cleanWorkflow({ ...wf.toObject(), ...req.body }));
    await wf.save();
    res.json(wf);
  })
);

workflowsRouter.delete(
  '/:id',
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    await Workflow.deleteOne({ _id: req.params.id, workspaceId: req.wid });
    res.json({ ok: true });
  })
);

/* ───────────────────────── Team & RBAC ───────────────────────── */
export const teamRouter = Router();

export const PERMISSIONS = {
  admin: ['Manage billing & plan', 'Invite & remove members', 'Change roles', 'Edit all records', 'Build workflows', 'View analytics'],
  manager: ['Edit all records', 'Reassign owners', 'Build workflows', 'View analytics'],
  rep: ['Edit own deals & contacts', 'Log activity', 'Use AI assistant'],
};

teamRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const [users, invites, deals] = await Promise.all([
      User.find({ workspaceId: req.wid }).sort({ createdAt: 1 }).lean(),
      Invitation.find({ workspaceId: req.wid, status: 'pending' }).lean(),
      Deal.find({ workspaceId: req.wid, stage: { $nin: ['won', 'lost'] } }, 'ownerId').lean(),
    ]);
    const counts = {};
    deals.forEach((d) => d.ownerId && (counts[d.ownerId] = (counts[d.ownerId] || 0) + 1));
    res.json({
      members: users.map((u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, title: u.title, color: u.color, lastActiveAt: u.lastActiveAt, openDeals: counts[u._id] || 0 })),
      invitations: invites.map((i) => ({ id: i._id, email: i.email, role: i.role, link: `${config.clientUrl}/invite/${i.token}`, token: i.token })),
      permissions: PERMISSIONS,
    });
  })
);

teamRouter.post(
  '/invite',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { email, role } = req.body;
    if (!/^\S+@\S+\.\S+$/.test(email || '')) throw new HttpError(400, 'Enter a valid email address');
    if (!['admin', 'manager', 'rep'].includes(role)) throw new HttpError(400, 'Invalid role');
    if (await User.exists({ email: email.toLowerCase() })) throw new HttpError(409, 'That person already has an account');
    await assertWithinLimit(req.workspace, 'seats');
    const token = crypto.randomBytes(18).toString('hex');
    const inv = await Invitation.create({ workspaceId: req.wid, email, role, token, invitedBy: req.user._id });
    res.status(201).json({ id: inv._id, email: inv.email, role: inv.role, link: `${config.clientUrl}/invite/${token}`, token });
  })
);

teamRouter.patch(
  '/:id/role',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    if (!['admin', 'manager', 'rep'].includes(req.body.role)) throw new HttpError(400, 'Invalid role');
    const user = await User.findOne({ _id: req.params.id, workspaceId: req.wid });
    if (!user) throw new HttpError(404, 'Member not found');
    if (user._id.equals(req.user._id) && req.body.role !== 'admin') {
      const admins = await User.countDocuments({ workspaceId: req.wid, role: 'admin' });
      if (admins <= 1) throw new HttpError(400, 'A workspace needs at least one admin');
    }
    user.role = req.body.role;
    await user.save();
    res.json({ id: user._id, role: user.role });
  })
);

teamRouter.delete(
  '/invitations/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    await Invitation.deleteOne({ _id: req.params.id, workspaceId: req.wid });
    res.json({ ok: true });
  })
);

teamRouter.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user._id.toString()) throw new HttpError(400, 'You cannot remove yourself');
    await User.deleteOne({ _id: req.params.id, workspaceId: req.wid });
    res.json({ ok: true });
  })
);

/* ───────────────────────── Tasks & notifications ───────────────────────── */
export const tasksRouter = Router();

tasksRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = { workspaceId: req.wid };
    if (req.query.mine) filter.ownerId = req.user._id;
    const tasks = await Task.find(filter).sort({ done: 1, dueAt: 1 }).limit(100).populate('dealId', 'title').lean();
    res.json(tasks.map((t) => ({ id: t._id, title: t.title, dueAt: t.dueAt, done: t.done, auto: t.auto, deal: t.dealId && { id: t.dealId._id, title: t.dealId.title } })));
  })
);

tasksRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const t = await Task.findOneAndUpdate({ _id: req.params.id, workspaceId: req.wid }, { $set: { done: Boolean(req.body.done) } }, { new: true });
    if (!t) throw new HttpError(404, 'Task not found');
    res.json({ id: t._id, done: t.done });
  })
);

export const notificationsRouter = Router();

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await Notification.find({ workspaceId: req.wid, userId: req.user._id }).sort({ createdAt: -1 }).limit(12).lean();
    res.json(items.map((n) => ({ id: n._id, title: n.title, body: n.body, dealId: n.dealId, read: n.read, at: n.createdAt })));
  })
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await Notification.updateMany({ workspaceId: req.wid, userId: req.user._id, read: false }, { $set: { read: true } });
    res.json({ ok: true });
  })
);

/* ───────────────────────── AI assistant ───────────────────────── */
export const aiRouter = Router();

aiRouter.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const message = (req.body.message || '').trim();
    if (!message) throw new HttpError(400, 'Ask a question first');
    if (message.length > 500) throw new HttpError(400, 'Please keep questions under 500 characters');
    await assertWithinLimit(req.workspace, 'aiQueries');
    const reply = await answer(req.wid, message, req.user);
    await Workspace.updateOne({ _id: req.wid }, { $inc: { 'usage.aiQueries': 1 } });
    res.json(reply);
  })
);
