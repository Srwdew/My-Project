import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { KeyRound, Lock, Mail } from "lucide-react";
import "./Login.css";
import { apiFetch } from "../api";

type RegisterResponse = {
  message?: string;
  user?: {
    id: string;
    email: string;
    createdAt: string;
  };
  error?: string;
};

export default function Register() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!email.trim() || !password || !confirmPassword) {
      setError("กรุณากรอกข้อมูลให้ครบ");
      return;
    }

    if (password.length < 6) {
      setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }

    if (password !== confirmPassword) {
      setError("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    try {
      setIsLoading(true);

      const response = await apiFetch("/auth/register", {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data: RegisterResponse = await response.json();

      if (!response.ok) {
        setError(data.error || "สมัครสมาชิกไม่สำเร็จ");
        return;
      }

      setSuccess("สมัครสมาชิกสำเร็จ กำลังไปหน้าเข้าสู่ระบบ...");

      setTimeout(() => {
        navigate("/login", {
          replace: true,
        });
      }, 800);
    } catch (error) {
      console.error(error);

      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          <div className="login-card-header is-start">
            <h2>สร้างบัญชีใหม่</h2>
            <p>เริ่มต้นทำความเข้าใจพฤติกรรมการเงินของคุณ</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="register-email">อีเมล</label>
              <div className="login-input">
                <Mail size={20} aria-hidden="true" />
                <input
                  id="register-email"
                  type="email"
                  placeholder="Email@gmail.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="register-password">รหัสผ่าน</label>
              <div className="login-input">
                <KeyRound size={20} aria-hidden="true" />
                <input
                  id="register-password"
                  type="password"
                  placeholder="รหัสผ่านอย่างน้อย 6 ตัว"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="register-confirm-password">ยืนยันรหัสผ่าน</label>
              <div className="login-input">
                <Lock size={20} aria-hidden="true" />
                <input
                  id="register-confirm-password"
                  type="password"
                  placeholder="กรอกรหัสผ่านอีกครั้ง"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>

            {error && <div className="login-error">{error}</div>}

            {success && (
              <div className="login-message" role="status">
                {success}
              </div>
            )}

            <button
              type="submit"
              className="login-submit register-submit"
              disabled={isLoading}
            >
              {isLoading ? "กำลังลงทะเบียน..." : "ลงทะเบียน"}
            </button>
          </form>

          <p className="login-consent">
            การสมัครถือว่ายอมรับ{" "}
            <Link to="/privacy">นโยบายความเป็นส่วนตัว (PDPA)</Link>
          </p>
          <div className="login-footer">
            <span>มีบัญชีอยู่แล้ว?</span>
            <button type="button" onClick={() => navigate("/login")}>
              เข้าสู่ระบบ
            </button>
          </div>
          <p className="login-links">
            <Link to="/">กลับหน้าแรก</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
