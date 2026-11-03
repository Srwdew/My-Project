import type { Prisma } from "@prisma/client";
import { D } from "./goalCalculations";
import { addDays, getCurrentCycle, loadCycleContext, utcDate } from "./cycle";
import { buildForecast, forecastInput } from "./expenseForecast";
import { anomalyQueue } from "./anomalyDecisions";
import { loadTier0 } from "./tier0";

// FINANCIAL_PROFILE_DESIGN section 5. Reads Budget, Forecast, Goal and Anomaly; never recommendations (C2).
// Tiers sort 1 to 4 with no scoring. Cards carry codes and budget figures only, never a raw forecast number (D-8).
const NOISE_FILTER_7_DAYS = new D("92.57"); // D-8, D-10
const LAYER_4_LIMIT = 3;
const threshold = (days: number) => NOISE_FILTER_7_DAYS.mul(days).div(7);

// D-9 (design 4.3), used only while the forecast gate is closed. days: expense totals per recorded day, up to yesterday.
export function typicalDaily(days: readonly { date: string; amount: Prisma.Decimal.Value }[], today: string) {
  const from = addDays(today, -30), yesterday = addDays(today, -1);
  const recorded = days.filter((d) => d.date >= from && d.date <= yesterday).sort((a, b) => a.date.localeCompare(b.date));
  if (recorded.length < 3) return null;
  const counted = (utcDate(yesterday).getTime() - utcDate(recorded[0]!.date).getTime()) / 86_400_000 + 1;
  if (counted < 7) return null;
  const amounts = recorded.map((d) => new D(d.amount)).sort((a, b) => a.cmp(b));
  const mid = amounts.length >> 1;
  const median = amounts.length % 2 ? amounts[mid]! : amounts[mid - 1]!.plus(amounts[mid]!).div(2);
  return median.mul(recorded.length).div(counted);
}

type Tier0 = Awaited<ReturnType<typeof loadTier0>>;
export type AlertInput = {
  pace: Tier0["pace"];
  savingsPlan: Pick<Tier0["savingsPlan"], "status" | "availableMonthlyAmount" | "requiredMonthlyAmount" | "shortfall" | "alternatives" | "activeGoalCount">;
  goalOptions: Tier0["goalOptions"];
  goalOptionsUnavailable: Tier0["goalOptionsUnavailable"];
  // Seven daily forecasts from today, or null while the forecast gate is closed.
  forecastDaily: readonly Prisma.Decimal.Value[] | null;
  typicalDaily?: Prisma.Decimal.Value | null;
  recordedToday: Prisma.Decimal.Value;
  nextCycle: { days: number; budget: string | null };
  anomaly: { ready: boolean; waitingShifts: number; items: readonly { id: string; amount: string; date: string; categoryName?: string }[] };
};

