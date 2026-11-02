// Holt is NOT the production model any more: buildForecast uses Theta (./theta.ts) since the real-data
// comparison in docs/FORECAST_REAL_DATA_BACKTEST.md. holt()/fitHolt() stay only as the reference column of
// that backtest and the earlier synthetic reports. D, sum, money and FORECAST_RULE are shared and live here.
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";

export const D = Prisma.Decimal.clone({
  precision: 40,
  rounding: Prisma.Decimal.ROUND_HALF_UP,
});
export const FORECAST_RULE = Object.freeze({
  method: "theta_2_total",
  windowDays: 180,
  horizon: 7,
  minTransactions: 30,
  minObservedDays: 30,
  staleDays: 7,
  longGapDays: 7,
  readiness: "lifetime-expense-count-and-inclusive-first-last-through-cutoff",
  seasonality: "tested-first-acf-lag7-90pct-bartlett-deseasonalise-only-if-found-multiplicative-else-additive",
  alpha: "in-sample-one-step-sse-grid-0.01-to-0.99",
  drift: "theta-2-equals-ses-with-drift-half-ols-slope",
  missing: "zero-after-first-expense",
  negative: "clip-output-only",
  rounding: "float-daily-cents-then-40-digit-decimal-seven-day-sum",
  coverage: "all-expenses-total",
  version: 1,
});
// Settings of the retired Holt model. Frozen so the Holt comparison tables in the reports can be rebuilt
// exactly; do not change or delete them even though Holt is no longer used in production.
export const HOLT_REFERENCE = Object.freeze({
  tuningMinDays: 42,
  defaultAlpha: "0.2",
  defaultBetaStar: "0.1",
});
export const MODEL_VERSION =
  "theta-total-v1-" +
  createHash("sha256")
    .update(JSON.stringify(FORECAST_RULE))
    .digest("hex")
    .slice(0, 16);
export const sum = (values: readonly Prisma.Decimal.Value[]) =>
  values.reduce<Prisma.Decimal>((a, v) => a.plus(v), new D(0));
export const money = (v: Prisma.Decimal.Value) => new D(v).toFixed(2);

export function initialize(values: readonly Prisma.Decimal.Value[]) {
  if (values.length < 7) throw Error("HOLT_INITIALIZATION_REQUIRES_7_DAYS");
  const first = values.slice(0, 7).map((v) => new D(v));
  const mean = sum(first).div(7);
  const trend = sum(first.map((v, i) => v.minus(mean).mul(i - 3))).div(28);
  return { level: mean.plus(trend.mul(3)), trend };
}
export function holt(
  values: readonly Prisma.Decimal.Value[],
  alpha: string,
  betaStar: string,
) {
  const a = new D(alpha),
    b = new D(betaStar);
  if (a.lt(0) || a.gt(1) || b.lt(0) || b.gt(1))
    throw Error("INVALID_HOLT_PARAMETERS");
  let { level, trend } = initialize(values);
  for (const value of values.slice(7)) {
    const next = a.mul(value).plus(new D(1).minus(a).mul(level.plus(trend)));
    trend = b.mul(next.minus(level)).plus(new D(1).minus(b).mul(trend));
    level = next;
  }
  const raw = Array.from({ length: 7 }, (_, h) => level.plus(trend.mul(h + 1)));
  return {
    amounts: raw.map((v) => money(D.max(v, 0))),
    clampedDays: raw.filter((v) => v.lt(0)).length,
    initialLevel: money(initialize(values).level),
    initialTrend: money(initialize(values).trend),
  };
}
export function fitHolt(values: readonly Prisma.Decimal.Value[]) {
  if (values.length < HOLT_REFERENCE.tuningMinDays)
    throw Error("HOLT_TUNING_REQUIRES_42_DAYS");
  let best:
    | {
        alpha: string;
        betaStar: string;
        absolute: Prisma.Decimal;
        squared: Prisma.Decimal;
      }
    | undefined;
  for (let ai = 0; ai <= 10; ai++)
    for (let bi = 0; bi <= 10; bi++) {
      const alpha = new D(ai).div(10).toFixed(1),
        betaStar = new D(bi).div(10).toFixed(1);
      let absolute = new D(0),
        squared = new D(0);
      for (const cut of [
        values.length - 21,
        values.length - 14,
        values.length - 7,
      ]) {
        const prediction = holt(values.slice(0, cut), alpha, betaStar);
        prediction.amounts.forEach((v, h) => {
          const error = new D(values[cut + h]!).minus(v);
          absolute = absolute.plus(error.abs());
          squared = squared.plus(error.pow(2));
        });
      }
      if (
        !best ||
        absolute.lt(best.absolute) ||
        (absolute.eq(best.absolute) && squared.lt(best.squared))
      )
        best = { alpha, betaStar, absolute, squared };
    }
  return {
    ...holt(values, best!.alpha, best!.betaStar),
    alpha: best!.alpha,
    betaStar: best!.betaStar,
    validationMAE: money(best!.absolute.div(21)),
    validationRMSE: money(best!.squared.div(21).sqrt()),
  };
}
// The old buildForecast choice: fixed defaults below 42 days, inner-fold tuning from 42 days.
export function holtReference(values: readonly Prisma.Decimal.Value[]) {
  return values.length < HOLT_REFERENCE.tuningMinDays
    ? { mode: "fixed_default" as const, ...holt(values, HOLT_REFERENCE.defaultAlpha, HOLT_REFERENCE.defaultBetaStar) }
    : { mode: "inner_validation" as const, ...fitHolt(values) };
}
