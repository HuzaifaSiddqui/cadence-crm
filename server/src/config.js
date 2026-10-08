import 'dotenv/config';

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cadence',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  openaiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  stripeKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
};

// `null` means unlimited. Prices are per seat / month (USD).
export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    blurb: 'For founders validating their first pipeline.',
    limits: { seats: 3, deals: 25, aiQueries: 20 },
    features: ['Up to 3 seats', '25 active deals', '20 AI queries / month', 'Kanban pipeline'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 29,
    blurb: 'For growing teams that live in their pipeline.',
    limits: { seats: 15, deals: 500, aiQueries: 500 },
    features: ['Up to 15 seats', '500 active deals', '500 AI queries / month', 'Workflow automation', 'Analytics & forecasting'],
  },
  business: {
    id: 'business',
    name: 'Business',
    price: 79,
    blurb: 'For sales orgs that need control and scale.',
    limits: { seats: 100, deals: null, aiQueries: 5000 },
    features: ['Up to 100 seats', 'Unlimited deals', '5,000 AI queries / month', 'Role-based access control', 'Priority support'],
  },
};

export const hasOpenAI = () => Boolean(config.openaiKey);
export const hasStripe = () => Boolean(config.stripeKey);
