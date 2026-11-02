// Stage B: walk-forward backtest of the production forecast on real, citable data (MoneyData, Berka).
// Same protocol as backend/tests/forecast.benchmark.ts (total-walk-forward-v2): production buildForecast (Holt,
// Forecast Gate 30/30, horizon 7, fixed defaults < 42 days / inner validation >= 42), first cutoff = day index 29
// from the account's first expense, step 14. Confirmed extension: cutoffs continue to the end of the data (the
// first 18 are also reported alone). Baselines: the protocol's seasonal-naive and mean-7, plus naive-1.
// Nothing is tuned. Usage (repo root):
//   backend/node_modules/.bin/tsx scripts/forecast-experiment/backtest-real-data.ts moneydata
//   backend/node_modules/.bin/tsx scripts/forecast-experiment/backtest-real-data.ts berka [sampleSize] [seed]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildForecast, totalSeries, shiftDay } from "../../backend/src/lib/expenseForecast";
import { MODEL_VERSION, FORECAST_RULE } from "../../backend/src/lib/holt";
import { fixtureInput, type Sample } from "../../backend/tests/forecast.fixture";
import { baseline, PROTOCOL } from "../../backend/tests/forecast.benchmark";
import { loadMoneyData, loadBerka } from "./explore-real-data";
import { median7, holtWintersTuned, holtWintersFixed, theta } from "./models";

// Stage D adds median-7, weekly seasonal naive (the protocol's "seasonal-naive" already repeats the last 7 days,
// i.e. the same weekday one week earlier), Holt-Winters tuned / fixed and Theta. HW_STEP=0.2 shrinks the HW grid.
const MODELS = ["holt", "naive-1", "mean-7", "median-7", "seasonal-naive", "hw-tuned", "hw-fixed", "theta"] as const;
const HW_STEP = Number(process.env.HW_STEP ?? "0.1");
type Model = (typeof MODELS)[number];
// Berka drops hw-tuned: no weekly season was found there (0/95 accounts), so a 1,331-point grid would fit noise.
let ACTIVE: readonly Model[] = MODELS;
type Point = { account: string; origin: number; model: Model; h: number; date: string; actual: number; pred: number };
type Origin = {
  account: string; origin: number; scale: number | null; mode: string; cutoff: string;
  scale7: number | null; scaleBlock: number | null; // sensitivity scales, from the training series only
  hw: { alpha: number; beta: number; gamma: number } | null; theta: { alpha: number; mode: string };
  trainWeekMedian: number | null; // median of non-overlapping 7-day training totals: the "heavy week" line for the R1 check
};
// Every forecast and origin is also written to output/ (JSONL) so later metrics need no rerun. DUMP_SET labels the definition.
export const DUMP: { set: string; points: Point[]; origins: Origin[] }[] = [];
let DUMP_SET = "";
// Sensitivity: MoneyData dates are bank posting dates (no Sat/Sun rows), so Sat+Sun+Mon form one block keyed by its Monday.
const blockKey = (d: string) => { const w = new Date(d + "T00:00:00Z").getUTCDay(); return w === 6 ? shiftDay(d, 2) : w === 0 ? shiftDay(d, 1) : d; };
const blockSize = (key: string) => (new Date(key + "T00:00:00Z").getUTCDay() === 1 ? 3 : 1);
/** Sums per complete block (all member days present) in date order. */
function blocks(days: { date: string; v: number }[]) {
  const m = new Map<string, { v: number; n: number }>();
  for (const d of days) { const k = blockKey(d.date), b = m.get(k) ?? { v: 0, n: 0 }; b.v += d.v; b.n++; m.set(k, b); }
  return [...m].filter(([k, b]) => b.n === blockSize(k)).sort(([a], [b]) => a.localeCompare(b)).map(([k, b]) => ({ key: k, v: b.v }));
}
const meanAbsDiff = (v: number[]) => (v.length > 1 ? v.slice(1).reduce((a, x, i) => a + Math.abs(x - v[i]!), 0) / (v.length - 1) : 0);
const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86400000;
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[n >> 1]! : (s[n / 2 - 1]! + s[n / 2]!) / 2) : NaN; };
const quantile = (v: number[], q: number) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]! : NaN; };

