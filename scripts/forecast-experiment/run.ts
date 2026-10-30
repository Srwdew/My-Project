// Synthetic Holt experiment. RANDOM DATA ONLY: a functional check, not evidence of
// accuracy on real users. No database access: data lives in memory and is written to CSV.
//
// Uses the project's own Holt implementation directly (backend/src/lib/holt.ts: holt,
// FORECAST_RULE). Nothing is copied. Note holt() always returns a 7-day path from the
// end of the series, rounded to 2 decimals and clipped at 0; the 1-day-ahead training
// error below takes amounts[0] of holt(series.slice(0, t)).
//
// The production Forecast Gate (30 expense transactions AND 30 inclusive days) and
// fitHolt() (needs 42 days) are bypassed on purpose: this script never calls
// buildForecast() or fitHolt(), only holt(), on 28 training days.
//
// Run from the repo root:  backend/node_modules/.bin/tsx scripts/forecast-experiment/run.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FORECAST_RULE, holt } from "../../backend/src/lib/holt";

const SEED = Number(process.env.SEED ?? 20261026);
const TRAIN_DAYS = 28;
const TEST_DAYS = 7;
const START = "2026-09-01"; // labels only; the model ignores calendar dates

// mulberry32: small deterministic PRNG so reruns give identical data.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Box-Muller standard normal.
const normal = (rand: () => number) =>
  Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

// Each profile: daily mean = base + slope*day, times weekend factor on Sat/Sun,
// times lognormal noise exp(sigma*z); a day has no spend with probability pZero;
// with probability pSpike the day is multiplied by spikeX. Transactions per day = 1..3.
type Profile = {
  name: string;
  base: number;
  slope: number;
  weekend: number;
  sigma: number;
  pZero: number;
  pSpike: number;
  spikeX: number;
};
const PROFILES: Profile[] = [
  { name: "A-stable", base: 400, slope: 0, weekend: 1, sigma: 0.15, pZero: 0, pSpike: 0, spikeX: 1 },
  { name: "B-uptrend", base: 300, slope: 12, weekend: 1, sigma: 0.15, pZero: 0, pSpike: 0, spikeX: 1 },
  { name: "C-weekend", base: 350, slope: 0, weekend: 2.2, sigma: 0.2, pZero: 0, pSpike: 0, spikeX: 1 },
  { name: "D-sparse", base: 500, slope: 0, weekend: 1, sigma: 0.3, pZero: 0.35, pSpike: 0, spikeX: 1 },
  { name: "E-spiky", base: 350, slope: 0, weekend: 1, sigma: 0.25, pZero: 0.1, pSpike: 0.1, spikeX: 5 },
];

