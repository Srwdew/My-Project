import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveToken } from '../auth';
import './Login.css';
import { apiFetch } from '../api';

type LoginResponse = {
  message?: string;
  token?: string;
  user?: {
    id: string;
    email: string;
  };
  error?: string;
};

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    setError('');

    if (!email.trim() || !password) {
      setError('กรุณากรอกอีเมลและรหัสผ่าน');
      return;
    }

    try {
      setIsLoading(true);

      const response = await apiFetch('/auth/login', {
  method: 'POST',
  auth: false,
  body: JSON.stringify({
    email: email.trim(),
    password,
  }),
});

      const data: LoginResponse = await response.json();

      if (!response.ok) {
        setError(data.error || 'เข้าสู่ระบบไม่สำเร็จ');
        return;
      }

      if (!data.token) {
        setError('ไม่พบ token จากระบบ');
        return;
      }

      saveToken(data.token);

      navigate('/overview', {
        replace: true,
      });
    } catch (error) {
      console.error(error);

      setError('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-brand">
          <div className="login-logo">
            S
          </div>

          <div>
            <h1>SpendSense</h1>
            <p>จัดการการเงินของคุณอย่างเป็นระบบ</p>
          </div>
        </div>

        <div className="login-card">
          <div className="login-card-header">
            <h2>เข้าสู่ระบบ</h2>
            <p>
              เข้าสู่บัญชีเพื่อดูข้อมูลทางการเงินของคุณ
            </p>
          </div>

          <form
            className="login-form"
            onSubmit={handleSubmit}
          >
            <div className="login-field">
              <label htmlFor="email">
                อีเมล
              </label>

              <input
                id="email"
                type="email"
                placeholder="example@email.com"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                autoComplete="email"
              />
            </div>

            <div className="login-field">
              <label htmlFor="password">
                รหัสผ่าน
              </label>

              <input
                id="password"
                type="password"
                placeholder="กรอกรหัสผ่าน"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="login-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="login-submit"
              disabled={isLoading}
            >
              {isLoading
                ? 'กำลังเข้าสู่ระบบ...'
                : 'เข้าสู่ระบบ'}
            </button>
          </form>

          <div className="login-footer">
            <span>ยังไม่มีบัญชี?</span>

            <button
              type="button"
              onClick={() => navigate('/register')}
            >
              สมัครสมาชิก
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}