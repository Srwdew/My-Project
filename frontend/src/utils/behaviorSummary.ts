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
// Longer titles use a smaller size on phones to stay within two lines; text is never cut.
export const bannerTitleClass = (title: string) => (title.length > 80 ? "banner-title-xlong" : title.length > 60 ? "banner-title-long" : "");
export const DECREASE_SHARE = 0.05, DECREASE_AMOUNT = 100; // R9's minimums, from BEHAVIOR_RULE

type Metric = { amount: string; transactionCount: number; averagePerTransaction: string | null };
export type BehaviorSummaryView = {
  status: string;
  readiness: { current: { ready: boolean; expenseCount: number; observedSpanDays: number }; comparisonReady: boolean };
  findings: readonly { ruleId: string; categoryName: string | null; evidence: unknown }[];
  facts: {
    summary: { current: Metric; comparison: { amount: { difference: string } } | null };
    categories: readonly { categoryName: string; current: { amount: string; transactionCount: number; sharePercent: string | null }; previous?: { amount: string } }[];
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
  const spent = view.facts.categories.filter((c) => c.current.transactionCount > 0);
  const highest = Math.max(0, ...spent.map((c) => Number(c.current.amount)));
  const leaders = spent.filter((c) => Number(c.current.amount) === highest);
  const days = view.facts.weekdayDistribution.filter((w) => w.current.averagePerCalendarOccurrence !== null && Number(w.current.amount) > 0);
  const topAverage = Math.max(0, ...days.map((w) => Number(w.current.averagePerCalendarOccurrence)));
  const topDays = days.filter((w) => Number(w.current.averagePerCalendarOccurrence) === topAverage);
  const daySuffix = topDays.length === 1 ? " เฉลี่ยสูงสุดวัน" + weekdayNames[topDays[0]!.weekday - 1] : "";
  // Same test R9 uses for "a category fell" (mirrors BEHAVIOR_RULE; behaviorSummary.frontend.test keeps them equal).
  const fell = comparable
    ? view.facts.categories
        .map((c) => ({ name: c.categoryName, cur: Number(c.current.amount), prev: Number(c.previous?.amount ?? 0) }))
        .filter((c) => c.cur < c.prev * (1 - DECREASE_SHARE) && c.cur < c.prev - DECREASE_AMOUNT)
        .sort((a, b) => b.prev - b.cur - (a.prev - a.cur))
    : [];
  const title = increase
    ? "ช่วงนี้ใช้จ่ายมากขึ้น ส่วนใหญ่มาจาก" +
      (increase.categoryName ?? "ไม่ระบุหมวด") +
      increaseCause[increase.ruleId]
    : fell.length
      ? "ช่วงนี้ใช้จ่ายกับ" + fell[0]!.name + "ลดลง"
      : spent.length === 1
        ? "ช่วงนี้รายจ่ายทั้งหมดอยู่ในหมวด" + spent[0]!.categoryName + daySuffix
        : leaders.length === 1
          ? "ช่วงนี้ใช้จ่ายกับ" + leaders[0]!.categoryName + "มากที่สุด" + daySuffix
          : leaders.length === 2
            ? "ช่วงนี้ใช้จ่ายกับ" + leaders[0]!.categoryName + "และ" + leaders[1]!.categoryName + "เท่ากัน" + daySuffix
            : leaders.length > 2
              ? "ช่วงนี้มีหลายหมวดที่ใช้จ่ายเท่ากัน" + daySuffix
              : "สรุปช่วงนี้" + daySuffix;
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
  } else if (top && top.current.transactionCount > 0 && leaders.length === 1)
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
  // No expenses at all also fails the gate, so it is checked first or its own message could never show.
  if (view.status === "no_data" || (!c.ready && c.expenseCount === 0))
    return { title: "ยังไม่มีรายจ่ายที่บันทึกในช่วงนี้", note: null, text: "บันทึกรายจ่ายเพื่อเริ่มสรุปพฤติกรรม" };
  if (!c.ready) {
    const items = Math.max(0, MINIMUM - c.expenseCount), days = Math.max(0, MINIMUM - c.observedSpanDays);
    return {
      title: "ยังสรุปไม่ได้ " + [items ? `บันทึกอีก ${items} รายการ` : "", days ? `ให้ครอบคลุมอีก ${days} วัน` : ""].filter(Boolean).join(" "),
      note: null,
      text: `ต้องมีรายจ่ายอย่างน้อย ${MINIMUM} รายการ และครอบคลุม ${MINIMUM} วัน`,
    };
  }
  const s = behaviorSummary(view);
  return {
    title: s.title,
    text: s.sentences.join(" · "),
    note: view.readiness.comparisonReady ? null : "ยังเทียบช่วงก่อนไม่ได้",
  };
}
