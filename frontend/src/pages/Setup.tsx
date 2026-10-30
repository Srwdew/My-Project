import { thaiMonth } from "../utils/thaiDate";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { getToken, removeToken, useSessionKey } from "../auth";
import {
  FINANCIAL_INTENTIONS,
  setupDraft,
  setupPayload,
  type SetupSettings,
  type SetupDraft,
} from "../utils/setupChecklist";
import "./Login.css";
import Dropdown from "../components/Dropdown";
import "./Setup.css";

export default function Setup() {
  const session = useSessionKey();
  return (
    <main className="login-page setup-page">
      <div className="login-container setup-container">
        <div className="login-brand">
          <div className="login-logo" aria-hidden="true">
            <img src="/logo.svg" alt="" width="100%" height="100%" />
          </div>
          <div>
            <strong>KebTang</strong>
            <p>จัดการการเงินของคุณอย่างเป็นระบบ</p>
          </div>
        </div>
        <section className="login-card setup-card">
          <h1>ตั้งค่าโปรไฟล์การเงิน</h1>
          <p className="setup-intro">
            กรุณาตั้งค่าให้เสร็จก่อนเริ่มใช้งาน แก้ไขภายหลังได้ในหน้าตั้งค่า
          </p>
          <SetupForm key={session ?? "logged-out"} session={session} />
        </section>
      </div>
    </main>
  );
}
function SetupForm({ session }: { session: string | null }) {
  const navigate = useNavigate(),
    alive = useRef(false),
    saving = useRef(false);
  const [data, setData] = useState<SetupSettings | null>(null),
    [draft, setDraft] = useState<SetupDraft | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loadVersion, setLoadVersion] = useState(0);
  const valid = () => alive.current && getToken() === session;
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    setData(null);
    setDraft(null);
    setError("");
    void (async () => {
      try {
        const response = await apiFetch("/settings", {
          signal: controller.signal,
        });
        if (!response.ok) throw Error("โหลดการตั้งค่าไม่สำเร็จ กรุณาลองใหม่");
        const result: SetupSettings = await response.json();
        if (!controller.signal.aborted && valid()) {
          setData(result);
          setDraft(setupDraft(result));
        }
      } catch {
        if (!controller.signal.aborted && valid())
          setError("โหลดการตั้งค่าไม่สำเร็จ กรุณาลองใหม่");
      }
    })();
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [session, loadVersion]);
  function change<K extends keyof SetupDraft>(key: K, value: SetupDraft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setError("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!data || !draft || saving.current || !valid()) return;
    try {
      setupPayload(data, data, draft);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const read = await apiFetch("/settings");
      if (!valid()) return;
      if (!read.ok)
        throw Error("อ่านค่าล่าสุดไม่สำเร็จ ยังไม่ได้ส่งบันทึก กรุณาลองใหม่");
      const latest: SetupSettings = await read.json();
      if (!valid()) return;
      const payload = setupPayload(data, latest, draft);
      const response = await apiFetch("/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (!valid()) return;
      const result = await response.json();
      if (!valid()) return;
      if (!response.ok)
        throw Error(result.error || "บันทึกไม่สำเร็จ กรุณาลองใหม่");
      if (!result.setupCompletedAt)
        throw Error("ยังยืนยันสถานะ Setup ไม่สำเร็จ กรุณาโหลดค่าล่าสุด");
      navigate("/overview", { replace: true });
    } catch (e) {
      if (valid())
        setError(
          e instanceof Error
            ? e.message
            : "ไม่ทราบผลการบันทึก กรุณาตรวจค่าล่าสุดก่อนลองใหม่",
        );
    } finally {
      saving.current = false;
      if (valid()) setBusy(false);
    }
  }
  if (!draft || !data)
    return (
      <div className="setup-message">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button onClick={() => setLoadVersion((n) => n + 1)}>
              ลองใหม่
            </button>
          </>
        ) : (
          <p role="status">กำลังโหลดการตั้งค่า...</p>
        )}
      </div>
    );
  return (
    <form onSubmit={save} noValidate aria-busy={busy}>
      <fieldset disabled={busy} className="setup-fields">
        {!data.displayName && (
          <label htmlFor="setup-name">
            ชื่อที่แสดง
            <input
              id="setup-name"
              autoComplete="nickname"
              maxLength={80}
              value={draft.displayName}
              onChange={(e) => change("displayName", e.target.value)}
              required
            />
          </label>
        )}
        <label htmlFor="setup-income">
          รายได้ต่อเดือน
          <span className="setup-money">
            <input
              id="setup-income"
              inputMode="decimal"
              placeholder="ระบุจำนวนเงิน"
              value={draft.income}
              onChange={(e) => change("income", e.target.value)}
              aria-describedby="setup-money-help"
            />
            <span>บาท</span>
          </span>
        </label>
        <label htmlFor="setup-payday">
          รูปแบบวันที่ได้รับรายได้
          <Dropdown
            id="setup-payday"
            value={String(draft.paydayDay)}
            onChange={(value) => change("paydayDay", value)}
            options={[
              { value: "", label: "ไม่แน่นอน" },
              ...Array.from({ length: 31 }, (_, i) => ({
                value: String(i + 1),
                label: `วันที่ ${i + 1} ของเดือน`,
              })),
            ]}
          />
        </label>
        <label htmlFor="setup-budget">
          งบประมาณเดือนปัจจุบัน <small>({thaiMonth(data.budgetMonth)})</small>
          <span className="setup-money">
            <span aria-hidden="true">฿</span>
            <input
              id="setup-budget"
              inputMode="decimal"
              placeholder="ระบุงบประมาณ"
              value={draft.budgetAmount}
              onChange={(e) => change("budgetAmount", e.target.value)}
              aria-describedby="setup-money-help"
            />
            <span>บาท</span>
          </span>
        </label>
        <p id="setup-money-help" className="setup-help">
          เว้นว่างรายได้หรืองบเพื่อคงค่าเดิม · รายได้ส่วนนี้ใช้วางแผน
        </p>
        <fieldset className="setup-intentions">
          <legend>
            เป้าหมายทางการเงิน <small>(ความตั้งใจ)</small>
          </legend>
          <div className="setup-intention-options">
            {FINANCIAL_INTENTIONS.map((value) => (
              <label
                key={value}
                className={draft.intention === value ? "selected" : ""}
              >
                <input
                  type="radio"
                  name="financial-intention"
                  value={value}
                  checked={draft.intention === value}
                  onChange={() => change("intention", value)}
                />
                <span>{value}</span>
              </label>
            ))}
          </div>
          {data.legacyGoal &&
            !(FINANCIAL_INTENTIONS as readonly string[]).includes(
              data.legacyGoal,
            ) && (
              <p className="setup-help">
                ค่าเดิม: {data.legacyGoal} · คงไว้หากไม่เลือกใหม่
              </p>
            )}
        </fieldset>
      </fieldset>
      {error && (
        <div role="alert" className="setup-error">
          <p>{error}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setLoadVersion((n) => n + 1)}
          >
            โหลดค่าล่าสุด
          </button>
        </div>
      )}
      <p>แก้ไขข้อมูลเหล่านี้ภายหลังได้ในหน้าตั้งค่า</p>
      <div className="setup-actions">
        <button
          className="setup-submit"
          type="submit"
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? "กำลังบันทึก..." : "บันทึกและเริ่มต้นใช้งาน"}
        </button>
        {!busy && (
          <button
            type="button"
            onClick={() => {
              removeToken();
              navigate("/login", { replace: true });
            }}
          >
            ออกจากระบบ
          </button>
        )}
      </div>
      {busy && (
        <p className="setup-help" role="status">
          กำลังบันทึกการตั้งค่า กรุณารอสักครู่
        </p>
      )}
    </form>
  );
}
