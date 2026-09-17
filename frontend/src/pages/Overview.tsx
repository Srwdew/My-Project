import { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  PiggyBank,
} from "lucide-react";
import { apiFetch } from "../api";
import UserHeader from "../components/UserHeader";
import WeeklyExpenses from "../components/WeeklyExpenses";
import {
  getPresetRange,
  validateRange,
  type PeriodPreset,
} from "../utils/overviewPeriod";
import "./Overview.css";

type OverviewData = {
  totalIncome: number;
  totalExpense: number;
  netCashFlow: number;
  savingRate: number;
  transactionCount: number;
  expenseCategories: {
    categoryId: string;
    name: string;
    amount: number;
    percentage: number;
  }[];
  period: {
    startDate: string | null;
    endDate: string | null;
  };
};

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function Overview() {
  const [periodPreset, setPeriodPreset] =
    useState<PeriodPreset>("this_month");

  const [range, setRange] = useState(() =>
    getPresetRange("this_month")
  );

  const [draftRange, setDraftRange] = useState(() =>
    getPresetRange("this_month")
  );

  const [rangeError, setRangeError] = useState("");
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  const { startDate, endDate } = range;

  useEffect(() => {
    const controller = new AbortController();

    async function loadOverview() {
      setLoading(true);
      setError("");
      setData(null);

      try {
        const validationError = validateRange({
          startDate,
          endDate,
        });

        if (validationError) {
          throw new Error(validationError);
        }

        const query = new URLSearchParams({
          startDate,
          endDate,
        });

        const response = await apiFetch(`/overview?${query}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("ไม่สามารถโหลดภาพรวมทางการเงินได้");
        }

        const result: OverviewData = await response.json();

        if (!controller.signal.aborted) {
          setData(result);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "เกิดข้อผิดพลาดในการโหลดข้อมูล"
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadOverview();

    return () => controller.abort();
  }, [startDate, endDate, retryCount]);

  const currentData =
    data &&
    data.period.startDate === startDate &&
    data.period.endDate === endDate
      ? data
      : null;

  const maxAmount = Math.max(
    currentData?.totalIncome ?? 0,
    currentData?.totalExpense ?? 0,
    1
  );

  const hasTransactions =
    currentData !== null && currentData.transactionCount > 0;

  const cashFlowStatus = !hasTransactions
    ? "ยังไม่มีข้อมูลธุรกรรม"
    : currentData!.netCashFlow > 0
      ? "รายรับมากกว่ารายจ่าย"
      : currentData!.netCashFlow < 0
        ? "รายจ่ายมากกว่ารายรับ"
        : "รายรับเท่ากับรายจ่าย";

  const cashFlowDescription = !hasTransactions
    ? "เพิ่มรายการรายรับหรือรายจ่ายเพื่อดูภาพรวมในช่วงที่เลือก"
    : currentData!.netCashFlow > 0
      ? `มีเงินเหลือจากรายรับหักรายจ่าย ${formatMoney(
          currentData!.netCashFlow
        )} บาท`
      : currentData!.netCashFlow < 0
        ? `รายจ่ายสูงกว่ารายรับ ${formatMoney(
            Math.abs(currentData!.netCashFlow)
          )} บาท`
        : "ยอดรายรับและรายจ่ายในช่วงที่เลือกเท่ากัน";

  function applyRange(nextRange: typeof range) {
    if (
      nextRange.startDate !== startDate ||
      nextRange.endDate !== endDate
    ) {
      setLoading(true);
      setError("");
      setRange({ ...nextRange });
    }
  }

  return (
    <div className="overview-page">
      <header className="overview-header">
        <div>
          <h1>ภาพรวมทางการเงิน</h1>
          <p>สรุปรายรับและรายจ่ายจากธุรกรรมของคุณ</p>
        </div>

        <UserHeader />
      </header>

      <div className="overview-period">
        <label className="overview-period-field">
          <span>ช่วงเวลา</span>

          <select
            value={periodPreset}
            onChange={(event) => {
              const nextPreset = event.target.value as PeriodPreset;

              setPeriodPreset(nextPreset);
              setRangeError("");

              if (nextPreset === "custom") {
                setDraftRange({ ...range });
                return;
              }

              const nextRange = getPresetRange(nextPreset);
              applyRange(nextRange);
              setDraftRange(nextRange);
            }}
          >
            <option value="this_month">เดือนนี้ถึงวันนี้</option>
            <option value="last_month">เดือนก่อน</option>
            <option value="last_3_months">3 เดือนล่าสุด</option>
            <option value="last_6_months">6 เดือนล่าสุด</option>
            <option value="this_year">ปีนี้</option>
            <option value="custom">กำหนดเอง</option>
          </select>
        </label>

        {periodPreset === "custom" && (
          <form
            className="overview-custom-period"
            onSubmit={(event) => {
              event.preventDefault();

              const validationError = validateRange(draftRange);
              setRangeError(validationError);

              if (validationError) return;

              applyRange(draftRange);
            }}
          >
            <label className="overview-period-field">
              <span>ตั้งแต่วันที่</span>
              <input
                type="date"
                min="1900-01-01"
                max="9999-12-31"
                required
                value={draftRange.startDate}
                onChange={(event) => {
                  setRangeError("");
                  setDraftRange((previous) => ({
                    ...previous,
                    startDate: event.target.value,
                  }));
                }}
              />
            </label>

            <label className="overview-period-field">
              <span>ถึงวันที่</span>
              <input
                type="date"
                min="1900-01-01"
                max="9999-12-31"
                required
                value={draftRange.endDate}
                onChange={(event) => {
                  setRangeError("");
                  setDraftRange((previous) => ({
                    ...previous,
                    endDate: event.target.value,
                  }));
                }}
              />
            </label>

            <button type="submit">แสดงข้อมูล</button>
          </form>
        )}

        {rangeError && (
          <p className="overview-period-error" role="alert">
            {rangeError}
          </p>
        )}

        <p className="overview-period-caption">
          <p className="overview-period-caption">
  หากช่วงที่เลือกมีวันที่อนาคต
  ยอดรวมจะรวมรายการที่บันทึกล่วงหน้าในช่วงนั้นด้วย
</p>
          ช่วงข้อมูลที่เลือก: {formatDate(startDate)} ถึง{" "}
          {formatDate(endDate)}
        </p>
      </div>

      {error ? (
        <div className="overview-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setError("");
              setLoading(true);
              setRetryCount((count) => count + 1);
            }}
          >
            ลองใหม่
          </button>
        </div>
      ) : loading || !currentData ? (
        <p className="overview-loading" role="status">
          กำลังโหลดภาพรวมทางการเงิน...
        </p>
      ) : (
        <>
          <div className="overview-summary-grid">
            <article className="overview-summary-card income">
              <div className="overview-card-top">
                <span>รายรับรวม</span>
                <ArrowDownLeft size={22} aria-hidden="true" />
              </div>

              <h2>{formatMoney(currentData.totalIncome)}</h2>
              <p>บาท · ในช่วงที่เลือก</p>
            </article>

            <article className="overview-summary-card expense">
              <div className="overview-card-top">
                <span>รายจ่ายรวม</span>
                <ArrowUpRight size={22} aria-hidden="true" />
              </div>

              <h2>{formatMoney(currentData.totalExpense)}</h2>
              <p>บาท · ในช่วงที่เลือก</p>
            </article>

            <article
              className={`overview-summary-card ${
                currentData.netCashFlow < 0 ? "expense" : "net"
              }`}
            >
              <div className="overview-card-top">
                <span>กระแสเงินสดสุทธิ</span>
                <Wallet size={22} aria-hidden="true" />
              </div>

              <h2>{formatMoney(currentData.netCashFlow)}</h2>
              <p>บาท · รายรับหักรายจ่าย</p>
            </article>

            <article className="overview-summary-card saving">
              <div className="overview-card-top">
                <span>อัตราการออม</span>
                <PiggyBank size={22} aria-hidden="true" />
              </div>

              <h2>
  {currentData.totalIncome > 0
    ? `${formatMoney(currentData.savingRate)}%`
    : '—'}
</h2>

<p>
  {currentData.totalIncome > 0
    ? 'สัดส่วนเงินเหลือสุทธิต่อรายรับ ไม่ใช่ยอดออมตามเป้าหมาย'
    : 'คำนวณไม่ได้ เพราะไม่มีรายรับในช่วงที่เลือก'}
</p>
            </article>
          </div>

          <section className="overview-category-panel">
            <div className="overview-section-heading">
              <h2>รายจ่ายแยกตามหมวดหมู่</h2>
              <p>สัดส่วนจากรายจ่ายรวมในช่วงที่เลือก</p>
            </div>

            {currentData.expenseCategories.length === 0 ? (
              <p className="overview-empty">
                ยังไม่มีรายการรายจ่ายในช่วงนี้
              </p>
            ) : (
              <div className="overview-category-list">
                {currentData.expenseCategories.map((category) => (
                  <div
                    className="overview-category-item"
                    key={category.categoryId}
                  >
                    <div className="overview-category-top">
                      <span>{category.name}</span>

                      <strong>
                        {formatMoney(category.amount)} บาท
                        <small>
                          {" "}
                          ({formatMoney(category.percentage)}%)
                        </small>
                      </strong>
                    </div>

                    <div
                      className="overview-category-track"
                      aria-hidden="true"
                    >
                      <div
                        className="overview-category-fill"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(0, category.percentage)
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="overview-bottom-grid">
            <section className="overview-panel">
              <h2>รายรับเทียบรายจ่าย</h2>

              {!hasTransactions ? (
                <p className="overview-empty">
                  ยังไม่มีธุรกรรมในช่วงที่เลือก
                </p>
              ) : (
                <div className="overview-comparison">
                  <div className="overview-comparison-item">
                    <div className="overview-comparison-label">
                      <span>รายรับ</span>
                      <strong>
                        {formatMoney(currentData.totalIncome)} บาท
                      </strong>
                    </div>

                    <div
                      className="overview-comparison-track"
                      aria-hidden="true"
                    >
                      <div
                        className="overview-comparison-fill income"
                        style={{
                          width: `${
                            (currentData.totalIncome / maxAmount) * 100
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="overview-comparison-item">
                    <div className="overview-comparison-label">
                      <span>รายจ่าย</span>
                      <strong>
                        {formatMoney(currentData.totalExpense)} บาท
                      </strong>
                    </div>

                    <div
                      className="overview-comparison-track"
                      aria-hidden="true"
                    >
                      <div
                        className="overview-comparison-fill expense"
                        style={{
                          width: `${
                            (currentData.totalExpense / maxAmount) * 100
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="overview-panel">
              <h2>สถานะกระแสเงินสด</h2>

              <div
                className={`overview-cashflow-status ${
                  !hasTransactions || currentData.netCashFlow === 0
                    ? "neutral"
                    : currentData.netCashFlow > 0
                      ? "positive"
                      : "negative"
                }`}
              >
                <strong>{cashFlowStatus}</strong>
                <p>{cashFlowDescription}</p>
              </div>

              <p className="overview-transaction-count">
                ธุรกรรมทั้งหมดในช่วงนี้{" "}
                {currentData.transactionCount.toLocaleString("th-TH")}{" "}
                รายการ
              </p>
            </section>
          </div>
        </>
      )}

      <WeeklyExpenses
        key={`${startDate}_${endDate}`}
        startDate={startDate}
        endDate={endDate}
      />
    </div>
  );
}