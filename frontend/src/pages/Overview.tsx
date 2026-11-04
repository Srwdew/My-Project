import { thaiDate, thaiMonth } from "../utils/thaiDate";
import { categoryAppearance } from '../utils/categoryAppearance';
import SummaryCard from "../components/SummaryCard";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ChartPie,
  ChartNoAxesCombined,
  ReceiptText,
  ShieldQuestion,
  Target,
  Wallet,
  AlarmClock,
  Check,
  CirclePlus,
  Coins,
  Info,
  Sprout,
  Star,
} from "lucide-react";
import {
  AnomalyOverview,
} from "../components/OverviewInsights";
import WeeklyExpenses from "../components/WeeklyExpenses";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api";
import { getToken, useSessionKey } from "../auth";
import UserHeader from "../components/UserHeader";
import { MonthPill } from "../components/DatePill";
import { bangkokDate, moneyText, type DailyAmount } from "../utils/dashboard";
import "./Overview.css";
type Dashboard = {
  month: string;
  asOfDate: string;
  period: {
    startDate: string;
    effectiveEndDate: string;
    calendarEndDate: string;
    isCurrentMonth: boolean;
    currentMonth: string;
    previousMonth: string | null;
    nextMonth: string | null;
  };
  summary: {
    savingRate: { percent: string | null; reason: string | null };
    transactionCount: number;
    incomeAmount: string;
    expenseAmount: string;
    netCashFlow: string;
    budgetAmount: string | null;
    budgetRemaining: string | null;
    budgetExceeded: boolean;
    hasTransactions: boolean;
  };
  expenseCategories: {
    categoryId: string;
    categoryName: string;
    amount: string;
    percentage: string;
    transactionCount: number;
  }[];
  daily: DailyAmount[];
  recentTransactions: {
    hasMore: boolean;
    items: {
      id: string;
      date: string;
      type: "income" | "expense";
      amount: string;
      categoryName: string;
      description: string | null;
    }[];
  };
  goals: {
    asOfDate: string;
    activeCount: number;
    notStartedCount: number;
    overdueCount: number;
    allocatedAmount: string;
    primaryGoal: {
      id: string;
      name: string;
      archivedAt: string | null;
      calculatedStatus: string;
      targetAmount: string;
      savedAmount: string;
      remainingAmount: string;
      progressPercent: string;
      progressBarPercent: string;
    } | null;
  };
};
type GoalItem = {
  id: string;
  name: string;
  calculatedStatus: string;
  targetAmount: string;
  savedAmount: string;
  progressPercent: string;
  progressBarPercent: string;
};
const statuses: Record<string, string> = {
  active: "กำลังออม",
  not_started: "ยังไม่ได้เก็บเงิน",
  overdue: "เลยกำหนด",
  completed: "ครบเป้าหมาย",
};
export default function Overview() {
  const session = useSessionKey();
  const [params, setParams] = useSearchParams();
  const [today, setToday] = useState(bangkokDate);
  useEffect(() => {
    const update = () => setToday(bangkokDate());
    const timer = window.setInterval(update, 30000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  // No month in the URL means "current cycle"; only the backend decides which one that is.
  const values = params.getAll("month"),
    month = values[0] ?? null;
  const valid = values.length <= 1;
  return (
    <OverviewMonth
      key={`${session}:${month ?? "current"}:${today}:${valid}`}
      session={session}
      month={month}
      today={today}
      valid={valid}
      setMonth={(m) => setParams(m ? { month: m } : {})}
    />
  );
}
function OverviewMonth({
  session,
  month,
  today,
  valid,
  setMonth,
}: {
  session: string | null;
  month: string | null;
  today: string;
  valid: boolean;
  setMonth: (m: string | null) => void;
}) {
  const [data, setData] = useState<Dashboard | null>(null),
    [rejected, setRejected] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const [goalList, setGoalList] = useState<GoalItem[]>([]);
  // Up to 3 non-archived goals for the Goals card; the dashboard API only carries the primary one.
  useEffect(() => {
    const controller = new AbortController();
    if (!session) return () => controller.abort();
    apiFetch("/goals?limit=30", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { data?: GoalItem[] } | null) => {
        if (getToken() === session && body?.data) setGoalList(body.data);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [session, revision]);
  useEffect(() => {
    const update = () => setRevision((v) => v + 1);
    window.addEventListener("spendsense-data-changed", update);
    return () => window.removeEventListener("spendsense-data-changed", update);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setData(null);
    setError("");
    setLoading(true);
    if (!valid || !session) {
      setLoading(false);
      return () => {
        active = false;
        controller.abort();
      };
    }
    void (async () => {
      try {
        const r = await apiFetch(
          "/dashboard" + (month ? "?month=" + encodeURIComponent(month) : ""),
          { signal: controller.signal },
        );
        if (r.status === 400) {
          if (active && getToken() === session) setRejected(true);
          return;
        }
        if (!r.ok) throw Error();
        const result = (await r.json()) as Dashboard;
        if (
          active &&
          getToken() === session &&
          (month === null || result.month === month)
        )
          setData(result);
      } catch {
        if (active && !controller.signal.aborted && getToken() === session)
          setError("โหลด Dashboard ไม่สำเร็จ กรุณาลองใหม่");
      } finally {
        if (active && getToken() === session) setLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [session, month, valid, revision]);
  const g = data?.goals.primaryGoal;
  const shownGoals: GoalItem[] = [
    ...(g ? [g] : []),
    ...goalList.filter((x) => x.id !== g?.id),
  ].slice(0, 3);
  return (
    <div className="overview-page dashboard-page">
      <div className="dashboard-topbar">
        <header className="overview-header compact-page-toolbar">
          <h1 className="page-heading-accessible">ภาพรวมทางการเงิน</h1>
          <UserHeader />
        </header>
        <nav className="dashboard-month" aria-label="เลือกเดือน">
          <div className="dashboard-period-label">
            <CalendarDays aria-hidden="true" size={18} />
            <span>สรุปรายเดือน</span>
          </div>
          <div className="dashboard-month-controls">
            <button
              disabled={!data?.period.previousMonth}
              onClick={() => setMonth(data!.period.previousMonth)}
            >
              เดือนก่อน
            </button>
            <label>
              เดือน{" "}
              {loading && !data ? (
                // The current month comes from the API; show text instead of an empty picker while it loads.
                <input
                  aria-label="เดือน"
                  type="text"
                  value="กำลังโหลด…"
                  readOnly
                  disabled
                />
              ) : (
                <MonthPill
                  label="เดือน"
                  max={data?.period.currentMonth}
                  value={data?.month ?? ""}
                  onChange={setMonth}
                />
              )}
            </label>
            <button
              disabled={!data?.period.nextMonth}
              onClick={() => setMonth(data!.period.nextMonth)}
            >
              เดือนถัดไป
            </button>
          </div>
        </nav>
      </div>
      {(!valid || rejected) && (
        <div className="dashboard-state dashboard-error" role="alert">
          <p>กรุณาเลือกเดือนที่ถูกต้องและไม่เป็นเดือนอนาคต</p>
          <button onClick={() => setMonth(null)}>กลับเดือนปัจจุบัน</button>
        </div>
      )}
      {loading && valid && (
        <p className="dashboard-state" role="status">
          กำลังโหลด Dashboard...
        </p>
      )}
      {error && (
        <div className="dashboard-state dashboard-error" role="alert">
          <p>{error}</p>
          <button onClick={() => setRevision((v) => v + 1)}>ลองใหม่</button>
        </div>
      )}
      {data && (
        <>
          <section
            className="dashboard-hero"
            aria-label="สรุปข้อมูลเดือนที่เลือก"
          >
            <div>
              <span className="dashboard-eyebrow">
                ยอดจริงจากธุรกรรมที่คุณบันทึก
              </span>
              <h2>
                {data.summary.hasTransactions
                  ? "สรุปการเงินจากรายการที่คุณบันทึก"
                  : "เริ่มเห็นภาพการเงินจากรายการแรกของคุณ"}
              </h2>
              <div className="dashboard-hero-tags">
                {data.summary.budgetExceeded && (
                  <span className="dashboard-hero-warning">
                    รายจ่ายเกินงบรวมของเดือน
                  </span>
                )}
                <span>{data.summary.transactionCount} รายการ</span>
                <span>
                  {data.period.isCurrentMonth
                    ? "เดือนปัจจุบัน · ข้อมูลถึงวันนี้"
                    : "ข้อมูลของเดือนที่เลือก"}
                </span>
              </div>
            </div>
            <Link className="dashboard-hero-link" to="/transactions/add">
              เพิ่มรายการ <CirclePlus aria-hidden="true" size={18} />
            </Link>
          </section>
          <div
            className="dashboard-cards"
            aria-label={
              "สรุปเดือน " +
              thaiMonth(data.month) +
              " ถึง " +
              thaiDate(data.period.effectiveEndDate)
            }
          >
            {[
              {
                label: "รายรับจริง",
                value: data.summary.incomeAmount,
                kind: "income",
                Icon: ArrowDownLeft,
              },
              {
                label: "รายจ่ายจริง",
                value: data.summary.expenseAmount,
                kind: "expense",
                Icon: ArrowUpRight,
              },
              {
                label: "อัตราการออม",
                value: data.summary.savingRate?.percent ?? null,
                kind: "saving",
                Icon: ChartNoAxesCombined,
              },
              {
                label: "กระแสเงินสดสุทธิ",
                value: data.summary.netCashFlow,
                kind: "net",
                Icon: Wallet,
              },
              {
                label: "งบคงเหลือ",
                value: data.summary.budgetRemaining,
                kind: "budget",
                Icon: ChartPie,
              },
            ].map(({ label, value, kind, Icon }) => (
              <SummaryCard
                key={label}
                label={label}
                icon={<Icon aria-hidden="true" size={18} />}
                value={
                  value === null
                    ? kind === "saving"
                      ? "ยังคำนวณไม่ได้"
                      : "ยังไม่ได้ตั้งงบ"
                    : kind === "saving"
                      ? value
                      : moneyText(value)
                }
                unit={
                  value !== null
                    ? kind === "saving"
                      ? "%"
                      : " บาท"
                    : undefined
                }
                className={
                  "dashboard-kpi-" +
                  kind +
                  (kind === "saving" ? " dashboard-saving-rate" : "") +
                  (kind === "budget" && data.summary.budgetExceeded
                    ? " dashboard-exceeded"
                    : "")
                }
              />
            ))}
          </div>
          <p className="dashboard-section-note dashboard-summary-note">
            {data.period.isCurrentMonth ? "เดือนนี้ยังไม่สิ้นสุด · " : ""}
            อัตราการออมคำนวณจากรายการที่บันทึก ไม่ใช่ยอดที่เก็บเข้าเป้าหมาย
            หรือข้อกำหนดให้ต้องออมเงินทั้งหมด
          </p>
          {!data.summary.hasTransactions && (
            <div className="dashboard-empty" role="status">
              ยังไม่มีรายการในเดือนนี้ ยอดจากรายการที่บันทึกเป็น 0.00 บาท
              ไม่ได้ยืนยันว่าไม่มีรายรับหรือรายจ่ายจริง{" "}
              <Link to="/transactions/add">เพิ่มธุรกรรม</Link>
            </div>
          )}
        </>
      )}
      <div className="dashboard-content">
        <div className="dashboard-row dashboard-row-categories">
          {data && (
            <section className="dashboard-panel dashboard-category-panel">
              <div className="dashboard-panel-heading">
                <h2>รายจ่ายตามหมวด</h2>
                <Link to={"/budget?month=" + data.month}>
                  ดูงบประมาณ <ArrowUpRight aria-hidden="true" size={15} />
                </Link>
              </div>
              {!data.expenseCategories.length ? (
                <p className="dashboard-panel-empty">
                  ยังไม่มีรายจ่ายที่บันทึกในเดือนนี้
                </p>
              ) : (
                <ul className="dashboard-categories">
                  {data.expenseCategories.map((c) => (
                    <li key={c.categoryId}>
                      <div className="dashboard-category-line">
                        <span>{c.categoryName}</span>
                        <strong>
                          {moneyText(c.amount)} บาท{" "}
                          <span className="dashboard-percentage">
                            {c.percentage}%
                          </span>
                        </strong>
                      </div>
                      <div className="dashboard-bar" aria-hidden="true" style={{ background: categoryAppearance(c.categoryName).background }}>
                        <span
                          style={{
                            width: Math.min(100, Number(c.percentage)) + "%",
                            background: categoryAppearance(c.categoryName).color,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {data && (
            <section className="dashboard-panel dashboard-review-panel">
              <div className="dashboard-panel-heading">
                <h2>รายการที่ควรตรวจสอบ</h2>
                <span className="dashboard-icon dashboard-icon-warning">
                  <ShieldQuestion aria-hidden="true" size={20} />
                </span>
              </div>
              <AnomalyOverview session={session} />
            </section>
          )}
        </div>
        <div className="dashboard-row dashboard-row-behavior">
          {data && (
            <div className="dashboard-weekly-panel">
              <WeeklyExpenses
                month={data.month}
                today={today}
                session={session}
              />
            </div>
          )}
        </div>
        <div className="dashboard-row dashboard-row-recent">
          {data && (
            <section className="dashboard-panel dashboard-recent-panel">
              <div className="dashboard-panel-heading">
                <h2>ธุรกรรมล่าสุดของเดือน</h2>
                <span className="dashboard-icon">
                  <ReceiptText aria-hidden="true" size={20} />
                </span>
              </div>
              {!data.recentTransactions.items.length ? (
                <p className="dashboard-panel-empty">ยังไม่มีรายการ</p>
              ) : (
                <div
                  className="dashboard-table-wrap dashboard-recent-table"
                  tabIndex={0}
                  role="region"
                  aria-label="ธุรกรรมล่าสุดของเดือน เลื่อนแนวนอนได้"
                >
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">วันที่</th>
                        <th scope="col">รายการ</th>
                        <th scope="col">หมวดหมู่</th>
                        <th scope="col">จำนวนเงิน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentTransactions.items.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <time dateTime={t.date}>{thaiDate(t.date)}</time>
                          </td>
                          <td title={t.description || undefined}>
                            {t.description || "ไม่มีคำอธิบาย"}
                          </td>
                          <td title={t.categoryName}>{t.categoryName}</td>
                          <td className={"dashboard-amount-" + t.type}>
                            <span className="dashboard-recent-type">
                              {t.type === "income" ? "รายรับ" : "รายจ่าย"}
                            </span>
                            {t.type === "income" ? "+" : "−"}
                            {moneyText(t.amount)} ฿
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Link
                className="dashboard-text-link"
                to={"/transactions?month=" + data.month}
              >
                ดูประวัติของเดือนนี้
                {data.recentTransactions.hasMore ? "ทั้งหมด" : ""}{" "}
                <ArrowUpRight aria-hidden="true" size={16} />
              </Link>
            </section>
          )}
          {data && (
            <section className="dashboard-panel dashboard-goals-panel goals-card">
              <div className="goals-card-head">
                <span className="goals-card-icon" aria-hidden="true">
                  <Target size={22} />
                </span>
                <h2>เป้าหมายการออม</h2>
                <Link
                  className="goals-card-open"
                  to="/goals"
                  aria-label="ไปหน้า Goals"
                >
                  <ArrowUpRight aria-hidden="true" size={18} />
                </Link>
              </div>

              <div className="goals-card-allocated">
                <span className="goals-card-coin" aria-hidden="true">
                  <Coins size={22} />
                </span>
                <div>
                  <span className="goals-card-label">
                    เงินที่เก็บแล้ว
                    <span
                      className="goals-card-info"
                      tabIndex={0}
                      title="รวมทุกเป้าหมาย รวมเป้าหมายครบแล้วและเก็บถาวรที่ยังมีเงินเก็บอยู่"
                      aria-label="รวมทุกเป้าหมาย รวมเป้าหมายครบแล้วและเก็บถาวรที่ยังมีเงินเก็บอยู่"
                    >
                      <Info size={14} aria-hidden="true" />
                    </span>
                  </span>
                  <strong>
                    {moneyText(data.goals.allocatedAmount)} <small>฿</small>
                  </strong>
                </div>
              </div>

              <dl className="goals-card-counts">
                <div
                  className={data.goals.activeCount ? "is-on active" : "active"}
                >
                  <span aria-hidden="true">
                    <Sprout size={18} />
                  </span>
                  <dd>{data.goals.activeCount}</dd>
                  <dt>กำลังออม</dt>
                </div>
                <div
                  className={
                    data.goals.notStartedCount
                      ? "is-on not-started"
                      : "not-started"
                  }
                >
                  <span aria-hidden="true">
                    <CirclePlus size={18} />
                  </span>
                  <dd>{data.goals.notStartedCount}</dd>
                  <dt>ยังไม่ได้เก็บ</dt>
                </div>
                <div
                  className={
                    data.goals.overdueCount ? "is-on overdue" : "overdue"
                  }
                >
                  <span aria-hidden="true">
                    <AlarmClock size={18} />
                  </span>
                  <dd>{data.goals.overdueCount}</dd>
                  <dt>เลยกำหนด</dt>
                </div>
              </dl>

              {shownGoals.length ? (
                <ul className="goals-card-list">
                  {shownGoals.map((goal) => (
                    <li
                      key={goal.id}
                      className={"status-" + goal.calculatedStatus}
                    >
                      <div className="goals-card-row-top">
                        <span className="goals-card-row-name">
                          {goal.id === g?.id && (
                            <Star size={14} aria-label="เป้าหมายหลัก" />
                          )}
                          <strong>{goal.name}</strong>
                        </span>
                        <span
                          className={
                            "goals-card-badge status-" + goal.calculatedStatus
                          }
                        >
                          {goal.calculatedStatus === "completed" && (
                            <Check size={12} aria-hidden="true" />
                          )}
                          {goal.calculatedStatus === "completed"
                            ? "ครบแล้ว"
                            : statuses[goal.calculatedStatus]}
                        </span>
                      </div>
                      <div
                        className="goals-card-bar"
                        role="progressbar"
                        aria-label={"ความคืบหน้า " + goal.name}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Number(goal.progressBarPercent)}
                      >
                        <span
                          style={{
                            width: Number(goal.progressBarPercent) + "%",
                          }}
                        />
                      </div>
                      <div className="goals-card-amounts">
                        <span>
                          <strong>{moneyText(goal.savedAmount)}</strong> /{" "}
                          {moneyText(goal.targetAmount)} ฿
                        </span>
                        <strong className="goals-card-percent">
                          {Number(goal.progressPercent).toFixed(0)}%
                        </strong>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="goals-card-empty">
                  ยังไม่มีเป้าหมาย <Link to="/goals">สร้างเป้าหมาย</Link>
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
