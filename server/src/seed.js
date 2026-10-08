import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { Activity, Company, Contact, Deal, Invitation, Notification, Task, User, Workflow, Workspace } from './models/index.js';
import { ruleInsight } from './services/scoring.js';

/* Deterministic randomness → identical screenshots on every seed. */
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(2026);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const DAY = 86400000;
const NOW = new Date();
const ago = (days, jitterHours = 0) => new Date(NOW - days * DAY - (jitterHours ? int(0, jitterHours) * 3600000 : 0));
const ahead = (days) => new Date(NOW.getTime() + days * DAY);
const id = () => new mongoose.Types.ObjectId();

export const DEMO = { email: 'maya@northbeam.io', password: 'cadence-demo' };

const USERS = [
  { name: 'Maya Chen', email: DEMO.email, role: 'admin', title: 'VP of Sales', color: '#6D5EF5' },
  { name: 'Daniel Okafor', email: 'daniel@northbeam.io', role: 'manager', title: 'Sales Manager', color: '#0EA5A4' },
  { name: 'Sofia Alvarez', email: 'sofia@northbeam.io', role: 'rep', title: 'Senior Account Executive', color: '#E8590C' },
  { name: 'Liam Walsh', email: 'liam@northbeam.io', role: 'rep', title: 'Account Executive', color: '#2F9E44' },
  { name: 'Priya Nair', email: 'priya@northbeam.io', role: 'rep', title: 'Account Executive', color: '#D6336C' },
  { name: 'Omar Haddad', email: 'omar@northbeam.io', role: 'rep', title: 'Account Executive', color: '#1C7ED6' },
];

