import { savingRate } from "../../dashboard";
import type { Rule, RuleResult } from "../types";
import { D, daysInclusive, sumWindow } from "./shared";

// R8 saving rate. Uses the existing savingRate() (dashboard) on the existing last-completed-month cash flow:
//   • negative, or below the user's own floor (strict <); with no floor set, only negative counts.
// Spending over income in the current cycle is reported too, while there is still time to act.
export const R8: Rule = {
  id: "R8",
  version: 1,
  sources: ["goals"],
  evaluate(ctx) {
    const out: RuleResult[] = [];
    const floor = ctx.profile.savingRateFloorPercent;
    // Current cycle: only negative matters (spent more than income so far).
    if (ctx.incomeThisCycle.gt(0) && ctx.spendThisCycle.gt(ctx.incomeThisCycle)) {
      const over = ctx.spendThisCycle.minus(ctx.incomeThisCycle);
      const remainingDays = daysInclusive(ctx.today, ctx.cycle.endDate); // today is not over, as in R2
      const items = sumWindow(ctx.dailyExpense, ctx.cycle.startDate, daysInclusive(ctx.cycle.startDate, ctx.today)).count;
      out.push({
        ruleId: "R8", ruleVersion: 1, subject: "current",
        what: { kind: "current_negative", spentToDate: ctx.spendThisCycle.toString(), income: ctx.incomeThisCycle.toString(), over: over.toString() },
        action: { reduceBy: over.toString(), remainingDays },
        outcome: { income: ctx.incomeThisCycle.toString() },
        outcomeValueBaht: over,
        confidence: { itemCount: items, forecastFactor: null },
        inputs: { scope: "current_cycle", window: { startDate: ctx.cycle.startDate, endDate: ctx.today }, floorPercent: floor?.toString() ?? null },
        computed: { over: over.toString(), remainingDays },
      });
    }
    const cf = ctx.lastCycleCashFlow;
    if (cf) {
      const income = new D(cf.incomeAmount), expense = new D(cf.expenseAmount);
      const rate = savingRate(income, expense, cf.transactionCount);
      if (rate.percent !== null) {
        const r = new D(rate.percent);
        const negative = r.lt(0), belowFloor = floor !== null && r.lt(floor);
        if (negative || belowFloor) {
          const targetPercent = negative && !belowFloor ? new D(0) : floor!;
          // Spend less by enough to reach the target rate: target share of income minus what was actually left.
          const gap = income.mul(targetPercent).div(100).minus(income.minus(expense));
          out.push({
            ruleId: "R8", ruleVersion: 1, subject: "last",
            what: { kind: belowFloor ? "below_floor" : "last_negative",
              month: cf.period.month, ratePercent: rate.percent, floorPercent: floor?.toString() ?? null, over: expense.minus(income).toString() },
            action: { spendLessPerMonth: gap.toString() },
            outcome: { targetPercent: targetPercent.toString() },
            outcomeValueBaht: gap,
            confidence: { itemCount: cf.transactionCount, forecastFactor: null },
            inputs: { scope: "last_completed_month", cashFlow: cf, savingRate: rate, floorPercent: floor?.toString() ?? null, comparison: "strict <" },
            computed: { gap: gap.toString(), targetPercent: targetPercent.toString() },
          });
        }
      }
    }
    return out;
  },
};
