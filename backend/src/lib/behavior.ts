import { Prisma } from "@prisma/client";
import {
  BEHAVIOR_RULE as R,
  BEHAVIOR_VERSION,
  D,
  money,
  total,
  shiftDay,
  dayCount,
  recurrenceWindows,
  distinctRecurrenceEvidence,
  findRecurrences,
  type BehaviorRow,
  type Period,
  type Recurrence,
} from "./behaviorRules";

export type BehaviorInput = {
  asOfDate: string;
  period: Period;
  rows: BehaviorRow[];
  categoryOptions: { categoryId: string | null; categoryName: string }[];
  recurrences: Recurrence[];
};
const key = (id: string | null) => id ?? "uncategorized";
function metric(rows: BehaviorRow[], denominator?: Prisma.Decimal) {
  const amount = total(rows.map((r) => r.amount)),
    count = rows.reduce((s, r) => s + r.count, 0);
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  return {
    amount: money(amount),
    transactionCount: count,
    distinctDays: dates.length,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    averagePerTransaction: count ? money(amount.div(count)) : null,
    sharePercent: denominator?.gt(0)
      ? amount.div(denominator).mul(100).toFixed(2)
      : null,
  };
}
function readiness(m: ReturnType<typeof metric>) {
  const span =
    m.firstDate && m.lastDate ? dayCount(m.firstDate, m.lastDate) : 0;
  const reasonCodes = [
    ...(m.transactionCount < R.minimumCount
      ? ["insufficient_expense_count"]
      : []),
    ...(span < R.minimumSpan ? ["insufficient_observed_span"] : []),
  ];
  return {
    ready: !reasonCodes.length,
    expenseCount: m.transactionCount,
    observedSpanDays: span,
    distinctExpenseDays: m.distinctDays,
    reasonCodes,
  };
}
function delta(a: Prisma.Decimal.Value, b: Prisma.Decimal.Value) {
  const diff = new D(a).minus(b);
  return {
    difference: money(diff),
    changePercent: new D(b).isZero() ? null : diff.div(b).mul(100).toFixed(2),
  };
}
function comparison(
  a: ReturnType<typeof metric>,
  b: ReturnType<typeof metric>,
  enabled: boolean,
) {
  if (!enabled) return null;
  return {
    amount: delta(a.amount, b.amount),
    transactionCount: {
      difference: a.transactionCount - b.transactionCount,
      changePercent: b.transactionCount
        ? new D(a.transactionCount - b.transactionCount)
            .div(b.transactionCount)
            .mul(100)
            .toFixed(2)
        : null,
    },
    averagePerTransaction:
      a.transactionCount && b.transactionCount
        ? delta(
            new D(a.amount).div(a.transactionCount),
            new D(b.amount).div(b.transactionCount),
          )
        : null,
    shareDifferencePoints:
      a.sharePercent !== null && b.sharePercent !== null
        ? new D(a.sharePercent).minus(b.sharePercent).toFixed(2)
        : null,
  };
}
export function buildBehavior(input: BehaviorInput) {
  const { period, asOfDate } = input;
  const rows = input.rows.filter(
    (r) =>
      r.count > 0 &&
      r.date >= period.previous.startDate &&
      r.date <= period.current.endDate &&
      (period.categoryId === null || key(r.categoryId) === period.categoryId),
  );
  const currentRows = rows.filter((r) => r.date >= period.current.startDate),
    previousRows = rows.filter((r) => r.date < period.current.startDate);
  const current = metric(currentRows),
    previous = metric(previousRows),
    currentReady = readiness(current),
    previousReady = readiness(previous);
  const ready = currentReady.ready && previousReady.ready;
  const comparisonReasons = [
    ...currentReady.reasonCodes.map((c) => "current_" + c),
    ...previousReady.reasonCodes.map((c) => "previous_" + c),
  ];
  const ids = [...new Set(rows.map((r) => key(r.categoryId)))].sort();
  const categories = ids
    .map((id) => {
      const own = rows.filter((r) => key(r.categoryId) === id);
      const a = metric(
        own.filter((r) => r.date >= period.current.startDate),
        new D(current.amount),
      );
      const b = metric(
        own.filter((r) => r.date < period.current.startDate),
        new D(previous.amount),
      );
      const cmp = comparison(a, b, ready);
      if (cmp && new D(current.amount).gt(0) && new D(previous.amount).gt(0))
        cmp.shareDifferencePoints = new D(a.amount)
          .div(current.amount)
          .minus(new D(b.amount).div(previous.amount))
          .mul(100)
          .toFixed(2);
      const eligible =
        ready &&
        [a, b].every(
          (m) =>
            m.transactionCount >= R.categoryCount &&
            m.distinctDays >= R.categoryDays,
        );
      return {
        categoryId: id === "uncategorized" ? null : id,
        categoryName: own[0]!.categoryName,
        current: a,
        previous: b,
        comparison: cmp,
        findingEligible: eligible,
        findingReasonCodes: eligible
          ? []
          : !ready
            ? ["periods_not_ready"]
            : ["insufficient_category_count_or_days"],
      };
    })
    .sort(
      (a, b) =>
        new D(b.current.amount).cmp(a.current.amount) ||
        key(a.categoryId).localeCompare(key(b.categoryId)),
    );
  const dailyFor = (own: BehaviorRow[], date: string) => {
    const selected = own.filter((r) => r.date === date);
    return {
      date,
      amount: money(total(selected.map((r) => r.amount))),
      transactionCount: selected.reduce((s, r) => s + r.count, 0),
      hasExpenseRecords: selected.length > 0,
    };
  };
  const daily = Array.from({ length: period.days }, (_, i) => ({
    dayIndex: i + 1,
    current: dailyFor(currentRows, shiftDay(period.current.startDate, i)),
    previous: dailyFor(previousRows, shiftDay(period.previous.startDate, i)),
  }));
  const weekdays = Array.from({ length: 7 }, (_, i) => {
    const code = (i + 1) % 7;
    const part = (side: "current" | "previous") => {
      const days = daily
        .map((d) => d[side])
        .filter((d) => new Date(d.date + "T00:00:00Z").getUTCDay() === code);
      const amount = total(days.map((d) => d.amount));
      return {
        calendarOccurrences: days.length,
        recordedDays: days.filter((d) => d.hasExpenseRecords).length,
        amount: money(amount),
        transactionCount: days.reduce((s, d) => s + d.transactionCount, 0),
        averagePerCalendarOccurrence: days.length
          ? money(amount.div(days.length))
          : null,
      };
    };
    const a = part("current"),
      b = part("previous");
    return {
      weekday: i + 1,
      current: a,
      previous: b,
      comparison:
        ready && a.calendarOccurrences && b.calendarOccurrences
          ? delta(
              new D(a.amount).div(a.calendarOccurrences),
              new D(b.amount).div(b.calendarOccurrences),
            )
          : null,
    };
  });
  const timeFor = (
    own: BehaviorRow[],
    m: ReturnType<typeof metric>,
    mainReady: boolean,
  ) => {
    const confirmed = own.filter((r) => r.bucket >= 0),
      n = confirmed.reduce((s, r) => s + r.count, 0);
    const coverage = m.transactionCount
      ? new D(n).div(m.transactionCount)
      : new D(0);
    const reasonCodes = [
      ...(!mainReady ? ["period_not_ready"] : []),
      ...(n < R.timeCount ? ["insufficient_confirmed_time_count"] : []),
      ...(coverage.lt(R.timeCoverage)
        ? ["insufficient_confirmed_time_coverage"]
        : []),
    ];
    return {
      confirmedCount: n,
      excludedCount: m.transactionCount - n,
      coveragePercent: coverage.mul(100).toFixed(2),
      ready: !reasonCodes.length,
      reasonCodes,
      buckets: Array.from({ length: 6 }, (_, i) => {
        const selected = confirmed.filter((r) => r.bucket === i),
          v = metric(selected);
        return {
          bucket: i,
          startHour: i * R.bucketHours,
          endHourExclusive: (i + 1) * R.bucketHours,
          ...v,
          sharePercent: n
            ? new D(v.transactionCount).div(n).mul(100).toFixed(2)
            : null,
        };
      }),
    };
  };
  const timeDistribution = {
    current: timeFor(currentRows, current, currentReady.ready),
    previous: timeFor(previousRows, previous, previousReady.ready),
  };
  const recurrenceCandidates = distinctRecurrenceEvidence(
    currentReady.ready
      ? input.recurrences
          .filter(
            (r) =>
              (period.categoryId === null ||
                key(r.categoryId) === period.categoryId) &&
              r.dates.every(
                (d) =>
                  d >= period.current.startDate && d <= period.current.endDate,
              ),
          )
          .flatMap((r) =>
            recurrenceWindows(r.dates, r.counts)
              .filter((w) => !r.kind || w.kind === r.kind)
              .map((w) => ({
                ...r,
                ...w,
                transactions: (r.transactions ?? []).filter((t) =>
                  w.dates.includes(t.date),
                ),
                occurrenceCount: w.counts.reduce((a, b) => a + b, 0),
                distinctDays: w.dates.length,
                startDate: w.dates[0]!,
                endDate: w.dates[w.dates.length - 1]!,
              })),
          )
      : [],
  );
  type Finding = {
    ruleId: string;
    categoryId: string | null;
    categoryName: string | null;
    title: string;
    recommendation: string;
    evidence: unknown;
    scope: "comparison" | "current";
  };
  const meaningfulIncrease = (c: (typeof categories)[number]) => {
    const diff = new D(c.current.amount).minus(c.previous.amount);
    return (
      diff.gte(R.minimumIncreaseAmount) &&
      diff.gte(new D(c.previous.amount).mul(R.minimumIncreaseShare))
    );
  };
  const categoryFindings: Finding[] = categories
    .filter((c) => c.findingEligible && meaningfulIncrease(c))
    .map((c) => {
      const nUp = c.current.transactionCount > c.previous.transactionCount;
      const aUp = new D(c.current.amount)
        .mul(c.previous.transactionCount)
        .gt(new D(c.previous.amount).mul(c.current.transactionCount));
      const kind = nUp ? (aUp ? "both_up" : "frequency_up") : "average_up";
      const shareIncreased =
        new D(current.amount).gt(0) &&
        new D(previous.amount).gt(0) &&
        new D(c.current.amount)
          .mul(previous.amount)
          .gt(new D(c.previous.amount).mul(current.amount));
      return {
        ruleId: "category_" + kind,
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        scope: "comparison" as const,
        title:
          kind === "frequency_up"
            ? "ยอดเพิ่มพร้อมจำนวนรายการเพิ่ม แต่เฉลี่ยต่อรายการไม่เพิ่ม"
            : kind === "average_up"
              ? "ยอดเพิ่มพร้อมเฉลี่ยต่อรายการเพิ่ม โดยจำนวนรายการไม่เพิ่ม"
              : "ยอด จำนวนรายการ และเฉลี่ยต่อรายการเพิ่มร่วมกัน",
        recommendation:
          (kind === "frequency_up"
            ? "ลองทบทวนความถี่ของรายการในหมวดนี้"
            : kind === "average_up"
              ? "ลองทบทวนรายการที่มีมูลค่าสูงในหมวดนี้"
              : "พิจารณาทั้งจำนวนครั้งและมูลค่าต่อรายการ") +
          (shareIncreased
            ? " ยอดและสัดส่วนเพิ่มร่วมกัน จึงอาจทบทวนการจัดสรรงบหมวดนี้ให้ตรงความต้องการ"
            : ""),
        evidence: {
          current: c.current,
          previous: c.previous,
          comparison: c.comparison,
          shareIncreased,
          supportingRuleIds: shareIncreased
            ? ["category_amount_and_share_up"]
            : [],
        },
      };
    });
  categoryFindings.sort((a, b) => {
    const ca = categories.find((c) => key(c.categoryId) === key(a.categoryId))!,
      cb = categories.find((c) => key(c.categoryId) === key(b.categoryId))!;
    return (
      new D(cb.current.amount)
        .minus(cb.previous.amount)
        .cmp(new D(ca.current.amount).minus(ca.previous.amount)) ||
      key(a.categoryId).localeCompare(key(b.categoryId))
    );
  });
  const references = (selected: BehaviorRow[]) => ({
    transactionCount: selected.reduce((n, r) => n + r.count, 0),
    startDate: selected.map((r) => r.date).sort()[0] ?? null,
    endDate:
      selected
        .map((r) => r.date)
        .sort()
        .reverse()[0] ?? null,
    transactions: selected.flatMap((r) => r.transactions ?? []),
  });
  for (const f of categoryFindings)
    f.evidence = {
      ...(f.evidence as object),
      ...references(rows.filter((r) => r.categoryId === f.categoryId)),
    };
  const findings: Finding[] = [...categoryFindings];
  if (timeDistribution.current.ready)
    for (const b of timeDistribution.current.buckets) {
      if (
        new D(b.transactionCount).gte(
          new D(timeDistribution.current.confirmedCount).mul(R.bucketShare),
        ) &&
        b.distinctDays >= R.bucketDays
      ) {
        findings.push({
          ruleId: "confirmed_time_concentration",
          categoryId: null,
          categoryName: null,
          scope: "current",
          title:
            "พบรายการที่ยืนยันเวลากระจุกในช่วง " +
            String(b.startHour).padStart(2, "0") +
            ":00–" +
            String(b.endHourExclusive).padStart(2, "0") +
            ":00",
          recommendation:
            "ตรวจรายการในช่วงเวลาดังกล่าวเพื่อประเมินว่าเหมาะกับแผนหรือไม่",
          evidence: {
            ...references(currentRows.filter((r) => r.bucket === b.bucket)),
            bucket: b,
            confirmedCount: timeDistribution.current.confirmedCount,
            coveragePercent: timeDistribution.current.coveragePercent,
          },
        });
      }
    }
  // A filtered view is always 100% one category, so dominance only applies to the all-category view.
  if (currentReady.ready && period.categoryId === null)
    for (const c of categories)
      if (
        c.current.transactionCount >= R.categoryCount &&
        c.current.distinctDays >= R.categoryDays &&
        new D(c.current.amount).gte(new D(current.amount).mul(R.dominantShare))
      )
        findings.push({
          ruleId: "category_dominant_share",
          categoryId: c.categoryId,
          categoryName: c.categoryName,
          scope: "current",
          title: "หมวดนี้มีสัดส่วน " + c.current.sharePercent + "% ของรายจ่ายรวมในช่วงที่เลือก",
          recommendation:
            "รายจ่ายส่วนใหญ่อยู่ในหมวดนี้ ลองตั้งงบหมวดนี้แยกเพื่อติดตามยอดได้ชัดขึ้น",
          evidence: {
            ...references(currentRows.filter((r) => r.categoryId === c.categoryId)),
            current: c.current,
          },
        });
  for (const r of recurrenceCandidates.slice(0, R.recurrenceLimit))
    findings.push({
      ruleId: "possible_recurrence_" + r.kind,
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      scope: "current",
      title:
        "พบรายการหมวดเดียวกันยอดใกล้เคียงกันซ้ำ" +
        (r.kind === "weekly"
          ? "ราวทุก 7 วัน"
          : r.kind === "monthly"
            ? "ในเดือนติดกัน"
            : "ภายใน 30 วัน"),
      recommendation:
        "ตรวจรายการประกอบ ไม่ยืนยันว่าเป็นบิลเดียวกันหรืออธิบายสาเหตุการใช้จ่าย",
      evidence: { ...r, transactionCount: r.occurrenceCount },
    });
  return {
    asOfDate,
    timezone: "Asia/Bangkok",
    ruleVersion: BEHAVIOR_VERSION,
    scope: { categoryId: period.categoryId },
    periods: {
      current: period.current,
      previous: period.previous,
      days: period.days,
    },
    categoryOptions: input.categoryOptions,
    status:
      !current.transactionCount && !previous.transactionCount
        ? "no_data"
        : !currentReady.ready
          ? "insufficient_current"
          : !previousReady.ready
            ? "current_only"
            : "comparable",
    readiness: {
      current: currentReady,
      previous: previousReady,
      comparisonReady: ready,
      comparisonReasonCodes: comparisonReasons,
    },
    facts: {
      summary: {
        current,
        previous,
        comparison: comparison(current, previous, ready),
      },
      categories,
      daily,
      weekdayDistribution: weekdays,
      timeDistribution,
      recurrenceCandidates: recurrenceCandidates.slice(0, R.recurrenceLimit),
      recurrence: {
        limit: R.recurrenceLimit,
        hasMore: recurrenceCandidates.length > R.recurrenceLimit,
        reasonCodes: currentReady.ready ? [] : ["current_period_not_ready"],
      },
    },
    findings: findings.map((f) => ({
      ...f,
      findingType:
        f.scope === "comparison"
          ? "period_change"
          : f.ruleId.startsWith("possible_recurrence_")
            ? "recurrence"
            : "time_observation",
    })),
    previewFindingCount: R.findingPreview,
    warningCodes: [
      "recording_completeness_unverified",
      "today_excluded",
      "not_statistical_significance",
      "no_records_not_confirmed_zero",
      "recurrence_not_subscription",
    ],
  };
}
export async function behaviorInput(
  tx: Prisma.TransactionClient,
  userId: string,
  period: Period,
  asOfDate: string,
): Promise<BehaviorInput> {
  const start = new Date(period.previous.startDate + "T00:00:00Z"),
    end = new Date(shiftDay(period.current.endDate, 1) + "T00:00:00Z");
  const scope =
    period.categoryId === null
      ? Prisma.empty
      : period.categoryId === "uncategorized"
        ? Prisma.sql`AND c."id" IS NULL`
        : Prisma.sql`AND c."id" = ${period.categoryId}`;
  const rows = await tx.$queryRaw<BehaviorRow[]>(Prisma.sql`
    SELECT c."id" AS "categoryId", COALESCE(c."name",'ไม่ระบุหมวด') AS "categoryName",
      to_char(t."transactionDate",'YYYY-MM-DD') AS date,
      CASE WHEN t."transactionTimeConfirmed" AND t."transactionTime" IS NOT NULL THEN floor(extract(hour FROM t."transactionTime")/4)::int ELSE -1 END AS bucket,
      count(*)::int AS count, sum(t.amount)::text AS amount,
      jsonb_agg(jsonb_build_object('id',t.id,'date',to_char(t."transactionDate",'YYYY-MM-DD'),'amount',t.amount::text,
        'time',CASE WHEN t."transactionTimeConfirmed" THEN to_char(t."transactionTime",'HH24:MI') ELSE NULL END) ORDER BY t.id) AS transactions
    FROM "Transaction" t LEFT JOIN "Category" c ON c.id=t."categoryId"
    WHERE t."userId"=${userId} AND t.type='expense' AND t."transactionDate">=${start} AND t."transactionDate"<${end} ${scope}
    GROUP BY c.id,c.name,t."transactionDate",bucket ORDER BY t."transactionDate",c.id,bucket`);
  const categoryOptions = await tx.$queryRaw<
    BehaviorInput["categoryOptions"]
  >(Prisma.sql`
    SELECT c.id AS "categoryId",COALESCE(c.name,'ไม่ระบุหมวด') AS "categoryName"
    FROM "Transaction" t LEFT JOIN "Category" c ON c.id=t."categoryId"
    WHERE t."userId"=${userId} AND t.type='expense' AND t."transactionDate">=${start} AND t."transactionDate"<${end}
    GROUP BY c.id,c.name ORDER BY "categoryName",c.id`);
  if (
    !readiness(metric(rows.filter((r) => r.date >= period.current.startDate)))
      .ready
  )
    return { asOfDate, period, rows, categoryOptions, recurrences: [] };
  // Amount/date tolerances cannot be expressed as exact-amount SQL partitions, so recurrence
  // is searched in Node over the already-loaded, date-bounded per-transaction evidence.
  // Containment dedup here keeps the previous contract: input recurrences are already distinct.
  const recurrences = distinctRecurrenceEvidence(
    findRecurrences(rows.filter((r) => r.date >= period.current.startDate)),
  );
  return { asOfDate, period, rows, categoryOptions, recurrences };
}
