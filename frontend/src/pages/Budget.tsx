import { useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { apiFetch } from '../api';
import UserHeader from '../components/UserHeader';
import './Budget.css';

type BudgetData = {
  year: number;
  month: number;
  budgetAmount: number | null;
  totalExpense: number;
  remaining: number | null;
  usedPercentage: number | null;
  timeline: {
    monthState: 'past' | 'current' | 'future';
    daysInMonth: number;
    elapsedDays: number;
    plannedExpenseToDate: number | null;
    actualExpenseToDate: number;
    deviation: number | null;
    paceStatus:
      | 'not_set'
      | 'not_started'
      | 'above_plan'
      | 'below_plan'
      | 'on_plan';
  };
};

type CategoryItem = {
  categoryId: string;
  categoryName: string;
  budgetAmount: number | null;
  expenseAmount: number;
  remainingAmount: number | null;
  status: 'not_set' | 'within_budget' | 'at_budget' | 'over_budget';
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

function currentMonth() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;

  return `${year}-${month}`;
}

function money(value: number) {
  return value.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function categoryAppearance(name: string) {
  if (/อาหาร|เครื่องดื่ม/.test(name)) {
    return { icon: 'food', color: '#ffad08', background: '#fff6e2' };
  }
  if (/เดินทาง|รถ/.test(name)) {
    return { icon: 'car', color: '#2e7cf6', background: '#e7f0ff' };
  }
  if (/ช้อป|ช็อป/.test(name)) {
    return { icon: 'shopping', color: '#ff485b', background: '#ffe7eb' };
  }
  if (/บันเทิง/.test(name)) {
    return { icon: 'game', color: '#890bd0', background: '#f3e7ff' };
  }
  if (/สุขภาพ|รักษา/.test(name)) {
    return { icon: 'heart', color: '#20be83', background: '#ddf8ed' };
  }
  if (/ศึกษา|เรียน/.test(name)) {
    return { icon: 'study', color: '#7946ef', background: '#eee7ff' };
  }
  return { icon: 'more', color: '#979797', background: '#eeeeee' };
}

function BudgetIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    food: 'M4 3v6a2 2 0 0 0 4 0V3M6 3v18M14 3v9h5M19 3v18',
    car: 'M5 10l2-6h10l2 6M3 10h18v8H3zM6 18v3M18 18v3M6 14h2M16 14h2',
    shopping:
      'M5 7h14l1 14H4L5 7zM9 7V5a3 3 0 0 1 6 0v2M9 10h.01M15 10h.01',
    game:
      'M7 7h10c2 0 3 2 4 6l1 5c0 2-2 3-4 1l-3-3H9l-3 3c-2 2-4 1-4-1l1-5c1-4 2-6 4-6zM6 10v5M3.5 12.5h5M16 11h.01M19 14h.01',
    heart:
      'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8M3 12h4l2-4 4 8 2-4h6',
    study: 'M2 8l10-5 10 5-10 5L2 8zM6 10v7c4 3 8 3 12 0v-7M22 8v8',
    calendar:
      'M4 5h16v16H4zM8 2v6M16 2v6M4 10h16M8 14h1M12 14h1M16 14h1M8 18h1M12 18h1',
    bell:
      'M18 8a6 6 0 0 0-12 0c0 8-3 8-3 10h18c0-2-3-2-3-10M10 21h4',
    edit:
      'M14 5l5 5M4 16L16 4a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
    chevron: 'M8 10l4 4 4-4',
  };

  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'more' ? (
        <>
          <circle cx="5" cy="12" r="2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="2" fill="currentColor" stroke="none" />
        </>
      ) : (
        <path d={paths[name] ?? paths.edit} />
      )}
    </svg>
  );
}

async function responseError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  return new Error(data?.error || data?.message || fallback);
}

