import { PLANS } from '../config.js';
import { Deal, User, Invitation } from '../models/index.js';
import { HttpError } from '../middleware/auth.js';

export async function getUsage(workspace) {
  const [seats, pending, deals] = await Promise.all([
    User.countDocuments({ workspaceId: workspace._id }),
    Invitation.countDocuments({ workspaceId: workspace._id, status: 'pending' }),
    Deal.countDocuments({ workspaceId: workspace._id, stage: { $nin: ['won', 'lost'] } }),
  ]);
  return { seats, pendingInvites: pending, deals, aiQueries: workspace.usage?.aiQueries || 0 };
}

const effectivePlan = (workspace) =>
  workspace.plan !== 'free' && workspace.subscriptionStatus === 'canceled' ? PLANS.free : PLANS[workspace.plan];

/** Throws a 402 with an upgrade hint when a plan limit would be exceeded. */
export async function assertWithinLimit(workspace, key) {
  const plan = effectivePlan(workspace);
  const limit = plan.limits[key];
  if (limit === null) return;
  const usage = await getUsage(workspace);
  const current = key === 'seats' ? usage.seats + usage.pendingInvites : usage[key];
  if (current >= limit) {
    const label = { seats: 'seats', deals: 'active deals', aiQueries: 'AI queries this month' }[key];
    throw new HttpError(402, `Your ${plan.name} plan includes ${limit} ${label}. Upgrade to continue.`, { code: 'PLAN_LIMIT', limitKey: key });
  }
}
