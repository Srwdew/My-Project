import { useToast } from "../components/LocalToast";
import {
  loadPendingTransaction,
  storePendingTransaction,
  clearPendingTransaction,
  normalizedTransactionBody,
  definitiveTransactionRejection,
  type PendingTransaction,
  type TransactionDraft,
} from "../lib/pendingTransaction";
import { validateReceipt } from "../lib/receiptOcr";
import ReceiptOcr from "../components/ReceiptOcr";
import ReceiptBatch from "../components/ReceiptBatch";
import { MAX_BATCH_RECEIPTS } from "../lib/receiptBatch";
import { useSessionKey, getToken } from "../auth";
import type { ReceiptFields, ReceiptResult } from "../utils/receiptParser";
import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Camera,
  Clock,
  FileImage,
  ImageUp,
  ReceiptText,
  Wallet,
} from "lucide-react";
import DatePicker from "react-datepicker";
import { th } from "date-fns/locale";
import { thaiDayText, thaiMonthHeader } from "../components/DatePill";
import UserHeader from "../components/UserHeader";
import "react-datepicker/dist/react-datepicker.css";
import "./Addtransaction.css";
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

export default function AddTransaction() {
  const toast = useToast();
  const [type, setType] = useState<TransactionType>("expense");
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");

  const [amount, setAmount] = useState("");

  const [transactionDate, setTransactionDate] = useState<Date | null>(
    new Date(),
  );

  const [transactionTime, setTransactionTime] = useState("");
  // No explicit confirmation control: do not infer consent from a time value.
  const transactionTimeConfirmed = false;

  const [paymentMethod, setPaymentMethod] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptError, setReceiptError] = useState("");
  const receiptSelection = useRef(0);
  const editedReceiptFields = useRef(
    new Set<keyof ReceiptFields | "paymentMethod">(),
  );
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(
    null,
  );

  const [isSaving, setIsSaving] = useState(false);
  const [batch, setBatch] = useState<{ id: string; files: File[] } | null>(
    null,
  );
  const session = useSessionKey();
  const pendingRequest = useRef<PendingTransaction | null>(null);
  const savingRef = useRef(false);
  const saveController = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      saveController.current?.abort();
    };
  }, []);
  const [uncertain, setUncertain] = useState(false);
  const [pendingReady, setPendingReady] = useState(false);
  const [pendingError, setPendingError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<"category" | "date" | "amount", string>>
  >({});
  const [categoriesError, setCategoriesError] = useState(false),
    [categoriesRetry, setCategoriesRetry] = useState(0);
  useEffect(() => {
    let active = true;
    saveController.current?.abort();
    pendingRequest.current = null;
    savingRef.current = false;
    setIsSaving(false);
    setUncertain(false);
    setPendingReady(false);
    setPendingError("");
    resetForm();
    setBatch(null);
    if (session)
      void loadPendingTransaction(
        session,
        () => active && getToken() === session,
      )
        .then((request) => {
          if (!active || getToken() !== session) return;
          pendingRequest.current = request;
          if (request) {
            const saved = JSON.parse(request.body) as TransactionDraft;
            setType(saved.type);
            setCategoryId(saved.categoryId);
            setAmount(saved.amount);
            setTransactionDate(new Date(saved.transactionDate + "T00:00:00"));
            setTransactionTime(saved.transactionTime ?? "");
            setPaymentMethod(saved.paymentMethod ?? "");
            setDescription(saved.description ?? "");
            setNote(saved.note ?? "");
            setUncertain(true);
          }
          setPendingReady(true);
        })
        .catch(() => {
          if (active && getToken() === session)
            setPendingError(
              "อ่านคำขอค้างไม่ได้ กรุณาตรวจประวัติธุรกรรมก่อนล้างคำขอนี้",
            );
        });
    return () => {
      active = false;
      saveController.current?.abort();
    };
  }, [session]);
  const abandonPending = () => {
    if (savingRef.current) return;
    if (
      !window.confirm(
        "เลิกติดตามรายการนี้? ถ้ารายการบันทึกไปแล้วจะยังอยู่ในประวัติ ควรตรวจประวัติก่อนเพิ่มรายการใหม่",
      )
    )
      return;
    clearPendingTransaction();
    pendingRequest.current = null;
    setUncertain(false);
    setPendingError("");
    setPendingReady(true);
    resetForm();
  };
  const selectReceipt = async (file: File | null) => {
    if (savingRef.current || pendingRequest.current || !pendingReady) return;
    const selection = ++receiptSelection.current,
      owner = getToken();
    setReceiptFile(null);
    setReceiptError("");
    beginReceipt(selection, owner);
    if (!file) return;
    try {
      await validateReceipt(file);
      if (
        selection === receiptSelection.current &&
        owner === getToken() &&
        mounted.current
      )
        setReceiptFile(file);
    } catch (e) {
      if (
        selection === receiptSelection.current &&
        owner === getToken() &&
        mounted.current
      )
        setReceiptError(e instanceof Error ? e.message : "เปิดภาพไม่ได้");
    }
  };
  const selectReceipts = (files: File[]) => {
    if (savingRef.current || pendingRequest.current || !pendingReady || batch)
      return;
    if (files.length <= 1) return void selectReceipt(files[0] ?? null);
    if (type === "income")
      return toast(
        "อ่านสลิปหลายรูปได้เฉพาะรายจ่าย กรุณาเปลี่ยนเป็นรายจ่ายก่อน",
      );
    if (files.length > MAX_BATCH_RECEIPTS)
      toast(
        `เลือกได้ครั้งละ ${MAX_BATCH_RECEIPTS} สลิป ระบบใช้ ${MAX_BATCH_RECEIPTS} รูปแรก และข้ามอีก ${files.length - MAX_BATCH_RECEIPTS} รูป`,
      );
    setBatch({
      id: crypto.randomUUID(),
      files: files.slice(0, MAX_BATCH_RECEIPTS),
    });
  };
  // Pasting images anywhere on the page starts the same flow as picking files.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const images = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (!images.length) return;
      e.preventDefault();
      selectReceipts(images);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });
  const currentReceipt = (selection: number, owner: string | null) =>
    mounted.current &&
    selection === receiptSelection.current &&
    owner === getToken() &&
    !savingRef.current &&
    !pendingRequest.current;
  const beginReceipt = (selection: number, owner: string | null) => {
    if (!currentReceipt(selection, owner)) return;
    // Remove only previous OCR/default values; explicit user edits survive rereads.
    const dirty = editedReceiptFields.current;
    if (!dirty.has("transactionDate")) setTransactionDate(null);
    if (!dirty.has("transactionTime")) setTransactionTime("");
    if (!dirty.has("amount")) setAmount("");
    if (!dirty.has("description")) setDescription("");
    if (!dirty.has("paymentMethod")) setPaymentMethod("transfer");
  };
  const applyReceipt = (
    result: ReceiptResult,
    selection: number,
    owner: string | null,
  ) => {
    if (!currentReceipt(selection, owner)) return;
    const fields = result.fields,
      dirty = editedReceiptFields.current;
    if (fields.transactionDate && !dirty.has("transactionDate"))
      setTransactionDate(new Date(fields.transactionDate + "T00:00:00"));
    if (fields.transactionTime && !dirty.has("transactionTime"))
      setTransactionTime(fields.transactionTime);
    if (fields.amount && !dirty.has("amount")) setAmount(fields.amount);
    if (fields.description && !dirty.has("description"))
      setDescription(fields.description);
    // Scanning defaults to transfer; OCR must not change the user's payment selection.
  };

  useEffect(() => {
    apiFetch("/categories", { auth: false })
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to load categories");
        }

        return res.json();
      })
      .then((data) => {
        setCategories(data);
      })
      .catch((error) => {
        console.error(error);
        setCategoriesError(true);
      });
  }, [categoriesRetry]);

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

  // People type thousands separators ("1,250"); the API expects a plain decimal.
  const plainAmount = amount.replace(/,/g, "").trim();
  const filteredCategories = categories
    .filter((category) => category.type === type)
    .sort(
      (a, b) =>
        transactionCategoryOrder(a.name) - transactionCategoryOrder(b.name),
    );
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

  const handleChangeType = (newType: TransactionType) => {
    setType(newType);
    setCategoryId("");
  };

  // keepPreferences: after a save, keep type and payment method for the next entry.
  const resetForm = (keepPreferences = false) => {
    editedReceiptFields.current.clear();
    setFieldErrors({});
    if (!keepPreferences) {
      setType("expense");
      setPaymentMethod("");
    }
    setCategoryId("");
    setAmount("");
    setTransactionDate(new Date());
    setTransactionTime("");
    setDescription("");
    setNote("");
    receiptSelection.current++;
    setReceiptError("");
    setReceiptFile(null);
  };

  const formatDateForBackend = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const handleSubmit = async () => {
    if (
      savingRef.current ||
      !pendingReady ||
      !session ||
      getToken() !== session
    )
      return;
    toast("");
    const requestSession = session;
    let request = pendingRequest.current;
    if (!request) {
      const errors: typeof fieldErrors = {};
      if (!categoryId) errors.category = "เลือกหมวดหมู่ 1 หมวด";
      if (
        !transactionDate ||
        Number.isNaN(transactionDate.getTime()) ||
        isFutureTransactionDate(transactionDate)
      )
        errors.date = "เลือกวันที่ที่ไม่เกินวันนี้";
      if (!(Number(plainAmount) > 0))
        errors.amount = "กรอกจำนวนเงินมากกว่า 0 เช่น 120 หรือ 1,250.50";
      setFieldErrors(errors);
      const firstInvalid = (["category", "date", "amount"] as const).find(
        (k) => errors[k],
      );
      if (firstInvalid || !transactionDate) {
        document
          .querySelector<HTMLElement>(
            firstInvalid === "category"
              ? "[name='transaction-category']"
              : "#transaction-" + firstInvalid,
          )
          ?.focus();
        return;
      }
      try {
        request = {
          key: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          body: normalizedTransactionBody({
            categoryId,
            type,
            amount: plainAmount,
            transactionDate: formatDateForBackend(transactionDate),
            transactionTime: transactionTime || null,
            transactionTimeConfirmed,
            paymentMethod: paymentMethod || null,
            description: description || null,
            note: note || null,
          }),
        };
      } catch {
        toast("กรุณาตรวจจำนวนเงิน วันที่ และเวลาให้ถูกต้อง");
        return;
      }
    }
    savingRef.current = true;
    setIsSaving(true);
    setPendingError("");
    const controller = new AbortController();
    saveController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    const isCurrent = () =>
      mounted.current &&
      getToken() === requestSession &&
      saveController.current === controller;
    try {
      if (!pendingRequest.current) {
        await storePendingTransaction(requestSession, request, isCurrent);
        if (!isCurrent()) return;
        pendingRequest.current = request;
      }
      const response = await apiFetch("/transactions", {
        method: "POST",
        signal: controller.signal,
        headers: { "Idempotency-Key": request.key },
        body: request.body,
      });
      const data = await response.json();
      if (!isCurrent()) return;
      if (!response.ok) {
        if (definitiveTransactionRejection(response.status, data)) {
          clearPendingTransaction(request.key);
          pendingRequest.current = null;
          setUncertain(false);
        } else setUncertain(true);
        setPendingError(
          data.code === "IDEMPOTENCY_CONFLICT"
            ? "คำขอนี้ใช้กับข้อมูลอื่นแล้ว กรุณาตรวจประวัติก่อนสร้างรายการใหม่"
            : "บันทึกไม่สำเร็จ กรุณาตรวจข้อมูลหรือลองคำขอเดิมอีกครั้ง",
        );
        return;
      }
      if (response.status !== 201 || typeof data.id !== "string")
        throw Error("UNKNOWN_RESULT");
      clearPendingTransaction(request.key);
      pendingRequest.current = null;
      setUncertain(false);
      const savedCategory = categories.find((c) => c.id === categoryId);
      resetForm(true);
      toast(
        "บันทึก" +
          (type === "income" ? "รายได้ " : "รายจ่าย ") +
          Number(plainAmount).toLocaleString("th-TH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }) +
          " ฿" +
          (savedCategory
            ? " · " + transactionCategoryLabel(savedCategory.name)
            : "") +
          " แล้ว",
        "success",
      );
    } catch {
      if (!isCurrent()) return;
      setUncertain(Boolean(pendingRequest.current));
      setPendingError(
        pendingRequest.current
          ? "ยังไม่แน่ใจว่าบันทึกสำเร็จหรือไม่ ระบบเก็บรายการนี้ไว้ให้ กดส่งอีกครั้งได้โดยไม่บันทึกซ้ำ"
          : "เบราว์เซอร์ไม่อนุญาตให้เก็บข้อมูลชั่วคราว จึงยังไม่ได้ส่งรายการ ปิดโหมดส่วนตัวหรืออนุญาตการเก็บข้อมูลของเว็บนี้แล้วลองใหม่",
      );
    } finally {
      window.clearTimeout(timeout);
      if (isCurrent()) {
        savingRef.current = false;
        setIsSaving(false);
      }
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
        {!pendingReady && !pendingError && (
          <p role="status" className="add-status">
            กำลังตรวจรายการที่ส่งค้างไว้…
          </p>
        )}
        {(uncertain || pendingError) && (
          <section className="pending-transaction" aria-label="คำขอธุรกรรมค้าง">
            {uncertain && (
              <>
                <h2>รายการล่าสุดอาจบันทึกไปแล้ว</h2>
                <p>
                  ตรวจประวัติก่อนได้ หรือกด “ส่งรายการเดิมอีกครั้ง” ด้านล่าง
                  ระบบจะไม่บันทึกซ้ำ ระหว่างนี้แก้ข้อมูลในฟอร์มไม่ได้
                  เพื่อให้ส่งข้อมูลชุดเดิม
                </p>
              </>
            )}
            {pendingError && <p role="alert">{pendingError}</p>}
            <a href="/transactions">ตรวจประวัติธุรกรรม</a>
            {(uncertain || !pendingReady) && (
              <button
                type="button"
                disabled={isSaving}
                aria-busy={isSaving}
                onClick={abandonPending}
              >
                เลิกติดตามรายการนี้
              </button>
            )}
          </section>
        )}
        {batch && session ? (
          <ReceiptBatch
            key={batch.id + session}
            files={batch.files}
            session={session}
            categories={categories.filter((c) => c.type === "expense")}
            onClose={(saved) => {
              setBatch(null);
              if (saved)
                toast(`บันทึกรายจ่ายจากสลิป ${saved} รายการแล้ว`, "success");
            }}
          />
        ) : (
          <>
            <form
              className="left-column"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit();
              }}
            >
              <fieldset
                className="transaction-draft"
                disabled={isSaving || uncertain || !pendingReady}
              >
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
                      onClick={() => handleChangeType("expense")}
                    >
                      <ArrowUpRight size={18} aria-hidden="true" />
                      รายจ่าย
                    </button>
                    <button
                      type="button"
                      className={type === "income" ? "active" : ""}
                      aria-pressed={type === "income"}
                      onClick={() => handleChangeType("income")}
                    >
                      <ArrowDownLeft size={18} aria-hidden="true" />
                      รายได้
                    </button>
                  </div>

                  <div className="form-grid">
                    <fieldset
                      className="category-field"
                      data-type={type}
                      aria-invalid={Boolean(fieldErrors.category)}
                      aria-describedby={
                        fieldErrors.category
                          ? "transaction-category-error"
                          : undefined
                      }
                    >
                      <legend>
                        หมวดหมู่ <span className="required">*</span>
                      </legend>
                      {categoriesError && (
                        <p role="alert" className="field-error">
                          โหลดหมวดหมู่ไม่สำเร็จ จึงยังบันทึกไม่ได้{" "}
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => {
                              setCategoriesError(false);
                              setCategoriesRetry((n) => n + 1);
                            }}
                          >
                            ลองโหลดใหม่
                          </button>
                        </p>
                      )}
                      <div className="category-options">
                        {!categories.length &&
                          !categoriesError &&
                          [0, 1, 2, 3].map((i) => (
                            <span
                              key={i}
                              className="category-skeleton"
                              aria-hidden="true"
                            />
                          ))}
                        {filteredCategories.map((category) => {
                          const Icon =
                            type === "income"
                              ? (incomeCategoryIcons[category.name] ?? Ellipsis)
                              : (categoryIcons[
                                  transactionCategoryOrder(category.name)
                                ] ?? Ellipsis);
                          return (
                            <label
                              key={category.id}
                              className="category-option"
                            >
                              <input
                                type="radio"
                                name="transaction-category"
                                value={category.id}
                                checked={categoryId === category.id}
                                aria-describedby={
                                  fieldErrors.category
                                    ? "transaction-category-error"
                                    : undefined
                                }
                                onChange={() => {
                                  setCategoryId(category.id);
                                  setFieldErrors((f) => ({
                                    ...f,
                                    category: undefined,
                                  }));
                                }}
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
                      {!categories.length && !categoriesError && (
                        <p role="status" className="sr-only">
                          กำลังโหลดหมวดหมู่…
                        </p>
                      )}
                      {categories.length > 0 && !filteredCategories.length && (
                        <p className="field-hint">
                          ยังไม่มีหมวดสำหรับประเภทนี้
                        </p>
                      )}
                      {fieldErrors.category && (
                        <p
                          id="transaction-category-error"
                          className="field-error"
                          role="alert"
                        >
                          {fieldErrors.category}
                        </p>
                      )}
                    </fieldset>

                    <div className="field">
                      <label htmlFor="transaction-title">ชื่อรายการ</label>

                      <input
                        className="input"
                        id="transaction-title"
                        type="text"
                        placeholder="เช่น ค่าอาหารกลางวัน"
                        value={description}
                        onChange={(e) => {
                          editedReceiptFields.current.add("description");
                          setDescription(e.target.value);
                        }}
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="transaction-date">
                        วันที่ / เวลาไทย <span className="required">*</span>
                      </label>

                      <div className="date-time-grid">
                        <DatePicker
                          id="transaction-date"
                          ariaInvalid={fieldErrors.date ? "true" : undefined}
                          ariaDescribedBy={
                            fieldErrors.date
                              ? "transaction-date-error"
                              : undefined
                          }
                          selected={transactionDate}
                          maxDate={getTransactionMaxDate()}
                          onChangeRaw={() => {
                            editedReceiptFields.current.add("transactionDate");
                          }}
                          onChange={(date: Date | null) => {
                            editedReceiptFields.current.add("transactionDate");
                            setTransactionDate(date);
                            setFieldErrors((f) => ({ ...f, date: undefined }));
                          }}
                          dateFormat="dd/MM/yyyy"
                          locale={th}
                          value={transactionDate ? thaiDayText(transactionDate) : ""}
                          renderCustomHeader={thaiMonthHeader}
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
                          aria-label="เวลาไทย (ไม่บังคับ)"
                          type="time"
                          value={transactionTime}
                          onChange={(e) => {
                            editedReceiptFields.current.add("transactionTime");
                            setTransactionTime(e.target.value);
                          }}
                        />
                      </div>
                      {fieldErrors.date && (
                        <p id="transaction-date-error" className="field-error">
                          {fieldErrors.date}
                        </p>
                      )}
                    </div>

                    <div className="field amount-field">
                      <label htmlFor="transaction-amount">
                        จำนวนเงิน <span className="required">*</span>
                      </label>

                      <input
                        className="input"
                        id="transaction-amount"
                        aria-invalid={Boolean(fieldErrors.amount)}
                        aria-describedby={
                          fieldErrors.amount
                            ? "transaction-amount-error"
                            : undefined
                        }
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => {
                          editedReceiptFields.current.add("amount");
                          setAmount(e.target.value);
                          setFieldErrors((f) => ({ ...f, amount: undefined }));
                        }}
                      />
                      {fieldErrors.amount && (
                        <p
                          id="transaction-amount-error"
                          className="field-error"
                        >
                          {fieldErrors.amount}
                        </p>
                      )}
                    </div>

                    <div className="field">
                      <label htmlFor="transaction-payment">
                        วิธีการชำระเงิน
                      </label>

                      <Dropdown
                        id="transaction-payment"
                        value={paymentMethod}
                        onChange={(value) => {
                          editedReceiptFields.current.add("paymentMethod");
                          setPaymentMethod(value);
                        }}
                        options={[
                          { value: "", label: "เลือกวิธีการชำระเงิน" },
                          { value: "cash", label: "เงินสด" },
                          { value: "transfer", label: "โอนเงิน" },
                          { value: "card", label: "บัตร" },
                          {
                            value: "ewallet",
                            label: "กระเป๋าเงินอิเล็กทรอนิกส์",
                          },
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
                </section>
              </fieldset>
              <section className="card receipt-card">
                <h2 className="receipt-card-title">
                  แนบสลิปเพื่อกรอกอัตโนมัติ
                </h2>

                <p className="small-text">
                  ความครบถ้วนของข้อมูลที่อ่านได้ขึ้นอยู่กับความคมชัดของภาพ
                  กรุณาตรวจสอบข้อมูลก่อนบันทึก ระบบไม่จัดเก็บภาพสลิป
                </p>

                {receiptError && (
                  <p role="alert">{receiptError} — กรอกข้อมูลเองต่อได้</p>
                )}
                <div className="receipt-actions">
                  <label
                    className="upload-box"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!(isSaving || uncertain || !pendingReady))
                        selectReceipts(Array.from(e.dataTransfer.files));
                    }}
                  >
                    {/* Visually hidden, not `hidden`, so the picker stays keyboard-focusable. */}
                    <input
                      className="upload-input"
                      type="file"
                      disabled={isSaving || uncertain || !pendingReady}
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = "";
                        selectReceipts(files);
                      }}
                    />
                    <span className="upload-icon" aria-hidden="true">
                      <ImageUp size={22} />
                    </span>
                    <span className="upload-text">
                      <strong>เลือกภาพสลิป</strong>
                      <span className="small-text">
                        JPG, PNG หรือ WebP · สูงสุด {MAX_BATCH_RECEIPTS} รูป
                      </span>
                    </span>
                  </label>

                  <label className="upload-box camera-upload">
                    <input
                      className="upload-input"
                      type="file"
                      disabled={isSaving || uncertain || !pendingReady}
                      accept="image/png,image/jpeg"
                      capture="environment"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        e.target.value = "";
                        void selectReceipt(file);
                      }}
                    />
                    <span className="upload-icon" aria-hidden="true">
                      <Camera size={22} />
                    </span>
                    <span className="upload-text">
                      <strong>ถ่ายภาพใหม่</strong>
                      <span className="small-text">เปิดกล้องถ่ายสลิป</span>
                    </span>
                  </label>
                </div>
                {receiptFile && (
                  <div className="file-name">
                    <FileImage size={14} aria-hidden="true" />
                    <span>{receiptFile.name}</span>
                  </div>
                )}

                <div className="footer-actions">
                  <button
                    type="button"
                    className="cancel-button"
                    onClick={() => {
                      const dirty =
                        categoryId ||
                        amount ||
                        description ||
                        note ||
                        receiptFile;
                      if (
                        !dirty ||
                        window.confirm("ล้างข้อมูลที่กรอกไว้ทั้งหมด?")
                      )
                        resetForm();
                    }}
                    disabled={isSaving || uncertain || !pendingReady}
                  >
                    ล้างฟอร์ม
                  </button>

                  <button
                    type="submit"
                    className="save-button"
                    disabled={isSaving || !pendingReady}
                    aria-busy={isSaving}
                  >
                    {isSaving
                      ? "กำลังบันทึก..."
                      : uncertain
                        ? "ส่งรายการเดิมอีกครั้ง"
                        : "ยืนยันและบันทึกธุรกรรม"}
                  </button>
                </div>
              </section>
            </form>

            {/* Right Preview */}
            {/* On phones the empty preview is hidden until a slip is chosen (it holds the read-slip button then). */}
            <aside
              className={"preview-card" + (receiptFile ? "" : " is-empty")}
            >
              <div className="preview-header">
                <span className="preview-title">
                  <span className="preview-title-icon" aria-hidden="true">
                    <ReceiptText size={18} />
                  </span>
                  <strong>ตัวอย่างสลิป</strong>
                </span>

                {receiptFile &&
                type === "expense" &&
                !uncertain &&
                !isSaving ? (
                  <ReceiptOcr
                    key={receiptSelection.current + String(session)}
                    file={receiptFile}
                    session={session}
                    selection={receiptSelection.current}
                    onStart={beginReceipt}
                    onResult={applyReceipt}
                  />
                ) : (
                  <span
                    className={`preview-status${receiptFile ? " is-ready" : ""}`}
                  >
                    {receiptFile
                      ? type === "income"
                        ? "เลือกไฟล์แล้ว · อ่านอัตโนมัติเฉพาะรายจ่าย"
                        : "เลือกไฟล์แล้ว"
                      : "ยังไม่ได้เลือกไฟล์"}
                  </span>
                )}
              </div>

              <div className="receipt-preview">
                {receiptPreviewUrl ? (
                  <img
                    className="preview-image"
                    src={receiptPreviewUrl}
                    alt="ตัวอย่างสลิปที่เลือก"
                  />
                ) : (
                  <div className="preview-empty">
                    <span className="preview-empty-icon" aria-hidden="true">
                      <ImageUp size={28} />
                    </span>
                    <strong>ยังไม่มีภาพสลิป</strong>
                    <span>เลือกภาพหรือถ่ายภาพจากด้านซ้าย</span>
                    <ol className="preview-steps">
                      <li>เลือกภาพสลิป</li>
                      <li>ระบบอ่านข้อมูลให้อัตโนมัติ</li>
                      <li>ตรวจแล้วกดบันทึก</li>
                    </ol>
                  </div>
                )}
              </div>

              <div className="detected-header">
                <strong>ข้อมูลที่จะบันทึก</strong>
                <span className="small-text">ตรวจให้ตรงกับสลิป</span>
              </div>

              <div className="detected-list">
                <div className="detected-row">
                  <span className="detected-label">
                    <CalendarDays size={15} aria-hidden="true" />
                    วันที่
                  </span>
                  <span>
                    {transactionDate ? thaiDayText(transactionDate) : "ยังไม่ได้ระบุวันที่"}
                  </span>
                </div>

                <div className="detected-row">
                  <span className="detected-label">
                    <Clock size={15} aria-hidden="true" />
                    เวลา
                  </span>
                  <span>{transactionTime || "ไม่ได้ระบุ"}</span>
                </div>

                <div className="detected-row">
                  <span className="detected-label">
                    <Wallet size={15} aria-hidden="true" />
                    จำนวนเงิน
                  </span>
                  <span>
                    {plainAmount !== "" && Number.isFinite(Number(plainAmount))
                      ? `${Number(plainAmount).toLocaleString("th-TH", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })} บาท`
                      : "ยังไม่ได้ระบุ"}
                  </span>
                </div>
              </div>
            </aside>
          </>
        )}
      </main>
    </div>
  );
}