export default function Budget() {

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMonth = searchParams.get('month') ?? '';
  const selectedMonth = /^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(requestedMonth)
    ? requestedMonth : currentMonth();
  function setSelectedMonth(value: string) {
    setSearchParams(current => { current.set('month', value); return current; });
  }
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [target, setTarget] = useState('total');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const mounted = useRef(false);
  const actionLock = useRef(false);

  const visibleData = data?.period === selectedMonth ? data : null;
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
      setLoadError('');

      const [year = '', month = ''] = selectedMonth.split('-');
      const params = new URLSearchParams({ year, month });

      try {
        const [budgetResponse, categoryResponse] = await Promise.all([
          apiFetch(`/budget?${params}`, {
            signal: controller.signal,
          }),
          apiFetch(`/budget/categories?${params}`, {
            signal: controller.signal,
          }),
        ]);

        if (!budgetResponse.ok) {
          throw await responseError(
            budgetResponse,
            'ไม่สามารถโหลดงบรวมได้'
          );
        }
        if (!categoryResponse.ok) {
          throw await responseError(
            categoryResponse,
            'ไม่สามารถโหลดงบรายหมวดได้'
          );
        }

        const nextBudget: BudgetData = await budgetResponse.json();
        const nextCategories: CategoryResponse =
          await categoryResponse.json();

        if (!controller.signal.aborted) {
          setData({
            period: selectedMonth,
            budget: nextBudget,
            categories: nextCategories.items,
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error ? error.message : 'เชื่อมต่อไม่สำเร็จ'
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
      nextTarget === 'total'
        ? budget?.budgetAmount
        : categories.find((item) => item.categoryId === nextTarget)
            ?.budgetAmount;

    setTarget(nextTarget);
    setAmount(existing == null ? '' : String(existing));
    setSaveError('');
    setMenuId(null);
    setModalOpen(true);
  }

  function changeTarget(nextTarget: string) {
    const existing =
      nextTarget === 'total'
        ? budget?.budgetAmount
        : categories.find((item) => item.categoryId === nextTarget)
            ?.budgetAmount;

    setTarget(nextTarget);
    setAmount(existing == null ? '' : String(existing));
    setSaveError('');
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
        'กรอกงบมากกว่า 0 ไม่เกิน 9,999,999,999.99 บาท ทศนิยมไม่เกิน 2 ตำแหน่ง'
      );
      return;
    }

    actionLock.current = true;
    setSaving(true);
    setSaveError('');
    setNotice('');

    const [year, month] = selectedMonth.split('-').map(Number);
    const path =
      target === 'total'
        ? '/budget'
        : `/budget/categories/${encodeURIComponent(target)}`;

    try {
      const response = await apiFetch(path, {
        method: 'PUT',
        body: JSON.stringify({ year, month, amount: amountText }),
      });

      if (!response.ok) {
        throw await responseError(response, 'บันทึกงบไม่สำเร็จ');
      }

      if (mounted.current) {
        setModalOpen(false);
        setNotice('บันทึกงบประมาณเรียบร้อยแล้ว');
        setLoading(true);
        setRevision((value) => value + 1);
      }
    } catch (error) {
      if (mounted.current) {
        setSaveError(
          error instanceof Error ? error.message : 'เชื่อมต่อไม่สำเร็จ'
        );
      }
    } finally {
      actionLock.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  async function removeBudget(item: CategoryItem) {
    if (actionLock.current) return;

    actionLock.current = true;
    setSaving(true);
    setMenuId(null);
    setNotice('');

    const [year = '', month = ''] = selectedMonth.split('-');
    const params = new URLSearchParams({ year, month });

    try {
      const response = await apiFetch(
        `/budget/categories/${encodeURIComponent(item.categoryId)}?${params}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw await responseError(response, 'ยกเลิกงบไม่สำเร็จ');
      }

      if (mounted.current) {
        setNotice(`ยกเลิกงบ ${item.categoryName} แล้ว ธุรกรรมยังอยู่ครบ`);
        setLoading(true);
        setRevision((value) => value + 1);
      }
    } catch (error) {
      if (mounted.current) {
        setNotice(
          error instanceof Error ? error.message : 'เชื่อมต่อไม่สำเร็จ'
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
      0
    ) / 100;

  const remainingPercent =
    budget?.budgetAmount != null &&
    budget.budgetAmount > 0 &&
    budget.remaining != null
      ? (budget.remaining / budget.budgetAmount) * 100
      : null;

  const periodLabel = new Intl.DateTimeFormat('th-TH', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${selectedMonth}-01T00:00:00Z`));

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
        <label className="budget-month-picker">
  <BudgetIcon name="calendar" />
  <span>{periodLabel}</span>
  <BudgetIcon name="chevron" />

  <input
    type="month"
    aria-label="เลือกเดือนงบประมาณ"
    min="1900-01"
    max="9999-12"
    value={selectedMonth}
    disabled={saving || modalOpen}
    onClick={(event) => {
      try {
        event.currentTarget.showPicker();
      } catch {
        // เบราว์เซอร์ที่ไม่รองรับยังใช้ช่องเดือนตามปกติได้
      }
    }}
    onChange={(event) => {
      const value = event.target.value;

      if (
        /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
        value >= '1900-01' &&
        value <= '9999-12'
      ) {
        setSelectedMonth(value);
        setNotice('');
        setMenuId(null);
      }
    }}
  />
</label>

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
            onClick={() => openEditor('total')}
          >
            + สร้างงบประมาณ
          </button>
        </div>
      </div>

      {notice && (
        <p className="budget-notice" role="status">{notice}</p>
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
              <div className="budget-kpi-title">
                <span>งบประมาณรวม</span>
                <button
                  type="button"
                  className="budget-icon-btn"
                  aria-label="แก้งบประมาณรวม"
                  disabled={saving}
                  onClick={() => openEditor('total')}
                >
                  <BudgetIcon name="edit" />
                </button>
              </div>
              <strong className="budget-purple">
                {budget.budgetAmount === null
                  ? 'ยังไม่ได้ตั้งงบ'
                  : money(budget.budgetAmount)}
              </strong>
              {budget.budgetAmount !== null && <span> บาท</span>}
            </article>

            <article>
              <div className="budget-kpi-title">ใช้ไป</div>
              <strong className="budget-red">
                {money(budget.totalExpense)}
              </strong>
              <span> บาท</span>
              <small>
                {budget.usedPercentage === null
                  ? 'รายจ่ายจริงในเดือนที่เลือก'
                  : `${budget.usedPercentage.toFixed(2)}% ของงบรวม`}
              </small>
            </article>

            <article>
              <div className="budget-kpi-title">
                {(budget.remaining ?? 0) < 0 ? 'เกินงบรวม' : 'คงเหลือ'}
              </div>
              <strong
                className={
                  (budget.remaining ?? 0) < 0 ? 'budget-red' : 'budget-green'
                }
              >
                {budget.remaining === null
                  ? '—'
                  : money(Math.abs(budget.remaining))}
              </strong>
              {budget.remaining !== null && <span> บาท</span>}
              <small>
                {remainingPercent !== null && remainingPercent >= 0
                  ? `${remainingPercent.toFixed(2)}% ของงบรวม`
                  : '\u00a0'}
              </small>
            </article>

            <article>
              <div className="budget-kpi-title">เกินงบรายหมวด</div>
              <strong className="budget-red">{money(categoryOverrun)}</strong>
              <span> บาท</span>
              <small>รวมเฉพาะส่วนที่เกินงบของแต่ละหมวด</small>
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
                  ) : categories.map((item) => {
                    const appearance = categoryAppearance(item.categoryName);
                    const percent =
                      item.budgetAmount !== null && item.budgetAmount > 0
                        ? (item.expenseAmount / item.budgetAmount) * 100
                        : null;

                    const state =
                      percent === null
                        ? 'unset'
                        : percent > 100
                          ? 'over'
                          : percent === 100
                            ? 'full'
                            : percent >= 80
                              ? 'near'
                              : 'normal';

                    const label = {
                      unset: 'ยังไม่ได้ตั้งงบ',
                      over: 'เกินงบ',
                      full: 'ใช้ครบงบ',
                      near: 'ใกล้เกินงบ',
                      normal: 'ปกติ',
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
                                      state === 'over' ? '#f54b62' : appearance.color,
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          {item.budgetAmount === null
                            ? '—'
                            : `${money(item.budgetAmount)} บาท`}
                        </td>
                        <td>
                          {money(item.expenseAmount)} บาท
                          {percent !== null && (
                            <small> ({percent.toFixed(0)}%)</small>
                          )}
                        </td>
                        <td className={state === 'over' ? 'budget-red' : ''}>
                          {item.remainingAmount === null
                            ? '—'
                            : `${money(item.remainingAmount)} บาท`}
                        </td>
                        <td>
                          <span className={`budget-badge ${state}`}>{label}</span>
                        </td>
                        <td>
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
                                onClick={() => setMenuId(
                                  menuId === item.categoryId ? null : item.categoryId
                                )}
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
                  })}
                </tbody>
              </table>
            </div>
            <p className="budget-table-note">
              ใกล้เกินงบเมื่อใช้ตั้งแต่ 80% • งบรายหมวดไม่บวกเพิ่มในงบรวม
              • หมวดที่ยังไม่ตั้งงบยังแสดงยอดใช้จริง
            </p>
          </section>

          {budget.timeline && (
            <section className="budget-time-card">
              <h2>การใช้จ่ายเทียบแผนตามเวลา</h2>
              <p>แผนเฉลี่ยจากงบรวมประจำเดือน {periodLabel}</p>

              {budget.timeline.paceStatus === 'not_set' ? (
                <p>ตั้งงบรวมเพื่อดูการใช้จ่ายเทียบแผน</p>
              ) : budget.timeline.paceStatus === 'not_started' ? (
                <p>เดือนนี้ยังไม่เริ่ม จะแสดงผลเทียบแผนเมื่อถึงเดือนที่เลือก</p>
              ) : (
                <>
                  <div className="budget-time-grid">
                    <article>
                      <span>
                        {budget.timeline.monthState === 'past'
                          ? 'งบตามแผนทั้งเดือน'
                          : 'งบตามแผนถึงวันนี้'}
                      </span>
                      <strong>
                        {money(budget.timeline.plannedExpenseToDate ?? 0)} บาท
                      </strong>
                      <small>
                        งบรวม × {budget.timeline.elapsedDays} ÷{' '}
                        {budget.timeline.daysInMonth} วัน
                      </small>
                    </article>
                    <article>
                      <span>รายจ่ายจริงในช่วงเดียวกัน</span>
                      <strong>
                        {money(budget.timeline.actualExpenseToDate)} บาท
                      </strong>
                    </article>
                    <article>
                      <span>
                        {(budget.timeline.deviation ?? 0) > 0
                          ? 'ใช้เกินแผน'
                          : (budget.timeline.deviation ?? 0) < 0
                            ? 'ใช้ต่ำกว่าแผน'
                            : 'ใช้เท่ากับแผน'}
                      </span>
                      <strong>
                        {money(Math.abs(budget.timeline.deviation ?? 0))} บาท
                      </strong>
                    </article>
                  </div>
                  <p className="budget-table-note">
                    แผนเฉลี่ยงบเท่ากันทุกวัน รายจ่ายก้อนใหญ่ช่วงต้นเดือน
                    อาจสูงกว่าแผนได้ แม้ยังไม่เกินงบทั้งเดือน
                  </p>
                </>
              )}
            </section>
          )}
        </>
      ) : null}

      <dialog
        className="budget-dialog"
        ref={dialogRef}
        aria-labelledby="budget-dialog-title"
        onCancel={(event) => {
          if (actionLock.current) event.preventDefault();
          else setModalOpen(false);
        }}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={saveBudget}>
          <div className="budget-dialog-heading">
            <h2 id="budget-dialog-title">สร้าง / แก้ไขงบประมาณ</h2>
            <button
              type="button"
              className="budget-icon-btn"
              aria-label="ปิดหน้าต่าง"
              disabled={saving}
              onClick={() => setModalOpen(false)}
            >
              ×
            </button>
          </div>
          <p>{periodLabel}</p>

          <label htmlFor="budget-target">งบที่ต้องการตั้ง</label>
          <select
            id="budget-target"
            value={target}
            disabled={saving}
            onChange={(event) => changeTarget(event.target.value)}
          >
            <option value="total">งบรายจ่ายรวม</option>
            {categories.map((item) => (
              <option key={item.categoryId} value={item.categoryId}>
                {item.categoryName}
              </option>
            ))}
          </select>

          <label htmlFor="budget-editor-amount">จำนวนเงิน (บาท)</label>
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
          <small>ไม่ใส่ลูกน้ำ และมีทศนิยมได้ไม่เกิน 2 ตำแหน่ง</small>

          {saveError && <p role="alert" className="budget-red">{saveError}</p>}

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
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึกงบ'}
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
  totalBudget: boolean;
  categoryBudgets: boolean;
};

function BudgetNotificationSettings({
  onClose,
}: {
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef(false);
  const lock = useRef(false);

  const [settings, setSettings] =
    useState<BudgetNoticeSettings | null>(null);
  const [percent, setPercent] = useState('80');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
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
      setError('');

      try {
        const response = await apiFetch(
          '/notification-settings/budget',
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw await responseError(
            response,
            'ไม่สามารถโหลดการตั้งค่าได้'
          );
        }

        const data: BudgetNoticeSettings = await response.json();

        if (!controller.signal.aborted) {
          setSettings(data);
          setPercent(String(data.warningPercent));
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error ? err.message : 'เชื่อมต่อไม่สำเร็จ'
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [revision]);

  function toggle(
    field: 'enabled' | 'notifyExceeded' | 'totalBudget' | 'categoryBudgets',
    checked: boolean
  ) {
    setSettings((current) =>
      current ? { ...current, [field]: checked } : current
    );
    setSuccess('');
    setError('');
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
      setError('กรอกเปอร์เซ็นต์เป็นจำนวนเต็มตั้งแต่ 1 ถึง 100');
      return;
    }

    if (
      settings.enabled &&
      !settings.totalBudget &&
      !settings.categoryBudgets
    ) {
      setError('เลือกงบรวมหรืองบรายหมวดอย่างน้อยหนึ่งรายการ');
      return;
    }

    lock.current = true;
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await apiFetch(
        '/notification-settings/budget',
        {
          method: 'PUT',
          body: JSON.stringify({
            ...settings,
            warningPercent,
          }),
        }
      );

      if (!response.ok) {
        throw await responseError(response, 'บันทึกการตั้งค่าไม่สำเร็จ');
      }

      const saved: BudgetNoticeSettings = await response.json();

      if (active.current) {
        setSettings(saved);
        setPercent(String(saved.warningPercent));
        setSuccess('บันทึกการตั้งค่าแล้ว');
      }
    } catch (err) {
      if (active.current) {
        setError(
          err instanceof Error ? err.message : 'เชื่อมต่อไม่สำเร็จ'
        );
      }
    } finally {
      lock.current = false;
      if (active.current) setSaving(false);
    }
  }

  function close() {
    if (!lock.current) onClose();
  }

  const checkboxStyle = {
    width: 'auto',
    marginRight: 10,
    accentColor: '#326bec',
  };

  return (
    <dialog
      ref={dialog}
      className="budget-dialog"
      aria-labelledby="budget-notice-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="budget-dialog-heading">
        <h2 id="budget-notice-title">ตั้งค่าการแจ้งเตือนงบ</h2>
        <button
          type="button"
          className="budget-icon-btn"
          aria-label="ปิดการตั้งค่า"
          disabled={saving}
          onClick={close}
        >
          ×
        </button>
      </div>

      <p>ตั้งค่าสำหรับงบทุกเดือนของบัญชีคุณ</p>

      {loading ? (
        <p role="status">กำลังโหลดการตั้งค่า...</p>
      ) : settings ? (
        <form onSubmit={save}>
          <fieldset
            disabled={saving}
            style={{ border: 0, padding: 0, margin: 0 }}
          >
            <label>
              <input
                type="checkbox"
                style={checkboxStyle}
                checked={settings.enabled}
                onChange={(event) =>
                  toggle('enabled', event.target.checked)
                }
              />
              เปิดการแจ้งเตือนงบประมาณ
            </label>

            <label htmlFor="budget-warning-percent">
              เตือนเมื่อใช้ถึง (%) ของงบ
            </label>
            <input
              id="budget-warning-percent"
              type="text"
              inputMode="numeric"
              maxLength={3}
              value={percent}
              onChange={(event) => {
                setPercent(event.target.value);
                setError('');
                setSuccess('');
              }}
            />
            <small>เช่น 80 หมายถึงเตือนเมื่อใช้ถึง 80% ของงบ</small>

            <label>
              <input
                type="checkbox"
                style={checkboxStyle}
                checked={settings.notifyExceeded}
                onChange={(event) =>
                  toggle('notifyExceeded', event.target.checked)
                }
              />
              แจ้งเตือนเมื่อใช้เกินงบด้วย
            </label>

            <label>
              <input
                type="checkbox"
                style={checkboxStyle}
                checked={settings.totalBudget}
                onChange={(event) =>
                  toggle('totalBudget', event.target.checked)
                }
              />
              แจ้งเตือนงบรวม
            </label>

            <label>
              <input
                type="checkbox"
                style={checkboxStyle}
                checked={settings.categoryBudgets}
                onChange={(event) =>
                  toggle('categoryBudgets', event.target.checked)
                }
              />
              แจ้งเตือนงบรายหมวด
            </label>
          </fieldset>

          <small>
            การตั้งค่านี้ไม่กระทบแจ้งเตือนรายการผิดปกติ
          </small>

          {error && <p role="alert" className="budget-red">{error}</p>}
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
              {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
            </button>
          </div>
        </form>
      ) : (
        <>
          <p role="alert" className="budget-red">{error}</p>
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