import { D, ZERO } from "./shared";
import { FORECAST_ROUND_TO } from "../config";
import type { Rule } from "../types";

// R1 next 7 days (or what is left of the cycle) vs money left in the cycle = income this cycle − spending so far.
// Never uses Budget. The model forecasts the total only, so R1 says how much to cut across flexible categories in
// total and points at the flexible category with the most actual spending last cycle; no per-category forecast.
export const R1: Rule = {
  id: "R1",
  version: 1,
  sources: ["forecast"],
  evaluate(ctx) {
    const f = ctx.forecast;
    if (!f || ctx.incomeSource === "none" || !ctx.flexibleCategoryIds.size) return [];
    const left = ctx.incomeThisCycle.minus(ctx.spendThisCycle);
    const shortfall = f.total.minus(left.gt(0) ? left : ZERO);
    // Under half the D-8 rounding the text would say "0 บาท". R1 has its own floor: MIN_OUTCOME_RULES would hide too much of
    // the most urgent rule, and the 92.57 filter belongs to the Alert Layer, which must stay separate (C2).
    if (shortfall.lt(FORECAST_ROUND_TO / 2)) return [];
    const flexible = [...ctx.flexibleCategoryIds]
      .map((id) => ({ id, ...(ctx.previousCycleByCategory.get(id) ?? { name: "", amount: ZERO }) }))
      .filter((c) => c.amount.gt(0))
      .sort((a, b) => b.amount.cmp(a.amount) || a.id.localeCompare(b.id));
    const top = flexible[0];
    if (!top) return []; // no flexible spending last cycle to point at
    // Relative width of the forecast interval; no interval yet → 1, recorded as a fallback.
    const factor = f.interval && f.total.gt(0)
      ? Math.max(0, Math.min(1, new D(1).minus(f.interval.high.minus(f.interval.low).div(f.total)).toNumber()))
      : 1;
    const items = [...ctx.dailyExpense.entries()].filter(([d]) => d >= ctx.cycle.startDate && d <= ctx.today).reduce((n, [, v]) => n + v.count, 0);
    return [{
      ruleId: "R1", ruleVersion: 1, subject: null,
      what: { horizonDays: f.horizonDays, forecastTotal: f.total.toString(), left: left.toString(), shortfall: shortfall.toString() },
      action: { topFlexibleCategoryName: top.name, topFlexibleAmount: top.amount.toString() },
      outcome: { reduceBy: shortfall.toString() },
      outcomeValueBaht: shortfall,
      confidence: { itemCount: items, forecastFactor: factor },
      inputs: {
        forecast: { horizonDays: f.horizonDays, total: f.total.toString(), interval: f.interval && { low: f.interval.low.toString(), high: f.interval.high.toString() }, level: "total_only_not_per_category" },
        forecastFactorFallback: !f.interval,
        left: { income: ctx.incomeThisCycle.toString(), incomeSource: ctx.incomeSource, spentSoFar: ctx.spendThisCycle.toString(), budgetUsed: false },
        previousCycleFlexible: flexible.map((c) => ({ id: c.id, name: c.name, amount: c.amount.toString() })),
      },
      computed: { left: left.toString(), shortfall: shortfall.toString(), forecastFactor: factor },
    }];
  },
};
