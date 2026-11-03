import type { Prisma } from "@prisma/client";
import { D } from "./goalCalculations";
import { addDays, cycleBounds, getCurrentCycle, loadCycleContext, utcDate, type Cycle } from "./cycle";
import { calculateSavingsPlan, savingsPlanInput } from "./goalSavingsPlan";

const DAY = 86_400_000;
const daysBetween = (from: string, to: string) => (utcDate(to).getTime() - utcDate(from).getTime()) / DAY;

// FINANCIAL_PROFILE_DESIGN 3.1-3.3. Runs on whatever cycle cycle.ts returns; a budget of null means none is set.
export function budgetPace(cycle: Cycle, today: string, spent: Prisma.Decimal.Value, cycleBudget: Prisma.Decimal.Value | null) {
  if (today < cycle.startDate || today > cycle.endDate) throw Error("TODAY_OUTSIDE_CYCLE");
  const elapsed = daysBetween(cycle.startDate, today) + 1;
  const daysLeft = daysBetween(today, addDays(cycle.endDate, 1));
  const spentAmount = new D(spent);
  const base = { cycleDays: cycle.days, elapsed, daysLeft, spent: spentAmount.toFixed(2) };
  if (cycleBudget === null)
    return { ...base, cycleBudget: null, budgetLeft: null, overBudget: null, perDay: null, expectedSpent: null, paceGap: null };
  const budget = new D(cycleBudget);
  const left = D.max(budget.minus(spentAmount), 0);
  // 3.2: round down only, rounding up would pass the ceiling. D-8 does not apply: this comes from the budget, not the forecast.
  const perDay = left.div(daysLeft).toDecimalPlaces(0, D.ROUND_DOWN);
  const expected = budget.mul(elapsed).div(cycle.days).toDecimalPlaces(2);
  return {
    ...base,
    cycleBudget: budget.toFixed(2),
    budgetLeft: left.toFixed(2),
    overBudget: D.max(spentAmount.minus(budget), 0).toFixed(2),
    // 3.2 forbids "วันละ 0", so a zero has no per-day figure to show.
    perDay: perDay.gt(0) ? perDay.toFixed(0) : null,
    expectedSpent: expected.toFixed(2),
    paceGap: spentAmount.minus(expected).toFixed(2),
  };
}

// 3.4 options that calculateSavingsPlan does not give: one goal only, because several goals share the same spare money
// and working each out alone would count it twice. Needs money to spare per month.
export function goalOptions(
  goal: { targetAmount: Prisma.Decimal.Value; savedAmount: Prisma.Decimal.Value; monthsRemaining: number | null },
  available: Prisma.Decimal.Value,
) {
  const spare = new D(available);
  if (spare.lte(0)) return { extendToMonths: null, lowerTargetTo: null };
  const remaining = new D(goal.targetAmount).minus(goal.savedAmount);
  return {
    extendToMonths: remaining.div(spare).toDecimalPlaces(0, D.ROUND_UP).toNumber(),
    lowerTargetTo: goal.monthsRemaining === null ? null : new D(goal.savedAmount).plus(spare.mul(goal.monthsRemaining)).toFixed(2),
  };
}

export async function loadTier0(tx: Prisma.TransactionClient, userId: string, today: string) {
  const ctx = await loadCycleContext(tx, userId);
  const cycle = getCurrentCycle(ctx, today);
  const input = await savingsPlanInput(tx, userId, today, ctx);
  const spent = await tx.transaction.aggregate({
    where: {
      userId,
      type: "expense",
      transactionDate: { gte: cycleBounds(cycle).start, lte: utcDate(today) },
    },
    _sum: { amount: true },
  });
  const savingsPlan = calculateSavingsPlan(ctx, input.goals, input.income, input.budgetAmount, today);
  const short = savingsPlan.status === "shortfall";
  const only = short && savingsPlan.goals.length === 1 ? savingsPlan.goals[0]! : null;
  return {
    asOfDate: today,
    cycle,
    pace: budgetPace(cycle, today, spent._sum.amount ?? 0, input.budgetAmount),
    savingsPlan,
    goalOptions: only
      ? goalOptions(
          { targetAmount: only.targetAmount, savedAmount: input.goals.find((g) => g.id === only.id)!.savedAmount, monthsRemaining: only.monthsRemaining },
          savingsPlan.availableMonthlyAmount!,
        )
      : null,
    // Tells the card why extend/lower are missing, so several goals are not silent.
    goalOptionsUnavailable: short && !only ? ("several_goals_share_spare_money" as const) : null,
  };
}