/** Walk-forward over one account's expense rows; returns scored points, origin metadata and coverage. */
export function walkForward(account: string, rows: Sample[]) {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0]!.date, last = sorted.at(-1)!.date;
  const byDay = new Map<string, number>();
  for (const r of sorted) byDay.set(r.date, (byDay.get(r.date) ?? 0) + Number(r.amount));
  const points: Point[] = [], origins: Origin[] = [];
  let unavailable = 0;
  for (let k = 0; ; k++) {
    const cutoff = shiftDay(first, PROTOCOL.firstCutoffIndex + k * PROTOCOL.step);
    if (shiftDay(cutoff, 7) > last) break;
    const input = fixtureInput(sorted.filter((r) => r.date <= cutoff), shiftDay(cutoff, 1));
    // SKIP_HOLT: same Forecast Gate as buildForecast (count and inclusive span), without fitting Holt.
    const h0 = input.history, gateOk = h0.transactionCount >= FORECAST_RULE.minTransactions && !!h0.firstDate && !!h0.lastDate
      && Math.round((Date.parse(h0.lastDate) - Date.parse(h0.firstDate)) / DAY) + 1 >= FORECAST_RULE.minObservedDays;
    const view = ACTIVE.includes("holt") ? buildForecast(input) : null;
    if (view ? !view.summary.daily : !gateOk) { unavailable++; continue; }
    const series = totalSeries(input.rows, cutoff, input.history.firstDate).series.map(Number);
    // MASE scale (Hyndman & Koehler 2006): in-sample MAE of the one-step naive forecast on the training series.
    const diffs = series.slice(1).map((v, i) => Math.abs(v - series[i]!));
    const scale = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
    // Sensitivity scales: naive on non-overlapping 7-day sums ending at the cutoff, and naive on complete blocks.
    const weeks = Array.from({ length: Math.floor(series.length / 7) }, (_, i) => series.slice(series.length - 7 * (i + 1), series.length - 7 * i).reduce((a, b) => a + b, 0)).reverse();
    const s7 = meanAbsDiff(weeks), sb = meanAbsDiff(blocks(series.map((v, i) => ({ date: shiftDay(cutoff, i - series.length + 1), v }))).map((b) => b.v));
    const tuned = ACTIVE.includes("hw-tuned") ? holtWintersTuned(series, HW_STEP) : { forecast: [], params: null }, th = theta(series);
    origins.push({ account, origin: k, scale: scale > 0 ? scale : null, mode: view?.parameterMode ?? "holt_skipped", cutoff,
      scale7: s7 > 0 ? s7 : null, scaleBlock: sb > 0 ? sb : null, hw: tuned.params, theta: { alpha: th.alpha, mode: th.mode },
      trainWeekMedian: weeks.length ? median(weeks) : null });
    const preds: Record<Model, number[]> = {
      holt: view ? view.summary.daily!.map((d) => Number(d.amount)) : [],
      "naive-1": Array(7).fill(r2(Math.max(series.at(-1)!, 0))),
      "mean-7": baseline(series.map((v) => v.toFixed(2)), "mean-7").map(Number),
      "median-7": median7(series),
      "seasonal-naive": baseline(series.map((v) => v.toFixed(2)), "seasonal-naive").map(Number),
      "hw-tuned": tuned.forecast,
      "hw-fixed": holtWintersFixed(series),
      theta: th.forecast,
    };
    for (const model of ACTIVE)
      for (let h = 1; h <= 7; h++)
        points.push({ account, origin: k, model, h, date: shiftDay(cutoff, h), actual: r2(byDay.get(shiftDay(cutoff, h)) ?? 0), pred: preds[model][h - 1]! });
  }
  DUMP.push({ set: DUMP_SET, points, origins });
  const span = Math.round((Date.parse(last) - Date.parse(first)) / DAY) + 1;
  const daily = Array.from({ length: span }, (_, i) => byDay.get(shiftDay(first, i)) ?? 0);
  return { points, origins, unavailable, meanDaily: daily.reduce((a, b) => a + b, 0) / span, medianDaily: median(daily) };
}

