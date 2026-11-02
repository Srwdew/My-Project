import type { Rule, RuleResult } from "../types";
import { D } from "./shared";

// R6 goal behind schedule: one result per goal whose existing goalFeasibility status is exceeds_observed_cash_flow
// (needed per month > money actually left last completed month). No saving-rate formula of its own.
export const R6: Rule = {
  id: "R6",
  version: 1,
  sources: ["goals"],
  evaluate(ctx) {
    const out: RuleResult[] = [];
    for (const g of ctx.goals) {
      const f = g.feasibility;
      if (f.status !== "exceeds_observed_cash_flow" || f.requiredMonthlyAmount === null) continue;
      const required = new D(f.requiredMonthlyAmount), left = new D(f.cashFlow.netCashFlow);
      const gap = required.minus(left);
      const remaining = g.targetAmount.minus(g.savedAmount);
      out.push({
        ruleId: "R6", ruleVersion: 1, subject: g.id,
        what: { goalName: g.name, requiredPerMonth: required.toFixed(2), leftLastMonth: left.toFixed(2), month: f.cashFlow.period.month },
        action: { addPerMonth: gap.toFixed(2) },
        outcome: { remaining: remaining.toFixed(2), targetDate: g.targetDate },
        outcomeValueBaht: gap,
        confidence: { itemCount: f.cashFlow.transactionCount, forecastFactor: null },
        inputs: {
          goal: { id: g.id, name: g.name, targetAmount: g.targetAmount.toFixed(2), savedAmount: g.savedAmount.toFixed(2), targetDate: g.targetDate },
          feasibility: f, // policy, status, required amount and the cash flow of the month it used
        },
        computed: { gapPerMonth: gap.toFixed(2), remaining: remaining.toFixed(2) },
      });
    }
    return out;
  },
};
