import { getCurrentCycle, type CycleContext } from "./cycle";
/** Uses the existing Forecast comparison; never adds forecast amounts to actuals or plan. */
export type GoalForecast = {
  status: "available" | "unavailable";
  asOfDate: string;
  forecastStartDate: string;
  forecastEndDate: string;
  warningCodes: string[];
  summary: { sevenDayForecastTotal: string | null };
  budgetComparison: null | {
    month: string;
    budgetAmount: string | null;
    comparedDays: number;
    difference: string | null;
    predictedAdditionalExpense: string | null;
    referenceAllowance: string;
    status: string | null;
  };
};
export function forecastGoalSignal(
  ctx: CycleContext,
  f: GoalForecast,
  month: string,
  budget: string | null,
  today: string,
) {
  if (f.status !== "available" || f.summary.sevenDayForecastTotal === null)
    return { reason: "unavailable", amount: null, endDate: null };
  if (f.warningCodes.includes("stale_expense_history"))
    return { reason: "stale", amount: null, endDate: null };
  const b = f.budgetComparison;
  if (!b || b.budgetAmount === null || budget === null)
    return { reason: "no_budget", amount: null, endDate: null };
  if (
    f.asOfDate !== today ||
    f.forecastStartDate !== today ||
    b.month !== month ||
    month !== getCurrentCycle(ctx, today).key ||
    b.budgetAmount !== budget
  )
    return { reason: "period_mismatch", amount: null, endDate: null };
  const start = new Date(today + "T00:00:00Z");
  const horizonEnd = new Date(start);
  horizonEnd.setUTCDate(horizonEnd.getUTCDate() + 6);
  const cycleEnd = getCurrentCycle(ctx, today).endDate;
  if (
    f.forecastEndDate !== horizonEnd.toISOString().slice(0, 10) ||
    b.comparedDays !==
      Math.min(7, (Date.parse(cycleEnd) - start.getTime()) / 86400000 + 1)
  )
    return { reason: "period_mismatch", amount: null, endDate: null };
  if (
    b.status === null ||
    b.status === "forecast_unavailable" ||
    b.difference === null ||
    b.predictedAdditionalExpense === null
  )
    return { reason: "unavailable", amount: null, endDate: null };
  const end = new Date(f.forecastStartDate + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + b.comparedDays - 1);
  return {
    reason:
      /^\d+\.\d{2}$/.test(b.difference) &&
      BigInt(b.difference.replace(".", "")) > 0n
        ? "above_reference"
        : "no_signal",
    amount: b.difference,
    endDate: end.toISOString().slice(0, 10),
  };
}
