// Stage D candidate models for the real-data backtest. Theta was selected and now lives in production (backend/src/lib/theta.ts).
// Every forecast is 7 daily values from the end of the training series, clipped at 0 and rounded to cents
// (as production clips and rounds), so all models are scored on the same footing.
import assert from "node:assert/strict";

const M = 7, H = 7;
const r2 = (n: number) => Math.round(n * 100) / 100;
const out = (v: number[]) => v.map((x) => r2(Math.max(x, 0)));
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

export function median7(series: number[]) {
  const s = series.slice(-7).sort((a, b) => a - b);
  return out(Array(H).fill(s[3]!));
}

// ---------- Holt-Winters, additive weekly season ----------
// Start values from the first two weeks (level = week-1 mean, trend = week-over-week mean change / 7,
// season = week-1 deviations from the level); recursion from day 8. One pass yields the state at every t,
// so the forecast "as if trained up to t" for the inner folds comes from the same pass, never from later data.
function hwStates(y: number[], a: number, b: number, g: number) {
  const L0 = mean(y.slice(0, M)), T0 = (mean(y.slice(M, 2 * M)) - L0) / M;
  const S = y.slice(0, M).map((v) => v - L0);
  const states: { L: number; T: number; S: number[] }[] = [];
  let L = L0, T = T0;
  states[M - 1] = { L, T, S: S.slice(-M) };
  for (let t = M; t < y.length; t++) {
    const s = S[t - M]!, L1 = a * (y[t]! - s) + (1 - a) * (L + T);
    T = b * (L1 - L) + (1 - b) * T; L = L1;
    S.push(g * (y[t]! - L) + (1 - g) * s);
    states[t] = { L, T, S: S.slice(-M) };
  }
  return states;
}
const hwForecast = (st: { L: number; T: number; S: number[] }) => Array.from({ length: H }, (_, i) => st.L + (i + 1) * st.T + st.S[i]!);

export const HW_FIXED = { alpha: 0.3, beta: 0.1, gamma: 0.3 }; // fixed column; also the fallback below 42 days
export const HW_TUNING_MIN_DAYS = 42; // same threshold as production Holt

export function holtWintersFixed(series: number[]) {
  return out(hwForecast(hwStates(series, HW_FIXED.alpha, HW_FIXED.beta, HW_FIXED.gamma).at(-1)!));
}

/** Grid-tuned on the last three non-overlapping 7-day inner folds of the training series only (as production Holt):
 *  objective = mean absolute error of clipped, rounded forecasts, then MSE, then smaller alpha, beta, gamma. */
export function holtWintersTuned(series: number[], step: number) {
  if (series.length < HW_TUNING_MIN_DAYS) return { forecast: holtWintersFixed(series), params: null };
  const n = series.length, grid = Array.from({ length: Math.round(1 / step) + 1 }, (_, i) => r2(i * step));
  let best: { mae: number; mse: number; a: number; b: number; g: number } | null = null;
  for (const a of grid) for (const b of grid) for (const g of grid) {
    const st = hwStates(series, a, b, g);
    let ae = 0, se = 0;
    for (let f = 1; f <= 3; f++) {
      const end = n - f * H - 1, pred = out(hwForecast(st[end]!));
      for (let h = 0; h < H; h++) { const e = series[end + 1 + h]! - pred[h]!; ae += Math.abs(e); se += e * e; }
    }
    const mae = ae / (3 * H), mse = se / (3 * H);
    if (!best || mae < best.mae - 1e-9 || (Math.abs(mae - best.mae) <= 1e-9 && mse < best.mse - 1e-9)) best = { mae, mse, a, b, g };
  }
  const p = { alpha: best!.a, beta: best!.b, gamma: best!.g };
  return { forecast: out(hwForecast(hwStates(series, p.alpha, p.beta, p.gamma).at(-1)!)), params: p };
}

// ---------- Theta: the production model, imported so backtest and production share one implementation ----------
import { theta, weeklySeasonal } from "../../backend/src/lib/theta";
export { theta, weeklySeasonal };

// ---------- self-check ----------
if (require.main === module) {
  // A clean additive weekly pattern: HW-fixed and seasonal Theta should reproduce it closely; median-7 cannot.
  const pat = [10, 12, 11, 13, 30, 40, 5], y = Array.from({ length: 84 }, (_, t) => 20 + pat[t % 7]!);
  const truth = Array.from({ length: 7 }, (_, h) => 20 + pat[(84 + h) % 7]!);
  const err = (f: number[]) => mean(f.map((v, i) => Math.abs(v - truth[i]!)));
  assert.ok(err(holtWintersFixed(y)) < 1, "HW fixed tracks a pure weekly pattern");
  const tuned = holtWintersTuned(y, 0.1); assert.ok(err(tuned.forecast) < 1 && tuned.params, "HW tuned tracks it too");
  const th = theta(y); assert.equal(th.mode, "multiplicative"); assert.ok(err(th.forecast) < 1.5, "Theta deseasonalises");
  assert.deepEqual(median7([1, 9, 3, 7, 5, 2, 8]), Array(7).fill(5));
  const flat = Array(60).fill(50); assert.deepEqual(theta(flat).forecast, Array(7).fill(50)); assert.equal(theta(flat).mode, "none");
  const zeros = y.map((v, t) => (t % 7 === 0 ? 0 : v)); assert.equal(theta(zeros).mode, "additive", "zero weekday falls back to additive");
  console.log("models self-check ok", { hw: tuned.params, theta: th.alpha });
}