/** Error summary for one model over a set of points (and the origins they came from). */
function score(points: Point[], origins: Origin[], model: Model) {
  const p = points.filter((x) => x.model === model);
  if (!p.length) return null;
  const err = p.map((x) => x.actual - x.pred);
  const weeks = new Map<string, { a: number; f: number }>();
  for (const x of p) { const k = x.account + "|" + x.origin, w = weeks.get(k) ?? { a: 0, f: 0 }; w.a += x.actual; w.f += x.pred; weeks.set(k, w); }
  const werr = [...weeks.values()].map((w) => w.a - w.f);
  const positive = [...weeks.values()].filter((w) => w.a > 0);
  const scaleOf = new Map(origins.map((o) => [o.account + "|" + o.origin, o.scale]));
  const mase: number[] = [];
  for (const [k] of weeks) {
    const s = scaleOf.get(k); if (!s) continue;
    const e = p.filter((x) => x.account + "|" + x.origin === k).map((x) => Math.abs(x.actual - x.pred));
    mase.push(e.reduce((a, b) => a + b, 0) / e.length / s);
  }
  return {
    n: p.length, weeks: weeks.size,
    mae: r2(err.reduce((a, b) => a + Math.abs(b), 0) / err.length),
    rmse: r2(Math.sqrt(err.reduce((a, b) => a + b * b, 0) / err.length)),
    mae7: r2(werr.reduce((a, b) => a + Math.abs(b), 0) / werr.length),
    rmse7: r2(Math.sqrt(werr.reduce((a, b) => a + b * b, 0) / werr.length)),
    // Weekly MAPE only over weeks with a positive actual total; daily MAPE is not defined on zero-actual days.
    mape7: positive.length ? r2((positive.reduce((a, w) => a + Math.abs(w.a - w.f) / w.a, 0) / positive.length) * 100) : null,
    mape7Excluded: weeks.size - positive.length,
    mase: mase.length ? Number((mase.reduce((a, b) => a + b, 0) / mase.length).toFixed(3)) : null,
    maseOrigins: mase.length,
  };
}
/** Sensitivity scores (never merged with the daily ranking): MASE of the 7-day total, and MASE over complete
 *  Sat+Sun+Mon blocks / single weekdays inside the horizon. Each scale comes from that origin's training series. */
function sensitivity(points: Point[], origins: Origin[], model: Model) {
  const by = new Map<string, Point[]>();
  for (const x of points) if (x.model === model) (by.get(x.account + "|" + x.origin) ?? by.set(x.account + "|" + x.origin, []).get(x.account + "|" + x.origin)!).push(x);
  const o = new Map(origins.map((v) => [v.account + "|" + v.origin, v]));
  const m7: number[] = [], mb: number[] = [];
  for (const [k, p] of by) {
    const org = o.get(k)!;
    if (org.scale7) m7.push(Math.abs(p.reduce((a, x) => a + x.actual - x.pred, 0)) / org.scale7);
    const ba = blocks(p.map((x) => ({ date: x.date, v: x.actual }))), bf = blocks(p.map((x) => ({ date: x.date, v: x.pred })));
    if (org.scaleBlock && ba.length) mb.push(ba.reduce((a, b, i) => a + Math.abs(b.v - bf[i]!.v), 0) / ba.length / org.scaleBlock);
  }
  const avg = (v: number[]) => (v.length ? Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(3)) : null);
  return { mase7: avg(m7), maseBlock: avg(mb), n7: m7.length, nb: mb.length };
}

/** How stable the tuned HW parameters are from one origin to the next (per account, in origin order). */
function hwStability(origins: Origin[]) {
  const t = origins.filter((o) => o.hw);
  const q = (v: number[]) => `median ${r2(median(v))} (IQR ${r2(quantile(v, 0.25))}–${r2(quantile(v, 0.75))})`;
  let pairs = 0, changed = 0, jump = 0;
  for (let i = 1; i < t.length; i++) {
    if (t[i]!.account !== t[i - 1]!.account) continue;
    const a = t[i]!.hw!, b = t[i - 1]!.hw!; pairs++;
    if (a.alpha !== b.alpha || a.beta !== b.beta || a.gamma !== b.gamma) changed++;
    if (Math.max(Math.abs(a.alpha - b.alpha), Math.abs(a.beta - b.beta), Math.abs(a.gamma - b.gamma)) >= 0.5) jump++;
  }
  const theta = origins.reduce((m: Record<string, number>, o) => ((m[o.theta.mode] = (m[o.theta.mode] ?? 0) + 1), m), {});
  const thetaLine = `Theta deseasonalisation: ${JSON.stringify(theta)} · SES alpha (fitted in-sample) ${q(origins.map((o) => o.theta.alpha))}`;
  if (!ACTIVE.includes("hw-tuned")) return `HW tuned: not run on this dataset (no weekly season found); hw-fixed 0.3/0.1/0.3 only\n` + thetaLine;
  return [`HW tuned on ${t.length}/${origins.length} origins (rest < 42 days → fixed 0.3/0.1/0.3), grid step ${HW_STEP}`,
    `alpha ${q(t.map((o) => o.hw!.alpha))} · beta ${q(t.map((o) => o.hw!.beta))} · gamma ${q(t.map((o) => o.hw!.gamma))}`,
    `consecutive origins: parameters changed ${changed}/${pairs} (${r2((changed / Math.max(pairs, 1)) * 100)}%) · any parameter moved >= 0.5: ${jump}/${pairs} (${r2((jump / Math.max(pairs, 1)) * 100)}%)`,
    thetaLine].join("\n");
}
const sensTable = (pts: Point[], ors: Origin[]) => table(["model", "7-day total MASE", "Sat+Sun+Mon block MASE", "origins (7-day / block)"],
  ACTIVE.map((m) => { const s = sensitivity(pts, ors, m); return [m, s.mase7, s.maseBlock, `${s.n7} / ${s.nb}`]; }));
