import { BEHAVIOR_RULE } from "../behaviorRules";
import type { RuleId } from "./types";

// Every tunable of the engine in one file (confirmed 1 Nov 2026).
// score = value^value × urgency^urgency × confidence^confidence
export const WEIGHTS = { value: 1, urgency: 1, confidence: 1 } as const;
export const URGENCY: Readonly<Record<RuleId, number>> = {
  R1: 1.0,
  R2: 0.6, R3: 0.6, R5: 0.6, R8: 0.6,
  R4: 0.3, R6: 0.3, R7: 0.3,
  R9: 0.1,
};
export const CONFIDENCE_FULL_AT_ITEMS = 16; // confidence = min(1, items ÷ 16)
export const MAX_SHOWN = 3; // the rest go to the full list
export const DISMISS_SUPPRESS_CYCLES = 3; // counted after the cycle it was dismissed in
export const REPEAT_LIMIT_CYCLES = 2; // same rule + subject shown this many cycles in a row with no response → skip
// Same-story suppression, applied in this order. A matcher with no subject matches every subject of that rule.
// A trigger counts even if it was itself suppressed: R1 + R8 current + R8 last leaves only R1.
//  • R1 covers R2, R5 and R8 current (R1 looks ahead and names what to cut).
//  • R8 current covers R8 last (a problem still fixable beats one already over).
export type Matcher = { ruleId: RuleId; subject?: string };
export const SUPPRESSIONS: readonly { by: Matcher; hides: readonly Matcher[] }[] = [
  { by: { ruleId: "R1" }, hides: [{ ruleId: "R2" }, { ruleId: "R5" }, { ruleId: "R8", subject: "current" }] },
  { by: { ruleId: "R8", subject: "current" }, hides: [{ ruleId: "R8", subject: "last" }] },
];
// Shared convention (1 Nov 2026): every threshold is strict. "Over X" means > X, so exactly X does not trigger;
// R9's decrease side is strict < in the same way.
// Engine-owned rule values (Behavior-detected rules R3/R4/R5 use Behavior's locked thresholds instead).
export const BASELINE_CYCLES = 3; // R2: median of the 3 previous cycles
export const R2_PACE_OVER = "0.15"; // R2: spend-to-date more than 15% over that median
export const BASELINE_WINDOWS = 3; // R5/R7: median of the 3 prior 30-day windows
export const R7_MIN_SHORTEN_CYCLES = 0; // R7: shortens the goal by > 0 whole cycles, i.e. at least 1
export const MIN_CATEGORY_ITEMS = 8; // R3/R4/R5: category needs at least 8 transactions in the window
export const R2_MIN_DAYS = 7; // R2: at least a full week so weekends are in both sides of the comparison
// Advice that helps by less than this many baht is not shown. Behavior's own locked 100-baht line, not a new value.
// Applies to R2–R7 and R9. Not to R1/R8: those warn that money will not last, which matters at any size.
// R6 is included: a goal 40 baht a month behind is not worth a warning.
export const MIN_OUTCOME_BAHT = BEHAVIOR_RULE.minimumIncreaseAmount;
export const MIN_OUTCOME_RULES: readonly RuleId[] = ["R2", "R3", "R4", "R5", "R6", "R7", "R9"];
export const R9_MIN_DECREASE_SHARE = BEHAVIOR_RULE.minimumIncreaseShare; // R9: Behavior's increase minimums, mirrored
export const R9_MIN_DECREASE_AMOUNT = BEHAVIOR_RULE.minimumIncreaseAmount;
export const R9_MIN_RATE_POINTS = "2"; // R9 saving rate: better by more than 2 percentage points…
export const R9_MIN_SAVED_MORE = BEHAVIOR_RULE.minimumIncreaseAmount; // …and more than 100 baht saved
// Display only (text.ts); formulas and `computed` keep raw values.
export const MONEY_DISPLAY_DECIMALS = 0; // whole baht
// Percent rounding differs by purpose:
//  • compared with a threshold (R2 pace, R3 share, R9 points): round UP, so a triggered "over 15%" never reads "15%";
//  • descriptive only (e.g. R5 category share): round to nearest.
export const PERCENT_DISPLAY_DECIMALS = 0; // whole percent
export const FORECAST_ROUND_TO = 100; // D-8: forecast figures are shown to the nearest hundred
