import { MIN_CATEGORY_ITEMS } from "../config";
import type { Rule, RuleResult } from "../types";
import { ZERO, behaviorSnapshot, categoryOf, daysInclusive, evidenceTransactions } from "./shared";

// R4 repeated spending: Behavior's possible_recurrence_* and confirmed_time_concentration findings.
// Outcome is the average per occurrence × 1: "one time fewer", never a guess at how many times is right.
export const R4: Rule = {
  id: "R4",
  version: 1,
  sources: ["behavior"],
  evaluate(ctx) {
    const b = ctx.behavior;
    if (!b) return [];
    const out: RuleResult[] = [];
    for (const f of b.findings) {
      const recurrence = f.findingType === "recurrence";
      if (!recurrence && f.ruleId !== "confirmed_time_concentration") continue;
      // The 8-item minimum is per category, so it applies to recurrences; a time bucket has no category.
      const c = recurrence ? categoryOf(b, f.categoryId) : null;
      if (recurrence && (!c || c.current.transactionCount < MIN_CATEGORY_ITEMS)) continue;
      const { amounts, count } = evidenceTransactions(f.evidence);
      if (!count || amounts.length !== count) continue; // evidence must list every occurrence it counts
      const sum = amounts.reduce((s, a) => s.plus(a), ZERO);
      const average = sum.div(count); // under 100 baht is dropped by the evaluator (MIN_OUTCOME_BAHT)
      const bucket = recurrence ? null : (f.evidence as { bucket?: { startHour: number; endHourExclusive: number } }).bucket ?? null;
      out.push({
        ruleId: "R4", ruleVersion: 1,
        // A recurrence is about its category, so its subject is the categoryId (the same subject R3/R5/R7 use).
        subject: recurrence ? (f.categoryId ?? "uncategorized") : "time:" + (bucket?.startHour ?? "?"),
        what: {
          kind: recurrence ? f.ruleId.replace("possible_recurrence_", "") : "time",
          categoryName: f.categoryName, startHour: bucket?.startHour ?? null, endHour: bucket?.endHourExclusive ?? null,
          windowDays: daysInclusive(b.periods.current.startDate, b.periods.current.endDate),
          occurrences: count, totalAmount: sum.toString(),
        },
        action: { fewerTimes: 1 },
        outcome: { saveAbout: average.toString() },
        outcomeValueBaht: average,
        confidence: { itemCount: c ? c.current.transactionCount : count, forecastFactor: null },
        inputs: {
          behavior: behaviorSnapshot(b), behaviorFindingRuleId: f.ruleId, minCategoryItems: MIN_CATEGORY_ITEMS,
          categoryTransactionCount: c?.current.transactionCount ?? null,
          occurrences: count, amounts: amounts.map((a) => a.toFixed(2)),
        },
        computed: { total: sum.toString(), averagePerOccurrence: average.toString() },
      });
    }
    // Behavior may report one category twice (e.g. general and weekly). Keep one per subject, the higher baht,
    // and record what was merged, so even the full list never shows two near-identical lines.
    const kept = new Map<string, RuleResult>();
    for (const r of out) {
      const k = kept.get(r.subject!);
      if (!k || r.outcomeValueBaht.gt(k.outcomeValueBaht)) kept.set(r.subject!, r);
    }
    return [...kept.values()].map((r) => {
      const merged = out.filter((o) => o.subject === r.subject && o !== r);
      return merged.length
        ? { ...r, inputs: { ...r.inputs, mergedFindings: { count: merged.length, ruleIds: merged.map((m) => m.inputs.behaviorFindingRuleId), saveAbout: merged.map((m) => m.outcome.saveAbout) } } }
        : r;
    });
  },
};
