import {
  useEffect,
  useMemo,
  useState,
} from 'react';import { useNavigate } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { CalendarDays } from 'lucide-react';
import './TransactionHistory.css';
import { apiFetch } from '../api';
import UserHeader from '../components/UserHeader';

type TransactionType = 'income' | 'expense';

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
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFilter, setDateFilter] = useState<Date | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);


useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    const target = event.target as HTMLElement;

    if (!target.closest('.history-row-menu')) {
      setOpenMenuId(null);
    }
  };

  document.addEventListener('mousedown', handleClickOutside);

  return () => {
    document.removeEventListener(
      'mousedown',
      handleClickOutside
    );
  };
}, []);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      const [transactionsRes, categoriesRes] = await Promise.all([
        apiFetch('/transactions'),
        apiFetch('/categories'),
      ]);

      if (!transactionsRes.ok) {
        throw new Error('Failed to load transactions');
      }

      if (!categoriesRes.ok) {
        throw new Error('Failed to load categories');
      }

      const transactionsData = await transactionsRes.json();
      const categoriesData = await categoriesRes.json();

      setTransactions(transactionsData);
      setCategories(categoriesData);
    } catch (error) {
      console.error(error);
      alert('ไม่สามารถโหลดข้อมูลธุรกรรมได้');
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return transactions.filter((transaction) => {
      const description = transaction.description?.toLowerCase() ?? '';
      const note = transaction.note?.toLowerCase() ?? '';
      const categoryName = transaction.category?.name?.toLowerCase() ?? '';

      const matchesSearch =
        !keyword ||
        description.includes(keyword) ||
        note.includes(keyword) ||
        categoryName.includes(keyword);

      const matchesCategory =
        !categoryFilter || transaction.categoryId === categoryFilter;

      const matchesType = !typeFilter || transaction.type === typeFilter;

      const transactionDate = transaction.transactionDate.slice(0, 10);
      const selectedDate = dateFilter? getLocalDateKey(dateFilter): null;
      const matchesDate = !selectedDate || transactionDate === selectedDate;
  
      return matchesSearch && matchesCategory && matchesType && matchesDate;
    });
  }, [transactions, search, categoryFilter, typeFilter, dateFilter]);

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
  search.trim() !== '' ||
  categoryFilter !== '' ||
  typeFilter !== '' ||
  dateFilter !== null;

const visibleGroups =
  showAllHistory || hasActiveFilters
    ? groupedTransactions
    : groupedTransactions.slice(0, 3);

