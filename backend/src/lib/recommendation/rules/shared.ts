import { Prisma } from "@prisma/client";
import { BEHAVIOR_RULE } from "../../behaviorRules";
import { addDays, utcDate } from "../../cycle";
import type { BehaviorView, DaySpend, Money, RecommendationGoal, SpendWindow } from "../types";

export const D = Prisma.Decimal;
export const ZERO = new D(0);

export const daysInclusive = (from: string, to: string) =>
  to < from ? 0 : Math.round((utcDate(to).getTime() - utcDate(from).getTime()) / 86400000) + 1;

// Sum of expense over `days` days starting at `from`.
export function sumWindow(daily: ReadonlyMap<string, DaySpend>, from: string, days: number) {
  let amount = ZERO, count = 0;
  for (let i = 0; i < days; i++) {
    const d = daily.get(addDays(from, i));
    if (d) { amount = amount.plus(d.amount); count += d.count; }
  }
  return { amount, count };
}

export function median(values: readonly Money[]): Money {
  const s = [...values].sort((a, b) => a.cmp(b));
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : s[m - 1]!.plus(s[m]!).div(2);
}

// Raw percentage as a decimal string; text.ts rounds it for display.
export const pct = (part: Money, whole: Money) => part.div(whole).mul(100).toString();

// Behavior's thresholds as they were when the advice was made (BEHAVIOR_RULE is locked; snapshot anyway for provenance).
export const behaviorSnapshot = (b: BehaviorView) => ({
  algorithm: BEHAVIOR_RULE.algorithm,
  window: b.periods,
  minimumIncreaseShare: BEHAVIOR_RULE.minimumIncreaseShare,
  minimumIncreaseAmount: BEHAVIOR_RULE.minimumIncreaseAmount,
  dominantShare: BEHAVIOR_RULE.dominantShare,
  bucketShare: BEHAVIOR_RULE.bucketShare,
  bucketDays: BEHAVIOR_RULE.bucketDays,
  amountTolerance: BEHAVIOR_RULE.amountTolerance,
  weeklyDateTolerance: BEHAVIOR_RULE.weeklyDateTolerance,
  monthlyDateTolerance: BEHAVIOR_RULE.monthlyDateTolerance,
});

// Prior windows as logged in inputs, so provenance shows exactly which date ranges "usual" came from.
export const windowsSnapshot = (ws: readonly SpendWindow[], categoryId: string) =>
  ws.map((w) => ({ startDate: w.startDate, endDate: w.endDate, total: w.total.toFixed(2), category: (w.byCategory.get(categoryId) ?? ZERO).toFixed(2) }));

// The one goal R7/R9 simulate: nearest target date; with no dated goal, the least remaining amount.
export function pickGoal(goals: readonly RecommendationGoal[]) {
  const remaining = (g: RecommendationGoal) => g.targetAmount.minus(g.savedAmount);
  const open = goals.filter((g) => remaining(g).gt(0));
  const dated = open.filter((g) => g.targetDate).sort((a, b) => a.targetDate!.localeCompare(b.targetDate!) || a.id.localeCompare(b.id));
  return dated[0] ?? [...open].sort((a, b) => remaining(a).cmp(remaining(b)) || a.id.localeCompare(b.id))[0] ?? null;
}

export const categoryOf =(b: BehaviorView, categoryId: string | null) =>
  b.categories.find((c) => c.categoryId === categoryId) ?? null;

// Behavior evidence is typed unknown; read only the fields R4 needs.
export function evidenceTransactions(evidence: unknown) {
  const e = evidence as { transactions?: { amount?: string }[]; transactionCount?: number } | null;
  const tx = (e?.transactions ?? []).filter((t) => typeof t.amount === "string");
  return { amounts: tx.map((t) => new D(t.amount!)), count: typeof e?.transactionCount === "number" ? e.transactionCount : tx.length };
}
