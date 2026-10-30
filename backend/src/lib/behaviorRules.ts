import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

export const D = Prisma.Decimal.clone({
  precision: 40,
  rounding: Prisma.Decimal.ROUND_HALF_UP,
});
export const BEHAVIOR_RULE = Object.freeze({
  algorithm: "behavior-v3",
  minimumCount: 30,
  minimumSpan: 30,
  maximumDays: 366,
  categoryCount: 5,
  categoryDays: 3,
  timeCount: 30,
  timeCoverage: "0.80",
  bucketHours: 4,
  bucketShare: "0.50",
  bucketDays: 5,
  recurrenceDays: 3,
  generalDays: 5,
  generalWindow: 30,
  weeklyCount: 4,
  weeklyWindow: 28,
  monthlyCount: 3,
  monthlyWindow: 90,
  // User-approved 24 Oct 2026: amounts within 10% of the group median,
  // weekly cadence 7±1 days, monthly due date ±3 days.
  amountTolerance: "0.10",
  weeklyDateTolerance: 1,
  monthlyDateTolerance: 3,
  // A category increase is a finding only when it is >=5% AND >=100 baht.
  minimumIncreaseShare: "0.05",
  minimumIncreaseAmount: "100",
  // User-approved 26 Oct 2026: one category >=40% of the selected period's spend.
  dominantShare: "0.40",
  recurrenceLimit: 50,
  findingPreview: 3,
  today: "excluded",
  span: "inclusive-first-last",
  recurrenceDeduplication:
    "monthly-weekly-general-contained-transaction-evidence-before-limit",
  comparison: "preceding-equal-days-both-ready",
  increase: "category-increase-at-least-share-and-amount",
  recurrence: "all-rolling-windows-first-witness-per-kind-median-amount-band",
  monthlyDue: "anchor-day-clamped-month-end-anchored",
  weekday: "amount-per-calendar-occurrence",
  missing: "no-record-not-confirmed-zero",
  category: "left-join-unknown",
  rounding: "half-up-display-only",
});
export const BEHAVIOR_VERSION =
  BEHAVIOR_RULE.algorithm +
  "-" +
  createHash("sha256")
    .update(JSON.stringify(BEHAVIOR_RULE))
    .digest("hex")
    .slice(0, 24);
export const money = (value: Prisma.Decimal.Value) => new D(value).toFixed(2);
export const total = (values: Prisma.Decimal.Value[]) =>
  values.reduce<Prisma.Decimal>((s, v) => s.plus(v), new D(0));
export const shiftDay = (day: string, amount: number) => {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};
export const dayCount = (start: string, end: string) =>
  Math.round(
    (Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) /
      86400000,
  ) + 1;
