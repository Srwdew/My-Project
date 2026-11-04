import { Prisma } from "@prisma/client";
import { getCurrentCycle, loadCycleContext, type CycleContext } from "./cycle";
import {
  D,
  FORECAST_RULE as R,
  MODEL_VERSION,
  money,
  sum,
} from "./holt";
import { theta } from "./theta";

// Chart only (theta-split, docs/FORECAST_REAL_DATA_BACKTEST.md 5.6): the same 7-day total, spread by this account's weekday habits.
// It is not more accurate, so R1, the Alert Layer and budgetComparison keep reading the Theta `daily`.
export function weekdayShape(daily: readonly { date: string; amount: string }[], series: readonly number[], cutoff: string, total: string) {
  const weekday = (d: string) => new Date(d + "T00:00:00Z").getUTCDay();
  const sum = Array<number>(7).fill(0), count = Array<number>(7).fill(0);
  series.forEach((v, i) => { const w = weekday(shiftDay(cutoff, i - series.length + 1)); sum[w]! += v; count[w]!++; });
  const rate = sum.map((s, i) => (count[i] ? s / count[i]! : 0));
  const whole = daily.reduce((a, d) => a + rate[weekday(d.date)]!, 0);
  if (whole <= 0) return daily.map((d) => ({ ...d }));
  let left = new D(total);
  return daily.map((d, i) => {
    // Rounded per day, so the last day takes the remainder and the sum stays exactly the total.
    const amount = i === daily.length - 1 ? D.max(left, 0) : new D(total).mul(rate[weekday(d.date)]!).div(whole).toDecimalPlaces(2);
    left = left.minus(amount);
    return { date: d.date, amount: amount.toFixed(2) };
  });
}

