import { Prisma } from "@prisma/client";
import { FORECAST_ROUND_TO, PERCENT_DISPLAY_DECIMALS, MONEY_DISPLAY_DECIMALS } from "./config";
import type { Facts, RuleId, RuleResult } from "./types";

// Display rounding happens here only. Rules and `computed` keep raw values, so the log has full precision.
const fmt = (d: Prisma.Decimal, digits: number) =>
  d.toDecimalPlaces(digits, Prisma.Decimal.ROUND_HALF_UP).toNumber().toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
// Past actual amounts: whole baht.
export const actualBaht = (d: Prisma.Decimal) => fmt(d, MONEY_DISPLAY_DECIMALS);
// D-8: anything that comes from the forecast is rounded to the nearest hundred.
export const forecastBaht = (d: Prisma.Decimal) =>
  fmt(d.div(FORECAST_ROUND_TO).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).mul(FORECAST_ROUND_TO), 0);
export const percent = (v: unknown) => fmt(new Prisma.Decimal(String(v)), PERCENT_DISPLAY_DECIMALS);
// A percentage that was compared with a threshold always rounds up, so "over 15%" never shows as "15%".
export const percentOver = (v: unknown) =>
  new Prisma.Decimal(String(v)).toDecimalPlaces(PERCENT_DISPLAY_DECIMALS, Prisma.Decimal.ROUND_CEIL).toNumber().toLocaleString("th-TH");

