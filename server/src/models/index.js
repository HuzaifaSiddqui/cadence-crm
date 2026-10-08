import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const oid = (ref, extra = {}) => ({ type: Schema.Types.ObjectId, ref, ...extra });

export const STAGES = ['new', 'qualified', 'discovery', 'proposal', 'negotiation', 'won', 'lost'];
export const BOARD_STAGES = ['new', 'qualified', 'discovery', 'proposal', 'negotiation', 'won'];
export const ROLES = ['admin', 'manager', 'rep'];

/* ───────────── Workspace (tenant) ───────────── */
const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    plan: { type: String, enum: ['free', 'pro', 'business'], default: 'free' },
    subscriptionStatus: { type: String, default: 'none' }, // none | active | past_due | canceled
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    renewsAt: Date,
    usage: {
      aiQueries: { type: Number, default: 0 },
      periodStart: { type: Date, default: () => new Date() },
    },
  },
  { timestamps: true }
);

/* ───────────── User ───────────── */
const userSchema = new Schema(
  {
    workspaceId: oid('Workspace', { required: true, index: true }),
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'rep' },
    title: String,
    color: { type: String, default: '#6D5EF5' },
    lastActiveAt: Date,
  },
  { timestamps: true }
);

/* ───────────── Company ───────────── */
const companySchema = new Schema(
  {
    workspaceId: oid('Workspace', { required: true, index: true }),
    name: { type: String, required: true, trim: true },
    domain: String,
    industry: String,
    size: String, // e.g. "51-200"
    location: String,
    revenue: String,
    ownerId: oid('User'),
    tags: [String],
    enrichmentStatus: { type: String, enum: ['pending', 'enriched', 'failed'], default: 'pending' },
    color: String,
  },
  { timestamps: true }
);

/* ───────────── Contact ───────────── */
const contactSchema = new Schema(
  {
    workspaceId: oid('Workspace', { required: true, index: true }),
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    phone: String,
    title: String,
    seniority: { type: String, enum: ['ic', 'manager', 'director', 'exec'], default: 'manager' },
    companyId: oid('Company', { index: true }),
    ownerId: oid('User'),
    status: { type: String, enum: ['lead', 'engaged', 'customer', 'churned'], default: 'lead' },
    leadScore: { type: Number, default: 0 },
    tags: [String],
    enrichmentStatus: { type: String, enum: ['pending', 'enriched', 'failed'], default: 'pending' },
    lastActivityAt: Date,
    notes: String,
  },
  { timestamps: true }
);

/* ───────────── Deal ───────────── */
const dealSchema = new Schema(
  {
    workspaceId: oid('Workspace', { required: true, index: true }),
    title: { type: String, required: true, trim: true },
    value: { type: Number, default: 0 },
    stage: { type: String, enum: STAGES, default: 'new', index: true },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    companyId: oid('Company', { index: true }),
    contactId: oid('Contact'),
    ownerId: oid('User', { index: true }),
    expectedClose: Date,
    closedAt: Date,
    stageHistory: [{ stage: String, at: Date, _id: false }],
    // Behavioural signals the scoring engine reads.
    signals: {
      meetings14d: { type: Number, default: 0 },
      emailsOpened14d: { type: Number, default: 0 },
      proposalViews: { type: Number, default: 0 },
      decisionMakerEngaged: { type: Boolean, default: false },
      followUpScheduled: { type: Boolean, default: false },
      lastActivityAt: { type: Date, default: () => new Date() },
    },
    ai: {
      winScore: { type: Number, default: 0 },
      factors: [{ label: String, impact: Number, _id: false }],
      summary: String,
      action: String,
      risks: [String],
      source: { type: String, default: 'rules' }, // rules | openai
      updatedAt: Date,
    },
    autoFired: { type: Schema.Types.Mixed, default: {} }, // workflowId -> Date (de-dupe inactivity runs)
  },
  { timestamps: true }
);

/* ───────────── Activity ───────────── */
const activitySchema = new Schema(
  {
    workspaceId: oid('Workspace', { required: true, index: true }),
    type: { type: String, enum: ['email', 'meeting', 'call', 'note', 'task', 'system', 'proposal'], required: true },
    title: String,
    content: String,
    dealId: oid('Deal', { index: true }),
    contactId: oid('Contact', { index: true }),
    companyId: oid('Company', { index: true }),
    userId: oid('User'),
    at: { type: Date, default: () => new Date(), index: true },
  },
  { timestamps: true }
);

/* ───────────── Task ───────────── */
const taskSchema = new Schema(
  {
    workspaceId: oid('Workspace', { required: true, index: true }),
    title: { type: String, required: true },
    dueAt: Date,
    done: { type: Boolean, default: false },
    dealId: oid('Deal'),
    ownerId: oid('User', { index: true }),
    auto: { type: Boolean, default: false }, // created by a workflow
  },
  { timestamps: true }
);

/* ───────────── Workflow ───────────── */
const workflowSchema = new Schema(
  {
    workspaceId: oid('Workspace', { required: true, index: true }),
    name: { type: String, required: true },
    active: { type: Boolean, default: true },
    trigger: {
      type: { type: String, enum: ['deal_inactive', 'stage_changed', 'deal_created'], required: true },
      days: Number,
      stage: String,
    },
    conditions: [{ field: String, op: String, value: Schema.Types.Mixed, _id: false }],
    actions: [{ type: { type: String }, params: Schema.Types.Mixed, _id: false }],
    runCount: { type: Number, default: 0 },
    lastRunAt: Date,
    runs: [{ at: Date, dealId: oid('Deal'), summary: String, _id: false }],
  },
  { timestamps: true }
);

/* ───────────── Invitation ───────────── */
const invitationSchema = new Schema(
  {
    workspaceId: oid('Workspace', { required: true, index: true }),
    email: { type: String, required: true, lowercase: true },
    role: { type: String, enum: ROLES, default: 'rep' },
    token: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
    invitedBy: oid('User'),
  },
  { timestamps: true }
);

/* ───────────── Notification ───────────── */
const notificationSchema = new Schema(
  {
    workspaceId: oid('Workspace', { required: true, index: true }),
    userId: oid('User', { index: true }),
    title: String,
    body: String,
    dealId: oid('Deal'),
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Workspace = model('Workspace', workspaceSchema);
export const User = model('User', userSchema);
export const Company = model('Company', companySchema);
export const Contact = model('Contact', contactSchema);
export const Deal = model('Deal', dealSchema);
export const Activity = model('Activity', activitySchema);
export const Task = model('Task', taskSchema);
export const Workflow = model('Workflow', workflowSchema);
export const Invitation = model('Invitation', invitationSchema);
export const Notification = model('Notification', notificationSchema);
