import { bangkokToday } from "./goalCalculations";
// The only place that decides what a spending "cycle" is. Phase 1: calendar month, identical to the old inline math.
// Every function takes a CycleContext, which only cycleContextFromProfile can create (routes use loadCycleContext),
// so a route that forgets to load the user's payday rule does not compile; a forged or missing context throws at runtime.
export type Cycle = {
  key: string; // "YYYY-MM", also the Budget (year, month) row key
  year: number;
  month: number;
  startDate: string; // inclusive YYYY-MM-DD
  endDate: string; // inclusive YYYY-MM-DD
  days: number;
};
declare const brand: unique symbol;
export type CycleContext = { readonly [brand]: true; readonly userId: string } & (
  | { readonly kind: "payday"; readonly rule: { readonly dayOfMonth: number } }
  | {
      readonly kind: "calendar";
      // payday_set_not_enabled: the user has a payday, but payday cycles are not switched on yet (phase 1).
      readonly reason: "no_payday" | "irregular" | "payday_set_not_enabled";
    }
);
const issued = new WeakSet<object>();
// Test hook: lets a test prove a code path never touches cycle logic. Always null in production.
export const cycleProbe: { onUse: null | (() => void) } = { onUse: null };

/** The single constructor. Phase 2 changes only the decision below, plus the payday math it unlocks. */
export function cycleContextFromProfile(
  userId: string,
  profile: { paydayDay: number | null } | null,
): CycleContext {
  cycleProbe.onUse?.();
  const ctx = Object.freeze(
    profile?.paydayDay == null
      ? { userId, kind: "calendar" as const, reason: "no_payday" as const }
      : { userId, kind: "calendar" as const, reason: "payday_set_not_enabled" as const },
  ) as CycleContext;
  issued.add(ctx);
  return ctx;
}
export async function loadCycleContext(
  db: {
    profile: {
      findUnique(args: {
        where: { userId: string };
        select: { paydayDay: true };
      }): Promise<{ paydayDay: number | null } | null>;
    };
  },
  userId: string,
) {
  cycleProbe.onUse?.();
  return cycleContextFromProfile(
    userId,
    await db.profile.findUnique({ where: { userId }, select: { paydayDay: true } }),
  );
}
function use(ctx: CycleContext) {
  cycleProbe.onUse?.();
  // Runtime guard as well as the type: .cjs callers and casts bypass the compiler.
  if (typeof ctx !== "object" || ctx === null || !issued.has(ctx))
    throw Error("CYCLE_CONTEXT_REQUIRED");
  if (ctx.kind !== "calendar") throw Error("PAYDAY_CYCLES_NOT_IMPLEMENTED");
}

const DAY = 86400000;
export const utcDate = (date: string) => new Date(date + "T00:00:00.000Z");
export const addDays = (date: string, n: number) =>
  new Date(utcDate(date).getTime() + n * DAY).toISOString().slice(0, 10);

export function cycleByPeriod(ctx: CycleContext, year: number, month: number): Cycle {
  use(ctx);
  const key = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { key, year, month, startDate: key + "-01", endDate: `${key}-${String(days).padStart(2, "0")}`, days };
}
export const cycleByKey = (ctx: CycleContext, key: string) =>
  cycleByPeriod(ctx, Number(key.slice(0, 4)), Number(key.slice(5, 7)));
/** The cycle that contains `date` (YYYY-MM-DD). */
export const getCurrentCycle = (ctx: CycleContext, date: string) =>
  cycleByKey(ctx, date.slice(0, 7));
export const previousCycle = (ctx: CycleContext, c: Cycle) =>
  getCurrentCycle(ctx, addDays(c.startDate, -1));
/** Prisma-ready half-open range [start, end). */
export const cycleBounds = (c: Cycle) => ({
  start: utcDate(c.startDate),
  end: utcDate(addDays(c.endDate, 1)),
});

export function getBudgetTimeline(
  ctx: CycleContext,
  year: number,
  month: number,
  today = bangkokToday(), // ใช้วันที่ประเทศไทย เพื่อให้วันเปลี่ยนตรงกับผู้ใช้
) {
  const cycle = cycleByPeriod(ctx, year, month);
  const current = getCurrentCycle(ctx, today);
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
