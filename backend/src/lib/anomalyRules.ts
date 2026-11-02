import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
const D = Prisma.Decimal.clone({ precision: 40 });
export const ANOMALY_RULE = Object.freeze({
  algorithm: "expense-screen-v1",
  baselineEligibility: "dimension-decisions-v2",
  globalGateCount: 30,
  globalGateInclusiveDays: 30,
  fallback: "same-account-per-dimension",
  windowDays: 180,
  // ISSUE-ANOM-1 stage 2 (was 30/10/28): evidence in scripts/forecast-experiment/category-minimum.ts.
  amountMin: 10,
  amountDays: 5,
  amountSpan: 14,
  timeMin: 60,
  timeDays: 20,
  timeSpan: 42,
  timeCoverage: "0.80",
  bucketMinutes: 240,
  neighborhoodMinutes: 120,
  rareFrequency: "0.05",
  zScale: "0.6745",
  zThreshold: "3.5",
  zHigh: "5",
  iqrMultiplier: "3",
  minimumDifference: "100",
  medianDifferenceRatio: "0.5",
  comparison: "strict",
  quartile: "median-halves-exclude-center",
  baseline: "prior-dates-only",
  time: "confirmed-bangkok-wall-clock",
  // ISSUE-ANOM-1: a category whose latest amount results go one way this often has a new level, not anomalies.
  levelShiftWindow: 7,
  levelShiftRequired: 5,
});
export const RULE_VERSION =
  ANOMALY_RULE.algorithm +
  "-" +
  createHash("sha256")
    .update(JSON.stringify(ANOMALY_RULE))
    .digest("hex")
    .slice(0, 24);
export type Baseline = {
  membershipVersion?: string;
  n: number;
  days: number;
  span: number;
  median: string | null;
  mad: string | null;
  q1: string | null;
  q3: string | null;
  min: string | null;
  max: string | null;
  timeTotal?: number;
  timeN: number;
  timeDays: number;
  timeSpan: number;
  bucketCount: number;
  nearbyCount: number;
};
export type Dimension = {
  status: "not_evaluated" | "not_flagged" | "flagged";
  reasonCode: string;
  high?: boolean;
};
const result = (
  status: Dimension["status"],
  reasonCode: string,
  high = false,
): Dimension => ({ status, reasonCode, high });
export function screenExpense(
  amount: string,
  confirmedTime: boolean,
  b: Baseline,
) {
  const r = ANOMALY_RULE;
  let money: Dimension;
  if (
    b.n < r.amountMin ||
    b.days < r.amountDays ||
    b.span < r.amountSpan ||
    b.median === null
  )
    money = result("not_evaluated", "amount_insufficient_history");
  else {
    const x = new D(amount),
      m = new D(b.median),
      mad = new D(b.mad!),
      iqr = new D(b.q3!).minus(b.q1!),
      diff = x.minus(m),
      floor = D.max(r.minimumDifference, m.mul(r.medianDifferenceRatio));
    if (mad.gt(0)) {
      const score = diff.mul(r.zScale);
      const flagged = score.gt(mad.mul(r.zThreshold)) && diff.gt(floor);
      money = result(
        flagged ? "flagged" : "not_flagged",
        "amount_modified_z",
        flagged && score.gt(mad.mul(r.zHigh)),
      );
    } else if (iqr.gt(0)) {
      money = result(
        x.gt(new D(b.q3!).plus(iqr.mul(r.iqrMultiplier))) && diff.gt(floor)
          ? "flagged"
          : "not_flagged",
        "amount_iqr",
      );
    } else if (new D(b.min!).eq(b.max!)) {
      money = result(
        x.gt(m) && diff.gt(floor) ? "flagged" : "not_flagged",
        "amount_zero_dispersion",
      );
    } else money = result("not_evaluated", "amount_zero_iqr_nonconstant");
  }
  let time: Dimension;
  if (!confirmedTime) time = result("not_evaluated", "time_not_confirmed");
  else if (
    b.timeN < r.timeMin ||
    b.timeDays < r.timeDays ||
    b.timeSpan < r.timeSpan ||
    new D(b.timeN).lt(new D(b.timeTotal ?? b.n).mul(r.timeCoverage))
  )
    time = result("not_evaluated", "time_insufficient_history");
  else
    time = result(
      new D(b.bucketCount).lt(new D(b.timeN).mul(r.rareFrequency)) &&
        new D(b.nearbyCount).lt(new D(b.timeN).mul(r.rareFrequency))
        ? "flagged"
        : "not_flagged",
      "time_rare_frequency",
    );
  const flags = [money, time].filter((x) => x.status === "flagged").length;
  return {
    amount: money,
    time,
    outcome: flags
      ? "flagged"
      : money.status === "not_evaluated" && time.status === "not_evaluated"
        ? "not_evaluated"
        : "not_flagged",
    level: flags
      ? flags === 2 || money.high
        ? "review_priority"
        : "review"
      : null,
  };
}
export type Direction = "up" | "down";
/** Which side of the amount screen a value falls on. "up" is exactly an amount flag; "down" mirrors every branch
 *  (modified Z, IQR lower fence, zero dispersion) with the same money floor. Down never enters the review queue:
 *  it only feeds level-shift detection. */
