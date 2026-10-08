import { Router } from 'express';
import { Activity, Company, Contact, Deal } from '../models/index.js';
import { HttpError, asyncHandler } from '../middleware/auth.js';
import { STAGE_META, buildAction, daysSince, isOpen } from '../services/scoring.js';
import { shapeDeal } from './deals.js';

const router = Router();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const money = (n) => (n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : `$${n}`);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = { workspaceId: req.wid };
    if (req.query.q) filter.name = { $regex: esc(req.query.q), $options: 'i' };
    const [companies, contacts, deals] = await Promise.all([
      Company.find(filter).populate('ownerId', 'name color').sort({ name: 1 }).lean(),
      Contact.find({ workspaceId: req.wid }, 'companyId').lean(),
      Deal.find({ workspaceId: req.wid }, 'companyId value stage').lean(),
    ]);
    const cCount = {};
    contacts.forEach((c) => c.companyId && (cCount[c.companyId] = (cCount[c.companyId] || 0) + 1));
    const dStats = {};
    deals.forEach((d) => {
      if (!d.companyId) return;
      const s = (dStats[d.companyId] ||= { open: 0, openValue: 0, won: 0 });
      if (isOpen(d)) { s.open += 1; s.openValue += d.value; }
      if (d.stage === 'won') s.won += d.value;
    });
    res.json(
      companies.map((c) => ({
        id: c._id,
        name: c.name,
        domain: c.domain,
        industry: c.industry,
        size: c.size,
        location: c.location,
        tags: c.tags,
        color: c.color,
        enrichmentStatus: c.enrichmentStatus,
        owner: c.ownerId && { id: c.ownerId._id, name: c.ownerId.name, color: c.ownerId.color },
        contacts: cCount[c._id] || 0,
        openDeals: dStats[c._id]?.open || 0,
        openValue: dStats[c._id]?.openValue || 0,
        wonValue: dStats[c._id]?.won || 0,
      }))
    );
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, domain, industry, size, location } = req.body;
    if (!name) throw new HttpError(400, 'Company name is required');
    const c = await Company.create({ workspaceId: req.wid, name, domain, industry, size, location, ownerId: req.user._id, color: '#6D5EF5' });
    res.status(201).json({ id: c._id, name: c.name });
  })
);

/** Heuristic "Account Summary" built from live deals & activity. */
function accountSummary(company, deals, activities, contacts) {
  const open = deals.filter(isOpen);
  const won = deals.filter((d) => d.stage === 'won');
  const pipeline = open.reduce((s, d) => s + d.value, 0);
  const wonValue = won.reduce((s, d) => s + d.value, 0);
  const lastTouch = activities[0]?.at;
  const idle = daysSince(lastTouch);
  const top = [...open].sort((a, b) => b.value - a.value)[0];
  const execs = contacts.filter((c) => ['exec', 'director'].includes(c.seniority));

  const lines = [];
  lines.push(`${company.name} is a ${company.industry.toLowerCase()} company with ${company.size} employees${company.location ? `, based in ${company.location}` : ''}.`);
  if (open.length) lines.push(`There ${open.length === 1 ? 'is' : 'are'} ${open.length} open ${open.length === 1 ? 'opportunity' : 'opportunities'} worth ${money(pipeline)}${wonValue ? `, on top of ${money(wonValue)} already won` : ''}.`);
  else if (wonValue) lines.push(`They are an existing customer (${money(wonValue)} won) with no open expansion deal.`);
  else lines.push('No commercial activity yet.');
  if (lastTouch) lines.push(idle <= 7 ? `Last touchpoint was ${idle === 0 ? 'today' : `${idle} day${idle === 1 ? '' : 's'} ago`} — the relationship is warm.` : `Last touchpoint was ${idle} days ago — momentum is fading.`);
  lines.push(execs.length ? `${execs.length} senior contact${execs.length === 1 ? ' is' : 's are'} in the account (${execs.slice(0, 2).map((c) => c.name).join(', ')}).` : 'No senior stakeholder is mapped yet.');

  let next;
  if (top) next = `${top.title}: ${buildAction(top)}`;
  else if (wonValue) next = 'Schedule a quarterly business review and explore an expansion opportunity.';
  else next = 'Identify a champion and book an intro call.';
  const health = !open.length ? (wonValue ? 'Customer' : 'Cold') : idle > 14 ? 'At risk' : top?.ai?.winScore >= 65 ? 'Healthy' : 'Needs attention';
  return { summary: lines.join(' '), nextStep: next, health, pipeline, wonValue };
}

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const company = await Company.findOne({ _id: req.params.id, workspaceId: req.wid }).populate('ownerId', 'name color').lean();
    if (!company) throw new HttpError(404, 'Company not found');
    const [contacts, deals, acts] = await Promise.all([
      Contact.find({ workspaceId: req.wid, companyId: company._id }).sort({ leadScore: -1 }).lean(),
      Deal.find({ workspaceId: req.wid, companyId: company._id }).populate('companyId', 'name color domain industry').populate('contactId', 'name title email').populate('ownerId', 'name color').lean(),
      Activity.find({ workspaceId: req.wid, companyId: company._id }).sort({ at: -1 }).limit(40).populate('userId', 'name color').lean(),
    ]);
    res.json({
      id: company._id,
      name: company.name,
      domain: company.domain,
      industry: company.industry,
      size: company.size,
      location: company.location,
      revenue: company.revenue,
      tags: company.tags,
      color: company.color,
      enrichmentStatus: company.enrichmentStatus,
      owner: company.ownerId && { id: company.ownerId._id, name: company.ownerId.name, color: company.ownerId.color },
      ai: accountSummary(company, deals, acts, contacts),
      contacts: contacts.map((c) => ({ id: c._id, name: c.name, title: c.title, email: c.email, seniority: c.seniority, leadScore: c.leadScore, status: c.status })),
      deals: deals.map((d) => ({ ...shapeDeal(d), stageLabel: STAGE_META[d.stage].label })),
      activities: acts.map((a) => ({ id: a._id, type: a.type, title: a.title, content: a.content, at: a.at, user: a.userId && { name: a.userId.name, color: a.userId.color } })),
    });
  })
);

router.post(
  '/:id/notes',
  asyncHandler(async (req, res) => {
    const company = await Company.findOne({ _id: req.params.id, workspaceId: req.wid });
    if (!company) throw new HttpError(404, 'Company not found');
    if (!req.body.content?.trim()) throw new HttpError(400, 'Note cannot be empty');
    const a = await Activity.create({ workspaceId: req.wid, type: 'note', title: 'Note added', content: req.body.content.trim(), companyId: company._id, userId: req.user._id });
    res.status(201).json({ id: a._id });
  })
);

export default router;
