import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Mail } from "lucide-react";
import { saveToken } from "../auth";
import "./Login.css";
import { apiFetch } from "../api";

type LoginResponse = {
  showSetup?: boolean;
  message?: string;
  token?: string;
  user?: {
    id: string;
    email: string;
    role?: "USER" | "ADMIN";
  };
  error?: string;
};

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    setError("");

    if (!email.trim() || !password) {
      setError("กรุณากรอกอีเมลและรหัสผ่าน");
      return;
    }

    try {
      setIsLoading(true);

      const response = await apiFetch("/auth/login", {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data: LoginResponse = await response.json();

      if (!response.ok) {
        setError(data.error || "เข้าสู่ระบบไม่สำเร็จ");
        return;
      }

      if (!data.token) {
        setError("ไม่พบ token จากระบบ");
        return;
      }

      saveToken(data.token);

      navigate(
        data.user?.role === "ADMIN"
          ? "/admin"
          : data.showSetup === true
            ? "/setup"
            : "/overview",
        {
          replace: true,
        },
      );
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
        <div className="login-brand">
          <div className="login-logo"><img src="/logo.svg" alt="" width="100%" height="100%" /></div>

          <div>
            <h1>KebTang</h1>
            <p>จัดการการเงินของคุณอย่างเป็นระบบ</p>
          </div>
        </div>

        <div className="login-card">
          <div className="login-card-header is-start">
            <h2>เข้าสู่ระบบ</h2>
            <p>กรอกข้อมูลเพื่อเข้าใช้งานบัญชีของคุณ</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="email">อีเมล</label>

              <div className="login-input">
                <Mail size={20} aria-hidden="true" />
                <input
                  id="email"
                  type="email"
                  placeholder="Email@gmail.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="password">รหัสผ่าน</label>

              <div className="login-input">
                <Lock size={20} aria-hidden="true" />
                <input
                  id="password"
                  type="password"
                  placeholder="กรอกรหัสผ่าน"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <button
                type="button"
                className="login-forgot"
                onClick={() => navigate("/password-recovery")}
              >
                ลืมรหัสผ่าน?
              </button>
            </div>

            {error && <div className="login-error">{error}</div>}

            <button type="submit" className="login-submit" disabled={isLoading}>
              {isLoading ? "กำลังเข้าสู่ระบบ..." : "ลงชื่อเข้าใช้"}
            </button>
          </form>

          <div className="login-footer">
            <span>ยังไม่มีบัญชีใช่ไหม?</span>

            <button type="button" onClick={() => navigate("/register")}>
              สร้างบัญชี
            </button>
          </div>
          <p className="login-links">
            <a href="/">กลับหน้าแรก</a>
          </p>
        </div>
      </div>
    </div>
  );
}
