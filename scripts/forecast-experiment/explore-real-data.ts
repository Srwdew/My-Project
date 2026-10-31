// Stage A: describe the two real, citable datasets before any backtest. Read-only: never edits the raw files.
// Data (git-ignored) in scripts/forecast-experiment/data/:
//   moneydata/laramee26openBankTransactionData.xlsx  Mendeley Data DOI 10.17632/dnxtg6n4rv.1 (CC BY 4.0)
//     sha256 716eaf9ad4a3cf60dc9c9c8a20ed9a917c545a1b5f139f40ed91d2104faa3ff7
//   berka/*.asc  github.com/jlacko/berka-dataset @ 77e9972a1ead (PKDD'99 Discovery Challenge)
// Run from the repo root:  backend/node_modules/.bin/tsx scripts/forecast-experiment/explore-real-data.ts
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DATA = join(__dirname, "data");
const XLSX = join(DATA, "moneydata", "laramee26openBankTransactionData.xlsx");
const XLSX_SHA256 = "716eaf9ad4a3cf60dc9c9c8a20ed9a917c545a1b5f139f40ed91d2104faa3ff7";

// ---------- shared helpers ----------
const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[n >> 1]! : (s[n / 2 - 1]! + s[n / 2]!) / 2) : NaN; };
const quantile = (v: number[], q: number) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]! : NaN; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const table = (head: string[], rows: (string | number)[][]) =>
  [head.join(" | "), head.map(() => "---").join(" | "), ...rows.map((r) => r.join(" | "))].join("\n");
/** Daily totals over every calendar day from first to last expense (missing days = 0, as Holt's zero-fill). */
function dailyStats(expenses: { date: string; amount: number }[]) {
  if (!expenses.length) return null;
  const by = new Map<string, number>();
  for (const e of expenses) by.set(e.date, (by.get(e.date) ?? 0) + e.amount);
  const sorted = [...by.keys()].sort(), first = sorted[0]!, last = sorted.at(-1)!;
  const series: number[] = [];
  for (let t = Date.parse(first); t <= Date.parse(last); t += DAY) series.push(by.get(iso(t)) ?? 0);
  return { first, last, spanDays: series.length, count: expenses.length, mean: r2(series.reduce((a, b) => a + b, 0) / series.length),
    median: r2(median(series)), zeroShare: r2((series.filter((x) => x === 0).length / series.length) * 100), medianNonZero: r2(median(series.filter((x) => x > 0))) };
}

