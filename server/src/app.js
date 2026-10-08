import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { config, hasOpenAI, hasStripe } from './config.js';
import { errorHandler, requireAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import dealRoutes from './routes/deals.js';
import contactRoutes from './routes/contacts.js';
import companyRoutes from './routes/companies.js';
import billingRoutes, { stripeWebhook } from './routes/billing.js';
import { dashboardRouter, analyticsRouter } from './routes/insights.js';
import { aiRouter, notificationsRouter, tasksRouter, teamRouter, workflowsRouter } from './routes/workspace.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.env === 'production' ? config.clientUrl : true }));
  if (config.env !== 'test') app.use(morgan('tiny'));

  // Stripe needs the raw body for signature verification — must come before express.json().
  app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), stripeWebhook);
  app.use(express.json({ limit: '200kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, ai: hasOpenAI() ? 'openai' : 'rules', billing: hasStripe() ? 'stripe' : 'demo' }));

  app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 200, standardHeaders: true, legacyHeaders: false }), authRoutes);

  // Everything below requires a valid session and is tenant-scoped via req.wid.
  app.use('/api/dashboard', requireAuth, dashboardRouter);
  app.use('/api/analytics', requireAuth, analyticsRouter);
  app.use('/api/deals', requireAuth, dealRoutes);
  app.use('/api/contacts', requireAuth, contactRoutes);
  app.use('/api/companies', requireAuth, companyRoutes);
  app.use('/api/workflows', requireAuth, workflowsRouter);
  app.use('/api/team', requireAuth, teamRouter);
  app.use('/api/tasks', requireAuth, tasksRouter);
  app.use('/api/notifications', requireAuth, notificationsRouter);
  app.use('/api/billing', requireAuth, billingRoutes);
  app.use('/api/ai', requireAuth, rateLimit({ windowMs: 60 * 1000, limit: 30 }), aiRouter);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Serve the built React app in production (single-service deploy).
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