// name, industry, size, location, domain
const COMPANIES = [
  ['Acme Corp', 'Manufacturing', '501-1000', 'Chicago, IL', 'acmecorp.com'],
  ['Kestrel Aerospace', 'Aerospace', '201-500', 'Seattle, WA', 'kestrel.aero'],
  ['Lumina Retail', 'Retail', '1001-5000', 'Austin, TX', 'luminaretail.com'],
  ['Fernhill Education', 'Education', '51-200', 'Boston, MA', 'fernhill.edu'],
  ['Atlas Mining', 'Mining', '501-1000', 'Denver, CO', 'atlasmining.co'],
  ['Marlow & Pike', 'Professional Services', '11-50', 'London, UK', 'marlowpike.co.uk'],
  ['Orbit Freight', 'Logistics', '201-500', 'Rotterdam, NL', 'orbitfreight.com'],
  ['Verdant Energy', 'Energy', '201-500', 'Portland, OR', 'verdant.energy'],
  ['Paperplane Finance', 'Fintech', '51-200', 'New York, NY', 'paperplane.finance'],
  ['Quill & Co', 'Media', '11-50', 'Toronto, CA', 'quill.co'],
  ['Helix Biotech', 'Biotech', '201-500', 'San Diego, CA', 'helixbio.com'],
  ['Solstice Health', 'Healthcare', '1001-5000', 'Nashville, TN', 'solsticehealth.org'],
  ['Tidewater Bank', 'Banking', '1001-5000', 'Charlotte, NC', 'tidewaterbank.com'],
  ['Nimbus Cloud', 'Software', '201-500', 'Dublin, IE', 'nimbus.cloud'],
  ['Brightwave Logistics', 'Logistics', '501-1000', 'Atlanta, GA', 'brightwave.io'],
  ['Cobalt Robotics', 'Robotics', '51-200', 'Pittsburgh, PA', 'cobaltrobotics.ai'],
  ['Kingfisher Media', 'Media', '201-500', 'Los Angeles, CA', 'kingfisher.media'],
  ['Pinecrest Hospitality', 'Hospitality', '501-1000', 'Miami, FL', 'pinecrest.travel'],
  ['Redwood Insurance', 'Insurance', '1001-5000', 'Hartford, CT', 'redwoodins.com'],
  ['Summit Outdoor', 'Consumer Goods', '201-500', 'Boulder, CO', 'summitoutdoor.com'],
  ['Vertex Labs', 'Software', '51-200', 'Berlin, DE', 'vertexlabs.dev'],
  ['Lumen Grid', 'Utilities', '1001-5000', 'Phoenix, AZ', 'lumengrid.com'],
  ['Harbor & Vine', 'Food & Beverage', '201-500', 'San Francisco, CA', 'harborvine.com'],
  ['Oakline Capital', 'Financial Services', '51-200', 'Zurich, CH', 'oakline.capital'],
  ['Delta Freight', 'Logistics', '201-500', 'Houston, TX', 'deltafreight.com'],
  ['Aster Pharma', 'Pharmaceuticals', '1001-5000', 'Basel, CH', 'asterpharma.com'],
  // existing customers
  ['Granite Systems', 'Software', '201-500', 'Raleigh, NC', 'granite.systems'],
  ['Crescent Foods', 'Food & Beverage', '501-1000', 'Dallas, TX', 'crescentfoods.com'],
  ['Beacon Legal', 'Legal', '51-200', 'Chicago, IL', 'beacon.legal'],
  ['Ironwood Mfg', 'Manufacturing', '501-1000', 'Detroit, MI', 'ironwoodmfg.com'],
  ['Skyline Realty', 'Real Estate', '201-500', 'Seattle, WA', 'skylinerealty.com'],
  ['Tandem Mobility', 'Automotive', '201-500', 'Munich, DE', 'tandem.mobility'],
  ['Willow Health', 'Healthcare', '501-1000', 'Minneapolis, MN', 'willowhealth.org'],
  ['Copperleaf Energy', 'Energy', '51-200', 'Calgary, CA', 'copperleaf.energy'],
  ['Northgate Retail', 'Retail', '1001-5000', 'Manchester, UK', 'northgate.retail'],
  ['Maple Street Bank', 'Banking', '501-1000', 'Columbus, OH', 'maplestreet.bank'],
  ['Ember Studios', 'Media', '11-50', 'Vancouver, CA', 'ember.studio'],
  ['Cascade Water', 'Utilities', '201-500', 'Spokane, WA', 'cascadewater.com'],
];
const PALETTE = ['#6D5EF5', '#0EA5A4', '#E8590C', '#2F9E44', '#D6336C', '#1C7ED6', '#B08900', '#7048E8', '#C2255C', '#0B7285'];

const FIRST = ['Elena', 'Marcus', 'Hannah', 'Tomás', 'Aisha', 'Gabriel', 'Ingrid', 'Rohan', 'Chloé', 'Mateo', 'Nadia', 'Felix', 'Yuki', 'Isabel', 'Kwame', 'Lena', 'Victor', 'Amara', 'Jonas', 'Mei', 'Callum', 'Zara', 'Nikolai', 'Sienna', 'Dev', 'Freya', 'Andre', 'Talia', 'Hugo', 'Leila'];
const LAST = ['Torres', 'Lindqvist', 'Okonkwo', 'Bianchi', 'Kapoor', 'Fontaine', 'Novak', 'Haddad', 'Sørensen', 'Mbeki', 'Castillo', 'Whitfield', 'Tanaka', 'Moreau', 'Petrov', 'Adeyemi', 'Brennan', 'Costa', 'Nakamura', 'Schultz', 'Rahman', 'Ferreira', 'Doyle', 'Lund', 'Vasquez'];
const TITLES = {
  exec: ['Chief Financial Officer', 'Chief Operating Officer', 'Chief Technology Officer', 'VP of Operations', 'Chief Revenue Officer'],
  director: ['Director of Operations', 'Director of IT', 'Head of Procurement', 'Director of Finance'],
  manager: ['Operations Manager', 'Product Manager', 'Program Manager', 'Procurement Manager', 'Sales Operations Manager'],
  ic: ['Business Analyst', 'Systems Engineer', 'Operations Analyst'],
};
const TAGS = ['Champion', 'Decision maker', 'Inbound', 'Event lead', 'Enterprise', 'Warm intro', 'Technical buyer', 'Budget holder'];

