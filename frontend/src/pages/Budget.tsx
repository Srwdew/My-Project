import { categoryAppearance } from "../utils/categoryAppearance";
import BudgetIcon from "../components/BudgetIcon";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useToast } from "../components/LocalToast";
import { useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { Bell, BellOff, Minus, Plus, Wallet } from "lucide-react";
import { apiFetch } from "../api";
import UserHeader from "../components/UserHeader";
import Dropdown from "../components/Dropdown";
import "./Budget.css";

type BudgetData = {
  year: number;
  month: number;
  budgetAmount: number | null;
  totalExpense: number;
  remaining: number | null;
  usedPercentage: number | null;
  timeline: {
    monthState: "past" | "current" | "future";
    daysInMonth: number;
    elapsedDays: number;
    plannedExpenseToDate: number | null;
    actualExpenseToDate: number;
    deviation: number | null;
    paceStatus:
      | "not_set"
      | "not_started"
      | "above_plan"
      | "below_plan"
      | "on_plan";
  };
};

type CategoryItem = {
  categoryId: string;
  categoryName: string;
  budgetAmount: number | null;
  expenseAmount: number;
  remainingAmount: number | null;
  status: "not_set" | "within_budget" | "at_budget" | "over_budget";
};

type CategoryResponse = {
  year: number;
  month: number;
  items: CategoryItem[];
};

type PageData = {
  period: string;
  budget: BudgetData;
  categories: CategoryItem[];
};


function money(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function responseError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  return new Error(data?.error || data?.message || fallback);
}

export default function Budget() {
  const toast = useToast();

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMonth = searchParams.get("month") ?? "";
  const selectedMonth = /^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(
    requestedMonth,
  )
    ? requestedMonth
    : null; // no month: the backend answers with the current cycle
  function setSelectedMonth(value: string) {
    setSearchParams((current) => {
      current.set("month", value);
      return current;
    });
  }
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [notificationSettingsOpen, setNotificationSettingsOpen] =
    useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [target, setTarget] = useState("total");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const monthPickerRef = useRef<DatePicker>(null);
  const mounted = useRef(false);
  const actionLock = useRef(false);

  const visibleData =
    data && (selectedMonth === null || data.period === selectedMonth)
      ? data
      : null;
  const shownMonth = visibleData?.period ?? null;
  const budget = visibleData?.budget;
  const categories = visibleData?.categories ?? [];

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (modalOpen && dialog && !dialog.open) {
      dialog.showModal();
    } else if (!modalOpen && dialog?.open) {
      dialog.close();
    }
  }, [modalOpen]);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setLoadError("");

      const [year = "", month = ""] = selectedMonth?.split("-") ?? [];
      const query = selectedMonth
        ? "?" + new URLSearchParams({ year, month })
        : "";

      try {
        const [budgetResponse, categoryResponse] = await Promise.all([
          apiFetch(`/budget${query}`, {
            signal: controller.signal,
          }),
          apiFetch(`/budget/categories${query}`, {
            signal: controller.signal,
          }),
        ]);

        if (!budgetResponse.ok) {
          throw await responseError(budgetResponse, "ไม่สามารถโหลดงบรวมได้");
        }
        if (!categoryResponse.ok) {
          throw await responseError(
            categoryResponse,
            "ไม่สามารถโหลดงบรายหมวดได้",
          );
        }

        const nextBudget: BudgetData = await budgetResponse.json();
        const nextCategories: CategoryResponse = await categoryResponse.json();

        if (!controller.signal.aborted) {
          setData({
            period: `${String(nextBudget.year).padStart(4, "0")}-${String(nextBudget.month).padStart(2, "0")}`,
            budget: nextBudget,
            categories: nextCategories.items,
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error ? error.message : "เชื่อมต่อไม่สำเร็จ",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [selectedMonth, revision]);

  function openEditor(nextTarget: string) {
    const existing =
      nextTarget === "total"
        ? budget?.budgetAmount
        : categories.find((item) => item.categoryId === nextTarget)
            ?.budgetAmount;

    setTarget(nextTarget);
    setAmount(existing == null ? "" : String(existing));
    setSaveError("");
    setMenuId(null);
    setModalOpen(true);
  }

  function changeTarget(nextTarget: string) {
    const existing =
      nextTarget === "total"
        ? budget?.budgetAmount
        : categories.find((item) => item.categoryId === nextTarget)
            ?.budgetAmount;

    setTarget(nextTarget);
    setAmount(existing == null ? "" : String(existing));
    setSaveError("");
  }

  async function saveBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionLock.current) return;

    const amountText = amount.trim();

    if (
      !/^\d{1,10}(\.\d{1,2})?$/.test(amountText) ||
      Number(amountText) <= 0 ||
      Number(amountText) > 9999999999.99
    ) {
      setSaveError(
        "กรอกงบมากกว่า 0 ไม่เกิน 9,999,999,999.99 บาท ทศนิยมไม่เกิน 2 ตำแหน่ง",
      );
      return;
    }

    toast("");
    actionLock.current = true;
    setSaving(true);
    setSaveError("");
    setNotice("");

    // Editing is only reachable once a month's data is shown.
    const [year, month] = shownMonth!.split("-").map(Number);
    const path =
      target === "total"
        ? "/budget"
        : `/budget/categories/${encodeURIComponent(target)}`;

    try {
      const response = await apiFetch(path, {
        method: "PUT",
        body: JSON.stringify({ year, month, amount: amountText }),
      });

      if (!response.ok) {
        throw await responseError(response, "บันทึกงบไม่สำเร็จ");
      }

      if (mounted.current) {
        setModalOpen(false);
        toast("บันทึกงบประมาณเรียบร้อยแล้ว", "success");
        setLoading(true);
        setRevision((value) => value + 1);
      }
    } catch (error) {
      if (mounted.current) {
        setSaveError(
          error instanceof Error ? error.message : "เชื่อมต่อไม่สำเร็จ",
        );
      }
    } finally {
      actionLock.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  async function removeBudget(item: CategoryItem) {
    toast("");
    if (actionLock.current) return;

    actionLock.current = true;
    setSaving(true);
    setMenuId(null);
    setNotice("");

    const [year = "", month = ""] = shownMonth!.split("-");
    const params = new URLSearchParams({ year, month });

    try {
      const response = await apiFetch(
        `/budget/categories/${encodeURIComponent(item.categoryId)}?${params}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw await responseError(response, "ยกเลิกงบไม่สำเร็จ");
      }

      if (mounted.current) {
        toast(
          `ยกเลิกงบ ${item.categoryName} แล้ว ธุรกรรมยังอยู่ครบ`,
          "success",
        );
        setLoading(true);
        setRevision((value) => value + 1);
      }
    } catch (error) {
      if (mounted.current) {
        setNotice(
          error instanceof Error ? error.message : "เชื่อมต่อไม่สำเร็จ",
        );
      }
    } finally {
      actionLock.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  const categoryOverrun =
    categories.reduce(
      (sum, item) =>
        sum + Math.max(0, Math.round(-(item.remainingAmount ?? 0) * 100)),
      0,
    ) / 100;

  const remainingPercent =
    budget?.budgetAmount != null &&
    budget.budgetAmount > 0 &&
    budget.remaining != null
      ? (budget.remaining / budget.budgetAmount) * 100
      : null;

  const editorCategory = categories.find((item) => item.categoryId === target);
  const editorAppearance = categoryAppearance(editorCategory?.categoryName ?? "");
  const editorExisting = editorCategory ? editorCategory.budgetAmount : budget?.budgetAmount;
  const editorSpent = editorCategory ? editorCategory.expenseAmount : (budget?.totalExpense ?? 0);
  const editorAmount = Number(amount);
  const editorPercent =
    amount.trim() && Number.isFinite(editorAmount) && editorAmount > 0
      ? (editorSpent / editorAmount) * 100
      : null;
  const editorState =
    editorPercent === null ? "empty" : editorPercent > 100 ? "over" : editorPercent >= 80 ? "near" : "ok";
  const periodLabel = shownMonth
    ? new Intl.DateTimeFormat("th-TH", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${shownMonth}-01T00:00:00Z`))
    : "";

  return (
    <div className="budget-page">
      {notificationSettingsOpen && (
        <BudgetNotificationSettings
          onClose={() => setNotificationSettingsOpen(false)}
        />
      )}
      <header className="budget-header">
        <div>
          <h1>การจัดการงบประมาณ</h1>
          <p>จัดการและติดตามงบประมาณของคุณ</p>
        </div>
        <UserHeader />
      </header>

      <div className="budget-toolbar">
        <DatePicker
          ref={monthPickerRef}
          selected={
            shownMonth
              ? new Date(
                  Number(shownMonth.slice(0, 4)),
                  Number(shownMonth.slice(5, 7)) - 1,
                  1,
                )
              : null
          }
          onChange={(date: Date | null) => {
            if (!date) return;
            const value =
              String(date.getFullYear()).padStart(4, "0") +
              "-" +
              String(date.getMonth() + 1).padStart(2, "0");
            if (value < "1900-01" || value > "9999-12") return;
            setSelectedMonth(value);
            // The picker defers blur by one frame; restore after its close finishes.
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                if (mounted.current) monthPickerRef.current?.setFocus();
              }),
            );
            setNotice("");
            setMenuId(null);
          }}
          preventOpenOnFocus
          showMonthYearPicker
          dateFormat="MM/yyyy"
          minDate={new Date(1900, 0, 1)}
          maxDate={new Date(9999, 11, 31)}
          disabled={saving || modalOpen}
          popperPlacement="bottom-start"
          popperClassName="budget-datepicker-popper"
          customInput={
            <button
              type="button"
              className="budget-month-picker"
              aria-label="เลือกเดือนงบประมาณ"
            >
              <BudgetIcon name="calendar" />
              <span>{periodLabel || (loading ? "กำลังโหลด…" : "")}</span>
              <BudgetIcon name="chevron" />
            </button>
          }
        />

        <div className="budget-toolbar-actions">
          <button
            className="budget-btn"
            type="button"
            onClick={() => setNotificationSettingsOpen(true)}
          >
            <BudgetIcon name="bell" />
            ตั้งค่าการแจ้งเตือนงบ
          </button>
          <button
            className="budget-btn budget-btn-primary"
            type="button"
            disabled={loading || saving || !budget || !!loadError}
            onClick={() => openEditor("total")}
          >
            แก้ไขงบประมาณ
          </button>
        </div>
      </div>

      {notice && (
        <p className="budget-notice" role="status">
          {notice}
        </p>
      )}

      {loading ? (
        <div className="budget-state" role="status">
          กำลังโหลดงบประมาณ...
        </div>
      ) : loadError ? (
        <div className="budget-state" role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            className="budget-btn"
            onClick={() => {
              setLoading(true);
              setRevision((value) => value + 1);
            }}
          >
            ลองอีกครั้ง
          </button>
        </div>
      ) : budget ? (
        <>
          <section className="budget-kpis" aria-label="สรุปงบประมาณ">
            <article>
              <h2 className="budget-kpi-title">
                งบประมาณรวม
                <button
                  type="button"
                  className="budget-icon-btn"
                  aria-label="แก้งบประมาณรวม"
                  disabled={saving}
                  onClick={() => openEditor("total")}
                >
                  <BudgetIcon name="edit" />
                </button>
              </h2>
              <strong className="budget-purple">
                {budget.budgetAmount === null
                  ? "ยังไม่ได้ตั้งงบ"
                  : money(budget.budgetAmount)}
              </strong>
              {budget.budgetAmount !== null && <span> บาท</span>}
            </article>
            <article>
              <h2 className="budget-kpi-title">ใช้ไป</h2>
              <strong className="budget-red">{money(budget.totalExpense)}</strong>
              <span> บาท</span>
              <small>
                {budget.usedPercentage === null
                  ? "รายจ่ายจริงในเดือนที่เลือก"
                  : `${budget.usedPercentage.toFixed(0)}%`}
              </small>
            </article>
            <article>
              <h2 className="budget-kpi-title">
                {(budget.remaining ?? 0) < 0 ? "เกินงบรวม" : "คงเหลือ"}
              </h2>
              <strong
                className={
                  (budget.remaining ?? 0) < 0 ? "budget-red" : "budget-green"
                }
              >
                {budget.remaining === null
                  ? "—"
                  : money(Math.abs(budget.remaining))}
              </strong>
              {budget.remaining !== null && <span> บาท</span>}
              <small>
                {remainingPercent !== null && remainingPercent >= 0
                  ? `${remainingPercent.toFixed(0)}%`
                  : " "}
              </small>
            </article>
            <article>
              <h2 className="budget-kpi-title">เกินงบประมาณ</h2>
              <strong className="budget-red">{money(categoryOverrun)}</strong>
              <span> บาท</span>
              <small>รวมส่วนที่เกินงบของแต่ละหมวด</small>
            </article>
          </section>

          <section className="budget-table-card">
            <div className="budget-table-scroll">
              <table className="budget-table">
                <caption className="budget-sr-only">
                  งบรายหมวดประจำเดือน {periodLabel}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">หมวดหมู่</th>
                    <th scope="col">งบประมาณ</th>
                    <th scope="col">ใช้ไป</th>
                    <th scope="col">คงเหลือ</th>
                    <th scope="col">สถานะ</th>
                    <th scope="col">ดำเนินการ</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.length === 0 ? (
                    <tr>
                      <td colSpan={6}>ยังไม่มีหมวดหมู่รายจ่าย</td>
                    </tr>
                  ) : (
                    categories.map((item) => {
                      const appearance = categoryAppearance(item.categoryName);
                      const percent =
                        item.budgetAmount !== null && item.budgetAmount > 0
                          ? (item.expenseAmount / item.budgetAmount) * 100
                          : null;

                      const state =
                        percent === null
                          ? "unset"
                          : percent > 100
                            ? "over"
                            : percent === 100
                              ? "full"
                              : percent >= 80
                                ? "near"
                                : "normal";

                      const label = {
                        unset: "ยังไม่ได้ตั้งงบ",
                        over: "เกินงบ",
                        full: "ใช้ครบงบ",
                        near: "ใกล้เกินงบ",
                        normal: "ปกติ",
                      }[state];

                      return (
                        <tr key={item.categoryId}>
                          <td>
                            <div className="budget-category">
                              <span
                                className="budget-category-icon"
                                aria-hidden="true"
                                style={{
                                  color: appearance.color,
                                  background: appearance.background,
                                }}
                              >
                                <BudgetIcon name={appearance.icon} />
                              </span>
                              <div className="budget-category-content">
                                <span>{item.categoryName}</span>
                                <div className="budget-bar" aria-hidden="true">
                                  <div
                                    style={{
                                      width: `${Math.min(100, Math.max(0, percent ?? 0))}%`,
                                      background:
                                        state === "over"
                                          ? "#f54b62"
                                          : appearance.color,
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          </td>
                          <td data-label="งบประมาณ">
                            {item.budgetAmount === null
                              ? "—"
                              : `${money(item.budgetAmount)} บาท`}
                          </td>
                          <td data-label="ใช้ไป">
                            {money(item.expenseAmount)} บาท
                            {percent !== null && (
                              <small> ({percent.toFixed(0)}%)</small>
                            )}
                          </td>
                          <td data-label="คงเหลือ" className={state === "over" ? "budget-red" : ""}>
                            {item.remainingAmount === null
                              ? "—"
                              : `${money(item.remainingAmount)} บาท`}
                          </td>
                          <td className="budget-cell-status">
                            <span className={`budget-badge ${state}`}>
                              {label}
                            </span>
                          </td>
                          <td className="budget-cell-actions">
                            <div className="budget-row-actions">
                              <button
                                type="button"
                                className="budget-icon-btn"
                                aria-label={`ตั้งหรือแก้งบ ${item.categoryName}`}
                                disabled={saving}
                                onClick={() => openEditor(item.categoryId)}
                              >
                                <BudgetIcon name="edit" />
                              </button>
                              {item.budgetAmount !== null && (
                                <button
                                  type="button"
                                  className="budget-icon-btn"
                                  aria-label={`ตัวเลือกงบ ${item.categoryName}`}
                                  aria-expanded={menuId === item.categoryId}
                                  disabled={saving}
                                  onClick={() =>
                                    setMenuId(
                                      menuId === item.categoryId
                                        ? null
                                        : item.categoryId,
                                    )
                                  }
                                >
                                  ⋮
                                </button>
                              )}
                            </div>
                            {menuId === item.categoryId && (
                              <button
                                type="button"
                                className="budget-remove-btn"
                                disabled={saving}
                                onClick={() => void removeBudget(item)}
                              >
                                ยกเลิกงบหมวดนี้
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <p className="budget-table-note">
              ใกล้เกินงบเมื่อใช้ตั้งแต่ 80% • งบรายหมวดไม่บวกเพิ่มในงบรวม •
              หมวดที่ยังไม่ตั้งงบยังแสดงยอดใช้จริง
            </p>
          </section>
        </>
      ) : null}

      <dialog
        className="budget-dialog budget-editor-dialog"
        ref={dialogRef}
        aria-labelledby="budget-dialog-title"
        onCancel={(event) => {
          if (actionLock.current) event.preventDefault();
          else setModalOpen(false);
        }}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={saveBudget} className="budget-editor">
          <div className="budget-dialog-heading budget-editor-head">
            {/* Keyed by target so switching budgets replays the icon swap. */}
            <span
              key={target}
              className="budget-editor-icon"
              aria-hidden="true"
              style={
                editorCategory
                  ? { color: editorAppearance.color, background: editorAppearance.background }
                  : undefined
              }
            >
              {editorCategory ? <BudgetIcon name={editorAppearance.icon} /> : <Wallet size={24} />}
            </span>
            <div className="budget-editor-head-text">
              <small>{editorExisting == null ? "สร้างงบประมาณ" : "แก้ไขงบประมาณ"}</small>
              <h2 id="budget-dialog-title">
                {editorCategory ? editorCategory.categoryName : "งบรายจ่ายรวม"}
              </h2>
              <span className="budget-editor-period">{periodLabel}</span>
            </div>
            <button
              type="button"
              className="budget-icon-btn budget-editor-close"
              aria-label="ปิดหน้าต่าง"
              disabled={saving}
              onClick={() => setModalOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="budget-editor-field">
            <label htmlFor="budget-target">งบที่ต้องการตั้ง</label>
            <Dropdown
              id="budget-target"
              value={target}
              disabled={saving}
              onChange={changeTarget}
              options={[
                { value: "total", label: "งบรายจ่ายรวม" },
                ...categories.map((item) => ({
                  value: item.categoryId,
                  label: item.categoryName,
                })),
              ]}
            />
          </div>

          <div className="budget-editor-field">
            <label htmlFor="budget-editor-amount">จำนวนเงิน</label>
            <span className="budget-editor-money">
              <input
                id="budget-editor-amount"
                type="text"
                inputMode="decimal"
                maxLength={13}
                value={amount}
                required
                disabled={saving}
                placeholder="เช่น 3000"
                onChange={(event) => setAmount(event.target.value)}
              />
              <i>฿</i>
            </span>
            <small>ไม่ใส่ลูกน้ำ และมีทศนิยมได้ไม่เกิน 2 ตำแหน่ง</small>
            <div className="budget-editor-presets" role="group" aria-label="จำนวนเงินที่ใช้บ่อย">
              {[1000, 3000, 5000, 10000].map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={saving}
                  aria-pressed={Number(amount) === value}
                  onClick={() => setAmount(String(value))}
                >
                  {value.toLocaleString("th-TH")}
                </button>
              ))}
            </div>
          </div>

          {/* Live preview against what is already spent this month. */}
          <div className={"budget-editor-preview is-" + editorState}>
            <div className="budget-editor-preview-row">
              <span>ใช้ไปแล้วเดือนนี้</span>
              <strong>{money(editorSpent)} ฿</strong>
            </div>
            <div className="budget-editor-bar" aria-hidden="true">
              <span style={{ width: Math.min(100, editorPercent ?? 0) + "%" }} />
            </div>
            <p aria-live="polite">
              {editorPercent === null
                ? "กรอกจำนวนเงินเพื่อดูว่างบนี้พอหรือไม่"
                : editorState === "over"
                  ? "เกินงบนี้แล้ว " + money(editorSpent - editorAmount) + " ฿"
                  : "เหลือใช้ได้อีก " + money(editorAmount - editorSpent) + " ฿ · ใช้ไป " + Math.round(editorPercent) + "%"}
            </p>
          </div>

          {saveError && (
            <p role="alert" className="budget-red">
              {saveError}
            </p>
          )}

          <div className="budget-dialog-footer">
            <button
              type="button"
              className="budget-btn"
              disabled={saving}
              onClick={() => setModalOpen(false)}
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="budget-btn budget-btn-primary"
              disabled={saving || !amount.trim()}
              aria-busy={saving}
            >
              {saving ? "กำลังบันทึก..." : "บันทึกงบ"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
type BudgetNoticeSettings = {
  enabled: boolean;
  warningPercent: number;
  notifyExceeded: boolean;
  notifyNearLimit: boolean;
  totalBudget: boolean;
  categoryBudgets: boolean;
};

function BudgetNotificationSettings({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef(false);
  const lock = useRef(false);

  const [settings, setSettings] = useState<BudgetNoticeSettings | null>(null);
  const [percent, setPercent] = useState("80");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    active.current = true;

    if (dialog.current && !dialog.current.open) {
      dialog.current.showModal();
    }

    return () => {
      active.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");

      try {
        const response = await apiFetch("/notification-settings/budget", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw await responseError(response, "ไม่สามารถโหลดการตั้งค่าได้");
        }

        const data: BudgetNoticeSettings = await response.json();

        if (!controller.signal.aborted) {
          setSettings(data);
          setPercent(String(data.warningPercent));
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "เชื่อมต่อไม่สำเร็จ");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [revision]);

  function toggle(
    field:
      | "enabled"
      | "notifyNearLimit"
      | "notifyExceeded"
      | "totalBudget"
      | "categoryBudgets",
    checked: boolean,
  ) {
    setSettings((current) =>
      current
        ? (() => {
            const next = { ...current, [field]: checked };
            if (field === "enabled") {
              next.notifyNearLimit = checked;
              next.notifyExceeded = checked;
            }
            next.enabled = next.notifyNearLimit || next.notifyExceeded;
            return next;
          })()
        : current,
    );
    setSuccess("");
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!settings || loading || lock.current) return;

    const warningPercent = Number(percent);

    if (
      !/^\d{1,3}$/.test(percent) ||
      warningPercent < 1 ||
      warningPercent > 100
    ) {
      setError("กรอกเปอร์เซ็นต์เป็นจำนวนเต็มตั้งแต่ 1 ถึง 100");
      return;
    }

    // The total/category toggles are no longer shown; if both were saved off, alerts would never fire, so cover both.
    const scope =
      settings.totalBudget || settings.categoryBudgets
        ? {}
        : { totalBudget: true, categoryBudgets: true };

    lock.current = true;
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await apiFetch("/notification-settings/budget", {
        method: "PUT",
        body: JSON.stringify({
          ...settings,
          ...scope,
          warningPercent,
        }),
      });

      if (!response.ok) {
        throw await responseError(response, "บันทึกการตั้งค่าไม่สำเร็จ");
      }

      const saved: BudgetNoticeSettings = await response.json();

      if (active.current) {
        setSettings(saved);
        setPercent(String(saved.warningPercent));
        setSuccess("บันทึกการตั้งค่าแล้ว");
      }
    } catch (err) {
      if (active.current) {
        setError(err instanceof Error ? err.message : "เชื่อมต่อไม่สำเร็จ");
      }
    } finally {
      lock.current = false;
      if (active.current) setSaving(false);
    }
  }

  function close() {
    if (!lock.current) onClose();
  }

  function setPercentValue(value: number) {
    setPercent(String(Math.min(100, Math.max(1, Math.round(value)))));
    setError("");
    setSuccess("");
  }

  return (
    <dialog
      ref={dialog}
      className="budget-dialog budget-notice-dialog"
      aria-labelledby="budget-notice-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="budget-dialog-heading notice-head">
        {/* Thin sound-wave rings, not a glow; keyed so they replay when alerts switch on. */}
        <span
          key={"head-" + String(settings?.enabled)}
          className={"notice-head-icon" + (settings?.enabled === false ? " is-off" : "")}
          aria-hidden="true"
        >
          <i />
          <i />
          {settings?.enabled === false ? <BellOff size={24} /> : <Bell size={24} />}
        </span>
        <div className="notice-head-text">
          <h2 id="budget-notice-title">ตั้งค่าการแจ้งเตือนงบ</h2>
          <p>ตั้งค่าสำหรับงบทุกเดือนของบัญชีคุณ</p>
          {settings && (
            <span
              className={"notice-head-chip" + (settings.enabled ? "" : " is-off")}
              aria-live="polite"
            >
              {settings.enabled
                ? settings.notifyNearLimit
                  ? "เปิดอยู่ · เตือนที่ " + percent + "%"
                  : "เปิดอยู่ · เตือนเมื่อใช้เกินงบ"
                : "ปิดการแจ้งเตือน"}
            </span>
          )}
        </div>
        <button
          type="button"
          className="budget-icon-btn notice-head-close"
          aria-label="ปิดการตั้งค่า"
          disabled={saving}
          onClick={close}
        >
          ×
        </button>
      </div>

      {loading ? (
        <p role="status">กำลังโหลดการตั้งค่า...</p>
      ) : settings ? (
        <form onSubmit={save}>
          <fieldset disabled={saving} className="notice-fieldset">
            <label className={"notice-master" + (settings.enabled ? " is-on" : "")}>
              {/* Keyed by state so the bell rings again each time alerts turn on. */}
              <span key={String(settings.enabled)} className="notice-bell" aria-hidden="true">
                {settings.enabled ? <Bell size={22} /> : <BellOff size={22} />}
              </span>
              <span className="notice-text">
                <strong>เปิดการแจ้งเตือนงบประมาณ</strong>
                <small>{settings.enabled ? "เปิดอยู่" : "ปิดอยู่"}</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="notice-switch"
                checked={settings.enabled}
                onChange={(event) => toggle("enabled", event.target.checked)}
              />
            </label>

            <div className="notice-group">
              <label className="notice-row">
                <span className="notice-text">
                  <strong>แจ้งเตือนเมื่อถึงเกณฑ์งบประมาณ</strong>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="notice-switch"
                  checked={settings.notifyNearLimit}
                  onChange={(event) =>
                    toggle("notifyNearLimit", event.target.checked)
                  }
                />
              </label>
              <div className={"notice-threshold" + (settings.notifyNearLimit ? "" : " is-off")}>
                <div className="notice-threshold-head">
                  <label htmlFor="budget-warning-percent">เตือนเมื่อใช้ถึง</label>
                  <div className="notice-stepper">
                    <button
                      type="button"
                      aria-label="ลด 5%"
                      onClick={() => setPercentValue((Number(percent) || 0) - 5)}
                    >
                      <Minus size={18} aria-hidden="true" />
                    </button>
                    <span className="notice-percent">
                      <input
                        id="budget-warning-percent"
                        type="text"
                        inputMode="numeric"
                        maxLength={3}
                        value={percent}
                        onChange={(event) => {
                          setPercent(event.target.value);
                          setError("");
                          setSuccess("");
                        }}
                      />
                      %
                    </span>
                    <button
                      type="button"
                      aria-label="เพิ่ม 5%"
                      onClick={() => setPercentValue((Number(percent) || 0) + 5)}
                    >
                      <Plus size={18} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  className="notice-range"
                  min={1}
                  max={100}
                  value={Math.min(100, Math.max(1, Number(percent) || 1))}
                  aria-label="เลื่อนเพื่อตั้งเปอร์เซ็นต์ที่เตือน"
                  style={{ "--fill": (Math.min(100, Math.max(1, Number(percent) || 1))) + "%" } as CSSProperties}
                  onChange={(event) => setPercentValue(Number(event.target.value))}
                />
                <div className="notice-range-scale" aria-hidden="true">
                  <span>0%</span>
                  <span>งบทั้งหมด 100%</span>
                </div>
                <div className="notice-presets" role="group" aria-label="ค่าที่ใช้บ่อย">
                  {[70, 80, 90, 100].map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={percent === String(value)}
                      onClick={() => setPercentValue(value)}
                    >
                      {value}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

          </fieldset>

          {error && (
            <p role="alert" className="budget-red">
              {error}
            </p>
          )}
          {success && <p role="status">{success}</p>}

          <div className="budget-dialog-footer">
            <button
              type="button"
              className="budget-btn"
              disabled={saving}
              onClick={close}
            >
              ปิด
            </button>
            <button
              type="submit"
              className="budget-btn budget-btn-primary"
              disabled={saving}
            >
              {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
            </button>
          </div>
        </form>
      ) : (
        <>
          <p role="alert" className="budget-red">
            {error}
          </p>
          <button
            type="button"
            className="budget-btn"
            onClick={() => setRevision((value) => value + 1)}
          >
            ลองอีกครั้ง
          </button>
        </>
      )}
    </dialog>
  );
}
