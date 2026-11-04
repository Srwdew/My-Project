import { useToast } from "../components/LocalToast";
import { useSessionKey } from "../auth";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DatePicker from "react-datepicker";
import { th } from "date-fns/locale";
import { thaiDayText, thaiMonthHeader } from "../components/DatePill";
import UserHeader from "../components/UserHeader";
import "react-datepicker/dist/react-datepicker.css";
// Shares the add page's look; only the slip card and preview are absent.
import "./Addtransaction.css";
import "./EditTransaction.css";
import {
  Utensils,
  Bus,
  ShoppingBag,
  Clapperboard,
  HeartPulse,
  GraduationCap,
  Ellipsis,
  Banknote,
  BriefcaseBusiness,
  Star,
  Gift,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";
import {
  transactionCategoryLabel,
  transactionCategoryOrder,
} from "../utils/transactionCategoryLabel";
import { apiFetch } from "../api";
import Dropdown from "../components/Dropdown";
import {
  getTransactionMaxDate,
  isFutureTransactionDate,
} from "../utils/transactionStatus";

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
  transactionTimeConfirmed: boolean;
  paymentMethod?: string | null;
  description?: string | null;
  note?: string | null;
};

const categoryIcons = [
  Utensils,
  Bus,
  ShoppingBag,
  Clapperboard,
  HeartPulse,
  GraduationCap,
  Ellipsis,
];
const incomeCategoryIcons: Record<string, typeof Ellipsis> = {
  เงินเดือน: Banknote,
  "ธุรกิจ/ฟรีแลนซ์": BriefcaseBusiness,
  "โบนัส/ค่าคอมมิชชัน": Star,
  "ของขวัญ/เงินที่ได้รับ": Gift,
};

