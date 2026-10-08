import { Company, Deal, Task } from '../models/index.js';
import { config, hasOpenAI } from '../config.js';
import { STAGE_META, daysSince, isOpen, buildAction } from './scoring.js';

const fmt = (n) => (n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : `$${n}`);
const card = (d, reason) => ({
  dealId: d._id,
  title: d.title,
  company: d.companyId?.name,
  value: d.value,
  winScore: d.ai?.winScore ?? 0,
  stage: d.stage,
  reason,
});

async function loadOpenDeals(wid) {
  const deals = await Deal.find({ workspaceId: wid }).populate('companyId', 'name').populate('ownerId', 'name').lean();
  return deals;
}

/**
 * Conversational layer over live CRM data.
 * Rule-based intents answer the common sales-ops questions instantly and offline;
 * anything else goes to the LLM (when configured) with a compact snapshot of the pipeline.
 */
export async function answer(wid, question, user) {
  const q = question.toLowerCase();
  const deals = await loadOpenDeals(wid);
  const open = deals.filter(isOpen);

  // 1 ─ at-risk deals
  if (/(at[- ]risk|risk|stall|stuck|slipping|in trouble)/.test(q)) {
    const risky = open
      .filter((d) => d.ai.winScore < 45 || daysSince(d.signals.lastActivityAt) >= 10)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    const total = risky.reduce((s, d) => s + d.value, 0);
    return {
      text: risky.length
        ? `**${risky.length} deals are at risk**, worth **${fmt(total)}** combined. The biggest exposure is ${risky[0].title}. Most of them have gone quiet or lack a decision maker.`
        : 'No deals look at risk right now — engagement is healthy across the pipeline.',
      cards: risky.map((d) => card(d, d.ai.risks?.[0] || 'Low win probability')),
    };
  }

  // 2 ─ summarize <company>
  const sum = q.match(/summar(?:y|ize|ise)\s+(?:of\s+)?(.+?)[?.!]*$/);
  if (sum) {
    const needle = sum[1].replace(/^(the\s+)?(account\s+)?/, '').trim();
    const companies = await Company.find({ workspaceId: wid }).lean();
    const company = companies.find((c) => c.name.toLowerCase().includes(needle) || needle.includes(c.name.toLowerCase()));
    if (!company) return { text: `I couldn't find an account matching “${sum[1]}”. Try the exact company name.`, cards: [] };
    const cd = deals.filter((d) => d.companyId?._id?.toString() === company._id.toString());
    const cOpen = cd.filter(isOpen);
    const pipeline = cOpen.reduce((s, d) => s + d.value, 0);
    const won = cd.filter((d) => d.stage === 'won').reduce((s, d) => s + d.value, 0);
    const top = [...cOpen].sort((a, b) => b.value - a.value)[0];
    return {
      text: `**${company.name}** (${company.industry}, ${company.size} people) has **${cOpen.length} open ${cOpen.length === 1 ? 'deal' : 'deals'}** worth **${fmt(pipeline)}**${won ? ` and ${fmt(won)} already won` : ''}. ${top ? `Lead opportunity: ${top.title} at ${STAGE_META[top.stage].label} with a ${top.ai.winScore}% win score. ${buildAction(top)}` : 'There is no open opportunity — consider a re-engagement campaign.'}`,
      cards: cOpen.slice(0, 4).map((d) => card(d, STAGE_META[d.stage].label)),
    };
  }

  // 3 ─ deals above $X likely to close this month
  const amt = q.match(/(?:above|over|more than|greater than|>)\s*\$?\s*(\d+(?:\.\d+)?)\s*(k|m)?/);
  if (amt && /(clos|win|land)/.test(q)) {
    const threshold = Number(amt[1]) * (amt[2] === 'm' ? 1_000_000 : amt[2] === 'k' ? 1000 : Number(amt[1]) < 1000 ? 1000 : 1);
    const now = new Date();
    const list = open
      .filter((d) => d.value >= threshold && d.expectedClose && new Date(d.expectedClose).getMonth() === now.getMonth() && new Date(d.expectedClose).getFullYear() === now.getFullYear() && d.ai.winScore >= 55)
      .sort((a, b) => b.ai.winScore - a.ai.winScore);
    const weighted = list.reduce((s, d) => s + d.value * (d.ai.winScore / 100), 0);
    return {
      text: list.length
        ? `**${list.length} ${list.length === 1 ? 'deal' : 'deals'} above ${fmt(threshold)}** look likely to close this month — about **${fmt(Math.round(weighted))}** probability-weighted.`
        : `Nothing above ${fmt(threshold)} is both scheduled to close this month and scoring above 55%.`,
      cards: list.slice(0, 5).map((d) => card(d, `Closes ${new Date(d.expectedClose).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`)),
    };
  }

  // 4 ─ what should I follow up today
  if (/(follow.?up|today|next step|priorit|what should i)/.test(q)) {
    const mine = open.filter((d) => d.ownerId?._id?.toString() === user._id.toString());
    const pool = (mine.length >= 3 ? mine : open)
      .map((d) => ({ d, urgency: (d.signals.followUpScheduled ? 0 : 30) + daysSince(d.signals.lastActivityAt) * 2 + d.ai.winScore * 0.3 + d.value / 4000 }))
      .sort((a, b) => b.urgency - a.urgency)
      .slice(0, 4)
      .map((x) => x.d);
    const dueTasks = await Task.countDocuments({ workspaceId: wid, ownerId: user._id, done: false, dueAt: { $lte: new Date(Date.now() + 86400000) } });
    return {
      text: `Here are the **${pool.length} conversations to prioritise today**${dueTasks ? `, plus ${dueTasks} task${dueTasks === 1 ? '' : 's'} due in the next 24 hours` : ''}. I ranked them by value, momentum and how long they have been waiting.`,
      cards: pool.map((d) => card(d, buildAction(d))),
    };
  }

  // 5 ─ pipeline summary
  if (/(pipeline|forecast|how are we|overview|numbers)/.test(q)) {
    const total = open.reduce((s, d) => s + d.value, 0);
    const weighted = open.reduce((s, d) => s + d.value * (d.ai.winScore / 100), 0);
    const hot = [...open].sort((a, b) => b.ai.winScore - a.ai.winScore).slice(0, 3);
    return {
      text: `The open pipeline is **${fmt(total)}** across **${open.length} deals**, and our score-weighted forecast is **${fmt(Math.round(weighted))}**. The strongest opportunities are listed below.`,
      cards: hot.map((d) => card(d, `${d.ai.winScore}% win score`)),
    };
  }

  // 6 ─ free-form, via the LLM when available
  if (hasOpenAI()) {
    try {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: config.openaiKey });
      const snapshot = open.slice(0, 40).map((d) => ({ deal: d.title, company: d.companyId?.name, stage: d.stage, value: d.value, winScore: d.ai.winScore, owner: d.ownerId?.name, idleDays: daysSince(d.signals.lastActivityAt), risks: d.ai.risks }));
      const res = await client.chat.completions.create({
        model: config.openaiModel,
        temperature: 0.3,
        messages: [
          { role: 'system', content: 'You are Cadence, a concise sales copilot inside a CRM. Answer only from the pipeline snapshot. Use short paragraphs and **bold** for key figures.' },
          { role: 'user', content: `Pipeline snapshot:\n${JSON.stringify(snapshot)}\n\nQuestion: ${question}` },
        ],
      });
      return { text: res.choices[0].message.content, cards: [] };
    } catch (err) {
      console.warn('[assistant] OpenAI failed:', err.message);
    }
  }

  return {
    text: "I can help with pipeline questions. Try **“Which deals are at risk?”**, **“Summarize Acme Corp”**, **“What should I follow up today?”** or **“Show deals above $20K likely to close this month.”**",
    cards: [],
  };
}