const shiftDay = (date: string, days: number) => {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function generate(p: Profile, rand: () => number) {
  return Array.from({ length: TRAIN_DAYS + TEST_DAYS }, (_, i) => {
    const date = shiftDay(START, i);
    const dow = new Date(date + "T00:00:00Z").getUTCDay();
    if (rand() < p.pZero) return { date, amount: 0, oneOff: 0, count: 0 };
    let amount = (p.base + p.slope * i) * (dow === 0 || dow === 6 ? p.weekend : 1);
    amount *= Math.exp(p.sigma * normal(rand));
    // A spike is modelled as one extra one-off transaction the user later marks "occasional".
    const oneOff = rand() < p.pSpike ? Math.round(amount * (p.spikeX - 1) * 100) / 100 : 0;
    const normalPart = Math.round(amount * 100) / 100;
    return { date, amount: normalPart + oneOff, oneOff, count: 1 + Math.floor(rand() * 3) + (oneOff ? 1 : 0) };
  });
}

const n = (v: string) => Number(v);
const forecast7 = (train: number[], alpha: string, beta: string) =>
  holt(train.map((v) => v.toFixed(2)), alpha, beta).amounts.map(n);

// 1-day-ahead MAE/MSE on training days 8..28 (the first 7 days only initialise Holt).
function oneStepError(train: number[], alpha: string, beta: string) {
  let abs = 0,
    sq = 0,
    k = 0;
  for (let t = 7; t < train.length; t++) {
    const e = train[t]! - forecast7(train.slice(0, t), alpha, beta)[0]!;
    abs += Math.abs(e);
    sq += e * e;
    k++;
  }
  return { mae: abs / k, mse: sq / k };
}
// Grid 0.05..0.95 step 0.05; ties broken by MSE, then smaller alpha, then smaller beta.
function tune(train: number[]) {
  const grid = Array.from({ length: 19 }, (_, i) => ((i + 1) * 0.05).toFixed(2));
  let best: { alpha: string; beta: string; mae: number; mse: number } | undefined;
  for (const alpha of grid)
    for (const beta of grid) {
      const { mae, mse } = oneStepError(train, alpha, beta);
      if (!best || mae < best.mae - 1e-9 || (Math.abs(mae - best.mae) <= 1e-9 && mse < best.mse - 1e-9))
        best = { alpha, beta, mae, mse };
    }
  return best!;
}

// Experiment only (k is NOT a locked project value): cap training days above
// median + k * 1.4826 * MAD (robust z-score scale) before Holt. Test actuals stay raw.
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
function capSpikes(train: number[], k: number) {
  const med = median(train);
  const mad = median(train.map((v) => Math.abs(v - med)));
  if (mad === 0) return train;
  const cap = med + k * 1.4826 * mad;
  return train.map((v) => Math.min(v, cap));
}
const CAP_KS = [3, 4, 5];

function metrics(actual: number[], pred: number[]) {
  const err = actual.map((a, i) => a - pred[i]!);
  const total7Actual = actual.reduce((s, a) => s + a, 0);
  const total7Pred = pred.reduce((s, p) => s + p, 0);
  const sumAbs = err.reduce((s, e) => s + Math.abs(e), 0);
  const sumActual = actual.reduce((s, a) => s + a, 0);
  const mapeDays = actual.map((a, i) => (a === 0 ? null : Math.abs(err[i]!) / a)).filter((v): v is number => v !== null);
  return {
    MAE: sumAbs / actual.length,
    RMSE: Math.sqrt(err.reduce((s, e) => s + e * e, 0) / actual.length),
    MAPE: mapeDays.length ? (mapeDays.reduce((s, v) => s + v, 0) / mapeDays.length) * 100 : null,
    mapeSkippedDays: actual.length - mapeDays.length,
    accuracy: sumActual > 0 ? 100 - (sumAbs / sumActual) * 100 : null,
    // 7-day total: one error on the summed week, as the page shows it.
    total7Accuracy: total7Actual > 0 ? 100 - (Math.abs(total7Actual - total7Pred) / total7Actual) * 100 : null,
  };
}

// FPP3 8.2 book-style Holt, independent of project code: estimate alpha, betaStar, l0, b0
// together by minimising SSE of 1-step errors over all training days; no clipping.
// For fixed (alpha, betaStar) every forecast is affine in (l0, b0), so l0/b0 are solved
// exactly by 2x2 least squares; alpha/betaStar are searched on a 0..1 grid, step 0.01.
function fpp3Fit(y: number[]) {
  const run = (ys: number[], a: number, bs: number, l: number, b: number) => {
    const f: number[] = [];
    for (const yt of ys) {
      f.push(l + b);
      const prev = l;
      l = a * yt + (1 - a) * (l + b);
      b = bs * (l - prev) + (1 - bs) * b;
    }
    return { f, l, b };
  };
  const zeros = y.map(() => 0);
  let best = { sse: Infinity, a: 0, bs: 0, l0: 0, b0: 0 };
  for (let ai = 0; ai <= 100; ai++)
    for (let bi = 0; bi <= 100; bi++) {
      const a = ai / 100,
        bs = bi / 100;
      const base = run(y, a, bs, 0, 0).f,
        g1 = run(zeros, a, bs, 1, 0).f,
        g2 = run(zeros, a, bs, 0, 1).f;
      const r = y.map((v, t) => v - base[t]!);
      const s11 = g1.reduce((s, v) => s + v * v, 0),
        s22 = g2.reduce((s, v) => s + v * v, 0),
        s12 = g1.reduce((s, v, t) => s + v * g2[t]!, 0),
        r1 = g1.reduce((s, v, t) => s + v * r[t]!, 0),
        r2 = g2.reduce((s, v, t) => s + v * r[t]!, 0);
      const det = s11 * s22 - s12 * s12;
      if (Math.abs(det) < 1e-9) continue;
      const l0 = (r1 * s22 - r2 * s12) / det,
        b0 = (r2 * s11 - r1 * s12) / det;
      const sse = r.reduce((s, v, t) => s + (v - l0 * g1[t]! - b0 * g2[t]!) ** 2, 0);
      if (sse < best.sse) best = { sse, a, bs, l0, b0 };
    }
  const end = run(y, best.a, best.bs, best.l0, best.b0);
  return { ...best, forecast: Array.from({ length: TEST_DAYS }, (_, h) => end.l + (h + 1) * end.b) };
}
// Self-check: a perfect line must be fitted exactly (any alpha, l0/b0 recover it).
{
  const line = Array.from({ length: 20 }, (_, i) => 100 + 5 * i);
  const fit = fpp3Fit(line);
  if (fit.sse > 1e-6 || Math.abs(fit.forecast[0]! - 200) > 1e-6) throw Error("fpp3Fit self-check failed");
}

const rand = mulberry32(SEED);
const out = process.env.OUT ?? join(__dirname, "output");
mkdirSync(out, { recursive: true });
const dataRows = ["account,day,date,amount,transaction_count,split"];
const METHODS = ["tuned", "locked", "mean28", ...CAP_KS.map((k) => `cap${k}`), "excl", "fpp3"];
const dailyRows = ["account,day,date,actual," + METHODS.join(",")];
const metricRows = ["account,method,alpha,beta,MAE,RMSE,MAPE,MAPE_skipped_days,accuracy_pct,total7_accuracy_pct"];
const fmt = (v: number | null) => (v === null ? "n/a" : v.toFixed(2));
const summary: Record<string, ReturnType<typeof metrics>[]> = Object.fromEntries(METHODS.map((m) => [m, []]));

console.log("RANDOM SYNTHETIC DATA — functional check only, NOT evidence of real-user accuracy");
console.log(`seed=${SEED} train=days 1-${TRAIN_DAYS} test=days ${TRAIN_DAYS + 1}-${TRAIN_DAYS + TEST_DAYS}`);
console.log(`locked defaults in code: alpha=${FORECAST_RULE.defaultAlpha} betaStar=${FORECAST_RULE.defaultBetaStar}\n`);

for (const p of PROFILES) {
  const days = generate(p, rand);
  days.forEach((d, i) =>
    dataRows.push([p.name, i + 1, d.date, d.amount.toFixed(2), d.count, i < TRAIN_DAYS ? "train" : "test"].join(",")),
  );
  const train = days.slice(0, TRAIN_DAYS).map((d) => d.amount);
  const actual = days.slice(TRAIN_DAYS).map((d) => d.amount);
  const trainTx = days.slice(0, TRAIN_DAYS).reduce((s, d) => s + d.count, 0);
  const spend = days.slice(0, TRAIN_DAYS).map((d, i) => (d.count ? i : -1)).filter((i) => i >= 0);
  const span = spend.length ? spend[spend.length - 1]! - spend[0]! + 1 : 0;

  const best = tune(train);
  const preds: Record<string, number[]> = {
    tuned: forecast7(train, best.alpha, best.beta),
    locked: forecast7(train, FORECAST_RULE.defaultAlpha, FORECAST_RULE.defaultBetaStar),
    mean28: Array(TEST_DAYS).fill(train.reduce((s, v) => s + v, 0) / TRAIN_DAYS) as number[],
  };
  // Capped variants use the locked alpha/beta so only the input changes.
  for (const k of CAP_KS)
    preds[`cap${k}`] = forecast7(capSpikes(train, k), FORECAST_RULE.defaultAlpha, FORECAST_RULE.defaultBetaStar);
  // User-marked "occasional" one-offs removed from training only; the rest of that day stays.
  const trainNoOneOff = days.slice(0, TRAIN_DAYS).map((d) => d.amount - d.oneOff);
  preds.excl = forecast7(trainNoOneOff, FORECAST_RULE.defaultAlpha, FORECAST_RULE.defaultBetaStar);
  const book = fpp3Fit(train);
  preds.fpp3 = book.forecast;
  const oneOffs = days.flatMap((d, i) => (d.oneOff > 0 ? [i + 1] : []));
  console.log(`== ${p.name}  (training: ${trainTx} transactions, span ${span} days → production gate ${trainTx >= 30 && span >= 30 ? "PASS" : "FAIL"}; bypassed)`);
  console.log(`   tuned alpha=${best.alpha} beta=${best.beta} (1-step train MAE ${best.mae.toFixed(2)})`);
  console.log(`   fpp3 alpha=${book.a} betaStar=${book.bs} l0=${book.l0.toFixed(2)} b0=${book.b0.toFixed(2)} (train SSE-optimal)`);
  console.log("   day  date        actual " + METHODS.map((m) => m.padStart(8)).join(" "));
  actual.forEach((a, i) => {
    const day = TRAIN_DAYS + i + 1;
    const date = days[TRAIN_DAYS + i]!.date;
    console.log(
      `   ${String(day).padStart(3)}  ${date} ${a.toFixed(2).padStart(8)} ` + METHODS.map((m) => preds[m]![i]!.toFixed(2).padStart(8)).join(" "),
    );
    dailyRows.push([p.name, day, date, a.toFixed(2), ...METHODS.map((m) => preds[m]![i]!.toFixed(2))].join(","));
  });
  for (const [method, pred] of Object.entries(preds)) {
    const m = metrics(actual, pred);
    summary[method]!.push(m);
    const [a, b] =
      method === "tuned" ? [best.alpha, best.beta] : method === "mean28" ? ["-", "-"] : method === "fpp3" ? [String(book.a), String(book.bs)] : [FORECAST_RULE.defaultAlpha, FORECAST_RULE.defaultBetaStar];
    metricRows.push([p.name, method, a, b, fmt(m.MAE), fmt(m.RMSE), fmt(m.MAPE), m.mapeSkippedDays, fmt(m.accuracy), fmt(m.total7Accuracy)].join(","));
    console.log(
      `   ${method.padEnd(7)} MAE ${fmt(m.MAE).padStart(8)}  RMSE ${fmt(m.RMSE).padStart(8)}  MAPE ${fmt(m.MAPE).padStart(7)}% (skipped ${m.mapeSkippedDays})  accuracy ${fmt(m.accuracy)}%  total7 ${fmt(m.total7Accuracy)}%`,
    );
  }
  if (oneOffs.length) {
    // Second view: score against the user's normal spend (test one-offs removed too).
    const actualNormal = days.slice(TRAIN_DAYS).map((d) => d.amount - d.oneOff);
    console.log(`   one-off days (marked occasional): ${oneOffs.join(", ")}`);
    for (const method of ["locked", "excl"]) {
      const m = metrics(actualNormal, preds[method]!);
      console.log(`   vs normal-only actual: ${method.padEnd(7)} MAE ${fmt(m.MAE)}  accuracy ${fmt(m.accuracy)}%  total7 ${fmt(m.total7Accuracy)}%`);
    }
  }
  console.log("");
}

console.log("== Mean across 5 accounts (simple average of per-account metrics; MAPE over accounts with a value)");
for (const [method, list] of Object.entries(summary)) {
  const avg = (f: (m: ReturnType<typeof metrics>) => number | null) => {
    const v = list.map(f).filter((x): x is number => x !== null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const skipped = list.reduce((s, m) => s + m.mapeSkippedDays, 0);
  console.log(
    `   ${method.padEnd(7)} MAE ${fmt(avg((m) => m.MAE)).padStart(8)}  RMSE ${fmt(avg((m) => m.RMSE)).padStart(8)}  MAPE ${fmt(avg((m) => m.MAPE)).padStart(7)}% (skipped ${skipped} days total)  accuracy ${fmt(avg((m) => m.accuracy))}%  total7 ${fmt(avg((m) => m.total7Accuracy))}%`,
  );
  metricRows.push(["MEAN", method, "", "", fmt(avg((m) => m.MAE)), fmt(avg((m) => m.RMSE)), fmt(avg((m) => m.MAPE)), skipped, fmt(avg((m) => m.accuracy)), fmt(avg((m) => m.total7Accuracy))].join(","));
}

writeFileSync(join(out, "synthetic_data.csv"), dataRows.join("\n") + "\n");
writeFileSync(join(out, "daily_actual_vs_forecast.csv"), dailyRows.join("\n") + "\n");
writeFileSync(join(out, "metrics.csv"), metricRows.join("\n") + "\n");
console.log(`\nCSV written to ${out}`);
