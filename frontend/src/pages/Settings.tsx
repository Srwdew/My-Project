import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import UserHeader from '../components/UserHeader';
import { useProfile } from '../contexts/ProfileContext';
import { apiFetch } from '../api';
import { getToken, removeToken } from '../auth';
import { useUnsavedSettings } from '../utils/useUnsavedSettings';
import './Settings.css';
type SettingsData = {
    email: string;
    displayName: string | null;
    income: string | null;
    paydayDay: number | null;
    primaryGoalId: string | null;
    primaryGoal: {
        id: string;
        name: string;
        archivedAt: string | null;
    } | null;
    legacyGoal: string | null;
    hasAvatar: boolean;
    goals: {
        id: string;
        name: string;
    }[];
    budgetMonth: string;
    budgetAmount: string | null;
    notifications: {
        notifyNearLimit: boolean;
        notifyExceeded: boolean;
        warningPercent: number;
        totalBudget: boolean;
        categoryBudgets: boolean;
    };
};
type Draft = {
    displayName: string;
    income: string;
    paydayDay: string;
    budgetAmount: string;
    primaryGoalId: string;
    notifyNearLimit: boolean;
    notifyExceeded: boolean;
};
const draftOf = (d: SettingsData): Draft => ({ displayName: d.displayName ?? '', income: d.income ?? '', paydayDay: d.paydayDay === null ? '' : String(d.paydayDay), budgetAmount: d.budgetAmount ?? '', primaryGoalId: d.primaryGoalId ?? '', notifyNearLimit: d.notifications.notifyNearLimit, notifyExceeded: d.notifications.notifyExceeded });
function Dialog({ title, onClose, children, busy, returnFocus }: {
    title: string;
    onClose: () => void;
    children: ReactNode;
    busy: boolean;
    returnFocus: HTMLElement | null;
}) { const ref = useRef<HTMLDialogElement>(null); useEffect(() => { const prior = returnFocus; ref.current?.showModal(); return () => { ref.current?.close(); requestAnimationFrame(() => prior?.focus()); }; }, []); return <dialog className="settings-dialog" ref={ref} aria-labelledby="settings-dialog-title" tabIndex={-1} onKeyDown={event=>{
 if(event.key!=='Tab')return;
 const fields=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')).filter(el=>el.tabIndex>=0);
 const first=fields[0],last=fields[fields.length-1];
 if(!first){event.preventDefault();event.currentTarget.focus();return;}
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }} onCancel={e => { e.preventDefault(); if (!busy)
    onClose(); }}><h2 id="settings-dialog-title">{title}</h2>{children}</dialog>; }
