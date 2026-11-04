// Can the forecast chart follow weekdays without losing to production Theta? Same origins, same scales and same metrics as
// docs/FORECAST_REAL_DATA_BACKTEST.md: Theta and actuals come from the saved JSONL dumps; training series are rebuilt from the same rows.
// weekday-mean: mean of the same weekday over the last N = 8 weeks (declared before seeing results: 4 is one or two pay cycles of noise,
// 8 covers two months and still follows a change in habits; shorter history uses the weeks it has).
// theta-split: production Theta 7-day total, split by the account's weekday shares over its whole training series.
// Usage (repo root): backend/node_modules/.bin/tsx scripts/forecast-experiment/weekday-candidates.ts
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shiftDay } from "../../backend/src/lib/expenseForecast";
import { loadMoneyData, loadBerka } from "./explore-real-data";
import { BERKA_DEFS, MONEYDATA_DEFS } from "./backtest-real-data";
import { metrics } from "./bias";

const OUT = join(__dirname, "output"), N_WEEKS = 8;
const lines = <T>(f: string) => readFileSync(join(OUT, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as T);
type P = { set: string; account: string; origin: number; model: string; h: number; date: string; actual: number; pred: number };
type O = { set: string; account: string; origin: number; cutoff: string; scale: number | null; scale7: number | null; trainWeekMedian: number | null };
const wd = (d: string) => new Date(d + "T00:00:00Z").getUTCDay();

/** Zero-filled training series ending at the cutoff, as Theta sees it. */
export function trainSeries(byDay: Map<string, number>, first: string, cutoff: string) {
  const out: { date: string; v: number }[] = [];
  for (let d = first; d <= cutoff; d = shiftDay(d, 1)) out.push({ date: d, v: byDay.get(d) ?? 0 });
  return out;
}
export function weekdayMean(train: { date: string; v: number }[], dates: string[], weeks = N_WEEKS) {
  return dates.map((date) => {
    const same = train.filter((t) => wd(t.date) === wd(date)).slice(-weeks);
    return same.length ? same.reduce((a, t) => a + t.v, 0) / same.length : 0;
  });
}
export function thetaSplit(train: { date: string; v: number }[], dates: string[], total: number) {
  const sum = Array(7).fill(0) as number[], count = Array(7).fill(0) as number[];
  for (const t of train) { sum[wd(t.date)]! += t.v; count[wd(t.date)]!++; }
  const rate = sum.map((s, i) => (count[i] ? s / count[i]! : 0));
  const whole = dates.reduce((a, d) => a + rate[wd(d)]!, 0);
  return dates.map((d) => (whole > 0 ? (total * rate[wd(d)]!) / whole : total / dates.length));
}

type Week = { actual: number[]; pred: number[]; scale: number | null; scale7: number | null; line: number | null };
function summarize(weeks: Week[]) {
  const avg = (v: number[]) => (v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(3) : "—");
  const daily = weeks.filter((w) => w.scale).map((w) => w.actual.reduce((a, x, i) => a + Math.abs(x - w.pred[i]!), 0) / 7 / w.scale!);
  const seven = weeks.filter((w) => w.scale7).map((w) => Math.abs(w.actual.reduce((a, x, i) => a + x - w.pred[i]!, 0)) / w.scale7!);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const m = metrics(weeks.map((w) => ({ a: r2(w.actual.reduce((a, b) => a + b, 0)), f: r2(w.pred.reduce((a, b) => a + b, 0)), line: w.line })));
  return { daily: avg(daily), seven: avg(seven), hit: `${r2((m.hit / Math.max(m.heavy, 1)) * 100)}% (${m.hit}/${m.heavy})`, bias: m.bias === null ? "—" : r2(m.bias * 100) + "%", under: `${r2((m.under / m.n) * 100)}%`, n: m.n };
}

function run(set: string, tag: string, rowsOf: (account: string) => { date: string; amount: number }[]) {
  const points = lines<P>(`points-${tag}.jsonl`).filter((p) => p.set === set && p.model === "theta");
  const origins = lines<O>(`origins-${tag}.jsonl`).filter((o) => o.set === set);
  const theta = new Map<string, P[]>();
  for (const p of points) { const k = p.account + "|" + p.origin; if (!theta.has(k)) theta.set(k, []); theta.get(k)!.push(p); }
  const result: Record<string, Week[]> = { theta: [], "weekday-mean": [], "theta-split": [] };
  const cache = new Map<string, { first: string; byDay: Map<string, number> }>();
  for (const o of origins) {
    const p = theta.get(o.account + "|" + o.origin); if (!p) continue;
    p.sort((a, b) => a.h - b.h);
    if (!cache.has(o.account)) {
      const byDay = new Map<string, number>(), rows = rowsOf(o.account);
      for (const r of rows) byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.amount);
      cache.set(o.account, { first: rows.map((r) => r.date).sort()[0]!, byDay });
    }
    const { first, byDay } = cache.get(o.account)!;
    const train = trainSeries(byDay, first, o.cutoff), dates = p.map((x) => x.date), actual = p.map((x) => x.actual), base = { actual, scale: o.scale, scale7: o.scale7, line: o.trainWeekMedian };
    // Actuals must match the dump, or this run is not the same backtest.
    assert.ok(Math.abs(actual[0]! - (byDay.get(dates[0]!) ?? 0)) < 0.01, "actual mismatch " + o.account);
    const pred = p.map((x) => x.pred), total = pred.reduce((a, b) => a + b, 0);
    result.theta!.push({ ...base, pred });
    result["weekday-mean"]!.push({ ...base, pred: weekdayMean(train, dates) });
    result["theta-split"]!.push({ ...base, pred: thetaSplit(train, dates, total) });
  }
  const out = [`\n## ${set}`, "| model | origins | MASE daily | MASE 7-day | metric 4: heavy weeks seen | bias | under |", "|---|---|---|---|---|---|---|"];
  for (const [model, weeks] of Object.entries(result)) { const s = summarize(weeks); out.push(`| ${model} | ${s.n} | ${s.daily} | ${s.seven} | ${s.hit} | ${s.bias} | ${s.under} |`); }
  return out.join("\n");
}

