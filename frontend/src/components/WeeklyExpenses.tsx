import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { validateRange } from "../utils/overviewPeriod";
import "./WeeklyExpenses.css";

type WeeklyCategory = {
  categoryId: string;
  name: string;
  amount: number;
  transactionCount: number;
};

type WeeklyItem = {
  weekNumber: number;
  startDate: string;
  endDate: string;
  dayCount: number;
  totalExpense: number;
  transactionCount: number;
  categories: WeeklyCategory[];
};

type WeeklyData = {
  period: {
    startDate: string;
    endDate: string;
    dayCount: number;
  };
  weekStartsOn: "monday";
  totalExpense: number;
  transactionCount: number;
  weeks: WeeklyItem[];
};

type Props = {
  startDate: string;
  endDate: string;
};

function money(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function shortDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

export default function WeeklyExpenses({
  startDate,
  endDate,
}: Props) {
  const [data, setData] = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadWeeklyExpenses() {
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

        const response = await apiFetch(`/overview/weekly?${query}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("ไม่สามารถโหลดรายจ่ายรายสัปดาห์ได้");
        }

        const result: WeeklyData = await response.json();

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

    void loadWeeklyExpenses();

    return () => controller.abort();
  }, [startDate, endDate, retryCount]);

  const currentData =
    data &&
    data.period.startDate === startDate &&
    data.period.endDate === endDate
      ? data
      : null;

  const maxExpense = Math.max(
    0,
    ...(currentData?.weeks.map((week) => week.totalExpense) ?? [])
  );

  return (
    <section className="weekly-expenses">
      <div className="weekly-expenses-heading">
        <div>
          <h2>รายจ่ายรายสัปดาห์</h2>
          <p>
            สัปดาห์จันทร์–อาทิตย์
            นับเฉพาะวันที่อยู่ในช่วงที่เลือก
          </p>
        </div>

        {!loading && !error && currentData && (
          <div className="weekly-expenses-total">
            <span>รวมช่วงที่เลือก</span>
            <strong>{money(currentData.totalExpense)} บาท</strong>
          </div>
        )}
      </div>

      {error ? (
        <div className="weekly-expenses-error" role="alert">
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
        <p className="weekly-expenses-message" role="status">
          กำลังโหลดรายจ่ายรายสัปดาห์...
        </p>
      ) : (
        <>
          {currentData.transactionCount === 0 && (
            <p className="weekly-expenses-message">
              ยังไม่มีรายการรายจ่ายในช่วงที่เลือก
            </p>
          )}

          <div className="weekly-expenses-list">
            {currentData.weeks.map((week) => {
              const barWidth =
                maxExpense > 0
                  ? Math.min(
                      100,
                      Math.max(
                        0,
                        (week.totalExpense / maxExpense) * 100
                      )
                    )
                  : 0;

              return (
                <details
                  className="weekly-expenses-week"
                  key={week.startDate}
                >
                  <summary>
                    <div className="weekly-expenses-week-top">
                      <div>
                        <strong>
                          สัปดาห์ที่ {week.weekNumber}
                        </strong>

                        <span className="weekly-expenses-date">
                          {shortDate(week.startDate)} –{" "}
                          {shortDate(week.endDate)} ·{" "}
                          {week.dayCount} วัน
                        </span>
                      </div>

                      <strong className="weekly-expenses-amount">
                        {money(week.totalExpense)} บาท
                      </strong>
                    </div>

                    <div
                      className="weekly-expenses-track"
                      aria-hidden="true"
                    >
                      <div
                        className="weekly-expenses-fill"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    <span className="weekly-expenses-detail-hint">
                      {week.transactionCount.toLocaleString("th-TH")}{" "}
                      รายการ · กดดู/ซ่อนหมวดหมู่
                    </span>
                  </summary>

                  <div className="weekly-expenses-categories">
                    {week.categories.length === 0 ? (
                      <p>ไม่มีรายการรายจ่ายในช่วงนี้</p>
                    ) : (
                      <ul>
                        {week.categories.map((category) => (
                          <li key={category.categoryId}>
                            <div>
                              <span>{category.name}</span>
                              <small>
                                {category.transactionCount.toLocaleString(
                                  "th-TH"
                                )}{" "}
                                รายการ
                              </small>
                            </div>

                            <strong>
                              {money(category.amount)} บาท
                            </strong>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              );
            })}
          </div>

          <p className="weekly-expenses-footnote">
            แถบแสดงยอดเทียบกับสัปดาห์ที่มียอดสูงสุดในช่วงที่เลือก
            แต่ละช่วงอาจมีจำนวนวันไม่เท่ากัน
            หากเลือกวันที่อนาคต
            จะรวมรายการที่บันทึกล่วงหน้าในช่วงนั้นด้วย
          </p>
        </>
      )}
    </section>
  );
}