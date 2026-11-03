import { thaiDate } from "../utils/thaiDate";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import UserHeader from "../components/UserHeader";
import {
  CalendarCheck,
  CalendarDays,
  ChartNoAxesCombined,
  History,
  Info,
  Lightbulb,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { apiFetch } from "../api";
import { getToken, useSessionKey } from "../auth";
import { bangkokDate } from "../utils/dashboard";
import "./Forecast.css";

type Day = { date: string; amount: string };
type View = {
  status: "available" | "unavailable";
  asOfDate: string;
  cutoffDate: string;
  forecastStartDate: string;
  forecastEndDate: string;
  modelVersion: string;
  readiness: {
    transactionCount: number;
    observedSpanDays: number;
    lastExpenseDate: string | null;
    reasonCodes: string[];
  };
  training: {
    calendarDays: number;
    expenseDays: number;
    zeroFilledDays: number;
    longestGapDays: number;
  };
  parameterMode: "inner_validation" | null;
  warningCodes: string[];
  clampedDays: number;
  summary: {
    daily: Day[] | null;
    sevenDayForecastTotal: string | null;
    previousSevenDayActual: string;
    periodDifference: string | null;
  };
  previousPeriod: {
    startDate: string;
    endDate: string;
    daily: (Day & { hasExpenseRecords: boolean })[];
  };
  budgetComparison: null | {
    month: string;
    budgetAmount: string;
    actualMonthExpenseToNow: string;
    remainingAmount: string;
    remainingDaysIncludingToday: number;
    comparedDays: number;
    referenceAllowance: string;
    predictedAdditionalExpense: string | null;
    difference: string | null;
    status: string;
    suggestedAdditionalDailyAmount: string;
  };
};
const reasons: Record<string, string> = {
  insufficient_expense_count: "มีรายจ่ายก่อนวันตัดข้อมูลไม่ครบ 30 รายการ",
  insufficient_observed_span:
    "วันแรกถึงวันสุดท้ายของรายจ่ายยังไม่ครอบคลุม 30 วัน",
};
// Display-only whole-baht formatting; amounts stay server Decimal strings.
const baht = (v: string) => Math.round(Number(v)).toLocaleString("th-TH");
export default function Forecast() {
  const session = useSessionKey();
  const [today, setToday] = useState(bangkokDate);
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
    <ForecastSession
      key={session + ":" + today}
      session={session}
      today={today}
    />
  );
}
function ForecastSession({
  session,
  today,
}: {
  session: string | null;
  today: string;
}) {
  const [data, setData] = useState<View | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
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
    const controller = new AbortController();
    let active = true;
    setError("");
    setLoading(true);
    if (!session) {
      setLoading(false);
      return () => {
        active = false;
        controller.abort();
      };
    }
    void (async () => {
      try {
        const r = await apiFetch("/forecast", { signal: controller.signal });
        if (!r.ok) throw Error();
        const view = (await r.json()) as View;
        if (active && !controller.signal.aborted && getToken() === session) {
          setData(view);
        }
      } catch {
        if (active && !controller.signal.aborted && getToken() === session)
          setError("โหลดประมาณการไม่สำเร็จ กรุณาลองใหม่");
      } finally {
        if (active && getToken() === session) setLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [session, today, revision]);
  const plotted = data
    ? data.previousPeriod.daily.map((d) => ({ ...d, value: d.amount }))
    : [];
  const projected = data?.summary.daily;
  const chart = [
    ...plotted.map((d) => ({
      date: d.date,
      value: d.value,
      forecast: false,
      missing: !d.hasExpenseRecords,
    })),
    ...(projected ?? []).map((d) => ({
      date: d.date,
      value: d.amount,
      forecast: true,
      missing: false,
    })),
  ];
  // Numbers are only SVG coordinates and display ratios; all amounts/totals come from server Decimal strings.
  const max = Math.max(1, ...chart.map((d) => Number(d.value ?? 0)));
  const unit = 10 ** Math.floor(Math.log10(max)) / 2,
    top = Math.ceil(max / (3 * unit)) * 3 * unit;
  const W = 900,
    L = 56,
    R = 20,
    T = 40,
    B = 230;
  // Always reserve 7 forecast slots so the actual week keeps its place when no forecast exists.
  const slots = plotted.length + 7;
  const px = (i: number) => L + (i + 0.5) * ((W - L - R) / slots),
    py = (v: string) => B - (Number(v) / top) * (B - T);
  const split = plotted.length;
  const path = (from: number, to: number) =>
    chart
      .slice(from, to)
      .map((d, k) => (k ? "L" : "M") + px(from + k) + " " + py(d.value))
      .join(" ");
  const total = data?.summary.sevenDayForecastTotal ?? null,
    prev = data?.summary.previousSevenDayActual ?? "0",
    diff = data?.summary.periodDifference ?? null;
  const changePct =
    diff !== null && Number(prev) > 0 ? (Number(diff) / Number(prev)) * 100 : null;
  // Borrowed Behavior line (>=5% and >=100 baht, both directions; DECISIONS 3 Nov 2026): smaller moves are "close to last week", not a trend.
  const significant =
    diff !== null && Math.abs(Number(diff)) >= 100 && (changePct === null || Math.abs(changePct) >= 5);
  const trend = diff === null ? null : !significant ? "flat" : Number(diff) > 0 ? "up" : "down";
  const barMax = Math.max(1, Number(prev), Number(total ?? 0));
  const shortDay = (d: string, i: number) =>
    i === 0 || d.endsWith("-01") ? thaiDate(d).split(" ").slice(0, 2).join(" ") : String(Number(d.slice(8)));
  return (
    <div className="forecast-page">
      <header className="forecast-header compact-page-toolbar">
        <h1 className="page-heading-accessible">พยากรณ์ค่าใช้จ่าย</h1>
        <UserHeader />
      </header>
      {loading && <p role="status">กำลังคำนวณประมาณการ...</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button onClick={() => setRevision((v) => v + 1)}>ลองใหม่</button>
        </div>
      )}
      {data && (
        <>
          <div className="forecast-range">
            <span className="forecast-range-pill">
              <CalendarDays size={16} aria-hidden="true" />
              {shortDay(data.forecastStartDate, 0)} – {thaiDate(data.forecastEndDate)}
              <small>7 วันถัดไป</small>
            </span>
          </div>
          {data.status === "unavailable" && (
            <section className="forecast-panel forecast-unavailable">
              <h2>ยังพยากรณ์ไม่ได้</h2>
              <p>
                {data.readiness.reasonCodes
                  .map((r) => reasons[r] ?? r)
                  .join(" · ")}
              </p>
              <p>
                ตรวจว่าบันทึกรายการจริงครบหรือไม่ และสะสมประวัติให้เพียงพอ
                ไม่จำเป็นต้องสร้างรายการสมมติ
              </p>
              <Link to="/transactions">ตรวจประวัติธุรกรรม</Link>
            </section>
          )}
          <div className="forecast-cards">
            <section className="forecast-kpi is-primary">
              <div className="forecast-kpi-head">
                <h2>รายจ่ายคาดการณ์ 7 วัน</h2>
                <ChartNoAxesCombined size={18} aria-hidden="true" />
              </div>
              <strong>
                {total === null ? "ยังพยากรณ์ไม่ได้" : baht(total)}
                {total !== null && <small> บาท</small>}
              </strong>
              <p>
                {shortDay(data.forecastStartDate, 0)} – {thaiDate(data.forecastEndDate)}
              </p>
            </section>
            <section className="forecast-kpi">
              <div className="forecast-kpi-head">
                <h2>รายจ่ายจริง 7 วันที่ผ่านมา</h2>
                <History size={18} aria-hidden="true" />
              </div>
              <strong>
                {baht(prev)}
                <small> บาท</small>
              </strong>
              <p>
                {Number(data.previousPeriod.startDate.slice(8))} – {thaiDate(data.previousPeriod.endDate)}
              </p>
            </section>
            <section className={"forecast-kpi is-change is-" + (trend ?? "none")}>
              <div className="forecast-kpi-head">
                <h2>เปลี่ยนแปลงจาก 7 วันที่ผ่านมา</h2>
                {trend === "down" ? (
                  <TrendingDown size={18} aria-hidden="true" />
                ) : (
                  <TrendingUp size={18} aria-hidden="true" />
                )}
              </div>
              <strong>
                {changePct === null
                  ? diff === null
                    ? "ยังเปรียบเทียบไม่ได้"
                    : "—"
                  : (changePct > 0 ? "+" : "") + changePct.toFixed(1) + "%"}
              </strong>
              <p>
                {diff === null
                  ? "เปรียบเทียบรายจ่ายรวม จำนวนวันเท่ากัน 7 วัน"
                  : trend === "up"
                    ? "คาดว่าจะเพิ่มขึ้น " + baht(diff) + " บาท จากสัปดาห์ก่อน"
                    : trend === "down"
                      ? "คาดว่าจะลดลง " + baht(diff.replace("-", "")) + " บาท จากสัปดาห์ก่อน"
                      : "ใกล้เคียงกับสัปดาห์ก่อน (ต่างกัน " + baht(diff.replace("-", "")) + " บาท)"}
              </p>
            </section>
          </div>
          {plotted.length > 0 && (
            <section className="forecast-panel forecast-chart-panel">
              <div className="forecast-chart-head">
                <h2>ค่าใช้จ่ายย้อนหลังรายวันและการพยากรณ์ 7 วันถัดไป</h2>
                <p className="forecast-legend">
                  <span className="is-actual">รายจ่ายจริง</span>
                  <span className="is-forecast">รายจ่ายคาดการณ์</span>
                </p>
              </div>
              <svg
                viewBox={"0 0 " + W + " 262"}
                role="img"
                aria-label="รายจ่ายย้อนหลังเส้นทึบ และประมาณการเส้นประ มีข้อมูลละเอียดในตารางด้านล่าง"
              >
                <rect
                  x={px(split) - (W - L - R) / slots / 2}
                  y={T - 26}
                  width={W - R - (px(split) - (W - L - R) / slots / 2)}
                  height={B - T + 26}
                  rx="6"
                  className="forecast-zone"
                />
                <text x={px(split) - (W - L - R) / slots / 2 + 12} y={T - 10} className="forecast-zone-label">
                  {projected ? "7 วันถัดไป" : "7 วันถัดไป · ยังพยากรณ์ไม่ได้"}
                </text>
                <text x={L} y={T - 10} className="forecast-axis-note">
                  บาท / วัน · 7 วันที่ผ่านมา
                </text>
                {[0, 1, 2, 3].map((k) => (
                  <g key={k}>
                    <line x1={L} x2={W - R} y1={B - (k / 3) * (B - T)} y2={B - (k / 3) * (B - T)} className={k ? "forecast-grid" : "forecast-baseline"} />
                    <text x={L - 10} y={B - (k / 3) * (B - T) + 4} textAnchor="end" className="forecast-tick">
                      {Math.round((top * k) / 3).toLocaleString("th-TH")}
                    </text>
                  </g>
                ))}
                <line
                  x1={px(split) - (W - L - R) / slots / 2}
                  x2={px(split) - (W - L - R) / slots / 2}
                  y1={T - 26}
                  y2={B}
                  className="forecast-divider"
                />
                <path d={path(0, split)} className="forecast-line-actual" />
                {/* Bridge from the last actual day into the forecast. */}
                {projected && (
                  <path d={path(Math.max(0, split - 1), chart.length)} className="forecast-line-forecast" />
                )}
                {chart.map((d, i) => (
                  <g key={d.date}>
                    <circle
                      cx={px(i)}
                      cy={py(d.value)}
                      r="4"
                      className={d.forecast ? "forecast-dot is-forecast" : d.missing ? "forecast-dot is-missing" : "forecast-dot"}
                    />
                    <text x={px(i)} y={py(d.value) - 12} textAnchor="middle" className="forecast-value">
                      {d.missing ? "ไม่มีรายการ" : Math.round(Number(d.value)).toLocaleString("th-TH")}
                    </text>
                    <text x={px(i)} y={B + 22} textAnchor="middle" className={"forecast-day" + (i === split ? " is-start" : "")}>
                      {shortDay(d.date, i)}
                    </text>
                  </g>
                ))}
              </svg>
              <p className="forecast-chart-foot">
                <span className="forecast-start-dot" aria-hidden="true" />
                {projected
                  ? "เริ่มพยากรณ์ " + thaiDate(data.forecastStartDate)
                  : "แสดงเฉพาะรายจ่ายจริง · จะเริ่มพยากรณ์เมื่อข้อมูลครบเกณฑ์"}
              </p>
            </section>
          )}
          {total === null ? (
            <div className="forecast-bottom">
              <section className="forecast-box">
                <div className="forecast-box-head">
                  <h2>ผลการพยากรณ์</h2>
                </div>
                <p className="forecast-empty">
                  ยังพยากรณ์ไม่ได้ ·{" "}
                  {data.readiness.reasonCodes.map((r) => reasons[r] ?? r).join(" · ")}
                </p>
                <dl className="forecast-bars">
                  <div>
                    <dt>7 วันที่ผ่านมา</dt>
                    <dd>
                      <span className="forecast-bar"><span style={{ width: "100%" }} /></span>
                      <b>{baht(prev)}</b> บาท
                    </dd>
                  </div>
                </dl>
              </section>
              <section className="forecast-box is-advice">
                <div className="forecast-box-head">
                  <h2>คำแนะนำสำหรับการพยากรณ์</h2>
                  <Lightbulb size={18} aria-hidden="true" />
                </div>
                <ul className="forecast-advice">
                  <li>
                    <span aria-hidden="true"><CalendarCheck size={18} /></span>
                    <div>
                      <strong>บันทึกรายจ่ายให้ครบทุกวัน</strong>
                      <p>
                        ระบบต้องมีรายจ่ายอย่างน้อย 30 รายการ ครอบคลุม 30 วัน
                        (ตอนนี้ {data.readiness.transactionCount} รายการ ·{" "}
                        {data.readiness.observedSpanDays} วัน)
                      </p>
                    </div>
                  </li>
                </ul>
              </section>
            </div>
          ) : (
            <div className="forecast-bottom">
              <section className="forecast-box">
                <div className="forecast-box-head">
                  <h2>ผลการพยากรณ์</h2>
                  {trend && (
                    <span className={"forecast-trend is-" + trend}>
                      {trend === "down" ? <TrendingDown size={14} aria-hidden="true" /> : <TrendingUp size={14} aria-hidden="true" />}
                      {trend === "up" ? "มีแนวโน้มสูงขึ้น" : trend === "down" ? "มีแนวโน้มลดลง" : "ใกล้เคียงเดิม"}
                    </span>
                  )}
                </div>
                <p className="forecast-avg">
                  ≈ <strong>{baht(String(Number(total) / 7))}</strong>
                  <small> บาท / วัน</small>
                  <span>รายจ่ายเฉลี่ยที่คาดการณ์</span>
                </p>
                <dl className="forecast-bars">
                  <div>
                    <dt>7 วันที่ผ่านมา</dt>
                    <dd>
                      <span className="forecast-bar"><span style={{ width: (Number(prev) / barMax) * 100 + "%" }} /></span>
                      <b>{baht(prev)}</b> บาท
                    </dd>
                  </div>
                  <div className="is-next">
                    <dt>7 วันถัดไป</dt>
                    <dd>
                      <span className="forecast-bar"><span style={{ width: (Number(total) / barMax) * 100 + "%" }} /></span>
                      <b>{baht(total)}</b> บาท
                    </dd>
                  </div>
                </dl>
              </section>
              <section className="forecast-box is-advice">
                <div className="forecast-box-head">
                  <h2>คำแนะนำสำหรับการพยากรณ์</h2>
                  <Lightbulb size={18} aria-hidden="true" />
                </div>
                <ul className="forecast-advice">
                  <li>
                    <span aria-hidden="true"><Wallet size={18} /></span>
                    <div>
                      <strong>สำรองเงินประมาณ {baht(total)} บาท</strong>
                      <p>เตรียมไว้สำหรับค่าใช้จ่ายใน 7 วันข้างหน้า</p>
                    </div>
                  </li>
                  <li>
                    <span aria-hidden="true"><CalendarCheck size={18} /></span>
                    <div>
                      <strong>ติดตามรายจ่ายในสัปดาห์ถัดไป</strong>
                      <p>
                        {trend === "up"
                          ? "ทบทวนยอดใช้จริงแต่ละวัน เพราะรายจ่ายมีแนวโน้มเพิ่มขึ้น"
                          : "บันทึกรายการให้ครบทุกวัน เพื่อให้ประมาณการครั้งถัดไปแม่นขึ้น"}
                      </p>
                    </div>
                  </li>
                </ul>
              </section>
            </div>
          )}
          <aside className="forecast-warning">
            <Info size={14} aria-hidden="true" />
            <span>
              ค่าพยากรณ์เป็นแนวโน้มเพื่อช่วยวางแผน รายจ่ายจริงอาจแตกต่างได้ วันที่ไม่มีรายการไม่ได้ยืนยันว่าไม่มีการใช้จ่ายจริง
            </span>
          </aside>
          {data.warningCodes.includes("stale_expense_history") && (
            <p className="forecast-warning">
              ข้อมูลรายจ่ายล่าสุดห่างจากวันตัดข้อมูลอย่างน้อย 7 วัน
              ประมาณการอาจไม่สะท้อนการใช้จ่ายปัจจุบัน
            </p>
          )}
          {data.warningCodes.includes("long_recording_gap") && (
            <p className="forecast-warning">
              มีช่วงไม่มีรายการบันทึกต่อเนื่อง {data.training.longestGapDays}{" "}
              วัน ไม่ได้ยืนยันว่าไม่มีการใช้จ่ายจริง
            </p>
          )}
        </>
      )}
    </div>
  );
}
