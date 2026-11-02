import { MIN_CATEGORY_ITEMS } from "../config";
import type { Rule, RuleResult } from "../types";
import { D, ZERO, behaviorSnapshot, categoryOf, daysInclusive, pct } from "./shared";

// R3 category growth: one result per Behavior period-change finding (category_both_up / frequency_up / average_up).
// Behavior decides what grew; this rule only adds the share of the total increase and the baht back to the old level.
export const R3: Rule = {
  id: "R3",
  version: 1,
  sources: ["behavior"],
  evaluate(ctx) {
    const b = ctx.behavior;
    if (!b) return [];
    // Divide by the sum of increases only, so falling categories do not distort the share.
    const totalIncrease = b.categories.reduce((s, c) => {
      const up = new D(c.current.amount).minus(c.previous.amount);
      return up.gt(0) ? s.plus(up) : s;
    }, ZERO);
    const out: RuleResult[] = [];
    for (const f of b.findings) {
      if (f.findingType !== "period_change") continue;
      const c = categoryOf(b, f.categoryId);
      if (!c || c.current.transactionCount < MIN_CATEGORY_ITEMS || !totalIncrease.gt(0)) continue;
      const increase = new D(c.current.amount).minus(c.previous.amount);
      if (!increase.gt(0)) continue;
      out.push({
        ruleId: "R3", ruleVersion: 1, subject: f.categoryId,
        what: {
          categoryName: c.categoryName, windowDays: daysInclusive(b.periods.current.startDate, b.periods.current.endDate),
          previousAmount: new D(c.previous.amount).toFixed(2), currentAmount: new D(c.current.amount).toFixed(2),
          shareOfIncreasePercent: pct(increase, totalIncrease),
        },
        action: { backToPreviousLevel: true },
        outcome: { reduceBy: increase.toFixed(2) },
        outcomeValueBaht: increase,
        confidence: { itemCount: c.current.transactionCount, forecastFactor: null },
        inputs: {
          behavior: behaviorSnapshot(b), behaviorFindingRuleId: f.ruleId, minCategoryItems: MIN_CATEGORY_ITEMS,
          category: { id: f.categoryId, name: c.categoryName, current: c.current, previous: c.previous },
          totalIncreaseAllCategories: totalIncrease.toFixed(2),
        },
        computed: { increase: increase.toFixed(2), shareOfIncreasePercent: pct(increase, totalIncrease) },
      });
    }
    // Increasing categories that got no R3 result (no Behavior finding, or under 8 items) still sit in the divisor.
    // TODO(backtest): if these often carry most of the increase, consider a combined summary message.
    const skipped = b.categories.filter((c) => new D(c.current.amount).gt(c.previous.amount) && !out.some((r) => r.subject === c.categoryId));
    const skippedIncrease = skipped.reduce((s, c) => s.plus(new D(c.current.amount).minus(c.previous.amount)), ZERO);
    for (const r of out)
      r.inputs.skippedIncreasingCategories = {
        count: skipped.length,
        totalIncrease: skippedIncrease.toFixed(2),
        categories: skipped.map((c) => ({ id: c.categoryId, name: c.categoryName, transactionCount: c.current.transactionCount })),
      };
    return out;
  },
};
