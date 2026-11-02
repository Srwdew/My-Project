// Stage D add-on (added after the first results, see docs/FORECAST_REAL_DATA_BACKTEST.md 3.4b): does a model
// forecast the 7-day total in a way R1 can use? Reads the JSONL dumps written by backtest-real-data.ts; no refit.
// Metric 4 (heavy-week hit rate) was declared the deciding metric for the app before these numbers were seen.
// Usage (repo root): backend/node_modules/.bin/tsx scripts/forecast-experiment/bias.ts moneydata berka-no-holt
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type P = { set: string; account: string; origin: number; model: string; actual: number; pred: number };
type O = { set: string; account: string; origin: number; trainWeekMedian: number | null };
const OUT = join(__dirname, "output");
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (a: number, b: number) => (b ? `${r2((a / b) * 100)}% (${a}/${b})` : "—");
const lines = <T>(f: string) => readFileSync(join(OUT, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as T);

/** Per-origin 7-day totals for one model, joined to the training "heavy week" line. */
export function metrics(weeks: { a: number; f: number; line: number | null }[]) {
  const n = weeks.length, sumA = weeks.reduce((s, w) => s + w.a, 0), sumE = weeks.reduce((s, w) => s + (w.f - w.a), 0);
  const heavy = weeks.filter((w) => w.line !== null && w.a > w.line);
  return {
    n,
    zero: weeks.filter((w) => w.f === 0).length,
    bias: sumA ? sumE / n / (sumA / n) : null,
    under: weeks.filter((w) => w.f < w.a).length,
    heavy: heavy.length,
    hit: heavy.filter((w) => w.f > w.line!).length,
  };
}

function report(tag: string) {
  const pts = lines<P>(`points-${tag}.jsonl`), ors = lines<O>(`origins-${tag}.jsonl`);
  const line = new Map(ors.map((o) => [`${o.set}|${o.account}|${o.origin}`, o.trainWeekMedian]));
  const out = [`## ${tag}`];
  for (const set of [...new Set(pts.map((p) => p.set))]) {
    out.push(`\n### ${set}`, "| model | origins | forecast 7-day total = 0 | bias (mean error ÷ mean actual) | forecast < actual | heavy weeks | **heavy weeks seen (forecast > training median week)** |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const model of [...new Set(pts.map((p) => p.model))]) {
      const w = new Map<string, { a: number; f: number; line: number | null }>();
      for (const p of pts) {
        if (p.set !== set || p.model !== model) continue;
        const k = `${p.set}|${p.account}|${p.origin}`, x = w.get(k) ?? { a: 0, f: 0, line: line.get(k) ?? null };
        x.a += p.actual; x.f += p.pred; w.set(k, x);
      }
      // Cents: sums of rounded daily values compared at 0.005 so float noise never counts as "under".
      const m = metrics([...w.values()].map((x) => ({ a: r2(x.a), f: r2(x.f), line: x.line })));
      out.push(`| ${model} | ${m.n} | ${pct(m.zero, m.n)} | ${m.bias === null ? "—" : r2(m.bias * 100) + "%"} | ${pct(m.under, m.n)} | ${m.heavy} | ${pct(m.hit, m.heavy)} |`);
    }
  }
  return out.join("\n");
}

if (require.main === module) {
  // Self-check: a model that always says 0 sees no heavy week, is always under, bias -100%.
  const s = metrics([{ a: 100, f: 0, line: 50 }, { a: 10, f: 0, line: 50 }]);
  assert.deepEqual([s.zero, s.under, s.heavy, s.hit, s.bias], [2, 2, 1, 0, -1]);
  const text = ["# R1 usability of 7-day totals", ...process.argv.slice(2).map(report)].join("\n\n");
  writeFileSync(join(OUT, "bias.md"), text + "\n");
  console.log(text);
}
