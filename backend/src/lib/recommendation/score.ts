import { CONFIDENCE_FULL_AT_ITEMS, URGENCY, WEIGHTS } from "./config";
import type { Money, RuleResult, Score } from "./types";

// value = min(1, baht helped ÷ income this cycle), so users with different incomes compare fairly.
// No income → divide by this cycle's spending instead; neither → the cycle has no data and there is no score.
export function scoreResult(r: RuleResult, income: Money, spend: Money): Score | null {
  const denominator = income.gt(0) ? "income" : spend.gt(0) ? "spend" : null;
  if (!denominator) return null;
  const value = Math.max(0, Math.min(1, r.outcomeValueBaht.div(denominator === "income" ? income : spend).toNumber()));
  const urgency = URGENCY[r.ruleId];
  const base = Math.min(1, r.confidence.itemCount / CONFIDENCE_FULL_AT_ITEMS);
  const confidence = r.confidence.forecastFactor === null ? base : base * r.confidence.forecastFactor;
  const total = value ** WEIGHTS.value * urgency ** WEIGHTS.urgency * confidence ** WEIGHTS.confidence;
  return { total, value, urgency, confidence, denominator, weights: { ...WEIGHTS } };
}