// ---------- MoneyData (xlsx = zip of XML; Windows' bundled bsdtar extracts it, no new dependency) ----------
function readMoneyData() {
  const hash = createHash("sha256").update(readFileSync(XLSX)).digest("hex");
  if (hash !== XLSX_SHA256) throw Error("MoneyData file checksum mismatch: " + hash);
  const out = join(DATA, "moneydata", "xlsx");
  if (!existsSync(join(out, "xl", "worksheets", "sheet1.xml"))) {
    mkdirSync(out, { recursive: true });
    execFileSync("C:\\Windows\\System32\\tar.exe", ["-xf", XLSX, "-C", out]);
  }
  const text = (x: string) => x.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  const shared = [...readFileSync(join(out, "xl", "sharedStrings.xml"), "utf8").matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => text([...m[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  const sheet = (n: number) => [...readFileSync(join(out, "xl", "worksheets", `sheet${n}.xml`), "utf8").matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const cells: Record<string, string> = {};
    for (const c of row[1]!.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const v = c[3]?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (v !== undefined) cells[c[1]!] = /t="s"/.test(c[2]!) ? shared[Number(v)]! : v;
    }
    return cells;
  });
  const [head, ...body] = sheet(1);
  const cols = Object.entries(head!).sort(([a], [b]) => a.localeCompare(b));
  const rows = body.map((r) => Object.fromEntries(cols.map(([col, name]) => [name, r[col] ?? ""])));
  const descriptions = sheet(2).map((r) => [r.A ?? "", r.B ?? ""]);
  return { header: cols.map(([, n]) => n), rows, descriptions };
}

function exploreMoneyData() {
  const { header, rows, descriptions } = readMoneyData();
  const filled = rows.filter((r) => r["Transaction Number"]);
  const out: string[] = ["# MoneyData", "Columns: " + header.join(", "), `Rows: ${rows.length} (${rows.length - filled.length} completely empty rows skipped)`];
  const isSerial = (s: string) => /^\d{5}$/.test(s);
  const serialRows = filled.filter((r) => isSerial(r["Transaction Date"]!));
  const serialDayMax = Math.max(...serialRows.map((r) => new Date(Date.UTC(1899, 11, 30) + Number(r["Transaction Date"]) * DAY).getUTCDate()));
  out.push(`Date cells: ${filled.length - serialRows.length} text dd/mm/yyyy, ${serialRows.length} Excel serial numbers (largest day-of-month among serials: ${serialDayMax})`);
  out.push("Serial dates are dd/mm dates Excel read as mm/dd (only day<=12 can be misread, and none exceed 12); they are converted back by swapping day and month. No time-of-day anywhere: dates only.");
  const date = (s: string) => {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    if (!isSerial(s)) return null;
    const [y, mm, dd] = iso(Date.UTC(1899, 11, 30) + Number(s) * DAY).split("-");
    return `${y}-${dd}-${mm}`; // swap back
  };
  const parsed = filled.map((r) => ({ ...r, date: date(r["Transaction Date"]!) ?? "", debit: Number(r["Debit Amount"] || 0), credit: Number(r["Credit Amount"] || 0), balance: Number(r["Balance"]) }));
  const ordered = [...parsed].sort((a, b) => Number(b["Transaction Number"]) - Number(a["Transaction Number"]));
  out.push("Unparseable dates: " + parsed.filter((r) => !r.date).length + "; date goes backwards in transaction order (after the swap): " + ordered.filter((r, i) => i && r.date < ordered[i - 1]!.date).length);
  const dates = parsed.map((r) => r.date).filter(Boolean).sort(), first = dates[0]!, last = dates.at(-1)!;
  const present = new Set(dates);
  const gaps: [string, string, number][] = [];
  for (let t = Date.parse(first), run: string | null = null; t <= Date.parse(last) + DAY; t += DAY) {
    const d = iso(t), has = present.has(d) || t > Date.parse(last);
    if (!has && !run) run = d;
    if (has && run) { gaps.push([run, iso(t - DAY), days(run, d)]); run = null; }
  }
  out.push(`Range: ${first} .. ${last} (${days(first, last) + 1} calendar days, ${present.size} days with any transaction)`);
  out.push(`Days without any transaction: ${days(first, last) + 1 - present.size}; longest gaps (days): ` + gaps.sort((a, b) => b[2] - a[2]).slice(0, 5).map((g) => `${g[0]}..${g[1]}=${g[2]}`).join(", "));
  // Single account? A single running balance must chain: previous balance - debit + credit = this balance.
  // Rows are listed newest first; walk oldest -> newest by the Transaction Number column.
  const chain = [...parsed].sort((a, b) => Number(b["Transaction Number"]) - Number(a["Transaction Number"]));
  let ok = 0, broken = 0;
  for (let i = 1; i < chain.length; i++) {
    const expect = r2(chain[i - 1]!.balance - chain[i]!.debit + chain[i]!.credit);
    Math.abs(expect - chain[i]!.balance) < 0.005 ? ok++ : broken++;
  }
  out.push(`Running-balance chain (oldest->newest): ${ok} consistent, ${broken} inconsistent of ${chain.length - 1} steps`);
  out.push("Countries: " + JSON.stringify(count(parsed.map((r) => r["Location Country"] || "(blank)"))));
  out.push("Non-GBP fee rows (description contains NON-GBP): " + parsed.filter((r) => /NON-GBP/.test(r["Transaction Description"]!)).length);
  out.push("Rows with both debit and credit: " + parsed.filter((r) => r.debit && r.credit).length + "; neither: " + parsed.filter((r) => !r.debit && !r.credit).length);
  out.push("\n## Transaction Type\n" + table(["type", "rows", "debit rows", "debit sum", "credit rows", "credit sum"], group(parsed, (r) => r["Transaction Type"]!)));
  out.push("\n## Category\n" + table(["category", "rows", "debit rows", "debit sum", "credit rows", "credit sum"], group(parsed, (r) => r["Category"] || "(blank)")));
  out.push("\n## Category descriptions (sheet 2, first 40 rows)\n" + descriptions.slice(0, 40).map((d) => `- ${d[0]}: ${d[1]}`).join("\n"));
  const allDebits = parsed.filter((r) => r.debit > 0).map((r) => ({ date: r.date, amount: r.debit }));
  out.push("\n## Daily spend, definition 0 (every debit, nothing excluded)\n" + JSON.stringify(dailyStats(allDebits)));
  // Rows a definition has to decide about, shown with their (anonymised) descriptions.
  const show = (label: string, f: (r: (typeof parsed)[number]) => boolean) => {
    const hit = parsed.filter((r) => r.debit > 0 && f(r));
    out.push(`\n### ${label}: ${hit.length} debit rows, sum ${r2(hit.reduce((a, r) => a + r.debit, 0))}\n` +
      table(["type", "category", "description", "rows", "debit sum"], [...hit.reduce((m, r) => { const k = `${r["Transaction Type"]} | ${r["Category"] || "(blank)"} | ${r["Transaction Description"]}`; const g = m.get(k) ?? [0, 0]; g[0]++; g[1] += r.debit; return m.set(k, g); }, new Map<string, number[]>())]
        .sort((a, b) => b[1][1]! - a[1][1]!).slice(0, 12).map(([k, g]) => [...k.split(" | "), g[0]!, r2(g[1]!)])));
  };
  show("Debits with blank category", (r) => !r["Category"]);
  show("TFR (transfer) debits", (r) => r["Transaction Type"] === "TFR");
  show("Savings / Investment / Account transfer debits", (r) => /^(Savings|Investment|Account transfer)$/.test(r["Category"]!.trim()));
  show("Supplementary Income / Safety Deposit Return debits", (r) => /^(Supplementary Income|Safety Deposit Return)$/.test(r["Category"]!.trim()));
  show("Services debits (payments to individuals)", (r) => r["Category"]!.trim() === "Services");
  // Candidate definitions (proposals only; the user decides).
  const own = /^(Savings|Investment|Account transfer)$/;
  const defs: Record<string, (r: (typeof parsed)[number]) => boolean> = {
    "M1 debits excl. own-money moves (Savings, Investment, Account transfer)": (r) => !own.test(r["Category"]!.trim()),
    "M2 = M1 excl. cash withdrawals (Cash)": (r) => !own.test(r["Category"]!.trim()) && r["Category"]!.trim() !== "Cash",
    "M3 = M1 excl. Mortgage and Bills (day-to-day spending only)": (r) => !own.test(r["Category"]!.trim()) && !/^(Mortgage|Bills)$/.test(r["Category"]!.trim()),
  };
  for (const [name, f] of Object.entries(defs))
    out.push(`\n## Daily spend, ${name}\n` + JSON.stringify(dailyStats(parsed.filter((r) => r.debit > 0 && f(r)).map((r) => ({ date: r.date, amount: r.debit })))));
  return out.join("\n");
}
function count(v: string[]) { const m: Record<string, number> = {}; for (const x of v) m[x] = (m[x] ?? 0) + 1; return m; }
function group<T extends { debit: number; credit: number }>(rows: T[], key: (r: T) => string) {
  const m = new Map<string, number[]>();
  for (const r of rows) { const g = m.get(key(r)) ?? [0, 0, 0, 0, 0]; g[0]!++; if (r.debit) { g[1]!++; g[2]! += r.debit; } if (r.credit) { g[3]!++; g[4]! += r.credit; } m.set(key(r), g); }
  return [...m].sort((a, b) => b[1][2]! - a[1][2]!).map(([k, g]) => [k, g[0]!, g[1]!, r2(g[2]!), g[3]!, r2(g[4]!)]);
}

// ---------- Berka (semicolon CSV; dates YYMMDD in 1993-1998) ----------
function exploreBerka() {
  const out: string[] = ["# Berka"];
  const lines = readFileSync(join(DATA, "berka", "trans.asc"), "utf8").split(/\r?\n/).filter(Boolean);
  const head = lines[0]!.split(";").map((h) => h.replace(/"/g, ""));
  const idx = (n: string) => head.indexOf(n);
  const [iAcc, iDate, iType, iOp, iAmt, iK] = ["account_id", "date", "type", "operation", "amount", "k_symbol"].map(idx) as number[];
  const tx = lines.slice(1).map((l) => { const c = l.split(";").map((x) => x.replace(/"/g, "")); const d = c[iDate!]!;
    return { account: c[iAcc!]!, date: `19${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}`, type: c[iType!]!, op: c[iOp!] || "(blank)", k: c[iK!]?.trim() || "(blank)", amount: Number(c[iAmt!]) }; });
  const accounts = new Set(tx.map((t) => t.account)), ds = tx.map((t) => t.date).sort();
  out.push(`Transactions: ${tx.length}; accounts: ${accounts.size}; range ${ds[0]} .. ${ds.at(-1)}`);
  out.push("Columns: " + head.join(", "));
  const combos = new Map<string, [number, number]>();
  for (const t of tx) { const k = `${t.type} / ${t.op} / ${t.k}`; const g = combos.get(k) ?? [0, 0]; g[0]++; g[1] += t.amount; combos.set(k, g); }
  out.push("\n## type / operation / k_symbol\n" + table(["type / operation / k_symbol", "rows", "amount sum (CZK)"], [...combos].sort((a, b) => b[1][0] - a[1][0]).map(([k, g]) => [k, g[0], r2(g[1])])));
  // Candidate expense definitions (proposals only; the user decides).
  const defs: Record<string, (t: (typeof tx)[number]) => boolean> = {
    "D1 all outgoing (VYDAJ+VYBER)": (t) => t.type === "VYDAJ" || t.type === "VYBER",
    "D2 outgoing excl. cash withdrawal": (t) => (t.type === "VYDAJ" || t.type === "VYBER") && t.op !== "VYBER",
    "D3 card + cash withdrawals only": (t) => t.op === "VYBER KARTOU" || t.op === "VYBER",
  };
  const gate = (e: { date: string }[]) => { if (e.length < 30) return false; const s = e.map((x) => x.date).sort(); return days(s[0]!, s.at(-1)!) + 1 >= 30; };
  for (const [name, f] of Object.entries(defs)) {
    const per = new Map<string, { date: string; amount: number }[]>();
    for (const t of tx) if (f(t)) (per.get(t.account) ?? per.set(t.account, []).get(t.account)!).push({ date: t.date, amount: t.amount });
    const stats = [...per.values()].filter(gate).map(dailyStats).filter((s): s is NonNullable<typeof s> => !!s);
    const dist = (k: "mean" | "median" | "zeroShare" | "medianNonZero" | "spanDays" | "count") => { const v = stats.map((s) => s[k]); return `p25 ${r2(quantile(v, 0.25))} · median ${r2(median(v))} · p75 ${r2(quantile(v, 0.75))} · min ${r2(Math.min(...v))} · max ${r2(Math.max(...v))}`; };
    out.push(`\n## ${name}\nAccounts with any such row: ${per.size}; passing Forecast Gate (>=30 rows and >=30 inclusive days over the whole data): ${stats.length}`);
    out.push(`daily mean (CZK): ${dist("mean")}\ndaily median: ${dist("median")}\nmedian of non-zero days: ${dist("medianNonZero")}\n% zero days: ${dist("zeroShare")}\nspan days: ${dist("spanDays")}\nrows: ${dist("count")}`);
  }
  return out.join("\n");
}

console.log(exploreMoneyData());
console.log("\n\n" + exploreBerka());