if (require.main === module) {
  // Self-check: the split keeps the total exactly and follows the weekday shape.
  const t = Array.from({ length: 14 }, (_, i) => ({ date: shiftDay("2026-11-01", i), v: wd(shiftDay("2026-11-01", i)) === 6 ? 70 : 0 }));
  const dates = Array.from({ length: 7 }, (_, i) => shiftDay("2026-11-15", i));
  const split = thetaSplit(t, dates, 700);
  assert.equal(split.reduce((a, b) => a + b, 0), 700);
  assert.equal(split[dates.findIndex((d) => wd(d) === 6)], 700);
  assert.deepEqual(weekdayMean(t, dates).reduce((a, b) => a + b, 0), 70);

  const parts = [`# Weekday-shaped forecast candidates (N = ${N_WEEKS})`];
  const { parsed } = loadMoneyData();
  for (const [name, f] of Object.entries(MONEYDATA_DEFS)) parts.push(run(name, "moneydata", () => parsed.filter(f).map((r) => ({ date: r.date, amount: r.debit }))));
  const { tx } = loadBerka();
  for (const [name, f] of Object.entries(BERKA_DEFS)) {
    const per = new Map<string, { date: string; amount: number }[]>();
    for (const r of tx) if (f(r)) { if (!per.has(r.account)) per.set(r.account, []); per.get(r.account)!.push({ date: r.date, amount: r.amount }); }
    parts.push(run(name, "berka-no-holt", (a) => per.get(a) ?? []));
  }
  writeFileSync(join(OUT, "weekday-candidates.md"), parts.join("\n") + "\n");
  console.log(parts.join("\n"));
}
