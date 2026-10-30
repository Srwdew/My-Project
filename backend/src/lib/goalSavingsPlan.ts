import { Prisma } from "@prisma/client";
import { buildForecast, forecastInput } from "./expenseForecast";
import { goalCashFlow } from "./goalFeasibility";
import { forecastGoalSignal } from "./goalForecastSignal";
import { getCurrentCycle } from "./cycle";
import { z } from "zod";
import {
  D,
  calculateGoal,
  dateSchema,
  moneySchema,
  openingMoneySchema,
} from "./goalCalculations";
import { goalSaved, GoalError } from "./goals";

export const planPreviewSchema = z
  .object({
    income: openingMoneySchema.nullable().optional(),
    budgetAmount: openingMoneySchema.nullable().optional(),
    goals: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            targetAmount: moneySchema.optional(),
            targetDate: dateSchema.nullable().optional(),
          })
          .strict(),
      )
      .max(100)
      .default([]),
  })
  .strict()
  .refine(
    (v) => new Set(v.goals.map((g) => g.id)).size === v.goals.length,
    "Duplicate goal",
  );
type Overrides = z.infer<typeof planPreviewSchema>;
type PlanGoal = {
  id: string;
  name: string;
  targetAmount: string;
  targetDate: string | null;
  savedAmount: string;
  archivedAt: unknown;
};
export function calculateSavingsPlan(
  userId: string,
  goals: PlanGoal[],
  income: string | null,
  budgetAmount: string | null,
  today: string,
  overrides: Overrides = { goals: [] },
) {
  const active = goals.filter(
    (g) => !g.archivedAt && new D(g.savedAmount).lt(g.targetAmount),
  );
  if (overrides.goals.some((o) => !active.some((g) => g.id === o.id)))
    throw new GoalError(
      404,
      "PLAN_GOAL_NOT_FOUND",
      "เลือกเป้าหมายที่ยังใช้งานของบัญชีนี้",
    );
  const assumedIncome =
    overrides.income === undefined ? income : overrides.income;
  const assumedBudget =
    overrides.budgetAmount === undefined
      ? budgetAmount
      : overrides.budgetAmount;
  const items = active.map((g) => {
    const o = overrides.goals.find((o) => o.id === g.id);
    const targetAmount = o?.targetAmount ?? g.targetAmount;
    const targetDate =
      o?.targetDate === undefined ? g.targetDate : o.targetDate;
    const value = calculateGoal(
      {
        targetAmount,
        targetDate: targetDate ? new Date(targetDate + "T00:00:00Z") : null,
        plannedMonthlyAmount: null,
      },
      g.savedAmount,
      today,
    );
    return {
      id: g.id,
      name: g.name,
      targetAmount,
      targetDate,
      ...value,
      reason:
        value.requiredMonthlyAmount !== null
          ? null
          : targetDate === null
            ? "no_target_date"
            : "overdue",
    };
  });
  const reasons = [
    ...(assumedIncome === null ? ["missing_income"] : []),
    ...(assumedBudget === null ? ["missing_total_budget"] : []),
    ...(!items.length ? ["no_active_goals"] : []),
    ...(items.some((g) => g.requiredMonthlyAmount === null)
      ? ["incomplete_goal_dates"]
      : []),
  ];
  const available =
    assumedIncome === null || assumedBudget === null
      ? null
      : new D(assumedIncome).minus(assumedBudget);
  const required =
    !items.length || items.some((g) => g.requiredMonthlyAmount === null)
      ? null
      : items.reduce((n, g) => n.plus(g.requiredMonthlyAmount!), new D(0));
  const difference =
    reasons.length || available === null || required === null
      ? null
      : available.minus(required);
  const shortfall = difference === null ? null : D.max(difference.neg(), 0);
  return {
    policy: "constant-monthly-income-total-budget-v1",
    asOfDate: today,
    month: getCurrentCycle(userId, today).key,
    income: assumedIncome,
    budgetAmount: assumedBudget,
    activeGoalCount: items.length,
    goals: items,
    reasonCodes: reasons,
    status:
      difference === null
        ? "unavailable"
        : difference.lt(0)
          ? "shortfall"
          : "within_plan",
    availableMonthlyAmount: available?.toFixed(2) ?? null,
    requiredMonthlyAmount: required?.toFixed(2) ?? null,
    difference: difference?.toFixed(2) ?? null,
    shortfall: shortfall?.toFixed(2) ?? null,
    alternatives: shortfall?.gt(0)
      ? {
          reduceBudgetBy: shortfall.toFixed(2),
          increaseIncomeBy: shortfall.toFixed(2),
          budgetReductionAlonePossible: shortfall.lte(assumedBudget!),
          targetBudget: shortfall.lte(assumedBudget!)
            ? new D(assumedBudget!).minus(shortfall).toFixed(2)
            : null,
          targetIncome: new D(assumedIncome!).plus(shortfall).toFixed(2),
        }
      : null,
  };
}
export async function savingsPlanInput(
  tx: Prisma.TransactionClient,
  userId: string,
  today: string,
) {
  const profile = await tx.profile.findUnique({
    where: { userId },
    select: { income: true },
  });
  const budget = await tx.budget.findUnique({
    where: {
      userId_year_month: {
        userId,
        year: getCurrentCycle(userId, today).year,
        month: getCurrentCycle(userId, today).month,
      },
    },
    select: { amount: true },
  });
  const rows = await tx.goal.findMany({
    where: { userId, archivedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const goals: PlanGoal[] = [];
  for (const g of rows)
    goals.push({
      id: g.id,
      name: g.name,
      targetAmount: g.targetAmount.toFixed(2),
      targetDate: g.targetDate?.toISOString().slice(0, 10) ?? null,
      archivedAt: g.archivedAt,
      savedAmount: (await goalSaved(tx, userId, g.id)).toFixed(2),
    });
  return {
    goals,
    income: profile?.income?.toFixed(2) ?? null,
    budgetAmount: budget?.amount.toFixed(2) ?? null,
  };
}

/** Internal backend workflow only; caller supplies its trusted account scope and snapshot. */
export async function assessSavingsPlan(
  tx: Prisma.TransactionClient,
  userId: string,
  today: string,
  rawAssumptions: unknown = {},
) {
  const assumptions = planPreviewSchema.parse(rawAssumptions);
  const input = await savingsPlanInput(tx, userId, today);
  const forecast = buildForecast(await forecastInput(tx, userId, today));
  return {
    plan: calculateSavingsPlan(
      userId,
      input.goals,
      input.income,
      input.budgetAmount,
      today,
      assumptions,
    ),
    cashFlow: await goalCashFlow(tx, userId, today),
    // Compare to the real current budget, never to a hypothetical override.
    forecastSignal: forecastGoalSignal(
      userId,
      forecast,
      getCurrentCycle(userId, today).key,
      input.budgetAmount,
      today,
    ),
  };
}
