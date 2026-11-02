import { Prisma } from "@prisma/client";
import { behaviorInput, buildBehavior } from "../behavior";
import { BEHAVIOR_RULE, behaviorPeriod } from "../behaviorRules";
import { addDays, getCurrentCycle, loadCycleContext, previousCycle, type Cycle } from "../cycle";
import { buildForecast, forecastInput } from "../expenseForecast";
import { getFlexibleCategoryIds } from "../flexibleCategories";
import { goalCashFlow, goalFeasibility } from "../goalFeasibility";
import { goalSaved, goalView } from "../goals";
import { FORECAST_RULE } from "../holt";
import { BASELINE_CYCLES, BASELINE_WINDOWS } from "./config";
import { D, ZERO, daysInclusive } from "./rules/shared";
import type { DaySpend, ForecastView, RecommendationGoal, RuleContext, SpendWindow } from "./types";

const WINDOW_DAYS = 30; // Behavior's default window length
const key = (id: string | null) => id ?? "uncategorized";

// Everything the rules read, fetched once per evaluation. Every upstream module is called through its own
// existing function (Behavior, Forecast, goal feasibility, cycles), so the numbers match their pages.
export async function buildRecommendationContext(tx: Prisma.TransactionClient, userId: string, today: string) {
  const cctx = await loadCycleContext(tx, userId);
  const cycle = getCurrentCycle(cctx, today);
  const previousCycles: Cycle[] = [];
  for (let c = cycle, i = 0; i < BASELINE_CYCLES; i++) previousCycles.push((c = previousCycle(cctx, c)));

  const period = behaviorPeriod({}, today);
  const priorRanges = Array.from({ length: BASELINE_WINDOWS }, (_, i) => {
    const endDate = addDays(period.current.startDate, -1 - WINDOW_DAYS * i);
    return { startDate: addDays(endDate, -(WINDOW_DAYS - 1)), endDate };
  });
  const from = [previousCycles[previousCycles.length - 1]!.startDate, priorRanges[priorRanges.length - 1]!.startDate].sort()[0]!;

  // One aggregate over the whole range covers spend, income, daily totals, prior windows and last cycle by category.
  const rows = await tx.$queryRaw<{ date: string; type: string; categoryId: string | null; categoryName: string; amount: string; count: number }[]>(Prisma.sql`
    SELECT to_char(t."transactionDate",'YYYY-MM-DD') AS date, t.type::text AS type, c.id AS "categoryId",
      COALESCE(c.name,'ไม่ระบุหมวด') AS "categoryName", sum(t.amount)::text AS amount, count(*)::int AS count
    FROM "Transaction" t LEFT JOIN "Category" c ON c.id=t."categoryId"
    WHERE t."userId"=${userId} AND t."transactionDate">=${new Date(from + "T00:00:00Z")} AND t."transactionDate"<=${new Date(today + "T00:00:00Z")}
    GROUP BY 1,2,3,4`);
  const inRange = (d: string, s: string, e: string) => d >= s && d <= e;
  const expense = rows.filter((r) => r.type === "expense");
  const total = (rs: typeof rows) => rs.reduce((s, r) => s.plus(r.amount), ZERO);

  const dailyExpense = new Map<string, DaySpend>();
  for (const r of expense) {
    const d = dailyExpense.get(r.date);
    dailyExpense.set(r.date, { amount: (d?.amount ?? ZERO).plus(r.amount), count: (d?.count ?? 0) + r.count });
  }
  const priorWindows: SpendWindow[] = priorRanges.map((w) => {
    const rs = expense.filter((r) => inRange(r.date, w.startDate, w.endDate));
    const byCategory = new Map<string, Prisma.Decimal>();
    for (const r of rs) byCategory.set(key(r.categoryId), (byCategory.get(key(r.categoryId)) ?? ZERO).plus(r.amount));
    return { ...w, total: total(rs), byCategory };
  });
  const previousCycleByCategory = new Map<string, { name: string; amount: Prisma.Decimal }>();
  for (const r of expense.filter((r) => inRange(r.date, previousCycles[0]!.startDate, previousCycles[0]!.endDate)))
    previousCycleByCategory.set(key(r.categoryId), { name: r.categoryName, amount: (previousCycleByCategory.get(key(r.categoryId))?.amount ?? ZERO).plus(r.amount) });

  const profile = await tx.profile.findUnique({ where: { userId }, select: { income: true, savingRateFloorPercent: true } });
  const incomeTx = total(rows.filter((r) => r.type === "income" && inRange(r.date, cycle.startDate, today)));
  const [incomeThisCycle, incomeSource] = incomeTx.gt(0)
    ? [incomeTx, "transactions" as const]
    : profile?.income?.gt(0) ? [profile.income, "profile" as const] : [ZERO, "none" as const];
  const spendThisCycle = total(expense.filter((r) => inRange(r.date, cycle.startDate, today)));

  const behaviorOut = buildBehavior(await behaviorInput(tx, userId, period, today));
  const forecastOut = buildForecast(await forecastInput(tx, userId, today));
  let forecast: ForecastView | null = null;
  if (forecastOut.readiness.ready && forecastOut.summary.daily) {
    const horizonDays = Math.min(forecastOut.horizonDays, daysInclusive(today, cycle.endDate)); // fewer days left: use what is left
    const days = forecastOut.summary.daily.slice(0, horizonDays);
    forecast = { horizonDays, total: days.reduce((s, d) => s.plus(d.amount), ZERO), byCategory: null, interval: null }; // Theta as used here gives no interval
  }

  const lastCycleCashFlow = await goalCashFlow(tx, userId, today);
  const cashFlowBeforeLast = await goalCashFlow(tx, userId, previousCycles[0]!.startDate); // "last completed" as seen from last cycle
  const goals: RecommendationGoal[] = [];
  for (const g of await tx.goal.findMany({ where: { userId, archivedAt: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })) {
    const saved = await goalSaved(tx, userId, g.id);
    const view = goalView(g, saved, today);
    if (view.calculatedStatus === "completed") continue;
    goals.push({
      id: g.id, name: g.name, targetAmount: g.targetAmount, savedAmount: new D(saved), targetDate: view.targetDate,
      feasibility: goalFeasibility({ ...view, archivedAt: g.archivedAt, targetDate: g.targetDate }, lastCycleCashFlow),
    });
  }

  const readiness = {
    behavior: behaviorOut.readiness.current.ready, // Behavior's global gate
    forecast: forecastOut.readiness.ready, // Forecast's gate
    goals: goals.length > 0 && incomeThisCycle.gt(0), // at least one goal and income this cycle
  };
  // When a gate is closed, say how many more records open it, from each module's own minimums (no 30/30 here).
  const readinessDetail = {
    behavior: { ...behaviorOut.readiness.current, moreExpensesNeeded: Math.max(0, BEHAVIOR_RULE.minimumCount - behaviorOut.readiness.current.expenseCount), moreDaysNeeded: Math.max(0, BEHAVIOR_RULE.minimumSpan - behaviorOut.readiness.current.observedSpanDays) },
    forecast: { ...forecastOut.readiness, moreExpensesNeeded: Math.max(0, FORECAST_RULE.minTransactions - forecastOut.readiness.transactionCount), moreDaysNeeded: Math.max(0, FORECAST_RULE.minObservedDays - forecastOut.readiness.observedSpanDays) },
    goals: { activeGoals: goals.length, hasIncomeThisCycle: incomeThisCycle.gt(0) },
  };

  const ctx: RuleContext = {
    userId, today, cycle, previousCycles, incomeThisCycle, incomeSource, spendThisCycle, readiness,
    behavior: { periods: { current: behaviorOut.periods.current, previous: behaviorOut.periods.previous }, findings: behaviorOut.findings, categories: behaviorOut.facts.categories },
    dailyExpense, priorWindows, lastCycleCashFlow, cashFlowBeforeLast, previousCycleByCategory, forecast, goals,
    flexibleCategoryIds: await getFlexibleCategoryIds(tx, userId),
    profile: { savingRateFloorPercent: profile?.savingRateFloorPercent ?? null },
  };
  return { ctx, readinessDetail, cycleContext: cctx };
}
