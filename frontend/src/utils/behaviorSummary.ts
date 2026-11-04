import { moneyText } from "./dashboard";

// Shared by the Behavior page and Overview banners, so the two can never say different things.
export const cash = (v: string | null) => (v === null ? "—" : moneyText(v) + " บาท");
export const percent = (v: string | null) => (v === null ? "—" : v + "%");
const weekdayNames = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];
const increaseCause: Record<string, string> = {
  category_frequency_up: "ที่ซื้อบ่อยขึ้น",
  category_average_up: "ที่จ่ายต่อครั้งสูงขึ้น",
  category_both_up: "ที่ทั้งบ่อยขึ้นและจ่ายต่อครั้งสูงขึ้น",
};
const recurrenceNames: Record<string, string> = {
  monthly: "รายเดือน",
  weekly: "รายสัปดาห์",
  general: "ทั่วไป",
};
const MINIMUM = 30; // BEHAVIOR_RULE minimumCount and minimumSpan: both 30

type Metric = { amount: string; transactionCount: number; averagePerTransaction: string | null };
export type BehaviorSummaryView = {
  status: string;
  readiness: { current: { ready: boolean; expenseCount: number; observedSpanDays: number }; comparisonReady: boolean };
  findings: readonly { ruleId: string; categoryName: string | null; evidence: unknown }[];
  facts: {
    summary: { current: Metric; comparison: { amount: { difference: string } } | null };
    categories: readonly { categoryName: string; current: { transactionCount: number; sharePercent: string | null } }[];
    weekdayDistribution: readonly { weekday: number; current: { amount: string; averagePerCalendarOccurrence: string | null } }[];
  };
};

// Behavior summary banner (user-approved 25 Oct 2026): up to 3 sentences —
// total, category (increase finding > top share), pattern (recurrence > time > weekday).
// Uses backend findings only; decreases and sub-threshold increases are stated as facts.
export function behaviorSummary(view: BehaviorSummaryView): { title: string; sentences: string[] } {
  const { current, comparison } = view.facts.summary;
  const comparable = view.readiness.comparisonReady && comparison !== null;
  const increase = view.findings.find((f) => f.ruleId in increaseCause);
  const diff = comparable ? Number(comparison!.amount.difference) : 0;
  const title = increase
    ? "ช่วงนี้ใช้จ่ายมากขึ้น ส่วนใหญ่มาจาก" +
      (increase.categoryName ?? "ไม่ระบุหมวด") +
      increaseCause[increase.ruleId]
    : !comparable
      ? "สรุปช่วงนี้"
      : diff > 0
        ? "ช่วงนี้ใช้จ่ายมากกว่าช่วงก่อน"
        : diff < 0
          ? "ช่วงนี้ใช้จ่ายน้อยกว่าช่วงก่อน"
          : "ช่วงนี้ใช้จ่ายเท่ากับช่วงก่อน";
  const sentences = [
    comparable
      ? "ใช้ " + cash(current.amount) +
        (diff === 0
          ? " เท่ากับช่วงก่อน"
          : (diff > 0 ? " มากกว่า" : " น้อยกว่า") +
            "ช่วงก่อน " + cash(comparison!.amount.difference.replace("-", "")))
      : "ใช้ " + cash(current.amount) + " จาก " + current.transactionCount + " รายการ",
  ];
  const top = view.facts.categories[0];
  if (increase) {
    const e = increase.evidence as { current: Metric; previous: Metric };
    sentences.push(
      (increase.categoryName ?? "ไม่ระบุหมวด") +
        " จำนวนครั้ง " + e.previous.transactionCount + " → " + e.current.transactionCount +
        " เฉลี่ยต่อครั้ง " + cash(e.previous.averagePerTransaction) +
        " → " + cash(e.current.averagePerTransaction),
    );
  } else if (top && top.current.transactionCount > 0)
    sentences.push(
      "ส่วนใหญ่ไปที่" + top.categoryName + " (" + percent(top.current.sharePercent) + ")",
    );
  const recurrences = view.findings.filter((f) =>
    f.ruleId.startsWith("possible_recurrence_"),
  );
  const time = view.findings.find((f) => f.ruleId === "confirmed_time_concentration");
  const busiest = view.facts.weekdayDistribution
    .filter((w) => w.current.averagePerCalendarOccurrence !== null && Number(w.current.amount) > 0)
    .sort(
      (a, b) =>
        Number(b.current.averagePerCalendarOccurrence) -
          Number(a.current.averagePerCalendarOccurrence) || a.weekday - b.weekday,
    )[0];
  if (recurrences.length) {
    const counts = Object.keys(recurrenceNames)
      .map((k) => [k, recurrences.filter((f) => f.ruleId === "possible_recurrence_" + k).length] as const)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => recurrenceNames[k] + " " + n);
    sentences.push("พบรายจ่ายซ้ำ " + recurrences.length + " รูปแบบ (" + counts.join(", ") + ")");
  } else if (time) {
    const b = (time.evidence as { bucket: { startHour: number; endHourExclusive: number } }).bucket;
    const hh = (h: number) => String(h).padStart(2, "0") + ":00";
    sentences.push(
      "รายการที่ยืนยันเวลาส่วนใหญ่อยู่ช่วง " + hh(b.startHour) + "–" + hh(b.endHourExclusive),
    );
  } else if (busiest)
    sentences.push(
      "เฉลี่ยใช้มากที่สุดวัน" + weekdayNames[busiest.weekday - 1] +
        " (" + cash(busiest.current.averagePerCalendarOccurrence) + " ต่อวัน)",
    );
  return { title, sentences };
}

/** Banner title and line, including the states with too little data. */
export function behaviorBanner(view: BehaviorSummaryView) {
  const c = view.readiness.current;
  if (!c.ready)
    return {
      title: "ยังสรุปพฤติกรรมไม่ได้",
      note: null,
      text: view.status === "no_data"
        ? "ยังไม่มีรายจ่ายที่บันทึกในช่วงนี้"
        : `บันทึกรายจ่ายอีก ${Math.max(0, MINIMUM - c.expenseCount)} รายการ และให้ครอบคลุมอีก ${Math.max(0, MINIMUM - c.observedSpanDays)} วัน`,
    };
  const s = behaviorSummary(view);
  return {
    title: s.title,
    text: s.sentences.join(" · "),
    note: view.readiness.comparisonReady ? null : "ยังเทียบช่วงก่อนไม่ได้",
  };
}