export function amountDirection(amount: string, b: Baseline): Direction | null {
  if (screenExpense(amount, false, b).amount.status === "flagged") return "up";
  if (!amountReady(b)) return null;
  const r = ANOMALY_RULE,
    x = new D(amount),
    m = new D(b.median!),
    mad = new D(b.mad!),
    iqr = new D(b.q3!).minus(b.q1!),
    below = m.minus(x),
    floor = D.max(r.minimumDifference, m.mul(r.medianDifferenceRatio));
  const low = mad.gt(0)
    ? below.mul(r.zScale).gt(mad.mul(r.zThreshold))
    : iqr.gt(0)
      ? x.lt(new D(b.q1!).minus(iqr.mul(r.iqrMultiplier)))
      : new D(b.min!).eq(b.max!) && x.lt(m);
  return low && below.gt(floor) ? "down" : null;
}
/** Level shift: at least levelShiftRequired of the latest levelShiftWindow amount results (oldest first) point the
 *  same way. Fewer results than the window means no decision yet. */
export function detectLevelShift(recent: readonly (Direction | null)[]): Direction | null {
  const { levelShiftWindow: w, levelShiftRequired: k } = ANOMALY_RULE;
  if (recent.length < w) return null;
  const last = recent.slice(-w);
  for (const d of ["up", "down"] as const) if (last.filter((x) => x === d).length >= k) return d;
  return null;
}
/** Index in `recent` of the first result pointing `d` inside the latest window: the shift's start. */
export function levelShiftStartIndex(recent: readonly (Direction | null)[], d: Direction) {
  const from = Math.max(0, recent.length - ANOMALY_RULE.levelShiftWindow);
  return from + recent.slice(from).indexOf(d);
}
export function amountReady(b: Baseline) {
  return (
    b.n >= ANOMALY_RULE.amountMin &&
    b.days >= ANOMALY_RULE.amountDays &&
    b.span >= ANOMALY_RULE.amountSpan &&
    b.median !== null
  );
}
export function timeReady(b: Baseline) {
  return (
    b.timeN >= ANOMALY_RULE.timeMin &&
    b.timeDays >= ANOMALY_RULE.timeDays &&
    b.timeSpan >= ANOMALY_RULE.timeSpan &&
    new D(b.timeN).gte(new D(b.timeTotal ?? b.n).mul(ANOMALY_RULE.timeCoverage))
  );
}
export function globalGate(count: number, inclusiveDays: number) {
  return (
    count >= ANOMALY_RULE.globalGateCount &&
    inclusiveDays >= ANOMALY_RULE.globalGateInclusiveDays
  );
}
export function dimensionEvidence(amount: string, b: Baseline) {
  const m = b.median === null ? null : new D(b.median),
    mad = b.mad === null ? null : new D(b.mad);
  return {
    amount: {
      modifiedZ:
        m && mad?.gt(0)
          ? new D(amount).minus(m).mul(ANOMALY_RULE.zScale).div(mad).toString()
          : null,
    },
    time: {
      bucketFrequency: b.timeN
        ? new D(b.bucketCount).div(b.timeN).toString()
        : null,
      nearbyFrequency: b.timeN
        ? new D(b.nearbyCount).div(b.timeN).toString()
        : null,
    },
  };
}
