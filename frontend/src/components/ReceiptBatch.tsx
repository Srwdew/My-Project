import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Trash2, X } from "lucide-react";
import { apiFetch } from "../api";
import DatePill from "./DatePill";
import { getToken } from "../auth";
import Dropdown from "./Dropdown";
import { readReceipt } from "../lib/receiptOcr";
import {
  definitiveTransactionRejection,
  normalizedTransactionBody,
} from "../lib/pendingTransaction";
import {
  batchRowProblems,
  duplicateCheckDates,
  duplicateCheckPath,
  findDuplicates,
  ocrDoubts,
  type BatchFields,
  type ExistingTransaction,
} from "../lib/receiptBatch";
import { getBangkokTodayKey } from "../utils/transactionStatus";
import { transactionCategoryLabel } from "../utils/transactionCategoryLabel";

type Category = { id: string; name: string };
type Row = {
  id: string;
  file: File;
  stage: "queued" | "reading" | "read" | "saving" | "saved";
  fields: BatchFields;
  paymentMethod: string;
  doubts: string[];
  readError: string;
  saveError: string;
  // Set from the first send until a definitive answer, so retries reuse it.
  key: string | null;
  allowDuplicate: boolean;
};
type Props = {
  files: File[];
  session: string;
  categories: Category[];
  onClose: (saved: number) => void;
};

const emptyFields: BatchFields = {
  amount: "",
  transactionDate: "",
  transactionTime: "",
  description: "",
  categoryId: "",
};

