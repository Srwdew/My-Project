import { prisma } from "./prisma";
import { loadAlerts } from "./alerts";

type Card = Awaited<ReturnType<typeof loadAlerts>>["cards"][number];
const RECORDED_ONLY = "ประเมินจากรายการที่บันทึก ไม่รวมรายจ่ายที่ยังไม่ได้บันทึก";
const money = (v: unknown) => Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = new Intl.DateTimeFormat("th-TH", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const MAX_USEFUL_MONTHS = 50 * 12; // past this a year count tells the user nothing they can act on (owner's starting point, 4 Nov 2026)

export function extendText(months: number) {
  if (months > MAX_USEFUL_MONTHS) return "ยืดเวลาอย่างเดียวไม่พอสำหรับเป้านี้";
  const years = Math.floor(months / 12), rest = months % 12;
  return "ยืดเวลาเป็น " + [years ? `${years} ปี` : "", rest ? `${rest} เดือน` : ""].filter(Boolean).join(" ");
}

const budgetLine = (c: Card) => (Number(c.overBudget) > 0 ? `ใช้เกินงบแล้ว ${money(c.overBudget)} บาท` : `งบเหลือ ${money(c.budgetLeft)} บาท`);

export function alertText(c: Card): { title: string; message: string; link: string } {
  if (c.tier === 1)
    return { title: "งบอาจไม่พอถึงสิ้นเดือน", link: "/budget", message: `${budgetLine(c)} อีก ${c.daysLeft} วันถึงสิ้นเดือน${c.perDay ? ` ใช้ได้วันละ ${c.perDay} บาท` : ""} ${RECORDED_ONLY}` };
  if (c.code === "pace_over_next_cycle")
    return { title: "ต้นเดือนหน้าอาจใช้เร็วกว่างบ", link: "/budget", message: `เทียบ ${c.spanDays} วันแรกของเดือนหน้ากับงบเดือนหน้าที่ตั้งไว้ ${RECORDED_ONLY}` };
  if (c.tier === 2)
    return { title: "7 วันข้างหน้าอาจใช้เร็วกว่างบ", link: "/budget", message: `${budgetLine(c)}${c.perDay ? ` เฉลี่ยใช้ได้วันละ ${c.perDay} บาท จนถึงสิ้นเดือน` : ""} ${RECORDED_ONLY}` };
  if (c.tier === 3) {
    const available = Number(c.availableMonthly);
    const alt = c.alternatives as { budgetReductionAlonePossible: boolean; targetBudget: string | null; targetIncome: string } | null;
    const one = c.goalOptions as { extendToMonths: number | null; lowerTargetTo: string | null } | null;
    const options = [
      alt?.budgetReductionAlonePossible && alt.targetBudget ? `ลดงบเหลือ ${money(alt.targetBudget)} บาท` : "",
      alt ? `เพิ่มรายได้เป็น ${money(alt.targetIncome)} บาท` : "",
      one?.extendToMonths != null ? extendText(one.extendToMonths) : "",
      one?.lowerTargetTo != null ? `ลดยอดเป้าเหลือ ${money(one.lowerTargetTo)} บาท` : "",
    ].filter(Boolean).join(" · ");
    const base = available < 0 ? `รายได้ที่ตั้งไว้น้อยกว่างบ ${money(-available)} บาท/เดือน` : `ตามรายได้และงบที่ตั้งไว้เหลือ ${money(c.availableMonthly)} บาท/เดือน`;
    return {
      title: "เป้าออมรวมสูงกว่าเงินที่เหลือตามแผน",
      link: "/goals",
      message: [
        `ต้องออมรวม ${money(c.requiredMonthly)} บาท/เดือน ${base} ขาด ${money(c.shortfall)} บาท/เดือน`,
        options,
        c.goalOptionsUnavailable ? "มีหลายเป้าที่ใช้เงินเหลือก้อนเดียวกัน จึงยังคำนวณยืดเวลาหรือลดยอดแยกรายเป้าไม่ได้" : "",
        "เงินที่เก็บเข้าเป้าหมายไม่ต้องบันทึกเป็นรายจ่าย",
      ].filter(Boolean).join(" "),
    };
  }
  return {
    title: "รายการนี้รอคุณตรวจ",
    link: `/transactions/${c.id}/anomaly`,
    message: `${c.categoryName} ${money(c.amount)} บาท วันที่ ${day.format(new Date(`${c.date}T00:00:00Z`))} ต่างจากแบบที่เคยบันทึก ${RECORDED_ONLY}`,
  };
}

// One notice per card per cycle: the unique (userId, eventKey) means reloading never repeats it, and figures stay as first raised.
export const alertEventKey = (cycleKey: string, c: Card) => `alert:${cycleKey}:${c.code}${c.tier === 4 ? ":" + c.id : ""}`;

export async function syncAlertNotifications(userId: string, today: string) {
  await prisma.$transaction(async (tx) => {
    const { cycle, cards } = await loadAlerts(tx, userId, today);
    // A flagged item may already have its own anomaly notice; a second one for it would be a duplicate in the bell.
    const flagged = cards.filter((c) => c.tier === 4).map((c) => "transaction-anomaly:" + c.id);
    const told = new Set((await tx.notification.findMany({ where: { userId, eventKey: { in: flagged } }, select: { eventKey: true } })).map((n) => n.eventKey));
    await tx.notification.createMany({
      skipDuplicates: true,
      data: cards
        .filter((c) => !told.has("transaction-anomaly:" + c.id))
        .map((c) => {
          const text = alertText(c);
          // The figures stay as first raised for the whole cycle, so say which day they describe.
          return { userId, type: "alert_layer" as const, eventKey: alertEventKey(cycle.key, c), sourceId: c.tier === 4 ? String(c.id) : null, ...text, message: `ณ วันที่ ${day.format(new Date(`${today}T00:00:00Z`))}: ${text.message}` };
        }),
    });
  });
}
