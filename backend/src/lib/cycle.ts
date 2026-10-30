import { bangkokToday } from "./goalCalculations";
// The only place that decides what a spending "cycle" is. Phase 1: calendar month, identical to the old inline math.
// Every entry point takes userId so phase 2 can look up that user's payday rule here; phase 1 ignores it.
// shortcut: phase 2 needs the rule loaded (async) before these sync calls, e.g. a per-request cache filled at route entry.
export type Cycle = {
  key: string; // "YYYY-MM", also the Budget (year, month) row key
  year: number;
  month: number;
  startDate: string; // inclusive YYYY-MM-DD
  endDate: string; // inclusive YYYY-MM-DD
  days: number;
};
const DAY = 86400000;
export const utcDate = (date: string) => new Date(date + "T00:00:00.000Z");
export const addDays = (date: string, n: number) =>
  new Date(utcDate(date).getTime() + n * DAY).toISOString().slice(0, 10);

export function cycleByPeriod(_userId: string, year: number, month: number): Cycle {
  const key = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { key, year, month, startDate: key + "-01", endDate: `${key}-${String(days).padStart(2, "0")}`, days };
}
export const cycleByKey = (userId: string, key: string) =>
  cycleByPeriod(userId, Number(key.slice(0, 4)), Number(key.slice(5, 7)));
/** The cycle that contains `date` (YYYY-MM-DD). */
export const getCurrentCycle = (userId: string, date: string) =>
  cycleByKey(userId, date.slice(0, 7));
export const previousCycle = (userId: string, c: Cycle) =>
  getCurrentCycle(userId, addDays(c.startDate, -1));
/** Prisma-ready half-open range [start, end). */
export const cycleBounds = (c: Cycle) => ({
  start: utcDate(c.startDate),
  end: utcDate(addDays(c.endDate, 1)),
});

export function getBudgetTimeline(
  userId: string,
  year: number,
  month: number,
  today = bangkokToday(), // ใช้วันที่ประเทศไทย เพื่อให้วันเปลี่ยนตรงกับผู้ใช้
) {
  const cycle = cycleByPeriod(userId, year, month);
  const current = getCurrentCycle(userId, today);
  const daysInMonth = cycle.days;

  const monthState =
    cycle.startDate < current.startDate
      ? "past"
      : cycle.startDate > current.startDate
        ? "future"
        : "current";

  const elapsedDays =
    monthState === "past"
      ? daysInMonth
      : monthState === "future"
        ? 0
        : (Date.parse(today) - Date.parse(cycle.startDate)) / 86400000 + 1;

  return {
    cycle,
    monthState,
    daysInMonth,
    elapsedDays,
    // ขอบเขตแบบไม่รวมวันนี้ + 1 เพื่อรวมรายการของวันนี้ทั้งหมด
    expenseCutoff: new Date(
      Date.parse(cycle.startDate) + elapsedDays * 86400000,
    ),
  };
}
