import { addDays } from "../../cycle";
import { BASELINE_CYCLES, R2_MIN_DAYS, R2_PACE_OVER } from "../config";
import type { Rule } from "../types";
import { D, daysInclusive, median, pct, sumWindow } from "./shared";

// R2 spending pace: spend from the cycle start to yesterday vs the median spend over the same number of days
// in the previous 3 cycles. Actual amounts only, no forecast.
export const R2: Rule = {
  id: "R2",
  version: 1,
  sources: ["behavior"], // Behavior's global gate; the forecast gate has nothing to do with this rule
  evaluate(ctx) {
    const yesterday = addDays(ctx.today, -1); // today is not over yet, as in Behavior
    const n = daysInclusive(ctx.cycle.startDate, yesterday);
    if (n < R2_MIN_DAYS) return []; // fewer days than a week says nothing about pace
    const now = sumWindow(ctx.dailyExpense, ctx.cycle.startDate, n);
    const previous = ctx.previousCycles.slice(0, BASELINE_CYCLES).map((c) => {
      const days = Math.min(n, c.days); // shorter cycle: use all of it
      const all = sumWindow(ctx.dailyExpense, c.startDate, c.days);
      return {
        key: c.key, startDate: c.startDate, endDate: c.endDate, windowEnd: addDays(c.startDate, days - 1),
        capped: days < n,
        // A cycle counts only if it has an expense and is finished (or at least n days long).
        usable: all.count > 0 && (c.endDate < ctx.today || c.days >= n),
        amount: sumWindow(ctx.dailyExpense, c.startDate, days).amount,
      };
    });
    if (previous.length < BASELINE_CYCLES || previous.some((p) => !p.usable)) return [];
    const usual = median(previous.map((p) => p.amount));
    if (!usual.gt(0) || !now.amount.gt(usual.mul(new D(1).plus(R2_PACE_OVER)))) return [];
    const over = now.amount.minus(usual);
    const remainingDays = daysInclusive(ctx.today, ctx.cycle.endDate);
    return [{
      ruleId: "R2", ruleVersion: 1, subject: null,
      what: { day: n, spentToDate: now.amount.toString(), usualToDate: usual.toString(), overPercent: pct(over, usual) },
      action: { reduceBy: over.toString(), remainingDays },
      outcome: { backToUsualBy: over.toString() },
      outcomeValueBaht: over,
      confidence: { itemCount: now.count, forecastFactor: null },
      inputs: {
        threshold: { paceOver: R2_PACE_OVER, baselineCycles: BASELINE_CYCLES, minDays: R2_MIN_DAYS, statistic: "median", todayExcluded: true },
        window: { startDate: ctx.cycle.startDate, endDate: yesterday, days: n },
        spentToDate: now.amount.toFixed(2), transactionCount: now.count,
        previousCycles: previous.map((p) => ({ ...p, amount: p.amount.toFixed(2) })),
      },
      computed: { usualToDate: usual.toString(), over: over.toString(), remainingDays },
    }];
  },
};
