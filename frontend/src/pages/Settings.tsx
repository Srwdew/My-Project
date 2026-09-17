import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import UserHeader from '../components/UserHeader';
import { useProfile } from '../contexts/ProfileContext';

import './Settings.css';

export default function Settings() {
  const {
    profile,
    loading,
    error,
    reloadProfile,
    updateDisplayName,
  } = useProfile();

  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setDisplayName(profile?.displayName ?? '');
  }, [profile]);

  const unchanged =
    displayName.trim() === (profile?.displayName ?? '');

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (saving || loading || !profile || unchanged) {
      return;
    }

    setSuccessMessage('');
    setSaveError('');

    const name = displayName.trim();

    if (!name || name.length > 80) {
      setSaveError('กรุณากรอกชื่อ 1–80 ตัวอักษร');
      return;
    }

    try {
      setSaving(true);

      await updateDisplayName(name);

      setSuccessMessage('บันทึกชื่อเรียบร้อยแล้ว');
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : 'ไม่สามารถบันทึกชื่อได้ กรุณาลองอีกครั้ง'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDisplayName(profile?.displayName ?? '');
    setSuccessMessage('');
    setSaveError('');
  };

  return (
    <div className="settings-page">
      <header className="settings-header">
        <div>
          <h1>ตั้งค่า</h1>
          <p>จัดการข้อมูลโปรไฟล์ของคุณ</p>
        </div>

        <UserHeader />
      </header>

      <section
        className="settings-card"
        aria-labelledby="profile-title"
      >
        <h2 id="profile-title">ข้อมูลผู้ใช้</h2>
        <p>กำหนดชื่อที่ต้องการให้แสดงในระบบ</p>

        {loading ? (
          <p role="status">กำลังโหลดโปรไฟล์...</p>
        ) : error ? (
          <div role="alert">
            <p className="settings-error">{error}</p>

            <button type="button" onClick={reloadProfile}>
              ลองอีกครั้ง
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label htmlFor="profile-email">อีเมล</label>

            <input
              id="profile-email"
              type="email"
              value={profile?.email ?? ''}
              readOnly
            />

            <label htmlFor="display-name">ชื่อที่แสดง</label>

            <input
              id="display-name"
              type="text"
              autoComplete="name"
              placeholder="กรอกชื่อของคุณ"
              value={displayName}
              maxLength={80}
              required
              disabled={saving}
              aria-describedby="name-hint"
              onChange={(event) => {
                setDisplayName(event.target.value);
                setSuccessMessage('');
                setSaveError('');
              }}
            />

            <small id="name-hint">
              ใช้ภาษาไทยหรือภาษาอังกฤษได้ สูงสุด 80 ตัวอักษร
            </small>

            {saveError && (
              <p className="settings-error" role="alert">
                {saveError}
              </p>
            )}

            <p className="settings-success" role="status">
              {successMessage}
            </p>

            <div className="settings-actions">
              <button
                type="button"
                className="settings-cancel"
                disabled={saving || unchanged}
                onClick={handleCancel}
              >
                ยกเลิก
              </button>

              <button
                type="submit"
                disabled={
                  saving ||
                  !displayName.trim() ||
                  unchanged ||
                  !profile
                }
              >
                {saving
                  ? 'กำลังบันทึก...'
                  : 'บันทึกการเปลี่ยนแปลง'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}