export default function EditTransaction() {
  const session = useSessionKey();
  const { id } = useParams();
  return <EditTransactionSession key={session + ":" + id} />;
}
function EditTransactionSession() {
  const toast = useToast();
  const navigate = useNavigate();
  const { id } = useParams();
  const [type, setType] = useState<TransactionType>("expense");
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState<Date>(new Date());
  const [transactionTime, setTransactionTime] = useState("");
  const [transactionTimeConfirmed, setTransactionTimeConfirmed] =
    useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!id) return;

    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);

      const [transactionResponse, categoriesResponse] = await Promise.all([
        apiFetch(`/transactions/${id}`),
        apiFetch("/categories"),
      ]);

      if (!transactionResponse.ok) {
        throw new Error("Failed to load transaction");
      }

      if (!categoriesResponse.ok) {
        throw new Error("Failed to load categories");
      }

      const transaction: Transaction = await transactionResponse.json();
      const categoryData: Category[] = await categoriesResponse.json();

      setCategories(categoryData);

      setTransactionTimeConfirmed(
        transaction.transactionTimeConfirmed ?? false,
      );
      setType(transaction.type);
      setCategoryId(transaction.categoryId);
      setAmount(String(transaction.amount));

      const dateOnly = transaction.transactionDate.slice(0, 10);
      setTransactionDate(new Date(`${dateOnly}T00:00:00`));

      if (transaction.transactionTime) {
        const time = new Date(transaction.transactionTime);

        if (Number.isNaN(time.getTime())) {
          throw new Error("รูปแบบเวลาของรายการไม่ถูกต้อง");
        }

        setTransactionTime(
          `${String(time.getUTCHours()).padStart(2, "0")}:${String(
            time.getUTCMinutes(),
          ).padStart(2, "0")}`,
        );
      } else {
        setTransactionTime("");
      }

      setPaymentMethod(transaction.paymentMethod ?? "");
      setDescription(transaction.description ?? "");
      setNote(transaction.note ?? "");
    } catch (error) {
      console.error(error);
      toast("ไม่สามารถโหลดข้อมูลรายการได้");
      navigate("/transactions");
    } finally {
      setLoading(false);
    }
  };

  const filteredCategories = categories
    .filter((category) => category.type === type)
    .sort(
      (a, b) =>
        transactionCategoryOrder(a.name) - transactionCategoryOrder(b.name),
    );

  const formatDateForBackend = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  // Remember each type's pick so switching away and back keeps the category until the user chooses another.
  const categoryByType = useRef<Partial<Record<TransactionType, string>>>({});
  const handleTypeChange = (newType: TransactionType) => {
    if (newType === type) return;
    categoryByType.current[type] = categoryId;
    setType(newType);
    setCategoryId(categoryByType.current[newType] ?? "");
  };

  const handleSubmit = async () => {
    toast("");
    if (!id) return;

    if (!categoryId) {
      toast("กรุณาเลือกหมวดหมู่");
      return;
    }

    // People type thousands separators ("1,250"); the API expects a plain decimal.
    const amountText = amount.replace(/,/g, "").trim();

    if (
      !/^\d{1,10}(?:\.\d{1,2})?$/.test(amountText) ||
      !Number.isFinite(Number(amountText)) ||
      Number(amountText) <= 0 ||
      Number(amountText) > 9999999999.99
    ) {
      toast(
        "กรุณากรอกจำนวนเงินมากกว่า 0 ไม่เกิน 9,999,999,999.99 บาท และทศนิยมไม่เกิน 2 ตำแหน่ง",
      );
      return;
    }

    if (!transactionDate || Number.isNaN(transactionDate.getTime())) {
      toast("กรุณาเลือกวันที่ให้ถูกต้อง");
      return;
    }

    if (
      transactionTime !== "" &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(transactionTime)
    ) {
      toast("กรุณากรอกเวลาให้ถูกต้อง");
      return;
    }

    if (isFutureTransactionDate(transactionDate)) {
      toast("ไม่สามารถบันทึกวันที่อนาคตได้");
      return;
    }

    try {
      setIsSaving(true);

      const response = await apiFetch(`/transactions/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          categoryId,
          type,
          amount: amountText,
          transactionDate: formatDateForBackend(transactionDate),
          transactionTime: transactionTime || null,
          transactionTimeConfirmed,
          paymentMethod: paymentMethod || null,
          description: description || null,
          note: note || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast(data.error || "แก้ไขรายการไม่สำเร็จ");
        return;
      }

      toast("แก้ไขรายการสำเร็จ", "success");
      navigate("/transactions");
    } catch (error) {
      console.error(error);
      toast("ไม่สามารถเชื่อมต่อกับ Backend ได้");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="add-page edit-mode">
        <p className="add-status" role="status">
          กำลังโหลดข้อมูล...
        </p>
      </div>
    );
  }

  return (
    <div className="add-page edit-mode">
      <header className="add-header">
        <button
          type="button"
          className="back-button"
          onClick={() => navigate("/transactions")}
        >
          ← ย้อนกลับ
        </button>
        <h1 className="page-heading-accessible">แก้ไขธุรกรรม</h1>
        <UserHeader />
      </header>

      <main className="add-layout">
        <form
          className="left-column"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <fieldset className="transaction-draft" disabled={isSaving}>
            <section className="card transaction-card">
              <div
                className="type-toggle"
                role="group"
                aria-label="ประเภทธุรกรรม"
                data-type={type}
              >
                <button
                  type="button"
                  className={type === "expense" ? "active" : ""}
                  aria-pressed={type === "expense"}
                  onClick={() => handleTypeChange("expense")}
                >
                  <ArrowUpRight size={18} aria-hidden="true" />
                  รายจ่าย
                </button>
                <button
                  type="button"
                  className={type === "income" ? "active" : ""}
                  aria-pressed={type === "income"}
                  onClick={() => handleTypeChange("income")}
                >
                  <ArrowDownLeft size={18} aria-hidden="true" />
                  รายได้
                </button>
              </div>

              <div className="form-grid">
                <fieldset className="category-field" data-type={type}>
                  <legend>
                    หมวดหมู่ <span className="required">*</span>
                  </legend>
                  {/* Hidden legacy categories are no longer listed; the saved one still submits. */}
                  {categoryId &&
                    !categories.some((c) => c.id === categoryId) && (
                      <p className="field-hint">
                        หมวดเดิมเลิกใช้แล้ว บันทึกด้วยหมวดเดิมได้ หรือเลือกหมวดใหม่
                      </p>
                    )}
                  <div className="category-options">
                    {filteredCategories.map((category) => {
                      const Icon =
                        type === "income"
                          ? (incomeCategoryIcons[category.name] ?? Ellipsis)
                          : (categoryIcons[
                              transactionCategoryOrder(category.name)
                            ] ?? Ellipsis);
                      return (
                        <label key={category.id} className="category-option">
                          <input
                            type="radio"
                            name="transaction-category"
                            value={category.id}
                            checked={categoryId === category.id}
                            onChange={() => setCategoryId(category.id)}
                          />
                          <span className="category-option-content">
                            <Icon size={21} aria-hidden="true" />
                            <span>
                              {transactionCategoryLabel(category.name)}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="field">
                  <label htmlFor="transaction-title">ชื่อรายการ</label>
                  <input
                    className="input"
                    id="transaction-title"
                    type="text"
                    placeholder="เช่น ค่าอาหารกลางวัน"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="transaction-date">
                    วันที่ / เวลาไทย <span className="required">*</span>
                  </label>
                  <div className="date-time-grid">
                    <DatePicker
                      id="transaction-date"
                      selected={transactionDate}
                      maxDate={getTransactionMaxDate()}
                      onChange={(date: Date | null) => {
                        if (date) {
                          setTransactionDate(date);
                          setTransactionTimeConfirmed(false);
                        }
                      }}
                      dateFormat="dd/MM/yyyy"
                      locale={th}
                      value={thaiDayText(transactionDate)}
                      renderCustomHeader={thaiMonthHeader}
                      calendarStartDay={1}
                      todayButton="วันนี้"
                      className="input date-picker-input"
                      wrapperClassName="date-picker-wrapper"
                      popperClassName="transaction-date-popper"
                      popperPlacement="bottom-start"
                    />
                    <input
                      className="input"
                      aria-label="เวลาไทย (ไม่บังคับ)"
                      type="time"
                      value={transactionTime}
                      onChange={(e) => {
                        setTransactionTime(e.target.value);
                        setTransactionTimeConfirmed(false);
                      }}
                    />
                  </div>
                </div>

                <div className="field amount-field">
                  <label htmlFor="transaction-amount">
                    จำนวนเงิน <span className="required">*</span>
                  </label>
                  <input
                    className="input"
                    id="transaction-amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="transaction-payment">วิธีการชำระเงิน</label>
                  <Dropdown
                    id="transaction-payment"
                    value={paymentMethod}
                    onChange={setPaymentMethod}
                    options={[
                      { value: "", label: "เลือกวิธีการชำระเงิน" },
                      { value: "cash", label: "เงินสด" },
                      { value: "transfer", label: "โอนเงิน" },
                      { value: "card", label: "บัตร" },
                      { value: "ewallet", label: "กระเป๋าเงินอิเล็กทรอนิกส์" },
                    ]}
                  />
                </div>

                <div className="field field-full">
                  <label htmlFor="transaction-note">หมายเหตุ</label>
                  <input
                    className="input"
                    id="transaction-note"
                    type="text"
                    placeholder="หมายเหตุเพิ่มเติม"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="footer-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() => navigate("/transactions")}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="save-button"
                  disabled={isSaving}
                  aria-busy={isSaving}
                >
                  {isSaving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
                </button>
              </div>
            </section>
          </fieldset>
        </form>
      </main>
    </div>
  );
}
