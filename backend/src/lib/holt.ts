import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

export const D = Prisma.Decimal.clone({ precision: 40, rounding: Prisma.Decimal.ROUND_HALF_UP });
export const FORECAST_RULE = Object.freeze({
  method: 'holt_linear_category', windowDays: 180, horizon: 7,
  minDays: 42, minExpenseDays: 14, recentDays: 7,
  initialization: 'ols-first-7-level-at-7-recur-from-8',
  grid: '0.0:0.1:1.0', folds: 'last-three-nonoverlapping-7-day-inner-folds',
  objective: 'rounded-clipped-MAE-then-MSE-then-alpha-then-beta',
  missing: 'zero-after-first-expense', negative: 'clip-output-only',
  rounding: '40-digit-decimal-half-up-cents-before-aggregation',
  coverage: 'cutoff-eligible-categories-only', version: 1,
});
export const MODEL_VERSION = 'holt-category-v1-' + createHash('sha256').update(JSON.stringify(FORECAST_RULE)).digest('hex').slice(0, 16);
export const sum = (values: readonly Prisma.Decimal.Value[]) => values.reduce<Prisma.Decimal>((a, v) => a.plus(v), new D(0));
export const money = (v: Prisma.Decimal.Value) => new D(v).toFixed(2);

export function initialize(values: readonly Prisma.Decimal.Value[]) {
  if (values.length < 7) throw Error('HOLT_INITIALIZATION_REQUIRES_7_DAYS');
  const first = values.slice(0, 7).map(v => new D(v));
  const mean = sum(first).div(7);
  const trend = sum(first.map((v, i) => v.minus(mean).mul(i - 3))).div(28);
  return { level: mean.plus(trend.mul(3)), trend };
}
export function holt(values: readonly Prisma.Decimal.Value[], alpha: string, betaStar: string) {
  const a = new D(alpha), b = new D(betaStar);
  if (a.lt(0) || a.gt(1) || b.lt(0) || b.gt(1)) throw Error('INVALID_HOLT_PARAMETERS');
  let { level, trend } = initialize(values);
  for (const value of values.slice(7)) {
    const next = a.mul(value).plus(new D(1).minus(a).mul(level.plus(trend)));
    trend = b.mul(next.minus(level)).plus(new D(1).minus(b).mul(trend));
    level = next;
  }
  const raw = Array.from({ length: 7 }, (_, h) => level.plus(trend.mul(h + 1)));
  return { amounts: raw.map(v => money(D.max(v, 0))), clampedDays: raw.filter(v => v.lt(0)).length,
    initialLevel: money(initialize(values).level), initialTrend: money(initialize(values).trend) };
}
export function fitHolt(values: readonly Prisma.Decimal.Value[]) {
  if (values.length < 42) throw Error('HOLT_TUNING_REQUIRES_42_DAYS');
  let best: { alpha: string; betaStar: string; absolute: Prisma.Decimal; squared: Prisma.Decimal } | undefined;
  for (let ai = 0; ai <= 10; ai++) for (let bi = 0; bi <= 10; bi++) {
    const alpha = new D(ai).div(10).toFixed(1), betaStar = new D(bi).div(10).toFixed(1);
    let absolute = new D(0), squared = new D(0);
    for (const cut of [values.length - 21, values.length - 14, values.length - 7]) {
      const prediction = holt(values.slice(0, cut), alpha, betaStar);
      prediction.amounts.forEach((v, h) => {
        const error = new D(values[cut + h]!).minus(v);
        absolute = absolute.plus(error.abs()); squared = squared.plus(error.pow(2));
      });
    }
    if (!best || absolute.lt(best.absolute) || (absolute.eq(best.absolute) && squared.lt(best.squared)))
      best = { alpha, betaStar, absolute, squared };
  }
  return { ...holt(values, best!.alpha, best!.betaStar), alpha: best!.alpha, betaStar: best!.betaStar,
    validationMAE: money(best!.absolute.div(21)), validationRMSE: money(best!.squared.div(21).sqrt()) };
}
