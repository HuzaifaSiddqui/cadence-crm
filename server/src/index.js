import mongoose from 'mongoose';
import { config, hasOpenAI, hasStripe } from './config.js';
import { createApp } from './app.js';
import { Workspace } from './models/index.js';
import { seed } from './seed.js';
import { startScheduler } from './services/automation.js';

async function main() {
  await mongoose.connect(config.mongoUri);
  console.log(`✓ MongoDB connected (${config.mongoUri.replace(/\/\/.*@/, '//***@')})`);

  // First deploy convenience: AUTO_SEED=true fills an EMPTY database with the demo workspace.
  if (process.env.AUTO_SEED === 'true' && (await Workspace.countDocuments()) === 0) {
    console.log('✓ Empty database — seeding demo workspace', await seed({ wipe: false }));
  }

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`✓ Cadence API on http://localhost:${config.port}`);
    console.log(`  AI engine : ${hasOpenAI() ? `OpenAI (${config.openaiModel})` : 'rule-based (set OPENAI_API_KEY to enable LLM narration)'}`);
    console.log(`  Billing   : ${hasStripe() ? 'Stripe' : 'demo mode (set STRIPE_SECRET_KEY for real checkout)'}`);
  });
  startScheduler(Workspace);
}

main().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