export const shiftDay = (date: string, days: number) => {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) =>
  Math.round(
    (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000,
  );
export type ForecastRow = { date: string; amount: string; count: number };
export type ForecastHistory = {
  transactionCount: number;
  firstDate: string | null;
  lastDate: string | null;
};
export type ForecastInput = {
  cycle: CycleContext;
  asOfDate: string;
  rows: ForecastRow[];
  history: ForecastHistory;
  budgetAmount: string | null;
};
export function totalSeries(
  rows: ForecastRow[],
  cutoff: string,
  firstDate: string | null,
) {
  const start =
    firstDate && firstDate <= cutoff
      ? firstDate > shiftDay(cutoff, 1 - R.windowDays)
        ? firstDate
        : shiftDay(cutoff, 1 - R.windowDays)
      : null;
  const byDate = new Map(
    rows.filter((r) => r.date <= cutoff && r.count > 0).map((r) => [r.date, r]),
  );
  const n = start ? daysBetween(start, cutoff) + 1 : 0;
  let longestGapDays = 0,
    gap = 0,
    expenseDays = 0;
  const series = Array.from({ length: n }, (_, i) => {
    const row = byDate.get(shiftDay(start!, i));
    if (row) {
      expenseDays++;
      gap = 0;
    } else {
      gap++;
      longestGapDays = Math.max(longestGapDays, gap);
    }
    return row?.amount ?? "0.00";
  });
  return {
    series,
    training: {
      startDate: start,
      endDate: cutoff,
      calendarDays: n,
      expenseDays,
      zeroFilledDays: n - expenseDays,
      longestGapDays,
    },
  };
}
export function buildForecast(input: ForecastInput) {
  const { asOfDate, history, budgetAmount } = input,
    cutoffDate = shiftDay(asOfDate, -1);
  // History is a database aggregate with an explicit cutoff, never inferred from today's rows.
  if (history.lastDate && history.lastDate > cutoffDate)
    throw Error("FORECAST_HISTORY_AFTER_CUTOFF");
  const span =
    history.firstDate && history.lastDate
      ? daysBetween(history.firstDate, history.lastDate) + 1
      : 0;
  const reasonCodes = [
    ...(history.transactionCount < R.minTransactions
      ? ["insufficient_expense_count"]
      : []),
    ...(span < R.minObservedDays ? ["insufficient_observed_span"] : []),
  ];
  const readiness = {
    ready: reasonCodes.length === 0,
    transactionCount: history.transactionCount,
    firstExpenseDate: history.firstDate,
    lastExpenseDate: history.lastDate,
    observedSpanDays: span,
    reasonCodes,
  };
  const rows = input.rows.filter(
    (r) =>
      r.date >= shiftDay(cutoffDate, 1 - R.windowDays) && r.date <= asOfDate,
  );
  const { series, training } = totalSeries(rows, cutoffDate, history.firstDate);
  const parameterMode = readiness.ready ? ("inner_validation" as const) : null;
  const fitted = readiness.ready ? theta(series.map(Number)) : null;
  const daily = fitted
    ? Array.from({ length: 7 }, (_, i) => ({
        date: shiftDay(asOfDate, i),
        amount: fitted.forecast[i]!.toFixed(2),
      }))
    : null;
  const total = daily ? money(sum(daily.map((d) => d.amount))) : null;
  const chartDaily = daily && total !== null ? weekdayShape(daily, series.map(Number), cutoffDate, total) : null;
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const previousDaily = Array.from({ length: 7 }, (_, i) => {
    const date = shiftDay(cutoffDate, i - 6),
      row = byDate.get(date);
    return {
      date,
      amount: row?.amount ?? "0.00",
      hasExpenseRecords: Boolean(row?.count),
    };
  });
  const previousActual = money(sum(previousDaily.map((d) => d.amount)));
  const cycle = getCurrentCycle(input.cycle, asOfDate),
    month = cycle.key,
    actualMonth = sum(
      rows
        .filter((r) => r.date >= cycle.startDate && r.date <= cycle.endDate)
        .map((r) => r.amount),
    );
  const actualToday = money(byDate.get(asOfDate)?.amount ?? 0);
  const remainingDays = daysBetween(asOfDate, cycle.endDate) + 1,
    k = Math.min(7, remainingDays);
  const additional = daily
    ? D.max(new D(daily[0]!.amount).minus(actualToday), 0).plus(
        sum(daily.slice(1, k).map((d) => d.amount)),
      )
    : null;
  const remaining =
    budgetAmount === null ? null : new D(budgetAmount).minus(actualMonth);
  const allowance =
    remaining === null
      ? null
      : D.max(remaining, 0).mul(k).div(remainingDays).toDecimalPlaces(2);
  const budgetStatus =
    remaining === null
      ? null
      : remaining.lt(0)
        ? "already_over_budget"
        : remaining.isZero()
          ? "budget_exhausted"
          : additional === null
            ? "forecast_unavailable"
            : additional.gt(allowance!)
              ? "above_reference"
              : additional.eq(allowance!)
                ? "at_reference"
                : "below_reference";
  const daysSinceLastExpense = history.lastDate
    ? daysBetween(history.lastDate, cutoffDate)
    : null;
  return {
    status: readiness.ready ? ("available" as const) : ("unavailable" as const),
    asOfDate,
    timezone: "Asia/Bangkok",
    cutoffDate,
    forecastStartDate: asOfDate,
    forecastEndDate: shiftDay(asOfDate, 6),
    horizonDays: 7,
    method: "theta",
    aggregation: "daily_expense_total_before_theta",
    modelVersion: MODEL_VERSION,
    readiness,
    training,
    parameterMode,
    // seasonalMode is kept for reporting (does real data deseasonalise as rarely as the backtest?); not shown in the UI.
    parameters: fitted
      ? { alpha: fitted.alpha, seasonalMode: fitted.mode }
      : null,
    clampedDays: fitted ? fitted.raw.filter((v) => v < 0).length : 0,
    daysSinceLastExpense,
    recordedExpenseToday: actualToday,
    summary: {
      daily,
      chartDaily,
      sevenDayForecastTotal: total,
      previousSevenDayActual: previousActual,
      periodDifference:
        total === null ? null : money(new D(total).minus(previousActual)),
    },
    previousPeriod: {
      startDate: shiftDay(cutoffDate, -6),
      endDate: cutoffDate,
      daily: previousDaily,
    },
    budgetComparison:
      remaining === null
        ? null
        : {
            month,
            budgetAmount,
            actualMonthExpenseToNow: money(actualMonth),
            remainingAmount: money(remaining),
            remainingDaysIncludingToday: remainingDays,
            comparedDays: k,
            referenceAllowance: money(allowance!),
            predictedAdditionalExpense:
              additional === null ? null : money(additional),
            difference:
              additional === null ? null : money(additional.minus(allowance!)),
            status: budgetStatus,
            suggestedAdditionalDailyAmount: D.max(remaining, 0)
              .div(remainingDays)
              .toDecimalPlaces(2, D.ROUND_DOWN)
              .toFixed(2),
          },
    reasonCodes,
    warningCodes: [
      "missing_days_assumed_zero",
      "recording_completeness_unverified",
      "readiness_not_accuracy_guarantee",
      ...(daysSinceLastExpense !== null && daysSinceLastExpense >= R.staleDays
        ? ["stale_expense_history"]
        : []),
      ...(training.longestGapDays >= R.longGapDays
        ? ["long_recording_gap"]
        : []),
      ...(fitted?.raw.some((v) => v < 0) ? ["negative_forecast_clipped"] : []),
    ],
  };
}
export async function forecastInput(
  tx: Prisma.TransactionClient,
  userId: string,
  asOfDate: string,
): Promise<ForecastInput> {
  const cutoff = new Date(shiftDay(asOfDate, -1) + "T00:00:00Z");
  const history = await tx.transaction.aggregate({
    where: { userId, type: "expense", transactionDate: { lte: cutoff } },
    _count: { _all: true },
    _min: { transactionDate: true },
    _max: { transactionDate: true },
  });
  const grouped = await tx.transaction.groupBy({
    by: ["transactionDate"],
    where: {
      userId,
      type: "expense",
      transactionDate: {
        gte: new Date(shiftDay(asOfDate, -180) + "T00:00:00Z"),
        lte: new Date(asOfDate + "T00:00:00Z"),
      },
    },
    _sum: { amount: true },
    _count: { _all: true },
    orderBy: { transactionDate: "asc" },
  });
  const cycle = await loadCycleContext(tx, userId);
  const budget = await tx.budget.findUnique({
    where: {
      userId_year_month: {
        userId,
        year: getCurrentCycle(cycle, asOfDate).year,
        month: getCurrentCycle(cycle, asOfDate).month,
      },
    },
    select: { amount: true },
  });
  return {
    cycle,
    asOfDate,
    rows: grouped.map((r) => ({
      date: r.transactionDate.toISOString().slice(0, 10),
      amount: r._sum.amount!.toFixed(2),
      count: r._count._all,
    })),
    history: {
      transactionCount: history._count._all,
      firstDate:
        history._min.transactionDate?.toISOString().slice(0, 10) ?? null,
      lastDate:
        history._max.transactionDate?.toISOString().slice(0, 10) ?? null,
    },
    budgetAmount: budget?.amount.toFixed(2) ?? null,
  };
}