export function evaluateAlerts(input: AlertInput) {
  const { pace, savingsPlan: plan, nextCycle, anomaly } = input;
  const typical = input.forecastDaily ? null : input.typicalDaily ?? null;
  const daily = input.forecastDaily ?? (typical === null ? null : Array<Prisma.Decimal.Value>(7).fill(typical));
  const estimate = input.forecastDaily ? "forecast" : typical !== null ? "typical" : "insufficient";
  const cards: ({ tier: number; code: string } & Record<string, unknown>)[] = [];
  if (daily && pace.budgetLeft !== null) {
    // Budget left already took today's spending, so count only what today may still add, as budgetComparison does.
    const days = daily.map((d, i) => (i === 0 ? D.max(new D(d).minus(input.recordedToday), 0) : new D(d)));
    const total = (from: number, to: number) => days.slice(from, to).reduce((n, d) => n.plus(d), new D(0));
    const budget = { budgetLeft: pace.budgetLeft, overBudget: pace.overBudget, perDay: pace.perDay, daysLeft: pace.daysLeft, estimate };
    if (pace.daysLeft <= 7) {
      if (total(0, pace.daysLeft).minus(pace.budgetLeft).gt(threshold(pace.daysLeft))) cards.push({ tier: 1, code: "budget_short_to_cycle_end", ...budget });
      const nextDays = 7 - pace.daysLeft;
      if (nextDays > 0 && nextCycle.budget !== null) {
        const allowance = new D(nextCycle.budget).div(nextCycle.days).mul(nextDays);
        if (total(pace.daysLeft, 7).minus(allowance).gt(threshold(nextDays))) cards.push({ tier: 2, code: "pace_over_next_cycle", spanDays: nextDays, ...budget });
      }
    } else {
      const allowance = new D(pace.budgetLeft).div(pace.daysLeft).mul(7);
      if (total(0, 7).minus(allowance).gt(threshold(7))) cards.push({ tier: 2, code: "pace_over_7_days", spanDays: 7, ...budget });
    }
  }
  if (plan.status === "shortfall")
    cards.push({
      tier: 3,
      code: "goals_short",
      requiredMonthly: plan.requiredMonthlyAmount,
      availableMonthly: plan.availableMonthlyAmount,
      shortfall: plan.shortfall,
      goalCount: plan.activeGoalCount,
      alternatives: plan.alternatives,
      goalOptions: input.goalOptions,
      goalOptionsUnavailable: input.goalOptionsUnavailable,
    });
  const flagged = anomaly.ready
    ? [...anomaly.items].sort((a, b) => new D(b.amount).cmp(a.amount) || b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    : [];
  for (const item of flagged.slice(0, LAYER_4_LIMIT)) cards.push({ tier: 4, code: "flagged_undecided", ...item });
  return {
    cards,
    gates: { forecast: input.forecastDaily !== null, estimate, anomaly: anomaly.ready, budget: pace.budgetLeft !== null },
    flaggedTotal: flagged.length,
    // A waiting level shift stands in for the flags it covers, so those flags are not in flaggedTotal.
    levelShiftsWaiting: anomaly.ready ? anomaly.waitingShifts : 0,
  };
}

export async function loadAlerts(tx: Prisma.TransactionClient, userId: string, today: string) {
  const tier0 = await loadTier0(tx, userId, today);
  const ctx = await loadCycleContext(tx, userId);
  const next = getCurrentCycle(ctx, addDays(tier0.cycle.endDate, 1));
  const nextBudget = await tx.budget.findUnique({ where: { userId_year_month: { userId, year: next.year, month: next.month } }, select: { amount: true } });
  const forecast = buildForecast(await forecastInput(tx, userId, today));
  const grouped = await tx.transaction.groupBy({
    by: ["transactionDate"],
    where: { userId, type: "expense", transactionDate: { gte: utcDate(addDays(today, -30)), lte: utcDate(addDays(today, -1)) } },
    _sum: { amount: true },
  });
  // shortcut: reads the whole waiting queue because it pages in another order; move the sort into SQL if a queue gets large.
  const queue = await anomalyQueue(tx, userId, "waiting", 0, 100_000);
  const ids = (queue.items as { originalTransactionId: string }[]).map((i) => i.originalTransactionId);
  const rows = await tx.transaction.findMany({
    where: { userId, id: { in: ids }, transactionDate: { gte: new Date(tier0.cycle.startDate + "T00:00:00Z"), lte: new Date(today + "T00:00:00Z") } },
    select: { id: true, amount: true, transactionDate: true, category: { select: { name: true } } },
  });
  return {
    asOfDate: today,
    cycle: { key: tier0.cycle.key, startDate: tier0.cycle.startDate, endDate: tier0.cycle.endDate },
    ...evaluateAlerts({
      pace: tier0.pace,
      savingsPlan: tier0.savingsPlan,
      goalOptions: tier0.goalOptions,
      goalOptionsUnavailable: tier0.goalOptionsUnavailable,
      forecastDaily: forecast.summary.daily?.map((d) => d.amount) ?? null,
      typicalDaily: typicalDaily(grouped.map((g) => ({ date: g.transactionDate.toISOString().slice(0, 10), amount: g._sum.amount ?? 0 })), today),
      recordedToday: forecast.recordedExpenseToday,
      nextCycle: { days: next.days, budget: nextBudget?.amount.toFixed(2) ?? null },
      anomaly: {
        ready: queue.readiness.ready,
        waitingShifts: queue.levelShifts.length,
        items: rows.map((r) => ({ id: r.id, amount: r.amount.toFixed(2), date: r.transactionDate.toISOString().slice(0, 10), categoryName: r.category.name })),
      },
    }),
  };
}
