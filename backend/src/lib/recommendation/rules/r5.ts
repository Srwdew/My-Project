import { BASELINE_WINDOWS, MIN_CATEGORY_ITEMS } from "../config";
import type { Rule, RuleResult } from "../types";
import { D, ZERO, behaviorSnapshot, categoryOf, daysInclusive, median, pct, windowsSnapshot } from "./shared";

// R5 category share: Behavior's category_dominant_share decides the trigger. The engine only works out the user's
// usual share (median over the 3 prior 30-day windows) for the message and the baht above it.
export const R5: Rule = {
  id: "R5",
  version: 1,
  sources: ["behavior"],
  evaluate(ctx) {
    const b = ctx.behavior;
    if (!b) return [];
    const windows = ctx.priorWindows.slice(0, BASELINE_WINDOWS);
    if (windows.length < BASELINE_WINDOWS || windows.some((w) => !w.total.gt(0))) return []; // no usual share to compare with
    const currentTotal = b.categories.reduce((s, c) => s.plus(c.current.amount), ZERO);
    const out: RuleResult[] = [];
    for (const f of b.findings) {
      if (f.ruleId !== "category_dominant_share" || f.categoryId === null) continue;
      const c = categoryOf(b, f.categoryId);
      if (!c || c.current.transactionCount < MIN_CATEGORY_ITEMS || !currentTotal.gt(0)) continue;
      const share = new D(c.current.amount).div(currentTotal);
      const usual = median(windows.map((w) => (w.byCategory.get(f.categoryId!) ?? ZERO).div(w.total)));
      const above = share.minus(usual).mul(currentTotal);
      if (!above.gt(0)) continue; // large share but not above the user's own usual: nothing to recommend
      out.push({
        ruleId: "R5", ruleVersion: 1, subject: f.categoryId,
        what: {
          categoryName: c.categoryName, windowDays: daysInclusive(b.periods.current.startDate, b.periods.current.endDate),
          sharePercent: pct(new D(c.current.amount), currentTotal), usualSharePercent: usual.mul(100).toString(),
        },
        action: { backToUsualShare: true },
        outcome: { reduceBy: above.toString() },
        outcomeValueBaht: above,
        confidence: { itemCount: c.current.transactionCount, forecastFactor: null },
        inputs: {
          behavior: behaviorSnapshot(b), behaviorFindingRuleId: f.ruleId, minCategoryItems: MIN_CATEGORY_ITEMS,
          usualStatistic: "median", baselineWindows: windowsSnapshot(windows, f.categoryId),
          categoryAmount: new D(c.current.amount).toFixed(2), currentTotal: currentTotal.toFixed(2),
        },
        computed: { share: share.toString(), usualShare: usual.toString(), aboveUsual: above.toString() },
      });
    }
    return out;
  },
};