export type Template = (r: { what: Facts; action: Facts; outcome: Facts }) => { what: string; action: string; outcome: string };
const b = (v: unknown) => actualBaht(new Prisma.Decimal(String(v)));
const fb = (v: unknown) => forecastBaht(new Prisma.Decimal(String(v)));
const hh = (v: unknown) => String(v).padStart(2, "0") + ":00";
const thDate = (v: unknown) => new Date(String(v) + "T00:00:00Z").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const thMonth = (v: unknown) => new Date(String(v) + "-01T00:00:00Z").toLocaleDateString("th-TH", { month: "short", year: "numeric", timeZone: "UTC" });
// Wording changes go here and never bump ruleVersion. Rules on Behavior's window say "N วันที่ผ่านมา", not "รอบนี้".
export const TEMPLATES: Partial<Record<RuleId, Template>> = {
  R2: ({ what, action, outcome }) => ({
    what: `${what.day} วันแรกของรอบนี้ใช้ไป ${b(what.spentToDate)} บาท สูงกว่าช่วงเดียวกันของ 3 รอบก่อนที่ ${b(what.usualToDate)} บาท อยู่ ${percentOver(what.overPercent)}%`,
    // "ปกติ" is R5's word for share; R2 says "จังหวะเดิม" so one page never uses one word two ways.
    action: `ถ้า ${action.remainingDays} วันที่เหลือใช้น้อยกว่าจังหวะเดิมรวม ${b(action.reduceBy)} บาท`,
    outcome: "ยอดทั้งรอบจะกลับมาเท่าจังหวะเดิม",
  }),
  R3: ({ what, outcome }) => ({
    what: `หมวด ${what.categoryName} เพิ่มขึ้นใน ${what.windowDays} วันที่ผ่านมา จาก ${b(what.previousAmount)} เป็น ${b(what.currentAmount)} บาท คิดเป็น ${percentOver(what.shareOfIncreasePercent)}% ของยอดที่เพิ่มขึ้นทั้งหมด`,
    action: "ถ้าหมวดนี้กลับไปอยู่ระดับเดิม",
    outcome: `จะลดลง ${b(outcome.reduceBy)} บาท`,
  }),
  R4: ({ what, action, outcome }) => ({
    what:
      what.kind === "time"
        ? `รายการช่วง ${hh(what.startHour)}–${hh(what.endHour)} เกิดขึ้น ${what.occurrences} ครั้งใน ${what.windowDays} วันที่ผ่านมา รวม ${b(what.totalAmount)} บาท`
        : `หมวด ${what.categoryName} มีรายการยอดใกล้เคียงกันซ้ำ ${what.occurrences} ครั้งใน ${what.windowDays} วันที่ผ่านมา รวม ${b(what.totalAmount)} บาท`,
    action: `ถ้าลดลง ${action.fewerTimes} ครั้งใน ${what.windowDays} วัน`,
    outcome: `จะลดลงราว ${b(outcome.saveAbout)} บาท`,
  }),
  R5: ({ what, outcome }) => ({
    what: `ใน ${what.windowDays} วันที่ผ่านมา หมวด ${what.categoryName} คิดเป็น ${percent(what.sharePercent)}% ของรายจ่ายทั้งหมด ปกติอยู่ที่ราว ${percent(what.usualSharePercent)}%`,
    action: "ถ้าหมวดนี้กลับไปอยู่ที่สัดส่วนปกติ",
    outcome: `จะลดลงราว ${b(outcome.reduceBy)} บาท`,
  }),
  R6: ({ what, action, outcome }) => ({
    what: `เป้า ${what.goalName} ต้องเก็บเดือนละ ${b(what.requiredPerMonth)} บาท แต่เดือน ${thMonth(what.month)} มีเงินเหลือจริง ${b(what.leftLastMonth)} บาท`,
    action: `ถ้าเงินเหลือต่อเดือนเพิ่มขึ้นอีก ${b(action.addPerMonth)} บาท`,
    outcome: `จะเก็บส่วนที่เหลือ ${b(outcome.remaining)} บาท ได้ทันวันที่ ${thDate(outcome.targetDate)}`,
  }),
  R7: ({ what, action, outcome }) => ({
    what: `ใน ${what.windowDays} วันที่ผ่านมา หมวด ${what.categoryName} ใช้ไป ${b(what.currentAmount)} บาท ปกติอยู่ที่ ${b(what.usualAmount)} บาท`,
    action: `ถ้าลดหมวดนี้ลง ${b(action.reduceBy)} บาท ให้กลับไปเท่าปกติ`,
    // "ราว": a 30-day window's cut is counted as one cycle's saving. TODO(C5 phase 2): exact once cycles follow payday.
    outcome: `เป้า ${what.goalName} จะถึงเร็วขึ้นราว ${outcome.cyclesSooner} รอบ (จาก ${outcome.cyclesNow} เหลือ ${outcome.cyclesWithCut} รอบ)`,
  }),
  R8: ({ what, action, outcome }) =>
    what.kind === "current_negative"
      ? {
          what: `รอบนี้ถึงวันนี้ใช้ไป ${b(what.spentToDate)} บาท มากกว่ารายได้ของรอบ ${b(what.income)} บาท อยู่ ${b(what.over)} บาท`,
          action: `ถ้า ${action.remainingDays} วันที่เหลือใช้น้อยลงรวม ${b(action.reduceBy)} บาท`,
          outcome: `รายจ่ายรอบนี้จะไม่เกินรายได้ ${b(outcome.income)} บาท`,
        }
      : {
          what:
            what.kind === "last_negative"
              ? `เดือน ${thMonth(what.month)} ใช้จ่ายมากกว่ารายได้ ${b(what.over)} บาท`
              : `เดือน ${thMonth(what.month)} ออมได้ ${percent(what.ratePercent)}% ของรายได้ ต่ำกว่าเกณฑ์ที่คุณตั้งไว้ ${percent(what.floorPercent)}%`,
          action: `ถ้าใช้น้อยลงเดือนละ ${b(action.spendLessPerMonth)} บาท`,
          outcome: what.kind === "last_negative" ? "รายจ่ายต่อเดือนจะไม่เกินรายได้" : `อัตราออมจะถึง ${percent(outcome.targetPercent)}% ตามที่ตั้งไว้`,
        },
  R9: ({ what, outcome }) => ({
    what:
      what.kind === "saving_rate"
        ? `เดือน ${thMonth(what.month)} ออมได้ ${percent(what.ratePercent)}% ของรายได้ ดีขึ้น ${percentOver(what.improvedPoints)} จุดจากเดือน ${thMonth(what.previousMonth)}`
        : `ใน ${what.windowDays} วันที่ผ่านมา หมวด ${what.categoryName} ลดลง ${b(what.decrease)} บาทจาก 30 วันก่อนหน้า (จาก ${b(what.previousAmount)} เป็น ${b(what.currentAmount)} บาท)`,
    action: "ถ้ารักษาระดับนี้ไว้",
    outcome:
      `จะเก็บเงินได้เพิ่มราว ${b(outcome.savedMore)} บาท${what.kind === "saving_rate" ? "ต่อเดือน" : "ต่อรอบ"}` +
      (Number(outcome.cyclesSooner) > 0 ? ` และเป้า ${outcome.goalName} จะถึงเร็วขึ้นราว ${outcome.cyclesSooner} รอบ` : ""),
  }),
  // Only forecast-derived figures go through fb(); the category amount is an actual and stays exact to the baht.
  R1: ({ what, action, outcome }) => ({
    what: `ใน ${what.horizonDays} วันข้างหน้าคาดว่าจะใช้เกินเงินที่เหลืออยู่ ${fb(what.shortfall)} บาท`,
    action: `หมวดยืดหยุ่นที่ใช้มากที่สุดในรอบก่อนคือ ${action.topFlexibleCategoryName} ที่ ${b(action.topFlexibleAmount)} บาท`,
    outcome: `ถ้าลดรายจ่ายในหมวดยืดหยุ่นรวมกันได้ ${fb(outcome.reduceBy)} บาท จะไม่ใช้เกินเงินที่เหลือในรอบนี้`, // not "งบ": R1 never uses Budget
  }),
};

export function render(r: RuleResult, templates: Partial<Record<RuleId, Template>> = TEMPLATES) {
  const t = templates[r.ruleId];
  if (!t) throw Error("NO_TEMPLATE:" + r.ruleId);
  return t(r);
}
