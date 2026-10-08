import { config, hasOpenAI } from '../config.js';

/**
 * Deal Intelligence
 * -----------------
 * The win score is ALWAYS computed by this deterministic, explainable model (so reps can see *why*).
 * If an OpenAI key is configured, the language model only rewrites the narrative (summary + action);
 * it never invents the number. Without a key the rule-based narrative is used — the app works offline.
 */

export const STAGE_META = {
  new: { label: 'New Lead', prob: 0.1 },
  qualified: { label: 'Qualified', prob: 0.25 },
  discovery: { label: 'Discovery', prob: 0.4 },
  proposal: { label: 'Proposal', prob: 0.6 },
  negotiation: { label: 'Negotiation', prob: 0.8 },
  won: { label: 'Closed Won', prob: 1 },
  lost: { label: 'Closed Lost', prob: 0 },
};

const DAY = 86400000;
export const daysSince = (date, now = new Date()) => (date ? Math.max(0, Math.floor((now - new Date(date)) / DAY)) : 999);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function computeWinScore(deal, now = new Date()) {
  if (deal.stage === 'won') return { score: 100, factors: [{ label: 'Deal closed', impact: 100 }] };
  if (deal.stage === 'lost') return { score: 0, factors: [{ label: 'Deal lost', impact: -100 }] };

  const s = deal.signals || {};
  const idle = daysSince(s.lastActivityAt, now);
  const factors = [];
  const add = (label, impact) => impact !== 0 && factors.push({ label, impact: Math.round(impact) });

  add(`${STAGE_META[deal.stage].label} stage`, STAGE_META[deal.stage].prob * 55);
  add('Meetings in last 14 days', clamp((s.meetings14d || 0) * 6, 0, 18));
  add('Proposal engagement', clamp((s.proposalViews || 0) * 4, 0, 12));
  add('Email engagement', clamp((s.emailsOpened14d || 0) * 1.5, 0, 9));
  if (s.decisionMakerEngaged) add('Decision maker engaged', 10);
  else if (['proposal', 'negotiation'].includes(deal.stage)) add('No decision maker involved', -8);
  if (s.followUpScheduled) add('Follow-up scheduled', 5);
  if (idle > 7) add(`No activity for ${idle} days`, -clamp((idle - 7) * 1.5, 0, 28));
  if (deal.expectedClose && new Date(deal.expectedClose) < now) add('Past expected close date', -10);

  const raw = 10 + factors.reduce((sum, f) => sum + f.impact, 0);
  return { score: Math.round(clamp(raw, 3, 97)), factors: factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)) };
}

export function buildRisks(deal, now = new Date()) {
  const s = deal.signals || {};
  const idle = daysSince(s.lastActivityAt, now);
  const risks = [];
  if (idle >= 10) risks.push(`Stalled — ${plural(idle, 'day')} without activity`);
  if (!s.followUpScheduled && deal.stage !== 'new') risks.push('No follow-up scheduled');
  if (!s.decisionMakerEngaged && ['discovery', 'proposal', 'negotiation'].includes(deal.stage)) risks.push('Decision maker not engaged');
  if (deal.expectedClose && new Date(deal.expectedClose) < now) risks.push('Expected close date has passed');
  if (deal.value >= 50000 && (s.meetings14d || 0) < 2) risks.push('High-value deal with thin engagement');
  return risks;
}

