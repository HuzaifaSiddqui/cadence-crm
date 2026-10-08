import { Router } from 'express';
import { Activity, Company, Contact, Deal, User } from '../models/index.js';
import { HttpError, asyncHandler, requireRole } from '../middleware/auth.js';
import { shapeDeal } from './deals.js';

const router = Router();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const shape = (c) => ({
  id: c._id,
  name: c.name,
  email: c.email,
  phone: c.phone,
  title: c.title,
  seniority: c.seniority,
  status: c.status,
  leadScore: c.leadScore,
  tags: c.tags,
  enrichmentStatus: c.enrichmentStatus,
  lastActivityAt: c.lastActivityAt,
  company: c.companyId && { id: c.companyId._id, name: c.companyId.name, color: c.companyId.color },
  owner: c.ownerId && { id: c.ownerId._id, name: c.ownerId.name, color: c.ownerId.color },
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q, status, owner, tag } = req.query;
    const filter = { workspaceId: req.wid };
    if (status) filter.status = status;
    if (owner === 'me') filter.ownerId = req.user._id;
    else if (owner) filter.ownerId = owner;
    if (tag) filter.tags = tag;
    if (q) {
      const rx = { $regex: esc(q), $options: 'i' };
      const companyIds = (await Company.find({ workspaceId: req.wid, name: rx }, '_id').lean()).map((c) => c._id);
      filter.$or = [{ name: rx }, { email: rx }, { title: rx }, { companyId: { $in: companyIds } }];
    }
    const contacts = await Contact.find(filter).sort({ leadScore: -1 }).populate('companyId', 'name color').populate('ownerId', 'name color').lean();
    res.json(contacts.map(shape));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, email, phone, title, companyId, status, tags } = req.body;
    if (!name) throw new HttpError(400, 'Name is required');
    if (companyId && !(await Company.exists({ _id: companyId, workspaceId: req.wid }))) throw new HttpError(400, 'Unknown company');
    const c = await Contact.create({ workspaceId: req.wid, name, email, phone, title, companyId, status, tags, ownerId: req.user._id, leadScore: 20, lastActivityAt: new Date() });
    res.status(201).json(shape(await Contact.findById(c._id).populate('companyId', 'name color').populate('ownerId', 'name color').lean()));
  })
);

/** Bulk actions: assign owner, add tag, simulated enrichment, delete (manager+). */
router.post(
  '/bulk',
  asyncHandler(async (req, res) => {
    const { ids = [], action, value } = req.body;
    if (!ids.length) throw new HttpError(400, 'Select at least one contact');
    const scope = { _id: { $in: ids }, workspaceId: req.wid };

    if (action === 'assign') {
      if (req.user.role === 'rep') throw new HttpError(403, 'Only managers can reassign contacts');
      if (!(await User.exists({ _id: value, workspaceId: req.wid }))) throw new HttpError(400, 'Unknown owner');
      await Contact.updateMany(scope, { $set: { ownerId: value } });
    } else if (action === 'tag') {
      if (!value) throw new HttpError(400, 'Tag is required');
      await Contact.updateMany(scope, { $addToSet: { tags: value } });
    } else if (action === 'enrich') {
      // Demo enrichment: marks records enriched and bumps lead score. Swap in Clearbit/Apollo here.
      await Contact.updateMany(scope, { $set: { enrichmentStatus: 'enriched' }, $inc: { leadScore: 5 } });
    } else if (action === 'delete') {
      if (req.user.role === 'rep') throw new HttpError(403, 'Only managers can delete contacts');
      await Contact.deleteMany(scope);
    } else throw new HttpError(400, 'Unknown bulk action');

    res.json({ ok: true, affected: ids.length });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const c = await Contact.findOne({ _id: req.params.id, workspaceId: req.wid }).populate('companyId', 'name color industry domain location').populate('ownerId', 'name color').lean();
    if (!c) throw new HttpError(404, 'Contact not found');
    const [deals, activities] = await Promise.all([
      Deal.find({ workspaceId: req.wid, contactId: c._id }).populate('companyId', 'name color domain industry').populate('ownerId', 'name color').lean(),
      Activity.find({ workspaceId: req.wid, contactId: c._id }).sort({ at: -1 }).limit(30).populate('userId', 'name color').lean(),
    ]);
    // Also surface activity logged against the contact's deals.
    const dealActs = await Activity.find({ workspaceId: req.wid, dealId: { $in: deals.map((d) => d._id) }, contactId: { $exists: false } }).sort({ at: -1 }).limit(15).populate('userId', 'name color').lean();
    const merged = [...activities, ...dealActs].sort((a, b) => new Date(b.at) - new Date(a.at));
    res.json({
      ...shape(c),
      company: c.companyId && { id: c.companyId._id, name: c.companyId.name, color: c.companyId.color, industry: c.companyId.industry, domain: c.companyId.domain, location: c.companyId.location },
      deals: deals.map(shapeDeal),
      activities: merged.map((a) => ({ id: a._id, type: a.type, title: a.title, content: a.content, at: a.at, user: a.userId && { name: a.userId.name, color: a.userId.color } })),
    });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const c = await Contact.findOne({ _id: req.params.id, workspaceId: req.wid });
    if (!c) throw new HttpError(404, 'Contact not found');
    for (const k of ['name', 'email', 'phone', 'title', 'status', 'tags', 'notes']) if (req.body[k] !== undefined) c[k] = req.body[k];
    await c.save();
    res.json(shape(await Contact.findById(c._id).populate('companyId', 'name color').populate('ownerId', 'name color').lean()));
  })
);

router.post(
  '/:id/notes',
  asyncHandler(async (req, res) => {
    const c = await Contact.findOne({ _id: req.params.id, workspaceId: req.wid });
    if (!c) throw new HttpError(404, 'Contact not found');
    if (!req.body.content?.trim()) throw new HttpError(400, 'Note cannot be empty');
    const a = await Activity.create({ workspaceId: req.wid, type: 'note', title: 'Note added', content: req.body.content.trim(), contactId: c._id, companyId: c.companyId, userId: req.user._id });
    c.lastActivityAt = new Date();
    await c.save();
    res.status(201).json({ id: a._id });
  })
);

router.delete(
  '/:id',
  requireRole('admin', 'manager'),
  asyncHandler(async (req, res) => {
    await Contact.deleteOne({ _id: req.params.id, workspaceId: req.wid });
    res.json({ ok: true });
  })
);

export default router;