// [title, company, stage, value, ownerIdx, priority, closeInDays, meetings, emails, proposalViews, dm, followUp, idleDays]
const OPEN_DEALS = [
  ['Kestrel Aerospace — Pilot Programme', 'Kestrel Aerospace', 'new', 18000, 5, 'low', 60, 0, 1, 0, 0, 0, 3],
  ['Lumina Retail — POS Analytics', 'Lumina Retail', 'new', 22000, 3, 'medium', 55, 0, 2, 0, 0, 0, 6],
  ['Fernhill Education — Campus Licence', 'Fernhill Education', 'new', 9500, 4, 'low', 70, 0, 0, 0, 0, 0, 12],
  ['Atlas Mining — Safety Dashboard', 'Atlas Mining', 'new', 31000, 2, 'medium', 50, 0, 1, 0, 0, 1, 2],
  ['Marlow & Pike — Advisory Seats', 'Marlow & Pike', 'new', 6800, 5, 'low', 40, 0, 3, 0, 0, 0, 1],
  ['Orbit Freight — Route Optimiser', 'Orbit Freight', 'qualified', 46000, 3, 'high', 40, 1, 4, 0, 0, 1, 3],
  ['Verdant Energy — Grid Insights', 'Verdant Energy', 'qualified', 58000, 2, 'high', 38, 1, 3, 0, 1, 0, 5],
  ['Paperplane Finance — Compliance Suite', 'Paperplane Finance', 'qualified', 27500, 4, 'medium', 45, 0, 2, 0, 0, 0, 9],
  ['Quill & Co — Content Ops', 'Quill & Co', 'qualified', 12400, 5, 'low', 33, 1, 2, 0, 0, 1, 4],
  ['Helix Biotech — Lab Notebook', 'Helix Biotech', 'qualified', 39000, 4, 'medium', 52, 0, 1, 0, 0, 0, 14],
  ['Solstice Health — Patient Portal', 'Solstice Health', 'discovery', 64000, 2, 'high', 30, 2, 5, 0, 1, 1, 2],
  ['Tidewater Bank — Risk Analytics', 'Tidewater Bank', 'discovery', 92000, 3, 'high', 35, 1, 3, 0, 0, 0, 8],
  ['Nimbus Cloud — Partner Programme', 'Nimbus Cloud', 'discovery', 35000, 4, 'medium', 28, 2, 4, 0, 1, 1, 3],
  ['Brightwave Logistics — Fleet Platform', 'Brightwave Logistics', 'discovery', 48500, 5, 'medium', 26, 1, 2, 0, 0, 0, 11],
  ['Cobalt Robotics — Pilot Rollout', 'Cobalt Robotics', 'discovery', 29000, 1, 'low', 34, 1, 1, 0, 0, 0, 6],
  ['Acme Corp — Platform Expansion', 'Acme Corp', 'proposal', 84000, 2, 'high', 18, 2, 3, 2, 1, 0, 1],
  ['Kingfisher Media — Newsroom Suite', 'Kingfisher Media', 'proposal', 41000, 3, 'medium', 14, 1, 5, 3, 1, 1, 2],
  ['Pinecrest Hospitality — Booking Engine', 'Pinecrest Hospitality', 'proposal', 57000, 4, 'high', 9, 0, 2, 1, 0, 0, 12],
  ['Redwood Insurance — Claims Automation', 'Redwood Insurance', 'proposal', 120000, 1, 'high', 24, 1, 3, 2, 0, 0, 6],
  ['Summit Outdoor — Dealer Portal', 'Summit Outdoor', 'proposal', 23800, 5, 'medium', 11, 2, 4, 1, 1, 1, 3],
  ['Vertex Labs — Data Pipeline', 'Vertex Labs', 'proposal', 33200, 3, 'medium', 20, 1, 2, 1, 0, 0, 9],
  ['Lumen Grid — Smart Metering', 'Lumen Grid', 'negotiation', 105000, 1, 'high', 6, 3, 6, 4, 1, 1, 1],
  ['Harbor & Vine — Franchise CRM', 'Harbor & Vine', 'negotiation', 38500, 2, 'medium', 5, 2, 5, 3, 1, 0, 2],
  ['Oakline Capital — Portfolio Hub', 'Oakline Capital', 'negotiation', 72000, 3, 'high', 12, 2, 3, 2, 1, 1, 4],
  ['Delta Freight — Dock Scheduler', 'Delta Freight', 'negotiation', 26500, 4, 'medium', 3, 1, 2, 2, 1, 0, 5],
  ['Aster Pharma — Trial Operations', 'Aster Pharma', 'negotiation', 88000, 2, 'high', 16, 2, 4, 3, 0, 0, 7],
];