const table = (head: string[], rows: (string | number | null)[][]) =>
  [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map((v) => v ?? "—").join(" | ")} |`)].join("\n");

// ---------- MoneyData: one account, definitions M1 (primary) and M3 (sensitivity) ----------
type MoneyRow = ReturnType<typeof loadMoneyData>["parsed"][number];
const OWN = /^(Savings|Investment|Account transfer|Safety Deposit Return)$/;
const m1 = (r: MoneyRow) => r.debit > 0 && !OWN.test(r["Category"]!.trim()) && !/SHARE DEALINGS/.test(r["Transaction Description"]!);
/** MoneyData expense definitions; shared with the weekly-rhythm check so both read the same rows. */
export const MONEYDATA_DEFS = { M1: m1, M3: (r: MoneyRow) => m1(r) && !/^(Mortgage|Bills)$/.test(r["Category"]!.trim()) };

function moneyData() {
  const { parsed } = loadMoneyData();
  const defs = MONEYDATA_DEFS;
  const out = [`# MoneyData (GBP, one account) — ${MODEL_VERSION}`, "Rule: " + JSON.stringify(FORECAST_RULE)];
  for (const [name, f] of Object.entries(defs)) {
    const rows: Sample[] = parsed.filter(f).map((r) => ({ date: r.date, amount: r.debit.toFixed(2), count: 1 }));
    DUMP_SET = name;
    const w = walkForward("moneydata", rows);
    out.push(`\n## ${name}: ${rows.length} expense rows · daily mean ${r2(w.meanDaily)} · daily median ${r2(w.medianDaily)} GBP · origins scored ${w.origins.length}, unavailable ${w.unavailable}`);
    for (const [label, keep] of [["all origins", () => true], ["first 18 origins (comparable to the synthetic report)", (o: number) => o < 18]] as const) {
      const pts = w.points.filter((x) => keep(x.origin)), ors = w.origins.filter((o) => keep(o.origin));
      out.push(`\n### ${label}\n` + table(["model", "daily pts", "MAE", "RMSE", "MAE/mean", "MAE/median", "MASE", "7-day MAE", "7-day RMSE", "7-day MAPE % (weeks >0)"],
        ACTIVE.map((m) => { const s = score(pts, ors, m)!; return [m, s.n, s.mae, s.rmse, r2(s.mae / w.meanDaily), r2(s.mae / w.medianDaily), s.mase, s.mae7, s.rmse7, s.mape7 === null ? null : `${s.mape7} (${s.weeks - s.mape7Excluded}/${s.weeks})`]; })));
    }
    out.push(`\n### sensitivity (posting-calendar check, all origins) — separate from the daily MASE ranking\n` + sensTable(w.points, w.origins));
    out.push("\n" + hwStability(w.origins));
    out.push(`\nParameter modes: ${JSON.stringify(w.origins.reduce((m: Record<string, number>, o) => ((m[o.mode] = (m[o.mode] ?? 0) + 1), m), {}))}`);
    // Where Holt does worst: the weeks with the largest absolute 7-day error, next to the mean-7 baseline.
    const week = (model: Model, o: number) => w.points.filter((x) => x.model === model && x.origin === o);
    const worst = w.origins.map((o) => ({ o: o.origin, a: week("holt", o.origin).reduce((s, x) => s + x.actual, 0), f: week("holt", o.origin).reduce((s, x) => s + x.pred, 0), m7: week("mean-7", o.origin).reduce((s, x) => s + x.pred, 0) }))
      .sort((x, y) => Math.abs(y.a - y.f) - Math.abs(x.a - x.f)).slice(0, 5);
    // Spike frequency: how often Holt's 7-day total runs far above mean-7's and above what was actually spent.
    const weeksAll = w.origins.map((o) => ({ a: week("holt", o.origin).reduce((s, x) => s + x.actual, 0), f: week("holt", o.origin).reduce((s, x) => s + x.pred, 0), m7: week("mean-7", o.origin).reduce((s, x) => s + x.pred, 0) }));
    const share = (f: (x: (typeof weeksAll)[number]) => boolean) => `${weeksAll.filter(f).length}/${weeksAll.length} (${r2((weeksAll.filter(f).length / weeksAll.length) * 100)}%)`;
    out.push(`Holt 7-day total vs mean-7: >2x ${share((x) => x.f > 2 * x.m7)} · >5x ${share((x) => x.f > 5 * x.m7)} · >10x ${share((x) => x.f > 10 * x.m7)}`);
    out.push(`Holt 7-day total vs actual: >2x ${share((x) => x.f > 2 * x.a)} · >5x ${share((x) => x.f > 5 * x.a)} · >10x ${share((x) => x.f > 10 * x.a)} | mean-7 vs actual >2x ${share((x) => x.m7 > 2 * x.a)}`);
    out.push("Worst Holt weeks (origin start date: actual / Holt / mean-7, GBP): " + worst.map((x) => `${shiftDay(rows.map((r) => r.date).sort()[0]!, PROTOCOL.firstCutoffIndex + x.o * PROTOCOL.step + 1)}: ${r2(x.a)} / ${r2(x.f)} / ${r2(x.m7)}`).join(" · "));
  }
  return out.join("\n");
}

