import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import './Register.css';
import { apiFetch } from '../api';

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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    setError('');
    setSuccess('');

    if (!email.trim() || !password || !confirmPassword) {
      setError('กรุณากรอกข้อมูลให้ครบ');
      return;
    }

    if (password.length < 6) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }

    if (password !== confirmPassword) {
      setError('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    try {
      setIsLoading(true);

      const response = await apiFetch('/auth/register', {
  method: 'POST',
  auth: false,
  body: JSON.stringify({
    email: email.trim().toLowerCase(),
    password,
  }),
});

      const data: RegisterResponse = await response.json();

      if (!response.ok) {
        setError(data.error || 'สมัครสมาชิกไม่สำเร็จ');
        return;
      }

      setSuccess('สมัครสมาชิกสำเร็จ กำลังไปหน้าเข้าสู่ระบบ...');

      setTimeout(() => {
        navigate('/login', {
          replace: true,
        });
      }, 800);
    } catch (error) {
      console.error(error);

      setError('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="register-page">
      <div className="register-container">
        <div className="register-brand">
          <div className="register-logo">
            S
          </div>

          <div>
            <h1>SpendSense</h1>
            <p>เริ่มต้นจัดการการเงินของคุณ</p>
          </div>
        </div>

        <div className="register-card">
          <div className="register-card-header">
            <h2>สมัครสมาชิก</h2>
            <p>
              สร้างบัญชีเพื่อเริ่มบันทึกและติดตามการเงิน
            </p>
          </div>

          <form
            className="register-form"
            onSubmit={handleSubmit}
          >
            <div className="register-field">
              <label htmlFor="register-email">
                อีเมล
              </label>

              <input
                id="register-email"
                type="email"
                placeholder="example@email.com"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                autoComplete="email"
              />
            </div>

            <div className="register-field">
              <label htmlFor="register-password">
                รหัสผ่าน
              </label>

              <input
                id="register-password"
                type="password"
                placeholder="อย่างน้อย 6 ตัวอักษร"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                autoComplete="new-password"
              />
            </div>

            <div className="register-field">
              <label htmlFor="register-confirm-password">
                ยืนยันรหัสผ่าน
              </label>

              <input
                id="register-confirm-password"
                type="password"
                placeholder="กรอกรหัสผ่านอีกครั้ง"
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(event.target.value)
                }
                autoComplete="new-password"
              />
            </div>

            {error && (
              <div className="register-error">
                {error}
              </div>
            )}

            {success && (
              <div className="register-success">
                {success}
              </div>
            )}

            <button
              type="submit"
              className="register-submit"
              disabled={isLoading}
            >
              {isLoading
                ? 'กำลังสมัครสมาชิก...'
                : 'สมัครสมาชิก'}
            </button>
          </form>

          <div className="register-footer">
            <span>มีบัญชีอยู่แล้ว?</span>

            <button
              type="button"
              onClick={() => navigate('/login')}
            >
              เข้าสู่ระบบ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}