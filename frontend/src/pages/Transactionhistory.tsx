import { thaiMonth } from "../utils/thaiDate";
import { useToast } from "../components/LocalToast";
import {
  getBangkokTodayKey,
  getTransactionDateLabel as getDateLabel,
} from "../utils/transactionStatus";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getToken, useSessionKey } from "../auth";
import { validDashboardMonth } from "../utils/dashboard";
import DatePicker from "react-datepicker";
import { th } from "date-fns/locale";
import { thaiMonthHeader } from "../components/DatePill";
import "react-datepicker/dist/react-datepicker.css";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Search,
  Wallet,
} from "lucide-react";
import "./TransactionHistory.css";
import { apiFetch } from "../api";
import BudgetIcon from "../components/BudgetIcon";
import { categoryAppearance } from "../utils/categoryAppearance";

type TransactionType = "income" | "expense";

type Category = {
  id: string;
  name: string;
  type: TransactionType;
};

type Transaction = {
  id: string;
  userId: string;
  categoryId: string;
  type: TransactionType;
  amount: string | number;
  transactionDate: string;
  transactionTime: string | null;
  paymentMethod?: string | null;
  description?: string | null;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
  category: Category;
};

type GroupedTransactions = {
  date: string;
  label: string;
  items: Transaction[];
};

