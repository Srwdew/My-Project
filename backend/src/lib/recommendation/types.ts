import type { Prisma, RecommendationAction } from "@prisma/client";
import type { Cycle } from "../cycle";
import type { buildBehavior } from "../behavior";
import type { goalCashFlow, goalFeasibility } from "../goalFeasibility";

export type RuleId = "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8" | "R9";
// Upstream gates. The engine has none of its own: a rule runs only when every source it reads is open.
export type Source = "behavior" | "forecast" | "goals";
export type Money = Prisma.Decimal;

export type BehaviorFinding = ReturnType<typeof buildBehavior>["findings"][number];
export type BehaviorCategory = ReturnType<typeof buildBehavior>["facts"]["categories"][number];
// Behavior's own output for its default window (30 days to yesterday vs the 30 before), so findings match the Behavior page.
export type BehaviorView = {
  periods: { current: { startDate: string; endDate: string }; previous: { startDate: string; endDate: string } };
  findings: readonly BehaviorFinding[];
  categories: readonly BehaviorCategory[];
};
export type DaySpend = { amount: Money; count: number };

// Whatever model produces it, R1 sees only this shape, so the model can be swapped without touching rules.
export type ForecastView = {
  horizonDays: number; // 7, or fewer when the cycle ends sooner
  total: Money;
  byCategory: ReadonlyMap<string, Money> | null; // null when the model only forecasts the total
  interval: { low: Money; high: Money } | null;
};

// Active goals only, each with the existing goalFeasibility result (last completed month); no new saving-rate formula.
export type RecommendationGoal = {
  id: string;
  name: string;
  targetAmount: Money;
  savedAmount: Money;
  targetDate: string | null; // YYYY-MM-DD
  feasibility: ReturnType<typeof goalFeasibility>;
};
// The three 30-day windows before Behavior's current window, most recent first (the first equals Behavior's previous).
export type SpendWindow = { startDate: string; endDate: string; total: Money; byCategory: ReadonlyMap<string, Money> };

export type RuleContext = {
  userId: string;
  today: string; // YYYY-MM-DD, Bangkok
  cycle: Cycle; // from cycle.ts, never computed here
  previousCycles: readonly Cycle[]; // most recent first
  incomeThisCycle: Money; // actual income transactions, else Profile.income
  incomeSource: "transactions" | "profile" | "none";
  spendThisCycle: Money;
  readiness: Readonly<Record<Source, boolean>>;
  behavior: BehaviorView | null; // R3/R4/R5/R9 read this; they never re-detect
  // Expense per day (YYYY-MM-DD), covering the oldest previous cycle up to yesterday. Missing day = no expense.
  dailyExpense: ReadonlyMap<string, DaySpend>;
  priorWindows: readonly SpendWindow[]; // R5/R7 "usual" = median over these
  lastCycleCashFlow: Awaited<ReturnType<typeof goalCashFlow>> | null; // R8/R9: the existing last-completed-month cash flow
  cashFlowBeforeLast: Awaited<ReturnType<typeof goalCashFlow>> | null; // R9: the month before that, same function
  previousCycleByCategory: ReadonlyMap<string, { name: string; amount: Money }>; // R1: actual expense per category, previous cycle
  forecast: ForecastView | null;
  goals: readonly RecommendationGoal[];
  flexibleCategoryIds: ReadonlySet<string>;
  profile: { savingRateFloorPercent: Money | null };
};

// Structured facts for the three parts. Wording lives in text.ts, so phrasing changes never touch a formula.
export type Facts = Readonly<Record<string, string | number | boolean | null | readonly string[]>>;

export type RuleResult = {
  ruleId: RuleId;
  ruleVersion: number;
  subject: string | null; // categoryId or goalId the advice is about; used to avoid repeating it
  what: Facts;
  action: Facts;
  outcome: Facts; // required: without it this is a report, not a recommendation
  outcomeValueBaht: Money;
  confidence: { itemCount: number; forecastFactor: number | null }; // forecastFactor only for forecast rules
  inputs: Record<string, unknown>; // every value the formula used, including thresholds at the time
  computed: Record<string, unknown>;
};

export type Rule = {
  id: RuleId;
  version: number; // bump when the formula changes, not the wording
  sources: readonly Source[];
  evaluate(ctx: RuleContext): readonly RuleResult[]; // empty = not triggered; several = one per subject
};

export type Score = { total: number; value: number; urgency: number; confidence: number; denominator: "income" | "spend"; weights: { value: number; urgency: number; confidence: number } };
export type Scored = RuleResult & { score: Score };

// The slice of recommendation_log the ranker needs.
export type LogEntry = { ruleId: string; cycleId: string; subject: string | null; userAction: RecommendationAction | null };
