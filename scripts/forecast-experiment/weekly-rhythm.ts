// Stage C: is there a day-of-week rhythm in daily spending? Checked before any seasonal model is scored.
// Same rows as the backtest (MONEYDATA_DEFS, BERKA_DEFS, berkaSample seed 20261031, 100 accounts), daily totals
// zero-filled from first to last expense. Three views per series:
//   1. day-of-week profile: mean spend on that weekday / mean spend over all days
//   2. Kruskal-Wallis across the 7 weekdays (tie-corrected), alpha 0.05, df 6
//   3. ACF at lag 7 against the 90% Bartlett bound 1.645*sqrt((1+2*sum r_k^2, k<7)/n) — the seasonality test
//      the Theta method uses (M3 convention) — and whether lag 7 is the largest |r| among lags 1..14
// Usage (repo root): backend/node_modules/.bin/tsx scripts/forecast-experiment/weekly-rhythm.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadMoneyData, loadBerka } from "./explore-real-data";
import { MONEYDATA_DEFS, BERKA_DEFS, berkaSample } from "./backtest-real-data";

const DAY = 86400000, ALPHA = 0.05, DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const r2 = (n: number) => Math.round(n * 100) / 100;
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b), n = s.length; return n % 2 ? s[n >> 1]! : (s[n / 2 - 1]! + s[n / 2]!) / 2; };

/** Zero-filled daily totals with each day's weekday (0 = Sunday). */
function daily(rows: { date: string; amount: number }[]) {
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.date, (by.get(r.date) ?? 0) + r.amount);
  const keys = [...by.keys()].sort(), out: { dow: number; v: number }[] = [];
  for (let t = Date.parse(keys[0]!); t <= Date.parse(keys.at(-1)!); t += DAY) out.push({ dow: new Date(t).getUTCDay(), v: by.get(new Date(t).toISOString().slice(0, 10)) ?? 0 });
  return out;
}

/** Kruskal-Wallis H with tie correction; p from chi-square df 6 (closed form for even df). */
export function kruskalWallis(groups: number[][]) {
  const all = groups.flatMap((g, i) => g.map((v) => ({ v, i }))).sort((a, b) => a.v - b.v), n = all.length;
  const rankSum = groups.map(() => 0); let ties = 0;
  for (let s = 0; s < n;) {
    let e = s; while (e + 1 < n && all[e + 1]!.v === all[s]!.v) e++;
    const rank = (s + e) / 2 + 1, t = e - s + 1; ties += t ** 3 - t;
    for (let k = s; k <= e; k++) rankSum[all[k]!.i]! += rank;
    s = e + 1;
  }
  const h0 = (12 / (n * (n + 1))) * groups.reduce((a, g, i) => a + (g.length ? rankSum[i]! ** 2 / g.length : 0), 0) - 3 * (n + 1);
  const c = 1 - ties / (n ** 3 - n), h = c > 0 ? h0 / c : 0, x = h / 2;
  return { h, p: Math.exp(-x) * (1 + x + (x * x) / 2) }; // P(chi2_6 > h)
}

function acf(v: number[], maxLag: number) {
  const n = v.length, m = v.reduce((a, b) => a + b, 0) / n, d = v.map((x) => x - m), c0 = d.reduce((a, b) => a + b * b, 0);
  return Array.from({ length: maxLag + 1 }, (_, k) => (c0 ? d.slice(k).reduce((a, x, i) => a + x * d[i]!, 0) / c0 : 0));
}