export default function TransactionHistory() {
  const session = useSessionKey();
  const [params] = useSearchParams();
  return (
    <TransactionHistorySession
      key={`${session}:${params.toString()}`}
      session={session}
    />
  );
}
function TransactionHistorySession({ session }: { session: string | null }) {
  const todayKey = getBangkokTodayKey();
  const weekStart = new Date(`${todayKey}T00:00:00Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const weekStartKey = weekStart.toISOString().slice(0, 10);
  const toast = useToast();
  const [params] = useSearchParams();
  const values = params.getAll("month");
  const month = values[0] ?? null;
  const validMonth =
    values.length <= 1 && (month === null || validDashboardMonth(month));
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFilter, setDateFilter] = useState<Date | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<"" | "7d" | "month">("");

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      if (!target.closest(".history-row-menu")) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setTransactions([]);
    setError("");
    if (!validMonth || !session) {
      setLoading(false);
      return () => {
        active = false;
        controller.abort();
      };
    }
    void (async () => {
      try {
        const transactionsRes = await apiFetch(
          "/transactions" +
            (month === null ? "" : "?month=" + encodeURIComponent(month)),
          { signal: controller.signal },
        );
        if (!transactionsRes.ok) throw Error();
        const items = await transactionsRes.json();
        if (active && getToken() === session) setTransactions(items);
      } catch {
        if (active && !controller.signal.aborted && getToken() === session)
          setError("ไม่สามารถโหลดข้อมูลธุรกรรมได้ กรุณาลองใหม่");
      } finally {
        if (active && getToken() === session) setLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [session, month, validMonth, revision]);
  // Every filter except category; category chips count within this set.
  const baseTransactions = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return transactions.filter((transaction) => {
      const description = transaction.description?.toLowerCase() ?? "";
      const note = transaction.note?.toLowerCase() ?? "";
      const categoryName = transaction.category?.name?.toLowerCase() ?? "";

      const matchesSearch =
        !keyword ||
        description.includes(keyword) ||
        note.includes(keyword) ||
        categoryName.includes(keyword);

      const matchesType = !typeFilter || transaction.type === typeFilter;

      const transactionDate = transaction.transactionDate.slice(0, 10);
      const selectedDate = dateFilter ? getLocalDateKey(dateFilter) : null;
      const matchesDate = !selectedDate || transactionDate === selectedDate;
      const matchesPeriod =
        !periodFilter ||
        (periodFilter === "month"
          ? transactionDate.slice(0, 7) === todayKey.slice(0, 7)
          : transactionDate >= weekStartKey && transactionDate <= todayKey);

      return matchesSearch && matchesType && matchesDate && matchesPeriod;
    });
  }, [transactions, search, typeFilter, dateFilter, periodFilter, todayKey, weekStartKey]);

  const categoryChips = useMemo(() => {
    const chips = new Map<string, { id: string; name: string; count: number }>();
    for (const t of baseTransactions) {
      const chip = chips.get(t.categoryId) ?? { id: t.categoryId, name: t.category?.name || "อื่น ๆ", count: 0 };
      chip.count += 1;
      chips.set(t.categoryId, chip);
    }
    // Keep the selected chip visible at 0 so it can still be cleared.
    if (categoryFilter && !chips.has(categoryFilter)) {
      const name = transactions.find((t) => t.categoryId === categoryFilter)?.category?.name || "อื่น ๆ";
      chips.set(categoryFilter, { id: categoryFilter, name, count: 0 });
    }
    return [...chips.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "th"));
  }, [baseTransactions, categoryFilter, transactions]);

  const filteredTransactions = useMemo(
    () =>
      categoryFilter
        ? baseTransactions.filter((t) => t.categoryId === categoryFilter)
        : baseTransactions,
    [baseTransactions, categoryFilter],
  );

  const totals = useMemo(() => {
    let income = 0,
      expense = 0;
    for (const t of filteredTransactions)
      if (t.type === "income") income += Number(t.amount);
      else expense += Number(t.amount);
    return { income, expense, net: income - expense };
  }, [filteredTransactions]);

  const groupedTransactions = useMemo<GroupedTransactions[]>(() => {
    const groups: Record<string, Transaction[]> = {};

    for (const transaction of filteredTransactions) {
      const date = transaction.transactionDate.slice(0, 10);

      if (!groups[date]) {
        groups[date] = [];
      }

      groups[date].push(transaction);
    }

    return Object.entries(groups)
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
      .map(([date, items]) => ({
        date,
        label: getDateLabel(date),
        items,
      }));
  }, [filteredTransactions]);

  const hasActiveFilters =
    month !== null ||
    periodFilter !== "" ||
    search.trim() !== "" ||
    categoryFilter !== "" ||
    typeFilter !== "" ||
    dateFilter !== null;

  const visibleGroups =
    showAllHistory || hasActiveFilters
      ? groupedTransactions
      : groupedTransactions.slice(0, 3);

  const historyViewLabel =
    month !== null
      ? "รายการของเดือน " + month
      : hasActiveFilters
        ? "ผลการค้นหาและกรองจากประวัติทั้งหมด"
        : showAllHistory
          ? "ประวัติทั้งหมด"
          : "รายการล่าสุด";

  const expenseCategorySummary = useMemo(() => {
    const expenseTransactions = transactions.filter(
      (transaction) => transaction.type === "expense",
    );
    const totalExpense = expenseTransactions.reduce(
      (sum, transaction) => sum + Number(transaction.amount),
      0,
    );
    const categoryTotals: Record<string, number> = {};
    for (const transaction of expenseTransactions) {
      const name = transaction.category?.name || "อื่น ๆ";
      categoryTotals[name] =
        (categoryTotals[name] || 0) + Number(transaction.amount);
    }
    return Object.entries(categoryTotals)
      .map(([name, amount]) => ({
        name,
        amount,
        percentage: totalExpense > 0 ? (amount / totalExpense) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [transactions]);

  // Deferred delete: hide now, call the API after the undo window closes (or on leave).
  const pendingDelete = useRef<{ transaction: Transaction; index: number; timer: number } | null>(null);
  const [undoTransaction, setUndoTransaction] = useState<Transaction | null>(null);

  const restore = (transaction: Transaction, index: number) =>
    setTransactions((current) =>
      current.some((item) => item.id === transaction.id)
        ? current
        : [...current.slice(0, index), transaction, ...current.slice(index)],
    );

  const commitDelete = async (transaction: Transaction, index: number) => {
    try {
      const response = await apiFetch(`/transactions/${transaction.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        restore(transaction, index);
        toast(data.error ? `ลบไม่สำเร็จ: ${data.error}` : "ลบไม่สำเร็จ");
      }
    } catch (error) {
      console.error(error);
      restore(transaction, index);
      toast("ไม่สามารถเชื่อมต่อกับ Backend ได้");
    }
  };

  const flushPendingDelete = () => {
    const pending = pendingDelete.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingDelete.current = null;
    setUndoTransaction(null);
    void commitDelete(pending.transaction, pending.index);
  };

  useEffect(() => () => flushPendingDelete(), []);

  const handleDelete = (transactionId: string) => {
    flushPendingDelete();
    const index = transactions.findIndex((item) => item.id === transactionId);
    if (index < 0) return;
    const transaction = transactions[index];

    setTransactions((current) =>
      current.filter((item) => item.id !== transactionId),
    );
    setOpenMenuId(null);
    setUndoTransaction(transaction);
    pendingDelete.current = {
      transaction,
      index,
      timer: window.setTimeout(flushPendingDelete, 6000),
    };
  };

  const undoDelete = () => {
    const pending = pendingDelete.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingDelete.current = null;
    setUndoTransaction(null);
    restore(pending.transaction, pending.index);
  };

  const formatBaht = (value: number, signed = true) => {
    const text = Math.abs(value).toLocaleString("th-TH", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    const sign = value < 0 ? "-" : signed ? "+" : "";
    return `${sign}${text} ฿`;
  };
  const signedAmount = (t: Transaction) =>
    t.type === "income" ? Number(t.amount) : -Number(t.amount);

  const formatTime = (value: string | null) => {
    if (!value) {
      return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    const hours = String(date.getUTCHours()).padStart(2, "0");
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");

    return `${hours}:${minutes} น.`;
  };

  const getCategoryIcon = (categoryName: string) => {
    const appearance = categoryAppearance(categoryName);

    return (
      <span
        className="history-category-icon"
        aria-hidden="true"
        style={{ color: appearance.color, background: appearance.background }}
      >
        <BudgetIcon name={appearance.icon} />
      </span>
    );
  };

  const getSummaryColorClass = (index: number) => {
    const classes = ["orange", "blue", "red", "purple", "green"];

    return classes[index] || "blue";
  };

  return (
    <div className="history-page">
      {undoTransaction && (
        <div className="local-toast-region history-undo">
          <div className="local-toast" role="status">
            <span>ลบรายการแล้ว</span>
            <button type="button" onClick={undoDelete}>
              เลิกทำ
            </button>
          </div>
        </div>
      )}
      <header className="history-header compact-page-toolbar">
        <h1 className="page-heading-accessible">การจัดการธุรกรรม</h1>
      </header>

      {month !== null && (
        <p>
          กรองเดือน {thaiMonth(month)} · <Link to="/transactions">ดูประวัติทั้งหมด</Link>
        </p>
      )}
      {!validMonth && (
        <p role="alert">เดือนที่ระบุไม่ถูกต้องหรือเป็นเดือนอนาคต</p>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button onClick={() => setRevision((v) => v + 1)}>ลองใหม่</button>
        </div>
      )}
      <div className="history-layout">
        <section className="history-main-card">
          <div className="history-top-bar">
            <div className="history-tabs">
              <span key={historyViewLabel} className="history-tab active">
                {historyViewLabel}
              </span>
            </div>
            <button
              type="button"
              className="history-add-button"
              onClick={() => navigate("/transactions/add")}
            >
              + เพิ่มรายการ
            </button>
          </div>

          <div className="history-totals">
            <div className="history-total income">
              <span className="history-total-icon" aria-hidden="true">
                <ArrowDownLeft size={18} />
              </span>
              <div>
                <span>รายรับ</span>
                <strong key={formatBaht(totals.income)}>{formatBaht(totals.income)}</strong>
              </div>
            </div>
            <div className="history-total expense">
              <span className="history-total-icon" aria-hidden="true">
                <ArrowUpRight size={18} />
              </span>
              <div>
                <span>รายจ่าย</span>
                <strong key={formatBaht(-totals.expense)}>{formatBaht(-totals.expense)}</strong>
              </div>
            </div>
            <div className="history-total net">
              <span className="history-total-icon" aria-hidden="true">
                <Wallet size={18} />
              </span>
              <div>
                <span>สุทธิ</span>
                <strong key={formatBaht(totals.net, false)}>{formatBaht(totals.net, false)}</strong>
              </div>
            </div>
          </div>

          <div className="history-filter-box">
            <label className="history-search-box">
              <Search size={17} aria-hidden="true" />
              <input
                type="text"
                placeholder="ค้นหารายการ..."
                aria-label="ค้นหารายการ"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>

            <div className="history-segment" role="group" aria-label="ประเภท">
              <SegmentTrack index={["", "expense", "income"].indexOf(typeFilter)} count={3}>
              {(
                [
                  ["", "ทั้งหมด"],
                  ["expense", "รายจ่าย"],
                  ["income", "รายรับ"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={typeFilter === value ? "active" : ""}
                  aria-pressed={typeFilter === value}
                  onClick={() => setTypeFilter(value)}
                >
                  {label}
                </button>
              ))}
              </SegmentTrack>
            </div>

            <div className="history-segment" role="group" aria-label="ช่วงเวลา">
              <SegmentTrack
                index={dateFilter ? -1 : ["", "7d", "month"].indexOf(periodFilter)}
                count={3}
              >
              {(
                [
                  ["", "ทั้งหมด"],
                  ["7d", "7 วัน"],
                  ["month", "เดือนนี้"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={!dateFilter && periodFilter === value ? "active" : ""}
                  aria-pressed={!dateFilter && periodFilter === value}
                  onClick={() => {
                    setPeriodFilter(value);
                    setDateFilter(null);
                  }}
                >
                  {label}
                </button>
              ))}
              </SegmentTrack>
              <DatePicker
                selected={dateFilter}
                onChange={(date: Date | null) => {
                  setDateFilter(date);
                  setPeriodFilter("");
                }}
                dateFormat="dd/MM/yyyy"
                locale={th}
                renderCustomHeader={thaiMonthHeader}
                calendarStartDay={1}
                todayButton="วันนี้"
                popperClassName="history-datepicker-popper"
                popperPlacement="bottom-end"
                customInput={
                  <button
                    type="button"
                    className={`history-calendar-button ${
                      dateFilter ? "active" : ""
                    }`}
                    aria-label={
                      dateFilter
                        ? `กรองวันที่ ${dateFilter.toLocaleDateString("th-TH")}`
                        : "เลือกวันที่"
                    }
                  >
                    <CalendarDays size={18} aria-hidden="true" />
                  </button>
                }
              />
            </div>
          </div>

          {categoryChips.length > 0 && (
            <div className="history-category-chips" role="group" aria-label="หมวดหมู่">
              <button
                type="button"
                className={categoryFilter === "" ? "active" : ""}
                aria-pressed={categoryFilter === ""}
                onClick={() => setCategoryFilter("")}
              >
                <i aria-hidden="true" style={{ background: "var(--color-brand)" }} />
                ทั้งหมด <span>{baseTransactions.length}</span>
              </button>
              {categoryChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={categoryFilter === chip.id ? "active" : ""}
                  aria-pressed={categoryFilter === chip.id}
                  onClick={() => setCategoryFilter(categoryFilter === chip.id ? "" : chip.id)}
                >
                  <i aria-hidden="true" style={{ background: categoryAppearance(chip.name).color }} />
                  {chip.name} <span>{chip.count}</span>
                </button>
              ))}
            </div>
          )}

          <div
            className="history-groups"
            key={[search, typeFilter, periodFilter, dateFilter?.getTime(), categoryFilter].join("|")}
          >
            {loading ? (
              <div className="history-empty-state">กำลังโหลดข้อมูล...</div>
            ) : groupedTransactions.length === 0 ? (
              <div className="history-empty-state">ไม่พบรายการธุรกรรม</div>
            ) : (
              visibleGroups.map((group) => (
                <div key={group.date} className="history-group-card">
                  <div className="history-group-header">{group.label}</div>

                  <div className="history-group-body">
                    {group.items.map((transaction) => (
                      <div key={transaction.id} className="history-row">
                        <div className="history-row-icon">
                          {getCategoryIcon(transaction.category.name)}
                        </div>

                        <div className="history-row-info">
                          <strong>
                            {transaction.description ||
                              transaction.category.name}
                          </strong>
                          <span>Note: {transaction.note || ""}</span>
                        </div>

                        <div className="history-row-badge-wrap">
                          <span
                            className={`history-type-badge ${transaction.type}`}
                          >
                            {transaction.type === "income"
                              ? "รายรับ"
                              : "รายจ่าย"}
                          </span>
                        </div>

                        <div className="history-row-category">
                          {transaction.category.name}
                        </div>

                        <div
                          className={`history-row-amount ${transaction.type}`}
                        >
                          {formatBaht(signedAmount(transaction))}
                        </div>

                        <div className="history-row-time">
                          {formatTime(transaction.transactionTime)}
                        </div>

                        <div className="history-row-menu">
                          <button
                            type="button"
                            className="history-menu-button"
                            onClick={() =>
                              setOpenMenuId(
                                openMenuId === transaction.id
                                  ? null
                                  : transaction.id,
                              )
                            }
                          >
                            ⋮
                          </button>

                          {openMenuId === transaction.id && (
                            <div className="history-menu-dropdown">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  navigate(
                                    `/transactions/${transaction.id}/edit`,
                                  );
                                }}
                              >
                                แก้ไข
                              </button>

                              <button
                                type="button"
                                className="delete"
                                onClick={() => handleDelete(transaction.id)}
                              >
                                ลบ
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="history-footer-link">
            {!loading && hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setCategoryFilter("");
                  setTypeFilter("");
                  setDateFilter(null);
                  setPeriodFilter("");
                  setOpenMenuId(null);
                }}
              >
                ล้างตัวกรอง
              </button>
            )}

            {!loading &&
              !hasActiveFilters &&
              groupedTransactions.length > 3 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAllHistory((current) => !current);
                    setOpenMenuId(null);
                  }}
                >
                  {showAllHistory
                    ? "แสดงเฉพาะ 3 วันที่มีรายการล่าสุด"
                    : "ดูประวัติทั้งหมด"}
                </button>
              )}
          </div>
        </section>

        <aside className="history-side-card">
          <div className="history-side-title">
            <h2>หมวดหมู่ค่าใช้จ่ายหลัก</h2>
            <p>5 อันดับจากรายจ่ายที่บันทึกทั้งหมด ทุกช่วงเวลา</p>
            <p>สรุปนี้ไม่เปลี่ยนตามตัวกรองรายการ</p>
          </div>

          <div className="history-summary-list">
            {loading ? (
              <div className="history-side-empty">กำลังโหลดข้อมูล...</div>
            ) : expenseCategorySummary.length === 0 ? (
              <div className="history-side-empty">ยังไม่มีข้อมูลรายจ่าย</div>
            ) : (
              expenseCategorySummary.map((item, index) => (
                <div key={item.name} className="history-summary-item">
                  <div className="history-summary-top">
                    <div
                      className={`history-summary-icon ${getSummaryColorClass(index)}`}
                    >
                      {getCategoryIcon(item.name)}
                    </div>

                    <strong>{item.name}</strong>

                    <span>{item.percentage.toFixed(0)}%</span>
                  </div>

                  <div className="history-summary-progress">
                    <div
                      className={`history-summary-progress-value ${getSummaryColorClass(
                        index,
                      )}`}
                      style={{
                        width: `${Math.min(item.percentage, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// Sliding "water drop" highlight: slides with transform and briefly stretches mid-move.
function SegmentTrack({
  index,
  count,
  children,
}: {
  index: number;
  count: number;
  children: React.ReactNode;
}) {
  const [drop, setDrop] = useState({ index, last: Math.max(index, 0), moves: 0 });
  if (drop.index !== index)
    setDrop({
      index,
      last: index >= 0 ? index : drop.last,
      moves: index >= 0 && index !== drop.last ? drop.moves + 1 : drop.moves,
    });
  const at = index >= 0 ? index : drop.last;
  return (
    <div
      className="history-segment-track"
      style={
        {
          gridTemplateColumns: `repeat(${count}, 1fr)`,
          "--count": count,
          "--at": at,
        } as React.CSSProperties
      }
    >
      <span
        className="history-segment-drop"
        data-on={index >= 0}
        aria-hidden="true"
      >
        {/* Alternating class restarts the stretch keyframe on every move. */}
        <i
          className={
            drop.moves ? (drop.moves % 2 ? "stretch-a" : "stretch-b") : undefined
          }
        />
      </span>
      {children}
    </div>
  );
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
