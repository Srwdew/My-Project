import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Lock, Mail } from "lucide-react";
import { apiFetch } from "../api";
import { getToken, removeToken } from "../auth";
import "./Login.css";

export default function PasswordRecovery({
  reset = false,
}: {
  reset?: boolean;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const [token, setToken] = useState(() =>
    reset
      ? (new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "")
      : "",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const sending = useRef(false),
    mounted = useRef(true),
    version = useRef(0);
  useEffect(() => {
    mounted.current = true;
    const readLink = () => {
      if (!reset || !window.location.hash) return;
      version.current++;
      setToken(
        new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "",
      );
      setMessage("");
      setError("");
      setPassword("");
      setConfirm("");
      window.history.replaceState(null, "", window.location.pathname);
    };
    const changedSession = () => {
      version.current++;
      setError("");
      setMessage("");
      setPassword("");
      setConfirm("");
    };
    readLink();
    window.addEventListener("hashchange", readLink);
    window.addEventListener("spendsense-session", changedSession);
    const storage = (event: StorageEvent) => {
      if (event.key === "spendsense_token" || event.key === null)
        changedSession();
    };
    window.addEventListener("storage", storage);
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.append(meta);
    return () => {
      mounted.current = false;
      meta.remove();
      window.removeEventListener("hashchange", readLink);
      window.removeEventListener("spendsense-session", changedSession);
      window.removeEventListener("storage", storage);
    };
  }, [reset]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    setError("");
    if (
      reset &&
      (password.length < 6 ||
        new TextEncoder().encode(password).length > 72 ||
        password !== confirm)
    ) {
      setError(
        "รหัสผ่านต้องอย่างน้อย 6 ตัว ไม่เกิน 72 bytes และยืนยันให้ตรงกัน",
      );
      return;
    }
    sending.current = true;
    setBusy(true);
    const session = getToken(),
      requestVersion = version.current;
    try {
      const response = await apiFetch(
        reset ? "/auth/reset-password" : "/auth/forgot-password",
        {
          method: "POST",
          auth: false,
          cache: "no-store",
          referrerPolicy: "no-referrer",
          body: JSON.stringify(
            reset
              ? { token, newPassword: password, confirmPassword: confirm }
              : { email: email.trim() },
          ),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "ไม่สำเร็จ กรุณาลองใหม่");
      if (getToken() !== session || requestVersion !== version.current) return;
      if (reset) {
        removeToken();
        version.current = requestVersion;
      }
      if (mounted.current && requestVersion === version.current) {
        setMessage(data.message);
        setPassword("");
        setConfirm("");
      }
    } catch (e) {
      if (
        mounted.current &&
        requestVersion === version.current &&
        getToken() === session
      )
        setError(e instanceof Error ? e.message : "ไม่สามารถเชื่อมต่อได้");
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div
        className="login-card"
        style={{ width: "min(440px, 100%)", boxSizing: "border-box" }}
      >
        <div className="login-card-header is-start">
          <h1>{reset ? "ตั้งรหัสผ่านใหม่" : "ลืมรหัสผ่าน"}</h1>
          <p>
            {reset
              ? "ลิงก์ใช้ได้ครั้งเดียวภายใน 15 นาที"
              : "กรอกอีเมลเพื่อรับวิธีตั้งรหัสผ่านใหม่"}
          </p>
        </div>
        {reset && !/^[A-Za-z0-9_-]{43}$/.test(token) ? (
          <p className="login-error" role="alert">
            ลิงก์ไม่ถูกต้อง กรุณาขอลิงก์ใหม่
          </p>
        ) : (
          !message && (
            <form className="login-form" onSubmit={submit}>
              <fieldset
                disabled={busy}
                style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
              >
                {reset ? (
                  <>
                    <div className="login-field">
                      <label htmlFor="new-password">รหัสผ่านใหม่</label>
                      <div className="login-input">
                        <Lock size={20} aria-hidden="true" />
                        <input
                          id="new-password"
                          type="password"
                          autoComplete="new-password"
                          placeholder="อย่างน้อย 6 ตัวอักษร"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="login-field">
                      <label htmlFor="confirm-password">
                        ยืนยันรหัสผ่านใหม่
                      </label>
                      <div className="login-input">
                        <Lock size={20} aria-hidden="true" />
                        <input
                          id="confirm-password"
                          type="password"
                          autoComplete="new-password"
                          placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                          required
                          value={confirm}
                          onChange={(e) => setConfirm(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="login-field">
                    <label htmlFor="reset-email">อีเมล</label>
                    <div className="login-input">
                      <Mail size={20} aria-hidden="true" />
                      <input
                        id="reset-email"
                        type="email"
                        autoComplete="email"
                        placeholder="Email@gmail.com"
                        maxLength={254}
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                <button className="login-submit" type="submit">
                  {busy
                    ? "กำลังดำเนินการ…"
                    : reset
                      ? "บันทึกรหัสผ่านใหม่"
                      : "ส่งคำขอ"}
                </button>
              </fieldset>
            </form>
          )
        )}
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="login-message" role="status">
            {message}
          </p>
        )}
        <p className="login-links">
          <Link to="/login">กลับเข้าสู่ระบบ</Link>
          {reset && <Link to="/forgot-password">ขอลิงก์ใหม่</Link>}
        </p>
      </div>
    </main>
  );
}
