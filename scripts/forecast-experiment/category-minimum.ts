// Evidence for the anomaly per-category amount minimum (ISSUE-ANOM-1, stage 2): how many categories, and how much of
// their spending, would get their own baseline at each candidate minimum. Read-only over MoneyData M1 expenses;
// 180-day window (ANOMALY_RULE.windowDays) counted at the 1st of every month. Berka cannot answer this: it has
// transaction types, not spending categories.
// Usage (repo root): backend/node_modules/.bin/tsx scripts/forecast-experiment/category-minimum.ts
import { loadMoneyData } from "./explore-real-data";
import { MONEYDATA_DEFS } from "./backtest-real-data";

const DAY = 864e5;
// [items, distinct days, span days]; the last row is the current ANOMALY_RULE (amountMin/amountDays/amountSpan).
const RULES = [[8, 4, 14], [10, 5, 14], [15, 5, 14], [30, 10, 28]] as const;

if (require.main === module) {
  const { parsed } = loadMoneyData();
  const rows = parsed.filter(MONEYDATA_DEFS.M1).map((r) => ({ d: r.date, c: ((r as Record<string, unknown>)["Category"] as string ?? "").trim() || "(blank)" }));
  const pass = RULES.map(() => ({ cats: 0, tx: 0 }));
  let pairs = 0, txAll = 0;
  for (let t = Date.parse("2016-02-01"); t <= Date.parse("2022-07-01");) {
    const end = new Date(t).toISOString().slice(0, 10), start = new Date(t - 180 * DAY).toISOString().slice(0, 10);
    const by = new Map<string, string[]>();
    for (const r of rows) if (r.d >= start && r.d < end) (by.get(r.c) ?? by.set(r.c, []).get(r.c)!).push(r.d);
    for (const ds of by.values()) {
      pairs++; txAll += ds.length;
      const days = new Set(ds).size, s = [...ds].sort(), span = (Date.parse(s.at(-1)!) - Date.parse(s[0]!)) / DAY;
      RULES.forEach(([n, dd, sp], i) => { if (ds.length >= n && days >= dd && span >= sp) { pass[i]!.cats++; pass[i]!.tx += ds.length; } });
    }
    const d = new Date(t); d.setUTCMonth(d.getUTCMonth() + 1); t = d.getTime();
  }
  console.log(`category-month pairs with >=1 expense: ${pairs}; categories overall: ${new Set(rows.map((r) => r.c)).size}`);
  RULES.forEach(([n, dd, sp], i) => console.log(`>=${n} items, >=${dd} days, span>=${sp}: categories ${pass[i]!.cats}/${pairs} (${Math.round((pass[i]!.cats / pairs) * 100)}%) · transactions covered ${Math.round((pass[i]!.tx / txAll) * 100)}%`));
}
