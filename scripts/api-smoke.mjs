/**
 * End-to-end API smoke + security test.  Run with the API up and the demo data seeded:
 *   node scripts/api-smoke.mjs [http://localhost:4000]
 */
const BASE = process.argv[2] || 'http://localhost:4000';
let pass = 0, fail = 0;

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? '  ✓' : '  ✗'} ${name}${!ok && extra ? `  → ${extra}` : ''}`); };

const login = async (email, password = 'cadence-demo') => (await call('/auth/login', { method: 'POST', body: { email, password } })).data;

console.log('Auth');
const admin = await login('maya@northbeam.io');
check('admin can sign in', !!admin?.token);
check('wrong password rejected', (await call('/auth/login', { method: 'POST', body: { email: 'maya@northbeam.io', password: 'nope-nope' } })).status === 401);
check('protected route needs token', (await call('/deals')).status === 401);
const rep = await login('liam@northbeam.io');
const mgr = await login('daniel@northbeam.io');
const other = await login('iris@foxglove.dev');

console.log('Dashboard & analytics');
const dash = await call('/dashboard', { token: admin.token });
check('dashboard returns KPIs', dash.status === 200 && dash.data.kpis.pipelineValue > 0, JSON.stringify(dash.data).slice(0, 120));
check('dashboard has AI insights', dash.data.insights?.length >= 2);
const an = await call('/analytics', { token: admin.token });
check('analytics has forecast + team + bottlenecks', an.status === 200 && an.data.forecast.length === 4 && an.data.team.length >= 5 && an.data.bottlenecks.length >= 2);
check('sales velocity computed', an.data.velocity.perDay > 0, JSON.stringify(an.data.velocity));

console.log('Deals & AI');
const deals = (await call('/deals', { token: admin.token })).data;
const acme = deals.find((d) => d.title.startsWith('Acme'));
check('Acme deal has an AI win score', acme?.ai?.winScore > 0, `score=${acme?.ai?.winScore}`);
console.log(`     Acme → ${acme.ai.winScore}% · "${acme.ai.summary}" · Action: "${acme.ai.action}"`);
const detail = await call(`/deals/${acme.id}`, { token: admin.token });
check('deal detail has activity timeline', detail.data.activities.length > 3);

console.log('Stage move re-scores + logs activity');
const before = acme.ai.winScore;
const moved = await call(`/deals/${acme.id}/stage`, { method: 'PATCH', token: admin.token, body: { stage: 'negotiation' } });
check('stage move succeeds', moved.status === 200 && moved.data.stage === 'negotiation');
check('score changed after move', moved.data.ai.winScore !== before, `${before} → ${moved.data.ai.winScore}`);
await call(`/deals/${acme.id}/stage`, { method: 'PATCH', token: admin.token, body: { stage: 'proposal' } });

console.log('RBAC');
const sofiaDeal = deals.find((d) => d.owner?.name === 'Sofia Alvarez' && d.stage !== 'won');
check('rep cannot move a deal they do not own', (await call(`/deals/${sofiaDeal.id}/stage`, { method: 'PATCH', token: rep.token, body: { stage: 'qualified' } })).status === 403);
check('manager can move any deal', (await call(`/deals/${sofiaDeal.id}/stage`, { method: 'PATCH', token: mgr.token, body: { stage: sofiaDeal.stage } })).status === 200);
check('rep cannot invite teammates', (await call('/team/invite', { method: 'POST', token: rep.token, body: { email: 'x@y.co', role: 'rep' } })).status === 403);
check('rep cannot start checkout', (await call('/billing/checkout', { method: 'POST', token: rep.token, body: { plan: 'business' } })).status === 403);
check('rep cannot create workflows', (await call('/workflows', { method: 'POST', token: rep.token, body: { name: 'x' } })).status === 403);

console.log('Multi-tenant isolation');
const otherDeals = (await call('/deals', { token: other.token })).data;
check('other workspace sees only its own deals', otherDeals.length === 1 && otherDeals[0].title.includes('Paper Lantern'), `got ${otherDeals.length}`);
check('cross-tenant deal read blocked', (await call(`/deals/${acme.id}`, { token: other.token })).status === 404);
check('cross-tenant stage change blocked', (await call(`/deals/${acme.id}/stage`, { method: 'PATCH', token: other.token, body: { stage: 'won' } })).status === 404);

console.log('Contacts & companies');
const contacts = await call('/contacts?q=acme', { token: admin.token });
check('contact search by company name', contacts.data.length >= 4, `got ${contacts.data.length}`);
const companies = (await call('/companies', { token: admin.token })).data;
const acmeCo = companies.find((c) => c.name === 'Acme Corp');
const co360 = await call(`/companies/${acmeCo.id}`, { token: admin.token });
check('company 360 has AI account summary + next step', co360.data.ai?.summary && co360.data.ai?.nextStep);
console.log(`     "${co360.data.ai.summary}"`);

console.log('AI assistant');
for (const q of ['Which deals are at risk?', 'Summarize Acme Corp', 'What should I follow up today?', 'Show deals above $20K likely to close this month']) {
  const r = await call('/ai/chat', { method: 'POST', token: admin.token, body: { message: q } });
  check(`"${q}"`, r.status === 200 && r.data.text && r.data.cards.length > 0, r.data?.text?.slice(0, 80));
}

console.log('Workflows');
const wf = await call('/workflows/run', { method: 'POST', token: admin.token });
check('run-now executes inactivity workflow', wf.status === 200, JSON.stringify(wf.data).slice(0, 100));
console.log(`     ${wf.data.results.length} automation run(s) fired`);

console.log('Billing & plan limits');
const bill = await call('/billing', { token: admin.token });
check('billing returns 3 plans + usage', bill.data.plans.length === 3 && bill.data.usage.seats === 6);
const free = await call('/auth/register', { method: 'POST', body: { name: 'Test User', email: `t${Date.now()}@example.com`, password: 'longenough1', workspaceName: 'Limits Inc' } });
check('self-serve signup creates a workspace', free.status === 201 && free.data.workspace.plan === 'free');
let limitHit = null;
for (let i = 0; i < 27; i++) {
  const r = await call('/deals', { method: 'POST', token: free.data.token, body: { title: `Deal ${i}`, value: 1000 } });
  if (r.status === 402) { limitHit = r; break; }
}
check('free plan blocks the 26th active deal with 402', limitHit?.data?.code === 'PLAN_LIMIT', limitHit?.data?.error);
const up = await call('/billing/demo/activate', { method: 'POST', token: free.data.token, body: { plan: 'pro' } });
check('demo checkout upgrades plan', up.status === 200 && up.data.plan === 'pro');
const again = await call('/deals', { method: 'POST', token: free.data.token, body: { title: 'After upgrade', value: 1000 } });
check('limit lifted after upgrade', again.status === 201);

console.log(`\n${fail ? '✗' : '✓'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