// [company, value, ownerIdx, closedDaysAgo]
const WON = [
  ['Granite Systems', 64000, 2, 4], ['Crescent Foods', 38500, 3, 11], ['Beacon Legal', 92000, 1, 19], ['Ironwood Mfg', 27000, 4, 33],
  ['Skyline Realty', 51000, 5, 41], ['Tandem Mobility', 73500, 2, 58], ['Willow Health', 18900, 3, 66], ['Copperleaf Energy', 46000, 4, 84],
  ['Northgate Retail', 78000, 2, 97], ['Maple Street Bank', 112000, 1, 118], ['Ember Studios', 64000, 3, 139], ['Cascade Water', 86000, 2, 158],
];
// [company, value, ownerIdx, closedDaysAgo, lastStage]
const LOST = [
  ['Kestrel Aerospace', 36000, 3, 9, 'proposal'], ['Atlas Mining', 54000, 4, 22, 'negotiation'], ['Quill & Co', 15500, 5, 37, 'discovery'],
  ['Helix Biotech', 61000, 4, 52, 'proposal'], ['Vertex Labs', 28000, 3, 75, 'qualified'], ['Summit Outdoor', 44000, 5, 101, 'negotiation'],
  ['Delta Freight', 33000, 4, 123, 'discovery'], ['Marlow & Pike', 12000, 5, 149, 'qualified'],
];

const ORDER = ['new', 'qualified', 'discovery', 'proposal', 'negotiation', 'won'];
// Average days spent per stage — Proposal is deliberately the slow one so the analytics tell a story.
const DWELL = { new: [2, 6], qualified: [4, 9], discovery: [6, 13], proposal: [10, 22], negotiation: [5, 12] };

const MEETINGS = ['Discovery call with {c}', 'Product demo for {c}’s team', 'Stakeholder review', 'Pricing walkthrough', 'Security & procurement sync'];
const EMAILS = ['Sent follow-up with next steps', 'Replied to security questionnaire', 'Shared relevant case study', 'Intro email opened 3×', 'Sent revised scope'];
const NOTES = [
  'Champion confirmed budget is approved for this quarter.',
  'Procurement needs a signed DPA before issuing a PO.',
  'Running a parallel evaluation — they rate the competitor higher on integrations.',
  'Legal asked for an MSA redline; sending by Friday.',
  'CFO wants an ROI model before the next call.',
  'Pain point: manual reporting takes their team ~12 hours a week.',
];
const TASKS = ['Send revised proposal', 'Prepare ROI model', 'Intro call with finance lead', 'Security questionnaire follow-up', 'Confirm signature date', 'Share customer references', 'Book technical deep-dive'];

