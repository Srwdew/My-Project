import { thaiDate } from "../utils/thaiDate";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import SummaryCard from "../components/SummaryCard";
import {
  ArrowUpRight,
  Calculator,
  ChartPie,
  CirclePlus,
  ReceiptText,
} from "lucide-react";
import { apiFetch } from "../api";
import { getToken, useSessionKey } from "../auth";
import { bangkokDate, moneyText } from "../utils/dashboard";
import { bannerTitleClass, behaviorBanner, cash, percent } from "../utils/behaviorSummary";
import BudgetIcon from "../components/BudgetIcon";
import { categoryAppearance } from "../utils/categoryAppearance";
import Dropdown, { TagIcon } from "../components/Dropdown";
import DatePill from "../components/DatePill";
import { PageRecommendations } from "../components/OverviewInsights";
import "./Behavior.css";

type Metric = {
  amount: string;
  transactionCount: number;
  distinctDays: number;
  averagePerTransaction: string | null;
  sharePercent: string | null;
};
type Difference = {
  amount: { difference: string; changePercent: string | null };
  transactionCount: { difference: number; changePercent: string | null };
  averagePerTransaction: {
    difference: string;
    changePercent: string | null;
  } | null;
  shareDifferencePoints: string | null;
};
type Readiness = {
  ready: boolean;
  expenseCount: number;
  observedSpanDays: number;
  distinctExpenseDays: number;
  reasonCodes: string[];
};
type Day = {
  date: string;
  amount: string;
  transactionCount: number;
  hasExpenseRecords: boolean;
};
type Category = {
  categoryId: string | null;
  categoryName: string;
  current: Metric;
  previous: Metric;
  comparison: Difference | null;
  findingEligible: boolean;
  findingReasonCodes: string[];
};
type Time = {
  confirmedCount: number;
  excludedCount: number;
  coveragePercent: string;
  ready: boolean;
  reasonCodes: string[];
  buckets: (Metric & {
    bucket: number;
    startHour: number;
    endHourExclusive: number;
  })[];
};
type Week = {
  calendarOccurrences: number;
  recordedDays: number;
  amount: string;
  transactionCount: number;
  averagePerCalendarOccurrence: string | null;
};
type EvidenceRow = {
  id: string;
  date: string;
  amount: string;
  time: string | null;
};
type Finding = {
  ruleId: string;
  categoryId: string | null;
  categoryName: string | null;
  scope: string;
  title: string;
  recommendation: string;
  evidence: unknown;
};
type View = {
  asOfDate: string;
  ruleVersion: string;
  status: string;
  periods: {
    current: { startDate: string; endDate: string };
    previous: { startDate: string; endDate: string };
    days: number;
  };
  categoryOptions: { categoryId: string | null; categoryName: string }[];
  readiness: {
    current: Readiness;
    previous: Readiness;
    comparisonReady: boolean;
    comparisonReasonCodes: string[];
  };
  facts: {
    summary: {
      current: Metric;
      previous: Metric;
      comparison: Difference | null;
    };
    categories: Category[];
    daily: { dayIndex: number; current: Day; previous: Day }[];
    weekdayDistribution: {
      weekday: number;
      current: Week;
      previous: Week;
      comparison: { difference: string; changePercent: string | null } | null;
    }[];
    timeDistribution: { current: Time; previous: Time };
    recurrenceCandidates: {
      categoryId: string | null;
      categoryName: string;
      amount: string;
      dates: string[];
      kind: string;
      transactions?: EvidenceRow[];
      occurrenceCount?: number;
      startDate?: string;
      endDate?: string;
    }[];
    recurrence: { hasMore: boolean; limit: number; reasonCodes: string[] };
  };
  findings: Finding[];
  previewFindingCount: number;
};
const reasons: Record<string, string> = {
  insufficient_expense_count: "รายจ่ายยังไม่ครบ 30 รายการ",
  insufficient_observed_span: "ระยะจากรายการแรกถึงสุดท้ายยังไม่ครบ 30 วัน",
  insufficient_confirmed_time_count: "เวลาที่ยืนยันยังไม่ครบ 30 รายการ",
  insufficient_confirmed_time_coverage: "เวลาที่ยืนยันครอบคลุมไม่ถึง 80%",
  period_not_ready: "ข้อมูลช่วงนี้ยังไม่ผ่านเกณฑ์หลัก",
  current_period_not_ready: "ช่วงปัจจุบันยังไม่พร้อมสรุปแบบแผน",
  periods_not_ready: "มีช่วงที่ยังไม่พร้อมเปรียบเทียบ",
  insufficient_category_count_or_days:
    "รายหมวดยังไม่ครบ 5 รายการใน 3 วันต่อช่วง",
};
// "26 ก.ย. 2569" -> "26 ก.ย." for compact axis labels.
const shortDate = (v?: string) => thaiDate(v).split(" ").slice(0, 2).join(" ");
function CategoryIcon({ name, small }: { name: string; small?: boolean }) {
  const look = categoryAppearance(name);
  return (
    <span
      className={"behavior-category-dot" + (small ? " is-small" : "")}
      aria-hidden="true"
      style={{ color: look.color, background: look.background }}
    >
      <BudgetIcon name={look.icon} />
    </span>
  );
}
// One status row: icon, name, and the existing status wording as a tone-coded chip.
function StatusRow({ name, text, tone }: { name: string; text: string; tone: "found" | "none" | "wait" }) {
  return (
    <li className="behavior-status-row">
      {name === "เวลา" ? <span className="behavior-category-dot is-small" aria-hidden="true">🕒</span> : <CategoryIcon name={name} small />}
      <span className="behavior-status-name">{name}</span>
      <span className={"behavior-status-chip is-" + tone}>{text}</span>
    </li>
  );
}
const shift = (date: string, n: number) => {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
function Table({
  caption,
  children,
}: {
  caption: string;
  children: ReactNode;
}) {
  return (
    <div
      className="behavior-table"
      role="region"
      aria-label={caption}
      tabIndex={0}
    >
      <table>
        <caption>{caption}</caption>
        {children}
      </table>
    </div>
  );
}
function Ready({ label, value }: { label: string; value: Readiness }) {
  return (
    <div className="behavior-readiness-item">
      <div className="behavior-readiness-heading">
        <strong>{label}</strong>
        <span
          className={
            "behavior-status-tag " +
            (value.ready ? "is-ready" : "is-insufficient")
          }
        >
          {value.ready ? "ผ่านเกณฑ์" : "ยังสรุปแบบแผนไม่ได้"}
        </span>
      </div>
      <p>
        {value.expenseCount} รายการ · ระยะข้อมูล {value.observedSpanDays} วัน ·
        วันที่มีรายการ {value.distinctExpenseDays} วัน
      </p>
      {value.reasonCodes.length > 0 && (
        <p className="behavior-readiness-reasons">
          {value.reasonCodes.map((r) => reasons[r] ?? r).join(" · ")}
        </p>
      )}
    </div>
  );
}
function CategoryLabel({ name }: { name: string }) {
  return name.length > 70 ? (
    <details className="behavior-full-name">
      <summary>
        <span>{name}</span>
        <small>ดูชื่อหมวดเต็ม</small>
      </summary>
      <p>{name}</p>
    </details>
  ) : (
    <span>{name}</span>
  );
}

export default function Behavior() {
  const session = useSessionKey(),
    [today, setToday] = useState(bangkokDate);
  useEffect(() => {
    const tick = () => setToday(bangkokDate());
    const timer = window.setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, []);
  return (
    <BehaviorBody key={session + ":" + today} session={session} today={today} />
  );
}
function BehaviorBody({
  session,
  today,
}: {
  session: string | null;
  today: string;
}) {
  const [params, setParams] = useSearchParams(),
    query = params.toString(),
    yesterday = shift(today, -1);
  const start = params.get("startDate") ?? shift(yesterday, -29),
    end = params.get("endDate") ?? yesterday,
    category = params.get("categoryId") ?? "";
  const preset =
    end === yesterday
      ? ([7, 30, 90]
          .find((n) => start === shift(yesterday, 1 - n))
          ?.toString() ?? "custom")
      : "custom";
  const [custom, setCustom] = useState(preset === "custom"),
    [draftStart, setDraftStart] = useState(start),
    [draftEnd, setDraftEnd] = useState(end);
  const [snapshot, setSnapshot] = useState<{
      query: string;
      view: View;
    } | null>(null),
    [options, setOptions] = useState<View["categoryOptions"]>([]);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [showAll, setShowAll] = useState(false);
  useEffect(() => {
    setDraftStart(start);
    setDraftEnd(end);
    if (preset === "custom") setCustom(true);
  }, [start, end, preset]);
  const realDay = (v: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v + "T00:00:00Z")) &&
    new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
  const validDraft =
    realDay(draftStart) &&
    realDay(draftEnd) &&
    draftStart <= draftEnd &&
    draftEnd <= yesterday &&
    (Date.parse(draftEnd) - Date.parse(draftStart)) / 86400000 < 366;
  const applyDates = (a: string, b: string) => {
    if (
      realDay(a) &&
      realDay(b) &&
      a <= b &&
      b <= yesterday &&
      (Date.parse(b) - Date.parse(a)) / 86400000 < 366
    ) {
      const next = new URLSearchParams(params);
      next.set("startDate", a);
      next.set("endDate", b);
      setParams(next);
    }
  };
  const selectPeriod = (value: string) => {
    if (value === "custom") {
      setCustom(true);
      return;
    }
    setCustom(false);
    applyDates(shift(yesterday, 1 - Number(value)), yesterday);
  };
  const selectCategory = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set("categoryId", value);
    else next.delete("categoryId");
    setParams(next);
  };
  useEffect(() => {
    const refresh = () => setRevision((v) => v + 1);
    window.addEventListener("spendsense-data-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("spendsense-data-changed", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setShowAll(false);
    if (!session) {
      setLoading(false);
      return () => {
        active = false;
        controller.abort();
      };
    }
    void (async () => {
      try {
        const response = await apiFetch(
          "/behavior" + (query ? "?" + query : ""),
          { signal: controller.signal },
        );
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw Error(result.error ?? "โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่");
        }
        const view = (await response.json()) as View;
        if (active && !controller.signal.aborted && getToken() === session) {
          setSnapshot({ query, view });
          setOptions(view.categoryOptions);
        }
      } catch (e) {
        if (active && !controller.signal.aborted && getToken() === session)
          setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        if (active && !controller.signal.aborted && getToken() === session)
          setLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [session, query, revision]);
  const data = validDraft && snapshot?.query === query ? snapshot.view : null;
  const ready = data?.readiness.comparisonReady ?? false,
    summary = data?.facts.summary,
    summaryBanner = data ? behaviorBanner(data) : null;
  const findings =
    data?.findings
      .filter((f) => !f.ruleId.startsWith("possible_recurrence_"))
      .slice(0, showAll ? undefined : data.previewFindingCount) ?? [];
  const adviceFindings = [
    ...findings,
    ...(data?.findings
      .filter((f) => f.ruleId.startsWith("possible_recurrence_"))
      .slice(0, 1) ?? []),
  ];
  const daily = data?.facts.daily ?? [];
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(
    1,
    ...daily.map((d) => Number(d.current.amount)),
  );
  // Factual headline only (highest recorded day); no significance claim per DECISIONS.
  const peak = daily
    .filter((d) => d.current.hasExpenseRecords)
    .reduce<(typeof daily)[number] | null>(
      (a, d) => (!a || Number(d.current.amount) > Number(a.current.amount) ? d : a),
      null,
    );
  const x = (i: number) =>
      60 + (daily.length <= 1 ? 0 : (i * 530) / (daily.length - 1)),
    y = (v: string) => 175 - (Number(v) / max) * 145;
  // Smooth curve through recorded days only; control points are clamped so the curve never dips below zero.
  const curve = (pts: [number, number][], i: number) => {
    const p = pts[i],
      p0 = pts[i - 2] ?? pts[i - 1],
      p1 = pts[i - 1],
      p3 = pts[i + 1] ?? p;
    const c1y = Math.min(175, p1[1] + (p[1] - p0[1]) / 6),
      c2y = Math.min(175, p[1] - (p3[1] - p1[1]) / 6);
    return (
      "C" + (p1[0] + (p[0] - p0[0]) / 6) + " " + c1y + " " +
      (p[0] - (p3[0] - p1[0]) / 6) + " " + c2y + " " + p[0] + " " + p[1]
    );
  };
  const draw = (side: "current" | "previous") => {
    const days = daily.flatMap((d, i) => (d[side].hasExpenseRecords ? [i] : []));
    const pts = days.map((i) => [x(i), y(daily[i][side].amount)] as [number, number]);
    if (!pts.length) return null;
    // Each span between recorded days is its own segment; spans that skip unrecorded days render faint.
    const segments = pts.slice(1).map((_, k) => ({
      d: "M" + pts[k][0] + " " + pts[k][1] + " " + curve(pts, k + 1),
      gap: days[k + 1] - days[k] > 1,
    }));
    // Unrecorded days at the period edges extend flat dashes to the axis ends.
    const edges = [
      days[0] > 0 && "M" + x(0) + " " + pts[0][1] + " H" + pts[0][0],
      days[days.length - 1] < daily.length - 1 &&
        "M" + pts[pts.length - 1][0] + " " + pts[pts.length - 1][1] + " H" + x(daily.length - 1),
    ].filter((d): d is string => !!d);
    // Label the widest skipped span so the faint dashes read as "no records", not zero.
    const wideGap = segments
      .map((s, k) => ({ ...s, w: days[k + 1] - days[k], x: (pts[k][0] + pts[k + 1][0]) / 2, y: (pts[k][1] + pts[k + 1][1]) / 2 }))
      .filter((s) => s.gap && s.w > 2)
      .sort((a, b) => b.w - a.w)[0];
    const last = pts[pts.length - 1],
      current = side === "current",
      color = current ? "#328277" : "#d39a3c";
    return (
      <g>
        {edges.map((d) => (
          <path key={d} d={d} fill="none" stroke="#a9c9c3" strokeWidth="2" strokeDasharray="8 6" />
        ))}
        {segments.map((s, k) => (
          <path
            key={k}
            d={s.d}
            fill="none"
            stroke={s.gap ? "#a9c9c3" : color}
            strokeWidth={s.gap ? 2 : 3}
            strokeLinecap={s.gap ? "butt" : "round"}
            strokeLinejoin="round"
            strokeDasharray={s.gap ? "8 6" : undefined}
          />
        ))}
        {current && wideGap && (
          <g>
            <rect x={wideGap.x - 66} y={wideGap.y - 40} width="132" height="22" rx="5" fill="#f4f7f8" />
            <text x={wideGap.x} y={wideGap.y - 25} textAnchor="middle">ช่วงข้ามวันที่ไม่มีรายการ</text>
            <line x1={wideGap.x} x2={wideGap.x} y1={wideGap.y - 18} y2={wideGap.y - 4} stroke="#b7c4cf" />
          </g>
        )}
        {current && (
          <>
            <circle cx={last[0]} cy={last[1]} r="4.5" fill={color} stroke="#fff" strokeWidth="2" />
            {/* Big callout marks the highest recorded day, which may differ from the last one. */}
            {peak && (() => {
              const px = x(daily.indexOf(peak)),
                py = y(peak.current.amount),
                anchor = px > 500 ? "end" : px < 120 ? "start" : "middle";
              return (
                <>
                  <circle cx={px} cy={py} r="4.5" fill={color} stroke="#fff" strokeWidth="2" />
                  <text x={px} y={py - 22} textAnchor={anchor} className="behavior-chart-callout">
                    {moneyText(peak.current.amount)} ฿
                  </text>
                  <text x={px} y={py - 6} textAnchor={anchor}>
                    {shortDate(peak.current.date)}
                  </text>
                </>
              );
            })()}
          </>
        )}
        {/* Every recorded day is hoverable; visible dots only where a recorded day borders unrecorded days. */}
        {current &&
          pts.map((p, k) => (
            <g
              key={p[0]}
              className="behavior-chart-dot"
              tabIndex={0}
              aria-label={moneyText(daily[days[k]].current.amount) + " บาท " + shortDate(daily[days[k]].current.date)}
              onMouseEnter={() => setHover(days[k])}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(days[k])}
              onBlur={() => setHover(null)}
            >
              <circle cx={p[0]} cy={p[1]} r="12" fill="transparent" />
              <circle
                cx={p[0]}
                cy={p[1]}
                r="3.5"
                fill={color}
                stroke="#fff"
                strokeWidth="1.5"
                opacity={
                  daily[days[k] - 1]?.current.hasExpenseRecords === false ||
                  daily[days[k] + 1]?.current.hasExpenseRecords === false ||
                  hover === days[k]
                    ? 1
                    : 0
                }
              />
            </g>
          ))}
        {current && hover !== null && (() => {
          const hx = Math.min(530, Math.max(120, x(hover))),
            py = y(daily[hover].current.amount),
            // Flip below the dot when there is no room above.
            ty = py - 62 < -36 ? py + 14 : py - 62;
          return (
            <g key={hover} className="behavior-chart-tip" pointerEvents="none">
              <rect x={hx - 60} y={ty} width="120" height="48" rx="8" />
              <text x={hx} y={ty + 21} textAnchor="middle" className="behavior-chart-tip-amount">
                {moneyText(daily[hover].current.amount)} บาท
              </text>
              <text x={hx} y={ty + 38} textAnchor="middle">
                {shortDate(daily[hover].current.date)} · {daily[hover].current.transactionCount} รายการ
              </text>
            </g>
          );
        })()}
      </g>
    );
  };
  const time = data?.facts.timeDistribution.current;
  return (
    <div className="behavior-page">
      <header className="behavior-header compact-page-toolbar">
        <h1 className="page-heading-accessible">
          การวิเคราะห์พฤติกรรมการใช้จ่าย
        </h1>
      </header>
      {/* Same banner as Overview's dashboard hero; styles in Behavior.css (.behavior-banner). */}
      <section className="behavior-banner" aria-label="สรุปพฤติกรรมการใช้จ่าย">
        <div>
          <span className="behavior-banner-eyebrow">
            ข้อสังเกตจากรายการย้อนหลัง
          </span>
          <h2 className={"behavior-banner-title " + (summaryBanner ? bannerTitleClass(summaryBanner.title) : "")}>
            {!data
              ? loading
                ? "กำลังอ่านข้อมูลการใช้จ่าย"
                : error
                  ? "ยังโหลดข้อมูลไม่สำเร็จ"
                  : "เลือกช่วงวันเต็มที่ต้องการดู"
              : summaryBanner!.title}
          </h2>
          {summaryBanner && <p>{summaryBanner.text}</p>}
          {data && (
            <div className="behavior-banner-tags">
              {summaryBanner?.note && <span>{summaryBanner.note}</span>}
              <span>
                ช่วงที่เลือก {thaiDate(data.periods.current.startDate)}–
                {thaiDate(data.periods.current.endDate)}
              </span>
              <span>ช่วงละ {data.periods.days} วัน</span>
            </div>
          )}
        </div>
        <Link className="behavior-banner-link" to="/transactions/add">
          เพิ่มรายการ <CirclePlus aria-hidden="true" size={18} />
        </Link>
      </section>
      <div className="behavior-state" aria-live="polite">
        {loading && <p role="status">กำลังอัปเดตผลจากตัวกรองที่เลือก...</p>}
        {!validDraft && (
          <p role="alert">
            เลือกวันที่จริงให้ครบ เริ่มไม่เกินสิ้นสุด ช่วงไม่เกิน 366 วัน
            และสิ้นสุดไม่เกิน {yesterday}
          </p>
        )}
        {error && (
          <div role="alert">
            <span>{error}</span>{" "}
            <button type="button" onClick={() => setRevision((v) => v + 1)}>
              ลองใหม่
            </button>
          </div>
        )}
      </div>
      <div className="behavior-report" aria-busy={loading} data-scope={query}>
        <section className="behavior-kpis" aria-label="สรุปรายจ่าย">
          <SummaryCard
            className="dashboard-kpi-expense"
            label="ยอดรายจ่ายรวม"
            icon={<ArrowUpRight aria-hidden="true" size={18} />}
            value={summary ? cash(summary.current.amount) : "—"}
          >
            {ready && (
              <p className="behavior-change">
                ส่วนต่าง {cash(summary!.comparison!.amount.difference)} (
                {percent(summary!.comparison!.amount.changePercent)})
              </p>
            )}
          </SummaryCard>
          <SummaryCard
            label="จำนวนรายการ"
            icon={<ReceiptText aria-hidden="true" size={18} />}
            value={
              summary
                ? summary.current.transactionCount.toLocaleString("th-TH")
                : "—"
            }
          >
            <p>รายการรายจ่ายที่บันทึก</p>
          </SummaryCard>
          <SummaryCard
            label="ค่าใช้จ่ายเฉลี่ยต่อครั้ง"
            icon={<Calculator aria-hidden="true" size={18} />}
            value={summary ? cash(summary.current.averagePerTransaction) : "—"}
          >
            <p>ยอดรายจ่าย ÷ จำนวนรายการ</p>
          </SummaryCard>
          <SummaryCard
            label="หมวดหมู่ที่มีค่าใช้จ่ายสูงที่สุด"
            icon={<ChartPie aria-hidden="true" size={18} />}
            value={
              <span className="behavior-category-name">
                {summary?.current.transactionCount ? (
                  <CategoryLabel
                    name={
                      data!.facts.categories[0]?.categoryName ?? "ไม่ระบุหมวด"
                    }
                  />
                ) : (
                  "ยังไม่มีรายการ"
                )}
              </span>
            }
          >
            <p>
              {summary?.current.transactionCount
                ? percent(
                    data!.facts.categories[0]?.current.sharePercent ?? null,
                  )
                : "—"}
            </p>
          </SummaryCard>
        </section>
        <div className="behavior-main-grid">
          <section className="behavior-panel behavior-chart-panel">
            <div className="behavior-panel-heading">
              <h2>รายจ่ายตามช่วงเวลา</h2>
              <div
                className="behavior-controls"
                role="group"
                aria-label="ตัวกรองพฤติกรรม"
              >
                <label>
                  <span className="behavior-sr-only">หมวด</span>
                  <Dropdown
                    className="dropdown-pill"
                    icon={<TagIcon />}
                    name="categoryId"
                    aria-label="เลือกหมวด"
                    value={category}
                    onChange={selectCategory}
                    options={[
                      { value: "", label: "ทุกหมวด" },
                      ...(category &&
                      !options.some(
                        (c) => (c.categoryId ?? "uncategorized") === category,
                      )
                        ? [{ value: category, label: "หมวดที่เลือก" }]
                        : []),
                      ...options.map((c) => ({
                        value: c.categoryId ?? "uncategorized",
                        label: c.categoryName,
                        color: categoryAppearance(c.categoryName).color,
                      })),
                    ]}
                  />
                </label>
                <label>
                  <span className="behavior-sr-only">ช่วงเวลา</span>
                  <Dropdown
                    name="period"
                    aria-label="เลือกช่วงเวลา"
                    value={custom ? "custom" : preset}
                    onChange={selectPeriod}
                    options={[
                      { value: "7", label: "7 วันเต็มล่าสุด" },
                      { value: "30", label: "30 วันเต็มล่าสุด" },
                      { value: "90", label: "90 วันเต็มล่าสุด" },
                      { value: "custom", label: "กำหนดช่วงเอง" },
                    ]}
                  />
                </label>
                {custom && (
                  <div className="behavior-custom-dates">
                    <DatePill
                      label="วันเริ่มต้น"
                      max={yesterday}
                      value={draftStart}
                      onChange={(v) => {
                        setDraftStart(v);
                        applyDates(v, draftEnd);
                      }}
                    />
                    <span className="behavior-custom-arrow" aria-hidden="true">
                      →
                    </span>
                    <DatePill
                      label="วันสิ้นสุด"
                      max={yesterday}
                      min={draftStart || undefined}
                      value={draftEnd}
                      onChange={(v) => {
                        setDraftEnd(v);
                        applyDates(draftStart, v);
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
            {data && (
              <div
                className="behavior-chart-headline"
                key={data.periods.current.startDate + data.periods.current.endDate + category}
              >
                {peak && (
                  <h3>
                    รายจ่ายสูงสุด {moneyText(peak.current.amount)} บาท วันที่{" "}
                    {shortDate(peak.current.date)}
                  </h3>
                )}
                <p>
                  {thaiDate(data.periods.current.startDate)} –{" "}
                  {thaiDate(data.periods.current.endDate)}
                </p>
              </div>
            )}
            {summary?.current.transactionCount ? (
              <>
                <svg
                  className="behavior-chart"
                  viewBox="0 -40 620 265"
                  role="img"
                  aria-label="ยอดรายจ่ายรายวันในช่วงที่เลือก"
                >
                  <text x="20" y="0">บาท</text>
                  {[1, 0.5, 0].map((f) => (
                    <g key={f}>
                      <line
                        x1="60"
                        x2="590"
                        y1={175 - f * 145}
                        y2={175 - f * 145}
                        stroke={f ? "#e6edf1" : "#ccd8dc"}
                      />
                      <text x="52" y={179 - f * 145} textAnchor="end">
                        {Math.round(max * f).toLocaleString("th-TH")}
                      </text>
                    </g>
                  ))}
                  {draw("current")}
                  <text x="60" y="205">
                    {shortDate(daily[0]?.current.date)}
                  </text>
                  <text x="590" y="205" textAnchor="end">
                    {shortDate(daily[daily.length - 1]?.current.date)}
                  </text>
                </svg>
                <p className="behavior-legend">
                  <span>มีรายการ</span>
                </p>
              </>
            ) : (
              <div className="behavior-chart-empty">
                {loading
                  ? "กำลังโหลดกราฟ"
                  : error
                    ? "โหลดกราฟไม่สำเร็จ"
                    : "ไม่มีรายจ่ายที่บันทึกสำหรับกราฟช่วงนี้"}
              </div>
            )}
            {data && (
              <p className="behavior-period-footer">
                ก่อนหน้า {thaiDate(data.periods.previous.startDate)} –{" "}
                {thaiDate(data.periods.previous.endDate)} · ช่วงละ {data.periods.days} วัน
              </p>
            )}
          </section>
          <section className="behavior-panel behavior-category-panel">
            <div className="behavior-panel-heading">
              <h2>หมวดหมู่ที่ส่งผลต่อค่าใช้จ่ายรวม</h2>
            </div>
            {data ? (
              <Table caption="สัดส่วนปัจจุบันและการเปลี่ยนแปลงยอดตามตัวกรอง">
                <thead>
                  <tr>
                    <th scope="col">หมวดหมู่</th>
                    <th scope="col">สัดส่วน</th>
                    <th scope="col">เปลี่ยนแปลงจากช่วงก่อนหน้า</th>
                  </tr>
                </thead>
                <tbody>
                  {data.facts.categories.map((c) => {
                    const look = categoryAppearance(c.categoryName);
                    return (
                    <tr key={c.categoryId ?? "uncategorized"}>
                      <th scope="row">
                        <div className="behavior-category-cell">
                          <span
                            className="behavior-category-dot"
                            aria-hidden="true"
                            style={{ color: look.color, background: look.background }}
                          >
                            <BudgetIcon name={look.icon} />
                          </span>
                          <div>
                            <CategoryLabel name={c.categoryName} />
                            <small>{cash(c.current.amount)}</small>
                          </div>
                        </div>
                      </th>
                      <td>
                        {percent(c.current.sharePercent)}
                        <span className="behavior-share-bar" aria-hidden="true">
                          <span
                            style={{
                              width: Math.min(100, Number(c.current.sharePercent ?? 0)) + "%",
                              background: look.color,
                            }}
                          />
                        </span>
                      </td>
                      <td>
                        {ready && c.comparison ? (
                          <div className="behavior-change">
                            <span
                              className={
                                Number(c.comparison.amount.difference) < 0
                                  ? "change-down"
                                  : Number(c.comparison.amount.difference) > 0
                                    ? "change-up"
                                    : "change-flat"
                              }
                            >
                              {Number(c.comparison.amount.difference) < 0
                                ? "↓ "
                                : Number(c.comparison.amount.difference) > 0
                                  ? "↑ "
                                  : "- "}
                              {percent(
                                c.comparison.amount.changePercent?.replace(
                                  "-",
                                  "",
                                ) ?? null,
                              )}
                            </span>
                            <small>{cash(c.comparison.amount.difference)}</small>
                            <small>
                              สัดส่วนต่าง{" "}
                              {c.comparison.shareDifferencePoints ?? "—"}{" "}
                              จุดเปอร์เซ็นต์
                            </small>
                          </div>
                        ) : (
                          <span>ยังเปรียบเทียบไม่ได้</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </Table>
            ) : (
              <p>{loading ? "กำลังโหลดรายหมวด" : "ยังไม่มีข้อมูลรายหมวด"}</p>
            )}
            {data && !data.facts.categories.length && (
              <p>ไม่มีรายการรายจ่ายในทั้งสองช่วง</p>
            )}
            {data && (
              <p className="behavior-note">
                วันที่ไม่มีรายการไม่ได้ยืนยันว่าไม่มีการใช้จ่ายจริง เกณฑ์ 30 รายการและระยะ 30 วันไม่ยืนยันข้อมูลครบหรือมีนัยสำคัญทางสถิติ
              </p>
            )}
            {!ready && data && (
              <p className="behavior-note">
                ยังเปรียบเทียบไม่ได้: ข้อมูลบางช่วงไม่พร้อม
              </p>
            )}
          </section>
          <section className="behavior-panel behavior-findings">
            <h2>ลักษณะการใช้จ่ายที่พบ</h2>
            {data ? (
              <section
                className="behavior-recurrences"
                aria-label="รูปแบบที่เกิดซ้ำ"
              >
                <h3>
                  รูปแบบที่เกิดซ้ำ{" "}
                  <span className="behavior-count-tag">
                    {data.facts.recurrenceCandidates.length}
                    {data.facts.recurrence.hasMore ? "+" : ""} กลุ่ม
                  </span>
                </h3>
                {data.facts.recurrence.reasonCodes.map((r) => (
                  <p key={r}>{reasons[r] ?? r}</p>
                ))}
                <p className="behavior-note">
                  เป็นหลักฐานในช่วงที่เลือก ไม่ยืนยันว่าเกิดซ้ำต่อเนื่องจนถึงปัจจุบันหรือเป็นบิลเดียวกัน
                </p>
                <ul className="behavior-status-list">
                {data.facts.categories
                  .filter(
                    (c) =>
                      c.current.transactionCount > 0 &&
                      !data.facts.recurrenceCandidates.some(
                        (r) => r.categoryId === c.categoryId,
                      ),
                  )
                  .map((c) => (
                    <StatusRow
                      key={c.categoryId ?? "uncategorized"}
                      name={c.categoryName}
                      tone={!data.readiness.current.ready || data.facts.recurrence.hasMore ? "wait" : "none"}
                      text={
                        !data.readiness.current.ready
                          ? "ข้อมูลไม่พอสำหรับตรวจรูปแบบซ้ำ: ช่วงที่เลือกยังไม่ผ่านเกณฑ์หลัก"
                          : data.facts.recurrence.hasMore
                            ? "ยังไม่แสดงหลักฐานหมวดนี้ในกลุ่มแรก ไม่สามารถสรุปจากรายการที่จำกัดไว้"
                            : "ตรวจแล้วไม่พบรูปแบบซ้ำตามเกณฑ์ในช่วงที่เลือก"
                      }
                    />
                  ))}
                </ul>
                {data.facts.recurrenceCandidates.map((r, i) => (
                  <article
                    className="behavior-pattern-card"
                    id={"behavior-recurrence-" + i}
                    tabIndex={-1}
                    key={i}
                  >
                    <div className="behavior-pattern-heading">
                      <h4>
                        <CategoryIcon name={r.categoryName} small />
                        {r.categoryName}
                      </h4>
                      <span className="behavior-pattern-kind">
                        {r.kind === "weekly"
                          ? "รายสัปดาห์"
                          : r.kind === "monthly"
                            ? "รายเดือน"
                            : "ทั่วไป"}
                      </span>
                    </div>
                    <p className="behavior-pattern-amount">
                      {cash(r.amount)} <span>ต่อรายการในหลักฐาน</span>
                    </p>
                    <dl className="behavior-pattern-facts">
                      <div>
                        <dt>จำนวนครั้ง</dt>
                        <dd>
                          {r.occurrenceCount ?? r.dates.length} ครั้ง ·{" "}
                          {r.dates.length} วันที่ไม่ซ้ำ
                        </dd>
                      </div>
                      <div>
                        <dt>ช่วงหลักฐาน</dt>
                        <dd>
                          {r.startDate ?? r.dates[0]}–
                          {r.endDate ?? r.dates[r.dates.length - 1]}
                        </dd>
                      </div>
                      <div>
                        <dt>พบล่าสุดในหลักฐานนี้</dt>
                        <dd>{r.endDate ?? r.dates[r.dates.length - 1]}</dd>
                      </div>
                    </dl>
                    <EvidenceTransactions evidence={r} />
                  </article>
                ))}
                {data.facts.recurrence.hasMore && (
                  <p>
                    แสดง {data.facts.recurrence.limit} กลุ่มแรก ไม่ใช่ทั้งหมด
                  </p>
                )}
              </section>
            ) : (
              <p>
                {loading
                  ? "กำลังอ่านรูปแบบจากข้อมูล"
                  : error
                    ? "โหลดรูปแบบไม่สำเร็จ"
                    : "ยังไม่มีข้อมูลรูปแบบ"}
              </p>
            )}
            <div className="behavior-comparison-heading">
              <h3>เทียบช่วงก่อนและเวลา</h3>
            </div>
            {findings.length ? (
              <ol>
                {findings.map((f, i) => (
                  <li
                    key={f.ruleId + ":" + i}
                    id={"behavior-evidence-" + i}
                    tabIndex={-1}
                  >
                    <div className="behavior-finding-heading">
                      {f.categoryName && <CategoryIcon name={f.categoryName} small />}
                      <strong>
                        {f.categoryName ? f.categoryName + " — " : ""}
                        {f.title}
                      </strong>
                    </div>
                    <span
                      className={
                        "behavior-scope-pill" +
                        (f.ruleId === "confirmed_time_concentration"
                          ? " is-time"
                          : f.ruleId === "category_dominant_share"
                            ? " is-share"
                            : "")
                      }
                    >
                      {f.scope === "comparison"
                        ? "การเปลี่ยนแปลงเทียบช่วงก่อน"
                        : f.ruleId === "category_dominant_share"
                          ? "สัดส่วนในช่วงที่เลือก"
                          : "ข้อสังเกตช่วงเวลา"}
                    </span>
                    <p>
                      <Evidence finding={f} />
                    </p>
                    <EvidenceTransactions evidence={f.evidence} />
                  </li>
                ))}
              </ol>
            ) : (
              <p>
                {!data
                  ? "กำลังรอข้อมูล"
                  : "ดูสถานะข้อมูลเปรียบเทียบรายหมวดและข้อสังเกตเวลาด้านล่าง"}
              </p>
            )}
            {data &&
              data.findings.filter(
                (f) => !f.ruleId.startsWith("possible_recurrence_"),
              ).length > data.previewFindingCount && (
                <button type="button" onClick={() => setShowAll((v) => !v)}>
                  {showAll
                    ? "แสดงเฉพาะข้อค้นพบเด่น"
                    : "ดูข้อค้นพบและคำแนะนำทั้งหมด"}
                </button>
              )}
            {data && (
              <div
                className="behavior-analysis-status"
                aria-label="สถานะการตรวจแต่ละด้าน"
              >
                <ul className="behavior-status-list">
                {data.facts.categories.map((c) => {
                  const found = data.findings.some(
                    (f) => f.scope === "comparison" && f.categoryId === c.categoryId,
                  );
                  return (
                    <StatusRow
                      key={c.categoryId ?? "uncategorized"}
                      name={c.categoryName}
                      tone={!c.findingEligible ? "wait" : found ? "found" : "none"}
                      text={
                        !c.findingEligible
                          ? "ข้อมูลไม่พอสำหรับข้อสรุปเปรียบเทียบ · " +
                            c.findingReasonCodes.map((r) => reasons[r] ?? r).join(" · ")
                          : found
                            ? "พบข้อค้นพบเปรียบเทียบยอดเพิ่ม"
                            : "ตรวจแล้วไม่พบข้อค้นพบเปรียบเทียบยอดเพิ่มตามเกณฑ์"
                      }
                    />
                  );
                })}
                {(() => {
                  const found = data.findings.some((f) => f.ruleId === "confirmed_time_concentration");
                  return (
                    <StatusRow
                      name="เวลา"
                      tone={!time!.ready ? "wait" : found ? "found" : "none"}
                      text={
                        !time!.ready
                          ? "ข้อมูลไม่พอสำหรับข้อสังเกตเวลา · " +
                            time!.reasonCodes.map((r) => reasons[r] ?? r).join(" · ")
                          : found
                            ? "พบการกระจุกตัวของเวลาที่ยืนยัน"
                            : "ตรวจแล้วไม่พบการกระจุกตัวของเวลาที่ยืนยันตามเกณฑ์"
                      }
                    />
                  );
                })()}
                </ul>
              </div>
            )}
            {data && (
              <section className="behavior-readiness" aria-label="ความพร้อมข้อมูล">
                <Ready label="ช่วงที่เลือก" value={data.readiness.current} />
                <Ready label="ช่วงก่อนหน้า" value={data.readiness.previous} />
              </section>
            )}
          </section>
          <section className="behavior-panel behavior-advice">
            <div className="behavior-advice-head">
              <div>
                <h2>คำแนะนำ</h2>
                <p>
                  {adviceFindings.length
                    ? adviceFindings.length + " ข้อจากข้อค้นพบในช่วงนี้"
                    : "สรุปจากข้อค้นพบในช่วงที่เลือก"}
                </p>
              </div>
            </div>
            {adviceFindings.length ? (
              <ol>
                {adviceFindings.map((f, i) => {
                  const target = f.ruleId.startsWith("possible_recurrence_")
                    ? "behavior-recurrence-0"
                    : "behavior-evidence-" + i;
                  return (
                    <li
                      key={f.ruleId + ":" + i}
                      className="behavior-advice-item"
                    >
                      <div className="behavior-advice-meta">
                        {f.categoryName && <CategoryIcon name={f.categoryName} small />}
                        <span>{f.categoryName ?? "ภาพรวม"}</span>
                        <span className="behavior-advice-num">ข้อ {i + 1}</span>
                      </div>
                      <p>{f.recommendation}</p>
                      <a
                        href={"#" + target}
                        onClick={() => document.getElementById(target)?.focus()}
                        aria-label={"ดูหลักฐานข้อ " + (i + 1) + (f.categoryName ? " · " + f.categoryName : "")}
                      >
                        ดูหลักฐาน →
                      </a>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p>
                ยังไม่มีคำแนะนำเฉพาะสำหรับช่วงนี้
              </p>
            )}
            <p className="behavior-note">คำแนะนำอ้างข้อมูลที่พบ ไม่ได้พิสูจน์สาเหตุหรือแรงจูงใจ</p>
          </section>
        </div>
        <PageRecommendations rules={["R3", "R4", "R5", "R9"]} />
        <p className="behavior-footer">
          <Link to="/overview">กลับภาพรวมรายเดือน</Link>
        </p>
      </div>
    </div>
  );
}
function Evidence({ finding: f }: { finding: Finding }) {
  const e = f.evidence as {
    current?: Metric;
    previous?: Metric;
    comparison?: Difference;
    shareIncreased?: boolean;
    coveragePercent?: string;
    confirmedCount?: number;
    bucket?: Metric;
    startDate?: string;
    endDate?: string;
    occurrenceCount?: number;
  };
  if (e.current && e.previous)
    return (
      <>
        ยอด {cash(e.previous.amount)} → {cash(e.current.amount)} · จำนวน{" "}
        {e.previous.transactionCount} → {e.current.transactionCount} · เฉลี่ย{" "}
        {cash(e.previous.averagePerTransaction)} →{" "}
        {cash(e.current.averagePerTransaction)}
        {e.shareIncreased && (
          <>
            {" "}
            · สัดส่วน {percent(e.previous.sharePercent)} →{" "}
            {percent(e.current.sharePercent)}
          </>
        )}
      </>
    );
  if (e.startDate && e.endDate && f.ruleId.startsWith("possible_recurrence_"))
    return (
      <>
        {e.occurrenceCount} ครั้ง · ช่วงหลักฐาน {thaiDate(e.startDate)}–{thaiDate(e.endDate)} ·
        พบล่าสุดในหลักฐานนี้ {thaiDate(e.endDate)}
      </>
    );
  if (e.current && f.ruleId === "category_dominant_share")
    return (
      <>
        ยอด {cash(e.current.amount)} · {e.current.transactionCount} รายการ · สัดส่วน{" "}
        {percent(e.current.sharePercent)} ของรายจ่ายรวม
      </>
    );
  if (e.bucket)
    return (
      <>
        {e.bucket.transactionCount} จาก {e.confirmedCount} รายการที่ยืนยันเวลา
        พบ {e.bucket.distinctDays} วัน · coverage {e.coveragePercent}%
      </>
    );
  return <>ดูหมวด ยอด และวันที่ใน “รูปแบบที่เกิดซ้ำ” ด้านล่าง</>;
}

function EvidenceTransactions({ evidence }: { evidence: unknown }) {
  const [shown, setShown] = useState(20);
  const e = evidence as {
    transactions?: EvidenceRow[];
    transactionCount?: number;
    startDate?: string;
    endDate?: string;
  };
  const rows = e.transactions ?? [];
  return (
    <details className="behavior-evidence-details">
      <summary>ดูรายการธุรกรรมที่ใช้เป็นหลักฐาน ({rows.length} รายการ)</summary>
      {e.startDate && (
        <p>
          ช่วง {thaiDate(e.startDate)}–{thaiDate(e.endDate)}
          {e.transactionCount !== undefined
            ? " · " + e.transactionCount + " ครั้ง"
            : ""}
        </p>
      )}
      <p>ข้อมูล ณ ตอนอ่านผลวิเคราะห์ เวลาแสดงเฉพาะที่ผู้ใช้ยืนยันแล้ว</p>
      {!rows.length ? (
        <p>ยังไม่มีรายละเอียดหลักฐานในผลที่โหลด กรุณาโหลดข้อมูลใหม่</p>
      ) : (
        <Table caption="รายการหลักฐานจากข้อมูลย้อนหลัง">
          <thead>
            <tr>
              <th>รหัสรายการ</th>
              <th>วันที่</th>
              <th>เวลาที่ยืนยัน</th>
              <th>ยอด</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((r) => (
              <tr key={r.id}>
                <td style={{ overflowWrap: "anywhere" }}>{r.id}</td>
                <td>{thaiDate(r.date)}</td>
                <td>{r.time ?? "ไม่ยืนยัน/ไม่มีเวลา"}</td>
                <td>{cash(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {shown < rows.length && (
        <button type="button" onClick={() => setShown((n) => n + 20)}>
          ดูรายการเพิ่มเติม
        </button>
      )}
    </details>
  );
}
