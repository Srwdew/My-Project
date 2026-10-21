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
} from "lucide-react";
import {
  AnomalyOverview,
  BehaviorOverview,
} from "../components/OverviewInsights";
import WeeklyExpenses from "../components/WeeklyExpenses";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api";
import { getToken, useSessionKey } from "../auth";
import UserHeader from "../components/UserHeader";
import {
  bangkokDate,
  moneyText,
  shiftMonth,
  validDashboardMonth,
  type DailyAmount,
} from "../utils/dashboard";
import "./Overview.css";
type Dashboard = {
  month: string;
  asOfDate: string;
  period: {
    startDate: string;
    effectiveEndDate: string;
    calendarEndDate: string;
    isCurrentMonth: boolean;
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
const statuses: Record<string, string> = {
  active: "กำลังออม",
  not_started: "ยังไม่มีเงินจัดสรร",
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
  const values = params.getAll("month"),
    month = values[0] ?? today.slice(0, 7);
  const valid = values.length <= 1 && validDashboardMonth(month, today);
  return (
    <OverviewMonth
      key={`${session}:${month}:${today}:${valid}`}
      session={session}
      month={month}
      today={today}
      valid={valid}
      setMonth={(m) => setParams({ month: m })}
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
  month: string;
  today: string;
  valid: boolean;
  setMonth: (m: string) => void;
}) {
  const [data, setData] = useState<Dashboard | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
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
          "/dashboard?month=" + encodeURIComponent(month),
          { signal: controller.signal },
        );
        if (!r.ok) throw Error();
        const result = (await r.json()) as Dashboard;
        if (active && getToken() === session && result.month === month)
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
              disabled={!valid || month === "0001-01"}
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              เดือนก่อน
            </button>
            <label>
              เดือน{" "}
              <input
                aria-label="เดือน"
                type="month"
                min="0001-01"
                max={today.slice(0, 7)}
                value={valid ? month : ""}
                onChange={(e) => {
                  if (e.target.value) setMonth(e.target.value);
                }}
              />
            </label>
            <button
              disabled={!valid || month >= today.slice(0, 7)}
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              เดือนถัดไป
            </button>
          </div>
        </nav>
      </div>
      {!valid && (
        <div className="dashboard-state dashboard-error" role="alert">
          <p>กรุณาเลือกเดือนที่ถูกต้องและไม่เป็นเดือนอนาคต</p>
          <button onClick={() => setMonth(today.slice(0, 7))}>
            กลับเดือนปัจจุบัน
          </button>
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
            <Link className="dashboard-hero-link" to="/forecast">
              ดูประมาณการ 7 วันตั้งแต่วันนี้{" "}
              <ArrowUpRight aria-hidden="true" size={18} />
            </Link>
          </section>
          <div
            className="dashboard-cards"
            aria-label={
              "สรุปเดือน " + month + " ถึง " + data.period.effectiveEndDate
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
                label: "อัตราการออม (Saving Rate)",
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
              >
                {kind === "saving" ? (
                  <p>
                    {!data.summary.hasTransactions
                      ? "ยังไม่มีธุรกรรมในช่วงนี้"
                      : value === null
                        ? "ไม่มีรายรับที่บันทึก หรือรายรับเป็นศูนย์ จึงคำนวณอัตราไม่ได้"
                        : "(รายรับจริง − รายจ่ายจริง) ÷ รายรับจริง × 100"}
                  </p>
                ) : kind === "budget" ? (
                  <p>
                    {data.summary.budgetExceeded ? (
                      <span className="dashboard-status dashboard-status-danger">
                        เกินงบที่ตั้งไว้
                      </span>
                    ) : data.summary.budgetAmount === null ? (
                      "ตั้งงบรวมเพื่อดูงบคงเหลือ"
                    ) : (
                      "งบรวม " + moneyText(data.summary.budgetAmount) + " บาท"
                    )}{" "}
                    <Link to={"/budget?month=" + month}>ดูงบประมาณ</Link>
                  </p>
                ) : (
                  <p>
                    {kind === "income"
                      ? "จากรายการประเภทรายรับ"
                      : kind === "expense"
                        ? "จากรายการประเภทรายจ่าย"
                        : "รายรับจริง − รายจ่ายจริง"}
                  </p>
                )}
              </SummaryCard>
            ))}
          </div>
          <p className="dashboard-section-note dashboard-summary-note">
            สรุปเดือน {month} ถึง {data.period.effectiveEndDate}
            {data.period.isCurrentMonth ? " · เดือนนี้ยังไม่สิ้นสุด" : ""} ·
            อัตราการออมคำนวณจากรายการที่บันทึก ไม่ใช่ยอดที่จัดสรรเข้า Goals
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
                <Link to={"/transactions?month=" + month}>
                  ดูธุรกรรม <ArrowUpRight aria-hidden="true" size={15} />
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
            <section className="dashboard-panel dashboard-behavior-panel">
              <div className="dashboard-panel-heading">
                <h2>พฤติกรรมที่เปลี่ยนไป</h2>
                <span className="dashboard-icon">
                  <ChartNoAxesCombined aria-hidden="true" size={20} />
                </span>
              </div>
              <BehaviorOverview session={session} today={today} />
            </section>
          )}
          {valid && (
            <div className="dashboard-weekly-panel">
              <WeeklyExpenses month={month} today={today} session={session} />
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
                            <time>{t.date}</time>
                          </td>
                          <td>{t.description || "ไม่มีคำอธิบาย"}</td>
                          <td>{t.categoryName}</td>
                          <td className={"dashboard-amount-" + t.type}>
                            {t.type === "income" ? "รายรับ +" : "รายจ่าย −"}
                            {moneyText(t.amount)} บาท
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Link
                className="dashboard-text-link"
                to={"/transactions?month=" + month}
              >
                ดูประวัติของเดือนนี้
                {data.recentTransactions.hasMore ? "ทั้งหมด" : ""}{" "}
                <ArrowUpRight aria-hidden="true" size={16} />
              </Link>
            </section>
          )}
          {data && (
            <section className="dashboard-panel dashboard-goals-panel">
              <div className="dashboard-panel-heading">
                <h2>Goals — สถานะปัจจุบัน</h2>
                <span className="dashboard-icon dashboard-icon-success">
                  <Target aria-hidden="true" size={20} />
                </span>
              </div>
              <dl className="dashboard-goal-counts">
                <div>
                  <dt>กำลังออม</dt>
                  <dd>{data.goals.activeCount}</dd>
                </div>
                <div>
                  <dt>ยังไม่มีเงินจัดสรร</dt>
                  <dd>{data.goals.notStartedCount}</dd>
                </div>
                <div>
                  <dt>เลยกำหนด</dt>
                  <dd>{data.goals.overdueCount}</dd>
                </div>
              </dl>
              <p>
                เงินที่จัดสรรอยู่{" "}
                <strong>{moneyText(data.goals.allocatedAmount)} บาท</strong>
              </p>
              <p className="dashboard-section-note">
                รวมทุกเป้าหมาย รวมเป้าหมายครบแล้วและเก็บถาวรที่ยังมีเงินจัดสรร
              </p>
              {g ? (
                <div className="dashboard-primary-goal">
                  <h3>เป้าหมายหลัก: {g.name}</h3>
                  <p>
                    <span
                      className={
                        "dashboard-status dashboard-goal-status-" +
                        g.calculatedStatus
                      }
                    >
                      {g.archivedAt ? "เก็บถาวรแล้ว · " : ""}
                      {statuses[g.calculatedStatus]}
                    </span>
                  </p>
                  <p>
                    จัดสรร {moneyText(g.savedAmount)} /{" "}
                    {moneyText(g.targetAmount)} บาท ({g.progressPercent}%)
                  </p>
                  <div className="dashboard-bar" aria-hidden="true">
                    <span
                      style={{ width: Number(g.progressBarPercent) + "%" }}
                    />
                  </div>
                  <p className="dashboard-section-note">
                    ต้องการอีก {moneyText(g.remainingAmount)} บาท
                  </p>
                </div>
              ) : (
                <p className="dashboard-panel-empty">
                  ยังไม่ได้เลือกเป้าหมายหลัก{" "}
                  <Link to="/settings">เลือกใน Settings</Link>
                </p>
              )}
              <Link className="dashboard-text-link" to="/goals">
                ไปหน้า Goals <ArrowUpRight aria-hidden="true" size={16} />
              </Link>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