export function buildNarrative(deal, now = new Date()) {
  const s = deal.signals || {};
  const idle = daysSince(s.lastActivityAt, now);
  const parts = [];

  if ((s.meetings14d || 0) >= 2 && idle <= 7) parts.push('Strong engagement over the last 14 days.');
  else if (idle >= 10) parts.push(`Engagement has gone quiet — nothing logged for ${plural(idle, 'day')}.`);
  else if ((s.meetings14d || 0) + (s.emailsOpened14d || 0) > 0) parts.push('Moderate engagement over the last 14 days.');
  else parts.push('Little buyer activity recorded so far.');

  if (s.decisionMakerEngaged) parts.push(s.meetings14d ? `Decision maker attended ${plural(Math.max(1, Math.min(s.meetings14d, 2)), 'meeting')}.` : 'Decision maker is engaged.');
  else if (['proposal', 'negotiation'].includes(deal.stage)) parts.push('Decision maker has not been involved yet.');

  if (s.proposalViews > 0) parts.push(`Proposal viewed ${s.proposalViews === 1 ? 'once' : s.proposalViews === 2 ? 'twice' : `${s.proposalViews} times`}.`);
  parts.push(s.followUpScheduled ? 'Follow-up is scheduled.' : 'No follow-up scheduled.');
  return parts.join(' ');
}

export function buildAction(deal, now = new Date()) {
  const s = deal.signals || {};
  const idle = daysSince(s.lastActivityAt, now);

  if (deal.stage === 'won') return 'Hand off to onboarding and ask for a reference or case study.';
  if (deal.stage === 'lost') return 'Log the loss reason and set a reminder to re-engage in 90 days.';
  if (idle >= 10) return `Re-engage today with a short, value-led note — it has been ${plural(idle, 'day')} since the last touch.`;
  if (['proposal', 'negotiation'].includes(deal.stage) && !s.decisionMakerEngaged) return 'Ask your champion to introduce the economic buyer before the next call.';
  if (deal.stage === 'proposal' && s.proposalViews >= 3 && !s.followUpScheduled) return `Proposal opened ${s.proposalViews} times — offer a 15-minute pricing walkthrough this week.`;
  if (!s.followUpScheduled && ['proposal', 'negotiation'].includes(deal.stage)) return 'Follow up within 24 hours and clarify procurement timeline.';
  if (deal.stage === 'negotiation') return 'Send the final order form and confirm the signature date with legal.';
  if (['new', 'qualified'].includes(deal.stage)) return 'Book a discovery call with the champion this week.';
  if (deal.stage === 'discovery') return 'Share a tailored proposal while the pain points are fresh.';
  return 'Keep momentum — confirm next steps on your next touchpoint.';
}

/** Rule-based insight (always available). */
export function ruleInsight(deal, now = new Date()) {
  const { score, factors } = computeWinScore(deal, now);
  return { winScore: score, factors, summary: buildNarrative(deal, now), action: buildAction(deal, now), risks: buildRisks(deal, now), source: 'rules', updatedAt: now };
}

let openaiClient;
async function getOpenAI() {
  if (!openaiClient) {
    const { default: OpenAI } = await import('openai');
    openaiClient = new OpenAI({ apiKey: config.openaiKey });
  }
  return openaiClient;
}

/** Insight with optional LLM narration. Score + risks stay deterministic. */
export async function generateInsight(deal, ctx = {}, now = new Date()) {
  const base = ruleInsight(deal, now);
  if (!hasOpenAI()) return base;
  try {
    const client = await getOpenAI();
    const completion = await client.chat.completions.create({
      model: config.openaiModel,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a sales-ops analyst inside a CRM. Given deal facts, write a 2-sentence "summary" of buyer engagement and a one-sentence imperative "action" for the rep. Be specific, never invent facts. Reply as JSON: {"summary": string, "action": string}.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            deal: deal.title,
            company: ctx.company,
            stage: deal.stage,
            value: deal.value,
            winScore: base.winScore,
            signals: deal.signals,
            factors: base.factors,
            risks: base.risks,
            recentActivity: ctx.activities?.slice(0, 6),
          }),
        },
      ],
    });
    const parsed = JSON.parse(completion.choices[0].message.content);
    if (parsed.summary && parsed.action) return { ...base, summary: parsed.summary, action: parsed.action, source: 'openai' };
  } catch (err) {
    console.warn('[ai] OpenAI narration failed, using rules:', err.message);
  }
  return base;
}

export const isOpen = (deal) => !['won', 'lost'].includes(deal.stage);