export async function seed({ wipe = true } = {}) {
  if (wipe) {
    await Promise.all([Workspace, User, Company, Contact, Deal, Activity, Task, Workflow, Invitation, Notification].map((m) => m.deleteMany({})));
  }
  const passwordHash = bcrypt.hashSync(DEMO.password, 10);

  /* Workspace + users */
  const ws = await Workspace.create({ name: 'Northbeam Labs', plan: 'pro', subscriptionStatus: 'active', renewsAt: ahead(23), usage: { aiQueries: 142, periodStart: ago(7) } });
  const users = await User.insertMany(USERS.map((u, i) => ({ ...u, workspaceId: ws._id, passwordHash, lastActiveAt: ago(i * 0.3) })));
  const uid = (i) => users[i]._id;

  /* Companies */
  const companies = await Company.insertMany(
    COMPANIES.map(([name, industry, size, location, domain], i) => ({
      workspaceId: ws._id, name, industry, size, location, domain, color: PALETTE[i % PALETTE.length],
      ownerId: uid(2 + (i % 4)), tags: i > 25 ? ['Customer'] : i % 3 === 0 ? ['Enterprise'] : i % 3 === 1 ? ['Mid-market'] : ['Inbound'],
      enrichmentStatus: rnd() < 0.8 ? 'enriched' : rnd() < 0.7 ? 'pending' : 'failed',
    }))
  );
  const company = Object.fromEntries(companies.map((c) => [c.name, c]));

  /* Contacts */
  const contactDocs = [];
  const byCompany = {};
  const mkContact = (c, seniority, extra = {}) => {
    const first = extra.first || pick(FIRST);
    const last = extra.last || pick(LAST);
    const doc = {
      _id: id(), workspaceId: ws._id, name: `${first} ${last}`, email: `${first}.${last}`.toLowerCase().normalize('NFD').replace(/[^\w.]/g, '') + `@${c.domain}`,
      phone: `+1 (${int(200, 989)}) ${int(200, 989)}-${int(1000, 9999)}`, title: extra.title || pick(TITLES[seniority]), seniority, companyId: c._id, ownerId: c.ownerId,
      status: c.tags.includes('Customer') ? 'customer' : pick(['lead', 'engaged', 'engaged']), leadScore: extra.leadScore ?? int(28, 94),
      tags: extra.tags || [pick(TAGS), ...(rnd() < 0.4 ? [pick(TAGS)] : [])].filter((t, i, a) => a.indexOf(t) === i),
      enrichmentStatus: rnd() < 0.82 ? 'enriched' : 'pending', lastActivityAt: ago(int(0, 25)), createdAt: ago(int(30, 200)),
    };
    contactDocs.push(doc);
    (byCompany[c.name] ||= []).push(doc);
    return doc;
  };
  // Acme gets a hand-written buying committee for the 360° screen.
  const acme = company['Acme Corp'];
  mkContact(acme, 'exec', { first: 'Rebecca', last: 'Torres', title: 'Chief Financial Officer', leadScore: 92, tags: ['Decision maker', 'Budget holder'] });
  mkContact(acme, 'director', { first: 'Marcus', last: 'Lindqvist', title: 'VP of Operations', leadScore: 88, tags: ['Champion'] });
  mkContact(acme, 'director', { first: 'Priyanka', last: 'Desai', title: 'Director of IT', leadScore: 71, tags: ['Technical buyer'] });
  mkContact(acme, 'manager', { first: 'Tom', last: 'Brennan', title: 'Procurement Manager', leadScore: 64, tags: ['Enterprise'] });
  for (const c of companies) {
    if (c.name === 'Acme Corp') continue;
    mkContact(c, rnd() < 0.5 ? 'exec' : 'director');
    mkContact(c, pick(['manager', 'manager', 'ic']));
    if (rnd() < 0.35) mkContact(c, 'manager');
  }
  await Contact.insertMany(contactDocs);

  /* Deals */
  const dealDocs = [];
  const activityDocs = [];
  const taskDocs = [];

  const buildHistory = (path, endAt) => {
    // walk backwards from endAt using random dwell durations
    const durations = path.map((s) => (DWELL[s] ? int(...DWELL[s]) : int(2, 6)));
    const total = durations.reduce((a, b) => a + b, 0);
    let t = endAt.getTime() - total * DAY;
    const createdAt = new Date(t);
    const hist = path.map((s, i) => { const at = new Date(t); t += durations[i] * DAY; return { stage: s, at }; });
    return { hist, createdAt };
  };

  const addActivities = (deal, contact, ownerId, s, idle, closedAt) => {
    const mk = (type, title, content, daysAgo) =>
      activityDocs.push({ _id: id(), workspaceId: ws._id, type, title, content, dealId: deal._id, contactId: contact?._id, companyId: deal.companyId, userId: ownerId, at: ago(daysAgo, 6) });
    const cn = contact?.name.split(' ')[0] || 'the team';
    let d = idle;
    for (let i = 0; i < s.meetings14d; i++) { mk('meeting', pick(MEETINGS).replace('{c}', cn), `${s.decisionMakerEngaged && i < 2 ? 'Decision maker attended. ' : ''}Notes logged by ${'owner'}.`.replace(' Notes logged by owner.', ''), Math.min(13, d)); d += int(2, 4); }
    for (let i = 0; i < Math.min(s.emailsOpened14d, 4); i++) { mk('email', pick(EMAILS), `${cn} engaged with the email.`, Math.min(13, idle + int(0, 6))); }
    if (s.proposalViews) mk('proposal', 'Proposal viewed', `${cn} opened the proposal ${s.proposalViews}× (avg 3m 40s).`, Math.min(10, idle + 1));
    mk('note', 'Note added', pick(NOTES), idle + int(1, 3));
    mk('call', 'Intro call', 'Qualified need and timeline.', Math.max(idle + 14, 15) + int(0, 14));
    if (closedAt) mk('system', 'Deal closed', 'Moved to its final stage.', Math.max(0, Math.floor((NOW - closedAt) / DAY)));
  };

  for (const [title, cname, stage, value, owner, priority, closeIn, meetings, emails, views, dm, followUp, idle] of OPEN_DEALS) {
    const c = company[cname];
    const people = byCompany[cname];
    const contact = (dm ? people.find((p) => ['exec', 'director'].includes(p.seniority)) : people[people.length - 1]) || people[0];
    const path = ORDER.slice(0, ORDER.indexOf(stage));
    const lastDwell = int(2, Math.max(3, idle + 4));
    const { hist, createdAt } = buildHistory(path, ago(lastDwell));
    hist.push({ stage, at: ago(lastDwell) });
    const signals = { meetings14d: meetings, emailsOpened14d: emails, proposalViews: views, decisionMakerEngaged: Boolean(dm), followUpScheduled: Boolean(followUp), lastActivityAt: ago(idle) };
    const deal = { _id: id(), workspaceId: ws._id, title, value, stage, priority, companyId: c._id, contactId: contact._id, ownerId: uid(owner), expectedClose: ahead(closeIn), stageHistory: hist, signals, createdAt, updatedAt: ago(idle) };
    deal.ai = ruleInsight(deal, NOW);
    dealDocs.push(deal);
    addActivities(deal, contact, uid(owner), signals, idle);
    if (followUp) taskDocs.push({ workspaceId: ws._id, title: `${pick(TASKS)} — ${cname}`, dueAt: ahead(int(0, 5)), dealId: deal._id, ownerId: uid(owner), done: false });
  }

  WON.forEach(([cname, value, owner, daysAgo], i) => {
    const c = company[cname];
    const closedAt = ago(daysAgo);
    const { hist, createdAt } = buildHistory(ORDER.slice(0, 5), closedAt);
    hist.push({ stage: 'won', at: closedAt });
    const contact = byCompany[cname][0];
    const signals = { meetings14d: 0, emailsOpened14d: 0, proposalViews: 3, decisionMakerEngaged: true, followUpScheduled: false, lastActivityAt: closedAt };
    const deal = { _id: id(), workspaceId: ws._id, title: `${cname} — ${['Annual Platform', 'Operations Suite', 'Enterprise Licence', 'Team Rollout'][i % 4]}`, value, stage: 'won', priority: 'medium', companyId: c._id, contactId: contact._id, ownerId: uid(owner), expectedClose: closedAt, closedAt, stageHistory: hist, signals, createdAt };
    deal.ai = ruleInsight(deal, NOW);
    dealDocs.push(deal);
    addActivities(deal, contact, uid(owner), { meetings14d: 1, emailsOpened14d: 1, proposalViews: 1, decisionMakerEngaged: true }, daysAgo, closedAt);
  });

  LOST.forEach(([cname, value, owner, daysAgo, lastStage], i) => {
    const c = company[cname];
    const closedAt = ago(daysAgo);
    const path = ORDER.slice(0, ORDER.indexOf(lastStage) + 1);
    const { hist, createdAt } = buildHistory(path, closedAt);
    hist.push({ stage: 'lost', at: closedAt });
    const contact = byCompany[cname][0];
    const signals = { meetings14d: 0, emailsOpened14d: 0, proposalViews: 0, decisionMakerEngaged: false, followUpScheduled: false, lastActivityAt: closedAt };
    const deal = { _id: id(), workspaceId: ws._id, title: `${cname} — ${['Initial Pilot', 'Expansion', 'Replacement Project'][i % 3]}`, value, stage: 'lost', priority: 'low', companyId: c._id, contactId: contact._id, ownerId: uid(owner), expectedClose: closedAt, closedAt, stageHistory: hist, signals, createdAt };
    deal.ai = ruleInsight(deal, NOW);
    dealDocs.push(deal);
  });

  await Deal.insertMany(dealDocs);
  await Activity.insertMany(activityDocs);

  // A few generic tasks so the dashboard "upcoming" list is rich, including one overdue.
  const openDeals = dealDocs.filter((d) => !['won', 'lost'].includes(d.stage));
  taskDocs.push({ workspaceId: ws._id, title: 'Send revised order form — Lumen Grid', dueAt: ahead(0.2), dealId: openDeals.find((d) => d.title.startsWith('Lumen'))._id, ownerId: uid(1) });
  taskDocs.push({ workspaceId: ws._id, title: 'Prepare ROI model for CFO — Acme Corp', dueAt: ahead(1), dealId: openDeals.find((d) => d.title.startsWith('Acme'))._id, ownerId: uid(2) });
  taskDocs.push({ workspaceId: ws._id, title: 'Re-engage Pinecrest Hospitality', dueAt: ago(1), dealId: openDeals.find((d) => d.title.startsWith('Pinecrest'))._id, ownerId: uid(4), auto: true });
  taskDocs.push({ workspaceId: ws._id, title: 'Quarterly pipeline review', dueAt: ahead(2), ownerId: uid(0) });
  taskDocs.push({ workspaceId: ws._id, title: 'Share case study — Harbor & Vine', dueAt: ago(2), done: true, dealId: openDeals.find((d) => d.title.startsWith('Harbor'))._id, ownerId: uid(2) });
  await Task.insertMany(taskDocs);

  /* Workflows */
  await Workflow.insertMany([
    { workspaceId: ws._id, name: 'Re-engage stalled deals', active: true, trigger: { type: 'deal_inactive', days: 7 }, conditions: [{ field: 'value', op: 'gte', value: 10000 }], actions: [{ type: 'create_task', params: { title: 'Re-engage {{deal}}', dueInDays: 1 } }, { type: 'notify_owner', params: { message: '{{deal}} has gone quiet — a follow-up task was created.' } }], runCount: 38, lastRunAt: ago(0.4), runs: [{ at: ago(0.4), summary: 'Pinecrest Hospitality — Booking Engine: task created, owner notified' }, { at: ago(1.1), summary: 'Helix Biotech — Lab Notebook: task created, owner notified' }] },
    { workspaceId: ws._id, name: 'Big deal alert', active: true, trigger: { type: 'stage_changed', stage: 'negotiation' }, conditions: [{ field: 'value', op: 'gte', value: 50000 }], actions: [{ type: 'notify_manager', params: { message: '{{deal}} ({{value}}) entered negotiation.' } }], runCount: 9, lastRunAt: ago(3), runs: [{ at: ago(3), summary: 'Lumen Grid — Smart Metering: managers notified' }] },
    { workspaceId: ws._id, name: 'Prioritise enterprise deals', active: true, trigger: { type: 'deal_created' }, conditions: [{ field: 'value', op: 'gte', value: 75000 }], actions: [{ type: 'set_priority', params: { priority: 'high' } }, { type: 'notify_manager', params: { message: 'New enterprise deal: {{deal}}' } }], runCount: 6, lastRunAt: ago(12), runs: [] },
    { workspaceId: ws._id, name: 'Closed-won handoff', active: false, trigger: { type: 'stage_changed', stage: 'won' }, conditions: [], actions: [{ type: 'create_task', params: { title: 'Kick off onboarding for {{deal}}', dueInDays: 2 } }], runCount: 12, lastRunAt: ago(4), runs: [] },
  ]);

  await Notification.insertMany([
    { workspaceId: ws._id, userId: uid(0), title: 'Big deal alert', body: 'Lumen Grid — Smart Metering ($105,000) entered negotiation.', dealId: dealDocs.find((d) => d.title.startsWith('Lumen'))._id, createdAt: ago(0.1) },
    { workspaceId: ws._id, userId: uid(0), title: 'Re-engage stalled deals', body: 'Pinecrest Hospitality — Booking Engine has gone quiet — a follow-up task was created.', dealId: dealDocs.find((d) => d.title.startsWith('Pinecrest'))._id, createdAt: ago(0.4) },
    { workspaceId: ws._id, userId: uid(0), title: 'Deal won', body: 'Sofia closed Granite Systems — Annual Platform ($64,000).', read: true, createdAt: ago(4) },
  ]);

  await Invitation.create({ workspaceId: ws._id, email: 'jordan.ellis@northbeam.io', role: 'rep', token: 'demo-invite-token-jordan', invitedBy: uid(0) });

  /* A second tenant — proves isolation (see scripts/isolation-check.mjs). */
  const ws2 = await Workspace.create({ name: 'Foxglove Studio', plan: 'free' });
  const u2 = await User.create({ workspaceId: ws2._id, name: 'Iris Moreau', email: 'iris@foxglove.dev', passwordHash, role: 'admin', color: '#2F9E44' });
  const c2 = await Company.create({ workspaceId: ws2._id, name: 'Paper Lantern Co', industry: 'Retail', size: '11-50', location: 'Lisbon, PT', domain: 'paperlantern.co', color: '#B08900', ownerId: u2._id });
  const d2 = { workspaceId: ws2._id, title: 'Paper Lantern — Brand Refresh', value: 12000, stage: 'qualified', companyId: c2._id, ownerId: u2._id, stageHistory: [{ stage: 'qualified', at: ago(3) }], expectedClose: ahead(30), signals: { lastActivityAt: ago(2), meetings14d: 1 } };
  d2.ai = ruleInsight(d2, NOW);
  await Deal.create(d2);

  return { workspaces: 2, users: users.length + 1, companies: companies.length + 1, contacts: contactDocs.length, deals: dealDocs.length + 1, activities: activityDocs.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mongoose.connect(config.mongoUri);
  const stats = await seed();
  console.log('✓ Seeded demo data', stats);
  console.log(`  Sign in → ${DEMO.email} / ${DEMO.password}`);
  await mongoose.disconnect();
}
