import { Router } from 'express';
import { Activity, Company, Contact, Deal, STAGES, Task, User } from '../models/index.js';
import { HttpError, asyncHandler, canEditRecord } from '../middleware/auth.js';
import { assertWithinLimit } from '../services/limits.js';
import { generateInsight, ruleInsight, STAGE_META } from '../services/scoring.js';
import { fireEvent } from '../services/automation.js';

const router = Router();

const withRefs = (q) =>
  q.populate('companyId', 'name domain color industry').populate('contactId', 'name title email').populate('ownerId', 'name color role');

const shape = (d) => ({
  id: d._id,
  title: d.title,
  value: d.value,
  stage: d.stage,
  priority: d.priority,
  expectedClose: d.expectedClose,
  closedAt: d.closedAt,
  createdAt: d.createdAt,
  signals: d.signals,
  ai: d.ai,
  company: d.companyId && { id: d.companyId._id, name: d.companyId.name, color: d.companyId.color, domain: d.companyId.domain, industry: d.companyId.industry },
  contact: d.contactId && { id: d.contactId._id, name: d.contactId.name, title: d.contactId.title, email: d.contactId.email },
  owner: d.ownerId && { id: d.ownerId._id, name: d.ownerId.name, color: d.ownerId.color },
});
export { shape as shapeDeal };

async function loadDeal(req) {
  const deal = await Deal.findOne({ _id: req.params.id, workspaceId: req.wid });
  if (!deal) throw new HttpError(404, 'Deal not found');
  return deal;
}

async function rescore(deal, { narrate = false } = {}) {
  const company = deal.companyId ? await Company.findById(deal.companyId).lean() : null;
  const insight = narrate
    ? await generateInsight(deal, { company: company?.name, activities: await Activity.find({ dealId: deal._id }).sort({ at: -1 }).limit(6).lean() })
    : ruleInsight(deal);
  deal.ai = insight;
  await deal.save();
  return deal;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = { workspaceId: req.wid };
    if (req.query.stage) filter.stage = req.query.stage;
    if (req.query.owner === 'me') filter.ownerId = req.user._id;
    else if (req.query.owner) filter.ownerId = req.query.owner;
    if (req.query.q) filter.title = { $regex: req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const deals = await withRefs(Deal.find(filter).sort({ value: -1 })).lean();
    res.json(deals.map(shape));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    await assertWithinLimit(req.workspace, 'deals');
    const { title, value, companyId, contactId, ownerId, stage, priority, expectedClose } = req.body;
    if (!title) throw new HttpError(400, 'Deal title is required');
    if (companyId && !(await Company.exists({ _id: companyId, workspaceId: req.wid }))) throw new HttpError(400, 'Unknown company');
    const owner = req.user.role === 'rep' ? req.user._id : ownerId || req.user._id;
    const deal = await Deal.create({
      workspaceId: req.wid,
      title,
      value: Number(value) || 0,
      stage: STAGES.includes(stage) ? stage : 'new',
      priority,
      companyId,
      contactId,
      ownerId: owner,
      expectedClose: expectedClose ? new Date(expectedClose) : new Date(Date.now() + 45 * 86400000),
      stageHistory: [{ stage: stage || 'new', at: new Date() }],
    });
    await rescore(deal);
    await Activity.create({ workspaceId: req.wid, type: 'system', title: 'Deal created', content: `${req.user.name} created this deal`, dealId: deal._id, companyId, userId: req.user._id });
    await fireEvent(req.wid, 'deal_created', deal);
    res.status(201).json(shape(await withRefs(Deal.findById(deal._id)).lean()));
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const deal = await withRefs(Deal.findOne({ _id: req.params.id, workspaceId: req.wid })).lean();
    if (!deal) throw new HttpError(404, 'Deal not found');
    const [activities, tasks] = await Promise.all([
      Activity.find({ workspaceId: req.wid, dealId: deal._id }).sort({ at: -1 }).limit(30).populate('userId', 'name color').lean(),
      Task.find({ workspaceId: req.wid, dealId: deal._id }).sort({ dueAt: 1 }).lean(),
    ]);
    res.json({
      ...shape(deal),
      stageLabel: STAGE_META[deal.stage].label,
      canEdit: canEditRecord(req.user, deal),
      activities: activities.map((a) => ({ id: a._id, type: a.type, title: a.title, content: a.content, at: a.at, user: a.userId && { name: a.userId.name, color: a.userId.color } })),
      tasks: tasks.map((t) => ({ id: t._id, title: t.title, dueAt: t.dueAt, done: t.done, auto: t.auto })),
    });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const deal = await loadDeal(req);
    if (!canEditRecord(req.user, deal)) throw new HttpError(403, 'You can only edit deals you own');
    const allowed = ['title', 'value', 'priority', 'expectedClose'];
    for (const k of allowed) if (req.body[k] !== undefined) deal[k] = k === 'value' ? Number(req.body[k]) : req.body[k];
    if (req.body.ownerId && req.user.role !== 'rep') {
      if (!(await User.exists({ _id: req.body.ownerId, workspaceId: req.wid }))) throw new HttpError(400, 'Unknown owner');
      deal.ownerId = req.body.ownerId;
    }
    await rescore(deal);
    res.json(shape(await withRefs(Deal.findById(deal._id)).lean()));
  })
);

