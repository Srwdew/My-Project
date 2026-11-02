import { MIN_OUTCOME_BAHT, MIN_OUTCOME_RULES } from "./config";
import { scoreResult } from "./score";
import type { Rule, RuleContext, RuleResult, Scored, Source } from "./types";

// Rules that point at flexible categories and so stay silent until the user flags one.
const NEEDS_FLAGS: readonly Rule["id"][] = ["R1", "R7", "R9"];

// One context, built once by the caller, goes to every rule; rules never query on their own.
// A rule whose upstream source is not open is not called and does not take part in ranking.
export function evaluate(ctx: RuleContext, rules: readonly Rule[]) {
  const skipped: { ruleId: Rule["id"]; closedSources: Source[] }[] = [];
  const belowMinimum: RuleResult[] = [];
  const unscored: RuleResult[] = [];
  const scored: Scored[] = [];
  for (const rule of rules) {
    const closedSources = rule.sources.filter((s) => !ctx.readiness[s]);
    if (closedSources.length) { skipped.push({ ruleId: rule.id, closedSources }); continue; }
    for (const result of rule.evaluate(ctx)) {
      if (result.ruleId !== rule.id || result.ruleVersion !== rule.version) throw Error("RULE_RESULT_MISMATCH:" + rule.id);
      if (MIN_OUTCOME_RULES.includes(result.ruleId) && result.outcomeValueBaht.lt(MIN_OUTCOME_BAHT)) { belowMinimum.push(result); continue; }
      const score = scoreResult(result, ctx.incomeThisCycle, ctx.spendThisCycle);
      if (score) scored.push({ ...result, score });
      else unscored.push(result);
    }
  }
  // TODO(recommendation step 6): when this is non-empty, the invitation to flag flexible categories must be the
  // FIRST item on screen, not a note at the bottom: R1 (the most urgent rule) is among the ones it silences.
  const silencedByNoFlags = ctx.flexibleCategoryIds.size
    ? []
    : rules.filter((r) => NEEDS_FLAGS.includes(r.id) && !skipped.some((s) => s.ruleId === r.id)).map((r) => r.id);
  return { scored, unscored, skipped, belowMinimum, silencedByNoFlags };
}

// The recommendation_log row. Shared inputs are snapshotted here for every rule, so the "where did this come from"
// view reads only the log and never today's flags or thresholds.
export function toLogRow(ctx: RuleContext, item: Scored) {
  return {
    userId: ctx.userId,
    ruleId: item.ruleId,
    ruleVersion: item.ruleVersion,
    cycleId: ctx.cycle.key,
    inputs: {
      ...item.inputs,
      today: ctx.today,
      cycle: { key: ctx.cycle.key, startDate: ctx.cycle.startDate, endDate: ctx.cycle.endDate },
      incomeThisCycle: ctx.incomeThisCycle.toString(),
      incomeSource: ctx.incomeSource,
      spendThisCycle: ctx.spendThisCycle.toString(),
      flexibleCategoryIds: [...ctx.flexibleCategoryIds].sort(),
      savingRateFloorPercent: ctx.profile.savingRateFloorPercent?.toString() ?? null,
      scoreDenominator: item.score.denominator,
      minOutcomeBaht: MIN_OUTCOME_RULES.includes(item.ruleId) ? MIN_OUTCOME_BAHT : null,
    },
    computed: { ...item.computed, subject: item.subject, what: item.what, action: item.action, outcome: item.outcome, outcomeValueBaht: item.outcomeValueBaht.toString() },
    score: item.score,
    citationTier: 1, // every rule in this version computes from the user's own data only
    citationRef: null,
  };
}