export default function ReceiptBatch({ files, session, categories, onClose }: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      stage: "queued",
      fields: emptyFields,
      paymentMethod: "transfer",
      doubts: [],
      readError: "",
      saveError: "",
      key: null,
      allowDuplicate: false,
    })),
  );
  // A slip date stays "loading" or "failed" until its saved expenses are known; those rows are held back.
  const [existing, setExisting] = useState<
    Record<string, ExistingTransaction[] | "loading" | "failed">
  >({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<number | null>(null);
  const viewer = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (viewing === null) viewer.current?.close();
    else if (!viewer.current?.open) viewer.current?.showModal();
  }, [viewing]);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);
  const patch = (id: string, change: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...change } : r)));

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const initialRows = useRef(rows);
  useEffect(() => {
    const created = Object.fromEntries(
      initialRows.current.map((r) => [r.id, URL.createObjectURL(r.file)]),
    );
    setUrls(created);
    return () => Object.values(created).forEach((u) => URL.revokeObjectURL(u));
  }, []);

  // One OCR worker at a time: each read is memory-heavy and the batch can hold 10 slips.
  useEffect(() => {
    let cancelled = false;
    let job: ReturnType<typeof readReceipt> | null = null;
    void (async () => {
      for (const { id, file } of initialRows.current) {
        if (cancelled) return;
        patch(id, { stage: "reading" });
        job = readReceipt(file, () => {});
        try {
          const result = await job.promise;
          if (cancelled) return;
          const f = result.fields;
          setRows((rs) =>
            rs.map((r) =>
              r.id === id
                ? {
                    ...r,
                    stage: "read",
                    // Edits made while queued win over OCR values.
                    fields: {
                      ...r.fields,
                      amount: r.fields.amount || (f.amount ?? ""),
                      transactionDate: r.fields.transactionDate || (f.transactionDate ?? ""),
                      transactionTime: r.fields.transactionTime || (f.transactionTime ?? ""),
                      description: r.fields.description || (f.description ?? ""),
                    },
                    paymentMethod: result.suggestedPaymentMethod ?? "transfer",
                    doubts: ocrDoubts(result),
                  }
                : r,
            ),
          );
        } catch (e) {
          if (cancelled) return;
          patch(id, {
            stage: "read",
            readError: e instanceof Error ? e.message : "อ่านภาพไม่สำเร็จ",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      job?.cancel();
    };
  }, []);

  const today = getBangkokTodayKey();
  const missingDates = duplicateCheckDates(rows, today)
    .filter((d) => !(d in existing))
    .join(",");
  useEffect(() => {
    if (!missingDates) return;
    const dates = missingDates.split(",");
    const mark = (
      value: (d: string) => ExistingTransaction[] | "loading" | "failed",
    ) =>
      setExisting((e) => ({
        ...e,
        ...Object.fromEntries(dates.map((d) => [d, value(d)])),
      }));
    mark(() => "loading");
    apiFetch(duplicateCheckPath(dates))
      .then((res) => {
        if (!res.ok) throw Error("LOAD_FAILED");
        return res.json();
      })
      .then((data: ExistingTransaction[]) => {
        if (mounted.current)
          mark((d) => data.filter((t) => t.transactionDate.slice(0, 10) === d));
      })
      .catch(() => {
        if (mounted.current) mark(() => "failed");
      });
  }, [missingDates]);

  const duplicates = useMemo(
    () =>
      findDuplicates(
        rows.map((r) => ({ id: r.id, fields: r.fields })),
        Object.values(existing).flatMap((v) => (Array.isArray(v) ? v : [])),
      ),
    [rows, existing],
  );
  const view = rows.map((r) => {
    const problems =
      r.stage === "read" ? batchRowProblems(r.fields, today) : [];
    const red =
      r.stage === "read" &&
      (problems.length > 0 || r.doubts.length > 0 || (!!r.saveError && !r.key));
    const day = existing[r.fields.transactionDate];
    const duplicate =
      r.stage !== "read"
        ? undefined
        : day === "failed"
          ? "ตรวจรายการซ้ำกับที่บันทึกไว้ไม่ได้"
          : duplicates.get(r.id);
    const ready =
      r.stage === "read" &&
      !red &&
      day !== "loading" &&
      !!r.fields.categoryId &&
      (!duplicate || r.allowDuplicate);
    return { row: r, problems, red, duplicate, ready };
  });
  const readyCount = view.filter((v) => v.ready).length;
  const savedCount = rows.filter((r) => r.stage === "saved").length;
  const busy = rows.some((r) => r.stage === "queued" || r.stage === "reading");
  const needsCategory = rows.some(
    (r) => r.stage === "read" && !r.fields.categoryId,
  );

  const edit = (r: Row, change: Partial<BatchFields>) =>
    patch(r.id, {
      fields: { ...r.fields, ...change },
      // The user has now checked the value, so OCR doubts and a rejected save no longer apply.
      doubts: "amount" in change || "transactionDate" in change ? [] : r.doubts,
      saveError: "",
    });

  // shortcut: retry keys live only in memory, so a refresh mid-save can duplicate rows; persist them like pendingTransaction if that matters.
  const saveAll = async () => {
    if (saving) return;
    setSaving(true);
    for (const { row, ready } of view) {
      if (!ready) continue;
      if (!mounted.current || getToken() !== session) break;
      let body: string;
      try {
        body = normalizedTransactionBody({
          ...row.fields,
          type: "expense",
          amount: row.fields.amount.replace(/,/g, "").trim(),
          transactionTime: row.fields.transactionTime || null,
          transactionTimeConfirmed: false,
          paymentMethod: row.paymentMethod,
          description: row.fields.description || null,
          note: null,
        });
      } catch {
        patch(row.id, { saveError: "ข้อมูลไม่ถูกต้อง กรุณาตรวจแถวนี้" });
        continue;
      }
      const key = row.key ?? crypto.randomUUID();
      patch(row.id, { stage: "saving", key, saveError: "" });
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 30000);
      try {
        const response = await apiFetch("/transactions", {
          method: "POST",
          signal: controller.signal,
          headers: { "Idempotency-Key": key },
          body,
        });
        const data = await response.json().catch(() => ({}));
        if (!mounted.current) return;
        if (response.status === 201 && typeof data.id === "string")
          patch(row.id, { stage: "saved", key: null });
        else if (!response.ok && definitiveTransactionRejection(response.status, data))
          patch(row.id, {
            stage: "read",
            key: null,
            saveError: "ระบบไม่รับรายการนี้ กรุณาตรวจข้อมูลแล้วลองใหม่",
          });
        else throw Error("UNKNOWN_RESULT");
      } catch {
        if (!mounted.current) return;
        patch(row.id, {
          stage: "read",
          saveError: "ยังไม่แน่ใจว่าบันทึกสำเร็จหรือไม่ กดบันทึกอีกครั้งได้โดยไม่บันทึกซ้ำ",
        });
      } finally {
        window.clearTimeout(timeout);
      }
    }
    if (mounted.current) setSaving(false);
  };

  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: transactionCategoryLabel(c.name),
  }));

  return (
    <section className="card receipt-batch" aria-labelledby="receipt-batch-title">
      <div className="receipt-batch-header">
        <div>
          <h2 id="receipt-batch-title">สลิป {rows.length} รายการ · บันทึกเป็นรายจ่าย</h2>
          <p className="small-text">
            ระบบอ่านทีละสลิป แถวสีแดงต้องแก้ก่อนจึงจะบันทึก ส่วนแถวที่อาจซ้ำจะข้ามไว้จนกว่าจะเลือกบันทึก
          </p>
        </div>
      </div>

      <ol className="receipt-batch-list">
        {view.map(({ row: r, problems, red, duplicate }, i) => {
          const locked = r.stage !== "read" || !!r.key || saving;
          const messages = [
            ...(r.readError ? [r.readError] : []),
            ...problems,
            ...r.doubts,
            ...(r.saveError ? [r.saveError] : []),
          ];
          return (
            <li
              key={r.id}
              className={
                "receipt-batch-row" +
                (red ? " is-error" : duplicate && !r.allowDuplicate ? " is-duplicate" : "") +
                (r.stage === "saved" ? " is-saved" : "")
              }
              aria-label={`สลิปที่ ${i + 1}`}
            >
              <button
                type="button"
                className="receipt-batch-thumb-button"
                aria-label={`ดูภาพสลิปที่ ${i + 1}`}
                onClick={() => setViewing(i)}
              >
                <img className="receipt-batch-thumb" src={urls[r.id]} alt="" />
              </button>
              <div className="receipt-batch-fields">
                <label>
                  จำนวนเงิน
                  <input
                    className="input"
                    inputMode="decimal"
                    disabled={locked}
                    aria-invalid={problems.includes("จำนวนเงินไม่ถูกต้อง")}
                    value={r.fields.amount}
                    onChange={(e) => edit(r, { amount: e.target.value })}
                  />
                </label>
                <label>
                  วันที่
                  <DatePill
                    label="วันที่"
                    max={today}
                    disabled={locked}
                    invalid={problems.some((p) => p.includes("วันที่"))}
                    value={r.fields.transactionDate}
                    onChange={(transactionDate) => edit(r, { transactionDate })}
                  />
                </label>
                <label>
                  เวลา
                  <input
                    className="input"
                    type="time"
                    disabled={locked}
                    value={r.fields.transactionTime}
                    onChange={(e) => edit(r, { transactionTime: e.target.value })}
                  />
                </label>
                <label>
                  ชื่อรายการ
                  <input
                    className="input"
                    disabled={locked}
                    value={r.fields.description}
                    onChange={(e) => edit(r, { description: e.target.value })}
                  />
                </label>
                <label>
                  หมวดหมู่ <span className="required">*</span>
                  <Dropdown
                    id={"receipt-batch-category-" + r.id}
                    value={r.fields.categoryId}
                    disabled={locked}
                    onChange={(value) => edit(r, { categoryId: value })}
                    options={[{ value: "", label: "ยังไม่ได้เลือกหมวดหมู่" }, ...categoryOptions]}
                  />
                </label>
              </div>
              <div className="receipt-batch-status">
                {r.stage === "saved" ? (
                  <p role="status" className="receipt-batch-saved">
                    <CheckCircle2 size={16} aria-hidden="true" /> บันทึกแล้ว
                  </p>
                ) : r.stage === "queued" ? (
                  <p role="status">รอคิวอ่าน</p>
                ) : r.stage === "reading" ? (
                  <p role="status">กำลังอ่านสลิป…</p>
                ) : r.stage === "saving" ? (
                  <p role="status">กำลังบันทึก…</p>
                ) : red ? (
                  <ul className="receipt-batch-errors">
                    {messages.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                ) : !r.fields.categoryId ? (
                  <p role="status">ยังไม่ได้เลือกหมวดหมู่</p>
                ) : (
                  <p role="status">พร้อมบันทึก</p>
                )}
                {duplicate && r.stage === "read" && (
                  <label className="receipt-batch-duplicate">
                    <span>
                      <AlertTriangle size={16} aria-hidden="true" /> อาจซ้ำ: {duplicate}
                    </span>
                    <span>
                      <input
                        type="checkbox"
                        checked={r.allowDuplicate}
                        disabled={saving}
                        onChange={(e) => patch(r.id, { allowDuplicate: e.target.checked })}
                      />{" "}
                      บันทึกรายการนี้ด้วย
                    </span>
                  </label>
                )}
                {r.stage === "read" && !r.key && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={saving}
                    onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                  >
                    <Trash2 size={14} aria-hidden="true" /> นำออก
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <dialog
        ref={viewer}
        className="receipt-batch-viewer"
        aria-label={viewing === null ? undefined : `ภาพสลิปที่ ${viewing + 1}`}
        onClose={() => setViewing(null)}
        onClick={(e) => e.target === e.currentTarget && setViewing(null)}
      >
        {viewing !== null && rows[viewing] && (
          <>
            <div className="receipt-batch-viewer-bar">
              <strong>สลิปที่ {viewing + 1}</strong>
              <button type="button" className="receipt-batch-viewer-close" onClick={() => setViewing(null)}>
                <X size={16} aria-hidden="true" /> ปิด
              </button>
            </div>
            <img src={urls[rows[viewing].id]} alt={`ภาพสลิปที่ ${viewing + 1}`} />
          </>
        )}
      </dialog>

      <div className="footer-actions receipt-batch-actions">
        <p role="status" className="small-text">
          {busy ? "กำลังอ่านสลิป · " : ""}
          {needsCategory ? "บางแถวยังไม่ได้เลือกหมวดหมู่ · " : ""}พร้อมบันทึก {readyCount} · บันทึกแล้ว {savedCount}
        </p>
        <button
          type="button"
          className="cancel-button"
          disabled={saving}
          onClick={() => {
            if (
              rows.every((r) => r.stage === "saved") ||
              window.confirm("ปิดชุดนี้? รายการที่ยังไม่บันทึกจะหายไป")
            )
              onClose(savedCount);
          }}
        >
          {savedCount === rows.length && rows.length > 0 ? "เสร็จสิ้น" : "ปิดชุดนี้"}
        </button>
        <button
          type="button"
          className="save-button"
          disabled={saving || readyCount === 0}
          aria-busy={saving}
          onClick={() => void saveAll()}
        >
          {saving ? "กำลังบันทึก..." : `บันทึก ${readyCount} รายการ`}
        </button>
      </div>
    </section>
  );
}