router.patch(
  '/:id/stage',
  asyncHandler(async (req, res) => {
    const deal = await loadDeal(req);
    if (!canEditRecord(req.user, deal)) throw new HttpError(403, 'You can only move deals you own');
    const { stage } = req.body;
    if (!STAGES.includes(stage)) throw new HttpError(400, 'Invalid stage');
    if (stage !== deal.stage) {
      const from = deal.stage;
      deal.stage = stage;
      deal.stageHistory.push({ stage, at: new Date() });
      deal.closedAt = ['won', 'lost'].includes(stage) ? new Date() : undefined;
      deal.signals.lastActivityAt = new Date();
      await rescore(deal);
      await Activity.create({
        workspaceId: req.wid,
        type: 'system',
        title: `Moved to ${STAGE_META[stage].label}`,
        content: `${req.user.name} moved this deal from ${STAGE_META[from].label} to ${STAGE_META[stage].label}`,
        dealId: deal._id,
        companyId: deal.companyId,
        userId: req.user._id,
      });
      await fireEvent(req.wid, 'stage_changed', deal);
    }
    res.json(shape(await withRefs(Deal.findById(deal._id)).lean()));
  })
);

router.post(
  '/:id/insight',
  asyncHandler(async (req, res) => {
    await assertWithinLimit(req.workspace, 'aiQueries');
    const deal = await loadDeal(req);
    await rescore(deal, { narrate: true });
    req.workspace.usage.aiQueries += 1;
    await req.workspace.save();
    res.json({ ai: deal.ai });
  })
);

router.post(
  '/:id/notes',
  asyncHandler(async (req, res) => {
    const deal = await loadDeal(req);
    if (!req.body.content?.trim()) throw new HttpError(400, 'Note cannot be empty');
    const a = await Activity.create({ workspaceId: req.wid, type: 'note', title: 'Note added', content: req.body.content.trim(), dealId: deal._id, companyId: deal.companyId, contactId: deal.contactId, userId: req.user._id });
    deal.signals.lastActivityAt = new Date();
    await rescore(deal);
    res.status(201).json({ id: a._id, ai: deal.ai });
  })
);

/** One-click "do the recommended thing": schedule a follow-up task and flip the signal. */
router.post(
  '/:id/followup',
  asyncHandler(async (req, res) => {
    const deal = await loadDeal(req);
    if (!canEditRecord(req.user, deal)) throw new HttpError(403, 'You can only edit deals you own');
    const task = await Task.create({
      workspaceId: req.wid,
      title: req.body.title || `Follow up: ${deal.title}`,
      dueAt: req.body.dueAt ? new Date(req.body.dueAt) : new Date(Date.now() + 86400000),
      dealId: deal._id,
      ownerId: deal.ownerId,
    });
    deal.signals.followUpScheduled = true;
    await rescore(deal);
    res.status(201).json({ task: { id: task._id, title: task.title, dueAt: task.dueAt }, ai: deal.ai });
  })
);

export default router;
