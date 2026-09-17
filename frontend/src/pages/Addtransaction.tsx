import { useEffect, useState } from 'react';
import DatePicker from 'react-datepicker';
import UserHeader from '../components/UserHeader';
import 'react-datepicker/dist/react-datepicker.css';
import './Addtransaction.css';
import { apiFetch } from '../api';
import { getTransactionMaxDate, isFutureTransactionDate } from '../utils/transactionStatus';

type TransactionType = 'income' | 'expense';

type Category = {
  id: string;
  name: string;
  type: TransactionType;
};

export default function AddTransaction() {
  const [type, setType] = useState<TransactionType>('expense');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');

  const [amount, setAmount] = useState('');

  const [transactionDate, setTransactionDate] = useState<Date>(new Date());

  const getCurrentTime = () => {
    const now = new Date();

    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    return `${hours}:${minutes}`;
  };

  const [transactionTime, setTransactionTime] = useState(getCurrentTime());

  const [paymentMethod, setPaymentMethod] = useState('');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    apiFetch('/categories', { auth: false })
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to load categories');
        }

        return res.json();
      })
      .then((data) => {
        setCategories(data);
      })
      .catch((error) => {
        console.error(error);
      });
  }, []);

  useEffect(() => {
    if (!receiptFile) {
      setReceiptPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(receiptFile);

    setReceiptPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [receiptFile]);

  const filteredCategories = categories.filter(
    (category) => category.type === type
  );

  const handleChangeType = (newType: TransactionType) => {
    setType(newType);
    setCategoryId('');
  };

  const resetForm = () => {
    setType('expense');
    setCategoryId('');
    setAmount('');
    setTransactionDate(new Date());
    setTransactionTime(getCurrentTime());
    setPaymentMethod('');
    setDescription('');
    setNote('');
    setReceiptFile(null);
  };

  const formatDateForBackend = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  };

  const handleSubmit = async () => {
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

    const formattedDate = formatDateForBackend(transactionDate);

    try {
      setIsSaving(true);

      const response = await apiFetch(
  '/transactions',
  {
    method: 'POST',
    body: JSON.stringify({
      categoryId,
      type,
      amount: amountText,
      transactionDate: formattedDate,
      transactionTime: transactionTime || null,
      paymentMethod: paymentMethod || null,
      description: description || null,
      note: note || null,
    }),
  }
);

      const data = await response.json();

      if (!response.ok) {
        console.error(data);

        alert(
          data.error
            ? `บันทึกไม่สำเร็จ: ${data.error}`
            : 'บันทึกไม่สำเร็จ'
        );

        return;
      }

      alert('บันทึกธุรกรรมสำเร็จ');

      resetForm();
    } catch (error) {
      console.error(error);

      alert('ไม่สามารถเชื่อมต่อกับ Backend ได้');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="add-page">
      <header className="add-header">
        <button
          type="button"
          className="back-button"
          onClick={() => window.history.back()}
        >
          ← ย้อนกลับ
        </button>

      <UserHeader />
      </header>

      <main className="add-layout">
        <div className="left-column">
          {/* 1. Transaction Type */}
          <section className="card">
            <h2>1. ประเภทธุรกรรม</h2>

            <div className="type-grid">
              <button
                type="button"
                className={`type-button expense-button ${
                  type === 'expense' ? 'active' : ''
                }`}
                onClick={() => handleChangeType('expense')}
              >
                <div className="type-icon">↗</div>

                <div>
                  <strong>รายจ่าย</strong>
                  <span>เงินที่ออกจากบัญชี</span>
                </div>
              </button>

              <button
                type="button"
                className={`type-button income-button ${
                  type === 'income' ? 'active' : ''
                }`}
                onClick={() => handleChangeType('income')}
              >
                <div className="type-icon">↙</div>

                <div>
                  <strong>รายได้</strong>
                  <span>เงินที่เข้าบัญชี</span>
                </div>
              </button>
            </div>
          </section>

          {/* 2. Transaction Details */}
          <section className="card">
            <h2>2. รายละเอียดธุรกรรม</h2>

            <div className="form-grid">
              
              <div className="field">
                <label>
                  หมวดหมู่ <span className="required">*</span>
                </label>

                <select
                  className="input"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">เลือกหมวดหมู่</option>

                  {filteredCategories.map((category) => (
                    <option
                      key={category.id}
                      value={category.id}
                    >
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>
                  วันที่และเวลา <span className="required">*</span>
                </label>

                <div className="date-time-grid">
                  <DatePicker
  selected={transactionDate}
                maxDate={getTransactionMaxDate()}
  onChange={(date: Date | null) => {
  if (date) {
    setTransactionDate(date);
  }
}}
  dateFormat="dd/MM/yyyy"
  calendarStartDay={1}
  todayButton="วันนี้"
  className="input date-picker-input"
  wrapperClassName="date-picker-wrapper"
  popperClassName="transaction-date-popper"
  popperPlacement="bottom-start"
  portalId="root-portal"
/>

                  <input
                    className="input"
                    type="time"
                    value={transactionTime}
                    onChange={(e) =>
                      setTransactionTime(e.target.value)
                    }
                  />
                </div>
              </div>

              <div className="field">
                <label>
                  จำนวนเงิน <span className="required">*</span>
                </label>

                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div className="field">
                <label>วิธีการชำระเงิน</label>

                <select
                  className="input"
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value)
                  }
                >
                  <option value="">
                    เลือกวิธีการชำระเงิน
                  </option>

                  <option value="cash">เงินสด</option>
                  <option value="transfer">โอนเงิน</option>
                  <option value="card">บัตร</option>
                  <option value="ewallet">E-Wallet</option>
                </select>
              </div>

              <div className="field">
                <label>รายละเอียด</label>

                <input
                  className="input"
                  type="text"
                  placeholder="เช่น ค่าอาหารกลางวัน"
                  value={description}
                  onChange={(e) =>
                    setDescription(e.target.value)
                  }
                />
              </div>

              <div className="field">
                <label>หมายเหตุ</label>

                <input
                  className="input"
                  type="text"
                  placeholder="หมายเหตุเพิ่มเติม"
                  value={note}
                  onChange={(e) =>
                    setNote(e.target.value)
                  }
                />
              </div>
            </div>
          </section>

          {/* 3. Receipt */}
          <section className="card">
            <h2>3. ดูภาพสลิปประกอบการกรอก</h2>

<p className="small-text">
  เลือกภาพเพื่อดูประกอบการกรอกข้อมูล
  ขณะนี้ยังไม่อ่านข้อมูลอัตโนมัติและยังไม่บันทึกไฟล์สลิปกับธุรกรรม
</p>

            <div className="receipt-actions">
              <label className="upload-box">
                <div className="upload-icon">⇧</div>

                <strong>เลือกภาพสลิป</strong>

                <span className="small-text">
                  รองรับไฟล์ JPG, PNG
                </span>

                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  hidden
                  onChange={(e) => {
                    const file =
                      e.target.files?.[0] ?? null;

                    setReceiptFile(file);
                  }}
                />

                <span className="upload-button">
                  เลือกไฟล์
                </span>
              </label>

              <label className="upload-box">
                <div className="upload-icon">📷</div>

                <strong>ถ่ายรูปสลิป</strong>

                <span className="small-text">
                  ใช้กล้องเพื่อถ่ายรูป
                </span>

                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={(e) => {
                    const file =
                      e.target.files?.[0] ?? null;

                    setReceiptFile(file);
                  }}
                />

                <span className="upload-button">
                  ถ่ายรูป
                </span>
              </label>
            </div>

            {receiptFile && (
              <div className="file-name">
                ไฟล์ที่เลือก: {receiptFile.name}
              </div>
            )}

            <div className="footer-actions">
              <button
                type="button"
                className="cancel-button"
                onClick={resetForm}
              >
                ยกเลิก
              </button>

              <button
                type="button"
                className="save-button"
                onClick={handleSubmit}
                disabled={isSaving}
              >
                {isSaving
                  ? 'กำลังบันทึก...'
                  : 'บันทึกธุรกรรม'}
              </button>
            </div>
          </section>
        </div>

        {/* Right Preview */}
<aside className="preview-card">
  <div className="preview-header">
    <strong>ตัวอย่างสลิป</strong>

    <span className="small-text">
      {receiptFile ? 'เลือกไฟล์แล้ว' : 'ยังไม่ได้เลือกไฟล์'}
    </span>
  </div>

  <div className="receipt-preview">
    {receiptPreviewUrl ? (
      <img
        className="preview-image"
        src={receiptPreviewUrl}
        alt="ตัวอย่างสลิปที่เลือก"
      />
    ) : (
      <span>เลือกภาพสลิปเพื่อแสดงตัวอย่าง</span>
    )}
  </div>

  <p className="small-text">
    ภาพนี้ใช้ดูประกอบเท่านั้น
    กรุณากรอกข้อมูลธุรกรรมในแบบฟอร์มด้วยตนเอง
  </p>

  <div className="detected-header">
    <strong>ข้อมูลที่กรอกในแบบฟอร์ม</strong>
  </div>

  <div className="detected-list">
    <div className="detected-row">
      <span>วันที่</span>
      <span>
        {transactionDate.toLocaleDateString('th-TH')}
      </span>
    </div>

    <div className="detected-row">
      <span>เวลา</span>
      <span>{transactionTime || 'ไม่ได้ระบุ'}</span>
    </div>

    <div className="detected-row">
      <span>จำนวนเงิน</span>
      <span>
        {amount.trim() !== '' && Number.isFinite(Number(amount))
          ? `${Number(amount).toLocaleString('th-TH', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} บาท`
          : 'ยังไม่ได้ระบุ'}
      </span>
    </div>
  </div>
</aside>
      </main>
    </div>
  );
}