import { savingRate } from "../../dashboard";
import { R9_MIN_DECREASE_AMOUNT, R9_MIN_DECREASE_SHARE, R9_MIN_RATE_POINTS, R9_MIN_SAVED_MORE } from "../config";
import type { Rule, RuleResult } from "../types";
import { D, behaviorSnapshot, daysInclusive, pickGoal } from "./shared";

// R9 good news, two kinds:
//  • a category fell in Behavior's window. Decreases are facts (facts.categories), not Behavior findings.
//    Minimums mirror Behavior's increase minimums, strict: fell by more than 5% and by more than 100 baht.
//  • the saving rate (existing savingRate()) of the last completed month beat the month before by more than
//    2 percentage points, with more than 100 baht more saved.
export const R9: Rule = {
  id: "R9",
  version: 1,
  sources: ["behavior", "goals"],
  evaluate(ctx) {
    const b = ctx.behavior;
    const goal = pickGoal(ctx.goals);
    const left = goal ? new D(goal.feasibility.cashFlow.netCashFlow) : null;
    const remaining = goal ? goal.targetAmount.minus(goal.savedAmount) : null;
    const out: RuleResult[] = [];
    const last = ctx.lastCycleCashFlow, before = ctx.cashFlowBeforeLast;
    if (last && before) {
      const rate = (c: typeof last) => savingRate(new D(c.incomeAmount), new D(c.expenseAmount), c.transactionCount).percent;
      const rLast = rate(last), rBefore = rate(before);
      const savedMore = new D(last.netCashFlow).minus(before.netCashFlow);
      const points = rLast !== null && rBefore !== null ? new D(rLast).minus(rBefore) : null;
      if (points && points.gt(R9_MIN_RATE_POINTS) && savedMore.gt(R9_MIN_SAVED_MORE)) {
        const prevLeft = new D(before.netCashFlow), lastLeft = new D(last.netCashFlow);
        let cyclesSooner = 0;
        if (goal && remaining!.gt(0) && prevLeft.gt(0) && lastLeft.gt(0))
          cyclesSooner = remaining!.div(prevLeft).ceil().toNumber() - remaining!.div(lastLeft).ceil().toNumber();
        out.push({
          ruleId: "R9", ruleVersion: 1, subject: "saving_rate",
          what: { kind: "saving_rate", month: last.period.month, previousMonth: before.period.month, ratePercent: rLast!, improvedPoints: points.toString() },
          action: { keepLevel: true },
          outcome: { savedMore: savedMore.toString(), goalName: goal?.name ?? null, cyclesSooner },
          outcomeValueBaht: savedMore,
          confidence: { itemCount: last.transactionCount, forecastFactor: null },
          inputs: {
            source: "savingRate() on last two completed months",
            minimums: { points: R9_MIN_RATE_POINTS, savedMore: R9_MIN_SAVED_MORE, comparison: "strict >" },
            last, before, rates: { last: rLast, before: rBefore },
            goalChoice: "nearest_target_date_else_least_remaining",
            goal: goal ? { id: goal.id, name: goal.name, targetAmount: goal.targetAmount.toString(), savedAmount: goal.savedAmount.toString(), targetDate: goal.targetDate } : null,
          },
          computed: { improvedPoints: points.toString(), savedMore: savedMore.toString(), cyclesSooner },
        });
      }
    }
    if (!b) return out;
    for (const c of b.categories) {
      const prev = new D(c.previous.amount), cur = new D(c.current.amount);
      const decrease = prev.minus(cur);
      if (!(cur.lt(prev.mul(new D(1).minus(R9_MIN_DECREASE_SHARE))) && cur.lt(prev.minus(R9_MIN_DECREASE_AMOUNT)))) continue;
      // Cycles sooner for the one goal, only when it can be worked out (money left > 0 and something remaining).
      let cyclesSooner = 0, cyclesNow: number | null = null, cyclesWith: number | null = null;
      if (goal && left!.gt(0) && remaining!.gt(0)) {
        cyclesNow = remaining!.div(left!).ceil().toNumber();
        cyclesWith = remaining!.div(left!.plus(decrease)).ceil().toNumber();
        cyclesSooner = cyclesNow - cyclesWith;
      }
      out.push({
        ruleId: "R9", ruleVersion: 1, subject: c.categoryId,
        what: {
          kind: "category", categoryName: c.categoryName, windowDays: daysInclusive(b.periods.current.startDate, b.periods.current.endDate),
          previousAmount: prev.toString(), currentAmount: cur.toString(), decrease: decrease.toString(),
        },
        action: { keepLevel: true },
        outcome: { savedMore: decrease.toString(), goalName: goal?.name ?? null, cyclesSooner },
        outcomeValueBaht: decrease,
        confidence: { itemCount: c.previous.transactionCount, forecastFactor: null },
        inputs: {
          behavior: behaviorSnapshot(b), source: "facts.categories",
          minimums: { share: R9_MIN_DECREASE_SHARE, amount: R9_MIN_DECREASE_AMOUNT, comparison: "strict <" },
          category: { id: c.categoryId, name: c.categoryName, current: c.current, previous: c.previous },
          goalChoice: "nearest_target_date_else_least_remaining",
          goal: goal ? { id: goal.id, name: goal.name, targetAmount: goal.targetAmount.toString(), savedAmount: goal.savedAmount.toString(), targetDate: goal.targetDate } : null,
          leftPerCycle: left?.toString() ?? null, leftMonth: goal?.feasibility.cashFlow.period.month ?? null,
          assumption: "a 30-day window's decrease is added to one cycle's money left",
        },
        computed: { decrease: decrease.toString(), cyclesNow, cyclesWithDecrease: cyclesWith, cyclesSooner },
      });
    }
    return out;
  },
};
