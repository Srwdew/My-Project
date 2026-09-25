import AnomalyDetails from '../components/AnomalyDetails';
import { useSessionKey } from '../auth';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import UserHeader from '../components/UserHeader';
import 'react-datepicker/dist/react-datepicker.css';
import './EditTransaction.css';
import { apiFetch } from '../api';
import { getTransactionMaxDate, isFutureTransactionDate } from '../utils/transactionStatus';

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
  transactionTimeConfirmed: boolean;
  paymentMethod?: string | null;
  description?: string | null;
  note?: string | null;
};

export default function EditTransaction() { const session=useSessionKey();const {id}=useParams();return <EditTransactionSession key={session + ':' + id} />; }
function EditTransactionSession() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [type, setType] = useState<TransactionType>('expense');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [transactionDate, setTransactionDate] = useState<Date>(new Date());
  const [transactionTime, setTransactionTime] = useState('');
  const [transactionTimeConfirmed,setTransactionTimeConfirmed] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!id) return;

    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);

      const [transactionResponse, categoriesResponse] =
  await Promise.all([
    apiFetch(`/transactions/${id}`),
    apiFetch('/categories'),
  ]);

      if (!transactionResponse.ok) {
        throw new Error('Failed to load transaction');
      }

      if (!categoriesResponse.ok) {
        throw new Error('Failed to load categories');
      }

      const transaction: Transaction = await transactionResponse.json();
      const categoryData: Category[] = await categoriesResponse.json();

      setCategories(categoryData);

      setTransactionTimeConfirmed(transaction.transactionTimeConfirmed ?? false);
      setType(transaction.type);
      setCategoryId(transaction.categoryId);
      setAmount(String(transaction.amount));

      const dateOnly = transaction.transactionDate.slice(0, 10);
      setTransactionDate(new Date(`${dateOnly}T00:00:00`));

      if (transaction.transactionTime) {
  const time = new Date(transaction.transactionTime);

  if (Number.isNaN(time.getTime())) {
    throw new Error('รูปแบบเวลาของรายการไม่ถูกต้อง');
  }

  setTransactionTime(
    `${String(time.getUTCHours()).padStart(2, '0')}:${String(
      time.getUTCMinutes()
    ).padStart(2, '0')}`
  );
} else {
  setTransactionTime('');
}

      setPaymentMethod(transaction.paymentMethod ?? '');
      setDescription(transaction.description ?? '');
      setNote(transaction.note ?? '');
    } catch (error) {
      console.error(error);
      alert('ไม่สามารถโหลดข้อมูลรายการได้');
      navigate('/transactions');
    } finally {
      setLoading(false);
    }
  };

  const filteredCategories = categories.filter(
    (category) => category.type === type
  );

  const formatDateForBackend = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  };

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    setCategoryId('');
  };

  const handleSubmit = async () => {
    if (!id) return;

    if (!categoryId) {
      alert('กรุณาเลือกหมวดหมู่');
      return;
    }

    const amountText = amount.trim();

if (
  !/^\d{1,10}(?:\.\d{1,2})?$/.test(amountText) ||
  !Number.isFinite(Number(amountText)) ||
  Number(amountText) <= 0 ||
  Number(amountText) > 9999999999.99
) {
  alert(
    'กรุณากรอกจำนวนเงินมากกว่า 0 ไม่เกิน 9,999,999,999.99 บาท และทศนิยมไม่เกิน 2 ตำแหน่ง'
  );
  return;
}

if (
  !transactionDate ||
  Number.isNaN(transactionDate.getTime())
) {
  alert('กรุณาเลือกวันที่ให้ถูกต้อง');
  return;
}

if (
  transactionTime !== '' &&
  !/^([01]\d|2[0-3]):[0-5]\d$/.test(transactionTime)
) {
  alert('กรุณากรอกเวลาให้ถูกต้อง');
  return;
}

if (isFutureTransactionDate(transactionDate)) {
  alert('ไม่สามารถบันทึกวันที่อนาคตได้');
  return;
}



    try {
      setIsSaving(true);

      const response = await apiFetch(
  `/transactions/${id}`,
  {
    method: 'PUT',
    body: JSON.stringify({
      categoryId,
      type,
      amount: amountText,
      transactionDate:
        formatDateForBackend(transactionDate),
      transactionTime: transactionTime || null, transactionTimeConfirmed,
      paymentMethod: paymentMethod || null,
      description: description || null,
      note: note || null,
    }),
  }
);

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'แก้ไขรายการไม่สำเร็จ');
        return;
      }

      alert('แก้ไขรายการสำเร็จ');
      navigate('/transactions');
    } catch (error) {
      console.error(error);
      alert('ไม่สามารถเชื่อมต่อกับ Backend ได้');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="edit-page">
        <div className="edit-loading">กำลังโหลดข้อมูล...</div>
      </div>
    );
  }

  return (
    <div className="edit-page">
      <header className="edit-header">
        <div>
          <button
            type="button"
            className="edit-back-button"
            onClick={() => navigate('/transactions')}
          >
            ← ย้อนกลับ
          </button>

          <h1>แก้ไขธุรกรรม</h1>
          <p>แก้ไขข้อมูลรายรับ-รายจ่ายของคุณ</p>
        </div>

        <UserHeader />
      </header>
      {id && <AnomalyDetails path={'/transactions/' + id + '/anomaly'} />}

      <section className="edit-card">
        <h2>1. ประเภทธุรกรรม</h2>

        <div className="edit-type-grid">
          <button
            type="button"
            className={`edit-type-button expense ${
              type === 'expense' ? 'active' : ''
            }`}
            onClick={() => handleTypeChange('expense')}
          >
            <span className="edit-type-icon">↗</span>

            <div>
              <strong>รายจ่าย</strong>
              <span>เงินที่ออกจากบัญชี</span>
            </div>
          </button>

          <button
            type="button"
            className={`edit-type-button income ${
              type === 'income' ? 'active' : ''
            }`}
            onClick={() => handleTypeChange('income')}
          >
            <span className="edit-type-icon">↙</span>

            <div>
              <strong>รายได้</strong>
              <span>เงินที่เข้าบัญชี</span>
            </div>
          </button>
        </div>
      </section>

      <section className="edit-card">
        <h2>2. รายละเอียดธุรกรรม</h2>

        <div className="edit-form-grid">
          
          <div className="edit-field">
            <label>
              หมวดหมู่ <span>*</span>
            </label>

            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">เลือกหมวดหมู่</option>

              {filteredCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="edit-field">
            <label>
              วันที่และเวลา <span>*</span>
            </label>

            <div className="edit-date-time">
              <DatePicker
                selected={transactionDate}
                maxDate={getTransactionMaxDate()}
                onChange={(date: Date | null) => {
  if (date) {
    setTransactionDate(date); setTransactionTimeConfirmed(false);
  }
}}
                dateFormat="dd/MM/yyyy"
                calendarStartDay={1}
                todayButton="วันนี้"
                className="edit-input"
                wrapperClassName="edit-datepicker-wrapper"
                popperClassName="edit-datepicker-popper"
                popperPlacement="bottom-start"
              />

              <input
                className="edit-input"
                type="time"
                value={transactionTime}
                onChange={(e) => (setTransactionTime(e.target.value), setTransactionTimeConfirmed(false))}
              /><label style={{display:'block',marginTop:8}}><input type="checkbox" checked={transactionTimeConfirmed} disabled={!transactionTime} onChange={e=>setTransactionTimeConfirmed(e.target.checked)} /> ยืนยันว่าเป็นเวลาที่เกิดรายการจริงตามเวลาไทย (Asia/Bangkok)</label><small>ไม่ทราบเวลาจริงให้เว้นว่างหรือไม่ยืนยัน ระบบจะไม่ประเมินด้านเวลา</small>
            </div>
          </div>

          <div className="edit-field">
            <label>
              จำนวนเงิน <span>*</span>
            </label>

            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="edit-field">
            <label>วิธีการชำระเงิน</label>

            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="">เลือกวิธีการชำระเงิน</option>
              <option value="cash">เงินสด</option>
              <option value="transfer">โอนเงิน</option>
              <option value="card">บัตร</option>
              <option value="ewallet">E-Wallet</option>
            </select>
          </div>

          <div className="edit-field">
            <label>รายละเอียด</label>

            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="edit-field">
            <label>หมายเหตุ</label>

            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="edit-actions">
          <button
            type="button"
            className="edit-cancel-button"
            onClick={() => navigate('/transactions')}
          >
            ยกเลิก
          </button>

          <button
            type="button"
            className="edit-save-button"
            onClick={handleSubmit}
            disabled={isSaving}
          >
            {isSaving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
          </button>
        </div>
      </section>
    </div>
  );
}