import { Router } from 'express';
import Stripe from 'stripe';
import { PLANS, config, hasStripe } from '../config.js';
import { Workspace } from '../models/index.js';
import { HttpError, asyncHandler, requireRole } from '../middleware/auth.js';
import { getUsage } from '../services/limits.js';

const router = Router();
let stripe;
const getStripe = () => (stripe ||= new Stripe(config.stripeKey));

/**
 * Billing runs in two modes:
 *  • Stripe mode  — STRIPE_SECRET_KEY is set: real Checkout Sessions, customer portal and webhooks.
 *  • Demo mode    — no key: the UI walks through the same flow and /demo/activate flips the plan,
 *                   so the product is fully explorable without a Stripe account.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const usage = await getUsage(req.workspace);
    res.json({
      mode: hasStripe() ? 'stripe' : 'demo',
      current: { plan: req.workspace.plan, status: req.workspace.subscriptionStatus, renewsAt: req.workspace.renewsAt },
      plans: Object.values(PLANS),
      usage,
      invoices: invoicesFor(req.workspace),
    });
  })
);

// Demo-mode invoice history, derived from the subscription so the screen is never empty.
function invoicesFor(ws) {
  if (ws.plan === 'free') return [];
  const price = PLANS[ws.plan].price;
  return [0, 1, 2].map((i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i, 1);
    return { id: `INV-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`, date: d, amount: price * 6, status: 'paid' };
  });
}

router.post(
  '/checkout',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const plan = PLANS[req.body.plan];
    if (!plan || plan.id === 'free') throw new HttpError(400, 'Choose a paid plan');
    if (!hasStripe()) return res.json({ demo: true, plan: plan.id });

    const ws = req.workspace;
    if (!ws.stripeCustomerId) {
      const customer = await getStripe().customers.create({ name: ws.name, email: req.user.email, metadata: { workspaceId: ws._id.toString() } });
      ws.stripeCustomerId = customer.id;
      await ws.save();
    }
    const seats = Math.max(1, (await getUsage(ws)).seats);
    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      customer: ws.stripeCustomerId,
      line_items: [
        {
          quantity: seats,
          price_data: {
            currency: 'usd',
            recurring: { interval: 'month' },
            unit_amount: plan.price * 100,
            product_data: { name: `Cadence ${plan.name}`, description: 'Per seat, billed monthly' },
          },
        },
      ],
      metadata: { workspaceId: ws._id.toString(), plan: plan.id },
      subscription_data: { metadata: { workspaceId: ws._id.toString(), plan: plan.id } },
      success_url: `${config.clientUrl}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.clientUrl}/billing?checkout=cancelled`,
    });
    res.json({ url: session.url });
  })
);

/** Local-dev fallback when the webhook can't reach localhost: confirm a finished session directly. */
router.post(
  '/confirm',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    if (!hasStripe()) throw new HttpError(400, 'Stripe is not configured');
    const session = await getStripe().checkout.sessions.retrieve(req.body.sessionId, { expand: ['subscription'] });
    if (session.metadata?.workspaceId !== req.workspace._id.toString()) throw new HttpError(403, 'Session belongs to another workspace');
    if (session.payment_status === 'paid' || session.status === 'complete') await applySubscription(req.workspace._id, session.metadata.plan, session.subscription);
    res.json({ ok: true });
  })
);

router.post(
  '/portal',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    if (!hasStripe() || !req.workspace.stripeCustomerId) throw new HttpError(400, 'No billing profile yet — upgrade first');
    const portal = await getStripe().billingPortal.sessions.create({ customer: req.workspace.stripeCustomerId, return_url: `${config.clientUrl}/billing` });
    res.json({ url: portal.url });
  })
);

router.post(
  '/demo/activate',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    if (hasStripe()) throw new HttpError(400, 'Demo checkout is disabled when Stripe is configured');
    const plan = PLANS[req.body.plan];
    if (!plan) throw new HttpError(400, 'Unknown plan');
    const ws = req.workspace;
    ws.plan = plan.id;
    ws.subscriptionStatus = plan.id === 'free' ? 'none' : 'active';
    ws.renewsAt = plan.id === 'free' ? undefined : new Date(Date.now() + 30 * 86400000);
    await ws.save();
    res.json({ ok: true, plan: ws.plan });
  })
);

async function applySubscription(workspaceId, planId, subscription) {
  const sub = typeof subscription === 'string' ? await getStripe().subscriptions.retrieve(subscription) : subscription;
  await Workspace.updateOne(
    { _id: workspaceId },
    {
      $set: {
        plan: planId,
        subscriptionStatus: sub?.status === 'active' || sub?.status === 'trialing' ? 'active' : sub?.status || 'active',
        stripeSubscriptionId: sub?.id,
        renewsAt: sub?.current_period_end ? new Date(sub.current_period_end * 1000) : undefined,
      },
    }
  );
}

/** Mounted in app.js with express.raw() so the signature can be verified. */
export const stripeWebhook = asyncHandler(async (req, res) => {
  if (!hasStripe()) return res.status(204).end();
  let event;
  try {
    event = config.stripeWebhookSecret
      ? getStripe().webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.stripeWebhookSecret)
      : JSON.parse(req.body.toString());
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  const obj = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed':
      if (obj.metadata?.workspaceId) await applySubscription(obj.metadata.workspaceId, obj.metadata.plan, obj.subscription);
      break;
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const wid = obj.metadata?.workspaceId;
      if (!wid) break;
      const canceled = event.type.endsWith('deleted') || obj.status === 'canceled';
      await Workspace.updateOne(
        { _id: wid },
        { $set: { subscriptionStatus: canceled ? 'canceled' : obj.status === 'past_due' ? 'past_due' : 'active', ...(canceled ? { plan: 'free' } : {}), renewsAt: obj.current_period_end ? new Date(obj.current_period_end * 1000) : undefined } }
      );
      break;
    }
    default:
  }
  res.json({ received: true });
});

export default router;