function analyse(rows: { date: string; amount: number }[]) {
  const s = daily(rows), v = s.map((x) => x.v), mean = v.reduce((a, b) => a + b, 0) / v.length;
  const groups = DOW.map((_, d) => s.filter((x) => x.dow === d).map((x) => x.v));
  const profile = groups.map((g) => (mean ? g.reduce((a, b) => a + b, 0) / g.length / mean : 0));
  const r = acf(v, 14), bound = 1.645 * Math.sqrt((1 + 2 * r.slice(1, 7).reduce((a, x) => a + x * x, 0)) / v.length);
  const top = r.slice(1).reduce((best, x, i) => (Math.abs(x) > Math.abs(r[best]!) ? i + 1 : best), 1);
  const zeroShare = groups.map((g) => g.filter((x) => x === 0).length / g.length);
  return { days: v.length, profile, kw: kruskalWallis(groups), r7: r[7]!, bound, acfSig: Math.abs(r[7]!) > bound, lag7Top: top === 7, topLag: top, zeroShare };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmtProfile = (p: number[]) => DOW.map((d, i) => `${d} ${r2(p[i]!)}`).join(" · ");
const order = (p: number[]) => DOW.map((d, i) => [d, p[i]!] as const).sort((a, b) => b[1] - a[1]).map(([d]) => d).join(" > ");

function report() {
  const out = ["# Weekly rhythm in daily spending", `Kruskal-Wallis alpha ${ALPHA} (df 6, tie-corrected) · ACF lag-7 90% Bartlett bound · profile = weekday mean / overall mean (1.00 = average day)`];
  const { parsed } = loadMoneyData();
  for (const [name, f] of Object.entries(MONEYDATA_DEFS)) {
    const a = analyse(parsed.filter(f).map((r) => ({ date: r.date, amount: r.debit })));
    out.push(`\n## MoneyData ${name} (${a.days} days)`,
      `profile: ${fmtProfile(a.profile)}`, `high → low: ${order(a.profile)}`,
      `share of zero days: ${DOW.map((d, i) => `${d} ${pct(a.zeroShare[i]!)}`).join(" · ")}`,
      `Kruskal-Wallis H ${r2(a.kw.h)}, p ${a.kw.p.toExponential(2)} → ${a.kw.p < ALPHA ? "weekdays differ" : "no evidence weekdays differ"}`,
      `ACF lag 7 = ${r2(a.r7)} vs bound ${r2(a.bound)} → ${a.acfSig ? "significant" : "not significant"}; largest |ACF| in lags 1..14 at lag ${a.topLag}`);
  }
  const { tx } = loadBerka(), { sample } = berkaSample(tx, 100, 20261031);
  for (const [name, f] of Object.entries(BERKA_DEFS)) {
    const per = new Map<string, { date: string; amount: number }[]>();
    for (const t of tx) if (sample.has(t.account) && f(t)) (per.get(t.account) ?? per.set(t.account, []).get(t.account)!).push({ date: t.date, amount: t.amount });
    // Forecast Gate on the whole series (>=30 rows, >=30 days), as the backtest needs at least one origin.
    const res = [...per.values()].filter((r) => r.length >= 30).map(analyse).filter((a) => a.days >= 30), n = res.length;
    const count = (f: (a: (typeof res)[number]) => boolean) => `${res.filter(f).length}/${n} (${pct(res.filter(f).length / n)})`;
    const tally = (pick: (p: number[]) => number) => DOW.map((d, i) => `${d} ${res.filter((a) => pick(a.profile) === i).length}`).join(" · ");
    const argmax = (p: number[]) => p.indexOf(Math.max(...p)), argmin = (p: number[]) => p.indexOf(Math.min(...p));
    const medProfile = DOW.map((_, i) => median(res.map((a) => a.profile[i]!)));
    out.push(`\n## Berka ${name} (${n} of ${per.size} sampled accounts pass the gate)`,
      `median profile across accounts: ${fmtProfile(medProfile)}`, `high → low (median): ${order(medProfile)}`,
      `highest weekday per account: ${tally(argmax)}`, `lowest weekday per account: ${tally(argmin)}`,
      `median share of zero days: ${DOW.map((d, i) => `${d} ${pct(median(res.map((a) => a.zeroShare[i]!)))}`).join(" · ")}`,
      `Kruskal-Wallis p < ${ALPHA}: ${count((a) => a.kw.p < ALPHA)}`,
      `ACF lag 7 significant: ${count((a) => a.acfSig)} · lag 7 is the largest |ACF| in lags 1..14: ${count((a) => a.lag7Top)}`);
  }
  return out.join("\n");
}

if (require.main === module) {
  const text = report(), dir = join(__dirname, "output");
  mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "weekly-rhythm.md"), text + "\n");
  console.log(text);
}