// ---------- Berka: seeded account sample, D1 (primary) and D1 minus unlabelled transfers (sensitivity) ----------
type BerkaRow = ReturnType<typeof loadBerka>["tx"][number];
export const BERKA_DEFS = {
  D1: (t: BerkaRow) => t.type === "VYDAJ" || t.type === "VYBER",
  "D1-no-unlabelled-transfers": (t: BerkaRow) => (t.type === "VYDAJ" || t.type === "VYBER") && !(t.op === "PREVOD NA UCET" && t.k === "(blank)"),
};
/** Deterministic sample (mulberry32 shuffle of sorted ids): compute budget only, chosen before any scoring. */
export function berkaSample(tx: BerkaRow[], sampleSize: number, seed: number) {
  let a = seed >>> 0; const rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ids = [...new Set(tx.map((t) => t.account))].sort((x, y) => Number(x) - Number(y));
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ids[i], ids[j]] = [ids[j]!, ids[i]!]; }
  return { sample: new Set(ids.slice(0, sampleSize)), total: ids.length };
}

function berka(sampleSize: number, seed: number) {
  const { tx } = loadBerka();
  const defs = BERKA_DEFS;
  ACTIVE = ACTIVE.filter((m) => m !== "hw-tuned");
  const { sample, total } = berkaSample(tx, sampleSize, seed);
  const out = [`# Berka (CZK) — seeded sample of ${sample.size} of ${total} accounts (seed ${seed}) — ${MODEL_VERSION}`];
  for (const [name, f] of Object.entries(defs)) {
    DUMP_SET = name;
    const per = new Map<string, Sample[]>();
    for (const t of tx) if (sample.has(t.account) && f(t)) (per.get(t.account) ?? per.set(t.account, []).get(t.account)!).push({ date: t.date, amount: t.amount.toFixed(2), count: 1 });
    const accounts: { id: string; mean: number; s: Record<Model, ReturnType<typeof score>> }[] = [];
    const pooled: Point[] = [], pooledOrigins: Origin[] = []; let unavailable = 0;
    // ACCOUNT_LIMIT: timing runs only (first N accounts of the same seeded sample); progress goes to stderr.
    const limit = Number(process.env.ACCOUNT_LIMIT ?? Infinity), started = Date.now();
    for (const [id, rows] of [...per].slice(0, limit)) {
      const w = walkForward(id, rows); unavailable += w.unavailable;
      console.error(`${name} account ${id}: ${w.origins.length} origins · ${Math.round((Date.now() - started) / 1000)} s`);
      if (!w.origins.length) continue;
      pooled.push(...w.points); pooledOrigins.push(...w.origins);
      accounts.push({ id, mean: w.meanDaily, s: Object.fromEntries(ACTIVE.map((m) => [m, score(w.points, w.origins, m)])) as Record<Model, ReturnType<typeof score>> });
    }
    const dist = (v: number[]) => v.length ? `median ${r2(median(v))} · p25 ${r2(quantile(v, 0.25))} · p75 ${r2(quantile(v, 0.75))} · worst ${r2(Math.max(...v))}` : "—";
    out.push(`\n## ${name}: accounts with >=1 scored origin ${accounts.length} of ${per.size}; unavailable origins (gate) ${unavailable}`);
    out.push(table(["model", "per-account MASE", "MASE mean over all origins", "per-account MAE / mean daily", "pooled daily MAE", "pooled daily RMSE", "pooled 7-day MAE", "7-day MAPE % (weeks >0)"],
      ACTIVE.map((m) => { const p = score(pooled, pooledOrigins, m)!; return [m, dist(accounts.map((x) => x.s[m]?.mase).filter((v): v is number => v != null)), p.mase, dist(accounts.map((x) => x.s[m]!.mae / x.mean)), p.mae, p.rmse, p.mae7, p.mape7]; })));
    const bestBy = (m: Model) => accounts.filter((x) => ACTIVE.every((o) => (x.s[m]!.mase ?? Infinity) <= (x.s[o]!.mase ?? Infinity))).length;
    out.push("\nAccounts where the model has the lowest MASE (ties count for each): " + ACTIVE.map((m) => `${m} ${bestBy(m)}`).join(" · "));
    out.push(`\n### sensitivity — separate from the daily MASE ranking\n` + sensTable(pooled, pooledOrigins));
    out.push("\n" + hwStability(pooledOrigins));
    if (ACTIVE.includes("holt")) {
      out.push("\nHolt beats baseline (per account, lower daily MAE): " + ACTIVE.slice(1).map((m) => `${m} ${accounts.filter((x) => x.s.holt!.mae < x.s[m]!.mae).length}/${accounts.length}`).join(" · "));
      const worst = [...accounts].sort((x, y) => (y.s.holt!.mase ?? 0) - (x.s.holt!.mase ?? 0)).slice(0, 3);
      out.push("Worst Holt accounts by MASE: " + worst.map((x) => `${x.id} (MASE ${x.s.holt!.mase}, MAE/mean ${r2(x.s.holt!.mae / x.mean)})`).join(", "));
    }
    const first18 = pooled.filter((x) => x.origin < 18), first18o = pooledOrigins.filter((o) => o.origin < 18);
    out.push("First 18 origins, pooled daily MAE: " + ACTIVE.map((m) => `${m} ${score(first18, first18o, m)?.mae}`).join(" · "));
  }
  return out.join("\n");
}

if (require.main === module) {
  const [, , dataset = "moneydata", n = "200", seed = "20261031"] = process.argv;
  const started = Date.now();
  if (process.env.SKIP_HOLT === "1") ACTIVE = ACTIVE.filter((m) => m !== "holt");
  const report = dataset === "berka" ? berka(Number(n), Number(seed)) : moneyData();
  const dir = join(__dirname, "output"); mkdirSync(dir, { recursive: true });
  const tag = dataset + (process.env.SKIP_HOLT === "1" ? "-no-holt" : "");
  writeFileSync(join(dir, `real-${tag}.md`), report + "\n");
  // One JSON line per forecast point and per origin, labelled with its expense definition.
  writeFileSync(join(dir, `points-${tag}.jsonl`), DUMP.flatMap((d) => d.points.map((p) => JSON.stringify({ set: d.set, ...p }))).join("\n") + "\n");
  writeFileSync(join(dir, `origins-${tag}.jsonl`), DUMP.flatMap((d) => d.origins.map((o) => JSON.stringify({ set: d.set, ...o }))).join("\n") + "\n");
  console.log(report + `\n\n(elapsed ${Math.round((Date.now() - started) / 1000)} s)`);
}
