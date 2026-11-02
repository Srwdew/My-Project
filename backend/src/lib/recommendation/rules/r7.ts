import { BASELINE_WINDOWS, R7_MIN_SHORTEN_CYCLES } from "../config";
import type { Rule, RuleResult } from "../types";
import { D, ZERO, behaviorSnapshot, categoryOf, daysInclusive, median, pickGoal, windowsSnapshot } from "./shared";

// R7 cut a flexible category to reach the goal sooner. Test cut: bring the category back to its median over the
// 3 prior 30-day windows (also the slider's default). One goal (pickGoal), one result per flexible category.
export const R7: Rule = {
  id: "R7",
  version: 1,
  sources: ["goals", "behavior"],
  evaluate(ctx) {
    const b = ctx.behavior, goal = pickGoal(ctx.goals);
    const windows = ctx.priorWindows.slice(0, BASELINE_WINDOWS);
    if (!b || !goal || windows.length < BASELINE_WINDOWS || !ctx.flexibleCategoryIds.size) return [];
    // Money left per month from the existing goalFeasibility (last completed month). Not positive: R8's territory.
    const left = new D(goal.feasibility.cashFlow.netCashFlow), remaining = goal.targetAmount.minus(goal.savedAmount);
    if (!left.gt(0) || !remaining.gt(0)) return [];
    const cyclesAt = (perCycle: InstanceType<typeof D>) => remaining.div(perCycle).ceil().toNumber();
    const out: RuleResult[] = [];
    for (const id of [...ctx.flexibleCategoryIds].sort()) {
      const c = categoryOf(b, id);
      if (!c) continue;
      const usual = median(windows.map((w) => w.byCategory.get(id) ?? ZERO));
      const cut = new D(c.current.amount).minus(usual);
      if (!cut.gt(0)) continue;
      const now = cyclesAt(left), withCut = cyclesAt(left.plus(cut));
      if (!(now - withCut > R7_MIN_SHORTEN_CYCLES)) continue;
      out.push({
        ruleId: "R7", ruleVersion: 1, subject: id,
        what: {
          categoryName: c.categoryName, windowDays: daysInclusive(b.periods.current.startDate, b.periods.current.endDate),
          currentAmount: new D(c.current.amount).toString(), usualAmount: usual.toString(), goalName: goal.name,
        },
        action: { reduceBy: cut.toString(), sliderDefault: usual.toString() },
        outcome: { cyclesSooner: now - withCut, cyclesNow: now, cyclesWithCut: withCut },
        outcomeValueBaht: cut,
        confidence: { itemCount: c.current.transactionCount, forecastFactor: null },
        inputs: {
          behavior: behaviorSnapshot(b), goalChoice: "nearest_target_date_else_least_remaining",
          goal: { id: goal.id, name: goal.name, targetAmount: goal.targetAmount.toFixed(2), savedAmount: goal.savedAmount.toFixed(2), targetDate: goal.targetDate },
          leftPerCycle: left.toFixed(2), leftSource: goal.feasibility.policy, leftMonth: goal.feasibility.cashFlow.period.month,
          usualStatistic: "median", baselineWindows: windowsSnapshot(windows, id),
          assumption: "a 30-day window's cut is added to one cycle's money left",
          minShortenCycles: "> " + R7_MIN_SHORTEN_CYCLES,
        },
        computed: { cut: cut.toString(), remaining: remaining.toString(), cyclesNow: now, cyclesWithCut: withCut },
      });
    }
    return out;
  },
};
