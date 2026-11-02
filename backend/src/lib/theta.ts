// Production forecast model. Moved unchanged from scripts/forecast-experiment/models.ts, which now imports it back,
// so the real-data backtest (docs/FORECAST_REAL_DATA_BACKTEST.md) and production run the same code.
// Float arithmetic on purpose: converting to Decimal would be a second version of the model.

const M = 7, H = 7;
const r2 = (n: number) => Math.round(n * 100) / 100;
const out = (v: number[]) => v.map((x) => r2(Math.max(x, 0)));
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

// ---------- Theta (Assimakopoulos & Nikolopoulos 2000), theta = 2 ----------
// Standard procedure: test the weekly season with ACF lag 7 at the 90% Bartlett bound; if seasonal, remove it
// with classical decomposition (centred 7-day moving average), forecast, then put it back. Multiplicative indices
// are the standard; when an index is 0 or below (days that are always 0, e.g. bank weekends) multiplicative
// cannot be inverted, so the additive decomposition is used and the case is counted.
// Forecast of the seasonally adjusted series = SES + half the OLS drift (Hyndman & Billah 2003 form);
// the SES alpha is fitted in-sample by one-step squared error on a 0.01 grid, as standard Theta does.
function acf(v: number[], k: number) {
  const m = mean(v), d = v.map((x) => x - m), c0 = d.reduce((a, b) => a + b * b, 0);
  return c0 ? d.slice(k).reduce((a, x, i) => a + x * d[i]!, 0) / c0 : 0;
}
export function weeklySeasonal(v: number[]) {
  if (v.length < 3 * M) return false;
  const r = Array.from({ length: M + 1 }, (_, k) => acf(v, k));
  return Math.abs(r[M]!) > 1.645 * Math.sqrt((1 + 2 * r.slice(1, M).reduce((a, x) => a + x * x, 0)) / v.length);
}
function decompose(y: number[]) {
  // Odd period: the centred moving average is the plain 7-term mean around t.
  const n = y.length, cma = y.map((_, t) => (t < 3 || t + 3 >= n ? null : mean(y.slice(t - 3, t + 4))));
  const pos = (t: number) => t % M;
  const ratio: number[][] = Array.from({ length: M }, () => []), diff: number[][] = Array.from({ length: M }, () => []);
  y.forEach((v, t) => { const c = cma[t]; if (c == null) return; diff[pos(t)]!.push(v - c); if (c > 0) ratio[pos(t)]!.push(v / c); });
  const mult = ratio.map((r) => (r.length ? mean(r) : NaN)), mm = mean(mult), mi = mult.map((x) => x / mm);
  if (mi.every((x) => Number.isFinite(x) && x > 0)) return { mode: "multiplicative" as const, idx: mi };
  const add = diff.map((d) => (d.length ? mean(d) : 0)), am = mean(add);
  return { mode: "additive" as const, idx: add.map((x) => x - am) };
}
export function theta(series: number[]) {
  const n = series.length, seasonal = weeklySeasonal(series), dec = seasonal ? decompose(series) : null;
  const adj = dec ? series.map((v, t) => (dec.mode === "multiplicative" ? v / dec.idx[t % M]! : v - dec.idx[t % M]!)) : series;
  let bestA = 0.01, bestSse = Infinity, bestLevel = adj[0]!;
  for (let i = 1; i <= 99; i++) {
    const a = i / 100; let l = adj[0]!, sse = 0;
    for (let t = 1; t < n; t++) { const e = adj[t]! - l; sse += e * e; l += a * e; }
    if (sse < bestSse) { bestSse = sse; bestA = a; bestLevel = l; }
  }
  const tm = (n - 1) / 2, ym = mean(adj);
  const slope = adj.reduce((s, v, t) => s + (t - tm) * (v - ym), 0) / adj.reduce((s, _, t) => s + (t - tm) ** 2, 0);
  const f = Array.from({ length: H }, (_, i) => {
    const h = i + 1, x = bestLevel + (slope / 2) * (h - 1 + 1 / bestA - (1 - bestA) ** n / bestA);
    return dec ? (dec.mode === "multiplicative" ? x * dec.idx[(n - 1 + h) % M]! : x + dec.idx[(n - 1 + h) % M]!) : x;
  });
  // raw: before clipping at 0, so callers can count negative days.
  return { forecast: out(f), raw: f, alpha: bestA, mode: dec ? dec.mode : "none" };
}