export class BehaviorInputError extends Error {}
export function behaviorPeriod(
  query: Record<string, unknown>,
  asOfDate: string,
) {
  if (
    Object.keys(query).some(
      (k) => !["startDate", "endDate", "categoryId"].includes(k),
    )
  )
    throw new BehaviorInputError("รับเฉพาะ startDate, endDate และ categoryId");
  const validDate = (v: unknown): v is string =>
    typeof v === "string" &&
    /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v + "T00:00:00Z")) &&
    new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
  const yesterday = shiftDay(asOfDate, -1);
  const start =
    query.startDate === undefined && query.endDate === undefined
      ? shiftDay(yesterday, -29)
      : query.startDate;
  const end =
    query.startDate === undefined && query.endDate === undefined
      ? yesterday
      : query.endDate;
  if (!validDate(start) || !validDate(end) || start > end || end > yesterday)
    throw new BehaviorInputError(
      "กรุณาเลือกวันที่จริง โดยวันสิ้นสุดไม่เกินเมื่อวานตาม Asia/Bangkok",
    );
  const days = dayCount(start, end);
  if (days > BEHAVIOR_RULE.maximumDays)
    throw new BehaviorInputError("เลือกช่วงไม่เกิน 366 วัน");
  const previousStart = shiftDay(start, -days);
  if (!validDate(previousStart))
    throw new BehaviorInputError("ช่วงก่อนหน้าอยู่นอกขอบเขตวันที่รองรับ");
  const categoryId = query.categoryId;
  if (
    categoryId !== undefined &&
    (typeof categoryId !== "string" ||
      !(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          categoryId,
        ) || categoryId === "uncategorized"
      ))
  )
    throw new BehaviorInputError("หมวดไม่ถูกต้อง");
  return {
    current: { startDate: start, endDate: end },
    previous: { startDate: previousStart, endDate: shiftDay(start, -1) },
    days,
    categoryId: categoryId ?? null,
  };
}
export type Period = ReturnType<typeof behaviorPeriod>;
export type EvidenceTransaction = {
  id: string;
  date: string;
  amount: string;
  time: string | null;
};
export type BehaviorRow = {
  categoryId: string | null;
  categoryName: string;
  date: string;
  bucket: number;
  count: number;
  amount: string;
  transactions?: EvidenceTransaction[];
};
export type Recurrence = {
  categoryId: string | null;
  categoryName: string;
  amount: string;
  dates: string[];
  counts: number[];
  kind?: "general" | "weekly" | "monthly";
  transactions?: EvidenceTransaction[];
};
const dayDiff = (from: string, to: string) => dayCount(from, to) - 1;
// Due date k months after the anchor; a month-end anchor stays on month end.
export function monthlyDue(anchor: string, cycle: number) {
  const y = Number(anchor.slice(0, 4)),
    m = Number(anchor.slice(5, 7)) - 1,
    d = Number(anchor.slice(8, 10));
  const lastDay = (year: number, month: number) =>
    new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const monthEnd = d === lastDay(y, m);
  const target = new Date(Date.UTC(y, m + cycle, 1));
  const ty = target.getUTCFullYear(),
    tm = target.getUTCMonth(),
    last = lastDay(ty, tm);
  target.setUTCDate(monthEnd ? last : Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
// Every amount must be within amountTolerance of the group median.
export function amountBand(amounts: Prisma.Decimal.Value[]) {
  if (!amounts.length) return null;
  const sorted = amounts.map((a) => new D(a)).sort((a, b) => a.cmp(b));
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2
      ? sorted[mid]!
      : sorted[mid - 1]!.plus(sorted[mid]!).div(2);
  if (!median.gt(0)) return null;
  const limit = median.mul(BEHAVIOR_RULE.amountTolerance);
  const within = (v: Prisma.Decimal.Value) =>
    new D(v).minus(median).abs().lte(limit);
  return sorted.every(within) ? { median, within } : null;
}
export function recurrenceWindows(dates: string[], counts: number[]) {
  if (
    dates.length !== counts.length ||
    new Set(dates).size !== dates.length ||
    counts.some((n) => n < 1)
  )
    return [];
  const ordered = dates
    .map((date, i) => ({ date, count: counts[i]! }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const result: {
    kind: "general" | "weekly" | "monthly";
    dates: string[];
    counts: number[];
  }[] = [];
  for (const kind of ["general", "weekly", "monthly"] as const) {
    const n =
      kind === "general"
        ? BEHAVIOR_RULE.generalDays
        : kind === "weekly"
          ? BEHAVIOR_RULE.weeklyCount
          : BEHAVIOR_RULE.monthlyCount;
    const limit =
      kind === "general"
        ? BEHAVIOR_RULE.generalWindow
        : kind === "weekly"
          ? BEHAVIOR_RULE.weeklyWindow
          : BEHAVIOR_RULE.monthlyWindow;
    for (let i = 0; i + n <= ordered.length; i++) {
      const part = ordered.slice(i, i + n),
        d = part.map((x) => x.date);
      if (dayCount(d[0]!, d[n - 1]!) > limit) continue;
      if (kind !== "general" && part.some((x) => x.count !== 1)) continue;
      if (
        kind === "weekly" &&
        !d
          .slice(1)
          .every(
            (v, j) =>
              Math.abs(dayDiff(d[j]!, v) - 7) <=
              BEHAVIOR_RULE.weeklyDateTolerance,
          )
      )
        continue;
      if (
        kind === "monthly" &&
        !d
          .slice(1)
          .every(
            (v, j) =>
              Math.abs(dayDiff(monthlyDue(d[0]!, j + 1), v)) <=
              BEHAVIOR_RULE.monthlyDateTolerance,
          )
      )
        continue;
      result.push({ kind, dates: d, counts: part.map((x) => x.count) });
      break;
    }
  }
  return result;
}
export function recurrenceKind(dates: string[], counts: number[]) {
  const windows = recurrenceWindows(dates, counts);
  return (
    windows.find((w) => w.kind === "weekly")?.kind ??
    windows.find((w) => w.kind === "monthly")?.kind ??
    windows[0]?.kind ??
    null
  );
}

// A witness contains every transaction of its category within the median band on each date.
// Higher-specificity evidence must be wholly contained; partial intersections stay independent.
// With transaction evidence, containment compares transaction ids; otherwise dates/counts of the same amount.
export function distinctRecurrenceEvidence<
  T extends Recurrence & { kind: "general" | "weekly" | "monthly" },
>(items: T[]): T[] {
  const rank = { general: 0, weekly: 1, monthly: 2 };
  const contains = (low: T, high: T) => {
    if (high.transactions?.length && low.transactions?.length) {
      const ids = new Set(low.transactions.map((t) => t.id));
      return high.transactions.every((t) => ids.has(t.id));
    }
    return (
      new D(high.amount).eq(low.amount) &&
      high.dates.length > 0 &&
      high.dates.every((date, i) => {
        const at = low.dates.indexOf(date);
        return at >= 0 && high.counts[i]! <= low.counts[at]!;
      })
    );
  };
  return items.filter(
    (low) =>
      !items.some(
        (high) =>
          rank[high.kind] > rank[low.kind] &&
          high.categoryId === low.categoryId &&
          contains(low, high),
      ),
  );
}

type Kind = "general" | "weekly" | "monthly";
const occurrences = { general: "generalDays", weekly: "weeklyCount", monthly: "monthlyCount" } as const;
const windows = { general: "generalWindow", weekly: "weeklyWindow", monthly: "monthlyWindow" } as const;
// Integer-satang equivalent of amountBand: compares 2×values so an even-count median
// (half satang) stays exact. Satang values of Decimal(12,2) stay far below 2^53.
const toleranceHundredths = new D(BEHAVIOR_RULE.amountTolerance).mul(100).toNumber();
function centsBand(cents: number[]) {
  const sorted = [...cents].sort((a, b) => a - b),
    mid = Math.floor(sorted.length / 2);
  const median2 = sorted.length % 2 ? 2 * sorted[mid]! : sorted[mid - 1]! + sorted[mid]!;
  if (!(median2 > 0)) return null;
  const within = (c: number) => Math.abs(2 * c - median2) * 100 <= median2 * toleranceHundredths;
  return sorted.every(within) ? { median2, within } : null;
}
type Indexed = EvidenceTransaction & { cents: number };
type DateIndex = { byDate: Map<string, Indexed[]>; dates: string[]; position: Map<string, number> };
// Builds one candidate chain starting at `first`: one transaction per date, closest to the
// cadence target, then closest amount, then id. Only candidate dates are visited, and the amount
// pre-filter uses integer satang; the exact Decimal median check is done by the caller.
function chainFrom(first: Indexed, index: DateIndex, kind: Kind) {
  const ref = first.cents,
    tol = Number(BEHAVIOR_RULE.amountTolerance);
  if (!(ref > 0)) return null;
  // Any group member is within tol of the median, so it lies within this band of every other
  // member. One satang of slack keeps the float pre-filter from excluding a boundary value.
  const low = (ref * (1 - tol)) / (1 + tol) - 1,
    high = (ref * (1 + tol)) / (1 - tol) + 1;
  const n = BEHAVIOR_RULE[occurrences[kind]],
    limit = BEHAVIOR_RULE[windows[kind]];
  const best = (date: string, after: string) => {
    if (date <= after || dayCount(first.date, date) > limit) return null;
    let pick: Indexed | null = null;
    for (const t of index.byDate.get(date) ?? []) {
      if (t.cents < low || t.cents > high) continue;
      if (
        !pick ||
        Math.abs(t.cents - ref) < Math.abs(pick.cents - ref) ||
        (Math.abs(t.cents - ref) === Math.abs(pick.cents - ref) && t.id < pick.id)
      )
        pick = t;
    }
    return pick;
  };
  const chain = [first];
  while (chain.length < n) {
    const prev = chain[chain.length - 1]!;
    let pick: Indexed | null = null;
    if (kind === "general") {
      for (let i = index.position.get(prev.date)! + 1; !pick && i < index.dates.length; i++) {
        if (dayCount(first.date, index.dates[i]!) > limit) break;
        pick = best(index.dates[i]!, prev.date);
      }
    } else {
      const target =
        kind === "weekly" ? shiftDay(prev.date, 7) : monthlyDue(first.date, chain.length);
      const tolerance =
        kind === "weekly" ? BEHAVIOR_RULE.weeklyDateTolerance : BEHAVIOR_RULE.monthlyDateTolerance;
      // Nearest offset first: 0, -1, +1, -2, +2 ...
      for (let k = 0; !pick && k <= 2 * tolerance; k++) {
        const offset = k % 2 ? -(k + 1) / 2 : k / 2;
        pick = best(shiftDay(target, offset), prev.date);
      }
    }
    if (!pick) return null;
    chain.push(pick);
  }
  return chain;
}
// Finds recurrence witnesses from per-transaction evidence. Per category and kind the earliest
// qualifying chain is kept, and its amount band is consumed so the same item is not repeated.
export function findRecurrences(rows: BehaviorRow[]): (Recurrence & { kind: Kind })[] {
  const groups = new Map<string, { categoryId: string | null; categoryName: string; items: EvidenceTransaction[] }>();
  for (const r of rows) {
    const k = r.categoryId ?? "\u0000uncategorized";
    const g = groups.get(k) ?? { categoryId: r.categoryId, categoryName: r.categoryName, items: [] };
    g.items.push(...(r.transactions ?? []));
    groups.set(k, g);
  }
  const found: (Recurrence & { kind: Kind })[] = [];
  for (const g of groups.values()) {
    const items: Indexed[] = [...new Map(g.items.map((t) => [t.id, t])).values()]
      .map((t) => ({ ...t, cents: new D(t.amount).mul(100).toNumber() }))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const byDate = new Map<string, Indexed[]>();
    for (const t of items) {
      const list = byDate.get(t.date);
      if (list) list.push(t);
      else byDate.set(t.date, [t]);
    }
    const dates = [...byDate.keys()];
    const index: DateIndex = { byDate, dates, position: new Map(dates.map((d, i) => [d, i])) };
    for (const kind of ["general", "weekly", "monthly"] as const) {
      const used = new Set<string>();
      for (const start of items) {
        if (used.has(start.id)) continue;
        const chain = chainFrom(start, index, kind);
        const band = chain && centsBand(chain.map((t) => t.cents));
        if (!chain || !band) continue;
        const dates = chain.map((t) => t.date);
        const evidence = dates.flatMap((d) => byDate.get(d)!.filter((t) => band.within(t.cents)));
        const counts = dates.map((d) => evidence.filter((t) => t.date === d).length);
        if (evidence.some((t) => used.has(t.id))) continue;
        if (!recurrenceWindows(dates, counts).some((w) => w.kind === kind)) continue;
        for (const t of items) if (band.within(t.cents)) used.add(t.id);
        found.push({
          categoryId: g.categoryId,
          categoryName: g.categoryName,
          amount: money(new D(band.median2).div(200)),
          kind,
          dates,
          counts,
          transactions: evidence.map(({ cents: _, ...t }) => t),
        });
      }
    }
  }
  const cat = (id: string | null) => (id === null ? "￿" : id);
  return found.sort(
    (a, b) =>
      b.dates.length - a.dates.length ||
      (cat(a.categoryId) < cat(b.categoryId) ? -1 : cat(a.categoryId) > cat(b.categoryId) ? 1 : 0) ||
      new D(a.amount).cmp(b.amount) ||
      a.kind.localeCompare(b.kind) ||
      a.dates[0]!.localeCompare(b.dates[0]!),
  );
}