const historyViewLabel = hasActiveFilters
  ? 'ผลการค้นหาและกรองจากประวัติทั้งหมด'
  : showAllHistory
    ? 'ประวัติทั้งหมด'
    : 'รายการล่าสุด สูงสุด 3 วันที่มีรายการ';

  const expenseCategorySummary = useMemo(() => {
    const expenseTransactions = transactions.filter(
  (transaction) =>
    transaction.type === 'expense'
);

    const totalExpense = expenseTransactions.reduce(
      (sum, transaction) => sum + Number(transaction.amount),
      0
    );

    const categoryTotals: Record<string, number> = {};

    for (const transaction of expenseTransactions) {
      const name = transaction.category?.name || 'อื่น ๆ';

      categoryTotals[name] = (categoryTotals[name] || 0) + Number(transaction.amount);
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

  const handleDelete = async (transactionId: string) => {
    const confirmed = window.confirm('ต้องการลบรายการนี้ใช่หรือไม่?');

    if (!confirmed) {
      return;
    }

    try {
      const response = await apiFetch(
        `/transactions/${transactionId}`,
        {
          method: 'DELETE',
        }
      );

      const data = await response.json();

      if (!response.ok) {
        alert(data.error ? `ลบไม่สำเร็จ: ${data.error}` : 'ลบไม่สำเร็จ');
        return;
      }

      setTransactions((current) =>
        current.filter((transaction) => transaction.id !== transactionId)
      );

      setOpenMenuId(null);
    } catch (error) {
      console.error(error);
      alert('ไม่สามารถเชื่อมต่อกับ Backend ได้');
    }
  };

  const formatAmount = (amount: string | number, type: TransactionType) => {
    const value = Number(amount).toLocaleString('th-TH', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

    return type === 'income' ? `+${value} ฿` : `-${value} ฿`;
  };

  const formatTime = (value: string | null) => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');

  return `${hours}:${minutes}`;
};

  const getCategoryIcon = (categoryName: string) => {
    const name = categoryName.toLowerCase();

    if (name.includes('food') || name.includes('อาหาร')) return '🍴';
    if (name.includes('transport') || name.includes('เดินทาง')) return '🚘';
    if (name.includes('shopping') || name.includes('ซื้อ')) return '🛍️';
    if (name.includes('education') || name.includes('ศึกษา')) return '🎓';
    if (name.includes('health') || name.includes('สุขภาพ')) return '💚';
    if (name.includes('salary') || name.includes('เงินเดือน')) return '💵';

    return '💳';
  };

  const getSummaryColorClass = (index: number) => {
    const classes = [
      'orange',
      'blue',
      'red',
      'purple',
      'green',
    ];

    return classes[index] || 'blue';
  };

  return (
    <div className="history-page">
      <header className="history-header">
        <div className="history-header-left">
          <h1>การจัดการธุรกรรม</h1>
          <p>ค้นหาและจัดการข้อมูลรายรับ-รายจ่าย</p>
        </div>

        <UserHeader />
      </header>

      <div className="history-layout">
        <section className="history-main-card">
          <div className="history-top-bar">
            <div className="history-tabs">
              <span className="history-tab active">
  {historyViewLabel}
</span>
            </div>
            <button
  type="button"
  className="history-add-button"
  onClick={() => navigate('/transactions/add')}
>
  + เพิ่มรายการ
</button>
          </div>

          <div className="history-filter-box">
  <div className="history-search-box">
    <span className="history-search-icon">🔍</span>

    <input
      type="text"
      placeholder="ค้นหารายการ..."
      value={search}
      onChange={(e) => setSearch(e.target.value)}
    />
  </div>

  <select
    value={categoryFilter}
    onChange={(e) => setCategoryFilter(e.target.value)}
  >
    <option value="">หมวดหมู่: ทั้งหมด</option>

    {categories.map((category) => (
      <option key={category.id} value={category.id}>
        {category.name}
      </option>
    ))}
  </select>

  <select
    value={typeFilter}
    onChange={(e) => setTypeFilter(e.target.value)}
  >
    <option value="">ประเภท: ทั้งหมด</option>
    <option value="expense">รายจ่าย</option>
    <option value="income">รายรับ</option>
  </select>

  <div className="history-date-picker-wrap">
    <DatePicker
      selected={dateFilter}
      onChange={(date: Date | null) => setDateFilter(date)}
      dateFormat="dd/MM/yyyy"
      calendarStartDay={1}
      todayButton="วันนี้"
      popperClassName="history-datepicker-popper"
      popperPlacement="bottom-end"
      isClearable
    customInput={
      <button
        type="button"
        className={`history-calendar-button ${
          dateFilter ? 'active' : ''
        }`}
        title={dateFilter ? 'กรองตามวันที่' : 'เลือกวันที่'}
      >
        <CalendarDays size={19} strokeWidth={1.8} />
      </button>
    }
  />
  </div>
</div>

<div className="history-groups">
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
                            {transaction.description || transaction.category.name}
                          </strong>
                          <span>Note: {transaction.note || ''}</span>
                          
                        </div>

                        <div className="history-row-badge-wrap">
                          <span className={`history-type-badge ${transaction.type}`}>
                            {transaction.type === 'income' ? 'รายรับ' : 'รายจ่าย'}
                          </span>
                        </div>

                        <div className="history-row-category">
                          {transaction.category.name}
                        </div>

                        <div className={`history-row-amount ${transaction.type}`}>
                          {formatAmount(transaction.amount, transaction.type)}
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
                                openMenuId === transaction.id ? null : transaction.id
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
    navigate(`/transactions/${transaction.id}/edit`);
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
        setSearch('');
        setCategoryFilter('');
        setTypeFilter('');
        setDateFilter(null);
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
          ? 'แสดงเฉพาะ 3 วันที่มีรายการล่าสุด'
          : 'ดูประวัติทั้งหมด'}
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
                        index
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

function getDateLabel(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);
  const today = new Date();

  const todayKey = getLocalDateKey(today);

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const yesterdayKey = getLocalDateKey(yesterday);

  const formatted = date.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (dateString === todayKey) {
    return `วันนี้ - ${formatted}`;
  }

  if (dateString === yesterdayKey) {
    return `เมื่อวาน - ${formatted}`;
  }

  return formatted;
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}