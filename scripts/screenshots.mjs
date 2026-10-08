/**
 * Captures portfolio-ready screenshots from the REAL running app (seeded demo data).
 *
 *   1. Start MongoDB, seed (npm run seed) and start the app (npm start).
 *   2. npx playwright install chromium
 *   3. node scripts/screenshots.mjs [http://localhost:4000]
 *
 * Optional: CHROME_PATH / CHROME_ARGS to use an existing Chrome/Chromium build.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] || 'http://localhost:4000';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
fs.mkdirSync(OUT, { recursive: true });

const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'maya@northbeam.io', password: 'cadence-demo' }) });
const { token } = await res.json();
if (!token) throw new Error('Could not sign in — is the demo data seeded?');

/** One browser per capture session (keeps things robust on minimal headless builds too). */
async function withPage({ width, height, scale, mobile = false, signedIn = true }, fn) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(' ').filter(Boolean) : ['--no-sandbox'],
  });
  try {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, isMobile: mobile, hasTouch: mobile, colorScheme: 'light', locale: 'en-US', timezoneId: 'America/New_York' });
    if (signedIn) await ctx.addInitScript((t) => { try { localStorage.setItem('cadence.token', t); } catch {} }, token);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await fn(page);
    if (errors.length) console.warn('  ⚠ page errors:', errors);
  } finally {
    await browser.close();
  }
}
const settle = async (page, ms = 900) => { await page.waitForLoadState('networkidle'); await page.waitForTimeout(ms); };
const shot = async (page, name, { fullPage = false } = {}) => {
  if (fullPage) {
    // Grow the viewport to the page height so the sticky sidebar spans the whole capture.
    const vp = page.viewportSize();
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: vp.width, height: Math.max(vp.height, h) });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    await page.setViewportSize(vp);
  } else await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('  ✓', name);
};

/* ───────────── Desktop (1760 × 1100 @1.5x) ───────────── */
console.log('Desktop');
await withPage({ width: 1760, height: 1100, scale: 1.5, signedIn: false }, async (p) => {
  await p.goto(`${BASE}/login`); await settle(p, 500);
  await shot(p, '00-login');
});

await withPage({ width: 1760, height: 1100, scale: 1.5 }, async (page) => {
  await page.goto(BASE); await settle(page, 1500);
  await shot(page, '01-dashboard', { fullPage: true });

  await page.goto(`${BASE}/pipeline`); await settle(page);
  await shot(page, '02-pipeline');

  // Deal Intelligence drawer on the Acme deal
  await page.getByText('Platform Expansion').first().click();
  await page.getByTestId('deal-intelligence').waitFor();
  await page.waitForTimeout(1100);
  await shot(page, '03-deal-intelligence');
  await page.keyboard.press('Escape');

  // Company 360° view
  await page.goto(`${BASE}/contacts?tab=companies`); await settle(page);
  await page.getByText('Acme Corp').first().click();
  await page.waitForURL(/companies\//); await settle(page, 1000);
  await shot(page, '04-company-360', { fullPage: true });

  // AI assistant
  await page.goto(`${BASE}/pipeline`); await settle(page, 600);
  await page.keyboard.press('Control+j');
  await page.getByLabel('Ask the assistant').fill('Which deals are at risk?');
  await page.keyboard.press('Enter');
  await page.getByText(/deals are at risk/).waitFor();
  await page.waitForTimeout(1200);
  await page.getByLabel('Ask the assistant').fill('Show deals above $20K likely to close this month');
  await page.keyboard.press('Enter');
  await page.getByText(/look likely to close/).waitFor();
  await page.waitForTimeout(900);
  await shot(page, '05-ai-assistant');

  await page.goto(`${BASE}/contacts`); await settle(page);
  await shot(page, '06-contacts');

  await page.goto(`${BASE}/workflows`); await settle(page);
  await shot(page, '07-workflows', { fullPage: true });

  await page.goto(`${BASE}/analytics`); await settle(page, 1700);
  await shot(page, '08-analytics', { fullPage: true });

  await page.goto(`${BASE}/team`); await settle(page);
  await shot(page, '09-team-rbac', { fullPage: true });

  await page.goto(`${BASE}/billing`); await settle(page);
  await shot(page, '10-billing', { fullPage: true });
});

/* ───────────── Mobile (390 × 844 @3x) ───────────── */
console.log('Mobile');
await withPage({ width: 390, height: 844, scale: 3, mobile: true }, async (m) => {
  await m.goto(BASE); await settle(m, 1500);
  await shot(m, 'mobile-1-dashboard');
  await m.goto(`${BASE}/pipeline`); await settle(m);
  await shot(m, 'mobile-2-deals');
  await m.goto(`${BASE}/contacts?q=Torres`); await settle(m);
  await m.locator('.mobile-list').getByText('Rebecca Torres').first().click();
  await m.waitForURL(/contacts\/\w+/); await settle(m, 1000);
  await shot(m, 'mobile-3-contact');
});

/* ───────────── Mobile trio composite (portfolio cover) ───────────── */
await withPage({ width: 1600, height: 1000, scale: 2, signedIn: false }, async (t) => {
  const img = (n) => `data:image/png;base64,${fs.readFileSync(path.join(OUT, `${n}.png`)).toString('base64')}`;
  await t.setContent(`<body style="margin:0;background:#f1efe9;display:flex;align-items:center;justify-content:center;gap:56px;height:1000px">
    ${['mobile-1-dashboard', 'mobile-2-deals', 'mobile-3-contact'].map((n, i) => `<img src="${img(n)}" style="height:${i === 1 ? 880 : 800}px;border-radius:44px;box-shadow:0 40px 80px -20px rgba(22,22,26,.35),0 0 0 10px #16161a;margin-top:${i === 1 ? 0 : 40}px">`).join('')}
  </body>`);
  await t.waitForTimeout(600);
  await shot(t, 'mobile-trio');
});

console.log(`\nSaved to ${OUT}`);
