import { Router } from 'express';
import { Activity, BOARD_STAGES, Deal, Task, User } from '../models/index.js';
import { asyncHandler } from '../middleware/auth.js';
import { STAGE_META, daysSince, isOpen } from '../services/scoring.js';

export const dashboardRouter = Router();
export const analyticsRouter = Router();

const DAY = 86400000;
const monthKey = (d) => `${d.getFullYear()}-${d.getMonth()}`;
const monthLabel = (d) => d.toLocaleDateString('en-US', { month: 'short' });
const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);
const money = (n) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`);

const lastMonths = (n, from = new Date()) =>
  Array.from({ length: n }, (_, i) => new Date(from.getFullYear(), from.getMonth() - (n - 1 - i), 1));

/* ───────────────────────── Dashboard ───────────────────────── */
dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const wid = req.wid;
    const [deals, tasks, acts] = await Promise.all([
      Deal.find({ workspaceId: wid }).populate('companyId', 'name color').populate('ownerId', 'name color').lean(),
      Task.find({ workspaceId: wid, done: false }).sort({ dueAt: 1 }).limit(6).lean(),
      Activity.find({ workspaceId: wid }).sort({ at: -1 }).limit(8).populate('userId', 'name color').populate('dealId', 'title').lean(),
    ]);

    const open = deals.filter(isOpen);
    const won = deals.filter((d) => d.stage === 'won');
    const lost = deals.filter((d) => d.stage === 'lost');
    const since = (days) => new Date(now - days * DAY);

    const pipelineValue = sum(open, (d) => d.value);
    const wonLast90 = won.filter((d) => d.closedAt && d.closedAt >= since(90));
    const wonPrev90 = won.filter((d) => d.closedAt && d.closedAt < since(90) && d.closedAt >= since(180));
    const closed180 = [...won, ...lost].filter((d) => d.closedAt && d.closedAt >= since(180));
    const conversion = closed180.length ? Math.round((closed180.filter((d) => d.stage === 'won').length / closed180.length) * 100) : 0;

    const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);

    const funnel = BOARD_STAGES.map((s) => {
      const list = deals.filter((d) => d.stage === s);
      return { stage: s, label: STAGE_META[s].label, count: list.length, value: sum(list, (d) => d.value) };
    });

    const months = lastMonths(6, now);
    const trend = months.map((m) => ({
      month: monthLabel(m),
      won: sum(won.filter((d) => d.closedAt && monthKey(d.closedAt) === monthKey(m)), (d) => d.value),
    }));

    // AI insight feed
    const insights = [];
    const risky = open.filter((d) => d.ai.winScore < 45 || daysSince(d.signals.lastActivityAt) >= 10).sort((a, b) => b.value - a.value);
    if (risky.length)
      insights.push({ kind: 'risk', title: `${risky.length} deals need rescuing`, body: `${money(sum(risky, (d) => d.value))} is at risk. ${risky[0].title} is the largest — ${risky[0].ai.risks?.[0]?.toLowerCase() || 'low win probability'}.`, dealId: risky[0]._id });
    const hot = open.filter((d) => d.ai.winScore >= 75).sort((a, b) => b.value - a.value);
    if (hot.length)
      insights.push({ kind: 'hot', title: `${hot[0].title} is heating up`, body: `${hot[0].ai.winScore}% win score. ${hot[0].ai.action}`, dealId: hot[0]._id });
    const noFollow = open.filter((d) => !d.signals.followUpScheduled && d.stage !== 'new');
    if (noFollow.length)
      insights.push({ kind: 'tip', title: `${noFollow.length} active deals have no follow-up`, body: 'Deals with a scheduled next step close at a noticeably higher rate. Add one in two clicks from the deal panel.', dealId: noFollow[0]._id });

    const dealTitle = Object.fromEntries(deals.map((d) => [d._id.toString(), d.title]));

    res.json({
      kpis: {
        pipelineValue,
        pipelineAdded30: sum(open.filter((d) => d.createdAt >= since(30)), (d) => d.value),
        activeAdded30: open.filter((d) => d.createdAt >= since(30)).length,
        wonRevenue: sum(wonLast90, (d) => d.value),
        wonDelta: pct(sum(wonLast90, (d) => d.value), sum(wonPrev90, (d) => d.value)),
        activeDeals: open.length,
        conversion,
        weightedForecast: Math.round(sum(open, (d) => d.value * (d.ai.winScore / 100))),
      },
      funnel,
      trend,
      insights,
      upcoming: tasks.map((t) => ({ id: t._id, title: t.title, dueAt: t.dueAt, auto: t.auto, deal: t.dealId && dealTitle[t.dealId.toString()] })),
      recent: acts.map((a) => ({ id: a._id, type: a.type, title: a.title, content: a.content, at: a.at, deal: a.dealId?.title, user: a.userId && { name: a.userId.name, color: a.userId.color } })),
    });
  })
);

/* ───────────────────────── Analytics ───────────────────────── */
analyticsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const wid = req.wid;
    const [deals, users, acts] = await Promise.all([
      Deal.find({ workspaceId: wid }).lean(),
      User.find({ workspaceId: wid }).lean(),
      Activity.find({ workspaceId: wid, at: { $gte: new Date(now - 30 * DAY) } }, 'userId').lean(),
    ]);
    const open = deals.filter(isOpen);
    const won = deals.filter((d) => d.stage === 'won');
    const lost = deals.filter((d) => d.stage === 'lost');

    /* pipeline by stage */
    const byStage = BOARD_STAGES.filter((s) => s !== 'won').map((s) => {
      const list = open.filter((d) => d.stage === s);
      return { stage: s, label: STAGE_META[s].label, count: list.length, value: sum(list, (d) => d.value), weighted: Math.round(sum(list, (d) => d.value * (d.ai.winScore / 100))) };
    });

    /* win / loss by month */
    const months = lastMonths(6, now);
    const winLoss = months.map((m) => ({
      month: monthLabel(m),
      won: won.filter((d) => d.closedAt && monthKey(d.closedAt) === monthKey(m)).length,
      lost: lost.filter((d) => d.closedAt && monthKey(d.closedAt) === monthKey(m)).length,
    }));
    const winRate = won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : 0;

    /* sales velocity = (opps × win rate × avg deal) ÷ cycle length */
    const cycles = won.filter((d) => d.closedAt).map((d) => (d.closedAt - d.createdAt) / DAY);
    const avgCycle = cycles.length ? Math.round(sum(cycles) / cycles.length) : 0;
    const avgDeal = won.length ? Math.round(sum(won, (d) => d.value) / won.length) : 0;
    const velocityPerDay = avgCycle ? Math.round((open.length * (winRate / 100) * avgDeal) / avgCycle) : 0;

    /* forecast: next 4 months by expected close */
    const fMonths = Array.from({ length: 4 }, (_, i) => new Date(now.getFullYear(), now.getMonth() + i, 1));
    const forecast = fMonths.map((m) => {
      const list = open.filter((d) => d.expectedClose && monthKey(new Date(d.expectedClose)) === monthKey(m));
      return {
        month: monthLabel(m),
        commit: sum(list.filter((d) => d.ai.winScore >= 70), (d) => d.value),
        bestCase: sum(list.filter((d) => d.ai.winScore >= 40), (d) => d.value),
        weighted: Math.round(sum(list, (d) => d.value * (d.ai.winScore / 100))),
      };
    });

    /* team performance */
    const actCount = {};
    acts.forEach((a) => a.userId && (actCount[a.userId] = (actCount[a.userId] || 0) + 1));
    const team = users
      .map((u) => {
        const mine = deals.filter((d) => d.ownerId?.toString() === u._id.toString());
        const w = mine.filter((d) => d.stage === 'won');
        const l = mine.filter((d) => d.stage === 'lost');
        return {
          id: u._id,
          name: u.name,
          role: u.role,
          color: u.color,
          won: sum(w, (d) => d.value),
          pipeline: sum(mine.filter(isOpen), (d) => d.value),
          openDeals: mine.filter(isOpen).length,
          winRate: w.length + l.length ? Math.round((w.length / (w.length + l.length)) * 100) : null,
          activities: actCount[u._id] || 0,
        };
      })
      .sort((a, b) => b.won - a.won);

    /* stage conversion + dwell time from real stage history */
    const order = ['new', 'qualified', 'discovery', 'proposal', 'negotiation', 'won'];
    const reached = (d, s) => d.stageHistory?.some((h) => h.stage === s);
    const conversion = order.slice(0, -1).map((s, i) => {
      const base = deals.filter((d) => reached(d, s));
      const next = base.filter((d) => reached(d, order[i + 1]));
      const dwellList = base
        .map((d) => {
          const idx = d.stageHistory.findIndex((h) => h.stage === s);
          const start = d.stageHistory[idx].at;
          const end = d.stageHistory[idx + 1]?.at || (d.stage === s ? now : null);
          return end ? (new Date(end) - new Date(start)) / DAY : null;
        })
        .filter((x) => x !== null);
      return {
        stage: s,
        label: STAGE_META[s].label,
        next: STAGE_META[order[i + 1]].label,
        rate: base.length ? Math.round((next.length / base.length) * 100) : 0,
        avgDays: dwellList.length ? Math.round(sum(dwellList) / dwellList.length) : 0,
        entered: base.length,
      };
    });

    /* AI-identified bottlenecks, written from the numbers above */
    const bottlenecks = [];
    const slowest = [...conversion].sort((a, b) => b.avgDays - a.avgDays)[0];
    if (slowest?.avgDays)
      bottlenecks.push({ severity: 'high', title: `${slowest.label} is your slowest stage`, body: `Deals spend an average of ${slowest.avgDays} days in ${slowest.label} — ${Math.round(slowest.avgDays / Math.max(1, avgCycle || 1) * 100)}% of the typical sales cycle. Tighten exit criteria or add a mutual action plan.` });
    const leakiest = [...conversion].filter((c) => c.entered >= 5).sort((a, b) => a.rate - b.rate)[0];
    if (leakiest)
      bottlenecks.push({ severity: 'medium', title: `Biggest drop-off: ${leakiest.label} → ${leakiest.next}`, body: `Only ${leakiest.rate}% of deals progress from ${leakiest.label} to ${leakiest.next}. Review lost deals at this stage for common objections.` });
    const stalled = open.filter((d) => daysSince(d.signals.lastActivityAt) >= 10);
    if (stalled.length)
      bottlenecks.push({ severity: stalled.length > 5 ? 'high' : 'low', title: `${stalled.length} deals have gone quiet`, body: `${money(sum(stalled, (d) => d.value))} of pipeline has seen no activity for 10+ days. An inactivity workflow can create follow-ups automatically.` });
    const noDM = open.filter((d) => !d.signals.decisionMakerEngaged && ['proposal', 'negotiation'].includes(d.stage));
    if (noDM.length)
      bottlenecks.push({ severity: 'medium', title: `${noDM.length} late-stage deals lack a decision maker`, body: 'Proposals sent without executive involvement convert far less often. Multi-thread these accounts this week.' });

    res.json({
      byStage,
      winLoss,
      winRate,
      velocity: { avgCycle, avgDeal, perDay: velocityPerDay, opportunities: open.length },
      forecast,
      forecastTotals: { commit: sum(forecast, (f) => f.commit), bestCase: sum(forecast, (f) => f.bestCase), weighted: sum(forecast, (f) => f.weighted) },
      team,
      conversion,
      bottlenecks,
    });
  })
);