function Toggle({ label, description, value, onChange, disabled = false }: {
    label: string;
    description: string;
    value: boolean;
    onChange?: (value: boolean) => void;
    disabled?: boolean;
}) { return <label className="settings-toggle"><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" role="switch" checked={value} disabled={disabled} onChange={e => onChange?.(e.target.checked)}/></label>; }
export default function Settings() {
    const { avatarUrl, reloadProfile } = useProfile();
    const navigate = useNavigate();
    const session = useRef(getToken()).current;
    const [data, setData] = useState<SettingsData | null>(null), [draft, setDraft] = useState<Draft | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
    const securityTrigger = useRef<HTMLElement | null>(null);
    const [security, setSecurity] = useState<'password' | 'close' | null>(null), [securityError, setSecurityError] = useState('');
    const alive = useRef(true), lock = useRef(false), generation = useRef(0), bypass = useRef(false), file = useRef<HTMLInputElement>(null);
    const valid = useCallback(() => alive.current && getToken() === session, [session]);
    const dirty = Boolean(draft && data && JSON.stringify(draft) !== JSON.stringify(draftOf(data)));
    useUnsavedSettings(dirty, bypass);
    useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; }; }, []);
    const load = useCallback(async () => { const id = ++generation.current; setLoading(true); setError(''); try {
        const response = await apiFetch('/settings');
        if (!response.ok)
            throw Error('โหลดการตั้งค่าไม่สำเร็จ');
        const result: SettingsData = await response.json();
        if (valid() && id === generation.current) {
            setData(result);
            setDraft(draftOf(result));
            reloadProfile();
        }
    }
    catch (e) {
        if (valid() && id === generation.current)
            setError(e instanceof Error ? e.message : 'เชื่อมต่อไม่สำเร็จ');
    }
    finally {
        if (valid() && id === generation.current)
            setLoading(false);
    } }, [valid, reloadProfile]);
    useEffect(() => { void load(); }, [load]);
    const change = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft(d => d ? { ...d, [key]: value } : d); setSuccess(''); };
    async function save(e: FormEvent) {
        e.preventDefault();
        if (!draft || !data || lock.current)
            return;
        lock.current = true;
        setBusy(true);
        setError('');
        setSuccess('');
        try {
            const response = await apiFetch('/settings', { method: 'PUT', body: JSON.stringify({ ...draft, income: draft.income.trim() || null, paydayDay: draft.paydayDay ? Number(draft.paydayDay) : null, budgetAmount: draft.budgetAmount.trim() || null, primaryGoalId: draft.primaryGoalId || null, budgetMonth: data.budgetMonth }) });
            const result = await response.json();
            if (!valid())
                return;
            if (!response.ok)
                throw Error(result.error || 'บันทึกไม่สำเร็จ');
            setData(result);
            setDraft(draftOf(result));
            reloadProfile();
            setSuccess('บันทึกการเปลี่ยนแปลงแล้ว');
        }
        catch (e) {
            if (valid())
                setError(e instanceof Error ? e.message : 'ไม่ทราบผลการบันทึก กรุณาโหลดค่าล่าสุดก่อนลองใหม่');
        }
        finally {
            lock.current = false;
            if (valid())
                setBusy(false);
        }
    }
    async function avatarAction(selected?: File) { if (lock.current)
        return; if (selected && (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 1048576)) {
        setError('เลือกรูป JPEG, PNG หรือ WebP ขนาดไม่เกิน 1 MB');
        return;
    } lock.current = true; setBusy(true); setError(''); setSuccess(''); try {
        const response = await apiFetch('/profile/avatar', selected ? { method: 'PUT', headers: { 'Content-Type': selected.type }, body: selected } : { method: 'DELETE' });
        if (!response.ok) {
            const result = await response.json();
            throw Error(result.error || 'บันทึกรูปไม่สำเร็จ');
        }
        if (valid()) {
            reloadProfile();
            setData(d => d ? { ...d, hasAvatar: Boolean(selected) } : d);
            setSuccess('บันทึกรูปโปรไฟล์แล้ว');
        }
    }
    catch (e) {
        if (valid())
            setError(e instanceof Error ? e.message : 'บันทึกรูปไม่สำเร็จ');
    }
    finally {
        lock.current = false;
        if (valid())
            setBusy(false);
        if (file.current)
            file.current.value = '';
    } }
    async function secure(e: FormEvent<HTMLFormElement>) { e.preventDefault(); if (lock.current || !security)
        return; lock.current = true; setBusy(true); setSecurityError(''); const values = Object.fromEntries(new FormData(e.currentTarget)); try {
        const response = await apiFetch(security === 'password' ? '/auth/change-password' : '/auth/close-account', { method: 'POST', body: JSON.stringify(values) });
        const result = await response.json();
        if (!valid())
            return;
        if (!response.ok)
            throw Error(result.error || 'ดำเนินการไม่สำเร็จ');
        bypass.current = true;
        removeToken();
        navigate('/login', { replace: true });
    }
    catch (e) {
        if (valid())
            setSecurityError(e instanceof Error ? e.message : 'ดำเนินการไม่สำเร็จ');
    }
    finally {
        lock.current = false;
        if (valid())
            setBusy(false);
    } }
    return <div className="settings-page"><header className="settings-header"><div><h1>ตั้งค่าผู้ใช้</h1><p>จัดการข้อมูลบัญชี การเงินพื้นฐาน การแจ้งเตือน และความปลอดภัย</p></div><UserHeader /></header>
 {loading ? <p role="status">กำลังโหลดการตั้งค่า...</p> : null}
 {error && <div className="settings-error" role="alert"><p>{error}</p><button type="button" disabled={busy} onClick={() => { if (!dirty || window.confirm('โหลดค่าล่าสุดและยกเลิกการแก้ไขที่ยังไม่บันทึก?'))
        void load(); }}>โหลดค่าล่าสุด / ลองอีกครั้ง</button></div>}
 <p role="status" className="settings-success">{success}</p>
 {data && draft && !loading && <form onSubmit={save}><fieldset disabled={busy} className="settings-fields">
 <section className="settings-card" aria-labelledby="settings-account"><h2 id="settings-account">ข้อมูลบัญชีผู้ใช้</h2><div className="settings-avatar-row"><div className="settings-avatar">{avatarUrl ? <img src={avatarUrl} alt="รูปโปรไฟล์ของคุณ"/> : <span aria-label="ยังไม่มีรูปโปรไฟล์">{(data.displayName || data.email).slice(0, 1).toUpperCase()}</span>}</div><input ref={file} hidden type="file" accept="image/jpeg,image/png,image/webp" aria-label="เลือกรูปโปรไฟล์" onChange={e => { const f = e.target.files?.[0]; if (f)
            void avatarAction(f); }}/><button type="button" className="settings-secondary" onClick={() => file.current?.click()}>เปลี่ยนรูป</button><button type="button" className="settings-secondary" disabled={!data.hasAvatar} onClick={() => void avatarAction()}>ลบรูป</button></div><p className="settings-hint">JPEG, PNG, WebP ไม่เกิน 1 MB · รูปบันทึกทันทีแยกจากฟอร์ม</p><div className="settings-grid"><label htmlFor="settings-name">ชื่อที่ใช้แสดง<input id="settings-name" autoComplete="name" value={draft.displayName} maxLength={80} required onChange={e => change('displayName', e.target.value)}/></label><label htmlFor="settings-email">อีเมล<input id="settings-email" type="email" readOnly value={data.email}/><small>ยังไม่รองรับการเปลี่ยนอีเมล</small></label></div></section>
 <section className="settings-card" aria-labelledby="settings-finance"><h2 id="settings-finance">ข้อมูลทางการเงินพื้นฐาน</h2><div className="settings-grid"><label htmlFor="settings-income">รายได้ต่อเดือน (บาท)<input id="settings-income" inputMode="decimal" value={draft.income} pattern="[0-9]{1,10}(\.[0-9]{1,2})?" placeholder="ยังไม่ระบุ" onChange={e => change('income', e.target.value)}/><small>ใช้วางแผนเท่านั้น ไม่ใช่รายรับหรือเงินออมจริง</small></label><label htmlFor="settings-payday">วันที่เงินเข้า<select id="settings-payday" value={draft.paydayDay} onChange={e => change('paydayDay', e.target.value)}><option value="">ยังไม่ระบุ</option>{Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>วันที่ {i + 1} ของทุกเดือน</option>)}</select><small>เดือนที่มีวันน้อยกว่าใช้วันสุดท้ายของเดือน</small></label><label htmlFor="settings-budget">งบประมาณรายเดือน (บาท) · {data.budgetMonth}<input id="settings-budget" inputMode="decimal" pattern="[0-9]{1,10}(\.[0-9]{1,2})?" placeholder="ยังไม่ตั้งงบ" value={draft.budgetAmount} onChange={e => change('budgetAmount', e.target.value)}/><small>เดือนปัจจุบันตามเวลาไทย · เว้นว่างเพื่อยกเลิกงบรวม</small></label><label htmlFor="settings-primary-goal">เป้าหมายการออมหลัก<select id="settings-primary-goal" value={draft.primaryGoalId} onChange={e => change('primaryGoalId', e.target.value)}><option value="">ยังไม่เลือก</option>{data.primaryGoal?.archivedAt && <option disabled value={data.primaryGoal.id}>{data.primaryGoal.name} — ไม่พร้อมใช้งาน</option>}{data.goals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>{data.primaryGoal?.archivedAt && <small role="status">เป้าหมายหลักถูกเก็บถาวร กรุณาเลือกใหม่</small>}</label></div>{data.legacyGoal && <p className="settings-hint">ข้อความเป้าหมายเดิม: {data.legacyGoal} — เก็บเป็นประวัติ ยังไม่ได้แปลงเป็นเป้าหมายจริง</p>}</section>
 <section className="settings-card" aria-labelledby="settings-notices"><h2 id="settings-notices">การแจ้งเตือน</h2><Toggle label="ใกล้ถึงงบประมาณ" description={`แจ้งเมื่อรายจ่ายถึง ${data.notifications.warningPercent}% ตามขอบเขตที่ตั้งในหน้างบประมาณ`} value={draft.notifyNearLimit} onChange={v => change('notifyNearLimit', v)}/><Toggle label="เกินงบประมาณ" description="แจ้งเมื่อรายจ่ายมากกว่างบที่ตั้งไว้" value={draft.notifyExceeded} onChange={v => change('notifyExceeded', v)}/><Toggle label="รายการผิดปกติ" description="พร้อมใช้เมื่อเปิดระบบวิเคราะห์" value={false} disabled/><Toggle label="ความคืบหน้าเป้าหมายการออม" description="พร้อมใช้เมื่อเปิดระบบสรุปความคืบหน้ารายสัปดาห์" value={false} disabled/></section>
 <section className="settings-card" aria-labelledby="settings-security"><h2 id="settings-security">ความปลอดภัย</h2><div className="settings-security-row"><div><strong>รหัสผ่าน</strong><p>หลังเปลี่ยนต้องเข้าสู่ระบบใหม่ทุกอุปกรณ์</p></div><button type="button" className="settings-secondary" onClick={e => { securityTrigger.current = e.currentTarget; setSecurityError(''); setSecurity('password'); }}>เปลี่ยนรหัสผ่าน</button></div><div className="settings-security-row"><div><strong>ปิดบัญชีผู้ใช้</strong><p>ปิดการเข้าใช้งาน โดยยังเก็บข้อมูลธุรกรรมและประวัติ ไม่ใช่การลบถาวร</p></div><button type="button" className="settings-danger" onClick={e => { securityTrigger.current = e.currentTarget; setSecurityError(''); setSecurity('close'); }}>ปิดบัญชีผู้ใช้</button></div></section>
 <footer className="settings-actions"><button type="button" className="settings-secondary" onClick={() => { setSuccess(''); void load(); }}>ยกเลิก</button><button type="submit" disabled={!dirty}>{busy ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}</button></footer></fieldset></form>}
 {security && <Dialog title={security === 'password' ? 'เปลี่ยนรหัสผ่าน' : 'ปิดบัญชีผู้ใช้'} busy={busy} returnFocus={securityTrigger.current} onClose={() => setSecurity(null)}><form onSubmit={secure}><p>{security === 'password' ? 'รหัสใหม่อย่างน้อย 6 ตัวอักษร ไม่เกิน 72 bytes และต้องเข้าสู่ระบบใหม่หลังบันทึก' : 'บัญชีจะถูกปิดใช้งาน ข้อมูลประวัติยังคงอยู่ ไม่ใช่การลบถาวร'}</p><label htmlFor="current-password">รหัสผ่านปัจจุบัน<input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required disabled={busy}/></label>{security === 'password' ? <><label htmlFor="new-password">รหัสผ่านใหม่<input id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={6} required disabled={busy}/></label><label htmlFor="confirm-password">ยืนยันรหัสผ่านใหม่<input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required disabled={busy}/></label></> : <label htmlFor="close-confirm">พิมพ์ “ปิดบัญชีผู้ใช้” เพื่อยืนยัน<input id="close-confirm" name="confirmation" required disabled={busy}/></label>}{securityError && <p className="settings-error" role="alert">{securityError}</p>}<div className="settings-actions"><button type="button" className="settings-secondary" disabled={busy} onClick={() => setSecurity(null)}>ยกเลิก</button><button type="submit" disabled={busy}>{busy ? 'กำลังดำเนินการ...' : 'ยืนยัน'}</button></div></form></Dialog>}
 </div>;
}
