import { dayCount } from "./behaviorRules";

// Display only. The real gates still stop at yesterday (DECISIONS); this lets a user see today's entry count at once.
export function progressWithToday(
  gate: { count: number; span: number; firstDate: string | null; minCount: number; minSpan: number },
  todayCount: number,
  today: string,
) {
  const expenseCount = gate.count + todayCount;
  const observedSpanDays = todayCount ? (gate.firstDate ? dayCount(gate.firstDate, today) : 1) : gate.span;
  return {
    expenseCount,
    observedSpanDays,
    moreExpensesNeeded: Math.max(0, gate.minCount - expenseCount),
    moreDaysNeeded: Math.max(0, gate.minSpan - observedSpanDays),
  };
}
